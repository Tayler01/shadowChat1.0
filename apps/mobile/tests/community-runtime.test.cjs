const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/community/communityRuntime.ts'), 'utf8');
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: moduleUnderTest.exports, module: moduleUnderTest, URL, atob, Promise, Date, Set, Error, Object });
const { resolveCommunityRegistry, createCommunityRuntime, communityStorageKeys, restoreCommunitySelection } = moduleUnderTest.exports;
// Synthetic unit configuration only. None of these keys authenticate to any service.
const memberRef = 'shsqqouecvdoifzufkqm';
const demoRef = 'abcdefghijklmnopqrst';
const userA = '11111111-1111-4111-8111-111111111111';
const userB = '22222222-2222-4222-8222-222222222222';
const installation = '33333333-3333-4333-8333-333333333333';
const key = 'sb_publishable_synthetic_unit_test_key_000000';
const member = { origin: 'https://shadowchat-streamlined.netlify.app', projectRef: memberRef, supabaseUrl: `https://${memberRef}.supabase.co`, publicKey: key };
const demo = { origin: 'https://synthetic-demo.example.com', projectRef: demoRef, supabaseUrl: `https://${demoRef}.supabase.co`, publicKey: key };
const registry = () => resolveCommunityRegistry({ member, demoEnabled: true, demo });
const jwt = claims => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.synthetic`;
// Supabase issues opaque refresh tokens; the live demo's verified token length is 12.
// This is a synthetic value, never a credential copied from a session.
const session = (project = demoRef, id = userA, extra = {}) => ({ accessToken: jwt({ iss: `https://${project}.supabase.co/auth/v1`, sub: id, role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600, ...extra }), refreshToken: 'unitfixture1', userId: id });
const adapter = calls => ({ getUser: async () => { calls.push('getUser'); return { id:userA }; }, setSession: async value => { calls.push('setSession'); return { id:value.userId }; }, clearSession: async () => { calls.push('clearSession'); } });
const teardown = calls => Object.fromEntries(['abortAndDrainCommands','revokeInstallation','clearPresentedNotifications','clearClientSession','unmountAndDispose'].map(name => [name, async context => { calls.push(`${name}:${context.community.id}`); }]));
const deferred = () => { let resolve, reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return { promise, resolve, reject }; };

test('demo stays disabled with no flag, absent config, any missing field, bad pair, or non-public keys', () => {
  assert.equal(resolveCommunityRegistry({ member }).demo, null);
  assert.equal(resolveCommunityRegistry({ member, demoEnabled:'true', demo }).demo, null);
  for (const field of Object.keys(demo)) { const value={...demo};delete value[field];assert.equal(resolveCommunityRegistry({ member,demoEnabled:true,demo:value }).demo,null); }
  for (const value of [{...demo, projectRef:memberRef,supabaseUrl:member.supabaseUrl},{...demo,origin:member.origin},{...demo,supabaseUrl:member.supabaseUrl},{...demo,publicKey:'sb_secret_must_never_enter_client'},{...demo,publicKey:jwt({role:'service_role',ref:demoRef})},{...demo,publicKey:jwt({role:'anon',ref:memberRef})}])
    assert.equal(resolveCommunityRegistry({member,demoEnabled:true,demo:value}).demo,null);
});

test('unsafe demo origins fail closed and never reuse the member fallback', () => {
  for(const origin of ['http://example.com','https://u:p@example.com','https://example.com/path','https://example.com?token=bad','https://example.com:443/path','https://localhost','https://127.0.0.1','https://[::1]','https://sub.localhost'])
    assert.equal(resolveCommunityRegistry({member,demoEnabled:true,demo:{...demo,origin}}).demo,null);
  for(const ref of ['udvmevvbgbxnciburfjh','kvznsjytzoiyaekicbbp'])
    assert.equal(resolveCommunityRegistry({member,demoEnabled:true,demo:{...demo,projectRef:ref,supabaseUrl:`https://${ref}.supabase.co`}}).demo,null);
});

test('valid opaque or project-bound legacy public key is allowed; registry is immutable', () => {
  const configured=registry();assert.equal(configured.demo.projectRef,demoRef);assert(Object.isFrozen(configured));assert(Object.isFrozen(configured.demo));
  assert.equal(resolveCommunityRegistry({member,demoEnabled:true,demo:{...demo,publicKey:jwt({role:'anon',ref:demoRef})}}).demo.projectRef,demoRef);
});

test('no runtime is selected or client initialized by constructing the controller', () => {
  const runtime=createCommunityRuntime(registry());assert.equal(runtime.capture(),null);assert.equal(runtime.status().phase,'unselected');
  assert.throws(()=>runtime.select('arbitrary'));assert.throws(()=>createCommunityRuntime(resolveCommunityRegistry({member})).select('demo'));
});

test('restore accepts only available immutable enum and storage keys cannot collide', () => {
  const configured=registry();assert.equal(restoreCommunitySelection(configured,'demo'),'demo');
  for(const value of ['https://evil.example','production','',null,{}]) assert.equal(restoreCommunitySelection(configured,value),null);
  assert.equal(restoreCommunitySelection(resolveCommunityRegistry({member}),'demo'),null);
  const a=communityStorageKeys(configured.member),b=communityStorageKeys(configured.demo);
  for(const field of ['installation','credential','optOut']) assert.notEqual(a[field],b[field]);
  assert(!JSON.stringify(a).includes(key));
});

test('bridge accepts only the selected exact origin, and routes reject external escapes', () => {
  const runtime=createCommunityRuntime(registry()),context=runtime.select('demo');
  assert(runtime.acceptsBridge(context,demo.origin+'/?view=chat'));
  for(const url of [member.origin,'https://synthetic-demo.example.com.evil.org',`https://u:p@synthetic-demo.example.com/`,'about:blank','http://synthetic-demo.example.com']) assert.equal(runtime.acceptsBridge(context,url),false);
  assert.equal(runtime.route(context,'/?view=dms&conversation=123'),demo.origin+'/?view=dms&conversation=123');
  for(const route of ['//evil.org','/\\evil.org','https://evil.org',null]) assert.equal(runtime.route(context,route),null);
});

test('issuer, subject, role and expiry are rejected before getUser or refresh token forwarding', async () => {
  for(const value of [session(memberRef),session(demoRef,userA,{sub:userB}),session(demoRef,userA,{role:'service_role'}),session(demoRef,userA,{exp:1}),{...session(),accessToken:'malformed'}]){
    const runtime=createCommunityRuntime(registry()),context=runtime.select('demo'),calls=[];
    await assert.rejects(runtime.runSession(context,demo.origin,value,adapter(calls)));
    assert(!calls.includes('getUser') && !calls.includes('setSession'));assert.equal(runtime.status().signedIn,false);
  }
});

test('server must authenticate access token before any refresh-bearing setSession', async () => {
  const runtime=createCommunityRuntime(registry()),context=runtime.select('demo'),calls=[];
  assert.equal(await runtime.runSession(context,demo.origin,session(),adapter(calls)),true);
  assert.deepEqual(calls,['getUser','setSession']);assert.equal(runtime.status().signedIn,true);
  assert.throws(()=>runtime.switchCommunity('member',teardown([])),/Sign out/);
});

test('refresh tokens are opaque and bounded, with no invented minimum length', async () => {
  for (const refreshToken of ['x', 'unitfixture1', 'x'.repeat(4096)]) {
    const runtime=createCommunityRuntime(registry()),context=runtime.select('demo'),calls=[];
    assert.equal(await runtime.runSession(context,demo.origin,{...session(),refreshToken},adapter(calls)),true);
    assert.deepEqual(calls,['getUser','setSession']);
  }
  for (const refreshToken of ['', 'x'.repeat(4097), null, 12, {}]) {
    const runtime=createCommunityRuntime(registry()),context=runtime.select('demo'),calls=[];
    await assert.rejects(runtime.runSession(context,demo.origin,{...session(),refreshToken},adapter(calls)));
    assert(!calls.includes('getUser') && !calls.includes('setSession'));
    assert.equal(runtime.status().signedIn,false);
  }
});

test('signature/server failure and user mismatch never forward refresh tokens; errors are sanitized', async () => {
  for(const server of [async()=>{throw new Error('PRIVATE_SECRET_FROM_PROVIDER');},async()=>({id:userB})]){
    const runtime=createCommunityRuntime(registry()),context=runtime.select('demo');let forwarded=0;
    await assert.rejects(runtime.runSession(context,demo.origin,session(),{getUser:server,setSession:async()=>{forwarded++;return{id:userA};},clearSession:async()=>{}}),error=>!error.message.includes('PRIVATE_SECRET'));
    assert.equal(forwarded,0);
  }
});

test('wrong committed account clears native session', async () => {
  const runtime=createCommunityRuntime(registry()),context=runtime.select('demo');let cleared=0;
  await assert.rejects(runtime.runSession(context,demo.origin,session(),{getUser:async()=>({id:userA}),setSession:async()=>({id:userB}),clearSession:async()=>{cleared++;}}));
  assert.equal(cleared,1);assert.equal(runtime.status().signedIn,false);
});

test('uncertain session cleanup freezes the community until explicit teardown retry', async () => {
  const runtime=createCommunityRuntime(registry()),context=runtime.select('demo');
  await assert.rejects(runtime.runSession(context,demo.origin,session(),{
    getUser:async()=>({id:userA}),setSession:async()=>{throw new Error('uncertain');},clearSession:async()=>{throw new Error('offline');},
  }));
  assert.equal(runtime.capture(),null);assert.equal(runtime.status().phase,'blocked');assert.equal(runtime.isCurrent(context),false);
  const restored=await runtime.switchCommunity('demo',teardown([]));assert.equal(restored.community.id,'demo');
});

test('switch invalidates bridge/routes immediately and awaits every teardown in order', async () => {
  const runtime=createCommunityRuntime(registry()),old=runtime.select('member'),calls=[],gate=deferred();
  const actions=teardown(calls);actions.abortAndDrainCommands=async()=>{calls.push('abortAndDrainCommands:member');await gate.promise;};
  const switching=runtime.switchCommunity('demo',actions);
  assert.equal(runtime.capture(),null);assert.equal(runtime.acceptsBridge(old,member.origin),false);assert.equal(runtime.route(old,'/'),null);
  assert.equal(runtime.switchCommunity('demo',actions),switching);
  assert.throws(()=>runtime.switchCommunity('member',actions),/pending/);
  gate.resolve();const next=await switching;
  assert.deepEqual(calls,['abortAndDrainCommands:member','revokeInstallation:member','clearPresentedNotifications:member','clearClientSession:member','unmountAndDispose:member']);
  assert.equal(next.community.id,'demo');assert(next.generation>old.generation);assert.equal(runtime.isCurrent(old),false);
});

test('revocation failure blocks new mount and permits only explicit same-target retry', async () => {
  const runtime=createCommunityRuntime(registry()),old=runtime.select('member'),calls=[],actions=teardown(calls);
  actions.revokeInstallation=async()=>{throw new Error('SECRET_TRANSPORT_FAILURE');};
  await assert.rejects(runtime.switchCommunity('demo',actions),error=>!error.message.includes('SECRET'));
  assert.equal(runtime.status().phase,'blocked');assert.equal(runtime.capture(),null);assert.equal(runtime.isCurrent(old),false);
  assert(!calls.some(value=>value.startsWith('unmount')));
  assert.throws(()=>runtime.switchCommunity('member',teardown([])),/Retry/);
  const next=await runtime.switchCommunity('demo',teardown([]));assert.equal(next.community.id,'demo');
});

test('delayed getUser from old generation cannot commit a refresh token', async () => {
  const runtime=createCommunityRuntime(registry()),old=runtime.select('member'),gate=deferred(),started=deferred();let committed=0;
  const auth=runtime.runSession(old,member.origin,session(memberRef),{getUser:async()=>{started.resolve();await gate.promise;return{id:userA};},setSession:async()=>{committed++;return{id:userA};},clearSession:async()=>{}});
  await started.promise;
  const switching=runtime.switchCommunity('demo',teardown([]));gate.resolve();
  assert.equal(await auth,false);await switching;assert.equal(committed,0);
});

test('in-flight old setSession is cleared and drained before the next mount', async () => {
  const runtime=createCommunityRuntime(registry()),old=runtime.select('member'),gate=deferred(),started=deferred();let cleared=0;
  const auth=runtime.runSession(old,member.origin,session(memberRef),{getUser:async()=>({id:userA}),setSession:async()=>{started.resolve();await gate.promise;return{id:userA};},clearSession:async()=>{cleared++;}});
  await started.promise;const switching=runtime.switchCommunity('demo',teardown([]));assert.equal(runtime.capture(),null);
  gate.resolve();assert.equal(await auth,false);await switching;assert.equal(cleared,1);
});

test('newer sign-out supersedes queued login and cannot restore an old session', async () => {
  const runtime=createCommunityRuntime(registry()),context=runtime.select('demo'),gate=deferred(),started=deferred();let commits=0,cleared=0;
  const actions={getUser:async()=>{started.resolve();await gate.promise;return{id:userA};},setSession:async()=>{commits++;return{id:userA};},clearSession:async()=>{cleared++;}};
  const login=runtime.runSession(context,demo.origin,session(),actions);await started.promise;
  const logout=runtime.runSession(context,demo.origin,null,actions);gate.resolve();
  assert.equal(await login,false);assert.equal(await logout,true);assert.equal(commits,0);assert.equal(cleared,1);assert.equal(runtime.status().signedIn,false);
});

test('a failed newer login cannot leave the old native account after superseding sign-out', async () => {
  const runtime=createCommunityRuntime(registry()),context=runtime.select('demo'),calls=[];
  await runtime.runSession(context,demo.origin,session(),adapter(calls));
  const logout=runtime.runSession(context,demo.origin,null,adapter(calls));
  const badLogin=runtime.runSession(context,demo.origin,{...session(),accessToken:'invalid'},adapter(calls));
  assert.equal(await logout,false);await assert.rejects(badLogin);
  assert.equal(runtime.status().signedIn,false);assert.equal(calls.at(-1),'clearSession');
});

test('notifications require exact selected project, current account, installation and generation', async () => {
  const runtime=createCommunityRuntime(registry()),context=runtime.select('demo');await runtime.runSession(context,demo.origin,session(),adapter([]));
  const scope={version:1,projectRef:demoRef,userId:userA,installationKey:installation};
  assert(runtime.acceptsNotification(context,scope,installation));
  for(const value of [undefined,{}, {...scope,projectRef:memberRef},{...scope,userId:userB},{...scope,installationKey:userB},{...scope,version:2}]) assert.equal(runtime.acceptsNotification(context,value,installation),false);
  assert.equal(runtime.acceptsNotification(context,scope,null),false);
  await runtime.runSession(context,demo.origin,null,adapter([]));assert.equal(runtime.acceptsNotification(context,scope,installation),false);
  await runtime.switchCommunity('member',teardown([]));assert.equal(runtime.acceptsNotification(context,scope,installation),false);
});

test('unknown or stale bridge origin cannot even clear the current session', async () => {
  const runtime=createCommunityRuntime(registry()),context=runtime.select('demo'),calls=[];
  assert.equal(await runtime.runSession(context,member.origin,null,adapter(calls)),false);assert.equal(calls.length,0);
  assert(!JSON.stringify(runtime.status()).includes(key));
});

test('selection persistence failure cannot activate the next backend and retries retain the original teardown context',async()=>{
 const runtime=createCommunityRuntime(registry()),old=runtime.select('member'),calls=[],actions=teardown(calls);
 actions.persistSelection=async id=>{assert.equal(id,'demo');assert.equal(runtime.capture(),null);throw Error('storage unavailable');};
 await assert.rejects(runtime.switchCommunity('demo',actions));assert.equal(runtime.capture(),null);assert.equal(runtime.status().phase,'blocked');
 const retry=teardown([]);retry.persistSelection=async id=>assert.equal(id,'demo');
 const next=await runtime.switchCommunity('demo',retry);assert.equal(next.community.id,'demo');assert.equal(runtime.isCurrent(old),false);
});

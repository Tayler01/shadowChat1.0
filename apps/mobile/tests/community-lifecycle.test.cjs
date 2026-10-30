const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module, exports: module.exports, URL, atob, AbortController,
    setTimeout, clearTimeout, process, ...globals,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import ${name}`);
      return imports[name];
    },
  });
  return module.exports;
}
const core = load('src/community/communityRuntime.ts');
const startup = load('src/community/communityStartup.ts', { './communityRuntime': core });
const publicKey = 'sb_publishable_synthetic_unit_test_key_000000';
const ref = 'abcdefghijklmnopqrst';
const registry = core.resolveCommunityRegistry({ member: {
  origin: 'https://member.example.com', projectRef: ref,
  supabaseUrl: `https://${ref}.supabase.co`, publicKey,
} });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('concurrent StrictMode startup effects revoke and select once, and remount restores the same context', async () => {
  const controller = core.createCommunityRuntime(registry), gate = deferred();
  let revokes = 0, persists = 0;
  const initialize = startup.createCommunityStartup();
  const options = { registry, controller, streamlined: true, readSelection: async () => 'member',
    prepareMemberInstallation: async () => {}, revokeLegacy: async () => { revokes++; await gate.promise; },
    persistSelection: async () => { persists++; },
  };
  const first = initialize(options), second = initialize(options);
  assert.equal(first, second); gate.resolve();
  const selected = await first;
  assert.equal(await second, selected); assert.equal(await initialize(options), selected);
  assert.equal(revokes, 1); assert.equal(persists, 1);
});

test('remount after the first chooser selection never restores cached unselected startup state', async () => {
  const controller = core.createCommunityRuntime(registry), initialize = startup.createCommunityStartup();
  const options = { registry, controller, streamlined: true, readSelection: async () => null,
    prepareMemberInstallation: async () => {}, revokeLegacy: async () => {}, persistSelection: async () => {},
  };
  assert.equal(await initialize(options), null);
  const selected = controller.select('member');
  assert.equal(await initialize(options), selected);
});

test('startup storage failures do not activate any backend and can be retried', async () => {
  const controller = core.createCommunityRuntime(registry), initialize = startup.createCommunityStartup();
  let fails = true;
  const options = { registry, controller, streamlined: true, readSelection: async () => 'member',
    prepareMemberInstallation: async () => {}, revokeLegacy: async () => {}, persistSelection: async () => { if (fails) throw Error('storage unavailable'); },
  };
  await assert.rejects(initialize(options)); assert.equal(controller.capture(), null);
  fails = false; assert.equal((await initialize(options)).community.id, 'member');
});

test('startup blocks community activation and ticket access until member identity preparation succeeds',async()=>{
 const controller=core.createCommunityRuntime(registry),initialize=startup.createCommunityStartup(),gate=deferred(),order=[];
 let fails=true;
 const options={registry,controller,streamlined:true,revokeLegacy:async()=>{order.push('revoke');},
  prepareMemberInstallation:async()=>{order.push('prepare');await gate.promise;if(fails)throw Error('pending enrollment uncertain');},
  readSelection:async()=>{order.push('read');return'member';},persistSelection:async()=>{order.push('persist');}};
 const first=initialize(options);const rejected=assert.rejects(first);assert.equal(first,initialize(options));
 await new Promise(resolve=>setImmediate(resolve));assert.equal(controller.capture(),null);assert.deepEqual(order,['revoke','prepare']);
 gate.resolve();await rejected;assert.equal(controller.capture(),null);
 fails=false;await initialize(options);assert.deepEqual(order,['revoke','prepare','revoke','prepare','read','persist']);assert.equal(controller.capture().community.id,'member');
});

function clientFixture({fetchImpl}={}) {
  let current, resets = 0;
  const created = [], requests = [];
  const api = load('src/lib/supabase.ts', {
    'react-native-url-polyfill/auto': {}, 'expo-secure-store': { deleteItemAsync: async () => {} },
    './privateRealtimeChannels': {},
    '../community/communityBindings': { announceHelperReset: () => { resets++; },
      isCurrentCommunity: context => context === current, requireCommunity: () => current },
    '@supabase/supabase-js': { createClient: (url, key, options) => {
      let onAuth; const record = { url, key, options, stopped: 0, removed: 0, unsubscribed: 0,removedChannels:[] };
      const client = { channel:()=>({}),removeChannel:async channel=>{record.removedChannels.push(channel);}, auth: {
        onAuthStateChange: callback => { onAuth = callback; return { data: { subscription: {
          unsubscribe: () => { record.unsubscribed++; },
        } } }; },
        stopAutoRefresh: async () => { record.stopped++; },
      }, removeAllChannels: async () => { record.removed++; } };
      Object.assign(record, { client, applyAuth: value => onAuth('SIGNED_IN', value) });
      created.push(record); return client;
    } },
  }, { setTimeout:(...args)=>{const timer=setTimeout(...args);timer.unref();return timer;}, fetch: async (url, options) => { requests.push({ url, options }); return fetchImpl ? fetchImpl(url,options) : { ok: true }; } });
  return { api, created, requests, activate: context => { current = context; }, resets: () => resets };
}
const context = () => Object.freeze({ community: registry.member, generation: 1 });

test('helper client creates lazily, is ephemeral, and rejects foreign or invalidated requests', async () => {
  const f = clientFixture(), selected = context(); f.activate(selected);
  assert.equal(f.created.length, 0);
  const client = f.api.getSupabase(selected); assert.equal(f.api.getSupabase(selected), client);
  assert.equal(f.created[0].options.auth.persistSession, false);
  assert.equal(f.created[0].options.auth.autoRefreshToken, false);
  const request = f.created[0].options.global.fetch;
  await assert.rejects(request('https://wrong.example.com/rest/v1'), /Unexpected/);
  assert.equal(f.requests.length, 0);
  await request(`${registry.member.supabaseUrl}/rest/v1`); assert.equal(f.requests.length, 1);
  f.activate(null);
  await assert.rejects(request(`${registry.member.supabaseUrl}/rest/v1`), /no longer active/);
});

test('disposal aborts owned requests, detaches listeners/channels, and never remotely logs out the WebView', async () => {
  const f = clientFixture(), selected = context(); f.activate(selected); f.api.getSupabase(selected);
  const row = f.created[0]; row.applyAuth({ user: { id: 'synthetic' } });
  await f.api.resetCommunityMemory(selected);
  assert.equal(row.unsubscribed, 1); assert.equal(row.stopped, 1); assert.equal(row.removed, 1);
  assert.equal(f.resets(), 1);
  await assert.rejects(row.options.global.fetch(`${registry.member.supabaseUrl}/auth/v1/user`), /no longer active/);
  assert.notEqual(f.api.getSupabase(selected), row.client);
  assert.equal(f.created.length, 2);
});

test('failed pending session commits dispose the helper even before its first auth event', async () => {
  const f = clientFixture(), selected = context(); f.activate(selected); f.api.getSupabase(selected);
  await f.api.resetCommunityMemory(selected); assert.equal(f.created[0].removed, 0);
  await f.api.resetCommunityMemory(selected, true); assert.equal(f.created[0].removed, 1);
  assert.equal(f.resets(), 1);
});

test('already-aborted caller signals remain aborted through the scoped fetch adapter', async () => {
  const f = clientFixture(), selected = context(); f.activate(selected); f.api.getSupabase(selected);
  const abort = new AbortController(); abort.abort();
  await f.created[0].options.global.fetch(`${registry.member.supabaseUrl}/rest/v1`, { signal: abort.signal });
  assert.equal(f.requests[0].options.signal.aborted, true);
});

test('switch teardown can abort an SDK request before its fetch completes',async()=>{
 const f=clientFixture({fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
 const selected=context();f.activate(selected);f.api.getSupabase(selected);
 const pending=f.created[0].options.global.fetch(`${registry.member.supabaseUrl}/auth/v1/user`);
 const rejected=assert.rejects(pending,/aborted/);
 f.api.abortCommunityRequests(selected);await rejected;
 assert.equal(f.requests[0].options.signal.aborted,true);
});

test('full native startup preserves member access without legacy revocation or community storage migration',async()=>{
 const controller=core.createCommunityRuntime(registry),initialize=startup.createCommunityStartup();
 const unexpected=async()=>{throw Error('Full app must not migrate community state');};
 const selected=await initialize({registry,controller,streamlined:false,prepareMemberInstallation:unexpected,revokeLegacy:unexpected,readSelection:unexpected,persistSelection:unexpected});
 assert.equal(selected.community.id,'member');assert.equal(controller.status().phase,'active');
});

test('old realtime channel cleanup stays with its owner after selecting a different context',async()=>{
 const f=clientFixture(),first=context(),second=Object.freeze({...first,generation:2});
 f.activate(first);const oldClient=f.api.getSupabase(first),channel=oldClient.channel('old-topic');
 f.activate(second);f.api.getSupabase(second);f.api.removeRealtimeChannel(channel);
 assert.equal(f.created[0].removedChannels[0],channel);assert.equal(f.created[1].removedChannels.length,0);
 assert.throws(()=>oldClient.channel('stale-topic'),/no longer active/);
});

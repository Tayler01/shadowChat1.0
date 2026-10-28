const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),ts=require('typescript');
function load(file,imports,globals={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,URL,atob,AbortController,setTimeout,clearTimeout,Intl,Promise,Error,...globals,require:name=>{if(!(name in imports))throw Error('Unexpected import '+name);return imports[name];}});return m.exports;}
const core=load('src/community/communityRuntime.ts',{});
const uuid='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const makeContext=ref=>({community:{id:'demo',origin:'https://demo.example.com',projectRef:ref,supabaseUrl:`https://${ref}.supabase.co`,publicKey:'sb_publishable_synthetic_test_key_000',storageNamespace:`shadowchat-community-v1.${ref}`},generation:1});
function fixture({current=true,response=true,streamlined=true,build='22',transportError=false,handler,sharedStore}={}){
 const store=sharedStore??new Map(),calls=[];let nonce=0;
 const noop={};
 const imports={
  'expo-application':{nativeApplicationVersion:'1.0.0',nativeBuildVersion:build},'expo-constants':{__esModule:true,default:{easConfig:{projectId:uuid}}},'expo-crypto':{randomUUID:()=>nonce++?user:uuid},'expo-device':{isDevice:true},'expo-notifications':{getPermissionsAsync:async()=>({status:'granted'}),getExpoPushTokenAsync:async()=>({data:'synthetic-expo-token'})},
  'expo-secure-store':{WHEN_UNLOCKED_THIS_DEVICE_ONLY:'device',getItemAsync:async key=>store.get(key)??null,setItemAsync:async(key,value)=>store.set(key,value),deleteItemAsync:async key=>store.delete(key)},
  'react-native':{Platform:{OS:'ios'}},'./background':{registerNativeNotificationBackgroundTask:async()=>{}},'./config':{NOTIFICATION_CHANNEL_SCHEMA_VERSION:2},'./freshDevicePushToken':{getFreshDevicePushTokenAsync:async()=>({data:'synthetic-device-token'})},'./registrationPipeline':{runNotificationStage:async({operation})=>operation()},
  '../../community/communityRuntime':core,'../../community/communityBindings':{isCurrentCommunity:()=>current,requireCommunity:()=>{throw Error('No default project');},baseAppRuntime:{streamlined},runCommunityOperation:async(_,op)=>{if(!current)throw Error('Stale community');return op();},rememberInstallation:()=>{}},
 };
 const module=load('src/lib/notifications/registration.ts',imports,{fetch:async(url,options)=>{const call={url,body:JSON.parse(options.body)};calls.push(call);if(transportError)throw Error('network uncertain');const payload=handler?await handler(call):response;return{ok:true,json:async()=>payload};}});
 return{...module,store,calls};
}
test('registration instances persist installation identifiers only in their own project namespace',async()=>{
 const f=fixture(),a=makeContext('abcdefghijklmnopqrst'),b=makeContext('tsrqponmlkjihgfedcba');
 const first=await f.createScopedRegistration(a).getNativeNotificationInstallationKey();const second=await f.createScopedRegistration(b).getNativeNotificationInstallationKey();
 assert.notEqual(first,second);assert.equal(f.store.get(core.communityStorageKeys(a.community).installation),first);assert.equal(f.store.get(core.communityStorageKeys(b.community).installation),second);assert.equal(f.calls.length,0);
});
test('old-community revocation stays bound to old backend even after active context changes',async()=>{
 const f=fixture({current:false}),a=makeContext('abcdefghijklmnopqrst'),key=core.communityStorageKeys(a.community).credential;
 f.store.set(key,JSON.stringify({installationKey:uuid,userId:user,credential:'a'.repeat(64)}));await f.createScopedRegistration(a).revokeNativeNotificationInstallation();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,a.community.supabaseUrl+'/rest/v1/rpc/revoke_notification_installation_with_proof_v1');assert(!f.store.has(key));
});
test('ambiguous revocation cannot discard the credential or permit a claimed successful switch',async()=>{
 const f=fixture({response:false}),a=makeContext('abcdefghijklmnopqrst'),key=core.communityStorageKeys(a.community).credential;
 f.store.set(key,JSON.stringify({installationKey:uuid,userId:user,credential:'a'.repeat(64)}));await assert.rejects(f.createScopedRegistration(a).revokeNativeNotificationInstallation());assert(f.store.has(key));
});
test('stale ordinary registration calls cannot issue requests after context invalidation',async()=>{
 const f=fixture({current:false}),a=makeContext('abcdefghijklmnopqrst'),key=core.communityStorageKeys(a.community).credential;
 f.store.set(key,JSON.stringify({installationKey:uuid,userId:user,credential:'a'.repeat(64)}));await assert.rejects(f.createScopedRegistration(a).updateNativeNotificationForegroundLease(true));assert.equal(f.calls.length,0);
});

test('malformed scoped credentials block revocation and are retained for recovery',async()=>{
 const f=fixture(),a=makeContext('abcdefghijklmnopqrst'),key=core.communityStorageKeys(a.community).credential;
 f.store.set(key,'{broken');await assert.rejects(f.createScopedRegistration(a).revokeNativeNotificationInstallation());assert.equal(f.store.get(key),'{broken');assert.equal(f.calls.length,0);
});

test('a bound registration facade cannot retarget delayed work to the next community',async()=>{
 const f=fixture({current:false}),a=makeContext('abcdefghijklmnopqrst');
 const registration=f.bindCommunityRegistration(a);
 await assert.rejects(registration.getNativeNotificationInstallationKey());assert.equal(f.store.size,0);assert.equal(f.calls.length,0);
});

const enrollment={requestPermission:false,enrollmentTicket:'synthetic-ticket',enrollmentVerifier:'d'.repeat(64),installationCredential:'b'.repeat(64),enrollmentUserId:user,requestId:'synthetic-request'};
const enrollmentResponse={user_id:user,installation_id:uuid,community_scope_version:1};

test('streamlined build22 uses capability-bound RPC and preserves raw app/build metadata',async()=>{
 const f=fixture({response:enrollmentResponse}),a=makeContext('abcdefghijklmnopqrst');
 const result=await f.createScopedRegistration(a).registerNativeNotificationInstallation(enrollment);
 assert.equal(result.enabled,true);assert.equal(f.calls.length,1);
 assert(f.calls[0].url.endsWith('/redeem_scoped_native_notification_enrollment_ticket_v2'));
 assert.equal(f.calls[0].body.target_community_scope_version,1);assert.equal(f.calls[0].body.target_app_version,'1.0.0');assert.equal(f.calls[0].body.target_build_number,'22');
 assert.equal(JSON.parse(f.store.get(core.communityStorageKeys(a.community).credential)).enrollmentPending,undefined);
});

test('full native retains the legacy enrollment RPC and raw version contract',async()=>{
 const f=fixture({streamlined:false,response:enrollmentResponse}),a=makeContext('abcdefghijklmnopqrst');
 await f.createScopedRegistration(a).registerNativeNotificationInstallation(enrollment);
 assert(f.calls[0].url.endsWith('/redeem_native_notification_enrollment_ticket_v2'));
 assert.equal(f.calls[0].body.target_community_scope_version,undefined);
});

test('old streamlined builds cannot enroll a scoped native installation',async()=>{
 for(const build of ['21','22beta',null]){
  const f=fixture({build}),a=makeContext('abcdefghijklmnopqrst');
  await assert.rejects(f.createScopedRegistration(a).registerNativeNotificationInstallation(enrollment));assert.equal(f.calls.length,0);
 }
});

test('ambiguous scoped enrollment preserves revocation credential and cannot use legacy token confirmation',async()=>{
 const f=fixture({transportError:true}),a=makeContext('abcdefghijklmnopqrst'),registration=f.createScopedRegistration(a);
 await assert.rejects(registration.registerNativeNotificationInstallation(enrollment));assert.equal(f.calls.length,1);
 const stored=JSON.parse(f.store.get(core.communityStorageKeys(a.community).credential+'.pending-enrollment'));
 assert.equal(stored.credential,enrollment.installationCredential);assert.equal(stored.verifier,enrollment.enrollmentVerifier);assert.equal(f.store.has(core.communityStorageKeys(a.community).credential),false);
 await assert.rejects(registration.clearNativeNotificationInstallationCredential());
 await registration.refreshNativeNotificationToken({data:'synthetic-device-token'});assert.equal(f.calls.length,1);
});

test('scoped RPC response must explicitly confirm capability before pending enrollment becomes active',async()=>{
 const f=fixture({response:{user_id:user,installation_id:uuid}}),a=makeContext('abcdefghijklmnopqrst'),registration=f.createScopedRegistration(a);
 await assert.rejects(registration.registerNativeNotificationInstallation(enrollment));
 assert.equal(f.store.has(core.communityStorageKeys(a.community).credential),false);assert.ok(f.store.has(core.communityStorageKeys(a.community).credential+'.pending-enrollment'));
});

test('only confirmed old-server revocation can discard a pending enrollment credential',async()=>{
 const f=fixture(),a=makeContext('abcdefghijklmnopqrst'),key=core.communityStorageKeys(a.community).credential;
 f.store.set(key,JSON.stringify({installationKey:uuid,userId:user,credential:'a'.repeat(64),enrollmentPending:true}));
 await f.createScopedRegistration(a).revokeNativeNotificationInstallation();assert.equal(f.store.has(key),false);assert.equal(f.calls.length,1);
});

test('full native keeps legacy installation keys and never invokes community migration',async()=>{
 const f=fixture({streamlined:false}),a=makeContext('abcdefghijklmnopqrst');
 const key='shadowchat-native-notification-installation-credential-v2';
 f.store.set(key,JSON.stringify({installationKey:uuid,userId:user,credential:'a'.repeat(64)}));
 const registration=f.createScopedRegistration(a);assert.equal((await registration.getNativeNotificationInstallationCredential()).userId,user);
 await registration.revokeNativeNotificationInstallation();assert(f.calls[0].url.endsWith('/revoke_notification_installation_by_credential_v2'));
 assert.equal(f.calls[0].body.target_user_id,undefined);assert.equal(f.store.has(key),false);
});

test('concurrent enrollment challenges share a stable installation identifier',async()=>{
 const f=fixture(),a=makeContext('abcdefghijklmnopqrst'),registration=f.createScopedRegistration(a);
 const [first,second]=await Promise.all([registration.getNativeNotificationInstallationKey(),registration.getNativeNotificationInstallationKey()]);
 assert.equal(first,second);assert.equal(first,f.store.get(core.communityStorageKeys(a.community).installation));
});


function recoveryServer({offlineBefore=false,lostAfter=false,oldCredential=null,delayRedeem=null}={}){
 const state={credential:oldCredential,revoked:false,cancelled:new Set(),offlineBefore,lostAfter};
 return {state,handler:async({url,body})=>{
  if(url.endsWith('/redeem_scoped_native_notification_enrollment_ticket_v2')){
   if(state.offlineBefore)throw Error('offline before server');
   if(delayRedeem)await delayRedeem;
   if(state.cancelled.has(body.target_ticket))throw Error('ticket cancelled');
   state.credential=body.target_installation_credential;state.revoked=false;
   if(state.lostAfter)throw Error('response lost after commit');
   return enrollmentResponse;
  }
  if(url.endsWith('/settle_native_notification_enrollment_attempt_v1')){
   assert.equal(body.target_user_id,user);assert.equal(body.target_ticket,enrollment.enrollmentTicket);assert.equal(body.target_verifier,enrollment.enrollmentVerifier);
   state.cancelled.add(body.target_ticket);if(state.credential===body.target_credential)state.revoked=true;return true;
  }
  if(url.endsWith('/revoke_notification_installation_with_proof_v1')){
   if(state.credential!==body.target_credential)return false;state.revoked=true;return true;
  }
  throw Error('Unexpected recovery RPC');
 }};
}

test('offline first enrollment cancels exact ticket and recovers after process restart without an orphan credential',async()=>{
 const server=recoveryServer({offlineBefore:true}),a=makeContext('abcdefghijklmnopqrst'),first=fixture({handler:server.handler});
 await assert.rejects(first.createScopedRegistration(a).registerNativeNotificationInstallation(enrollment));
 assert.equal(first.store.has(core.communityStorageKeys(a.community).credential),false);
 const restarted=fixture({handler:server.handler,sharedStore:first.store,current:false});
 await restarted.createScopedRegistration(a).revokeNativeNotificationInstallation();
 assert.equal(server.state.cancelled.has(enrollment.enrollmentTicket),true);assert.equal(first.store.has(core.communityStorageKeys(a.community).credential+'.pending-enrollment'),false);
});

test('failed replacement preserves previous valid credential and revokes it after cancelling pending ticket',async()=>{
 const old='a'.repeat(64),server=recoveryServer({offlineBefore:true,oldCredential:old}),a=makeContext('abcdefghijklmnopqrst'),f=fixture({handler:server.handler}),key=core.communityStorageKeys(a.community).credential;
 const previous=JSON.stringify({installationKey:uuid,userId:user,credential:old});f.store.set(key,previous);
 const registration=f.createScopedRegistration(a);await assert.rejects(registration.registerNativeNotificationInstallation(enrollment));assert.equal(f.store.get(key),previous);
 await registration.revokeNativeNotificationInstallation();assert.equal(server.state.revoked,true);assert.equal(f.store.has(key),false);assert.equal(f.store.has(key+'.pending-enrollment'),false);
});

test('lost response after commit revokes exact pending generation and can clear replaced previous credential',async()=>{
 const old='a'.repeat(64),server=recoveryServer({lostAfter:true,oldCredential:old}),a=makeContext('abcdefghijklmnopqrst'),f=fixture({handler:server.handler}),key=core.communityStorageKeys(a.community).credential;
 f.store.set(key,JSON.stringify({installationKey:uuid,userId:user,credential:old}));const registration=f.createScopedRegistration(a);
 await assert.rejects(registration.registerNativeNotificationInstallation(enrollment));assert.equal(JSON.parse(f.store.get(key)).credential,old);
 await registration.revokeNativeNotificationInstallation();assert.equal(server.state.revoked,true);assert.equal(f.store.has(key),false);assert.equal(f.store.has(key+'.pending-enrollment'),false);
});

test('delayed redemption cannot register after exact-attempt cancellation allows a switch',async()=>{
 let release;const delayed=new Promise(done=>{release=done;}),server=recoveryServer({delayRedeem:delayed}),a=makeContext('abcdefghijklmnopqrst'),f=fixture({handler:server.handler}),registration=f.createScopedRegistration(a);
 const attempt=registration.registerNativeNotificationInstallation(enrollment);const rejected=assert.rejects(attempt);
 while(!f.calls.some(call=>call.url.endsWith('/redeem_scoped_native_notification_enrollment_ticket_v2')))await new Promise(resolve=>setImmediate(resolve));
 await registration.revokeNativeNotificationInstallation();release();await rejected;assert.equal(server.state.credential,null);assert.equal(server.state.cancelled.has(enrollment.enrollmentTicket),true);
});

test('failed settlement preserves both pending tuple and previous valid credential',async()=>{
 const a=makeContext('abcdefghijklmnopqrst'),f=fixture({transportError:true}),key=core.communityStorageKeys(a.community).credential,previous=JSON.stringify({installationKey:uuid,userId:user,credential:'a'.repeat(64)});
 f.store.set(key,previous);const registration=f.createScopedRegistration(a);await assert.rejects(registration.registerNativeNotificationInstallation(enrollment));
 const pending=f.store.get(key+'.pending-enrollment');await assert.rejects(registration.revokeNativeNotificationInstallation());assert.equal(f.store.get(key),previous);assert.equal(f.store.get(key+'.pending-enrollment'),pending);
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { JSDOM } = require('jsdom');
function load(relative, imports = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', relative), 'utf8'), { fileName: relative, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, URL, atob, process: {env:{}}, setTimeout, clearTimeout, setInterval, clearInterval,
      require: name => { assert.ok(Object.hasOwn(imports,name), name); return imports[name]; } });
  return module.exports;
}
const transport = load('src/lib/notifications/transportData.ts');
const parser = load('src/types/notification-envelope-v2.ts');
const bindings = load('src/community/communityBindings.ts', {
  'expo-constants': { __esModule:true, default:{} }, '../lib/appConfiguration': {resolveAppConfiguration:()=>({})},
  './communityRuntime': {createCommunityRuntime:()=>null,resolveCommunityRegistry:()=>{throw Error('test registry')}},
  './communityStartup': {createCommunityStartup:()=>()=>null},
});
const uid='2c624c83-d204-4e8b-8cf2-24f01c56fb36', key='a4635c1b-e14e-4caa-98e9-d979674788f7';
const scope={version:1,projectRef:'lzmbwrbvtugqnmuefdrm',userId:uid,installationKey:key};
const context={community:{projectRef:scope.projectRef,origin:'https://demo.example.com'},generation:1};
const identity={userId:uid,installationKey:key,credential:'a'.repeat(64)};
const appRuntime={streamlined:true,origin:context.community.origin,fallbackRoute:'/?view=chat'};
const route='/?view=dms&conversation=b3b22b6b-193a-4913-8b50-594ee760d692&message=39273ba2-965a-49b0-87a0-0401f659804f';
const builder=load('../../supabase/functions/_shared/notification-envelope-v2.ts');
// Mirrors the actual persisted synthetic DM row, including PostgreSQL precision.
const envelope=builder.buildNotificationDeliveryEnvelopeV2({event_id:'a278bac9-2e85-4fba-972c-6c884246c169',user_id:uid,category_key:'dm',title:'Demo Member',body:'Synthetic route check',private_title:'New ShadowChat notification',private_body:'Open ShadowChat to view it.',actor_id:null,route,group_key:'dm:b3b22b6b-193a-4913-8b50-594ee760d692',priority:'high',action_keys:['open','mark_read'],sound_id:'shadow_whisper',android_channel_key:'messages_v1',badge_category:'dm',media_ref:null,created_at:'2026-10-29T22:46:03.691902+00:00',expires_at:'2026-10-29T22:47:33.691902+00:00'}, {previewMode:'full',actor:null,media:null,eventType:'dm_message',entityId:'39273ba2-965a-49b0-87a0-0401f659804f'});
const data={envelopeV2:envelope,communityScope:scope};

test('iOS APNs body and Android serialized data resolve one scope/envelope container; cross-container scope substitution is rejected',()=>{
  for(const wire of [data,{body:data},{body:JSON.stringify(data)},{dataString:JSON.stringify(data)},{envelopeV2:JSON.stringify(envelope),communityScope:JSON.stringify(scope)}]){
    const decoded=transport.readNativeNotificationData(wire);
    assert.equal(bindings.scopeMatchesInstallation(context.community,identity,decoded),true);
    assert.equal(parser.parseNotificationEnvelopeV2(transport.readNativeNotificationEnvelope(decoded),{interaction:true}).route,route);
  }
  assert.equal(parser.parseNotificationEnvelopeV2(transport.readNativeNotificationEnvelope(transport.readNativeNotificationData(envelope)),{interaction:true}).route,route, 'legacy direct raw envelopes remain supported');
  const mixed={communityScope:scope,body:{envelopeV2:envelope,communityScope:{...scope,projectRef:'foreign'}}};
  assert.equal(bindings.scopeMatchesInstallation(context.community,identity,transport.readNativeNotificationData(mixed)),false);
  for (const changed of [{userId:'11111111-1111-4111-8111-111111111111'},{installationKey:'22222222-2222-4222-8222-222222222222'}]) assert.equal(bindings.scopeMatchesInstallation(context.community,identity,transport.readNativeNotificationData({body:{...data,communityScope:{...scope,...changed}}})),false);
  for(const wire of [{body:'not json'},{body:[]},{body:' '.repeat(32769)},null]) assert.equal(transport.readNativeNotificationData(wire),null);
});

test('real provider consumes iOS Notifee PRESS after auth restoration and routes exact DM once; wrong community is refused', async()=>{
  const dom=new JSDOM('<div id="root"></div>'); const prior={window:global.window,document:global.document,act:global.IS_REACT_ACT_ENVIRONMENT};
  global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
  const root=createRoot(document.getElementById('root'));
  let foreground, authCallback, sdkResponse; const routes=[];
  const session={user:{id:uid}};
  const noop=async()=>{}; const removable=()=>({remove(){}});
  const notifee={onForegroundEvent:fn=>{foreground=fn;return()=>{}},getInitialNotification:async()=>null,getDisplayedNotifications:async()=>[],setBadgeCount:noop,cancelNotification:noop,cancelAllNotifications:noop};
  const channel={on(){return this},subscribe(){return this}};
  const client={
    rpc:async()=>({data:{total:0},error:null}),channel:()=>channel,removeChannel:noop,
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:fn=>{
      authCallback=fn;return {data:{subscription:{unsubscribe(){}}}};
    }},
  };
  const registration={getNativeNotificationInstallationCredential:async()=>identity,getNativeNotificationDeviceOptOut:async()=>false,reconcileNativeNotificationInstallation:async()=>false,updateNativeNotificationForegroundLease:noop};
  const presenter=load('src/lib/notifications/androidPresenter.ts',{'@notifee/react-native':{__esModule:true,default:notifee},'./config':{},'./transportData':transport,'../appRuntime':{appRuntime},'../../community/communityBindings':{currentTransportScope:()=>scope,readTransportScope:bindings.readTransportScope},'@/types/notification-envelope-v2':parser});
  const provider=load('src/hooks/useNativeNotifications.tsx',{
    react:React,'react/jsx-runtime':require('react/jsx-runtime'),'@notifee/react-native':{__esModule:true,default:notifee,EventType:{PRESS:1,ACTION_PRESS:2}},
    'expo-notifications':{getPermissionsAsync:async()=>({status:'denied'}),addPushTokenListener:removable,addNotificationReceivedListener:removable,addNotificationResponseReceivedListener:fn=>{sdkResponse=fn;return removable()},getLastNotificationResponseAsync:async()=>null,clearLastNotificationResponseAsync:noop,getPresentedNotificationsAsync:async()=>[],setBadgeCountAsync:noop,getBadgeCountAsync:async()=>0,dismissNotificationAsync:noop},
    'react-native':{AppState:{currentState:'active',addEventListener:removable},StyleSheet:{create:v=>v}},'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0})},
    '@/lib/supabase':{getSupabase:()=>client,isSupabaseConfigured:true,nativeRealtimeTopic:v=>v},'@/lib/appRuntime':{appRuntime},'@/community/NativeCommunityBoundary':{useCommunityBinding:()=>({context})},
    '@/community/communityBindings':{isCurrentCommunity:()=>true,runCommunityOperation:(_c,fn)=>fn(),scopeMatchesInstallation:bindings.scopeMatchesInstallation,rememberedInstallation:()=>identity},
    '@/lib/notifications/config':{configureNativeNotifications:noop},'@/lib/notifications/registration':{bindCommunityRegistration:()=>registration,isNativeNotificationCredentialRejectedError:()=>false},
    '@/lib/notifications/androidPresenter':presenter,'@/lib/nativeAppBridge':{publishNativeNotificationRoute:url=>routes.push(url)},'@/lib/notifications/routes':load('src/lib/notifications/routes.ts',{'../appRuntime':{appRuntime}}),
    '@/lib/notifications/transportData':transport,'@/types/notification-envelope-v2':parser,'@/lib/notifications/registrationPipeline':{},'@/lib/notifications/badgeSynchronizer':load('src/lib/notifications/badgeSynchronizer.ts'),
    '@/lib/notifications/badgeLifecycle':load('src/lib/notifications/badgeLifecycle.ts'), '@/lib/notifications/badgeDiagnostics':load('src/lib/notifications/badgeDiagnostics.ts'),
  });
  try{
    await React.act(async()=>{root.render(React.createElement(provider.NativeNotificationsProvider,null));});
    const press={type:1,detail:{notification:{id:'apns-test',data:{body:data}},pressAction:{id:'default'}}};
    await React.act(async()=>{foreground(press);await Promise.resolve()});
    assert.equal(routes.length,0,'must wait for authenticated caller');
    await React.act(async()=>{authCallback('SIGNED_IN',session);});
    assert.deepEqual(routes,[route]);
    await React.act(async()=>{foreground(press);}); assert.equal(routes.length,1,'duplicate PRESS is consumed once');
    await React.act(async()=>{foreground({...press,detail:{...press.detail,notification:{id:'foreign',data:{body:{...data,communityScope:{...scope,projectRef:'foreign'}}}}}});});
    assert.equal(routes.length,1);
    await React.act(async()=>{sdkResponse({actionIdentifier:'default',notification:{request:{identifier:'expo-test',content:{data}}}});});
    assert.equal(routes.at(-1),route,'Expo direct-data path remains valid');
  }finally{await React.act(async()=>root.unmount());global.window=prior.window;global.document=prior.document;global.IS_REACT_ACT_ENVIRONMENT=prior.act;dom.window.close()}
});

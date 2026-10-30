const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),ts=require('typescript');
const React=require('react'),{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom');
const mobile=path.resolve(__dirname,'..');
const uid='11111111-1111-4111-8111-111111111111',installationKey='22222222-2222-4222-8222-222222222222';
const memberRef='qrstabcdefghijklmnop',demoRef='abcdefghijklmnopqrst',demoOrigin='https://demo.example.com';
const publicKey='sb_publishable_synthetic_test_public_key_000';
const route='/?view=dms&conversation=33333333-3333-4333-8333-333333333333&message=44444444-4444-4444-8444-444444444444';
const expires=Math.floor(Date.now()/1000)+3600;
const access=[Buffer.from('{}').toString('base64url'),Buffer.from(JSON.stringify({iss:`https://${demoRef}.supabase.co/auth/v1`,sub:uid,role:'authenticated',exp:expires})).toString('base64url'),'synthetic-signature'].join('.');

for (const timing of ['before-session', 'after-session']) test(`real app boundary/controller auth and scoped DM routing (${timing})`,async()=>{
 const dom=new JSDOM('<div id="root"></div>');const previous={window:global.window,document:global.document,act:global.IS_REACT_ACT_ENVIRONMENT};global.window=dom.window;global.document=dom.window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.getElementById('root'));const cache=new Map();let bindings,webProps,expoResponse,nativeSession=null,verified=0,committed=0,badge=1,webMounts=0;const authListeners=new Set();const injections=[];
 const noop=async()=>{};const remove=()=>({remove(){}});const store=new Map([['shadowchat-community-selection-v1','demo']]);
 let releasePreparation, memberPreparations=0;const preparation=new Promise(resolve=>{releasePreparation=resolve;});
 const identity={userId:uid,installationKey,credential:'a'.repeat(64)};
 const registration={adoptLegacyMemberInstallationKey:async()=>{memberPreparations++;await preparation;},getNativeNotificationInstallationCredential:async()=>{bindings.rememberInstallation(bindings.requireCommunity().community,identity);return identity},getNativeNotificationDeviceOptOut:async()=>false,reconcileNativeNotificationInstallation:async()=>false,updateNativeNotificationForegroundLease:noop,revokeNativeNotificationInstallation:noop};
 const sdkClient={auth:{getUser:async token=>{verified++;assert.equal(token,access);return{data:{user:{id:uid}},error:null}},setSession:async tokens=>{committed++;nativeSession={...tokens,user:{id:uid}};for(const cb of authListeners)cb('SIGNED_IN',nativeSession);return{data:{session:nativeSession},error:null}},getSession:async()=>({data:{session:nativeSession}}),onAuthStateChange:cb=>{authListeners.add(cb);return{data:{subscription:{unsubscribe:()=>authListeners.delete(cb)}}}},stopAutoRefresh:noop},rpc:async()=>({data:{total:0},error:null}),channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:noop,removeAllChannels:noop};
 const primitive=tag=>({children,onPress})=>React.createElement(tag,{onClick:onPress},children);
 const WebView=React.forwardRef((props,ref)=>{webProps=props;React.useEffect(()=>{webMounts++},[]);React.useImperativeHandle(ref,()=>({injectJavaScript:value=>injections.push(value),goBack(){}}),[]);return React.createElement('output',{'data-uri':props.source.uri},props.source.uri)});
 const Notifications={getPermissionsAsync:async()=>({status:'denied'}),addPushTokenListener:remove,addNotificationReceivedListener:remove,addNotificationResponseReceivedListener:fn=>{expoResponse=fn;return remove()},getLastNotificationResponseAsync:async()=>null,clearLastNotificationResponseAsync:noop,getPresentedNotificationsAsync:async()=>[],setBadgeCountAsync:async v=>{badge=v},getBadgeCountAsync:async()=>badge,dismissNotificationAsync:noop,dismissAllNotificationsAsync:noop,cancelAllScheduledNotificationsAsync:noop};
 const notifee={onForegroundEvent:()=>()=>{},getInitialNotification:async()=>null,getDisplayedNotifications:async()=>[],setBadgeCount:async v=>{badge=v},cancelNotification:noop,cancelAllNotifications:noop};
 const externals={react:React,'react/jsx-runtime':require('react/jsx-runtime'),'react-native':{AppState:{currentState:'active',addEventListener:remove},BackHandler:{addEventListener:remove},Platform:{OS:'ios'},StyleSheet:{create:v=>v},View:primitive('div'),Text:primitive('span'),Pressable:primitive('button'),Image:primitive('i'),ActivityIndicator:primitive('i'),useWindowDimensions:()=>({height:844,fontScale:1})},'react-native-safe-area-context':{SafeAreaView:primitive('div'),useSafeAreaInsets:()=>({top:0})},'react-native-webview':{WebView},'expo':{requireOptionalNativeModule:()=>null},'expo-crypto':{},'expo-linking':{openURL:noop},'expo-notifications':Notifications,'@notifee/react-native':{__esModule:true,default:notifee,EventType:{PRESS:1,ACTION_PRESS:2}},'expo-secure-store':{getItemAsync:async k=>store.get(k)??null,setItemAsync:async(k,v)=>store.set(k,v),deleteItemAsync:async k=>store.delete(k)},'expo-constants':{__esModule:true,default:{expoConfig:{extra:{appEdition:'streamlined',webAppUrl:'https://member.example.com',communities:{demoEnabled:true,demo:{origin:demoOrigin,projectRef:demoRef,supabaseUrl:`https://${demoRef}.supabase.co`,publicKey}}}}}},'react-native-url-polyfill/auto':{},'@supabase/supabase-js':{createClient:()=>sdkClient}};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const m={exports:{}};cache.set(file,m);
   const rel=path.relative(mobile,file).replaceAll('\\','/');
   if(rel==='src/lib/notifications/registration.ts'){m.exports={bindCommunityRegistration:()=>registration,createScopedRegistration:()=>registration,isNativeNotificationCredentialRejectedError:()=>false,...registration};return m.exports}
   if(rel==='src/lib/notifications/config.ts'){m.exports={configureNativeNotifications:noop,getAndroidSoundChannelId:()=>''};return m.exports}
   if(file.endsWith('.png')){m.exports='bundled-image';return m.exports}
   const requireLocal=name=>{if(Object.hasOwn(externals,name))return externals[name];let target=name.startsWith('@/')?path.join(mobile,'src',name.slice(2)):path.resolve(path.dirname(file),name);if(!path.extname(target))target=['.ts','.tsx','.js'].map(ext=>target+ext).find(fs.existsSync);assert.ok(target&&fs.existsSync(target),`${rel}: ${name}`);return load(target)};
   vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:requireLocal,URL,atob,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,fetch,process:{env:{EXPO_PUBLIC_SUPABASE_URL:`https://${memberRef}.supabase.co`,EXPO_PUBLIC_SUPABASE_ANON_KEY:publicKey}}});return m.exports;
 }
 try{
  bindings=load(path.join(mobile,'src/community/communityBindings.ts'));
  const {NativeCommunityBoundary}=load(path.join(mobile,'src/community/NativeCommunityBoundary.tsx'));
  const {NativeNotificationsProvider}=load(path.join(mobile,'src/hooks/useNativeNotifications.tsx'));
  const Screen=load(path.join(mobile,'src/app/index.tsx')).default;
  await React.act(async()=>{root.render(React.createElement(NativeCommunityBoundary,null,React.createElement(NativeNotificationsProvider,null,React.createElement(Screen))));});
  assert.equal(bindings.activeCommunity(),null,'startup must not expose a project before device identity recovery');
  assert.equal(webProps,undefined,'no WebView or enrollment bridge mounts before recovery');
  assert.equal(memberPreparations,1);
  await React.act(async()=>{releasePreparation();await preparation;});
  assert.equal(bindings.requireCommunity().community.projectRef,demoRef);
  const envelope={schemaVersion:2,eventId:'event1',eventIds:['event1'],type:'dm_message',category:'dm',entityId:'message1',route,groupKey:'dm:test',priority:'high',privacy:'private',actor:null,content:{eyebrow:'dm',title:'ShadowChat',body:null,privateTitle:'ShadowChat',privateBody:'Open ShadowChat to view it.'},media:null,actions:['open'],soundId:'shadow_whisper',androidChannelKey:'messages_v1',badgeCategory:'dm',autoRead:false,createdAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+90000).toISOString()};
  const response=(identifier, extra={})=>({actionIdentifier:'default',notification:{request:{identifier,content:{data:{envelopeV2:envelope,communityScope:{version:1,projectRef:demoRef,userId:uid,installationKey},...extra}}}}});
  if(timing==='before-session') await React.act(async()=>{expoResponse(response('actual-native-route-test'));await new Promise(resolve=>setTimeout(resolve,0));});
  await React.act(async()=>{webProps.onLoad();webProps.onMessage({nativeEvent:{url:demoOrigin+'/?view=settings',data:JSON.stringify({version:1,type:'auth_session',session:{accessToken:access,refreshToken:'abcdefghijkl',expiresAt:expires,userId:uid}})}});await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(verified,1,'web session must reach server-side user verification');
  assert.equal(committed,1,'opaque refresh token must reach the verified own-community native client');
  assert.equal(bindings.communityController.status().signedIn,true);

  if(timing==='after-session') await React.act(async()=>{expoResponse(response('actual-native-route-test'));await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(webProps.source.uri,demoOrigin+route);
  assert.equal(badge,0,'canonical zero badge uses the authenticated helper');
  const mounts = webMounts;
  await React.act(async()=>{expoResponse(response('actual-native-route-test'));await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(webMounts,mounts,'duplicate OS delivery cannot remount twice');
  await React.act(async()=>{expoResponse(response('second-real-tap'));await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(webMounts,mounts+1,'another tap on the same DM target still navigates');
  await React.act(async()=>{expoResponse(response('foreign-scope',{envelopeV2:{...envelope,route:'/?view=chat'},communityScope:{version:1,projectRef:memberRef,userId:uid,installationKey}}));await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(webProps.source.uri,demoOrigin+route,'foreign payload cannot replace selected demo route');

 }finally{await React.act(async()=>root.unmount());global.window=previous.window;global.document=previous.document;global.IS_REACT_ACT_ENVIRONMENT=previous.act;dom.window.close()}
});

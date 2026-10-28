const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),ts=require('typescript');
const identity={installationKey:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',credential:'a'.repeat(64)};
const community={id:'demo',projectRef:'abcdefghijklmnopqrst',storageNamespace:'shadowchat-community-v1.abcdefghijklmnopqrst'},credential=community.storageNamespace+'.credential';
test('headless restart suppresses uncertain enrollment while leaving full legacy storage behavior intact',async()=>{
 async function run({streamlined=true,pending=false}={}){
  let handler;const shown=[],store=new Map([['shadowchat-community-selection-v1','demo'],[credential,JSON.stringify(identity)],['shadowchat-native-notification-installation-credential-v2',JSON.stringify(identity)]]);if(pending)store.set(credential+'.pending-enrollment','durable-pending-tuple');
  const imports={
   'expo-notifications':{registerTaskAsync:async()=>{}},'expo-task-manager':{isTaskRegisteredAsync:async()=>true,isTaskDefined:()=>false,defineTask:(_name,callback)=>{handler=callback;}},
   'react-native':{AppState:{currentState:'background'},Platform:{OS:'android'}},'expo-secure-store':{getItemAsync:async key=>store.get(key)??null},
   '../../community/communityBindings':{baseAppRuntime:{streamlined},communityRegistry:{member:community,demo:community},readTransportScope:data=>data.communityScope??null,scopeMatchesInstallation:()=>true},
   '../../community/communityRuntime':{communityStorageKeys:c=>({credential:c.storageNamespace+'.credential',optOut:c.storageNamespace+'.opt-out'}),restoreCommunitySelection:(_registry,value)=>value},
   './androidPresenter':{displayAndroidNotificationEnvelope:async envelope=>shown.push(envelope)},'@/types/notification-envelope-v2':{parseNotificationEnvelopeV2:value=>value},
  };
  const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/notifications/background.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:name=>{assert(Object.hasOwn(imports,name),name);return imports[name];}});
  await handler({data:{envelopeV2:{eventId:'synthetic-event'},communityScope:{version:1}}});return shown;
 }
 assert.equal((await run({pending:true})).length,0);assert.equal((await run()).length,1);assert.equal((await run({streamlined:false,pending:true})).length,1);
});

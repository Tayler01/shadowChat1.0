import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import crypto from 'node:crypto'
import ts from 'typescript'
const source = fs.readFileSync('supabase/functions/send-push/index.ts','utf8')
const worker = source.slice(source.indexOf('const deliverPushToSubscriptions ='),source.indexOf('const getRetryableFailureCount'))
const policySource = fs.readFileSync('supabase/functions/_shared/web-push-policy.ts','utf8')
const transpile = text => ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function harness(statuses) {
  const state={targets:new Map(),jobs:[],sent:[],removed:[],attempts:[],requests:[]}
  const supabase={
    async rpc(name,args) {
      if(name==='claim_notification_delivery_targets') {
        const ids=args.target_subscription_ids.filter(id=>!state.targets.has(id)||state.targets.get(id).status==='pending')
        ids.forEach(id=>state.targets.set(id,{subscription_id:id,status:'pending',token:args.target_lease_token}))
        return {data:ids}
      }
      for(const row of args.target_results) {
        if(state.targets.get(row.subscription_id)?.token===args.target_lease_token) state.targets.set(row.subscription_id,{...row})
      }
      return {}
    },
    from(table) {
      let operation='select',value
      const chain={select(){return chain},eq(){return chain},is(){return chain},in(){return chain},limit(){return chain},update(v){operation='update';value=v;return chain},insert(v){operation='insert';value=v;return chain},delete(){operation='delete';return chain},then(resolve,reject){
        if(table==='notification_delivery_jobs'&&operation==='update')state.jobs.push(value)
        if(table==='notification_events'&&operation==='update')state.sent.push(value)
        if(table==='notification_delivery_attempts'&&operation==='insert')state.attempts.push(...value)
        if(table==='push_subscriptions'&&operation==='delete')state.removed.push(true)
        return Promise.resolve({data:table==='notification_delivery_targets'?[...state.targets.values()]:null}).then(resolve,reject)
      }}
      return chain
    }
  }
  const policy={exports:{}};vm.runInNewContext(transpile(policySource),policy)
  const context={exports:{},crypto,AbortSignal,Date,Set,JSON,console,
    resolveWebPushPayload:policy.exports.resolveWebPushPayload,
    PUSH_PROVIDER_CONCURRENCY:4,PUSH_PROVIDER_TIMEOUT_MS:1000,SAFE_PUSH_ENDPOINT_OPTIONS:{},
    mapWithConcurrency:async(items,_limit,fn)=>Promise.all(items.map(fn)),
    normalizePushEndpoint:async value=>new URL(value),
    buildPushPayload:async message=>({body:Buffer.from(message.data)}),
    toPushRequestInit:payload=>payload,
    safeFetch:async(endpoint,init)=>{state.requests.push({id:endpoint.pathname,payload:JSON.parse(init.body.toString())});const status=statuses[endpoint.pathname].shift();return {status,ok:status>=200&&status<300}},
  }
  vm.runInNewContext(transpile(worker+'\nexports.deliver = deliverPushToSubscriptions;'),context)
  return {state,deliver:(subscriptions,prefs={notification_preview_mode:'private'})=>context.exports.deliver(supabase,{},subscriptions,{data:JSON.stringify({title:'Private sender',body:'Secret text',icon:'https://example.invalid/avatar',data:{type:'dm_message',sender_id:'private-user'}})},{notificationEventId:'event',preferences:prefs})}
}
const subscriptions=['a','b'].map(id=>({id,endpoint:`https://example.invalid/${id}`,p256dh:'test',auth:'test'}))
test('actual worker retains partial success and retries only failed device',async()=>{
  const h=harness({'/a':[201],'/b':[503,201]})
  const first=await h.deliver(subscriptions)
  assert.equal(first.deliveredCount,1);assert.equal(first.retryableFailures,1)
  assert.equal(h.state.jobs.at(-1).status,'pending');assert.equal(h.state.jobs.at(-1).completed_at,null)
  assert.equal(h.state.sent.length,1)
  const second=await h.deliver(subscriptions)
  assert.equal(second.deliveredCount,2);assert.equal(second.retryableFailures,0)
  assert.equal(h.state.jobs.at(-1).status,'delivered')
  assert.deepEqual(h.state.requests.map(r=>r.id),['/a','/b','/b'])
  assert.equal(h.state.attempts.length,3)
})
test('actual worker encrypts private payload without sender or message details',async()=>{
  const h=harness({'/a':[201]});await h.deliver(subscriptions.slice(0,1))
  const json=JSON.stringify(h.state.requests[0].payload)
  assert.equal(json.includes('Secret text'),false);assert.equal(json.includes('Private sender'),false)
  assert.equal(json.includes('private-user'),false);assert.equal(json.includes('/avatar'),false)
})
test('provider auth configuration failure keeps valid subscription',async()=>{
  const h=harness({'/a':[401]});await h.deliver(subscriptions.slice(0,1))
  assert.equal(h.state.removed.length,0);assert.equal(h.state.targets.get('a').status,'failed')
})

const badgeWorker=source.slice(source.indexOf('const getUnreadBadgeCount ='),source.indexOf('const upsertNotificationEvent ='))
const badgeContext={exports:{},console:{error(){}}}
vm.runInNewContext(transpile(badgeWorker+'\nexports.badge = getUnreadBadgeCount;'),badgeContext)
test('unknown badge query or malformed aggregate remains unknown',async()=>{
  for(const result of [{error:{code:'timeout'}},{data:null},{data:{}},{data:{total:null}},{data:{total:'bad'}}]) {
    assert.equal(await badgeContext.exports.badge({rpc:async()=>result},'synthetic'),undefined)
  }
})
test('confirmed zero badge and launcher cap stay explicit',async()=>{
  assert.equal(await badgeContext.exports.badge({rpc:async()=>({data:{total:0}})},'synthetic'),0)
  assert.equal(await badgeContext.exports.badge({rpc:async()=>({data:{total:122}})},'synthetic'),99)
})

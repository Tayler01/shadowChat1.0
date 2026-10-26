import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { runModerationRetention } from '../scripts/moderation-retention-core.mjs'

function fixture(overrides={}) {
  const id=randomUUID(), fileId=randomUUID(), video=randomUUID()
  const prepared={protocol:2,case_id:id,report_ids:[randomUUID()],action_ids:[],
    storage:[{bucket:'moderation-captured-media',path:'captured/'+id+'/'+fileId}],
    bunny_assets:[{library_id:'123',asset_id:video}],bunny_candidates:[{library_id:'123',asset_id:video}]}
  const committed={...structuredClone(prepared),committed_at:new Date().toISOString(),
    storage:prepared.storage.map(item=>({...item,removal_id:randomUUID()})),
    bunny_assets:prepared.bunny_assets.map(item=>({...item,removal_id:randomUUID()}))}
  const calls=[],removed=[]
  const options={execute:true,caseIds:[id],validateProvider:()=>{},
    rpc:async(name,args)=>{
      calls.push({name,args})
      if(overrides.rpc) return overrides.rpc(name,args,{prepared,committed,calls})
      if(name==='moderation_retention_claim_protocol') return 2
      if(name==='prepare_moderation_retention_purge') return [structuredClone(prepared)]
      if(name==='claim_moderation_retention_purge'||name==='authorize_moderation_retention_batch') return structuredClone(committed)
      return null
    },
    removeStorage:async item=>{removed.push({kind:'storage',...item});if(overrides.storage)await overrides.storage(item)},
    removeBunny:async item=>{removed.push({kind:'bunny',...item});if(overrides.bunny)await overrides.bunny(item)}}
  return {id,prepared,committed,calls,removed,options}
}

test('old/missing claim protocol fails before preparation and external calls',async()=>{
  for(const protocol of [null,1,'2']) {
    const f=fixture({rpc:async()=>protocol})
    await assert.rejects(runModerationRetention(f.options),/Durable retention claims/)
    assert.deepEqual(f.calls.map(c=>c.name),['moderation_retention_claim_protocol'])
    assert.deepEqual(f.removed,[])
  }
})

test('explicit reviewed allowlist and matching server case are mandatory',async()=>{
  const f=fixture()
  for(const caseIds of [[],['invalid'],[f.id,f.id],Array.from({length:51},()=>randomUUID())]) {
    await assert.rejects(runModerationRetention({...f.options,caseIds}))
  }
  assert.equal(f.calls.length,0)
  const other=fixture({rpc:async(name,args,{prepared})=>name==='moderation_retention_claim_protocol'?2:[{...prepared,case_id:randomUUID()}]})
  await assert.rejects(runModerationRetention(other.options),/explicit case/)
  assert.deepEqual(other.removed,[])
})

test('provider configuration is validated before the irreversible claim',async()=>{
  const f=fixture()
  await assert.rejects(runModerationRetention({...f.options,validateProvider:()=>{throw new Error('Missing configured library')}}),/configured library/)
  assert(!f.calls.some(c=>c.name==='claim_moderation_retention_purge'))
  assert.deepEqual(f.removed,[])
})

test('forged source paths, case IDs, resources and missing claim IDs never reach removers',async()=>{
  const mutations=[
    p=>{p.case_id=randomUUID()},
    p=>{p.storage[0].bucket='chat-uploads'},
    p=>{p.storage[0].path='../other'},
    p=>{p.storage[0].path='captured/'+randomUUID()+'/wrong'},
    p=>{p.storage[0].path+='-unreviewed'},
    p=>{delete p.storage[0].removal_id},
    p=>{p.bunny_assets[0].asset_id=randomUUID()},
    p=>{delete p.bunny_assets[0].removal_id},
    p=>{delete p.committed_at},
  ]
  for(const mutate of mutations) {
    const f=fixture()
    mutate(f.committed)
    await assert.rejects(runModerationRetention(f.options))
    assert.deepEqual(f.removed,[])
  }
})

test('last-holder video can enter the claim only from the reviewed candidate inventory',async()=>{
  const f=fixture()
  f.prepared.bunny_assets=[]
  await runModerationRetention(f.options)
  assert.deepEqual(f.removed.map(r=>r.kind),['storage','bunny'])
  assert(f.calls.some(c=>c.name==='finish_moderation_retention_purge'))
})

test('Storage failure leaves claim pending and skips confirmation, provider work and finalization',async()=>{
  const f=fixture({storage:async()=>{throw new Error('Synthetic Storage response lost')}})
  await assert.rejects(runModerationRetention(f.options),/response lost/)
  assert.deepEqual(f.removed.map(r=>r.kind),['storage'])
  assert(!f.calls.some(c=>c.name.startsWith('confirm_')||c.name==='finish_moderation_retention_purge'))
})

test('provider failure preserves the committed claim without confirmation or finalization',async()=>{
  const f=fixture({bunny:async()=>{throw new Error('Synthetic timeout')}})
  await assert.rejects(runModerationRetention(f.options),/timeout/)
  assert(f.calls.some(c=>c.name==='confirm_moderation_storage_removal'))
  assert(!f.calls.some(c=>c.name==='confirm_moderation_provider_removal'||c.name==='finish_moderation_retention_purge'))
})

test('every removal rechecks the same durable claim and confirms only after its external result',async()=>{
  const f=fixture()
  const result=await runModerationRetention(f.options)
  assert.equal(result.completed,1)
  assert.deepEqual(f.calls.map(c=>c.name),[
    'moderation_retention_claim_protocol','prepare_moderation_retention_purge','claim_moderation_retention_purge',
    'authorize_moderation_retention_batch','confirm_moderation_storage_removal',
    'authorize_moderation_retention_batch','confirm_moderation_provider_removal','finish_moderation_retention_purge',
  ])
})

test('a changed committed claim aborts before any removal',async()=>{
  const f=fixture({rpc:async(name,args,{prepared,committed})=>{
    if(name==='moderation_retention_claim_protocol')return 2
    if(name==='prepare_moderation_retention_purge')return [structuredClone(prepared)]
    if(name==='claim_moderation_retention_purge')return structuredClone(committed)
    if(name==='authorize_moderation_retention_batch') {
      const changed=structuredClone(committed);changed.storage[0].removal_id=randomUUID();return changed
    }
  }})
  await assert.rejects(runModerationRetention(f.options),/claims changed/)
  assert.deepEqual(f.removed,[])
})

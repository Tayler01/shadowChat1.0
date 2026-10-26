import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createRetentionFixture } from './helpers/moderationRetentionFixture.mjs'
import { runModerationRetention } from '../scripts/moderation-retention-core.mjs'

test('retention claims enforce actual PostgreSQL boundaries and external-request interleavings', async t => {
  const f = await createRetentionFixture()
  const finish = async plan => {
    for (const item of plan.storage) {
      await f.removeStorage(item)
      await f.rpc('confirm_moderation_storage_removal', { target_case_id:plan.case_id,target_removal_id:item.removal_id })
    }
    for (const item of plan.bunny_assets) {
      // Synthetic provider success only. This harness makes no network requests.
      await f.rpc('confirm_moderation_provider_removal', { target_case_id:plan.case_id,target_library_id:item.library_id,target_asset_id:item.asset_id })
    }
    await f.rpc('finish_moderation_retention_purge', { target_case_id:plan.case_id })
  }
  try {
    await t.test('dry-run never prepares, claims or removes; browser roles cannot invoke service operations', async () => {
      const c = await f.addCase({file:true})
      const result = await runModerationRetention({rpc:f.rpc})
      assert.equal(result.dryRun,true)
      assert.equal(await f.scalar('select count(*)::int from private.moderation_purge_jobs'),0)
      assert.equal(await f.scalar('select count(*)::int from private.moderation_storage_removals'),0)
      for (const role of ['anon','authenticated']) {
        await f.role(role)
        await assert.rejects(f.claim(c.id),/permission denied/)
        await assert.rejects(f.rpc('moderation_retention_claim_protocol',{}),/permission denied/)
        await assert.rejects(f.query('select * from private.moderation_storage_removals'),/permission denied/)
      }
      await f.role('service_role')
    })

    await t.test('hold/reopen/new evidence before commitment cancels with no claim or external deletion', async () => {
      for (const mutation of ['hold','reopen','evidence']) {
        const c = await f.addCase({file:true,video:randomUUID()})
        await f.prepare(c.id)
        if (mutation==='hold') await f.hold(c.id)
        else if (mutation==='reopen') await f.query("update public.moderation_cases set status='investigating' where id=$1",[c.id])
        else await f.query("insert into public.moderation_case_events(case_id,event_type) values($1,'note_added')",[c.id])
        await assert.rejects(f.claim(c.id),/cancelled|eligibility changed/)
        assert.equal(await f.scalar('select count(*)::int from private.moderation_storage_removals where case_id=$1',[c.id]),0)
        assert.equal(await f.scalar('select count(*)::int from private.bunny_media_removals where source_id=$1',[c.id]),0)
        assert.equal(await f.scalar('select count(*)::int from storage.objects where name=$1',[c.file]),1)
      }
    })

    await t.test('only committed exact resources can be removed or confirmed; retry preserves claim IDs', async () => {
      const c = await f.addCase({file:true,attachment:true,video:randomUUID()})
      await f.prepare(c.id)
      await assert.rejects(f.removeStorage({bucket:'moderation-captured-media',path:c.file}),/immutable/)
      await assert.rejects(f.rpc('confirm_moderation_provider_removal',{target_case_id:c.id,target_library_id:'123',target_asset_id:c.video}),/committed/)
      const plan = await f.claim(c.id)
      assert.equal(plan.storage.length,2)
      assert.equal(plan.bunny_assets.length,1)
      assert.deepEqual(await f.claim(c.id),plan)
      const preparedAgain = await f.prepare(c.id)
      assert.deepEqual(preparedAgain[0].storage,plan.storage)
      assert.deepEqual(preparedAgain[0].bunny_assets,plan.bunny_assets)
      await assert.rejects(f.query('select public.cancel_moderation_retention_purge($1)',[c.id]),/cannot be cancelled/)
      await assert.rejects(f.rpc('confirm_moderation_storage_removal',{target_case_id:c.id,target_removal_id:plan.storage[0].removal_id}),/not confirmed/)
      await assert.rejects(f.rpc('confirm_moderation_storage_removal',{target_case_id:c.id,target_removal_id:randomUUID()}))
      await assert.rejects(f.rpc('confirm_moderation_provider_removal',{target_case_id:c.id,target_library_id:'999',target_asset_id:c.video}),/committed/)
      await assert.rejects(f.rpc('finish_moderation_retention_purge',{target_case_id:c.id}),/must be confirmed/)
      await assert.rejects(f.hold(c.id),/committed/)
      await assert.rejects(f.query("update public.moderation_cases set status='investigating' where id=$1",[c.id]),/committed/)
      await assert.rejects(f.query("insert into public.moderation_case_events(case_id,event_type) values($1,'note_added')",[c.id]),/committed/)
      await assert.rejects(f.query("update storage.objects set metadata='{\"changed\":true}' where name=$1",[c.file]),/committed/)
      await assert.rejects(f.query('select public.get_moderation_media_for_case($1,$2)',[f.reviewer,c.id]),/not available/)
      await f.query("update private.moderation_media_assets set source_owner_id=null where case_id=$1",[c.id])
      await f.query("update public.moderation_cases set subject_user_id=null where id=$1",[c.id])
      assert.equal(await f.scalar("select count(*)::int from private.moderation_media_assets where case_id=$1 and provider='bunny' and status='ready'",[c.id]),1,'FK anonymization must not reactivate or corrupt the claim')
      await finish(plan)
      await f.rpc('finish_moderation_retention_purge',{target_case_id:c.id})
      assert.equal(await f.scalar('select count(*)::int from public.moderation_cases where id=$1',[c.id]),0)
      assert.equal(await f.scalar('select count(*)::int from private.moderation_storage_removals where id=$1 and object_path is null and object_id is null and case_id is null and state=$2',[plan.storage[0].removal_id,'removed']),1)
      await assert.rejects(f.query("insert into storage.objects(bucket_id,name) values('moderation-captured-media',$1)",[c.file]),/revived/)
      assert.equal(await f.scalar('select state from private.bunny_media_removals where id=$1',[plan.bunny_assets[0].removal_id]),'removed')
    })

    await t.test('shared video is retained until the final case commits, including overlapping purges', async () => {
      const video=randomUUID()
      const a=await f.addCase({video}), b=await f.addCase({video})
      await f.prepare(a.id); await f.prepare(b.id)
      const first=await f.claim(a.id)
      assert.deepEqual(first.bunny_assets,[])
      const last=await f.claim(b.id)
      assert.equal(last.bunny_assets.length,1,'last committing case owns the external removal')
      await finish(first)
      await finish(last)
      assert.equal(await f.scalar('select count(*)::int from private.bunny_media_removals where asset_id=$1 and state=$2',[video,'removed']),1)
    })

    await t.test('legacy NULL-resolved case finalizes after FK anonymization changes updated_at', async () => {
      const c=await f.addCase({file:true})
      // Set up an actual legacy fallback timestamp without the normal update
      // trigger rewriting it; subsequent anonymization uses the real trigger.
      await f.role('postgres')
      await f.db.exec('alter table public.moderation_cases disable trigger update_moderation_cases_updated_at')
      await f.query("update public.moderation_cases set resolved_at=null,updated_at=now()-interval '100 days' where id=$1",[c.id])
      await f.db.exec('alter table public.moderation_cases enable trigger update_moderation_cases_updated_at')
      await f.role('service_role')
      await f.prepare(c.id)
      const plan=await f.claim(c.id)
      await f.query('update public.moderation_cases set subject_user_id=null where id=$1',[c.id])
      assert.equal(await f.scalar("select updated_at>now()-interval '1 minute' from public.moderation_cases where id=$1",[c.id]),true)
      await finish(plan)
      assert.equal(await f.scalar('select count(*)::int from public.moderation_cases where id=$1',[c.id]),0)
    })

    await t.test('ordinary ownership survives retention and references arriving after commit cannot gain playback authority', async () => {
      const registered=await f.addCase({video:randomUUID()})
      await f.query("insert into private.bunny_media_assets values('123',$1,$2,'shadow_pin_image',$3)",[registered.video,f.owner,randomUUID()])
      await f.prepare(registered.id)
      const skipped=await f.claim(registered.id)
      assert.equal(skipped.bunny_assets.length,0)
      await finish(skipped)
      assert.equal(await f.scalar('select count(*)::int from private.bunny_media_assets where asset_id=$1',[registered.video]),1)
      const c=await f.addCase({video:randomUUID()})
      await f.prepare(c.id)
      const plan=await f.claim(c.id)
      await assert.rejects(f.query("insert into private.bunny_media_assets values('123',$1,$2,'shadow_pin_image',$3)",[c.video,f.owner,randomUUID()]),/removal has already started/)
      const late=await f.addCase({video:c.video})
      assert.equal(await f.scalar("select status from private.moderation_media_assets where case_id=$1",[late.id]),'unavailable')
      assert.equal(await f.scalar("select error_code from private.moderation_media_assets where case_id=$1",[late.id]),'source_removal_in_progress')
      await finish(plan)
    })

    await t.test('another case pending a source copy blocks the entire exact file claim', async () => {
      const original=await f.addCase({attachment:true})
      const other=await f.addCase()
      const media=randomUUID()
      const object=await f.scalar('select id from storage.objects where name=$1',[original.attachment])
      await f.query("insert into private.moderation_media_assets(id,case_id,report_id,evidence_id,media_key,source_owner_id,kind,provider,status,source_bucket,source_path,source_object_id,storage_path) values($1,$2,$3,$4,'file',$5,'image','storage','pending','moderation-evidence',$6,$7,$8)",[media,other.id,other.report,other.evidence,f.owner,original.attachment,object,'captured/'+other.id+'/'+media])
      await f.prepare(original.id)
      await assert.rejects(f.claim(original.id),/Another case must capture/)
      assert.equal(await f.scalar('select count(*)::int from private.moderation_storage_removals where case_id=$1',[original.id]),0)
      assert.equal(await f.scalar('select count(*)::int from storage.objects where name=$1',[original.attachment]),1)
    })

    await t.test('hold racing between preparation and claim wins and no external remover runs', async () => {
      const c=await f.addCase({file:true,video:randomUUID()})
      let removals=0
      await assert.rejects(runModerationRetention({
        execute:true,caseIds:[c.id],validateProvider:()=>{},
        rpc:async(name,args)=>{
          const result=await f.rpc(name,args)
          if(name==='prepare_moderation_retention_purge') await f.hold(c.id)
          return result
        },
        removeStorage:async()=>{removals++},removeBunny:async()=>{removals++},
      }),/cancelled/)
      assert.equal(removals,0)
    })

    await t.test('hold during an unknown provider request fails explicitly; exact retry completes without a new claim', async () => {
      const c=await f.addCase({video:randomUUID()})
      let began
      const started=new Promise(resolve=>{began=resolve})
      let fail
      const response=new Promise((resolve,reject)=>{fail=reject})
      const pending=runModerationRetention({
        execute:true,caseIds:[c.id],rpc:f.rpc,validateProvider:()=>{},removeStorage:f.removeStorage,
        removeBunny:async()=>{began();await response},
      })
      const failed=assert.rejects(pending,/Synthetic response lost/)
      await started
      const before=await f.claim(c.id)
      await assert.rejects(f.hold(c.id),/committed/)
      await assert.rejects(f.query("update public.moderation_cases set status='waiting' where id=$1",[c.id]),/committed/)
      fail(new Error('Synthetic response lost'))
      await failed
      assert.equal(await f.scalar('select state from private.bunny_media_removals where id=$1',[before.bunny_assets[0].removal_id]),'pending')
      let retries=0
      const result=await runModerationRetention({
        execute:true,caseIds:[c.id],rpc:f.rpc,validateProvider:()=>{},removeStorage:f.removeStorage,
        removeBunny:async asset=>{assert.equal(asset.removal_id,before.bunny_assets[0].removal_id);retries++},
      })
      assert.equal(result.completed,1)
      assert.equal(retries,1)
      assert.equal(await f.scalar('select state from private.bunny_media_removals where id=$1',[before.bunny_assets[0].removal_id]),'removed')
    })
  } finally { await f.db.close() }
})

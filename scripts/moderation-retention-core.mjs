import assert from 'node:assert/strict'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fileKey = item => item.bucket + '\n' + item.path
const videoKey = item => item.library_id + '\n' + item.asset_id
const sorted = (values, key) => values.map(key).sort()

function validatePlan(plan, caseId, committed = false) {
  assert.equal(plan.protocol, 2, 'Durable retention protocol 2 is required')
  assert.equal(plan.case_id, caseId, 'Purge response must match the exact reviewed case')
  for (const field of ['storage', 'bunny_assets', 'bunny_candidates', 'report_ids', 'action_ids']) {
    assert(Array.isArray(plan[field]), 'Invalid retained ' + field + ' manifest')
  }
  for (const item of plan.storage) {
    assert(['moderation-evidence', 'moderation-captured-media'].includes(item.bucket), 'Unexpected evidence bucket')
    assert(typeof item.path === 'string' && item.path.length >= 3 && item.path.length <= 1024
      && !/[\u0000-\u001f\u007f\\]/.test(item.path)
      && !item.path.split('/').some(part => !part || part === '.' || part === '..'), 'Unexpected evidence path')
    if (item.bucket === 'moderation-captured-media') {
      assert(item.path.startsWith('captured/' + caseId + '/'), 'Captured evidence must belong to the reviewed case')
    }
    if (committed) assert(UUID.test(item.removal_id ?? ''), 'Exact Storage removal claim is required')
  }
  for (const item of [...plan.bunny_assets, ...plan.bunny_candidates]) {
    assert(/^[1-9][0-9]{0,19}$/.test(item.library_id ?? '') && UUID.test(item.asset_id ?? ''), 'Unexpected retained video identity')
  }
  if (committed) {
    assert(typeof plan.committed_at === 'string' && Number.isFinite(Date.parse(plan.committed_at)), 'A committed removal boundary is required')
    for (const item of plan.bunny_assets) assert(UUID.test(item.removal_id ?? ''), 'Exact provider removal claim is required')
  }
  assert.equal(new Set(plan.storage.map(fileKey)).size, plan.storage.length, 'Duplicate evidence resource')
  assert.equal(new Set(plan.bunny_assets.map(videoKey)).size, plan.bunny_assets.length, 'Duplicate provider resource')
  return plan
}

function validateCommit(prepared, committed) {
  validatePlan(committed, prepared.case_id, true)
  assert.deepEqual(sorted(committed.storage, fileKey), sorted(prepared.storage, fileKey), 'Committed evidence differs from the reviewed case')
  assert.deepEqual([...committed.report_ids].sort(), [...prepared.report_ids].sort(), 'Committed reports differ from the reviewed case')
  assert.deepEqual([...committed.action_ids].sort(), [...prepared.action_ids].sort(), 'Committed actions differ from the reviewed case')
  const candidates = new Set(prepared.bunny_candidates.map(videoKey))
  assert(committed.bunny_assets.every(item => candidates.has(videoKey(item))), 'Provider claim is outside the reviewed case')
  return committed
}

/**
 * Only the committed, server-derived manifest can reach the injected removers.
 * Each external failure leaves durable claims intact; there is no cancellation,
 * expiration or unsafe fallback after the irreversible boundary.
 */
export async function runModerationRetention({
  rpc, removeStorage, removeBunny, validateProvider, caseIds = [], execute = false, log = () => {},
}) {
  assert(caseIds.every(id => UUID.test(id ?? '')), 'Every case ID must be a UUID')
  assert.equal(new Set(caseIds).size, caseIds.length, 'Case IDs must be unique')
  if (execute) {
    assert(caseIds.length >= 1 && caseIds.length <= 50, 'Execution requires 1 to 50 explicitly reviewed case IDs')
    assert.equal(await rpc('moderation_retention_claim_protocol', {}), 2, 'Durable retention claims must be installed before any evidence removal')
  }
  const plans = await rpc('prepare_moderation_retention_purge', { target_case_ids: caseIds.length ? caseIds : null, dry_run: !execute })
  assert(Array.isArray(plans), 'Invalid reviewed case manifest')
  if (execute) assert.deepEqual(plans.map(plan => plan.case_id).sort(), [...caseIds].sort(), 'Every explicit case must have exactly one reviewed plan')
  for (const plan of plans) {
    validatePlan(plan, plan.case_id)
    log({ caseId: plan.case_id, eligibleAt: plan.eligible_at, reports: plan.report_ids.length,
      attachments: plan.storage.length, providerAssets: plan.bunny_assets.length, dryRun: !execute,
      committed: Boolean(plan.committed_at) })
  }
  if (!execute) return { dryRun: true, cases: plans.length }
  for (const prepared of plans) {
    // Validate credentials for every possible last-holder asset before committing.
    // An earlier case in this same allowlist may release a shared video first.
    for (const asset of prepared.bunny_candidates) validateProvider(asset)
    const plan = validateCommit(prepared, await rpc('claim_moderation_retention_purge', { target_case_id: prepared.case_id }))
    log({ caseId: plan.case_id, committed: true, message: 'Exact evidence removal is committed; later holds cannot cancel in-flight deletion.' })
    const recheck = async () => {
      const current = validateCommit(plan, await rpc('authorize_moderation_retention_batch', { target_case_id: plan.case_id }))
      assert.deepEqual(current.storage, plan.storage, 'Committed Storage claims changed')
      assert.deepEqual(current.bunny_assets, plan.bunny_assets, 'Committed provider claims changed')
    }
    for (const item of plan.storage) {
      await recheck()
      await removeStorage(item)
      await rpc('confirm_moderation_storage_removal', { target_case_id: plan.case_id, target_removal_id: item.removal_id })
    }
    for (const asset of plan.bunny_assets) {
      await recheck()
      validateProvider(asset)
      await removeBunny(asset)
      await rpc('confirm_moderation_provider_removal', {
        target_case_id: plan.case_id, target_library_id: asset.library_id, target_asset_id: asset.asset_id,
      })
    }
    await rpc('finish_moderation_retention_purge', { target_case_id: plan.case_id })
    log({ caseId: plan.case_id, completed: true })
  }
  return { dryRun: false, completed: plans.length }
}

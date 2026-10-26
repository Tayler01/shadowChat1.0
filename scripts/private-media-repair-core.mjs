import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { buildPrivateMediaRepairPlan } from './prepare-private-media-repair.mjs'

export const MAX_OBJECT_BYTES = 64 * 1024 * 1024
export const MAX_READ_BYTES = 512 * 1024 * 1024
export const sha256 = value => createHash('sha256').update(value).digest('hex')
const equal = (actual, expected, message) => assert.deepEqual(actual, expected, message)
const plain = value => JSON.parse(JSON.stringify(value))
const fingerprint = object => ({ id: object.id, version: object.version ?? null, updatedAt: object.updatedAt,
  size: object.size, contentType: object.contentType, owner: object.owner ?? null })
const objectKey = (bucket, path) => `${bucket}/${path}`
const rowCopies = (plan, row) => plan.copyRequests.map((copy, index) => ({ copy, index })).filter(({ copy }) =>
  row.authorId === copy.authorId && row.fields.some(field => field.newValue === copy.destinationKey
    || field.newValue === `${plan.projectUrl}/storage/v1/object/public/${copy.destinationBucket}/${copy.destinationKey.split('/').map(encodeURIComponent).join('/')}`))

/** SQL carried in the review plan is data only: recreate every operation first. */
export function bindRepairPlan({ inventoryBytes, planBytes, projectRef, inventorySha256, planSha256 }) {
  assert.match(projectRef, /^[a-z]{20}$/, 'An exact Supabase project ref is required')
  equal(sha256(inventoryBytes), inventorySha256, 'Inventory hash does not match the reviewed bytes')
  equal(sha256(planBytes), planSha256, 'Plan hash does not match the reviewed bytes')
  const inventory = JSON.parse(inventoryBytes)
  const plan = JSON.parse(planBytes)
  equal(plan, buildPrivateMediaRepairPlan(inventory), 'Plan differs from the validated inventory; regenerate and review it')
  equal(plan.projectUrl, `https://${projectRef}.supabase.co`, 'Project does not match the exact plan origin')
  assert(plan.copyRequests.length > 0 && plan.copyRequests.length <= 64 && plan.updates.length <= 64 && plan.authorizations.length <= 16, 'Repair exceeds bounded batch limits')
  for (const copy of plan.copyRequests) {
    assert(copy.sourceKey.length <= 1024 && copy.destinationKey.length <= 1024, 'Object path is too long')
    assert.notEqual(objectKey(copy.bucketId, copy.sourceKey), objectKey(copy.destinationBucket, copy.destinationKey), 'Repair must preserve an independent original')
  }
  for (const row of plan.updates) {
    assert(row.fields.every(field => [field.oldValue, field.newValue].every(value => value === null || typeof value === 'string' && value.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(value))), 'Invalid repair field')
    assert(rowCopies(plan, row).length > 0, 'Row has no independent copies')
  }
  equal(new Set(plan.copyRequests.map(copy => objectKey(copy.destinationBucket, copy.destinationKey))).size, plan.copyRequests.length, 'Duplicate destinations')
  return { plan, projectRef, inventorySha256, planSha256 }
}

function rowState(row, actual) {
  assert(actual && actual.authorId === row.authorId, 'Repair row is missing or has a different owner')
  if (row.fields.every(field => actual.values[field.field] === field.oldValue)) return 'old'
  if (row.fields.every(field => actual.values[field.field] === field.newValue)) return 'new'
  throw new Error('Repair row changed: stop and review a fresh inventory')
}

/** Adapter exposes copy and exact CAS only. There is intentionally no delete/upsert. */
export async function executeRepair(bound, adapter, { mode = 'verify', verification, verificationSha256, journal, checkpoint = async () => {}, now = Date.now() } = {}) {
  assert(['verify', 'apply'].includes(mode), 'Unknown repair mode')
  const { plan, projectRef, inventorySha256, planSha256 } = bound
  const gate = await adapter.gate()
  assert(gate?.verified === true && /^[a-f0-9]{64}$/.test(gate.digest), 'Required staged policy gate was not verified')
  if (mode === 'apply') {
    assert(verification?.version === 1 && verification.mode === 'verify' && verification.complete === true, 'Successful read-only verification evidence is required')
    for (const [key, expected] of Object.entries({ projectRef, inventorySha256, planSha256, gateDigest: gate.digest })) equal(verification[key], expected, `Verification ${key} mismatch`)
    assert(Number.isFinite(verification.checkedAt) && now >= verification.checkedAt && now - verification.checkedAt <= 86_400_000, 'Verification evidence must be no more than 24 hours old')
    assert.match(verificationSha256 ?? '', /^[a-f0-9]{64}$/, 'Bind the reviewed verification file hash')
    equal(Object.keys(verification.copies).length, plan.copyRequests.length, 'Verification copy inventory is incomplete')
  }
  const identity = { version: 1, mode, projectRef, inventorySha256, planSha256, gateDigest: gate.digest, ...(mode === 'apply' ? { verificationSha256 } : {}) }
  if (journal) for (const [key, expected] of Object.entries(identity)) equal(journal[key], expected, `Resume journal ${key} mismatch`)
  const result = journal ? plain(journal) : { ...identity, checkedAt: now, copies: {}, updates: {}, complete: false }
  let readBytes = 0
  const save = async () => { result.updatedAt = Date.now(); await checkpoint(plain(result)) }
  const checkedObject = async (bucket, path, expected, allowedOwner) => {
    const before = await adapter.object(bucket, path)
    assert(before, 'Required Storage object is missing')
    assert(Number.isSafeInteger(before.size) && before.size > 0 && before.size <= MAX_OBJECT_BYTES, 'Storage object size is outside bounded limits')
    if (expected) equal(fingerprint(before), fingerprint(expected), 'Storage object identity changed before reading')
    if (allowedOwner) assert(!before.owner || before.owner === allowedOwner, 'Destination belongs to another member')
    assert(readBytes + before.size <= MAX_READ_BYTES, 'Repair download budget exceeded')
    const digest = await adapter.hashObject(bucket, path, MAX_OBJECT_BYTES)
    readBytes += digest.size
    assert(readBytes <= MAX_READ_BYTES, 'Repair download budget exceeded')
    equal(digest.size, before.size, 'Storage bytes do not match recorded size')
    assert.match(digest.sha256, /^[a-f0-9]{64}$/, 'Storage hash was not confirmed')
    equal(fingerprint(await adapter.object(bucket, path) ?? {}), fingerprint(before), 'Storage object changed while reading')
    return { ...fingerprint(before), sha256: digest.sha256 }
  }
  await save()
  try {
    for (const [rowIndex, row] of plan.updates.entries()) {
      const state = rowState(row, await adapter.readRow(row))
      const related = rowCopies(plan, row)
      const confirmed = []
      for (const { copy, index } of related) {
        const reviewed = verification?.copies[index]
        // After an interrupted successful CAS, the old reference may no longer
        // be visible. Resume needs no copy: verify only the exact independent bytes.
        if (mode === 'apply' && state === 'new') {
          assert(reviewed?.source?.sha256, 'Resume lacks reviewed source bytes')
          const destination = await checkedObject(copy.destinationBucket, copy.destinationKey, undefined, copy.authorId)
          equal(destination.sha256, reviewed.source.sha256, 'Applied destination differs from reviewed bytes')
          equal(destination.size, reviewed.source.size, 'Applied destination size differs')
          equal(destination.contentType, reviewed.source.contentType, 'Applied destination content type differs')
          result.copies[index] = { source: reviewed.source, destination, state: 'verified' }
          confirmed.push({ copy, source: reviewed.source, destination })
          await save()
          continue
        }
        const proof = await adapter.prove(copy, row)
        assert(proof?.source, 'Source is not visible to the repair author')
        rowState(row, proof.row)
        const source = await checkedObject(copy.bucketId, copy.sourceKey, proof.source)
        if (mode === 'apply') equal(source, reviewed?.source, 'Source changed since reviewed verification')
        const existing = await adapter.object(copy.destinationBucket, copy.destinationKey)
        if (mode === 'apply' && !existing) {
          // No other work may intervene between this author-context visibility
          // proof and the non-overwriting Storage copy request.
          result.copies[index] = { source, state: 'copy-requested' }
          await save()
          const immediate = await adapter.prove(copy, row)
          assert(immediate?.source, 'Source visibility was revoked before copying')
          equal(fingerprint(immediate.source), fingerprint(source), 'Source changed before copying')
          equal(rowState(row, immediate.row), 'old', 'Row changed before copying')
          // Any error is ambiguous, including a lost successful response. Inspect
          // the exact destination, never retry as an overwrite or delete anything.
          try { await adapter.copy(copy) } catch { /* Destination verification below decides. */ }
        }
        const destination = (mode === 'apply' || existing)
          ? await checkedObject(copy.destinationBucket, copy.destinationKey, existing, copy.authorId) : null
        if (destination) {
          equal(destination.sha256, source.sha256, 'Destination conflicts with the exact source bytes')
          equal(destination.size, source.size, 'Destination size differs from the source')
          equal(destination.contentType, source.contentType, 'Destination content type differs')
        }
        if (mode === 'apply') {
          const afterProof = await adapter.prove(copy, row)
          assert(afterProof?.source, 'Source visibility was revoked after copying')
          equal(fingerprint(afterProof.source), fingerprint(source), 'Source changed after copying')
          rowState(row, afterProof.row)
          const after = await checkedObject(copy.bucketId, copy.sourceKey, source)
          equal(after, source, 'Original changed during copy')
        }
        result.copies[index] = { source, destination, state: mode === 'apply' ? 'verified' : 'reviewed' }
        confirmed.push({ copy, source, destination })
        await save()
      }
      if (mode === 'apply' && state === 'old') {
        // Re-read every destination just before the guarded transaction. SQL also
        // locks and checks identities and re-proves source/row RLS before the CAS.
        for (const item of confirmed) equal(await checkedObject(item.copy.destinationBucket, item.copy.destinationKey, item.destination, row.authorId), item.destination, 'Destination changed before CAS')
        const ids = await adapter.compareAndSwap(row, confirmed)
        equal(ids, [row.rowId], 'CAS must return exactly the one reviewed row')
      }
      if (mode === 'apply') equal(rowState(row, await adapter.readRow(row)), 'new', 'CAS readback was not confirmed')
      result.updates[rowIndex] = { rowId: row.rowId, state: mode === 'apply' ? 'complete' : state }
      await save()
    }
    if (mode === 'apply') {
      result.plannedRowsComplete = true
      const inventory = await adapter.inventory()
      assert(inventory?.version === 1 && inventory.projectUrl === plan.projectUrl
        && Array.isArray(inventory.messageReferences) && Array.isArray(inventory.categoryCovers), 'Final inventory was not confirmed')
      result.finalInventory = inventory
      assert(inventory.messageReferences.length === 0 && inventory.categoryCovers.length === 0, 'Final inventory has unresolved references; review a new plan without extending this run')
    }
    result.complete = true
    result.readBytes = readBytes
    delete result.error
    await save()
    return result
  } catch (error) {
    result.complete = false
    // Deliberately omit backend error bodies, URLs, credentials and row values.
    result.error = 'Repair stopped. Preserve originals and copies; review the failing check before resuming.'
    await save()
    throw error
  }
}

// E literals are safe even if the server parses the complete batch before its
// SET standard_conforming_strings statement takes effect.
const quote = value => value === null ? 'null' : `E'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`
const authorColumn = table => ({ messages: 'user_id', dm_messages: 'sender_id', shadow_pin_categories: 'creator_id' })[table]
const rowSelect = row => `select jsonb_build_object('authorId',${authorColumn(row.table)},'values',jsonb_build_object(${row.fields.flatMap(field => [quote(field.field), field.field]).join(',')})) from public.${row.table} where id=${quote(row.rowId)}`
const objectSelect = (bucket, path) => `select jsonb_build_object('id',id,'version',version,'updatedAt',updated_at,'size',(metadata->>'size')::bigint,'contentType',lower(split_part(coalesce(metadata->>'mimetype',metadata->>'contentType','application/octet-stream'),';',1)),'owner',coalesce(nullif(owner_id,''),owner::text)) from storage.objects where bucket_id=${quote(bucket)} and name=${quote(path)}`
const claims = (projectUrl, authorId) => `select set_config('request.jwt.claims',${quote(JSON.stringify({ sub: authorId, role: 'authenticated', iss: `${projectUrl}/auth/v1` }))},true); select set_config('request.jwt.claim.sub',${quote(authorId)},true); select set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;`
const begin = 'begin; set local statement_timeout=15000; set local standard_conforming_strings=on;'
export const readRowSql = row => `${begin} select (${rowSelect(row)}) as repair_result; commit;`
export const objectSql = (bucket, path) => `${begin} select (${objectSelect(bucket, path)}) as repair_result; commit;`
export const proveSql = (projectUrl, copy, row) => {
  const statement = `repair_proof_${randomUUID().replaceAll('-', '')}`
  const setting = `shadowchat.${statement}`
  // Resolve the private helper OID before switching role, without granting schema
  // USAGE. Keep RLS tables outside PREPARE: their role-sensitive rewrite would
  // reparse the private schema reference. The pinned non-inlined invoker helper
  // still reads its canonical tables as authenticated when EXECUTE runs.
  return `${begin} set transaction read only;
prepare ${statement} as select set_config(${quote(setting)},case when private.can_read_member_media(${quote(copy.bucketId)},${quote(copy.sourceKey)}) then 'true' else 'false' end,true);
${claims(projectUrl, copy.authorId)} execute ${statement};
select jsonb_build_object('source',case when current_setting(${quote(setting)})='true' then (${objectSelect(copy.bucketId, copy.sourceKey)}) else null end,'row',(${rowSelect(row)})) as repair_result;
reset role; deallocate ${statement}; commit;`
}
export const inventorySql = (projectUrl, source) => {
  assert(/\bas inventory;\s*$/.test(source), 'Unexpected canonical inventory SQL')
  return `${begin} set transaction read only; select set_config('shadowchat.private_media_project_url',${quote(projectUrl)},true);\n${source.replace(/\bas inventory;\s*$/, 'as repair_result;')}\nrollback;`
}

export function compareAndSwapSql(projectUrl, row, confirmed) {
  const statement = `repair_authorize_${randomUUID().replaceAll('-', '')}`
  const guards = row.fields.map(field => `${field.field} is not distinct from ${quote(field.oldValue)}`).join(' and ')
  const changes = row.fields.map(field => `${field.field}=${quote(field.newValue)}`).join(',')
  const lockAndCheck = ({ copy, source, destination }) => [
    [copy.bucketId, copy.sourceKey, source], [copy.destinationBucket, copy.destinationKey, destination],
  ].map(([bucket, path, object]) => `perform 1 from storage.objects where bucket_id=${quote(bucket)} and name=${quote(path)} and id=${quote(object.id)} and version is not distinct from ${quote(object.version)} and updated_at=${quote(object.updatedAt)} and (metadata->>'size')::bigint=${object.size} for share; if not found then raise exception 'Storage identity changed before repair CAS'; end if;`).join('\n')
  const canonical = confirmed.map(({ copy }) => `private.can_read_member_media(${quote(copy.bucketId)},${quote(copy.sourceKey)})`).join(' and ') || 'false'
  const storageVisible = confirmed.map(({ copy }) => `if not exists(select 1 from storage.objects where bucket_id=${quote(copy.bucketId)} and name=${quote(copy.sourceKey)}) then raise exception 'Source is not visible to its repair author'; end if;`).join('\n')
  const body = `declare affected integer; authorized boolean; begin
  ${confirmed.map(lockAndCheck).join('\n')}
  ${claims(projectUrl, row.authorId).replaceAll('select set_config(', 'perform set_config(')}
  if not exists(select 1 from public.${row.table} where id=${quote(row.rowId)} and ${authorColumn(row.table)}=${quote(row.authorId)}) then raise exception 'Repair row is not visible to its author'; end if;
  execute 'execute ${statement}' into authorized;
  if authorized is distinct from true then raise exception 'Source is not visible to its repair author'; end if;
  ${storageVisible}
  reset role;
  update public.${row.table} set ${changes} where id=${quote(row.rowId)} and ${authorColumn(row.table)}=${quote(row.authorId)} and ${guards};
  get diagnostics affected = row_count;
  if affected<>1 then raise exception 'Repair CAS expected exactly one unchanged row'; end if;
end`
  let index = 0
  while (body.includes(`$repair${index}$`)) index++
  const delimiter = `$repair${index}$`
  return `${begin}\nprepare ${statement} as select ${canonical};\ndo ${delimiter}${body}${delimiter};\ndeallocate ${statement}; select jsonb_build_array(${quote(row.rowId)}::uuid) as repair_result; commit;`
}

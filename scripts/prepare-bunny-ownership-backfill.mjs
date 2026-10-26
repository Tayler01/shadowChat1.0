/** Local, write-once ownership receipts and guarded SQL. This tool never writes
 * to Supabase or Bunny. `provider-check` performs only exact metadata GETs.
 * Review files and generated SQL contain private identifiers: keep them in output/.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const LIBRARY = /^[0-9]+$/
const HASH = /^[0-9a-f]{64}$/
const CONFIRMATION = 'All listed ownership mappings are correct'
export const PROVIDER_PROOF_MAX_AGE_MS = 15 * 60 * 1000
const sources = {
  shadow_pin_image: {
    table: 'shadow_pin_images', owner: 'creator_id', status: 'processing_status',
    fields: ['id', 'creator_id', 'provider', 'provider_asset_id', 'provider_playback_id', 'provider_payload', 'media_type', 'deleted_at', 'processing_status', 'video_embed_url', 'video_hls_url', 'video_playback_url', 'video_preview_url', 'image_url', 'image_path', 'thumbnail_url', 'thumbnail_path', 'medium_url', 'medium_path'],
  },
  shadow_pin_draft_asset: {
    table: 'shadow_pin_draft_assets', owner: 'creator_id', status: 'state',
    fields: ['id', 'creator_id', 'provider', 'provider_asset_id', 'provider_payload', 'deleted_at', 'state', 'video_embed_url', 'video_hls_url', 'video_playback_url', 'video_preview_url'],
  },
  shado_tv_asset: {
    table: 'shado_tv_videos', owner: 'created_by', status: 'upload_status',
    fields: ['id', 'created_by', 'provider', 'provider_asset_id', 'provider_payload', 'deleted_at', 'upload_status', 'embed_url', 'asset_url', 'trailer_asset_url'],
  },
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v)
// Explicit escape strings remain safe even when a client parses an entire
// multi-statement file before its SET standard_conforming_strings takes effect.
const sqlString = value => `E'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`
const jsonSql = value => `${sqlString(JSON.stringify(value))}::jsonb`
const rowKey = row => `${row.sourceType}:${row.sourceId}`
const tupleKey = row => `${rowKey(row)}:${row.libraryId}:${row.assetId}`
const sorted = rows => [...rows].sort((a, b) => tupleKey(a).localeCompare(tupleKey(b)))
const fail = message => { throw new Error(message) }
const assert = (condition, message) => { if (!condition) fail(message) }
const readJson = async file => JSON.parse(await readFile(file, 'utf8'))
const writeJson = (file, value) => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
const projection = type => `jsonb_build_object(${sources[type].fields.flatMap(field => [sqlString(field), `to_jsonb(s)->${sqlString(field)}`]).join(',')})`

export function approvedMappings(review) {
  assert(review?.version === 1 && /^[a-z]{20}$/.test(review.projectRef) && LIBRARY.test(review.libraryId), 'Invalid review identity')
  const mappings = []
  const ownerByAsset = new Map()
  const objectIds = new Set()
  for (const group of review.groups ?? []) {
    assert(UUID.test(group.claimedOwnerId), 'Invalid claimed owner')
    for (const object of group.objects ?? []) {
      assert(UUID.test(object.assetId) && object.libraryId === review.libraryId && object.claimedOwnerId === group.claimedOwnerId, 'Review object identity mismatch')
      assert(!objectIds.has(object.assetId), 'Duplicate provider object in review')
      objectIds.add(object.assetId)
      const previous = ownerByAsset.get(object.assetId)
      assert(!previous || previous === group.claimedOwnerId, 'Conflicting reviewed ownership')
      ownerByAsset.set(object.assetId, group.claimedOwnerId)
      for (const reference of object.references ?? []) {
        assert(Object.hasOwn(sources, reference.sourceType) && UUID.test(reference.sourceId), 'Invalid reviewed source')
        mappings.push({
          libraryId: object.libraryId, assetId: object.assetId, ownerId: group.claimedOwnerId,
          sourceType: reference.sourceType, sourceId: reference.sourceId,
          status: reference.status, deletedAt: reference.deletedAt,
          recordedLibraryId: reference.recordedLibraryId, embeddedIdentity: reference.embeddedIdentity,
        })
      }
    }
  }
  assert(new Set(mappings.map(tupleKey)).size === mappings.length, 'Duplicate reviewed source tuple')
  assert(objectIds.size === review.summary?.existingProviderObjects && mappings.length === review.summary?.canonicalSourceAssociations, 'Review counts do not match its contents')
  assert(mappings.length > 0, 'Empty ownership approval')
  return sorted(mappings)
}

export async function createAttestation(markdownPath, reviewPath, destination, confirmation, now = new Date()) {
  assert(confirmation === CONFIRMATION, 'Exact operator confirmation is required')
  const markdown = await readFile(markdownPath)
  const reviewBytes = await readFile(reviewPath)
  const review = JSON.parse(reviewBytes)
  const mappings = approvedMappings(review)
  for (const mapping of mappings) {
    assert(markdown.includes(mapping.ownerId) && markdown.includes(mapping.sourceId) && markdown.includes(mapping.assetId), 'Markdown and structured review differ')
  }
  const receipt = {
    version: 1, recordedAt: now.toISOString(), authority: 'Explicit workspace-owner confirmation relayed by the parent task',
    confirmation, scope: 'Only the exact reviewed existing provider objects and source associations; no deployment or provider-setting change',
    projectRef: review.projectRef, libraryId: review.libraryId,
    reviewMarkdownSha256: sha256(markdown), reviewJsonSha256: sha256(reviewBytes),
    mappingsSha256: sha256(stable(mappings)),
    counts: { providerObjects: review.summary.existingProviderObjects, sourceAssociations: mappings.length, excludedLegacy404Rows: review.legacyDeleted404History?.length ?? 0 },
    mappings,
  }
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`)
  const digest = sha256(bytes)
  await mkdir(destination, { recursive: true })
  const packet = path.join(destination, digest)
  await mkdir(packet) // Existing receipts are never replaced, even by an identical request.
  await writeFile(path.join(packet, 'review.md'), markdown, { flag: 'wx' })
  await writeFile(path.join(packet, 'review.json'), reviewBytes, { flag: 'wx' })
  await writeFile(path.join(packet, 'attestation.json'), bytes, { flag: 'wx' })
  await writeFile(path.join(packet, 'attestation.sha256'), `${digest}\n`, { flag: 'wx' })
  return { packet, digest, counts: receipt.counts }
}

export async function readAttestation(packet) {
  const bytes = await readFile(path.join(packet, 'attestation.json'))
  const digest = (await readFile(path.join(packet, 'attestation.sha256'), 'utf8')).trim()
  assert(HASH.test(digest) && sha256(bytes) === digest && path.basename(packet) === digest, 'Attestation content or path hash changed')
  const receipt = JSON.parse(bytes)
  const reviewBytes = await readFile(path.join(packet, 'review.json'))
  const markdown = await readFile(path.join(packet, 'review.md'))
  assert(sha256(reviewBytes) === receipt.reviewJsonSha256 && sha256(markdown) === receipt.reviewMarkdownSha256, 'Reviewed snapshot changed')
  const mappings = approvedMappings(JSON.parse(reviewBytes))
  assert(receipt.confirmation === CONFIRMATION && receipt.mappingsSha256 === sha256(stable(mappings)) && stable(mappings) === stable(receipt.mappings), 'Attestation mappings changed')
  return { receipt, digest }
}

export function sourceReadQuery(receipt) {
  const selects = Object.entries(sources).map(([type, source]) => {
    const ids = [...new Set(receipt.mappings.filter(m => m.sourceType === type).map(m => m.sourceId))]
    if (!ids.length) return null
    return `select ${sqlString(type)}::text as "sourceType",s.id::text as "sourceId",${projection(type)} as snapshot from public.${source.table} s where s.id in (${ids.map(sqlString).join(',')})`
  }).filter(Boolean)
  return `begin transaction read only;\nset local standard_conforming_strings=on;\nselect clock_timestamp() as "observedAt",${sqlString(receipt.projectRef)} as "projectRef",coalesce(jsonb_agg(row_data order by row_data->>'sourceType',row_data->>'sourceId'),'[]'::jsonb) as rows from (select to_jsonb(q) as row_data from (${selects.join('\nunion all\n')}) q) collected;\nrollback;\n`
}

const parseEmbed = value => {
  const match = typeof value === 'string' && value.match(/^https:\/\/(?:player|iframe)\.mediadelivery\.net\/embed\/([0-9]+)\/([0-9a-f-]{36})(?:\?|$)/)
  return match && UUID.test(match[2]) ? { libraryId: match[1], assetId: match[2] } : null
}
const sameTime = (a, b) => a === b || (a != null && b != null && new Date(a).valueOf() === new Date(b).valueOf())
export function validateCurrentSources(receipt, sourceRead) {
  assert(sourceRead.projectRef === receipt.projectRef && Number.isFinite(Date.parse(sourceRead.observedAt)), 'Source check project or timestamp mismatch')
  const rows = new Map((sourceRead.rows ?? []).map(row => [rowKey(row), row]))
  const expectedRows = new Set(receipt.mappings.map(rowKey))
  assert(rows.size === sourceRead.rows.length && rows.size === expectedRows.size && [...rows.keys()].every(key => expectedRows.has(key)), 'Reviewed source missing or extra source returned')
  for (const mapping of receipt.mappings) {
    const row = rows.get(rowKey(mapping))?.snapshot
    const source = sources[mapping.sourceType]
    assert(row?.id === mapping.sourceId && row[source.owner] === mapping.ownerId && row.provider === 'bunny_stream', 'Current source ownership/provider drift')
    assert(row[source.status] === mapping.status && sameTime(row.deleted_at, mapping.deletedAt), 'Current source lifecycle drift')
    const bunny = row.provider_payload?.bunny_stream ?? {}
    let library
    let embedded
    if (mapping.sourceType === 'shado_tv_asset') {
      const currentAssets = [row.provider_asset_id, bunny.episode?.videoId, bunny.trailer?.videoId].filter(Boolean)
      const approvedAssets = receipt.mappings.filter(item => rowKey(item) === rowKey(mapping)).map(item => item.assetId)
      assert(currentAssets.includes(mapping.assetId) && currentAssets.every(asset => approvedAssets.includes(asset)), 'Current TV asset identity drift')
      const trailer = bunny.trailer?.videoId === mapping.assetId && row.provider_asset_id !== mapping.assetId && bunny.episode?.videoId !== mapping.assetId
      library = (trailer ? bunny.trailer?.libraryId : bunny.episode?.libraryId) ?? bunny.libraryId ?? null
      embedded = parseEmbed(trailer ? row.trailer_asset_url : row.embed_url)
    } else {
      assert(row.provider_asset_id === mapping.assetId, 'Current source asset identity drift')
      library = bunny.libraryId ?? null
      embedded = parseEmbed(row.video_embed_url)
    }
    assert((library == null || String(library) === mapping.libraryId) && (!embedded || (embedded.libraryId === mapping.libraryId && embedded.assetId === mapping.assetId)), 'Current source library/embed mismatch')
    assert((library == null ? null : String(library)) === (mapping.recordedLibraryId ?? null) && stable(embedded) === stable(mapping.embeddedIdentity ?? null), 'Current source declared identity drift')
  }
  return [...rows.values()].sort((a, b) => rowKey(a).localeCompare(rowKey(b)))
}

export async function checkProviders(receipt, { apiKey, libraryId, fetchImpl = fetch } = {}) {
  assert(apiKey && libraryId === receipt.libraryId, 'Configured provider library or credential is unavailable')
  const assets = [...new Set(receipt.mappings.map(m => m.assetId))].sort()
  const checks = []
  for (const assetId of assets) {
    const response = await fetchImpl(`https://video.bunnycdn.com/library/${libraryId}/videos/${assetId}`, {
      method: 'GET', headers: { AccessKey: apiKey, accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20_000),
    })
    let data = null
    if (response.ok) data = await response.json()
    else await response.body?.cancel()
    checks.push({ assetId, libraryId, httpStatus: response.status, guidMatches: data?.guid === assetId, libraryMatches: String(data?.videoLibraryId) === libraryId })
  }
  return { version: 1, checkedAt: new Date().toISOString(), projectRef: receipt.projectRef, libraryId, scope: 'Exact metadata GETs only; no media bodies or provider changes', checks }
}

export function validateProviderCheck(receipt, proof, now = new Date()) {
  const checkedAt = Date.parse(proof.checkedAt)
  assert(proof.projectRef === receipt.projectRef && proof.libraryId === receipt.libraryId && Number.isFinite(checkedAt) && checkedAt <= now.valueOf() && now.valueOf() - checkedAt <= PROVIDER_PROOF_MAX_AGE_MS, 'Provider proof is stale, future-dated, or for another project/library')
  const assets = new Set(receipt.mappings.map(m => m.assetId))
  assert(proof.checks?.length === assets.size && new Set(proof.checks.map(c => c.assetId)).size === assets.size, 'Provider proof coverage differs from approval')
  assert(proof.checks.every(c => assets.has(c.assetId) && c.libraryId === receipt.libraryId && c.httpStatus === 200 && c.guidMatches === true && c.libraryMatches === true), 'Provider object missing or identity mismatch')
}

const snapshotSelect = row => `select ${projection(row.sourceType)} into actual from public.${sources[row.sourceType].table} s where s.id=${sqlString(row.sourceId)}::uuid for update;`
export function buildBackfill({ receipt, digest }, sourceRead, proof, now = new Date()) {
  assert(HASH.test(digest), 'Invalid attestation hash')
  const rows = validateCurrentSources(receipt, sourceRead)
  validateProviderCheck(receipt, proof, now)
  const expiresAt = new Date(Date.parse(proof.checkedAt) + PROVIDER_PROOF_MAX_AGE_MS).toISOString()
  const tuples = receipt.mappings.map(m => ({ library_id: m.libraryId, asset_id: m.assetId, owner_id: m.ownerId, source_type: m.sourceType, source_id: m.sourceId }))
  const expected = `select * from jsonb_to_recordset(${jsonSql(tuples)}) as t(library_id text,asset_id uuid,owner_id uuid,source_type text,source_id uuid)`
  const snapshots = rows.map(row => `${snapshotSelect(row)}\n    if actual is distinct from ${jsonSql(row.snapshot)} then raise exception 'Reviewed source identity changed; nothing registered'; end if;`).join('\n    ')
  const driftChecks = rows.map(row => `select not exists(select 1 from public.${sources[row.sourceType].table} s where s.id=${sqlString(row.sourceId)}::uuid and ${projection(row.sourceType)}=${jsonSql(row.snapshot)}) as drift`).join('\nunion all\n')
  // Snapshots include historically client-editable JSON. A fixed dollar-quote
  // delimiter could be closed by that data even inside a SQL string literal.
  let bodyTag = '$bunny_backfill$'
  for (let suffix = 1; `${snapshots}${expected}`.includes(bodyTag); suffix++) bodyTag = `$bunny_backfill_${suffix}$`
  const sql = `-- STAGED ONLY. Apply through the authorized backend-first main release, after migrations.\n-- Verify the immutable receipt and refresh provider/source checks immediately before use.\n-- Explicit operator session acknowledgement required: SET shadowchat.bunny_backfill_attestation = '${digest}';\n-- Receipt SHA256 ${digest}; ${tuples.length} exact source associations.\nbegin;\nset local standard_conforming_strings=on;\nset local lock_timeout='5s';\nset local statement_timeout='30s';\ndo ${bodyTag}\ndeclare item record; actual jsonb;\nbegin\n  if current_setting('shadowchat.bunny_backfill_attestation',true) is distinct from '${digest}' then raise exception 'Exact attestation acknowledgement required'; end if;\n  if clock_timestamp() > ${sqlString(expiresAt)}::timestamptz then raise exception 'Provider proof expired; refresh read-only evidence and regenerate'; end if;\n  if to_regprocedure('public.register_bunny_media_asset(text,uuid,uuid,text,uuid)') is null or to_regprocedure('public.is_active_member_for_service(uuid)') is null or to_regclass('private.bunny_media_removals') is null or not exists(select 1 from pg_trigger where tgrelid=to_regclass('private.bunny_media_assets') and tgname='guard_bunny_media_registration' and tgenabled in ('O','A')) then raise exception 'Required provenance/removal migrations are absent'; end if;\n  -- The same sorted owner/asset locks serialize deletion, registration and report holds.\n  for item in select distinct owner_id from (${expected}) expected order by owner_id loop\n    perform pg_advisory_xact_lock(hashtextextended('account-deletion:'||item.owner_id::text,0));\n    if not public.is_active_member_for_service(item.owner_id) then raise exception 'Reviewed owner is not active'; end if;\n  end loop;\n  for item in select distinct library_id,asset_id from (${expected}) expected order by library_id,asset_id loop\n    perform pg_advisory_xact_lock(hashtextextended('bunny-media:'||item.library_id||':'||item.asset_id::text,0));\n    if exists(select 1 from private.bunny_media_removals r where r.library_id=item.library_id and r.asset_id=item.asset_id) then raise exception 'Reviewed provider removal has started'; end if;\n  end loop;\n  -- Lock and compare every reviewed identity before any registration.\n  ${snapshots}\n  if exists(select 1 from (${expected}) e join private.bunny_media_assets a using(library_id,asset_id) where a.owner_id<>e.owner_id) then raise exception 'Conflicting trusted provider ownership'; end if;\n  for item in ${expected} loop\n    perform public.register_bunny_media_asset(item.library_id,item.asset_id,item.owner_id,item.source_type,item.source_id);\n  end loop;\n  if (select count(*) from (${expected}) e join private.bunny_media_assets a using(library_id,asset_id,owner_id,source_type,source_id)) <> ${tuples.length} then raise exception 'Incomplete exact registration'; end if;\nend;\n${bodyTag};\ncommit;\n`
  const verify = `-- READ ONLY. Exact reviewed registry coverage; all missing/conflicting/removing counts must be zero.\nbegin transaction read only;\nset local standard_conforming_strings=on;\nwith expected as (${expected}), source_checks as (${driftChecks})\nselect (select count(*)::int from source_checks where drift) as source_drift, ${tuples.length} as expected_associations,\n  count(*) filter(where a.asset_id is not null and a.owner_id=e.owner_id)::int as exact_registered,\n  count(*) filter(where a.asset_id is null)::int as missing,\n  count(*) filter(where a.asset_id is not null and a.owner_id<>e.owner_id)::int as conflicting,\n  count(*) filter(where exists(select 1 from private.bunny_media_assets other where other.library_id=e.library_id and other.asset_id=e.asset_id and other.owner_id<>e.owner_id))::int as cross_source_owner_conflicts,\n  count(*) filter(where exists(select 1 from private.bunny_media_removals r where r.library_id=e.library_id and r.asset_id=e.asset_id))::int as removal_started,\n  count(*) filter(where not public.is_active_member_for_service(e.owner_id))::int as inactive\nfrom expected e left join private.bunny_media_assets a using(library_id,asset_id,source_type,source_id);\nrollback;\n`
  return { sql, verify, manifest: { version: 1, attestationSha256: digest, projectRef: receipt.projectRef, libraryId: receipt.libraryId, generatedAt: now.toISOString(), providerCheckedAt: proof.checkedAt, expiresAt, sourceObservedAt: sourceRead.observedAt, sourceSnapshotSha256: sha256(stable(rows)), providerProofSha256: sha256(stable(proof)), approvedObjects: new Set(tuples.map(t => t.asset_id)).size, exactAssociations: tuples.length, sourceRows: rows.length, drift: [], applied: false, backfillSqlSha256: sha256(sql), verifySqlSha256: sha256(verify) } }
}

async function main(args) {
  const [command, ...rest] = args
  if (command === 'attest' && rest.length === 4) {
    console.log(JSON.stringify(await createAttestation(...rest)))
    return
  }
  if (command === 'source-query' && rest.length === 2) {
    const { receipt } = await readAttestation(rest[0])
    await writeFile(rest[1], sourceReadQuery(receipt), { flag: 'wx' })
    console.log('Read-only source query written.')
    return
  }
  if (command === 'provider-check' && rest.length === 2) {
    const { receipt } = await readAttestation(rest[0])
    const env = parseEnv(await readFile('.env', 'utf8'))
    const proof = await checkProviders(receipt, { apiKey: env.BUNNY_STREAM_API_KEY, libraryId: env.BUNNY_STREAM_LIBRARY_ID })
    await writeJson(rest[1], proof)
    console.log(JSON.stringify({ checks: proof.checks.length, matched: proof.checks.filter(c => c.httpStatus === 200 && c.guidMatches && c.libraryMatches).length }))
    return
  }
  if (command === 'prepare' && rest.length === 4) {
    const [packet, sourcePath, providerPath, destination] = rest
    const result = buildBackfill(await readAttestation(packet), await readJson(sourcePath), await readJson(providerPath))
    await mkdir(destination)
    await writeFile(path.join(destination, 'backfill.sql'), result.sql, { flag: 'wx' })
    await writeFile(path.join(destination, 'verify.sql'), result.verify, { flag: 'wx' })
    await writeJson(path.join(destination, 'manifest.json'), result.manifest)
    console.log(JSON.stringify(result.manifest))
    return
  }
  fail('Usage: attest review.md review.json receipt-parent "All listed ownership mappings are correct" | source-query receipt-dir output.sql | provider-check receipt-dir output.json | prepare receipt-dir source-read.json provider-check.json new-output-dir')
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1 })
}

/** Read-only release gate. Missing preparation stops publication before writes. */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseSupabaseQueryRows } from './supabase-query-output.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const blockingCounts = [
  'invalid_provider_associations', 'unregistered_provider_associations',
  'conflicting_provider_libraries', 'conflicting_provider_owners', 'live_provider_removal_conflicts',
  'message_fields_requiring_copy', 'category_paths_requiring_copy',
]

export function accountDeletionReleaseConfig(environment, linkedProject) {
  const projectRef = environment.SUPABASE_PROJECT_ID?.trim()
  const projectUrl = environment.SUPABASE_URL?.trim()?.replace(/\/$/, '')
  const libraryId = environment.BUNNY_STREAM_LIBRARY_ID?.trim()
  if (!/^[a-z]{20}$/.test(projectRef || '') || projectUrl !== `https://${projectRef}.supabase.co`) {
    throw new Error('Release gate requires matching SUPABASE_PROJECT_ID and exact SUPABASE_URL')
  }
  if (linkedProject?.trim() !== projectRef) throw new Error('Linked Supabase target does not match the release project')
  if (!/^[0-9]+$/.test(libraryId || '')) throw new Error('BUNNY_STREAM_LIBRARY_ID must identify the reviewed provider library')
  return { projectRef, projectUrl, libraryId }
}

export function buildAccountDeletionReadinessQuery(config) {
  // Values are strictly validated; only aggregate counts leave the database.
  accountDeletionReleaseConfig({ SUPABASE_PROJECT_ID: config.projectRef, SUPABASE_URL: config.projectUrl,
    BUNNY_STREAM_LIBRARY_ID: config.libraryId }, config.projectRef)
  return `begin transaction read only;
with raw_sources as (
  select 'shadow_pin_image'::text source_type,p.id source_id,p.creator_id owner_id,p.provider_asset_id asset_id,
    p.provider_payload->'bunny_stream'->>'libraryId' declared_library,p.video_embed_url embed_url,
    p.deleted_at is null as live
  from public.shadow_pin_images p where p.provider='bunny_stream' and p.provider_asset_id is not null
  union all
  select 'shadow_pin_draft_asset',d.id,d.creator_id,d.provider_asset_id,
    d.provider_payload->'bunny_stream'->>'libraryId',d.video_embed_url,
    d.deleted_at is null and d.state not in ('failed','superseded','deleted')
  from public.shadow_pin_draft_assets d where d.provider='bunny_stream' and d.provider_asset_id is not null
  union all
  select 'shado_tv_asset',v.id,v.created_by,a.asset_id,
    coalesce(a.library_id,v.provider_payload->'bunny_stream'->>'libraryId'),a.embed_url,v.deleted_at is null
  from public.shado_tv_videos v cross join lateral (values
    (v.provider_asset_id,v.provider_payload->'bunny_stream'->'episode'->>'libraryId',v.embed_url),
    (v.provider_payload->'bunny_stream'->'episode'->>'videoId',v.provider_payload->'bunny_stream'->'episode'->>'libraryId',v.embed_url),
    (v.provider_payload->'bunny_stream'->'trailer'->>'videoId',v.provider_payload->'bunny_stream'->'trailer'->>'libraryId',v.trailer_asset_url)
  ) a(asset_id,library_id,embed_url)
  where v.provider='bunny_stream' and a.asset_id is not null
), sources as (
  select source_type,source_id,owner_id,lower(asset_id) asset_id,bool_or(live) live,
    bool_or((nullif(declared_library,'') is not null and declared_library<>'${config.libraryId}')
      or (substring(embed_url from '^https://(?:player|iframe)\\.mediadelivery\\.net/embed/([0-9]+)/') is not null
        and substring(embed_url from '^https://(?:player|iframe)\\.mediadelivery\\.net/embed/([0-9]+)/')<>'${config.libraryId}')) library_conflict
  from raw_sources group by source_type,source_id,owner_id,lower(asset_id)
), messages as (
  select user_id author_id,file_url,audio_url,thumbnail_url,content,message_type from public.messages
  union all select sender_id,file_url,audio_url,thumbnail_url,content,message_type from public.dm_messages
), paths as (
  select author_id,regexp_match(split_part(v.url,'?',1),
    '/storage/v1/(?:object|render/image)/(?:public|sign|authenticated)/(chat-uploads|message-media|shadow-pin)/(.+)$') object
  from messages cross join lateral (values(file_url),(audio_url),(thumbnail_url),
    (case when message_type in ('image','audio','video','file') then content end)) v(url)
  where starts_with(v.url,'${config.projectUrl}/storage/v1/')
), category_paths as (
  select c.creator_id,p.kind,p.path from public.shadow_pin_categories c
  cross join lateral (values('image',c.image_path),('thumbnail',c.thumbnail_path),('medium',c.medium_path)) p(kind,path)
  where c.creator_id is not null and p.path not like c.creator_id::text||'/%'
    and (p.kind='image' or split_part(p.path,'/',1) ~* '^[0-9a-f-]{36}$')
    and exists(select 1 from storage.objects o where o.bucket_id='shadow-pin' and o.name=p.path)
)
select jsonb_build_object(
  'version',1,'project_ref','${config.projectRef}','library_id','${config.libraryId}',
  'provider_associations',(select count(*) from sources),
  'invalid_provider_associations',(select count(*) from sources where owner_id is null or asset_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  'unregistered_provider_associations',(select count(*) from sources s where not exists(select 1 from private.bunny_media_assets r
    where r.source_type=s.source_type and r.source_id=s.source_id and r.owner_id=s.owner_id
      and r.asset_id::text=s.asset_id and r.library_id='${config.libraryId}')),
  'conflicting_provider_libraries',(select count(*) from sources where library_conflict),
  'conflicting_provider_owners',(select count(*) from sources s where exists(select 1 from private.bunny_media_assets r
    where r.asset_id::text=s.asset_id and r.library_id='${config.libraryId}' and r.owner_id is distinct from s.owner_id)),
  'live_provider_removal_conflicts',(select count(*) from sources s where s.live and exists(select 1 from private.bunny_media_removals r
    where r.asset_id::text=s.asset_id and r.library_id='${config.libraryId}')),
  'message_fields_requiring_copy',(select count(*) from paths where object is not null
    and (object[1]='shadow-pin' or split_part(object[2],'/',1)<>author_id::text)),
  'category_paths_requiring_copy',(select count(*) from category_paths)
) as readiness;
rollback;`
}

export function assertAccountDeletionReleaseReady(snapshot, config) {
  if (!snapshot || snapshot.version !== 1 || snapshot.project_ref !== config.projectRef || snapshot.library_id !== config.libraryId) {
    throw new Error('Deletion readiness returned an invalid or mismatched project result')
  }
  for (const field of [...blockingCounts, 'provider_associations']) {
    if (!Number.isSafeInteger(snapshot[field]) || snapshot[field] < 0) throw new Error(`Deletion readiness lacks a valid ${field} count`)
  }
  const failures = blockingCounts.filter(field => snapshot[field] !== 0).map(field => `${field}=${snapshot[field]}`)
  if (failures.length) throw new Error(`Account deletion release blocked: ${failures.join(', ')}. Complete the reviewed backfill and independent-copy repairs before publication.`)
  return snapshot
}

export function verifyAccountDeletionReleaseReadiness({ environment = process.env, run = execFileSync, read = readFileSync, workspaceRoot = root } = {}) {
  let linkedProject
  try { linkedProject = read(path.join(workspaceRoot, 'supabase/.temp/project-ref'), 'utf8') }
  catch { throw new Error('The exact release Supabase project must be linked before this read-only gate') }
  const config = accountDeletionReleaseConfig(environment, linkedProject)
  let rows
  try {
    const raw = run(process.platform === 'win32' ? 'supabase.exe' : 'supabase',
      ['db', 'query', '--linked', '--output', 'json', buildAccountDeletionReadinessQuery(config)],
      { cwd: workspaceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000, env: environment })
    rows = parseSupabaseQueryRows(raw)
  } catch {
    throw new Error('Deletion release readiness could not be verified. No publication is allowed; stage the reviewed compatible foundation and inspect schema/connection errors without bypassing this gate.')
  }
  if (rows.length !== 1) throw new Error('Deletion readiness must return exactly one aggregate row')
  const snapshot = assertAccountDeletionReleaseReady(rows[0].readiness, config)
  console.log(`Account deletion release metadata ready: ${snapshot.provider_associations} exact provider associations; no outstanding copy, ownership or live-removal conflicts. Client compatibility and privacy cutover remain separate release evidence.`)
  return snapshot
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--linked')) throw new Error('Use --linked for the read-only release check')
  verifyAccountDeletionReleaseReadiness()
}

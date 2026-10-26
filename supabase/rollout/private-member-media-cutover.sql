-- MANUAL RELEASE ARTIFACT, NOT AN AUTOMATIC MIGRATION.
-- Do not run until every gate in docs/STREAMLINED_STORE_READINESS.md passes:
-- full/native/streamlined clients, forwarding provenance, preview/push assets,
-- negative authorization tests, expiry/block/revocation, and CDN behavior.
-- Local consumers/repair tooling are implemented. This file remains blocked
-- until deployed compatibility and reviewed historical repair are verified.
-- A release operator must deliberately set this connection's
-- shadowchat.private_media_readiness to 'verified' after recording that proof.
-- This guard is a workflow acknowledgement, not an automated proof of safety.
begin;

do $$
declare
  project_url text := current_setting('shadowchat.private_media_project_url', true);
begin
  if current_setting('shadowchat.private_media_readiness', true) is distinct from 'verified' then
    raise exception 'Private-media cutover blocked: compatibility and authorization evidence has not been acknowledged';
  end if;
  if project_url is null or project_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then
    raise exception 'Private-media cutover blocked: exact project origin is required';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'can_read_member_media'
      and p.pronargs = 2 and not p.prosecdef
  ) then
    raise exception 'Private-media signing policy is missing or has an unexpected privilege boundary';
  end if;
  if to_regprocedure('private.is_active_member()') is null or not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='active_member_required' and permissive='RESTRICTIVE'
  ) then
    raise exception 'Private-media cutover blocked: active-member Storage boundary is missing';
  end if;
  if exists (
    with messages as (
      select user_id as author_id, file_url, audio_url, thumbnail_url, content, message_type from public.messages
      union all
      select sender_id, file_url, audio_url, thumbnail_url, content, message_type from public.dm_messages
    ), paths as (
      select author_id, regexp_match(split_part(v.url,'?',1),
        '/storage/v1/(?:object|render/image)/(?:public|sign|authenticated)/(chat-uploads|message-media|shadow-pin)/(.+)$') as object
      from messages cross join lateral (values (file_url),(audio_url),(thumbnail_url),
        (case when message_type in ('image','audio','video','file') then content end)) v(url)
      where starts_with(v.url,project_url || '/storage/v1/')
    )
    select 1 from paths where object is not null and
      (object[1]='shadow-pin' or split_part(object[2],'/',1) <> author_id::text)
  ) then
    raise exception 'Private-media cutover blocked: historical message references still require authorized independent copies';
  end if;
  if exists (
    select 1 from public.shadow_pin_categories c
    where c.image_path not like c.creator_id::text || '/%'
      and exists (select 1 from storage.objects o where o.bucket_id='shadow-pin' and o.name=c.image_path)
  ) then
    raise exception 'Private-media cutover blocked: historical category covers still belong to another member';
  end if;
  if (select count(*) from storage.buckets where id in ('chat-uploads', 'message-media', 'shadow-pin')) <> 3 then
    raise exception 'Expected member-media bucket inventory does not match';
  end if;
end;
$$;

update storage.buckets set public = false
where id in ('chat-uploads', 'message-media', 'shadow-pin');

commit;

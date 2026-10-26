-- READ ONLY. Before running, set this session's shadowchat.private_media_project_url
-- to the exact configured Supabase origin. Export the single inventory JSON value
-- for scripts/prepare-private-media-repair.mjs. No message content is collected.
with config as (
  select nullif(current_setting('shadowchat.private_media_project_url', true), '') as project_url
), messages as (
  select 'messages' as source, id::text as row_id, user_id as author_id,
    file_url, audio_url, thumbnail_url, content, message_type from public.messages
  union all
  select 'dm_messages', id::text, sender_id, file_url, audio_url, thumbnail_url,
    content, message_type from public.dm_messages
), urls as (
  select source, row_id, author_id, v.field, v.url,
    regexp_match(split_part(v.url, '?', 1),
      '/storage/v1/(?:object|render/image)/(?:public|sign|authenticated)/(chat-uploads|message-media|shadow-pin)/(.+)$') as object
  from messages cross join config
  cross join lateral (values ('file_url', file_url), ('audio_url', audio_url),
    ('thumbnail_url', thumbnail_url), ('content', case
      when message_type in ('image','audio','video','file') then content end)) v(field,url)
  where starts_with(v.url, config.project_url || '/storage/v1/')
), media_references as (
  select source, row_id, author_id, field, url from urls
  where object is not null and (object[1]='shadow-pin'
    or split_part(object[2], '/', 1) <> author_id::text)
), categories as (
  select c.id::text as row_id, c.creator_id as author_id, c.image_path, c.image_url
  from public.shadow_pin_categories c
  where c.image_path not like c.creator_id::text || '/%'
    and exists (select 1 from storage.objects o where o.bucket_id='shadow-pin' and o.name=c.image_path)
)
select jsonb_build_object(
  'version', 1, 'projectUrl', (select project_url from config), 'observedAt', now(),
  'messageReferences', coalesce((select jsonb_agg(to_jsonb(r) order by source,row_id,field) from media_references r), '[]'::jsonb),
  'categoryCovers', coalesce((select jsonb_agg(to_jsonb(c) order by row_id) from categories c), '[]'::jsonb),
  'bucketInventory', (select jsonb_agg(to_jsonb(b)) from (
    select bucket_id, count(*) as objects,
      count(*) filter (where name like 'derivatives/%') as legacy_derivatives,
      count(*) filter (where name like 'link-previews/%') as legacy_previews
    from storage.objects where bucket_id in ('chat-uploads','message-media','shadow-pin') group by bucket_id
  ) b)
) as inventory;

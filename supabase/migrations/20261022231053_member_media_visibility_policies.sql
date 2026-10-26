-- Stage visibility-aware signing and remove anonymous object listing.
-- Intentionally DOES NOT make any bucket private: old full/native clients and
-- push/download consumers must support authenticated signed URLs before cutover.
begin;

create or replace function private.can_read_member_media(target_bucket text, target_path text)
returns boolean language plpgsql stable security invoker
set search_path = ''
as $$
declare
  current_member uuid := auth.uid();
  object_author text := split_part(target_path, '/', 1);
  object_author_id uuid;
  issuer text := auth.jwt() ->> 'iss';
  encoded_path text := '';
  path_bytes bytea := convert_to(target_path, 'UTF8');
  byte_value integer;
  candidate_urls text[];
begin
  if current_member is null
     or target_bucket is null
     or target_bucket not in ('chat-uploads', 'message-media', 'shadow-pin')
     or target_path is null or target_path = ''
     or target_path ~ '(^|/)\.\.(/|$)'
     or not exists (select 1 from public.users where id = current_member) then
    return false;
  end if;

  -- Upload preview and the uploader's own files. Recipients never inherit this
  -- path; their access below is constrained by the referenced row's own RLS.
  if object_author = current_member::text then
    return true;
  end if;
  -- Legacy server-generated derivatives predate the member-prefix layout.
  -- Bind them to their canonical row ID as well as its current RLS visibility;
  -- copying a guessed URL into another writable row cannot grant access.
  if target_bucket = 'shadow-pin'
     and target_path ~ '^derivatives/(images|categories)/[0-9a-f-]+/(thumbnail|medium)\.webp$' then
    return exists (
      select 1 from public.shadow_pin_images p
      where split_part(target_path, '/', 2) = 'images'
        and p.id::text = split_part(target_path, '/', 3)
        and (p.thumbnail_path = target_path or p.medium_path = target_path)
    ) or exists (
      select 1 from public.shadow_pin_categories c
      where split_part(target_path, '/', 2) = 'categories'
        and c.id::text = split_part(target_path, '/', 3)
        and (c.thumbnail_path = target_path or c.medium_path = target_path)
    );
  end if;
  -- Older operator cover replacements used the operator's folder. The embedded
  -- category ID and exact current image_path bind these bytes to that category;
  -- an unrelated writable row cannot manufacture access to another object.
  if target_bucket = 'shadow-pin'
     and target_path ~ '^[0-9a-f-]{36}/categories/[0-9a-f-]+/cover/[^/].*$' then
    return exists (
      select 1 from public.shadow_pin_categories c
      where c.id::text = split_part(target_path, '/', 3) and c.image_path = target_path
    );
  end if;
  if issuer is null or issuer !~ '^https?://[^/?#]+/auth/v1/?$' then
    return false;
  end if;
  if object_author !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  object_author_id := object_author::uuid;

  -- Inline helpers intentionally avoid granting USAGE on the private schema.
  -- A policy can invoke its pre-resolved function without exposing that schema.
  for byte_index in 0 .. length(path_bytes) - 1 loop
    byte_value := get_byte(path_bytes, byte_index);
    -- encodeURI path characters used by storage-js getPublicUrl. ? and # are
    -- always escaped here; they must never become a query or fragment.
    if (byte_value between 48 and 57) or (byte_value between 65 and 90)
       or (byte_value between 97 and 122)
       or byte_value = any (array[33,36,38,39,40,41,42,43,44,45,46,47,58,59,61,64,95,126]) then
      encoded_path := encoded_path || chr(byte_value);
    else
      encoded_path := encoded_path || '%' || upper(lpad(to_hex(byte_value), 2, '0'));
    end if;
  end loop;
  select coalesce(array_agg(distinct
    regexp_replace(issuer, '/auth/v1/?$', '')
      || '/storage/v1/' || route || '/' || target_bucket || '/' || media_path
  ), array[]::text[])
  into candidate_urls
  from unnest(array[
    'object/public', 'object/authenticated', 'object/sign',
    'render/image/public', 'render/image/authenticated', 'render/image/sign'
  ]) route
  cross join unnest(array[target_path, encoded_path]) media_path;

  -- A writable URL alone is not proof of provenance: otherwise a nonparticipant
  -- could insert a guessed private URL into their own visible message and sign
  -- it. Require a visible reference authored by the path owner. Cross-user
  -- forwards and cached link previews need an explicit trusted sharing contract
  -- before private cutover; they must not be solved with broad member access.
  if target_bucket in ('chat-uploads', 'message-media') then
    return exists (
      select 1 from public.messages m
      where m.user_id = object_author_id and (
            split_part(m.file_url, '?', 1) = any(candidate_urls)
         or split_part(m.audio_url, '?', 1) = any(candidate_urls)
         or split_part(m.thumbnail_url, '?', 1) = any(candidate_urls)
         or (target_bucket = 'chat-uploads' and m.thumbnail_path = target_path)
         or (m.message_type in ('audio', 'image', 'video', 'file')
             and split_part(m.content, '?', 1) = any(candidate_urls)))
    ) or exists (
      select 1 from public.dm_messages m
      where m.sender_id = object_author_id and (
            split_part(m.file_url, '?', 1) = any(candidate_urls)
         or split_part(m.audio_url, '?', 1) = any(candidate_urls)
         or split_part(m.thumbnail_url, '?', 1) = any(candidate_urls)
         or (target_bucket = 'chat-uploads' and m.thumbnail_path = target_path)
         or (m.message_type in ('audio', 'image', 'video', 'file')
             and split_part(m.content, '?', 1) = any(candidate_urls)))
    );
  end if;

  return exists (
    select 1 from public.shadow_pin_images p
    where p.creator_id = object_author_id and (
          p.image_path = target_path or p.thumbnail_path = target_path or p.medium_path = target_path
       or split_part(p.image_url, '?', 1) = any(candidate_urls)
       or split_part(p.thumbnail_url, '?', 1) = any(candidate_urls)
       or split_part(p.medium_url, '?', 1) = any(candidate_urls)
       or split_part(p.video_preview_url, '?', 1) = any(candidate_urls)
       or split_part(p.video_playback_url, '?', 1) = any(candidate_urls)
       or split_part(p.video_hls_url, '?', 1) = any(candidate_urls))
  ) or exists (
    select 1 from public.shadow_pin_categories c
    where c.creator_id = object_author_id and (
          c.image_path = target_path or c.thumbnail_path = target_path or c.medium_path = target_path
       or split_part(c.image_url, '?', 1) = any(candidate_urls)
       or split_part(c.thumbnail_url, '?', 1) = any(candidate_urls)
       or split_part(c.medium_url, '?', 1) = any(candidate_urls))
  );
end;
$$;

revoke all on function private.can_read_member_media(text, text) from public, anon, authenticated;
grant execute on function private.can_read_member_media(text, text) to authenticated, service_role;

drop policy if exists "Public read for launch buckets" on storage.objects;
drop policy if exists "Users can read their own shadow pin uploads" on storage.objects;
create policy "Public read for profile buckets" on storage.objects
  for select to public using (bucket_id in ('avatars', 'banners'));

-- Consolidate the old owner-only ShadowPin policy as well: otherwise an issued
-- token for a deleted profile could bypass the current-member existence check.
-- Participant and block checks remain delegated to canonical row visibility.
create policy "Members read visible messaging media" on storage.objects
  for select to authenticated
  using (bucket_id in ('chat-uploads', 'message-media', 'shadow-pin')
    and private.can_read_member_media(bucket_id, name));

comment on function private.can_read_member_media(text, text) is
  'SECURITY INVOKER media signing policy: owner or an existing caller-visible reference authored by the object path owner. Does not grant all members DM access. Sharing provenance and bucket privacy are separate rollout gates.';

commit;

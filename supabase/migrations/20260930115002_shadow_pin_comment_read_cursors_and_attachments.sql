begin;

create table public.shadow_pin_comment_read_cursors (
  user_id uuid not null references public.users(id) on delete cascade default auth.uid(),
  image_id uuid not null references public.shadow_pin_images(id) on delete cascade,
  last_read_comment_id uuid not null,
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, image_id)
);
alter table public.shadow_pin_comment_read_cursors enable row level security;
create policy "Owners read own Pin comment cursor" on public.shadow_pin_comment_read_cursors
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners insert own visible Pin comment cursor" on public.shadow_pin_comment_read_cursors
  for insert to authenticated with check (user_id = (select auth.uid()) and exists (
    select 1 from public.shadow_pin_comments c where c.id = last_read_comment_id
      and c.image_id = shadow_pin_comment_read_cursors.image_id and c.created_at = last_read_at
  ));
create policy "Owners advance own visible Pin comment cursor" on public.shadow_pin_comment_read_cursors
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (
    select 1 from public.shadow_pin_comments c where c.id = last_read_comment_id
      and c.image_id = shadow_pin_comment_read_cursors.image_id and c.created_at = last_read_at
  ));
revoke all on public.shadow_pin_comment_read_cursors from public, anon;
grant select, insert, update on public.shadow_pin_comment_read_cursors to authenticated;
grant all on public.shadow_pin_comment_read_cursors to service_role;

create function private.keep_shadow_pin_comment_cursor_monotonic() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id or new.image_id is distinct from old.image_id then raise exception 'Cursor scope cannot change'; end if;
  if (new.last_read_at, new.last_read_comment_id) <= (old.last_read_at, old.last_read_comment_id) then return null; end if;
  return new;
end;
$$;
revoke all on function private.keep_shadow_pin_comment_cursor_monotonic() from public, anon, authenticated;
create trigger keep_shadow_pin_comment_cursor_monotonic before update on public.shadow_pin_comment_read_cursors
  for each row execute function private.keep_shadow_pin_comment_cursor_monotonic();

-- The caller sends only rows observed in its settled viewport. Refuse to cross
-- an unread visible gap; inaccessible/deleted comments do not strand the cursor.
create function public.mark_shadow_pin_comments_read(target_image_id uuid, observed_comment_ids uuid[])
returns public.shadow_pin_comment_read_cursors
language plpgsql security invoker set search_path = '' as $$
declare
  previous public.shadow_pin_comment_read_cursors;
  target public.shadow_pin_comments;
  result public.shadow_pin_comment_read_cursors;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if coalesce(cardinality(observed_comment_ids), 0) = 0 or cardinality(observed_comment_ids) > 200 then
    raise exception 'Expected between 1 and 200 observed comments';
  end if;
  -- Serialize concurrent acknowledgements for the same owner/image, including
  -- the first cursor insert, without locking other discussions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || ':' || target_image_id::text, 0));
  select * into previous from public.shadow_pin_comment_read_cursors
    where user_id = auth.uid() and image_id = target_image_id;
  select c.* into target from public.shadow_pin_comments c
    where c.image_id = target_image_id and c.id = any(observed_comment_ids)
      and (previous.last_read_at is null or (c.created_at, c.id) > (previous.last_read_at, previous.last_read_comment_id))
      and (previous.last_read_at is null or not exists (
        select 1 from public.shadow_pin_comments gap
        where gap.image_id = target_image_id
          and (gap.created_at, gap.id) > (previous.last_read_at, previous.last_read_comment_id)
          and (gap.created_at, gap.id) <= (c.created_at, c.id)
          and not (gap.id = any(observed_comment_ids))
      ))
    order by c.created_at desc, c.id desc limit 1;
  if target.id is not null then
    insert into public.shadow_pin_comment_read_cursors(user_id, image_id, last_read_comment_id, last_read_at)
      values(auth.uid(), target_image_id, target.id, target.created_at)
    on conflict (user_id, image_id) do update set
      last_read_comment_id = excluded.last_read_comment_id, last_read_at = excluded.last_read_at, updated_at = now()
    where (shadow_pin_comment_read_cursors.last_read_at, shadow_pin_comment_read_cursors.last_read_comment_id)
      < (excluded.last_read_at, excluded.last_read_comment_id);
  end if;
  -- Only exact observed comment events clear, even when a gap prevents cursor
  -- advancement. Merely opening the sheet never clears a discussion badge.
  update public.notification_events events set read_at = now()
    where events.user_id = auth.uid() and events.read_at is null
      and events.type in ('shadow_pin_comment', 'shadow_pin_reply')
      and exists (select 1 from public.shadow_pin_comments c
        where c.image_id = target_image_id and c.id = any(observed_comment_ids)
          and (events.entity_id = c.id or events.payload ->> 'comment_id' = c.id::text));
  select * into result from public.shadow_pin_comment_read_cursors
    where user_id = auth.uid() and image_id = target_image_id;
  return result;
end;
$$;
revoke all on function public.mark_shadow_pin_comments_read(uuid, uuid[]) from public, anon;
grant execute on function public.mark_shadow_pin_comments_read(uuid, uuid[]) to authenticated, service_role;

alter table public.shadow_pin_comments add column attachment jsonb;
-- Referential locking closes the concurrent upload-cleanup/comment-insert race.
alter table public.shadow_pin_comments add column attachment_object_id uuid
  references storage.objects(id) on delete restrict;
alter table public.shadow_pin_comments add constraint shadow_pin_comment_attachment_reference
  check ((attachment is null) = (attachment_object_id is null));
create index shadow_pin_comment_attachment_object_idx on public.shadow_pin_comments(attachment_object_id) where attachment_object_id is not null;
-- Text-only comments keep their existing constraint; file-only comments use
-- the filename as their readable body, preserving existing notification copy.
alter table public.shadow_pin_comments add constraint shadow_pin_comment_attachment_shape check (
  attachment is null or (
    jsonb_typeof(attachment) = 'object'
    and attachment ?& array['path', 'name', 'contentType', 'size', 'kind']
    and jsonb_typeof(attachment -> 'path') = 'string'
    and jsonb_typeof(attachment -> 'name') = 'string'
    and jsonb_typeof(attachment -> 'contentType') = 'string'
    and jsonb_typeof(attachment -> 'kind') = 'string'
    and jsonb_typeof(attachment -> 'size') = 'number'
    and length(attachment ->> 'name') between 1 and 255
    and length(attachment ->> 'contentType') between 1 and 128
    and (attachment ->> 'size')::bigint between 1 and 52428800
    and attachment ->> 'kind' in ('image', 'video', 'file')
    and attachment ->> 'path' ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}$'
    and split_part(attachment ->> 'path', '/', 1) = author_id::text
    and split_part(attachment ->> 'path', '/', 2) = image_id::text
  )
);
create unique index shadow_pin_comment_attachment_path on public.shadow_pin_comments ((attachment ->> 'path')) where attachment is not null;
insert into storage.buckets(id, name, public, file_size_limit)
  values('shadow-pin-comments', 'shadow-pin-comments', false, 52428800);
create policy "Upload own visible Pin comment attachment" on storage.objects for insert to authenticated with check (
  bucket_id = 'shadow-pin-comments' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.shadow_pin_images i where i.id::text = (storage.foldername(name))[2])
);
create policy "Read visible Pin comment attachments" on storage.objects for select to authenticated using (
  bucket_id = 'shadow-pin-comments' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.shadow_pin_comments c where c.attachment ->> 'path' = name)
    or public.is_app_operator((select auth.uid()))
  )
);
-- Storage must see references hidden by caller RLS before deleting a blob.
create function private.can_remove_shadow_pin_comment_attachment(object_path text) returns boolean
language plpgsql security definer set search_path = '' stable as $$
begin
  if auth.uid() is null then return false; end if;
  if split_part(object_path, '/', 1) <> auth.uid()::text and not public.is_app_operator(auth.uid()) then return false; end if;
  return not exists(select 1 from public.shadow_pin_comments c where c.attachment ->> 'path' = object_path);
end;
$$;
revoke all on function private.can_remove_shadow_pin_comment_attachment(text) from public, anon;
grant execute on function private.can_remove_shadow_pin_comment_attachment(text) to authenticated;
create policy "Clean up own or moderated Pin comment attachments" on storage.objects for delete to authenticated using (
  bucket_id = 'shadow-pin-comments' and private.can_remove_shadow_pin_comment_attachment(name)
);
-- Validate attachment provenance before it becomes a visible comment. An
-- insert cannot attach another user's object or a missing upload.
create function private.validate_shadow_pin_comment_attachment() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.attachment_object_id := null;
  if new.attachment is not null then
    select o.id into new.attachment_object_id from storage.objects o where o.bucket_id = 'shadow-pin-comments'
      and o.name = new.attachment ->> 'path'
      and (storage.foldername(o.name))[1] = new.author_id::text;
    if new.attachment_object_id is null then raise exception 'Comment attachment is unavailable'; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_shadow_pin_comment_attachment() from public, anon, authenticated;
create trigger validate_shadow_pin_comment_attachment before insert or update of attachment, attachment_object_id on public.shadow_pin_comments
  for each row execute function private.validate_shadow_pin_comment_attachment();
comment on table public.shadow_pin_comment_read_cursors is 'Owner-private chronological Pin discussion cursor. Fresh discussions without a cursor open latest; only observed comments advance it.';
-- Publish comment changes only; the private cursor table stays out of Realtime.
do $$ begin
  if exists(select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
    and not exists(select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shadow_pin_comments') then
    alter publication supabase_realtime add table public.shadow_pin_comments;
  end if;
end $$;
commit;

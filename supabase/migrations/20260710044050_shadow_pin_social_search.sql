/*
  # ShadowPin social and discovery expansion

  Adds normalized pin tags, indexed cross-entity pin search, threaded comments,
  and recipient-owned notification events. All browser reads continue to run as
  the caller and therefore inherit ShadowPin, profile, and personal-block RLS.
*/

begin;

alter table public.shadow_pin_images
  add column if not exists comment_count integer not null default 0
    check (comment_count >= 0);

create table public.shadow_pin_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{0,29}$'),
  created_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.shadow_pin_image_tags (
  image_id uuid not null references public.shadow_pin_images(id) on delete cascade,
  tag_id uuid not null references public.shadow_pin_tags(id) on delete cascade,
  tagged_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (image_id, tag_id)
);

create index shadow_pin_image_tags_tag_image_idx
  on public.shadow_pin_image_tags (tag_id, image_id);

create index shadow_pin_tags_search_idx
  on public.shadow_pin_tags using gin (to_tsvector('simple', slug));

create index shadow_pin_images_text_search_idx
  on public.shadow_pin_images using gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  )
  where deleted_at is null;

create index shadow_pin_categories_text_search_idx
  on public.shadow_pin_categories using gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, ''))
  )
  where deleted_at is null;

create index users_public_name_search_idx
  on public.users using gin (
    to_tsvector('simple', coalesce(username, '') || ' ' || coalesce(display_name, ''))
  );

alter table public.shadow_pin_tags enable row level security;
alter table public.shadow_pin_image_tags enable row level security;

create policy "Members can read ShadowPin tags"
  on public.shadow_pin_tags
  for select
  to authenticated
  using (true);

create policy "Members can create normalized ShadowPin tags"
  on public.shadow_pin_tags
  for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

create policy "Members can read visible ShadowPin image tags"
  on public.shadow_pin_image_tags
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.shadow_pin_images images
      where images.id = shadow_pin_image_tags.image_id
    )
  );

create policy "Creators and operators can tag ShadowPin images"
  on public.shadow_pin_image_tags
  for insert
  to authenticated
  with check (
    (select auth.uid()) = tagged_by
    and exists (
      select 1
      from public.shadow_pin_images images
      where images.id = shadow_pin_image_tags.image_id
        and (
          images.creator_id = (select auth.uid())
          or public.is_app_operator((select auth.uid()))
        )
    )
  );

create policy "Creators and operators can untag ShadowPin images"
  on public.shadow_pin_image_tags
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.shadow_pin_images images
      where images.id = shadow_pin_image_tags.image_id
        and (
          images.creator_id = (select auth.uid())
          or public.is_app_operator((select auth.uid()))
        )
    )
  );

create or replace function public.set_shadow_pin_image_tags(
  target_image_id uuid,
  requested_tags text[]
)
returns text[]
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  caller_id uuid := auth.uid();
  normalized_tags text[];
  normalized_tag text;
  resolved_tag_id uuid;
  image_creator_id uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  select images.creator_id
  into image_creator_id
  from public.shadow_pin_images images
  where images.id = target_image_id;

  if not found then
    raise exception 'ShadowPin image is not available';
  end if;

  if image_creator_id is distinct from caller_id
    and not public.is_app_operator(caller_id) then
    raise exception 'Only the creator or an operator can update tags';
  end if;

  select coalesce(array_agg(unique_tags.slug order by unique_tags.first_position), '{}'::text[])
  into normalized_tags
  from (
    select normalized.slug, min(normalized.position) as first_position
    from (
      select
        btrim(
          regexp_replace(lower(trim(input.value)), '[^a-z0-9]+', '-', 'g'),
          '-'
        ) as slug,
        input.position
      from unnest(coalesce(requested_tags, '{}'::text[]))
        with ordinality as input(value, position)
    ) normalized
    where normalized.slug <> ''
    group by normalized.slug
  ) unique_tags;

  if cardinality(normalized_tags) > 8 then
    raise exception 'Pins can have up to 8 tags';
  end if;

  if exists (
    select 1
    from unnest(normalized_tags) tag
    where char_length(tag) > 30
  ) then
    raise exception 'Tags can be up to 30 characters';
  end if;

  delete from public.shadow_pin_image_tags image_tags
  where image_tags.image_id = target_image_id;

  foreach normalized_tag in array normalized_tags loop
    insert into public.shadow_pin_tags (slug, created_by)
    values (normalized_tag, caller_id)
    on conflict (slug) do nothing;

    select tags.id
    into resolved_tag_id
    from public.shadow_pin_tags tags
    where tags.slug = normalized_tag;

    insert into public.shadow_pin_image_tags (image_id, tag_id, tagged_by)
    values (target_image_id, resolved_tag_id, caller_id);
  end loop;

  return normalized_tags;
end;
$$;

create or replace function public.search_shadow_pin_images(
  search_query text,
  result_limit integer default 30
)
returns table (
  image_id uuid,
  search_rank real
)
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with query as (
    select plainto_tsquery('simple', left(trim($1), 120)) as value
  ),
  matches as (
    select
      images.id as image_id,
      4 + ts_rank_cd(
        to_tsvector('simple', coalesce(images.title, '') || ' ' || coalesce(images.description, '')),
        query.value
      ) as search_rank
    from public.shadow_pin_images images
    cross join query
    where trim($1) <> ''
      and images.deleted_at is null
      and to_tsvector('simple', coalesce(images.title, '') || ' ' || coalesce(images.description, '')) @@ query.value

    union all

    select
      image_tags.image_id,
      3 + ts_rank_cd(to_tsvector('simple', tags.slug), query.value)
    from public.shadow_pin_tags tags
    join public.shadow_pin_image_tags image_tags on image_tags.tag_id = tags.id
    cross join query
    where trim($1) <> ''
      and to_tsvector('simple', tags.slug) @@ query.value

    union all

    select
      images.id,
      2 + ts_rank_cd(
        to_tsvector('simple', coalesce(profiles.username, '') || ' ' || coalesce(profiles.display_name, '')),
        query.value
      )
    from public.users profiles
    join public.shadow_pin_images images on images.creator_id = profiles.id
    cross join query
    where trim($1) <> ''
      and to_tsvector('simple', coalesce(profiles.username, '') || ' ' || coalesce(profiles.display_name, '')) @@ query.value

    union all

    select
      images.id,
      1 + ts_rank_cd(
        to_tsvector('simple', coalesce(categories.title, '') || ' ' || coalesce(categories.description, '')),
        query.value
      )
    from public.shadow_pin_categories categories
    join public.shadow_pin_images images on images.category_id = categories.id
    cross join query
    where trim($1) <> ''
      and categories.deleted_at is null
      and to_tsvector('simple', coalesce(categories.title, '') || ' ' || coalesce(categories.description, '')) @@ query.value
  ),
  ranked as (
    select matches.image_id, max(matches.search_rank)::real as search_rank
    from matches
    group by matches.image_id
  )
  select ranked.image_id, ranked.search_rank
  from ranked
  join public.shadow_pin_images images on images.id = ranked.image_id
  order by ranked.search_rank desc, images.created_at desc, ranked.image_id desc
  limit greatest(1, least(coalesce($2, 30), 60));
$$;

create table public.shadow_pin_comments (
  id uuid primary key default gen_random_uuid(),
  image_id uuid not null references public.shadow_pin_images(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade default auth.uid(),
  parent_comment_id uuid references public.shadow_pin_comments(id) on delete set null,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shadow_pin_comments_not_self_parent
    check (parent_comment_id is null or parent_comment_id <> id)
);

create index shadow_pin_comments_image_created_idx
  on public.shadow_pin_comments (image_id, created_at, id);
create index shadow_pin_comments_parent_created_idx
  on public.shadow_pin_comments (parent_comment_id, created_at, id)
  where parent_comment_id is not null;
create index shadow_pin_comments_author_created_idx
  on public.shadow_pin_comments (author_id, created_at desc);

alter table public.shadow_pin_comments enable row level security;

create policy "Members can read visible ShadowPin comments"
  on public.shadow_pin_comments
  for select
  to authenticated
  using (
    not private.users_have_block((select auth.uid()), author_id)
    and exists (
      select 1
      from public.shadow_pin_images images
      where images.id = shadow_pin_comments.image_id
    )
  );

create policy "Members can comment on visible ShadowPin images"
  on public.shadow_pin_comments
  for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1
      from public.shadow_pin_images images
      where images.id = shadow_pin_comments.image_id
        and (
          images.creator_id is null
          or not private.users_have_block((select auth.uid()), images.creator_id)
        )
    )
  );

create policy "Authors can edit own ShadowPin comments"
  on public.shadow_pin_comments
  for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

create policy "Authors and operators can remove ShadowPin comments"
  on public.shadow_pin_comments
  for delete
  to authenticated
  using (
    (select auth.uid()) = author_id
    or public.is_app_operator((select auth.uid()))
  );

drop trigger if exists update_shadow_pin_comments_updated_at
  on public.shadow_pin_comments;
create trigger update_shadow_pin_comments_updated_at
  before update on public.shadow_pin_comments
  for each row execute function public.update_updated_at_column();

create or replace function private.enforce_shadow_pin_comment_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_image_id uuid;
  parent_author_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select comments.image_id, comments.author_id
  into parent_image_id, parent_author_id
  from public.shadow_pin_comments comments
  where comments.id = new.parent_comment_id;

  if not found or parent_image_id is distinct from new.image_id then
    raise exception 'Reply target must belong to the same ShadowPin image';
  end if;

  if private.users_have_block(auth.uid(), parent_author_id) then
    raise exception 'Reply target is not available';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_shadow_pin_comment_parent()
  from public, anon, authenticated;

drop trigger if exists enforce_shadow_pin_comment_parent
  on public.shadow_pin_comments;
create trigger enforce_shadow_pin_comment_parent
  before insert or update of parent_comment_id, image_id
  on public.shadow_pin_comments
  for each row execute function private.enforce_shadow_pin_comment_parent();

create or replace function private.refresh_shadow_pin_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_image_id uuid := coalesce(new.image_id, old.image_id);
begin
  update public.shadow_pin_images images
  set comment_count = (
    select count(*)::integer
    from public.shadow_pin_comments comments
    where comments.image_id = target_image_id
  )
  where images.id = target_image_id;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.refresh_shadow_pin_comment_count()
  from public, anon, authenticated;

drop trigger if exists refresh_shadow_pin_comment_count
  on public.shadow_pin_comments;
create trigger refresh_shadow_pin_comment_count
  after insert or delete on public.shadow_pin_comments
  for each row execute function private.refresh_shadow_pin_comment_count();

alter table public.notification_preferences
  add column if not exists shadow_pin_new_post_enabled boolean not null default true,
  add column if not exists shadow_pin_comment_enabled boolean not null default true,
  add column if not exists shadow_pin_reply_enabled boolean not null default true;

create or replace function private.create_shadow_pin_comment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
  notification_type text;
  notification_allowed boolean;
  image_title text;
  actor_profile jsonb;
begin
  if new.parent_comment_id is not null then
    select comments.author_id
    into recipient_id
    from public.shadow_pin_comments comments
    where comments.id = new.parent_comment_id;
    notification_type := 'shadow_pin_reply';
  else
    select images.creator_id, images.title
    into recipient_id, image_title
    from public.shadow_pin_images images
    where images.id = new.image_id;
    notification_type := 'shadow_pin_comment';
  end if;

  if image_title is null then
    select images.title
    into image_title
    from public.shadow_pin_images images
    where images.id = new.image_id;
  end if;

  if recipient_id is null
    or recipient_id = new.author_id
    or private.users_have_block(recipient_id, new.author_id) then
    return new;
  end if;

  select case
    when notification_type = 'shadow_pin_reply'
      then preferences.shadow_pin_reply_enabled
    else preferences.shadow_pin_comment_enabled
  end
  into notification_allowed
  from public.notification_preferences preferences
  where preferences.user_id = recipient_id;

  if notification_allowed is false then
    return new;
  end if;

  select public.user_public_profile_json(profiles)
  into actor_profile
  from public.users profiles
  where profiles.id = new.author_id;

  insert into public.notification_events (
    user_id,
    type,
    entity_id,
    payload,
    dedupe_key
  )
  values (
    recipient_id,
    notification_type,
    new.id,
    jsonb_build_object(
      'image_id', new.image_id,
      'comment_id', new.id,
      'parent_comment_id', new.parent_comment_id,
      'image_title', coalesce(image_title, 'your pin'),
      'body_preview', left(new.body, 160),
      'actor', actor_profile,
      'url', '/?view=pins'
    ),
    notification_type || ':' || new.id::text || ':' || recipient_id::text
  )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function private.create_shadow_pin_comment_notification()
  from public, anon, authenticated;

drop trigger if exists create_shadow_pin_comment_notification
  on public.shadow_pin_comments;
create trigger create_shadow_pin_comment_notification
  after insert on public.shadow_pin_comments
  for each row execute function private.create_shadow_pin_comment_notification();

create or replace function private.create_shadow_pin_post_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile jsonb;
begin
  if new.creator_id is null or new.deleted_at is not null then
    return new;
  end if;

  select public.user_public_profile_json(profiles)
  into actor_profile
  from public.users profiles
  where profiles.id = new.creator_id;

  insert into public.notification_events (
    user_id,
    type,
    entity_id,
    payload,
    dedupe_key
  )
  select
    profiles.id,
    'shadow_pin_post',
    new.id,
    jsonb_build_object(
      'image_id', new.id,
      'category_id', new.category_id,
      'image_title', new.title,
      'thumbnail_url', coalesce(new.thumbnail_url, new.medium_url, new.image_url),
      'actor', actor_profile,
      'url', '/?view=pins'
    ),
    'shadow_pin_post:' || new.id::text || ':' || profiles.id::text
  from public.users profiles
  left join public.notification_preferences preferences
    on preferences.user_id = profiles.id
  where profiles.id <> new.creator_id
    and coalesce(preferences.shadow_pin_new_post_enabled, true)
    and not private.users_have_block(profiles.id, new.creator_id)
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

revoke all on function private.create_shadow_pin_post_notifications()
  from public, anon, authenticated;

drop trigger if exists create_shadow_pin_post_notifications
  on public.shadow_pin_images;
create trigger create_shadow_pin_post_notifications
  after insert on public.shadow_pin_images
  for each row execute function private.create_shadow_pin_post_notifications();

-- Apply the reciprocal personal-block contract to the new discovery surface.
create policy "Blocked users are hidden from ShadowPin categories"
  on public.shadow_pin_categories
  as restrictive
  for select
  to authenticated
  using (
    creator_id is null
    or creator_id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), creator_id)
  );

create policy "Blocked users are hidden from ShadowPin images"
  on public.shadow_pin_images
  as restrictive
  for select
  to authenticated
  using (
    creator_id is null
    or creator_id = (select auth.uid())
    or not private.users_have_block((select auth.uid()), creator_id)
  );

revoke all on table public.shadow_pin_tags, public.shadow_pin_image_tags,
  public.shadow_pin_comments from public, anon;
grant select, insert on table public.shadow_pin_tags to authenticated;
grant select, insert, delete on table public.shadow_pin_image_tags to authenticated;
grant select, insert, delete on table public.shadow_pin_comments to authenticated;
grant update (body) on table public.shadow_pin_comments to authenticated;
grant all privileges on table public.shadow_pin_tags, public.shadow_pin_image_tags,
  public.shadow_pin_comments to service_role;

revoke all on function public.set_shadow_pin_image_tags(uuid, text[])
  from public, anon, authenticated;
grant execute on function public.set_shadow_pin_image_tags(uuid, text[])
  to authenticated, service_role;

revoke all on function public.search_shadow_pin_images(text, integer)
  from public, anon, authenticated;
grant execute on function public.search_shadow_pin_images(text, integer)
  to authenticated, service_role;

commit;

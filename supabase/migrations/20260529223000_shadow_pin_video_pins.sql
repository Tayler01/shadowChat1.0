-- Shadow Pin short video support.
-- Keeps the existing shadow_pin_images table as the canonical pin table so
-- activity analytics, categories, hearts, and admin tooling continue to share
-- one public feed model.

alter table public.shadow_pin_images
  add column if not exists media_type text not null default 'image',
  add column if not exists source_type text not null default 'file_upload',
  add column if not exists source_url text,
  add column if not exists provider text,
  add column if not exists provider_asset_id text,
  add column if not exists provider_playback_id text,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists video_preview_url text,
  add column if not exists video_playback_url text,
  add column if not exists video_hls_url text,
  add column if not exists video_embed_url text,
  add column if not exists duration_seconds integer,
  add column if not exists video_size_bytes integer;

update public.shadow_pin_images
set
  media_type = coalesce(nullif(media_type, ''), 'image'),
  source_type = coalesce(nullif(source_type, ''), 'file_upload'),
  provider = coalesce(provider, 'shadow_pin_storage'),
  provider_payload = coalesce(provider_payload, '{}'::jsonb)
where
  media_type is null
  or media_type = ''
  or source_type is null
  or source_type = ''
  or provider_payload is null;

alter table public.shadow_pin_images
  drop constraint if exists shadow_pin_images_media_type_check,
  add constraint shadow_pin_images_media_type_check
    check (media_type in ('image', 'video', 'external_video'));

alter table public.shadow_pin_images
  drop constraint if exists shadow_pin_images_source_type_check,
  add constraint shadow_pin_images_source_type_check
    check (source_type in ('file_upload', 'url_import', 'external_embed'));

alter table public.shadow_pin_images
  drop constraint if exists shadow_pin_images_provider_check,
  add constraint shadow_pin_images_provider_check
    check (
      provider is null
      or provider in (
        'shadow_pin_storage',
        'bunny_stream',
        'youtube',
        'x',
        'pinterest',
        'instagram',
        'external'
      )
    );

alter table public.shadow_pin_images
  drop constraint if exists shadow_pin_images_video_duration_check,
  add constraint shadow_pin_images_video_duration_check
    check (duration_seconds is null or (duration_seconds >= 0 and duration_seconds <= 60));

alter table public.shadow_pin_images
  drop constraint if exists shadow_pin_images_video_size_check,
  add constraint shadow_pin_images_video_size_check
    check (video_size_bytes is null or (video_size_bytes >= 0 and video_size_bytes <= 157286400));

create index if not exists shadow_pin_images_media_processing_idx
  on public.shadow_pin_images (media_type, processing_status, created_at desc)
  where deleted_at is null;

create index if not exists shadow_pin_images_provider_asset_idx
  on public.shadow_pin_images (provider, provider_asset_id)
  where provider_asset_id is not null and deleted_at is null;

create index if not exists shadow_pin_images_creator_video_day_idx
  on public.shadow_pin_images (creator_id, created_at desc)
  where media_type = 'video' and deleted_at is null;

drop policy if exists "Authenticated users can read shadow pin images" on public.shadow_pin_images;
create policy "Authenticated users can read shadow pin images"
  on public.shadow_pin_images
  for select
  to authenticated
  using (
    deleted_at is null
    and category_id is not null
    and exists (
      select 1
      from public.shadow_pin_categories categories
      where categories.id = shadow_pin_images.category_id
        and categories.deleted_at is null
    )
    and (
      media_type = 'image'
      or processing_status = 'ready'
      or creator_id = auth.uid()
      or public.is_app_operator(auth.uid())
    )
  );

drop policy if exists "Authenticated users can heart shadow pin images" on public.shadow_pin_image_hearts;
drop policy if exists "Users can add own shadow pin image hearts" on public.shadow_pin_image_hearts;
create policy "Users can add own shadow pin image hearts"
  on public.shadow_pin_image_hearts
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.shadow_pin_images images
      where images.id = shadow_pin_image_hearts.image_id
        and images.deleted_at is null
        and images.category_id is not null
        and (
          images.media_type = 'image'
          or images.processing_status = 'ready'
        )
        and exists (
          select 1
          from public.shadow_pin_categories categories
          where categories.id = images.category_id
            and categories.deleted_at is null
        )
    )
  );

create or replace function public.toggle_shadow_pin_image_heart(target_image_id uuid)
returns public.shadow_pin_images
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  updated_image public.shadow_pin_images%rowtype;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.shadow_pin_images images
    join public.shadow_pin_categories categories
      on categories.id = images.category_id
    where images.id = target_image_id
      and images.deleted_at is null
      and images.category_id is not null
      and categories.deleted_at is null
      and (
        images.media_type = 'image'
        or images.processing_status = 'ready'
      )
  ) then
    raise exception 'ShadowPin image is not available';
  end if;

  if exists (
    select 1
    from public.shadow_pin_image_hearts hearts
    where hearts.image_id = target_image_id
      and hearts.user_id = current_user_id
  ) then
    delete from public.shadow_pin_image_hearts
    where image_id = target_image_id
      and user_id = current_user_id;
  else
    insert into public.shadow_pin_image_hearts (image_id, user_id)
    values (target_image_id, current_user_id);
  end if;

  update public.shadow_pin_images
  set
    heart_count = (
      select count(*)::integer
      from public.shadow_pin_image_hearts hearts
      where hearts.image_id = target_image_id
    ),
    updated_at = now()
  where id = target_image_id
  returning * into updated_image;

  return updated_image;
end;
$$;

grant execute on function public.toggle_shadow_pin_image_heart(uuid) to authenticated;

create or replace function private.refresh_shadow_pin_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  champion_id uuid;
begin
  delete from private.shadow_pin_scores
  where user_id is not null;

  insert into private.shadow_pin_scores (
    user_id,
    image_count,
    received_like_count,
    image_points,
    like_points,
    total_score,
    last_scored_at,
    updated_at
  )
  select
    images.creator_id as user_id,
    count(distinct images.id)::integer as image_count,
    count(hearts.user_id)::integer as received_like_count,
    count(distinct images.id)::integer as image_points,
    (count(hearts.user_id)::integer * 2) as like_points,
    (count(distinct images.id)::integer + (count(hearts.user_id)::integer * 2)) as total_score,
    max(greatest(images.created_at, coalesce(hearts.created_at, images.created_at))) as last_scored_at,
    now() as updated_at
  from public.shadow_pin_images images
  left join public.shadow_pin_image_hearts hearts
    on hearts.image_id = images.id
   and hearts.user_id is distinct from images.creator_id
  where images.creator_id is not null
    and images.deleted_at is null
    and images.category_id is not null
    and (
      images.media_type = 'image'
      or images.processing_status = 'ready'
    )
  group by images.creator_id
  having count(distinct images.id) > 0;

  select scores.user_id
  into champion_id
  from private.shadow_pin_scores scores
  where scores.total_score > 0
  order by
    scores.total_score desc,
    scores.received_like_count desc,
    scores.image_count desc,
    scores.last_scored_at desc nulls last,
    scores.user_id asc
  limit 1;

  update public.users users
  set shadow_pin_gold_pin = (champion_id is not null and users.id = champion_id)
  where users.shadow_pin_gold_pin is distinct from (champion_id is not null and users.id = champion_id);
end;
$$;

revoke all on function private.refresh_shadow_pin_scores() from public, anon, authenticated;

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000401',
    'authenticated', 'authenticated', 'discovery-operator@example.test', '', now(),
    '{}'::jsonb, '{"username":"discovery_operator","display_name":"Discovery Operator"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000402',
    'authenticated', 'authenticated', 'discovery-creator@example.test', '', now(),
    '{}'::jsonb, '{"username":"discovery_creator","display_name":"Discovery Creator"}'::jsonb,
    now(), now()
  );

insert into public.user_roles (user_id, role, created_by)
values (
  '00000000-0000-0000-0000-000000000401',
  'admin',
  '00000000-0000-0000-0000-000000000401'
);

insert into public.shadow_pin_categories (
  id, creator_id, title, image_url, image_path
)
values (
  '40000000-0000-0000-0000-000000000401',
  '00000000-0000-0000-0000-000000000402',
  'Discovery Test Category',
  'https://example.test/category.webp',
  'discovery/category.webp'
);

insert into public.shadow_pin_images (
  id, category_id, creator_id, title, description, image_url, image_path
)
values
  (
    '41000000-0000-0000-0000-000000000401',
    '40000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000402',
    'Visible discovery pin', 'Consumer-visible pin',
    'https://example.test/pin.webp', 'discovery/pin.webp'
  ),
  (
    '41000000-0000-0000-0000-000000000402',
    '40000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000402',
    'Deleted discovery pin', 'Must not be saveable',
    'https://example.test/deleted-pin.webp', 'discovery/deleted-pin.webp'
  );

update public.shadow_pin_images
set deleted_at = now(), deleted_by = '00000000-0000-0000-0000-000000000401'
where id = '41000000-0000-0000-0000-000000000402';

insert into public.shado_tv_channels (
  id, slug, title, visibility_status, created_by
)
values
  (
    '42000000-0000-0000-0000-000000000401',
    'discovery-published', 'Discovery Published', 'published',
    '00000000-0000-0000-0000-000000000401'
  ),
  (
    '42000000-0000-0000-0000-000000000402',
    'discovery-hidden', 'Discovery Hidden', 'hidden',
    '00000000-0000-0000-0000-000000000401'
  );

insert into public.shado_tv_videos (
  id, channel_id, slug, title, visibility_status, release_status, created_by, deleted_at
)
values
  (
    '43000000-0000-0000-0000-000000000401',
    '42000000-0000-0000-0000-000000000401',
    'visible-episode', 'Visible Discovery Episode', 'published', 'released',
    '00000000-0000-0000-0000-000000000401', null
  ),
  (
    '43000000-0000-0000-0000-000000000402',
    '42000000-0000-0000-0000-000000000401',
    'draft-episode', 'Draft Episode', 'draft', 'locked',
    '00000000-0000-0000-0000-000000000401', null
  ),
  (
    '43000000-0000-0000-0000-000000000403',
    '42000000-0000-0000-0000-000000000401',
    'hidden-episode', 'Hidden Episode', 'hidden', 'released',
    '00000000-0000-0000-0000-000000000401', null
  ),
  (
    '43000000-0000-0000-0000-000000000404',
    '42000000-0000-0000-0000-000000000401',
    'deleted-episode', 'Deleted Episode', 'published', 'released',
    '00000000-0000-0000-0000-000000000401', now()
  ),
  (
    '43000000-0000-0000-0000-000000000405',
    '42000000-0000-0000-0000-000000000402',
    'hidden-channel-episode', 'Hidden Channel Episode', 'published', 'released',
    '00000000-0000-0000-0000-000000000401', null
  );

insert into public.shadow_mystery_stories (
  id, slug, title, deck, status, created_by
)
values
  (
    '44000000-0000-0000-0000-000000000401',
    'published-discovery-mystery', 'Published Discovery Mystery',
    'A published test story.', 'draft',
    '00000000-0000-0000-0000-000000000401'
  ),
  (
    '44000000-0000-0000-0000-000000000402',
    'draft-discovery-mystery', 'Draft Discovery Mystery',
    'Must not be saveable.', 'draft',
    '00000000-0000-0000-0000-000000000401'
  );

insert into public.shadow_mystery_chapters (
  id, story_id, chapter_key, title, body, sort_order, created_by
)
values (
  '45000000-0000-0000-0000-000000000401',
  '44000000-0000-0000-0000-000000000401',
  'chapter-one', 'Chapter One', array['Test chapter body.'], 10,
  '00000000-0000-0000-0000-000000000401'
);

insert into public.shadow_mystery_images (
  id, story_id, role, storage_path, created_by
)
values
  (
    '46000000-0000-0000-0000-000000000401',
    '44000000-0000-0000-0000-000000000401',
    'cover', 'discovery/cover.webp',
    '00000000-0000-0000-0000-000000000401'
  ),
  (
    '46000000-0000-0000-0000-000000000402',
    '44000000-0000-0000-0000-000000000401',
    'header', 'discovery/header.webp',
    '00000000-0000-0000-0000-000000000401'
  );

insert into public.shadow_mystery_sources (
  id, story_id, label, url, created_by
)
values (
  '47000000-0000-0000-0000-000000000401',
  '44000000-0000-0000-0000-000000000401',
  'Test source', 'https://example.test/source',
  '00000000-0000-0000-0000-000000000401'
);

update public.shadow_mystery_stories
set status = 'published', published_at = '2026-07-12'
where id = '44000000-0000-0000-0000-000000000401';

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000401', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000401","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  collection_id uuid;
  pin_save_id uuid;
  tv_save_id uuid;
  mystery_save_id uuid;
  denial_observed boolean;
  denied_target record;
begin
  insert into public.message_collections (user_id, name)
  values ('00000000-0000-0000-0000-000000000401', 'Discovery checks')
  returning id into collection_id;

  pin_save_id := public.save_discovery_item_to_library(
    'shadow_pin', '41000000-0000-0000-0000-000000000401', collection_id, null
  );
  tv_save_id := public.save_discovery_item_to_library(
    'shado_tv_video', '43000000-0000-0000-0000-000000000401', collection_id, null
  );
  mystery_save_id := public.save_discovery_item_to_library(
    'shadow_mystery_story', '44000000-0000-0000-0000-000000000401', collection_id, null
  );

  if (select count(*) from public.list_my_saved_discovery_items(collection_id, 100)) <> 3 then
    raise exception 'Visible discovery targets were not listed';
  end if;

  if (select count(*) from public.search_published_play_content('Discovery', 20)) <> 2 then
    raise exception 'Published Play search did not return exactly the visible TV episode and mystery';
  end if;

  if exists (
    select 1
    from public.search_published_play_content('Episode', 20)
    where target_id in (
      '43000000-0000-0000-0000-000000000402',
      '43000000-0000-0000-0000-000000000403',
      '43000000-0000-0000-0000-000000000404',
      '43000000-0000-0000-0000-000000000405'
    )
  ) then
    raise exception 'Operator-only Play content leaked through search';
  end if;

  for denied_target in
    select * from (values
      ('shado_tv_video'::text, '43000000-0000-0000-0000-000000000402'::uuid),
      ('shado_tv_video'::text, '43000000-0000-0000-0000-000000000403'::uuid),
      ('shado_tv_video'::text, '43000000-0000-0000-0000-000000000404'::uuid),
      ('shado_tv_video'::text, '43000000-0000-0000-0000-000000000405'::uuid),
      ('shadow_mystery_story'::text, '44000000-0000-0000-0000-000000000402'::uuid),
      ('shadow_pin'::text, '41000000-0000-0000-0000-000000000402'::uuid),
      ('unsupported'::text, '43000000-0000-0000-0000-000000000401'::uuid)
    ) as denied(kind, id)
  loop
    denial_observed := false;
    begin
      perform public.save_discovery_item_to_library(
        denied_target.kind, denied_target.id, collection_id, null
      );
    exception when others then
      denial_observed := true;
    end;
    if not denial_observed then
      raise exception 'Disallowed target was saved: % %', denied_target.kind, denied_target.id;
    end if;
  end loop;

  update public.shado_tv_videos
  set visibility_status = 'hidden'
  where id = '43000000-0000-0000-0000-000000000401';

  if exists (
    select 1 from public.list_my_saved_discovery_items(null, 100)
    where saved_id = tv_save_id
  ) then
    raise exception 'Newly hidden TV content remained visible in the library';
  end if;

  denial_observed := false;
  begin
    perform public.move_discovery_item_to_collection(tv_save_id, null);
  exception when others then
    denial_observed := true;
  end;
  if not denial_observed then
    raise exception 'Hidden TV content could still be moved';
  end if;

  if not public.remove_discovery_item_from_library(tv_save_id) then
    raise exception 'Owner could not remove a stale hidden save';
  end if;

  delete from public.message_collections where id = collection_id;

  if exists (
    select 1
    from public.saved_discovery_items saves
    where saves.id in (pin_save_id, mystery_save_id)
      and saves.collection_id is not null
  ) then
    raise exception 'Collection deletion did not move discovery saves to All Library';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000402', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000402","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if exists (select 1 from public.saved_discovery_items) then
    raise exception 'Another member can read private discovery saves';
  end if;
  if exists (select 1 from public.list_my_saved_discovery_items(null, 100)) then
    raise exception 'Another member can list private discovery saves';
  end if;
end
$$;

rollback;

begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000601','authenticated','authenticated','studio-a@example.test','',now(),'{}','{"username":"studio_a","display_name":"Studio A"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000602','authenticated','authenticated','studio-b@example.test','',now(),'{}','{"username":"studio_b","display_name":"Studio B"}',now(),now());

insert into public.shadow_pin_categories (id, creator_id, title, image_url, image_path, processing_status)
values
  ('61000000-0000-0000-0000-000000000601','00000000-0000-0000-0000-000000000601','Studio One','https://example.test/c1.webp','seed/c1.webp','ready'),
  ('61000000-0000-0000-0000-000000000602','00000000-0000-0000-0000-000000000601','Studio Two','https://example.test/c2.webp','seed/c2.webp','ready'),
  ('61000000-0000-0000-0000-000000000603','00000000-0000-0000-0000-000000000602','Blocked Studio','https://example.test/c3.webp','seed/c3.webp','ready');

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;

do $$
declare
  created jsonb;
  repeated jsonb;
  updated jsonb;
  draft_id uuid;
  revision integer;
  denied boolean;
begin
  created := public.create_shadow_pin_creator_draft(
    null, '', null, array['Night Sky','night-sky','  GOLD  '],
    'image_upload', null, '62000000-0000-0000-0000-000000000601'
  );
  repeated := public.create_shadow_pin_creator_draft(
    null, '', null, array[]::text[], 'image_upload', null,
    '62000000-0000-0000-0000-000000000601'
  );
  if created->'draft'->>'id' is distinct from repeated->'draft'->>'id' then
    raise exception 'Create idempotency returned different drafts';
  end if;
  if created->'draft'->>'publish_idempotency_key' is null then
    raise exception 'Draft did not receive a durable publish idempotency key';
  end if;
  if created->'draft'->>'category_id' is not null or created->'draft'->>'title' <> '' then
    raise exception 'Media-first draft required title/category too early';
  end if;

  if created->'asset' <> 'null'::jsonb then raise exception 'New draft received a forged asset snapshot'; end if;
  draft_id := (created->'draft'->>'id')::uuid;
  revision := (created->'draft'->>'revision')::integer;
  updated := public.update_shadow_pin_creator_draft(
    draft_id, revision, 'image_url',
    '61000000-0000-0000-0000-000000000601',
    'A finished title', 'A description',
    array['Night Sky','night-sky',' GOLD ','gold']
  );
  if (updated->>'revision')::integer <> revision + 1
    or updated->>'source_kind' <> 'image_url'
    or jsonb_array_length(updated->'tags') <> 2 then
    raise exception 'Metadata update/revision/tag normalization failed: %', updated;
  end if;

  denied := false;
  begin
    perform public.update_shadow_pin_creator_draft(
      draft_id, revision, 'image_url',
      '61000000-0000-0000-0000-000000000601',
      'stale', null, array[]::text[]
    );
  exception when others then denied := true; end;
  if not denied then raise exception 'Stale revision update was accepted'; end if;

  denied := false;
  begin
    update public.shadow_pin_creator_drafts set state='publish_ready' where id=draft_id;
  exception when others then denied := true; end;
  if not denied then raise exception 'Creator forged draft readiness'; end if;

  denied := false;
  begin
    insert into public.shadow_pin_draft_assets (
      draft_id,creator_id,asset_kind,provider,state,final_image_url,final_image_path
    ) values (draft_id,'00000000-0000-0000-0000-000000000601','image','shadow_pin_storage','publish_ready','x','y');
  exception when others then denied := true; end;
  if not denied then raise exception 'Creator forged an asset row'; end if;

  perform public.create_shadow_pin_creator_draft(
    '61000000-0000-0000-0000-000000000601','Expired draft','',array[]::text[],
    'image_upload',null,'62000000-0000-0000-0000-000000000605'
  );
end
$$;

reset role;

update public.shadow_pin_creator_drafts
set expires_at = now() - interval '1 minute', state = 'publish_ready'
where client_mutation_id = '62000000-0000-0000-0000-000000000605';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;

do $$
declare
  expired_draft public.shadow_pin_creator_drafts%rowtype;
  failure_message text;
begin
  select * into expired_draft from public.shadow_pin_creator_drafts
  where client_mutation_id = '62000000-0000-0000-0000-000000000605';

  begin
    perform public.update_shadow_pin_creator_draft(
      expired_draft.id, expired_draft.revision, expired_draft.source_kind,
      expired_draft.category_id, expired_draft.title, expired_draft.description, expired_draft.tags
    );
    raise exception 'Expired draft metadata update was accepted';
  exception when others then
    get stacked diagnostics failure_message = message_text;
    if failure_message <> 'Draft has expired' then raise; end if;
  end;

  begin
    perform public.finalize_shadow_pin_creator_draft(
      expired_draft.id, expired_draft.revision, expired_draft.publish_idempotency_key
    );
    raise exception 'Expired draft finalize was accepted';
  exception when others then
    get stacked diagnostics failure_message = message_text;
    if failure_message <> 'Draft has expired' then raise; end if;
  end;
end
$$;

reset role;

-- Trusted worker prepares immutable ready media without creating a live pin.
insert into public.shadow_pin_draft_assets (
  id,draft_id,creator_id,generation,asset_kind,provider,state,
  storage_bucket,original_path,thumbnail_path,medium_path,
  final_image_url,final_image_path,final_thumbnail_url,final_thumbnail_path,
  final_medium_url,final_medium_path,content_type,size_bytes,image_width,image_height
)
select
  '63000000-0000-0000-0000-000000000601',draft.id,draft.creator_id,1,
  'image','shadow_pin_storage','publish_ready','shadow-pin-drafts',
  draft.creator_id||'/'||draft.id||'/original.webp','thumb.webp','medium.webp',
  'https://example.test/final.webp','final/pin.webp','https://example.test/thumb.webp','final/thumb.webp',
  'https://example.test/medium.webp','final/medium.webp','image/webp',2048,1200,1600
from public.shadow_pin_creator_drafts draft
where draft.client_mutation_id='62000000-0000-0000-0000-000000000601';

update public.shadow_pin_creator_drafts draft set
  active_asset_id='63000000-0000-0000-0000-000000000601', state='publish_ready'
where draft.client_mutation_id='62000000-0000-0000-0000-000000000601';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000602',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000602","role":"authenticated"}',true);
set local role authenticated;

do $$
declare denied boolean := false;
begin
  if exists (select 1 from public.shadow_pin_creator_drafts) then raise exception 'Cross-owner draft leaked'; end if;
  if exists (select 1 from public.list_my_shadow_pin_creator_drafts(50)) then raise exception 'Cross-owner list leaked'; end if;
  begin
    perform public.finalize_shadow_pin_creator_draft(
      (select id from public.shadow_pin_creator_drafts limit 1),1,gen_random_uuid()
    );
  exception when others then denied := true; end;
  if not denied then raise exception 'Cross-owner finalize was accepted'; end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;

do $$
declare
  draft_row public.shadow_pin_creator_drafts%rowtype;
  first_result record;
  retry_result record;
  denied boolean;
begin
  select * into draft_row from public.shadow_pin_creator_drafts
  where client_mutation_id='62000000-0000-0000-0000-000000000601';

  select * into first_result from public.finalize_shadow_pin_creator_draft(
    draft_row.id,draft_row.revision,draft_row.publish_idempotency_key
  );
  if first_result.was_already_published
    or first_result.image->>'processing_status' <> 'ready'
    or first_result.image->>'creator_draft_id' <> draft_row.id::text then
    raise exception 'First finalize did not create one ready canonical pin';
  end if;

  select * into retry_result from public.finalize_shadow_pin_creator_draft(
    draft_row.id,(first_result.draft->>'revision')::integer,draft_row.publish_idempotency_key
  );
  if not retry_result.was_already_published
    or retry_result.image->>'id' <> first_result.image->>'id' then
    raise exception 'Finalize retry was not idempotent';
  end if;
  if (select count(*) from public.shadow_pin_images where id=(first_result.image->>'id')::uuid) <> 1 then
    raise exception 'Finalize created duplicate canonical pins';
  end if;
  if (select count(*) from public.shadow_pin_image_tags where image_id=(first_result.image->>'id')::uuid) <> 2 then
    raise exception 'Finalize did not publish tags transactionally';
  end if;

  denied := false;
  begin
    perform public.finalize_shadow_pin_creator_draft(
      draft_row.id,(first_result.draft->>'revision')::integer,gen_random_uuid()
    );
  exception when others then denied := true; end;
  if not denied then raise exception 'Wrong publish idempotency key was accepted'; end if;
end
$$;

-- Replacement draft may move categories, but live media is untouched until finalize.
do $$
declare
  canonical_id uuid;
  original_url text;
  draft_json jsonb;
begin
  select id,image_url into canonical_id,original_url
  from public.shadow_pin_images where creator_draft_id is not null limit 1;
  draft_json := public.create_shadow_pin_creator_draft(
    '61000000-0000-0000-0000-000000000602','Replacement','',array['new'],
    'image_upload',canonical_id,'62000000-0000-0000-0000-000000000602'
  );
  if draft_json->'asset' is null
    or draft_json->'asset'->>'state' <> 'publish_ready'
    or draft_json->'draft'->>'active_asset_id' is null then
    raise exception 'Replacement did not receive a server-owned current-media snapshot';
  end if;
  if (select image_url from public.shadow_pin_images where id=canonical_id) <> original_url then
    raise exception 'Creating replacement mutated live media';
  end if;
end
$$;

reset role;
insert into public.shadow_pin_draft_assets (
  id,draft_id,creator_id,generation,asset_kind,provider,state,
  final_image_url,final_image_path,final_thumbnail_url,final_thumbnail_path,
  final_medium_url,final_medium_path,content_type,size_bytes
)
select '63000000-0000-0000-0000-000000000602',id,creator_id,2,'image','shadow_pin_storage','publish_ready',
  'https://example.test/replacement.webp','final/replacement.webp',
  'https://example.test/replacement-thumb.webp','final/replacement-thumb.webp',
  'https://example.test/replacement-medium.webp','final/replacement-medium.webp','image/webp',1024
from public.shadow_pin_creator_drafts where client_mutation_id='62000000-0000-0000-0000-000000000602';
update public.shadow_pin_creator_drafts set active_asset_id='63000000-0000-0000-0000-000000000602',state='publish_ready'
where client_mutation_id='62000000-0000-0000-0000-000000000602';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;

do $$
declare draft_row public.shadow_pin_creator_drafts%rowtype; result_row record;
begin
  select * into draft_row from public.shadow_pin_creator_drafts
  where client_mutation_id='62000000-0000-0000-0000-000000000602';
  select * into result_row from public.finalize_shadow_pin_creator_draft(
    draft_row.id,draft_row.revision,draft_row.publish_idempotency_key
  );
  if result_row.image->>'category_id' <> '61000000-0000-0000-0000-000000000602'
    or result_row.image->>'image_url' <> 'https://example.test/replacement.webp'
    or (select count(*) from public.shadow_pin_images where creator_id='00000000-0000-0000-0000-000000000601') <> 1 then
    raise exception 'Replacement did not atomically reuse the canonical row';
  end if;
end
$$;

reset role;

-- Existing operator edit compatibility: ordinary members cannot draft another
-- creator's pin, while an operator can and the canonical creator stays intact.
insert into public.shadow_pin_images (
  id,category_id,creator_id,title,image_url,image_path,processing_status,
  processed_at,media_type,source_type,provider
) values (
  '64000000-0000-0000-0000-000000000601',
  '61000000-0000-0000-0000-000000000603',
  '00000000-0000-0000-0000-000000000602',
  'Member B pin','https://example.test/member-b.webp','member-b/original.webp',
  'ready',now(),'image','file_upload','shadow_pin_storage'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;

do $$
declare denied boolean := false;
begin
  begin
    perform public.create_shadow_pin_creator_draft(
      '61000000-0000-0000-0000-000000000603','Unauthorized edit','',array[]::text[],
      'image_upload','64000000-0000-0000-0000-000000000601',
      '62000000-0000-0000-0000-000000000603'
    );
  exception when others then denied := true; end;
  if not denied then raise exception 'Nonoperator created a replacement draft for another creator'; end if;
end
$$;

reset role;
insert into public.user_roles (user_id,role,created_by)
values (
  '00000000-0000-0000-0000-000000000601','sub_admin',
  '00000000-0000-0000-0000-000000000601'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;

do $$
declare bundle jsonb; draft_row jsonb; result_row record;
begin
  bundle := public.create_shadow_pin_creator_draft(
    '61000000-0000-0000-0000-000000000603','Operator update','',array['reviewed'],
    'image_upload','64000000-0000-0000-0000-000000000601',
    '62000000-0000-0000-0000-000000000604'
  );
  draft_row := bundle->'draft';
  if bundle->'asset'->>'state' <> 'publish_ready' then
    raise exception 'Operator replacement did not receive a server snapshot';
  end if;
  select * into result_row from public.finalize_shadow_pin_creator_draft(
    (draft_row->>'id')::uuid,
    (draft_row->>'revision')::integer,
    (draft_row->>'publish_idempotency_key')::uuid
  );
  if result_row.image->>'id' <> '64000000-0000-0000-0000-000000000601'
    or result_row.image->>'creator_id' <> '00000000-0000-0000-0000-000000000602'
    or result_row.image->>'title' <> 'Operator update' then
    raise exception 'Operator replacement changed identity or failed to update canonical media';
  end if;
end
$$;

reset role;

-- A replacement draft captures the target version and refuses to overwrite a
-- canonical Pin that changed after the draft began.
insert into public.shadow_pin_images (
  id,category_id,creator_id,title,image_url,image_path,processing_status,
  processed_at,media_type,source_type,provider
) values (
  '64000000-0000-0000-0000-000000000602',
  '61000000-0000-0000-0000-000000000601',
  '00000000-0000-0000-0000-000000000601',
  'Versioned pin','https://example.test/version-1.webp','versioned/v1.webp',
  'ready',now(),'image','file_upload','shadow_pin_storage'
);

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;
do $$
declare bundle jsonb;
begin
  bundle := public.create_shadow_pin_creator_draft(
    '61000000-0000-0000-0000-000000000601','Stale replacement','',array[]::text[],
    'image_upload','64000000-0000-0000-0000-000000000602',
    '62000000-0000-0000-0000-000000000606'
  );
  if bundle->'draft'->>'target_image_updated_at' is null then
    raise exception 'Replacement draft did not capture target updated_at';
  end if;
end
$$;
reset role;

insert into public.shadow_pin_draft_assets (
  id,draft_id,creator_id,generation,asset_kind,provider,state,
  final_image_url,final_image_path,content_type,size_bytes
)
select '63000000-0000-0000-0000-000000000606',id,creator_id,2,
  'image','shadow_pin_storage','publish_ready',
  'https://example.test/stale-replacement.webp','final/stale-replacement.webp','image/webp',1024
from public.shadow_pin_creator_drafts
where client_mutation_id='62000000-0000-0000-0000-000000000606';
update public.shadow_pin_creator_drafts set
  active_asset_id='63000000-0000-0000-0000-000000000606',state='publish_ready'
where client_mutation_id='62000000-0000-0000-0000-000000000606';
update public.shadow_pin_images set title='Edited elsewhere'
where id='64000000-0000-0000-0000-000000000602';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;
do $$
declare draft_row public.shadow_pin_creator_drafts%rowtype; failure_message text;
begin
  select * into draft_row from public.shadow_pin_creator_drafts
  where client_mutation_id='62000000-0000-0000-0000-000000000606';
  begin
    perform public.finalize_shadow_pin_creator_draft(
      draft_row.id,draft_row.revision,draft_row.publish_idempotency_key
    );
    raise exception 'Stale replacement finalize was accepted';
  exception when others then
    get stacked diagnostics failure_message = message_text;
    if failure_message <> 'Target Pin changed after this draft was created' then raise; end if;
  end;
end
$$;
reset role;

-- Image promotion leases are exclusive, expire, and can be recovered. Active
-- assets and lifetime generations are bounded in the database under races.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  perform public.create_shadow_pin_creator_draft(
    '61000000-0000-0000-0000-000000000601','Lease draft','',array[]::text[],
    'image_upload',null,'62000000-0000-0000-0000-000000000607'
  );
end
$$;
reset role;

insert into public.shadow_pin_draft_assets (
  id,draft_id,creator_id,generation,asset_kind,provider,state,
  storage_bucket,original_path,thumbnail_path,medium_path,content_type,size_bytes
)
select '63000000-0000-0000-0000-000000000607',id,creator_id,1,
  'image','shadow_pin_storage','ready','shadow-pin-drafts',
  creator_id||'/'||id||'/original.webp','private/thumb.webp','private/medium.webp','image/webp',1024
from public.shadow_pin_creator_drafts
where client_mutation_id='62000000-0000-0000-0000-000000000607';
update public.shadow_pin_creator_drafts set
  active_asset_id='63000000-0000-0000-0000-000000000607',state='ready'
where client_mutation_id='62000000-0000-0000-0000-000000000607';

do $$
declare
  draft_row public.shadow_pin_creator_drafts%rowtype;
  claimed jsonb;
  denied boolean := false;
begin
  select * into draft_row from public.shadow_pin_creator_drafts
  where client_mutation_id='62000000-0000-0000-0000-000000000607';
  claimed := public.claim_shadow_pin_image_promotion(
    draft_row.creator_id,draft_row.id,draft_row.revision,
    '63000000-0000-0000-0000-000000000607',
    '65000000-0000-0000-0000-000000000607',180
  );
  if claimed->>'state' <> 'preparing_publish' then raise exception 'Promotion lease was not claimed'; end if;
  begin
    perform public.claim_shadow_pin_image_promotion(
      draft_row.creator_id,draft_row.id,(claimed->>'revision')::integer,
      '63000000-0000-0000-0000-000000000607',
      '65000000-0000-0000-0000-000000000608',180
    );
  exception when others then denied := true; end;
  if not denied then raise exception 'Concurrent promotion lease was accepted'; end if;

  update public.shadow_pin_creator_drafts set promotion_lease_expires_at=now()-interval '1 minute'
  where id=draft_row.id;
  select * into draft_row from public.shadow_pin_creator_drafts where id=draft_row.id;
  claimed := public.claim_shadow_pin_image_promotion(
    draft_row.creator_id,draft_row.id,draft_row.revision,
    '63000000-0000-0000-0000-000000000607',
    '65000000-0000-0000-0000-000000000608',180
  );
  perform public.release_shadow_pin_image_promotion(
    draft_row.creator_id,draft_row.id,
    '65000000-0000-0000-0000-000000000608','ready'
  );
  if exists (
    select 1 from public.shadow_pin_creator_drafts
    where id=draft_row.id and promotion_lease_token is not null
  ) then raise exception 'Promotion lease was not released'; end if;

  insert into public.shadow_pin_draft_assets (
    id,draft_id,creator_id,generation,asset_kind,provider,state,content_type
  ) values
    ('63000000-0000-0000-0000-000000000617',draft_row.id,draft_row.creator_id,2,'image','shadow_pin_storage','ready','image/webp'),
    ('63000000-0000-0000-0000-000000000627',draft_row.id,draft_row.creator_id,3,'image','shadow_pin_storage','ready','image/webp'),
    ('63000000-0000-0000-0000-000000000637',draft_row.id,draft_row.creator_id,4,'image','shadow_pin_storage','ready','image/webp');
  denied := false;
  begin
    insert into public.shadow_pin_draft_assets (
      id,draft_id,creator_id,generation,asset_kind,provider,state,content_type
    ) values (
      '63000000-0000-0000-0000-000000000647',draft_row.id,draft_row.creator_id,5,
      'image','shadow_pin_storage','ready','image/webp'
    );
  exception when others then denied := true; end;
  if not denied then raise exception 'Fifth active draft asset was accepted'; end if;

  denied := false;
  begin
    insert into public.shadow_pin_draft_assets (
      id,draft_id,creator_id,generation,asset_kind,provider,state,content_type
    ) values (
      '63000000-0000-0000-0000-000000000657',draft_row.id,draft_row.creator_id,33,
      'image','shadow_pin_storage','failed','image/webp'
    );
  exception when others then denied := true; end;
  if not denied then raise exception 'Generation 33 was accepted'; end if;
end
$$;

-- Bunny playback remains absent from the owner-visible draft row until the
-- authenticated transactional Bunny finalizer publishes the canonical Pin.
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  perform public.create_shadow_pin_creator_draft(
    '61000000-0000-0000-0000-000000000601','Private Bunny draft','',array[]::text[],
    'video_upload',null,'62000000-0000-0000-0000-000000000608'
  );
end
$$;
reset role;
insert into public.shadow_pin_draft_assets (
  id,draft_id,creator_id,generation,asset_kind,provider,state,
  final_image_url,final_image_path,provider_asset_id,provider_playback_id,
  video_preview_url,video_playback_url,video_hls_url,video_embed_url,content_type,size_bytes
)
select '63000000-0000-0000-0000-000000000608',id,creator_id,1,
  'video','bunny_stream','ready','/video-poster.webp','bunny:private:poster',
  'bunny-private-asset','bunny-private-asset',null,null,null,null,'image/webp',2048
from public.shadow_pin_creator_drafts
where client_mutation_id='62000000-0000-0000-0000-000000000608';
update public.shadow_pin_creator_drafts set
  active_asset_id='63000000-0000-0000-0000-000000000608',state='ready'
where client_mutation_id='62000000-0000-0000-0000-000000000608';

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000601',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000601","role":"authenticated"}',true);
set local role authenticated;
do $$
declare draft_row public.shadow_pin_creator_drafts%rowtype; result_row record; denied boolean := false;
begin
  select * into draft_row from public.shadow_pin_creator_drafts
  where client_mutation_id='62000000-0000-0000-0000-000000000608';
  if exists (
    select 1 from public.shadow_pin_draft_assets where id=draft_row.active_asset_id
      and coalesce(video_preview_url,video_playback_url,video_hls_url,video_embed_url) is not null
  ) then raise exception 'Unpublished Bunny draft exposed playback URLs'; end if;
  begin
    perform public.finalize_shadow_pin_creator_draft(
      draft_row.id,draft_row.revision,draft_row.publish_idempotency_key
    );
  exception when others then denied := true; end;
  if not denied then raise exception 'Regular finalizer published a private Bunny draft'; end if;

  select * into result_row from public.finalize_shadow_pin_creator_bunny_draft(
    draft_row.id,draft_row.revision,draft_row.publish_idempotency_key,draft_row.active_asset_id,
    'https://cdn.example.test/preview.mp4','https://cdn.example.test/playback.mp4',
    'https://cdn.example.test/playlist.m3u8','https://player.example.test/embed'
  );
  if result_row.image->>'video_embed_url' <> 'https://player.example.test/embed'
    or result_row.image->>'provider_asset_id' <> 'bunny-private-asset' then
    raise exception 'Transactional Bunny finalizer did not publish playback';
  end if;
end
$$;
reset role;

do $$
begin
  if (select public from storage.buckets where id='shadow-pin-drafts') then
    raise exception 'Draft bucket is public';
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public'
      and tablename in ('shadow_pin_creator_drafts','shadow_pin_draft_assets')
  ) then raise exception 'Private drafts were added to Realtime publication'; end if;
  if has_table_privilege('authenticated','public.shadow_pin_creator_drafts','INSERT')
    or has_table_privilege('authenticated','public.shadow_pin_creator_drafts','UPDATE')
    or has_table_privilege('authenticated','public.shadow_pin_draft_assets','INSERT')
    or has_table_privilege('authenticated','public.shadow_pin_draft_assets','UPDATE') then
    raise exception 'Authenticated role can forge server-owned draft state';
  end if;
  if has_function_privilege('anon','public.finalize_shadow_pin_creator_draft(uuid,integer,uuid)','EXECUTE')
    or has_function_privilege('service_role','public.finalize_shadow_pin_creator_draft(uuid,integer,uuid)','EXECUTE') then
    raise exception 'Finalize ACL is broader than authenticated members';
  end if;
end
$$;

rollback;

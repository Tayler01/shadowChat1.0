-- Activation only: compatible profile consumers, trusted media producers,
-- completed historical repairs and a working evidence capture worker are
-- required. The foundation release must exclude this migration entirely.
-- Applying it does not flip Storage/Bunny privacy or hosted Realtime settings.
begin;

-- BEGIN historical_media_capture_guard
-- Existing immutable evidence cannot be replayed through an INSERT trigger.
-- Lock out new reports until the capture trigger is installed so a report cannot
-- enter between this inventory and activation. Any historical media without
-- reviewed provenance requires a separate capture/backfill before proceeding.
lock table public.moderation_evidence in share row exclusive mode;
do $historical_media$
begin
  if exists (
    select 1 from public.moderation_evidence e
    cross join lateral jsonb_each(e.snapshot) item
    where item.key in ('fileUrl','audioUrl','thumbnailUrl','imageUrl','avatarUrl','avatarThumbnailUrl')
      and jsonb_typeof(item.value)='string' and length(item.value #>> '{}')>0
      and not exists (select 1 from private.moderation_media_assets m
        where m.evidence_id=e.id and m.media_key=item.key)
  ) or exists (
    select 1 from public.moderation_evidence e
    join public.shadow_pin_images p on e.target_type='shadow_pin_image'
      and p.id=e.target_id and p.creator_id=e.source_author_id and p.provider='bunny_stream'
    join private.bunny_media_assets a on a.source_type='shadow_pin_image' and a.source_id=p.id
      and a.owner_id=p.creator_id and a.asset_id::text=p.provider_asset_id
    where not exists (select 1 from private.moderation_media_assets m
      where m.evidence_id=e.id and m.media_key='trustedVideo')
  ) then
    raise exception 'Historical report media requires reviewed capture before privacy activation';
  end if;
end;
$historical_media$;
-- END historical_media_capture_guard

-- BEGIN deletion_foreign_keys
-- BEGIN deletion_pin_reference
alter table public.messages drop constraint if exists messages_pinned_by_fkey;
alter table public.messages add constraint messages_pinned_by_fkey
  foreign key (pinned_by) references public.users(id) on delete set null;
-- END deletion_pin_reference
-- These columns describe an editor/moderator/host, not ownership of another
-- member's content. Preserve that content and anonymize the departed actor.
alter table public.shado_tv_captions alter column created_by drop not null;
alter table public.shado_tv_captions drop constraint shado_tv_captions_created_by_fkey;
alter table public.shado_tv_captions add constraint shado_tv_captions_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;
alter table public.shado_live_access_members alter column added_by drop not null;
alter table public.shado_live_access_members drop constraint shado_live_access_members_added_by_fkey;
alter table public.shado_live_access_members add constraint shado_live_access_members_added_by_fkey
  foreign key (added_by) references public.users(id) on delete set null;
alter table public.shado_live_restrictions alter column created_by drop not null;
alter table public.shado_live_restrictions drop constraint shado_live_restrictions_created_by_fkey;
alter table public.shado_live_restrictions add constraint shado_live_restrictions_created_by_fkey
  foreign key (created_by) references public.users(id) on delete set null;
alter table public.live_rooms alter column host_user_id drop not null;
alter table public.live_rooms drop constraint live_rooms_host_user_id_fkey;
alter table public.live_rooms add constraint live_rooms_host_user_id_fkey
  foreign key (host_user_id) references public.users(id) on delete set null;
alter table public.live_room_messages drop constraint live_room_messages_sender_user_id_fkey;
alter table public.live_room_messages add constraint live_room_messages_sender_user_id_fkey
  foreign key (sender_user_id) references public.users(id) on delete cascade;
-- Safety-case actions retain their historical ban reference. Unlinked bans are
-- erased during deletion; linked rows survive with the subject anonymized.
alter table public.user_channel_bans alter column target_user_id drop not null;
alter table public.user_channel_bans drop constraint user_channel_bans_target_user_id_fkey;
alter table public.user_channel_bans add constraint user_channel_bans_target_user_id_fkey
  foreign key (target_user_id) references public.users(id) on delete set null;

create or replace function private.reject_shado_live_append_only_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_row jsonb := to_jsonb(old); new_row jsonb := to_jsonb(new);
  deleting_user uuid := nullif(current_setting('shadowchat.account_deletion_user', true), '')::uuid;
begin
  -- FK actions may only remove identifiers; every other byte stays immutable.
  if tg_op = 'UPDATE' then
    if tg_table_name = 'live_room_events'
      and new_row - 'actor_user_id' - 'target_user_id' - 'room_id' = old_row - 'actor_user_id' - 'target_user_id' - 'room_id'
      and (new_row->'actor_user_id' = old_row->'actor_user_id' or new_row->'actor_user_id' = 'null'::jsonb)
      and (new_row->'target_user_id' = old_row->'target_user_id' or new_row->'target_user_id' = 'null'::jsonb)
      and (new_row->'room_id' = old_row->'room_id' or new_row->'room_id' = 'null'::jsonb) then return new; end if;
    if tg_table_name = 'live_provider_webhook_receipts'
      and new_row - 'participant_user_id' - 'room_id' = old_row - 'participant_user_id' - 'room_id'
      and (new_row->'participant_user_id' = old_row->'participant_user_id' or new_row->'participant_user_id' = 'null'::jsonb)
      and (new_row->'room_id' = old_row->'room_id' or new_row->'room_id' = 'null'::jsonb) then return new; end if;
  end if;
  -- Only the service role, with a durable deletion job, may erase ordinary
  -- provider audit rows tied to that member. Safety-case snapshots are separate.
  if tg_op = 'DELETE' and current_setting('role', true) = 'service_role'
    and deleting_user is not null and exists (
      select 1 from private.account_deletion_jobs where user_id = deleting_user
      and state in ('storage_removed', 'data_removed'))
    and (
      (tg_table_name = 'live_room_events' and (old_row->>'actor_user_id' = deleting_user::text or old_row->>'target_user_id' = deleting_user::text))
      or (tg_table_name = 'live_provider_webhook_receipts' and (old_row->>'participant_user_id' = deleting_user::text or old_row->>'participant_identity' = deleting_user::text))
    ) then return old; end if;
  raise exception '% is append-only', tg_table_name;
end;
$$;

-- END deletion_foreign_keys

-- BEGIN safe_profile_rpc_arguments
-- Whole-row users arguments require table-wide SELECT even when the formatter
-- only emits public fields. Preserve existing joins and RLS by passing exactly
-- the existing 26 public fields to a pure scalar overload; no extra row lookup.
-- STABLE keeps timestamptz JSON sensitive to TimeZone across prepared-plan reuse.
create or replace function public.user_public_profile_json(
  p_id uuid,
  p_username text,
  p_display_name text,
  p_avatar_url text,
  p_avatar_thumbnail_url text,
  p_avatar_thumbnail_path text,
  p_banner_url text,
  p_banner_thumbnail_url text,
  p_banner_thumbnail_path text,
  p_status text,
  p_status_message text,
  p_presence_visibility text,
  p_color text,
  p_chat_color text,
  p_admin_role text,
  p_checkers_crown boolean,
  p_war_sword boolean,
  p_shadow_pin_gold_pin boolean,
  p_shadow_runner_sprint_medal boolean,
  p_shadow_runner_knight_medal boolean,
  p_shadow_runner_knight_level_id text,
  p_gold_easter_egg boolean,
  p_dm_discoverable boolean,
  p_last_active timestamp with time zone,
  p_created_at timestamp with time zone,
  p_updated_at timestamp with time zone
) returns jsonb language sql stable security invoker set search_path = '' as $profile_json$
  select case when p_id is null then null::jsonb else jsonb_build_object(
    'id', p_id,
    'username', p_username,
    'display_name', p_display_name,
    'avatar_url', p_avatar_url,
    'avatar_thumbnail_url', p_avatar_thumbnail_url,
    'avatar_thumbnail_path', p_avatar_thumbnail_path,
    'banner_url', p_banner_url,
    'banner_thumbnail_url', p_banner_thumbnail_url,
    'banner_thumbnail_path', p_banner_thumbnail_path,
    'status', p_status,
    'status_message', p_status_message,
    'presence_visibility', p_presence_visibility,
    'color', p_color,
    'chat_color', p_chat_color,
    'admin_role', p_admin_role,
    'checkers_crown', p_checkers_crown,
    'war_sword', p_war_sword,
    'shadow_pin_gold_pin', p_shadow_pin_gold_pin,
    'shadow_runner_sprint_medal', p_shadow_runner_sprint_medal,
    'shadow_runner_knight_medal', p_shadow_runner_knight_medal,
    'shadow_runner_knight_level_id', p_shadow_runner_knight_level_id,
    'gold_easter_egg', p_gold_easter_egg,
    'dm_discoverable', p_dm_discoverable,
    'last_active', p_last_active,
    'created_at', p_created_at,
    'updated_at', p_updated_at
  ) end;
$profile_json$;
revoke all on function public.user_public_profile_json(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,timestamp with time zone,timestamp with time zone,timestamp with time zone) from public, anon;
grant execute on function public.user_public_profile_json(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,timestamp with time zone,timestamp with time zone,timestamp with time zone) to authenticated, service_role;

-- Exact read-only parent/branch fingerprints reviewed 2026-10-23. This replaces
-- only scalar arguments in 13 public INVOKER RPCs and one owner-only Connection
-- notification helper. The global unknown-caller guard remains strict. Existing
-- signatures, joins, filters, source authorization, settings and grants survive.
-- Already rewritten bodies are accepted; unknown source drift aborts atomically.
do $profile_rpc$
declare
  item record;
  procedure_id oid;
  actual_hash text;
  definition text;
  profile_alias text;
  arguments text;
  call_count integer;
begin
  for item in select * from (values
    ('public', 'get_dm_message_window(uuid,uuid,integer)', '03910da8612dcac655aebbddd559e2650a9695b97064c601e1c8e986b7d4a3b3', 'db10adb8a24531da43209bc2bb4c575f44c78e57f5bda7fe145339cfd5355b26', ARRAY['profiles'], 1),
    ('public', 'get_dm_read_window(uuid,uuid,timestamp with time zone,uuid,timestamp with time zone,uuid,boolean,integer)', '006bcbec5927ab28dcfaf93b14d38bfa12aaa4e17ea44b8f4813e140ace2db25', '499a1592062f340988d588bdc3be8a40dab0190576555c7a41df4f8f56ba8e98', ARRAY['author'], 1),
    ('public', 'get_general_chat_message_window(uuid,uuid,timestamp with time zone,integer)', '595a66674e9d821e59918310a146f9035829ca364d7daf07fe59da5b5d053b55', '770fe2c6d5d02a878af3b3f9951c6b434f9237f4f719729c644f207ff9381bf9', ARRAY['user_row'], 2),
    ('public', 'get_general_chat_thread(uuid,uuid,timestamp with time zone,uuid,integer)', 'ba298736f0bab250be0add41f31f5eb6271411c6314d4eccda84561427a9eac1', '49e185670ed4fe433b2a684b0ee6d01574667ad56638ae465e04f4bf7d188d87', ARRAY['root_author','reply_author'], 2),
    ('public', 'get_general_chat_thread_read_window(uuid,uuid,timestamp with time zone,uuid,timestamp with time zone,uuid,boolean,integer)', 'da92f712ffdecc556fbd5b35c3840d71d394c5b9960c83a3c2cdeaa2727378be', '52cff22c534757dd4b69d5079213b326bd102725a103ac6125397003a6093f4d', ARRAY['author'], 2),
    ('public', 'get_general_chat_thread_summaries(uuid[])', '1da8e6bc1313776212a40531a81ce85ae5b3378d489ddab0eb6f25c74849c7c7', '93a86167c66b791d84c82b8413c841186d4bd436d6ce6756298e9614de4376ac', ARRAY['latest_author','participant_profile'], 2),
    ('public', 'get_general_chat_threaded_window(uuid,uuid,timestamp with time zone,integer)', '33ba22df7af471f29869e5ec4a6e16bd1a97ef4ea6a4dd32c297d12f667c7ed7', 'fc6e6b1d6ba3932baafa40783b47f33c22004577acd5813c968eb72576cd9759', ARRAY['author'], 2),
    ('public', 'get_my_catch_up_v1(integer,integer)', '3e78f8399de70137f7c8cfc8737d50f86059952f6f833bd493e28e4a64b81e50', '7d94fff461f285dec1894c5b318d25ed72c9c1020452e592ac8a4c9757d78834', ARRAY['actor','other_user','author'], 3),
    ('public', 'list_dm_shared_content(uuid,text,integer,timestamp with time zone,uuid)', '3dfc5534f52b4177babf96e96d971c0a220bed0b3c7f5482b7d39a813f388ec6', '3071bd8e6f9512d079d074414a3f3bfadca26cc5507aa5e0204263b6131b0b8a', ARRAY['profiles'], 1),
    ('public', 'list_my_saved_discovery_items(uuid,integer)', 'defec34ef15ac96048e976cac8633ee665e2ff3f5af22617fd9c49aef4e1c777', 'a74ea545441e2810f44e38b9ae6f6a4322761c386ca8263b125ed8ccf9424919', ARRAY['profiles'], 1),
    ('public', 'list_my_saved_messages(uuid,integer)', '4df0f3fb0a19e544e267ecb183aae32e8ce56912a6e39a620df0ab5a3d9855c2', '258dd7cc5a4444423394771b1ac2ab5775f1277487b3536371f768aea15f2977', ARRAY['profiles'], 2),
    ('public', 'search_dm_conversation_messages(uuid,text,integer,timestamp with time zone,uuid)', 'b01864ba1d17bb3f11569b21c9d2b87f02d5c2b4ca1cd3a91fdd92697a9fa835', '16a0cb5fa25cd6194870d584c8def082a0be2b56db02f946ae253522b0500405', ARRAY['profiles'], 1),
    ('public', 'search_my_messages(text,integer,timestamp with time zone)', 'd9f9b30a2427f684cee213dc520aba2ce1159b375dc4fc8d24b444405e4ef32d', 'ba03770fd080c961079b66cd8c33203595af7f2a6ff5f4ec93581631487ce155', ARRAY['profiles'], 2),
    ('connections_private', 'emit_connection_notification(public.user_connections,uuid,uuid,text,text)', 'a958763c59003cbc786032671a7bf0b7af0c42ef9b8215d58a91a2bdd03efd18', 'be64e6500033b7a6b3f7d1468d0af62376eb692b176d335e08b0e17cdea3097a', ARRAY['profiles'], 1)
  ) reviewed(schema_name, signature, before_hash, after_hash, aliases, call_count) loop
    procedure_id := to_regprocedure(item.schema_name || '.' || item.signature);
    if procedure_id is null then raise exception 'Required profile RPC is missing: %', item.signature; end if;
    if (select prosecdef from pg_proc where oid=procedure_id) then
      raise exception 'Profile RPC must remain SECURITY INVOKER: %', item.signature;
    end if;
    select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex'), pg_get_functiondef(oid)
      into actual_hash, definition from pg_proc where oid=procedure_id;
    if actual_hash = item.after_hash then continue; end if;
    if actual_hash is distinct from item.before_hash then
      raise exception 'Unreviewed profile RPC source drift: %', item.signature;
    end if;
    select count(*) into call_count from regexp_matches(definition,
      'public\.user_public_profile_json\([a-z_]+\)', 'g');
    if call_count <> item.call_count then raise exception 'Unexpected profile call count: %', item.signature; end if;
    foreach profile_alias in array item.aliases loop
      select string_agg(format('%I.%I', profile_alias, column_name), ', ' order by ordinal)
        into arguments from unnest(ARRAY['id','username','display_name','avatar_url','avatar_thumbnail_url','avatar_thumbnail_path','banner_url','banner_thumbnail_url','banner_thumbnail_path','status','status_message','presence_visibility','color','chat_color','admin_role','checkers_crown','war_sword','shadow_pin_gold_pin','shadow_runner_sprint_medal','shadow_runner_knight_medal','shadow_runner_knight_level_id','gold_easter_egg','dm_discoverable','last_active','created_at','updated_at']) with ordinality fields(column_name, ordinal);
      definition := replace(definition, 'public.user_public_profile_json(' || profile_alias || ')',
        'public.user_public_profile_json(' || arguments || ')');
    end loop;
    execute definition;
    if (select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') from pg_proc where oid=procedure_id)
      is distinct from item.after_hash then raise exception 'Profile RPC rewrite mismatch: %', item.signature; end if;
  end loop;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where not p.prosecdef and n.nspname not in ('pg_catalog','information_schema')
      and p.prosrc ~* 'public\.user_public_profile_json\(\s*[a-z_][a-z_0-9]*\s*\)') then
    raise exception 'An unreviewed INVOKER still passes a whole profile row';
  end if;
end;
$profile_rpc$;
-- END safe_profile_rpc_arguments

-- BEGIN profile_identity
-- Preserve the exact safe profile projection from the reviewed containment SQL.
revoke select on table public.users from public, anon, authenticated;
revoke select (email, full_name) on table public.users from public, anon, authenticated;
grant select (
  id, username, display_name,
  avatar_url, avatar_thumbnail_url, avatar_thumbnail_path,
  banner_url, banner_thumbnail_url, banner_thumbnail_path,
  status, status_message, presence_visibility, color, chat_color, admin_role,
  checkers_crown, war_sword, shadow_pin_gold_pin, shadow_runner_sprint_medal,
  shadow_runner_knight_medal, shadow_runner_knight_level_id, gold_easter_egg,
  dm_discoverable, last_active, created_at, updated_at
) on table public.users to authenticated;
-- END profile_identity

-- BEGIN bunny_pin_identity
create trigger guard_bunny_pin_identity before insert or update on public.shadow_pin_images
for each row execute function private.guard_bunny_pin_identity();
-- END bunny_pin_identity

-- BEGIN realtime_private_channels
-- Postgres Changes retains the canonical source table's row authorization.
create policy "Active members join database and release channels"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select private.is_active_member())
  and ((select realtime.topic()) like 'shadowchat:db:%'
    or (select realtime.topic()) = 'app-release-updates')
);
create policy "Constrain member realtime topics"
on realtime.messages as restrictive for select to authenticated
using (
  extension = 'broadcast'
  and (select private.is_active_member())
  and ((select realtime.topic()) like 'shadowchat:db:%'
    or (select realtime.topic()) = 'app-release-updates')
);
create policy "No anonymous private realtime reads"
on realtime.messages as restrictive for select to anon using (false);
create policy "No browser Broadcast or Presence writes"
on realtime.messages as restrictive for insert to anon, authenticated
with check (false);
-- END realtime_private_channels

-- BEGIN reported_media_evidence
create trigger queue_reported_media after insert on public.moderation_evidence for each row execute function private.queue_reported_media();
create trigger queue_report_attachment after insert on public.moderation_report_attachments for each row execute function private.queue_report_attachment_trigger();
select private.queue_moderation_attachment(id,true) from public.moderation_report_attachments;
create trigger guard_reported_media_storage before update or delete on storage.objects for each row execute function private.guard_reported_media_storage();
-- END reported_media_evidence

commit;

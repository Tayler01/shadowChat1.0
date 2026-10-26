-- Synthetic schema for the 18 reviewed migrations. No remote schema/data reads.
create role anon;
create role authenticated;
create role service_role bypassrls;
create role authenticator;
create schema auth;
create schema private;
create schema storage;
create schema realtime;
revoke all on schema private from public, anon, authenticated;
grant usage on schema public, auth, storage, realtime to anon, authenticated, service_role;
grant usage on schema private to service_role;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create function auth.role() returns text language sql stable as $$ select auth.jwt()->>'role' $$;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
create table auth.users(id uuid primary key);
create table public.users(
  id uuid primary key references auth.users(id) on delete cascade,
  username text, display_name text, avatar_url text, avatar_thumbnail_url text, avatar_thumbnail_path text,
  banner_url text, banner_thumbnail_url text, banner_thumbnail_path text,
  status text, status_message text, presence_visibility text default 'tracked', color text, chat_color text, admin_role text,
  checkers_crown boolean, war_sword boolean, shadow_pin_gold_pin boolean, shadow_runner_sprint_medal boolean,
  shadow_runner_knight_medal boolean, shadow_runner_knight_level_id text, gold_easter_egg boolean,
  dm_discoverable boolean default true, last_active timestamptz, created_at timestamptz default now(), updated_at timestamptz default now(),
  email text, full_name text
);
create table public.user_roles(user_id uuid primary key references public.users(id) on delete cascade,role text);
create table public.user_blocks(blocker_id uuid,blocked_id uuid);
create function private.users_have_block(first_id uuid, second_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_blocks where (blocker_id=first_id and blocked_id=second_id) or (blocker_id=second_id and blocked_id=first_id))
$$;
revoke all on function private.users_have_block(uuid,uuid) from public,anon;
grant execute on function private.users_have_block(uuid,uuid) to authenticated;
create function public.is_app_admin(actor_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=actor_user_id and role='admin')
$$;
create function public.is_app_operator(actor_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=actor_user_id and role in ('admin','sub_admin'))
$$;
create table public.messages(id uuid primary key,user_id uuid references public.users(id) on delete cascade,content text,
  pinned_by uuid constraint messages_pinned_by_fkey references public.users(id),reply_to uuid references public.messages(id) on delete set null,
  file_url text,audio_url text,thumbnail_url text,thumbnail_path text,message_type text default 'text');
create table public.dm_conversations(id uuid primary key,participants uuid[]);
create table public.dm_messages(id uuid primary key,sender_id uuid references public.users(id) on delete cascade,conversation_id uuid references public.dm_conversations(id),
  content text,file_url text,audio_url text,thumbnail_url text,thumbnail_path text,message_type text default 'text');
create table public.shadow_pin_categories(id uuid primary key,creator_id uuid references public.users(id) on delete set null,
  title text,description text,image_url text,image_path text,thumbnail_url text,thumbnail_path text,medium_url text,medium_path text,deleted_at timestamptz);
create table public.shadow_pin_images(id uuid primary key default gen_random_uuid(),category_id uuid references public.shadow_pin_categories(id) on delete set null,
  creator_id uuid references public.users(id) on delete set null,image_url text,image_path text,thumbnail_url text,thumbnail_path text,medium_url text,medium_path text,
  provider text,provider_asset_id text,provider_playback_id text,provider_payload jsonb default '{}',media_type text default 'image',processing_status text default 'ready',
  video_preview_url text,video_playback_url text,video_hls_url text,video_embed_url text,title text,deleted_at timestamptz,created_at timestamptz default now());
create table public.shadow_pin_draft_assets(id uuid primary key,creator_id uuid references public.users(id) on delete cascade,
  provider text,provider_asset_id text,provider_payload jsonb default '{}',video_embed_url text,deleted_at timestamptz,state text default 'ready');
alter table public.shadow_pin_images add column creator_draft_id uuid, add column description text,
  add column image_content_type text, add column image_size_bytes integer, add column image_width integer, add column image_height integer,
  add column processing_error text, add column processed_at timestamptz, add column source_type text, add column source_url text,
  add column duration_seconds numeric, add column video_size_bytes integer, add column content_revision integer default 1;
alter table public.shadow_pin_draft_assets add column draft_id uuid, add column asset_kind text default 'video',
  add column ready_at timestamptz, add column video_preview_url text, add column video_playback_url text, add column video_hls_url text,
  add column final_image_url text, add column final_image_path text, add column content_type text, add column size_bytes bigint,
  add column final_thumbnail_url text, add column final_thumbnail_path text, add column final_medium_url text, add column final_medium_path text,
  add column image_width integer, add column image_height integer, add column source_url text, add column provider_playback_id text,
  add column duration_seconds numeric;
create table public.shadow_pin_creator_drafts(id uuid primary key,creator_id uuid references public.users(id),state text default 'ready',
  revision integer default 1,publish_idempotency_key uuid,published_image_id uuid,expires_at timestamptz default now()+interval '1 day',
  active_asset_id uuid,category_id uuid,title text,description text,source_kind text default 'video',target_image_id uuid,
  target_image_content_revision integer,tags text[] default '{}',published_at timestamptz,last_error_code text,last_error_message text);
-- Tag associations are unrelated to the provider identity boundary under test.
create function public.set_shadow_pin_image_tags(uuid,text[]) returns void language plpgsql as $$begin return; end;$$;
create table public.shadow_pin_comments(id uuid primary key,image_id uuid references public.shadow_pin_images(id),creator_id uuid references public.users(id));
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb default '{}',unique(bucket_id,name));
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);
create table realtime.messages(id bigint generated always as identity primary key,extension text,topic text,payload jsonb);
create table public.shado_tv_channels(id uuid primary key,created_by uuid references public.users(id) on delete set null,
  title text,slug text,tagline text,description text,ticket_asset_url text,hero_asset_url text,ticket_asset_path text,hero_asset_path text);
create table public.shado_tv_videos(id uuid primary key,created_by uuid references public.users(id) on delete set null,
  provider text,provider_asset_id text,provider_payload jsonb default '{}',embed_url text,trailer_asset_url text,deleted_at timestamptz);
create table public.shado_tv_captions(id uuid primary key,video_id uuid references public.shado_tv_videos(id) on delete cascade,
  created_by uuid not null constraint shado_tv_captions_created_by_fkey references auth.users(id) on delete restrict,storage_path text);
create table public.shado_live_access_members(user_id uuid references public.users(id) on delete cascade,
  added_by uuid not null constraint shado_live_access_members_added_by_fkey references public.users(id) on delete restrict);
create table public.shado_live_restrictions(target_user_id uuid references public.users(id) on delete cascade,
  created_by uuid not null constraint shado_live_restrictions_created_by_fkey references public.users(id) on delete restrict);
create table public.live_rooms(id uuid primary key,host_user_id uuid not null constraint live_rooms_host_user_id_fkey references public.users(id) on delete restrict,
  provider_room_name text,title text,description text,status text,ended_at timestamptz,host_disconnected_at timestamptz,host_grace_expires_at timestamptz,
  ended_reason text,revision integer default 1,updated_at timestamptz default now());
create table public.live_room_participants(room_id uuid references public.live_rooms(id),user_id uuid references public.users(id) on delete cascade);
create table public.live_room_messages(id uuid primary key,room_id uuid references public.live_rooms(id),
  sender_user_id uuid not null constraint live_room_messages_sender_user_id_fkey references public.users(id) on delete restrict,content text);
create table public.live_room_events(id uuid primary key,room_id uuid references public.live_rooms(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,target_user_id uuid references public.users(id) on delete set null,metadata jsonb default '{}');
create table public.live_provider_operations(id uuid primary key,room_id uuid references public.live_rooms(id),
  actor_user_id uuid references public.users(id) on delete set null,target_user_id uuid references public.users(id) on delete set null,request_payload jsonb);
create table public.live_provider_webhook_receipts(event_id text primary key,room_id uuid references public.live_rooms(id) on delete set null,
  participant_user_id uuid references public.users(id) on delete set null,participant_identity text,payload jsonb);
create function private.reject_shado_live_append_only_mutation() returns trigger language plpgsql security definer set search_path='' as $$begin raise exception 'append-only'; end;$$;
create trigger live_events_immutable before update or delete on public.live_room_events for each row execute function private.reject_shado_live_append_only_mutation();
create trigger live_receipts_immutable before update or delete on public.live_provider_webhook_receipts for each row execute function private.reject_shado_live_append_only_mutation();
create table public.user_channel_bans(id uuid primary key,target_user_id uuid not null constraint user_channel_bans_target_user_id_fkey references public.users(id) on delete cascade,reason text);
create function public.update_updated_at_column() returns trigger language plpgsql as $$begin new.updated_at=now(); return new; end;$$;
create publication supabase_realtime;

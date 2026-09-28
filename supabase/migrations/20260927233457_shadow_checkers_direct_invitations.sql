-- Direct challenges are private until accepted. Only the recipient can turn one
-- into an active match, in the same transaction that resolves the invitation.
begin;

create table public.shadow_checkers_invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.users(id) on delete cascade,
  invitee_id uuid not null references public.users(id) on delete cascade,
  inviter_character_key text not null,
  board_skin text not null default 'classic' check (board_skin in ('classic', 'cinematic')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  session_id uuid references public.game_sessions(id) on delete cascade,
  match_id uuid references public.shadow_checkers_matches(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint shadow_checkers_invitations_distinct_users check (inviter_id <> invitee_id),
  constraint shadow_checkers_invitations_accept_has_match check (
    (status = 'accepted' and session_id is not null and match_id is not null)
    or (status <> 'accepted' and session_id is null and match_id is null)
  )
);

create unique index shadow_checkers_one_pending_pair_idx
  on public.shadow_checkers_invitations (
    least(inviter_id, invitee_id), greatest(inviter_id, invitee_id)
  ) where status = 'pending';
create index shadow_checkers_invitations_recipient_idx
  on public.shadow_checkers_invitations (invitee_id, status, expires_at desc);
create index shadow_checkers_invitations_sender_idx
  on public.shadow_checkers_invitations (inviter_id, created_at desc);

alter table public.shadow_checkers_invitations enable row level security;
revoke all on public.shadow_checkers_invitations from public, anon, authenticated;
grant select on public.shadow_checkers_invitations to authenticated;
create policy "Invitation participants may read unblocked rows"
  on public.shadow_checkers_invitations for select to authenticated
  using (
    (select auth.uid()) in (inviter_id, invitee_id)
    and not private.users_have_block(inviter_id, invitee_id)
  );

-- Realtime row delivery obeys the same participant policy. RPCs recheck
-- eligibility because a client-side active-user list can go stale.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shadow_checkers_invitations'
  ) then
    alter publication supabase_realtime add table public.shadow_checkers_invitations;
  end if;
end;
$$;

create or replace function public.send_shadow_checkers_invitation(
  target_user_id uuid,
  character_key text,
  selected_board_skin text default 'classic'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  pair_key text;
  existing_invite public.shadow_checkers_invitations%rowtype;
  saved_invite public.shadow_checkers_invitations%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  if target_user_id is null or target_user_id = caller_id then
    raise exception 'Choose another member';
  end if;
  if character_key is null or character_key not in (
    'obsidian-sentinel', 'amber-vow', 'veil-rogue', 'iron-oracle',
    'gilded-wolf', 'ashen-warden', 'night-regent', 'cinder-crown'
  ) then
    raise exception 'Choose a valid character';
  end if;
  if selected_board_skin is null or selected_board_skin not in ('classic', 'cinematic') then
    raise exception 'Choose a valid board';
  end if;

  -- The unordered key serializes both directions of a simultaneous challenge.
  pair_key := least(caller_id, target_user_id)::text || ':' || greatest(caller_id, target_user_id)::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pair_key, 0));

  if private.users_have_block(caller_id, target_user_id) then
    raise exception 'This member is unavailable';
  end if;

  update public.shadow_checkers_invitations invitations
  set status = 'expired', responded_at = now(), updated_at = now()
  where status = 'pending'
    and expires_at <= now()
    and least(inviter_id, invitee_id) = least(caller_id, target_user_id)
    and greatest(inviter_id, invitee_id) = greatest(caller_id, target_user_id);

  select * into existing_invite
  from public.shadow_checkers_invitations invitations
  where status = 'pending'
    and least(inviter_id, invitee_id) = least(caller_id, target_user_id)
    and greatest(inviter_id, invitee_id) = greatest(caller_id, target_user_id)
  for update;
  if found then
    return jsonb_build_object(
      'invitationId', existing_invite.id,
      'direction', case when existing_invite.inviter_id = caller_id then 'outgoing' else 'incoming' end,
      'expiresAt', existing_invite.expires_at
    );
  end if;

  if exists (
    select 1 from public.shadow_checkers_matches matches
    where matches.status = 'active'
      and least(matches.player_one_id, matches.player_two_id) = least(caller_id, target_user_id)
      and greatest(matches.player_one_id, matches.player_two_id) = greatest(caller_id, target_user_id)
  ) then
    raise exception 'You already have an active match with this member';
  end if;

  if not exists (
    select 1 from public.users users
    join public.user_presence presence on presence.user_id = users.id
    where users.id = target_user_id
      and users.presence_visibility = 'tracked'
      and presence.status = 'online'
      and presence.last_seen > now() - interval '2 minutes'
  ) then
    raise exception 'This member is no longer online';
  end if;

  if (
    select count(*) from public.shadow_checkers_invitations invitations
    where invitations.inviter_id = caller_id
      and invitations.created_at > now() - interval '1 hour'
  ) >= 12 then
    raise exception 'Invitation limit reached. Try again later';
  end if;

  insert into public.shadow_checkers_invitations (
    inviter_id, invitee_id, inviter_character_key, board_skin
  ) values (caller_id, target_user_id, character_key, selected_board_skin)
  returning * into saved_invite;

  return jsonb_build_object(
    'invitationId', saved_invite.id,
    'direction', 'outgoing',
    'expiresAt', saved_invite.expires_at
  );
end;
$$;

create or replace function public.accept_shadow_checkers_invitation(
  target_invitation_id uuid,
  character_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation public.shadow_checkers_invitations%rowtype;
  pair_inviter_id uuid;
  pair_invitee_id uuid;
  pair_key text;
  new_session public.game_sessions%rowtype;
  new_match public.shadow_checkers_matches%rowtype;
  chosen_character text;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  select inviter_id, invitee_id into pair_inviter_id, pair_invitee_id
  from public.shadow_checkers_invitations
  where id = target_invitation_id and invitee_id = caller_id;
  if not found then raise exception 'Invitation not found'; end if;
  pair_key := least(pair_inviter_id, pair_invitee_id)::text || ':' ||
    greatest(pair_inviter_id, pair_invitee_id)::text;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pair_key, 0));
  select * into invitation
  from public.shadow_checkers_invitations
  where id = target_invitation_id and invitee_id = caller_id
  for update;
  if not found then raise exception 'Invitation not found'; end if;
  if private.users_have_block(invitation.inviter_id, invitation.invitee_id) then
    raise exception 'Invitation is no longer available';
  end if;

  if invitation.status = 'accepted' then
    return jsonb_build_object('sessionId', invitation.session_id, 'matchId', invitation.match_id);
  end if;
  if invitation.status <> 'pending' then raise exception 'Invitation is no longer available'; end if;
  if invitation.expires_at <= now() then
    update public.shadow_checkers_invitations
    set status = 'expired', responded_at = now(), updated_at = now()
    where id = invitation.id;
    return jsonb_build_object('expired', true);
  end if;

  chosen_character := coalesce(nullif(character_key, ''), 'amber-vow');
  if chosen_character = invitation.inviter_character_key and character_key is null then
    chosen_character := 'veil-rogue';
  end if;
  if chosen_character not in (
    'obsidian-sentinel', 'amber-vow', 'veil-rogue', 'iron-oracle',
    'gilded-wolf', 'ashen-warden', 'night-regent', 'cinder-crown'
  ) then
    raise exception 'Choose a valid character';
  end if;
  if chosen_character = invitation.inviter_character_key then
    raise exception 'Character already taken';
  end if;

  insert into public.game_sessions (game_type, status, created_by, player_one_id, player_two_id)
  values ('shadow_checkers', 'active', invitation.inviter_id, invitation.inviter_id, invitation.invitee_id)
  returning * into new_session;
  insert into public.shadow_checkers_matches (
    session_id, status, player_one_id, player_two_id,
    player_one_character_key, player_two_character_key, board_skin,
    current_turn_user_id, board_state
  ) values (
    new_session.id, 'active', invitation.inviter_id, invitation.invitee_id,
    invitation.inviter_character_key, chosen_character, invitation.board_skin,
    invitation.inviter_id, public.shadow_checkers_initial_board()
  ) returning * into new_match;

  update public.shadow_checkers_invitations
  set status = 'accepted', session_id = new_session.id, match_id = new_match.id,
      responded_at = now(), updated_at = now()
  where id = invitation.id;

  return jsonb_build_object('sessionId', new_session.id, 'matchId', new_match.id);
end;
$$;

create or replace function public.decline_shadow_checkers_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation public.shadow_checkers_invitations%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.shadow_checkers_invitations
  where id = target_invitation_id and invitee_id = caller_id for update;
  if not found then raise exception 'Invitation not found'; end if;
  if invitation.status <> 'pending' then return false; end if;
  update public.shadow_checkers_invitations
  set status = case when expires_at <= now() then 'expired' else 'declined' end,
      responded_at = now(), updated_at = now()
  where id = invitation.id;
  return true;
end;
$$;

create or replace function public.cancel_shadow_checkers_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  invitation public.shadow_checkers_invitations%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.shadow_checkers_invitations
  where id = target_invitation_id and inviter_id = caller_id for update;
  if not found then raise exception 'Invitation not found'; end if;
  if invitation.status <> 'pending' then return false; end if;
  update public.shadow_checkers_invitations
  set status = case when expires_at <= now() then 'expired' else 'cancelled' end,
      responded_at = now(), updated_at = now()
  where id = invitation.id;
  return true;
end;
$$;

revoke all on function public.send_shadow_checkers_invitation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.accept_shadow_checkers_invitation(uuid, text) from public, anon, authenticated;
revoke all on function public.decline_shadow_checkers_invitation(uuid) from public, anon, authenticated;
revoke all on function public.cancel_shadow_checkers_invitation(uuid) from public, anon, authenticated;
grant execute on function public.send_shadow_checkers_invitation(uuid, text, text) to authenticated;
grant execute on function public.accept_shadow_checkers_invitation(uuid, text) to authenticated;
grant execute on function public.decline_shadow_checkers_invitation(uuid) to authenticated;
grant execute on function public.cancel_shadow_checkers_invitation(uuid) to authenticated;

create or replace function public.expire_my_shadow_checkers_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  expired_count integer;
begin
  if caller_id is null then raise exception 'Authentication required'; end if;
  update public.shadow_checkers_invitations
  set status = 'expired', responded_at = now(), updated_at = now()
  where status = 'pending'
    and expires_at <= now()
    and caller_id in (inviter_id, invitee_id);
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;
revoke all on function public.expire_my_shadow_checkers_invitations() from public, anon, authenticated;
grant execute on function public.expire_my_shadow_checkers_invitations() to authenticated;

-- The global invitation host supplies Join/Decline in the foreground. Durable
-- notification events are for badge state and installed-PWA background push.
create or replace function private.sync_shadow_checkers_invitation_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile jsonb;
  actor_name text;
  event_row public.notification_events%rowtype;
  invite_route text;
begin
  if tg_op = 'INSERT' then
    -- The private invitation still reaches Join/Decline when master alerts are
    -- off, but it must not create unread notification or badge state.
    if not exists (
      select 1 from public.notification_preferences preferences
      where preferences.user_id = new.invitee_id
        and preferences.notifications_enabled
    ) then
      return new;
    end if;

    select public.user_public_profile_json(users),
      coalesce(nullif(users.display_name, ''), nullif(users.username, ''), 'A member')
    into actor_profile, actor_name
    from public.users users where users.id = new.inviter_id;
    invite_route := format('/?view=games&experience=shadow-checkers&invite=%s', new.id);

    insert into public.notification_events (
      user_id, type, entity_id, actor_id, category, route, payload,
      dedupe_key, presentation_expires_at
    ) values (
      new.invitee_id, 'shadow_checkers_invite', new.id, new.inviter_id,
      'games', invite_route,
      jsonb_build_object(
        'title', 'Shadow Checkers invitation',
        'body', actor_name || ' invited you to play. Join or decline.',
        'route', invite_route,
        'invite_id', new.id,
        'expires_at', new.expires_at,
        'actor', actor_profile
      ),
      'shadow_checkers_invite:' || new.id::text,
      new.expires_at
    ) on conflict (dedupe_key) do nothing
    returning * into event_row;

    -- Keep the August bounded recovery path. Active foreground installations
    -- receive the private invitation row and do not need a system push.
    if event_row.id is not null
      and exists (
        select 1 from public.notification_preferences preferences
        where preferences.user_id = new.invitee_id
          and preferences.notifications_enabled
      )
      and exists (
        select 1 from public.push_subscriptions subscriptions
        where subscriptions.user_id = new.invitee_id
          and subscriptions.enabled
          and (subscriptions.foreground_until is null
            or subscriptions.foreground_until <= now())
      ) then
      insert into public.notification_delivery_jobs (
        notification_event_id, user_id, available_at, expires_at
      ) values (
        event_row.id, new.invitee_id, now() + interval '20 seconds', new.expires_at
      ) on conflict (notification_event_id) do nothing;
    end if;
    return new;
  end if;

  if old.status = 'pending' and new.status <> 'pending' then
    update public.notification_events events
    set resolved_at = coalesce(events.resolved_at, now()),
        read_at = coalesce(events.read_at, now())
    where events.type = 'shadow_checkers_invite'
      and events.entity_id = new.id
      and events.user_id = new.invitee_id
      and events.resolved_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_shadow_checkers_invitation_notification()
  from public, anon, authenticated;
create trigger sync_shadow_checkers_invitation_notification_insert
  after insert on public.shadow_checkers_invitations
  for each row execute function private.sync_shadow_checkers_invitation_notification();
create trigger sync_shadow_checkers_invitation_notification_status
  after update of status on public.shadow_checkers_invitations
  for each row execute function private.sync_shadow_checkers_invitation_notification();

-- A reciprocal block hides the invitation row through RLS. Resolve it in the
-- same transaction so its owner-visible notification and queued push cannot
-- outlive the blocked relationship.
create or replace function private.cancel_blocked_shadow_checkers_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.shadow_checkers_invitations invitations
  set status = 'cancelled', responded_at = now(), updated_at = now()
  where invitations.status = 'pending'
    and (
      (invitations.inviter_id = new.blocker_id and invitations.invitee_id = new.blocked_id)
      or (invitations.inviter_id = new.blocked_id and invitations.invitee_id = new.blocker_id)
    );
  return new;
end;
$$;
revoke all on function private.cancel_blocked_shadow_checkers_invitations()
  from public, anon, authenticated;
create trigger cancel_blocked_shadow_checkers_invitations
  after insert on public.user_blocks
  for each row execute function private.cancel_blocked_shadow_checkers_invitations();

-- Match the V2 category, sound, Android channel and badge semantics used by
-- the existing Checkers turn event without enabling a new delivery subsystem.
alter table public.notification_event_presentation_preferences
  drop constraint if exists notification_event_presentation_preferences_event_type_check;
alter table public.notification_event_presentation_preferences
  add constraint notification_event_presentation_preferences_event_type_check
  check (event_type in (
    'dm_message', 'group_message', 'mention', 'reply', 'reaction', 'hype_event',
    'shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply',
    'connection_request', 'connection_accepted', 'presence_active',
    'shado_live_room_started', 'shado_live_room_ended',
    'shado_live_speaker_promoted', 'shado_live_speaker_demoted',
    'shado_live_participant_muted', 'shado_live_participant_removed',
    'shadow_checkers_turn', 'shadow_checkers_invite', 'shadow_war_turn',
    'weather_alert', 'security_alert'
  ));

create or replace function private.notification_v2_category(target_type text)
returns text language sql immutable security invoker set search_path = '' as $$
  select case
    when target_type = 'dm_message' then 'dm'
    when target_type = 'group_message' then 'general_chat'
    when target_type in ('mention', 'reply') then 'mentions_replies'
    when target_type in ('reaction', 'hype_event') then 'reactions_hype'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then 'shadow_pin'
    when target_type in ('connection_request', 'connection_accepted') then 'connections'
    when target_type = 'presence_active' then 'presence'
    when target_type like 'shado_live_%' then 'shado_live'
    when target_type in ('shadow_checkers_turn', 'shadow_checkers_invite') then 'shadow_checkers'
    when target_type = 'shadow_war_turn' then 'shadow_war'
    when target_type = 'weather_alert' then 'weather'
    when target_type = 'security_alert' then 'security'
    else 'system'
  end
$$;
create or replace function private.notification_v2_sound(target_type text)
returns text language sql immutable security invoker set search_path = '' as $$
  select case
    when target_type = 'dm_message' then 'shadow_whisper'
    when target_type = 'group_message' then 'low_glass'
    when target_type in ('mention', 'reply') then 'gold_signal'
    when target_type in ('reaction', 'hype_event') then 'hype_burst'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment') then 'pin_shutter'
    when target_type = 'shadow_pin_reply' then 'gold_signal'
    when target_type in ('connection_request', 'connection_accepted') then 'connection_chime'
    when target_type = 'presence_active' then 'presence_pulse'
    when target_type like 'shado_live_%' then 'live_beacon'
    when target_type in ('shadow_checkers_turn', 'shadow_checkers_invite') then 'checkers_move'
    when target_type = 'shadow_war_turn' then 'war_drum'
    when target_type = 'weather_alert' then 'weather_glass'
    when target_type = 'security_alert' then 'security_signal'
    else 'system_default'
  end
$$;
create or replace function private.notification_v2_channel(target_type text)
returns text language sql immutable security invoker set search_path = '' as $$
  select case
    when target_type in ('dm_message', 'group_message') then 'messages_v1'
    when target_type in ('mention', 'reply') then 'mentions_v1'
    when target_type like 'shado_live_%' then 'live_v1'
    when target_type in ('shadow_checkers_turn', 'shadow_checkers_invite', 'shadow_war_turn') then 'games_v1'
    when target_type = 'weather_alert' then 'weather_v1'
    when target_type = 'security_alert' then 'security_v1'
    else 'social_v1'
  end
$$;
create or replace function private.notification_v2_badge_category(target_type text)
returns text language sql immutable security invoker set search_path = '' as $$
  select case
    when target_type = 'dm_message' then 'dm'
    when target_type = 'group_message' then 'group'
    when target_type in ('mention', 'reply', 'reaction', 'hype_event', 'security_alert') then 'interactions'
    when target_type in ('connection_request', 'connection_accepted') then 'connections'
    when target_type in ('shadow_pin_post', 'shadow_pin_comment', 'shadow_pin_reply') then 'shadow_pin'
    when target_type like 'shado_live_%'
      or target_type in ('shadow_checkers_turn', 'shadow_checkers_invite', 'shadow_war_turn') then 'games'
    else 'none'
  end
$$;
create or replace function private.notification_v2_group_key(
  target_type text, target_entity_id uuid, target_actor_id uuid,
  target_conversation_id uuid, target_message_id uuid, target_payload jsonb
)
returns text language sql stable security invoker set search_path = '' as $$
  select case
    when target_type = 'dm_message' then 'dm:' || coalesce(target_conversation_id, target_entity_id)::text
    when target_type = 'group_message' then
      'group:' || coalesce(nullif(target_payload ->> 'thread_id', ''), target_message_id::text, 'general')
    when target_type in ('reaction', 'hype_event') then
      'message:' || coalesce(target_message_id, target_entity_id)::text || ':reactions'
    when target_type in ('shadow_pin_comment', 'shadow_pin_reply') then
      'pin:' || coalesce(nullif(target_payload ->> 'image_id', ''), target_entity_id::text) || ':conversation'
    when target_type = 'shadow_pin_post' then 'pin:' || target_entity_id::text
    when target_type in ('connection_request', 'connection_accepted') then
      'connection:' || coalesce(target_actor_id, target_entity_id)::text
    when target_type = 'presence_active' then
      'presence:' || coalesce(target_actor_id, target_entity_id)::text
    when target_type like 'shado_live_%' then
      'live:' || coalesce(nullif(target_payload ->> 'room_id', ''), target_entity_id::text)
    when target_type = 'shadow_checkers_turn' then 'checkers:' || target_entity_id::text
    when target_type = 'shadow_checkers_invite' then 'checkers-invite:' || target_entity_id::text
    when target_type = 'shadow_war_turn' then 'shadow-war:' || target_entity_id::text
    when target_type = 'weather_alert' then 'weather:' || target_entity_id::text
    when target_type = 'security_alert' then 'security:' || target_entity_id::text
    else 'system:' || target_entity_id::text
  end
$$;

commit;

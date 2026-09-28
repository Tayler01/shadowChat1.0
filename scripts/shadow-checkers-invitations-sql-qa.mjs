// Isolated PostgreSQL/WASM invitation contract test; no live project access.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const { PGlite } = await import(pathToFileURL(resolve(
  'output/checkers-sql-runtime/node_modules/@electric-sql/pglite/dist/index.js',
)).href)
const db = await PGlite.create()
const ids = [1, 2, 3, 4].map(n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
let checks = 0

async function rows(sql, args = []) { return (await db.query(sql, args)).rows }
function check(value, message) { assert.ok(value, message); checks += 1 }
async function rpc(userId, name, args = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId || ''])
  await db.exec('set role authenticated')
  try {
    return (await rows(`select to_jsonb(public.${name}(${args.map((_, index) => `$${index + 1}`).join(',')})) as value`, args))[0].value
  } finally {
    await db.exec('reset role')
  }
}
async function rejects(userId, name, args, pattern) {
  await assert.rejects(() => rpc(userId, name, args), pattern)
  checks += 1
}
async function asUser(userId, sql, args = []) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
  await db.exec('set role authenticated')
  try { return await rows(sql, args) }
  finally { await db.exec('reset role') }
}
async function load(name) {
  await db.exec(await readFile(`supabase/migrations/${name}`, 'utf8'))
}
async function loadNotificationTrigger(name, functionName, triggerSql) {
  const source = await readFile(`supabase/migrations/${name}`, 'utf8')
  const pattern = new RegExp(`create or replace function private\\.${functionName}\\(\\)[\\s\\S]*?\\$\\$;`, 'i')
  const definition = source.match(pattern)?.[0]
  if (!definition) throw new Error(`Missing ${functionName} from ${name}`)
  await db.exec(definition)
  await db.exec(triggerSql)
}
async function reset() {
  await db.exec('truncate public.users cascade')
  for (const [index, id] of ids.entries()) {
    await db.query(
      `insert into public.users(id, username, display_name, presence_visibility)
       values ($1, $2, $3, 'tracked')`,
      [id, `player${index + 1}`, `Player ${index + 1}`],
    )
    await db.query(
      `insert into public.user_presence(user_id, status, last_seen)
       values ($1, 'online', now())`, [id],
    )
    await db.query(
      `insert into public.notification_preferences(user_id, notifications_enabled)
       values ($1, true)`, [id],
    )
  }
  await db.query(
    `insert into public.push_subscriptions(user_id, enabled, foreground_until)
     values ($1, true, null)`, [ids[1]],
  )
}
async function invite(inviter = ids[0], invitee = ids[1], character = 'obsidian-sentinel') {
  return rpc(inviter, 'send_shadow_checkers_invitation', [invitee, character, 'cinematic'])
}
async function invitationRow(invitationId) {
  return (await rows('select * from public.shadow_checkers_invitations where id = $1', [invitationId]))[0]
}

try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable
      as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth, private to authenticated;
    create table public.users (
      id uuid primary key, username text, display_name text, avatar_url text,
      color text, admin_role text, presence_visibility text
    );
    create table public.user_presence (
      user_id uuid primary key references public.users(id) on delete cascade,
      status text, last_seen timestamptz
    );
    create table public.user_blocks (
      blocker_id uuid references public.users(id) on delete cascade,
      blocked_id uuid references public.users(id) on delete cascade,
      primary key(blocker_id, blocked_id)
    );
    create function private.users_have_block(first_user_id uuid, second_user_id uuid)
      returns boolean language sql stable security definer set search_path = '' as $$
        select exists(select 1 from public.user_blocks
          where (blocker_id = first_user_id and blocked_id = second_user_id)
             or (blocker_id = second_user_id and blocked_id = first_user_id))
      $$;
    grant execute on function private.users_have_block(uuid, uuid) to authenticated;
    create function public.user_public_profile_json(target public.users)
      returns jsonb language sql stable as $$
        select jsonb_build_object('id', target.id, 'username', target.username,
          'display_name', target.display_name)
      $$;
    create function public.update_updated_at_column() returns trigger language plpgsql
      as $$begin new.updated_at = now(); return new; end$$;
    create publication supabase_realtime;
    create table public.notification_preferences (
      user_id uuid primary key references public.users(id) on delete cascade,
      notifications_enabled boolean not null default true
    );
    create table public.push_subscriptions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.users(id) on delete cascade,
      enabled boolean not null default true,
      foreground_until timestamptz
    );
    create table public.notification_events (
      id uuid primary key default gen_random_uuid(),
      user_id uuid references public.users(id) on delete cascade,
      type text, entity_id uuid, actor_id uuid, category text, route text,
      payload jsonb, dedupe_key text unique, presentation_expires_at timestamptz,
      conversation_id uuid, message_id uuid,
      sent_at timestamptz, read_at timestamptz, resolved_at timestamptz,
      created_at timestamptz not null default now(),
      constraint notification_events_category_check check (category in
        ('dm','group','interactions','connections','shadow_pin','presence','live','games','system')),
      constraint notification_events_presentation_window_check check (presentation_expires_at >= created_at),
      constraint notification_events_route_length_check check (route is null or char_length(route) between 1 and 2048)
    );
    create table public.notification_delivery_jobs (
      id uuid primary key default gen_random_uuid(),
      notification_event_id uuid unique references public.notification_events(id),
      user_id uuid, available_at timestamptz, expires_at timestamptz,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      status text not null default 'pending', completed_at timestamptz, last_error text,
      constraint notification_delivery_jobs_check check (expires_at >= created_at)
    );
    create table public.notification_v2_runtime_config (
      singleton boolean primary key, delivery_mode text, activation_watermark timestamptz
    );
    insert into public.notification_v2_runtime_config values (true, 'disabled', now());
    create table public.notification_sound_catalog (sound_id text primary key);
    insert into public.notification_sound_catalog values ('checkers_move');
  `)
  const soundPreferenceMigration = await readFile(
    'supabase/migrations/20260721011500_rich_notification_content_and_event_sounds.sql',
    'utf8',
  )
  const soundPreferenceTable = soundPreferenceMigration.match(
    /create table if not exists public\.notification_event_presentation_preferences \([\s\S]*?\n\);/i,
  )?.[0]
  if (!soundPreferenceTable) throw new Error('Missing prior event-sound preference table definition')
  await db.exec(soundPreferenceTable)
  await load('20260511213509_shadow_war_games.sql')
  await load('20260512212357_shadow_checkers_domain.sql')
  await load('20260513234318_shadow_checkers_board_skin_admin_cancel.sql')
  await load('20260927233457_shadow_checkers_direct_invitations.sql')
  await loadNotificationTrigger(
    '20260721011500_rich_notification_content_and_event_sounds.sql',
    'enrich_notification_v2_event',
    'create trigger enrich_notification_v2_event_insert before insert on public.notification_events for each row execute function private.enrich_notification_v2_event()',
  )
  await loadNotificationTrigger(
    '20260717193835_notification_reliability_rebuild.sql',
    'normalize_notification_event',
    `create trigger normalize_notification_event_insert before insert on public.notification_events for each row execute function private.normalize_notification_event();
     create trigger normalize_notification_event_update before update of type,payload,category,actor_id,route,presentation_expires_at on public.notification_events for each row execute function private.normalize_notification_event()`,
  )
  await loadNotificationTrigger(
    '20260718210000_notification_presentation_v2_foundation.sql',
    'materialize_notification_envelope_v2',
    'create trigger materialize_notification_envelope_v2_insert after insert on public.notification_events for each row execute function private.materialize_notification_envelope_v2()',
  )
  await loadNotificationTrigger(
    '20260805112141_harden_web_notification_recovery.sql',
    'sync_notification_delivery_job',
    `create trigger sync_notification_delivery_job_insert after insert on public.notification_events for each row execute function private.sync_notification_delivery_job();
     create trigger sync_notification_delivery_job_update after update of sent_at,read_at,resolved_at on public.notification_events for each row execute function private.sync_notification_delivery_job()`,
  )

  await reset()
  await db.query(
    `insert into public.notification_event_presentation_preferences
      (user_id, event_type, sound_id) values ($1, 'shadow_checkers_invite', 'checkers_move')`,
    [ids[0]],
  )
  check((await rows(
    `select event_type from public.notification_event_presentation_preferences
     where user_id = $1 and event_type = 'shadow_checkers_invite'`,
    [ids[0]],
  )).length === 1, 'Invite-specific sound preference passes the database constraint')
  await db.query(
    `insert into public.notification_event_presentation_preferences
      (user_id, event_type, sound_id) values ($1, 'shadow_checkers_turn', 'checkers_move')`,
    [ids[0]],
  )
  check((await rows(
    `select event_type from public.notification_event_presentation_preferences
     where user_id = $1 and event_type = 'shadow_checkers_turn'`,
    [ids[0]],
  )).length === 1, 'Existing turn sound preference remains valid')
  await assert.rejects(() => db.query(
    `insert into public.notification_event_presentation_preferences
      (user_id, event_type, sound_id) values ($1, 'unsupported_notification', 'checkers_move')`,
    [ids[0]],
  ), /notification_event_presentation_preferences_event_type_check/)
  checks += 1
  await rejects(null, 'send_shadow_checkers_invitation', [ids[1], 'amber-vow', 'classic'], /Authentication required/)
  await rejects(ids[0], 'send_shadow_checkers_invitation', [ids[0], 'amber-vow', 'classic'], /Choose another member/)
  await rejects(ids[0], 'send_shadow_checkers_invitation', [ids[1], 'arbitrary', 'classic'], /valid character/)
  await db.query("update public.users set presence_visibility = 'invisible' where id = $1", [ids[1]])
  await rejects(ids[0], 'send_shadow_checkers_invitation', [ids[1], 'amber-vow', 'classic'], /no longer online/)
  await db.query("update public.users set presence_visibility = 'tracked' where id = $1", [ids[1]])
  await db.query("update public.user_presence set last_seen = now() - interval '3 minutes' where user_id = $1", [ids[1]])
  await rejects(ids[0], 'send_shadow_checkers_invitation', [ids[1], 'amber-vow', 'classic'], /no longer online/)
  await db.query('update public.user_presence set last_seen = now() where user_id = $1', [ids[1]])
  await db.query('insert into public.user_blocks(blocker_id, blocked_id) values ($1, $2)', [ids[1], ids[0]])
  await rejects(ids[0], 'send_shadow_checkers_invitation', [ids[1], 'amber-vow', 'classic'], /unavailable/)
  await db.exec('delete from public.user_blocks')

  await db.query('update public.notification_preferences set notifications_enabled = false where user_id = $1', [ids[3]])
  const mutedInvite = await invite(ids[0], ids[3])
  check((await invitationRow(mutedInvite.invitationId)).status === 'pending', 'Master mute keeps the private Join/Decline invitation')
  check((await rows('select id from public.notification_events where entity_id = $1', [mutedInvite.invitationId])).length === 0, 'Master mute creates no unread invitation event')
  check((await rows('select id from public.notification_delivery_jobs where user_id = $1', [ids[3]])).length === 0, 'Master mute creates no delivery job')
  await rpc(ids[0], 'cancel_shadow_checkers_invitation', [mutedInvite.invitationId])
  await db.query('update public.notification_preferences set notifications_enabled = true where user_id = $1', [ids[3]])

  const first = await invite()
  check(first.direction === 'outgoing' && Boolean(first.invitationId), 'Invitation is created')
  check((await asUser(ids[0], 'select id from public.shadow_checkers_invitations where id = $1', [first.invitationId])).length === 1, 'Inviter can read own invitation')
  check((await asUser(ids[1], 'select id from public.shadow_checkers_invitations where id = $1', [first.invitationId])).length === 1, 'Invitee can read own invitation')
  check((await asUser(ids[2], 'select id from public.shadow_checkers_invitations where id = $1', [first.invitationId])).length === 0, 'Third party cannot read invitation')
  await assert.rejects(() => asUser(ids[1],
    'insert into public.shadow_checkers_invitations(inviter_id, invitee_id, inviter_character_key) values ($1,$2,$3)',
    [ids[1], ids[2], 'amber-vow']), /permission denied/i)
  checks += 1
  check((await rows('select count(*)::int as count from public.game_sessions'))[0].count === 0, 'Pending invite creates no lobby session')
  check((await rows('select count(*)::int as count from public.shadow_checkers_matches'))[0].count === 0, 'Pending invite creates no match')
  const repeated = await invite()
  const reciprocal = await invite(ids[1], ids[0], 'amber-vow')
  check(repeated.invitationId === first.invitationId, 'Repeated send reuses pending row')
  check(reciprocal.invitationId === first.invitationId && reciprocal.direction === 'incoming', 'Reciprocal send finds incoming challenge')
  check((await rows('select count(*)::int as count from public.notification_events'))[0].count === 1, 'One durable notification event')
  check((await rows('select count(*)::int as count from public.notification_delivery_jobs'))[0].count === 1, 'One bounded background delivery job')
  const event = (await rows('select * from public.notification_events where entity_id = $1', [first.invitationId]))[0]
  check(event.category === 'games' && event.type === 'shadow_checkers_invite' && event.route.includes(`invite=${first.invitationId}`), 'Actual notification enrich/normalize triggers preserve invite route and games category')
  await rejects(ids[2], 'accept_shadow_checkers_invitation', [first.invitationId, null], /not found/i)
  const accepted = await rpc(ids[1], 'accept_shadow_checkers_invitation', [first.invitationId, null])
  const repeatedAccept = await rpc(ids[1], 'accept_shadow_checkers_invitation', [first.invitationId, null])
  check(accepted.matchId === repeatedAccept.matchId && accepted.sessionId === repeatedAccept.sessionId, 'Repeated accept returns same match')
  const match = (await rows('select * from public.shadow_checkers_matches where id = $1', [accepted.matchId]))[0]
  check(match.status === 'active' && match.player_one_id === ids[0] && match.player_two_id === ids[1], 'Acceptance atomically starts selected pair')
  check(match.board_skin === 'cinematic' && match.player_two_character_key !== match.player_one_character_key, 'Board and legal distinct character survive')
  check((await rows('select count(*)::int as count from public.shadow_checkers_matches'))[0].count === 1, 'No duplicate match')
  await rejects(ids[0], 'send_shadow_checkers_invitation', [ids[1], 'amber-vow', 'classic'], /already have an active match/)
  const resolvedEvent = (await rows('select read_at is not null as read, resolved_at is not null as resolved from public.notification_events where entity_id = $1', [first.invitationId]))[0]
  check(resolvedEvent.read && resolvedEvent.resolved, 'Accepted invite resolves and reads notification')
  check((await rows('select status from public.notification_delivery_jobs where notification_event_id = $1', [event.id]))[0].status === 'cancelled', 'Actual delivery sync trigger cancels stale push job')
  await db.query('delete from public.shadow_checkers_matches where id = $1', [accepted.matchId])
  check((await invitationRow(first.invitationId)) === undefined, 'Deleting accepted match cascades invitation history')

  const blockedQueuedInvite = await invite()
  const unrelatedInvite = await invite(ids[2], ids[3])
  const blockedQueuedEvent = (await rows('select id from public.notification_events where entity_id = $1', [blockedQueuedInvite.invitationId]))[0]
  check((await rows('select status from public.notification_delivery_jobs where notification_event_id = $1', [blockedQueuedEvent.id]))[0].status === 'pending', 'Background job is queued before block')
  await db.query('insert into public.user_blocks(blocker_id, blocked_id) values ($1, $2)', [ids[0], ids[1]])
  check((await invitationRow(blockedQueuedInvite.invitationId)).status === 'cancelled', 'Inviter block cancels pending invitation')
  check((await invitationRow(unrelatedInvite.invitationId)).status === 'pending', 'Block leaves unrelated invitations pending')
  const blockedQueuedNotification = (await rows('select read_at, resolved_at from public.notification_events where id = $1', [blockedQueuedEvent.id]))[0]
  check(Boolean(blockedQueuedNotification.read_at && blockedQueuedNotification.resolved_at), 'Inviter block resolves unread invitation event')
  check((await rows('select status from public.notification_delivery_jobs where notification_event_id = $1', [blockedQueuedEvent.id]))[0].status === 'cancelled', 'Inviter block cancels queued push')
  await db.exec('delete from public.user_blocks')
  await rpc(ids[2], 'cancel_shadow_checkers_invitation', [unrelatedInvite.invitationId])

  const declined = await invite(ids[0], ids[2])
  check(await rpc(ids[2], 'decline_shadow_checkers_invitation', [declined.invitationId]) === true, 'Recipient can decline')
  check(await rpc(ids[2], 'decline_shadow_checkers_invitation', [declined.invitationId]) === false, 'Repeated decline is idempotent')
  check((await invitationRow(declined.invitationId)).status === 'declined', 'Decline is durable')
  const replacement = await invite(ids[0], ids[2])
  check(replacement.invitationId !== declined.invitationId, 'Declined invite can be retried')
  await db.query("update public.shadow_checkers_invitations set expires_at = now() - interval '1 second' where id = $1", [replacement.invitationId])
  check((await rpc(ids[2], 'accept_shadow_checkers_invitation', [replacement.invitationId, null])).expired === true, 'Expired invite cannot create match')
  check((await invitationRow(replacement.invitationId)).status === 'expired', 'Expiry is persisted')
  const afterExpiry = await invite(ids[0], ids[2])
  check(afterExpiry.invitationId !== replacement.invitationId, 'Expired invite can be retried')
  await db.query('insert into public.user_blocks(blocker_id, blocked_id) values ($1, $2)', [ids[2], ids[0]])
  check((await invitationRow(afterExpiry.invitationId)).status === 'cancelled', 'Invitee block also cancels pending invitation')
  const blockedEvent = (await rows('select read_at, resolved_at from public.notification_events where entity_id = $1', [afterExpiry.invitationId]))[0]
  check(Boolean(blockedEvent.read_at && blockedEvent.resolved_at), 'Invitee block resolves the owner-visible event')
  check((await asUser(ids[2], 'select id from public.shadow_checkers_invitations where id = $1', [afterExpiry.invitationId])).length === 0, 'Blocked pair loses invitation read access')
  await rejects(ids[2], 'accept_shadow_checkers_invitation', [afterExpiry.invitationId, null], /no longer available/)
  await db.exec('delete from public.user_blocks')

  check((await rows("select private.notification_v2_category('shadow_checkers_invite') as value"))[0].value === 'shadow_checkers', 'V2 category maps to Checkers')
  check((await rows("select private.notification_v2_badge_category('shadow_checkers_invite') as value"))[0].value === 'games', 'V2 badge category maps to games')

  console.log(JSON.stringify({ result: 'pass', assertions: checks, runtime: 'PGlite PostgreSQL', liveProject: false }))
} finally {
  await db.close()
}

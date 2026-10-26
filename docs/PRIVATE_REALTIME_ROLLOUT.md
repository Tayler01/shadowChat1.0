# Private Realtime rollout

Local implementation is staged. The hosted setting has **not** been changed and
the private client flags default off. This document is the reviewable cutover
procedure, not evidence of production acceptance or authorization to deploy.

## Boundary and compatibility

Supabase's **Allow public access to channels** setting must be disabled to close
public Broadcast from stale clients. The documented setting change disconnects
existing sockets; public-channel rejoins then fail with `PrivateOnly`. It applies
to Postgres Changes channels as well as Broadcast and Presence. A new client flag
alone does not close the public endpoint. See [Realtime settings](https://supabase.com/docs/guides/realtime/settings).

There are 34 channel creation sites: 32 in the shared/full web code and two in the
native shell. The shared client wrapper covers initial, reused and fresh recovery
clients. Private mode retains caller options, forces `config.private=true`, and
prefixes database-only topics with `shadowchat:db:`. Native channel configuration
uses the same namespace explicitly. There is no retry using a public channel.

`20261023004930_private_realtime_authorization.sql` permits active members to join
only that database namespace and the exact `app-release-updates` topic. Both
permissive and restrictive SELECT policies constrain the read lane; restrictive
INSERT denies all browser Broadcast/Presence publication even if an older
permissive policy exists. Anonymous private reads are denied. The service role
can publish release notices. Do not add member-content publishers to the database
namespace or broaden the client write policy.

The private channel gate does not replace per-table row visibility. Supabase
checks the channel before registering its Postgres subscription, and existing
table RLS still protects the rows. Its [channel implementation](https://github.com/supabase/realtime/blob/main/lib/realtime_web/channels/realtime_channel.ex)
confirms this ordering. Broadcast/Presence permissions are cached for a socket's
authorization lifetime; that is why chat and rosters retain canonical database
authorization rather than using a shared member-content Broadcast lane.

## Retained transports

| Surface | Transport after cutover |
| --- | --- |
| General, DMs, thread projections, read cursors, moderation, notifications, ShadowPin and other retained subscriptions | Existing Postgres Changes events through private database channels; existing RLS and callbacks preserved. |
| General/DM/thread typing | `typing_states` INSERT/UPDATE wakeups plus current authorized RPC reads; six-second leases. |
| Full-app Shadow War lobby | `shadow_war_lobby_presence` INSERT/UPDATE plus canonical roster RPC; server-owned identity and 45-second lease, 15-second heartbeat, reciprocal blocking, invisible-member and deletion checks. |
| Full-app paused board chat | Existing source and database send/receive behavior preserved; redundant full-message Broadcast removed. |
| Release notices | Private `app-release-updates` read lane; server publisher sends `private:true`. Existing database events, polling and local browser BroadcastChannel remain. |

The lobby migration is `20261023004931_shadow_war_lobby_presence.sql`. It keeps an
opaque UUID primary key and default replica identity, so cleanup DELETE keys
contain no member identity. Clients listen only to INSERT/UPDATE and expire rows
locally. Roster reads are revalidated during heartbeats and local block changes;
stale roster leases have no public Presence fallback. Both migrations depend on
the staged active-member access boundary.

## Required order and acceptance

1. Finish the coordinated backend migration review, including the active-member,
   typing, private-channel and lobby migrations. Reconcile the SECURITY DEFINER
   allowlist for the staged functions; do not mistake the deployed baseline
   allowlist for acceptance of this pending schema. Read back the policies,
   publication entries, source-table RLS and current Realtime setting.
2. Apply the migrations in the authorized environment. Enable
   `VITE_PRIVATE_REALTIME_ENABLED=true` in **both** full and streamlined builds.
   Native builds use `EXPO_PUBLIC_PRIVATE_REALTIME_ENABLED=true`. Keep compatible
   clients deployed together. A default-off preview remains compatible with the
   unchanged server but is not the secure release configuration.
3. Before disabling public access, verify two approved members can send/receive
   General and DM messages, use threads and typing, preserve unread/read cursors,
   and reconnect with these private configurations. Check the full app's lobby,
   release notices, moderation and retained subscription surfaces. Verify a
   nonparticipant, blocked member, deleted account and anonymous client cannot
   receive protected rows. Check iPhone/WebKit and Android/Chromium, then physical
   native/PWA behavior before store release.
4. Publish the compatible full-app release using
   `APP_RELEASE_PRIVATE_REALTIME_ENABLED=true` (or the matching web flag). The
   publisher must mark the REST Broadcast private. Existing public clients can
   still discover the release through canonical database updates and polling.
   Use the existing restart flow and preserve unsent drafts/pending outbox work.
5. In the authorized cutover, disable **Allow public access to channels** in
   Realtime Settings. Expect all connected sockets to disconnect once. Verify
   the updated clients rejoin privately and refetch without duplicate messages;
   verify an already-open legacy public socket closes and cannot rejoin. A stale
   client needs an update to restore realtime, but cannot continue leaking public
   member payloads while waiting for that update.
6. Prove public anonymous and authenticated joins receive `PrivateOnly`, including
   a Postgres Changes-only join. Prove private anonymous/unknown-topic joins fail,
   client-authored private Broadcast and Presence reach no recipient, and private
   server release notices still arrive. Use disposable canary content only. A
   Broadcast REST success status alone is not proof of delivery or denial:
   upstream [batch Broadcast handling](https://github.com/supabase/realtime/blob/main/lib/realtime/tenants/batch_broadcast.ex)
   can acknowledge requests without a permitted receiving channel. Observe both
   sender and receiver and retain sanitized evidence of disconnect/rejoin.
7. Check join latency, authorization-pool errors and reconnect behavior after the
   coordinated socket restart. Private joins add authorization work. Tune only
   from observed capacity, then record the final setting and tested build IDs.

Rollback must preserve the server privacy boundary: restore a compatible private
client or repair the narrow policy. Re-enabling public channels would reopen the
old-client leak and is not a safe privacy rollback.

## Local evidence and remaining gap

`node scripts/verify-private-realtime-local.mjs` executes the actual migrations in
isolated PostgreSQL and checks private topic access, denial despite permissive
legacy policies, spoofed writes, stale/deleted accounts, reciprocal blocking,
invisible presence, canonical labels, server leases, expiry and opaque delete
keys. Hook tests cover account/unmount races, cleanup, visibility, recovery and
missing-migration behavior. `tests/privateRealtimeTransport.node.test.mjs` uses
the installed Supabase SDK with a fixture WebSocket and exercises private wire
joins and Postgres event delivery for all 34 current call sites.

These tests do not emulate the hosted Realtime authorization service or prove
that a live settings change disconnects existing sockets. Docker could not start
the local Supabase stack in this workspace. Hosted cutover acceptance and physical
device checks remain mandatory before marking this production issue closed.

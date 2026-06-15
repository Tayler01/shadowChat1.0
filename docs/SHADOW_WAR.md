# Shadow War

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Shadow War is the first game in the Shadow Chat Entertainment area. The top-level
`Entertainment` navigation item opens a selector page; choosing Shadow War enters a
full-screen immersive game shell that hides Shadow Chat sidebars, mobile
navigation, and chat chrome while the duel is active. The selector structure is
ready for future games without nesting games inside Boards.

## Game Rules

- 2 players total, 1v1.
- Each player receives a private 20-card warband deck: two copies of ranks 1 through 10.
- Cards are original medieval/fantasy units, not playing cards and not tarot.
- Each round, players secretly place one card in each lane: Left, Center, Right.
- When both players lock, the server reveals the moves and resolves lane strength.
- Best 2 of 3 lanes wins the round.
- If lane wins are tied, the match enters Sudden War: each player secretly locks
  one unplayed reserve card from hand, both reserve cards reveal together, and
  the higher strength wins the round. If the reserve cards also tie, the round is
  recorded as a draw and the next round begins without scoring.
- First to 5 round wins completes the match.
- Queue support lets extra players wait behind an active duel; the winner can invite the next queued challenger.
- Rematch is available only when there is no queued challenger waiting.

The TypeScript rules engine in `src/features/games/shadow-war/engine` documents and tests the deterministic rules. The SQL resolver mirrors the release ability set for server-owned play: Scout bonus draw, Spy sabotage, Squire rally, Archer pressure, Shieldbearer guard, Captain command, Champion duelist, Warlord adjacent pressure, player-selected Sudden War, server-side scoring, and match completion.

## Database

Migration: `supabase/migrations/20260511213509_shadow_war_games.sql`

Follow-up fix migration:

- `supabase/migrations/20260511225157_shadow_war_fix_resolver_array_append.sql`
  fixes server resolver text-array appends and adds private player state updates
  to Supabase Realtime.
- `supabase/migrations/20260511231811_shadow_war_sudden_war_phase.sql`
  adds the player-selected Sudden War phase and reserve-card RPC.

Tables:

- `game_sessions`: shared game lobby/session records.
- `shadow_war_matches`: match score, round, phase, and public state history.
- `shadow_war_player_states`: private per-player deck/hand/discard state.
- `shadow_war_moves`: hidden round placements, visible after reveal.
- `game_session_queue`: queued challengers for an active/completed session.

RPCs:

- `create_shadow_war_session`
- `join_shadow_war_session`
- `queue_shadow_war_session`
- `leave_shadow_war_queue`
- `submit_shadow_war_placement`
- `submit_shadow_war_sudden_war_card`
- `resolve_shadow_war_round`
- `rematch_shadow_war_session`
- `start_shadow_war_next_challenger`

## Security Notes

- Browser clients do not insert sessions, moves, scores, or queue transitions directly.
- Hidden moves are stored in `shadow_war_moves`; RLS only exposes a user's own move until `revealed_at` is set.
- Private hands/decks are stored in `shadow_war_player_states`; RLS exposes only the current user's row.
- Match score and winner fields are updated only through RPCs.
- Non-players can read lobby information and queue, but cannot submit active match moves.
- Realtime is enabled for `game_sessions`, `shadow_war_matches`, `shadow_war_player_states`, `shadow_war_moves`, and `game_session_queue`.

## Assets

Initial generated art sheet:

- `public/games/shadow-war/shadow-war-asset-sheet.png`
- `public/games/shadow-war/cards/*.webp`
- `public/games/shadow-war/card-back.webp`
- `public/games/shadow-war/shadow-war-banner.webp`
- `public/games/shadow-war/shadow-war-logo.webp`
- `public/games/shadow-war/battlefield-table.webp`
- `public/games/shadow-war/audio/chronicles-of-a-hero.mp3`

Manifest:

- `src/features/games/shadow-war/assets/manifest.ts`

The current UI uses the generated banner as the immersive header itself,
optimized WebP card faces during match play, a dark generated battlefield
backdrop, and the provided `Chronicles of a Hero` MP3 as the in-game soundtrack.
The game selector click starts the soundtrack through the shared foreground-only
Web Audio soundtrack controller when the browser allows it; if playback is
blocked, the in-game music button retries playback. The controller avoids a
persistent hidden `<audio>` element and closes on background/pagehide so iPhone
does not treat game music as lock-screen media.
Code-native labels remain layered over the art for accessibility and reliable
small-screen readability.

## Local Testing

Recommended checks:

```powershell
npx jest --runInBand tests/shadowWarEngine.test.ts tests/Navigation.test.tsx
npx jest --runInBand tests/ShadowWarCardView.test.tsx
npx jest --runInBand tests/ShadowWarMatch.test.tsx
npm run typecheck
npm run lint
npm run build
```

For visual QA, use a production-style preview and open the Entertainment tab on mobile-sized viewports:

```powershell
npm run build
npx vite preview --host 127.0.0.1 --port 4174
```

After the Shadow War migration is applied to an approved Supabase target, run the
database-backed multiplayer smoke test with three stable test accounts:

```powershell
npm run qa:shadow-war
```

The script uses `PLAYWRIGHT_ACCOUNT_1_*`, `PLAYWRIGHT_ACCOUNT_2_*`, and
`PLAYWRIGHT_ACCOUNT_3_*` credentials from `.env.testing.local` or the process
environment. It creates a duel, joins player two, queues player three, verifies
hidden placements are not visible before reveal, verifies hidden Sudden War
reserve cards, blocks duplicate/non-player moves, verifies queue leave/requeue
behavior, blocks immediate rematch while a queued challenger is waiting, resolves
a full match, and starts the next queued challenger.

If a stable third test account is not yet configured, create one through
Supabase Auth admin for the run and pass it through process environment
variables. Do not commit test-account passwords.

For a two-account core pass before the third queue account exists:

```powershell
npm run qa:shadow-war:core
```

For a foreground two-account browser playthrough of the immersive UI:

```powershell
node scripts/shadow-war-visual-playtest.mjs --headed --slow-mo=80 --no-reuse-server --run-name=shadow-war-immersive-visual
```

The visual playtest cleans up stale active Shadow War sessions for the two test
accounts, opens the Entertainment selector, enters Shadow War, verifies the soundtrack
asset is mounted, creates and joins a duel, plays a full match through the UI,
and saves screenshots under `output/playwright/<run-name>/`.

## Known Follow-Ups

- Add richer next-challenger invitation status and both-player rematch consent.
- Add Playwright two-account E2E coverage once a test Supabase project is available for game tables.

# Shadow War Completion Audit

Last updated: 2026-05-11

This audit maps the Shadow War goal to concrete evidence. It is intentionally
strict: a green build or visual sweep is not treated as proof of multiplayer
correctness unless it exercises the database-backed game flow.

## Scope Decision

The latest product direction places Games in the top-level app navigation/menu
bar, not nested inside Boards. The current implementation follows that newer
direction.

## Prompt-To-Artifact Checklist

| Requirement | Evidence | Status |
| --- | --- | --- |
| Add a Games entry to app navigation | `src/types/navigation.ts`, `src/App.tsx`, `src/components/layout/MobileNav.tsx`, `src/components/layout/Sidebar.tsx`, `tests/Navigation.test.tsx` | Implemented and unit tested |
| Build reusable games area | `src/features/games/GamesHome.tsx`, `src/features/games/shadow-war/ShadowWarScreen.tsx` | Implemented |
| Ship first game, Shadow War | `src/features/games/shadow-war/**`, `docs/SHADOW_WAR.md` | Implemented locally |
| Avoid playing cards, suits, tarot | `src/features/games/shadow-war/engine/cards.ts`, `tests/shadowWarEngine.test.ts` | Unit tested |
| 1v1 lobby create/join flow | `create_shadow_war_session`, `join_shadow_war_session`, `shadowWarApi.ts`, `useShadowWar.ts`, `npm run qa:shadow-war:core`, `npm run qa:shadow-war` | Implemented and DB-smoke verified |
| Queue extra challengers | `game_session_queue`, `queue_shadow_war_session`, `leave_shadow_war_queue`, `start_shadow_war_next_challenger`, `npm run qa:shadow-war` | Implemented and DB-smoke verified |
| Rematch respects queue | `rematch_shadow_war_session`, `ShadowWarMatch.tsx`, `tests/ShadowWarMatch.test.tsx` | Implemented and component-tested; rematch is blocked when queued challenger exists |
| Hidden 3-lane placement | `shadow_war_moves` RLS, `submit_shadow_war_placement`, `ShadowWarMatch.tsx`, `npm run qa:shadow-war` | Implemented and DB-smoke verified |
| Server-owned scoring/winner | `resolve_shadow_war_round`, `npm run qa:shadow-war:core`, `npm run qa:shadow-war` | Implemented and DB-smoke verified |
| Secure hidden moves before reveal | `shadow_war_moves` SELECT policy only exposes own move or revealed moves, `npm run qa:shadow-war` | DB-smoke verified: opponent sees no move before reveal and both moves after reveal |
| Player-selected sudden-war tiebreak | `submit_shadow_war_sudden_war_card`, `resolve_shadow_war_round`, `ShadowWarMatch.tsx`, `npm run qa:shadow-war` | Implemented and DB-smoke verified |
| Private player hand/deck state | `shadow_war_player_states` SELECT policy exposes only own row, `npm run qa:shadow-war:core` | DB-smoke verified: each client sees exactly one own player-state row |
| Realtime updates | Realtime publication additions and `useShadowWar` subscriptions | Verified on remote for `game_sessions`, `shadow_war_matches`, `shadow_war_player_states`, `shadow_war_moves`, and `game_session_queue` |
| Strategic deterministic engine | `src/features/games/shadow-war/engine/*`, `resolve_shadow_war_round`, `tests/shadowWarEngine.test.ts`, `npm run qa:shadow-war` | Unit tested and DB-smoke verified |
| DB-backed multiplayer verifier | `scripts/shadow-war-db-smoke.mjs`, `npm run qa:shadow-war`, `npm run qa:shadow-war:core` | Passed against remote Supabase |
| Mobile-first game UI | `ShadowWarScreen.tsx`, `ShadowWarMatch.tsx`, `ShadowWarCardView.tsx` | Implemented |
| Generated original assets | `public/games/shadow-war/shadow-war-asset-sheet.png`, `src/features/games/shadow-war/assets/manifest.ts` | Generated asset sheet wired in |
| Optimized individual card assets | `public/games/shadow-war/cards/*.webp`, `public/games/shadow-war/card-back.webp`, `public/games/shadow-war/shadow-war-banner.webp` | Implemented |
| Documentation | `docs/SHADOW_WAR.md`, this audit | Implemented |
| Navigation/mobile visual QA | `npm run qa:mobile-pwa`, artifact `output/playwright/mobile-pwa-20260511220642/summary.json`; latest direct sweep `output/playwright/shadow-war-games-local-final/summary.json` with `15-games-home` screenshots for iPhone/Android | Passed |
| Standard verification | lint, typecheck, build, full Jest, targeted Shadow War tests, mobile QA, DB smoke | Passed |
| Supabase migration execution | `supabase db push --yes`, `supabase migration list --linked` | Applied and verified |
| End-to-end two-player game test | `npm run qa:shadow-war:core`, artifact `output/shadow-war/shadow-war-db-20260511225334/summary.json` | Passed |

## Current Verification Evidence

- `supabase --version`: `2.98.2`
- `supabase db push --dry-run`: succeeded and reported pending migrations:
  - `20260508225000_performance_hot_path_indexes.sql`
  - `20260511213509_shadow_war_games.sql`
- `supabase db push --yes`: applied:
  - `20260508225000_performance_hot_path_indexes.sql`
  - `20260511213509_shadow_war_games.sql`
- `npm run qa:shadow-war:core`: first post-migration run exposed a SQL array
  append bug in `resolve_shadow_war_round`.
- Follow-up migration `20260511225157_shadow_war_fix_resolver_array_append.sql`
  replaced text-array concatenation with `array_append(...)` and added
  `shadow_war_player_states` to the realtime publication.
- `supabase db push --yes`: applied
  `20260511225157_shadow_war_fix_resolver_array_append.sql`.
- `supabase migration list --linked`: confirmed the remote now includes
  `20260508225000`, `20260511213509`, and `20260511225157`.
- `supabase db query --linked`: confirmed these Shadow War tables are in
  `supabase_realtime`:
  - `game_sessions`
  - `shadow_war_matches`
  - `shadow_war_player_states`
  - `shadow_war_moves`
  - `game_session_queue`
- `npm run qa:shadow-war:core`: passed after the follow-up migration. Artifact:
  `output/shadow-war/shadow-war-db-20260511225334/summary.json`.
- `npm run qa:shadow-war`: stopped before game writes because
  `PLAYWRIGHT_ACCOUNT_3_EMAIL/PASSWORD` is not configured. Artifact:
  `output/shadow-war/shadow-war-db-20260511225456/summary.json`.
- A temporary third QA account was created through Supabase admin for the full
  queue smoke run without printing or storing service-role credentials.
- `npm run qa:shadow-war`: passed with create/join/queue/leave/requeue,
  hidden-move, duplicate-move, non-player, completion, rematch-block, and
  next-challenger checks. Artifact:
  `output/shadow-war/shadow-war-db-20260511225917/summary.json`.
- Follow-up migration `20260511231811_shadow_war_sudden_war_phase.sql` added
  the `sudden_war` phase, `sudden_war` move type, reserve-card submit RPC, and
  resolver support for player-selected sudden-war tiebreaks.
- `supabase db push --yes`: applied
  `20260511231811_shadow_war_sudden_war_phase.sql`.
- `npm run qa:shadow-war`: passed after the sudden-war migration, including
  deterministic tied rounds, hidden sudden-war reserve cards, sudden-war reveal,
  full match completion, queue, rematch-block, and next-challenger checks.
  Artifact: `output/shadow-war/shadow-war-db-20260511232645/summary.json`.
- Latest `npm run lint`: passed after the sudden-war UI/API/RPC updates.
- Latest `npm run typecheck`: passed after the sudden-war UI/API/RPC updates.
- Latest `npm run build`: passed after the sudden-war UI/API/RPC updates with
  the existing Vite circular manual-chunk warning.
- Latest `npx jest --runInBand`: passed, 63 suites and 236 tests.
- Latest mobile PWA visual QA passed after the sudden-war UI updates. Artifact:
  `output/playwright/shadow-war-sudden-war-final/summary.json`.
- `npx jest --runInBand`: passed, 63 suites and 236 tests.
- Latest `git diff --check`: passed with CRLF line-ending warnings only.
- Static migration pre-flight tightened the queue constraint to a partial
  active-entry index, so a user can queue, leave, queue again, and leave again
  without a unique-conflict on historical `left` rows.
- Static migration pre-flight also revoked browser execution from internal
  helper functions and grants only the public game RPC surface needed by the
  app.
- `npm run qa:mobile-pwa`: passed on 2026-05-11 with artifact directory
  `output/playwright/mobile-pwa-20260511220642`.
- `node scripts/mobile-pwa-visual-qa.mjs --no-reuse-server --run-name=shadow-war-games-local-final`:
  passed on 2026-05-11 with artifact directory
  `output/playwright/shadow-war-games-local-final`.
- `node scripts/mobile-pwa-visual-qa.mjs --no-reuse-server --run-name=shadow-war-games-post-db`:
  passed after applying the Shadow War database migrations. Artifact directory:
  `output/playwright/shadow-war-games-post-db`.
- Post-DB Games visual flow `15-games-home` passed with no failures, warnings,
  horizontal overflow, clipped primary actions, or small tap target findings on:
  - `iphone-small-webkit`
  - `iphone-large-webkit`
  - `android-medium-chromium`
  - `android-small-chromium`
- Latest `npm run lint`: passed.
- `npm run lint`: passed with no warnings after removing an unused
  `no-var` eslint-disable directive in `src/lib/supabase.ts`.
- `npm run typecheck`: passed.
- `npm run build`: passed with the existing Vite circular manual-chunk warning.
- Latest post-cleanup verification also passed:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run build`
  - `npx jest --runInBand tests/ShadowWarCardView.test.tsx tests/ShadowWarMatch.test.tsx tests/shadowWarEngine.test.ts tests/Navigation.test.tsx`
  - `supabase db push --dry-run`
- Latest post-migration-hardening `supabase db push --dry-run`: passed and
  still reports only the expected pending migrations:
  - `20260508225000_performance_hot_path_indexes.sql`
  - `20260511213509_shadow_war_games.sql`
- `git diff --check`: passed with CRLF line-ending warnings only.
- `node --check scripts/shadow-war-db-smoke.mjs`: passed after adding
  leave/requeue and rematch-block checks.
- `npm run lint -- scripts/shadow-war-db-smoke.mjs`: passed.
- Latest `npm run typecheck`: passed.
- Latest `npm run build`: passed with the existing Vite circular manual-chunk
  warning.
- Environment pre-flight found `PLAYWRIGHT_ACCOUNT_1_*` and
  `PLAYWRIGHT_ACCOUNT_2_*` in `.env.testing.local`, so the two-account
  `npm run qa:shadow-war:core` verifier has credentials after migration.
  `PLAYWRIGHT_ACCOUNT_3_*` is not present in `.env.testing.local`, so the full
  queue verifier used a temporary Supabase-admin-created account for this run.
- `npx jest --runInBand`: passed, 63 suites and 236 tests.
- `npx jest --runInBand tests/ShadowWarCardView.test.tsx tests/shadowWarEngine.test.ts tests/Navigation.test.tsx`:
  passed, 3 suites and 13 tests.
- `npx jest --runInBand tests/ShadowWarCardView.test.tsx tests/ShadowWarMatch.test.tsx tests/shadowWarEngine.test.ts tests/Navigation.test.tsx`:
  passed, 4 suites and 16 tests.
- `npm run qa:shadow-war`: added but not run successfully yet because the
  target database does not have the Shadow War migration applied.
- `npm run qa:shadow-war:core`: pre-migration run failed as expected with
  PostgREST `PGRST202`, because `public.create_shadow_war_session` is not in
  the remote schema cache before applying `20260511213509_shadow_war_games.sql`.
  Latest artifact: `output/shadow-war/shadow-war-db-20260511223247/summary.json`.
- Earlier Games visual flow `15-games-home` passed with no failures, no
  warnings, no horizontal overflow, no clipped primary actions, and no small tap
  target findings on:
  - `iphone-small-webkit`
  - `iphone-large-webkit`
  - `android-medium-chromium`
  - `android-small-chromium`

## Remaining Follow-Ups

1. Add richer next-challenger invitation status and both-player rematch consent.

## Completion Rule

Do not mark the Shadow War goal complete until the migration is applied to an
approved database target and a real two-player multiplayer flow is verified, or
the remaining gaps are explicitly accepted as launch follow-ups.

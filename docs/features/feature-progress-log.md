# Feature Progress Log

## Documentation Status - July 14, 2026

Refreshed for the July 10 Release A deployment. Historical feature entries
remain below; current shipped-versus-candidate status and follow-ups are tracked
in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Use this log for long-running `/goal` work and feature implementations that span
multiple checkpoints. Keep entries concise, factual, and tied to verification.

## Current Release - Audit Hardening And Social Foundations

Status: shipped through the backend-first `main` workflow. Release closeout is
applying a forward revocation for two historical extra active-table grants and
must finish linked, health-manifest, and live-smoke proof before Release B.

The July 10 candidate includes service-worker and DM lifecycle work,
private-identity Release A consumer cutover (including Expo 57 selectors),
recipient-owned Realtime notification events, privacy-safe bounded push retry,
reciprocal personal blocking, the General Chat/DM Message Library, ShadowPin
tags/search/one-level comments and ready-state notifications, Shadow Mystery
publishing, and Shado TV captions/premieres/analytics.

Canonical detail and release gates live in:

- [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1)
- [PERSONAL_BLOCKING.md](C:/repos/chat2.0/docs/PERSONAL_BLOCKING.md:1)
- [MESSAGE_LIBRARY.md](C:/repos/chat2.0/docs/MESSAGE_LIBRARY.md:1)
- [SHADOW_PIN.md](C:/repos/chat2.0/docs/SHADOW_PIN.md:1)
- [REALTIME_PUSH_NOTIFICATIONS_PLAN.md](C:/repos/chat2.0/docs/REALTIME_PUSH_NOTIFICATIONS_PLAN.md:1)
- [DEPLOYMENT_GUIDE.md](C:/repos/chat2.0/docs/DEPLOYMENT_GUIDE.md:1)

## Current Goal

### ShadowChat 2.0 Wave Three

- Goal: deliver Connections, ShadowPin Feed Modes, and Inner Circles in that
  order on `codex/shadowchat-2.0`, then prepare the gated Shado Live prototype
  and deterministic source-linked Catch-Up track without changing production
  `main`.
- Started: 2026-07-13
- Status: Candidates 1-3 and the combined Wave Three regression/mobile/cleanup
  gate are accepted. The flagged frontend-only Shado Live prototype and
  deterministic source-linked Catch-Up implementation are complete through
  local, shared-backend, unit, routing, and Pixel Chromium/iPhone WebKit proof,
  then polished and reaccepted on isolated deploy
  `6a561d93dc105334eca9a5f9`. The full live
  system remains gated by paused Activity and member reporting, and no private
  AI Catch-Up trial has started.
- Backend boundary: reciprocal caller-private relationships, no public graph or
  counts, personal-block teardown with no restore, and compatibility with the
  unchanged production frontend sharing Supabase.
- Delivery boundary: verify each candidate independently before beginning the
  next, then run one combined local/shared-backend/mobile/cleanup/isolated-
  Netlify gate.
- Roadmap: [SHADOWCHAT_2_0_WAVE_THREE.md](C:/repos/chat2.0/docs/SHADOWCHAT_2_0_WAVE_THREE.md:1)
- Candidate 1 contract: [CONNECTIONS.md](C:/repos/chat2.0/docs/CONNECTIONS.md:1)
- Candidate 1 proof: linked migration `20260713190000`, unchanged-production
  compatibility smoke, 192 Jest suites / 1,008 passing tests, 42 Node contract
  tests, clean lint/typecheck/build/budgets, and repeat two-account Pixel
  Chromium/iPhone WebKit proof against immutable deploy
  `6a556190a9c126b4758b29f1` with unchanged DM history and zero residue.
- Candidate 2 contract: [SHADOW_PIN_FEED_MODES.md](C:/repos/chat2.0/docs/SHADOW_PIN_FEED_MODES.md:1)
- Candidate 2 proof: linked migration `20260713223200`, clean unchanged-
  production auth/resume-send smoke, local SQL/security/build/full-regression
  gates, and repeat two-account Pixel Chromium/iPhone WebKit proof against
  immutable deploy `6a5575bcbc2a1131aab40695` and the stable isolated URL.
  The browser gate covered persistence, universal Search, ordered feeds,
  Theater, hearts/comments, Back routes, relationship teardown/reconnect,
  geometry/diagnostics, exact preference restoration, and zero residue.
- Candidate 3 contract: [INNER_CIRCLES.md](C:/repos/chat2.0/docs/INNER_CIRCLES.md:1)
- Candidate 3 proof: linked migration `20260713235745`, clean linked dry run,
  local/remote security parity, unchanged-production compatibility smoke, 201
  Jest suites / 1,065 passing tests, 42 Node contracts, clean lint/typecheck/
  build/budgets, transactional SQL, and complete Pixel Chromium/iPhone WebKit
  lifecycle/feed/Theater/comments/geometry/diagnostics/cleanup proof against
  immutable deploy `6a55892252f0d306fae5b852`. Stable isolated deploy
  `6a558acc257a6d21fa379fa2` serves the byte-identical boot artifact and passed
  a fresh iPhone WebKit Connections -> Circles route check.
- Combined proof: each complete two-account Pixel Chromium/iPhone WebKit
  candidate verifier passed on exact immutable deploy
  `6a558acc257a6d21fa379fa2` with exact cleanup. The core auth, DM, and mobile
  DM Back smoke also passed after its mobile readiness selector was aligned to
  the visible message viewport and composer.
- Shado Live contract: [SHADO_LIVE.md](C:/repos/chat2.0/docs/SHADO_LIVE.md:1)
- Shado Live proof: compile-time default-build exclusion plus flagged lazy
  route, unit coverage, and Pixel Chromium/iPhone WebKit routing, focus,
  keyboard, geometry, 130% text, diagnostics, no-permission, no-network, and
  zero-residue checks. The July 14 cleanup adds the final retro picker banner,
  premium mobile lobby/stage treatment, normal-flow stage/panel layout,
  keyboard-locked composer, accessible tabs/dialog/controls, and a four-profile
  320px/Pixel/iPhone/desktop verifier. It is UI state only; the full live
  backend is not built.
- Catch-Up contract: [CATCH_UP.md](C:/repos/chat2.0/docs/CATCH_UP.md:1)
- Catch-Up proof: linked additive migration `20260714020000`, clean migration
  parity/dry run, local and linked database lint/security, rollback-only
  two-user SQL proof, unchanged-production compatibility smoke, strict
  frontend/unit/routing coverage, and authenticated Pixel Chromium/iPhone
  WebKit on-demand, source-route, Back/focus, geometry, diagnostics, and zero-
  acknowledgement/residue checks. V1 contains no AI.
- Final-track deploy proof: initial implementation commit `0ff5127` established
  the track; polish commit `47df36f` produced the current flagged, budget-clean
  artifact. Immutable deploy `6a561c97b13a2f301ce618f4` passed Shado Live,
  Catch-Up, auth, DM, and mobile DM Back; stable deploy
  `6a561d93dc105334eca9a5f9` serves the same artifact and repeated those gates
  with zero Shado Live media/backend residue.
- Production `main` and the production Netlify frontend remain unchanged.
- Remaining final-track work: RD-030 installed iPhone/Android acceptance,
  multi-tester feedback and targeted fixes, then explicit production-merge
  approval. The real Shado Live backend remains gated by reporting, Activity,
  operator safety, and provider selection; the private AI Catch-Up trial has
  not started.

### ShadowChat 2.0 Wave Two

- Goal: build Universal Discovery & Library, True General Chat Threads,
  ShadowPin Creator Studio, and the First-Run Activation Journey on the
  isolated `codex/shadowchat-2.0` branch without changing production `main`.
- Started: 2026-07-12
- Status: automated Wave Two gate complete. All four candidates are
  implemented, documented, remotely aligned, and passed their local plus
  authenticated immutable-deploy checkpoints. The isolated trial is ready for
  Tayler's installed-phone acceptance; production `main` remains unchanged.
- Backend boundary: shared Supabase changes are additive and backward
  compatible. Existing production RPC signatures and RLS remain authoritative.
- Delivery boundary: four separate verified checkpoints, then a combined
  regression/mobile gate and isolated Netlify trial deployment.
- Roadmap: [SHADOWCHAT_2_0_WAVE_TWO.md](C:/repos/chat2.0/docs/SHADOWCHAT_2_0_WAVE_TWO.md:1)
- Candidate 1: Universal Discovery & Library with bounded partial-error search,
  exact Chat/DM/Pin/Play routing, Back restoration, and owner-private saves for
  messages, Pins, published TV, and published Mystery stories.
- Candidate 1 backend proof: additive linked migration, clean local replay,
  zero database lint/security-advisor findings, rollback-only operator draft/
  hidden/deleted and cross-owner negative checks, and linked no-pending proof.
- Candidate 1 product proof: 171 Jest suites / 872 passing tests, zero-warning
  lint, TypeScript, production build/paused chunks/budgets, and authenticated
  Pixel Chromium/iPhone WebKit geometry with zero console/page errors.
- Candidate 1 contract: [UNIVERSAL_DISCOVERY_LIBRARY.md](C:/repos/chat2.0/docs/UNIVERSAL_DISCOVERY_LIBRARY.md:1)
- Candidate 2: True General Chat Threads keeps `public.messages` canonical and
  the production flat-window contract intact while adding a server-owned
  reply-to-root projection, root-only 2.0 feed summaries, bounded routed
  thread pages, per-thread read cursors, and canonical push/search handoffs.
- Candidate 2 current UI: full-height phone sheet, right-side desktop drawer,
  fixed thread composer, exact target focus, older-page scroll preservation,
  and a non-disruptive new-replies affordance.
- Candidate 2 security: invoker/RLS readers, read-only mapping, private
  trigger-owned derivation, reciprocal block filtering/rejection, safe profile
  JSON, bounded pages/summaries, and deletion placeholders.
- Candidate 2 backend proof: linked migration `20260712234202`, deployed
  thread-aware `send-push`, clean local replay, rollback-only multi-user
  verifier, zero database lint/security-advisor findings, and aligned linked
  dry-run/history.
- Candidate 2 product proof: 173 Jest suites / 885 passing tests, zero-warning
  lint, TypeScript, production build/paused chunks/budgets, and authenticated
  two-account Pixel Chromium/iPhone WebKit realtime, exact-route, geometry,
  root-anchor, console, and cleanup proof.
- Candidate 2 contract: [GENERAL_CHAT_THREADS.md](C:/repos/chat2.0/docs/GENERAL_CHAT_THREADS.md:1)
- Candidate 3: ShadowPin Creator Studio replaces direct publish with a lazy
  Media/Details/Preview/Publish flow, autosaved recovery, real upload/process
  progress, explicit confirmation, exact Theater success, and atomic safe
  replacement.
- Candidate 3 backend boundary: owner-private creator drafts, server-owned
  staged-asset ledger, private staging bucket, idempotent finalization, and no
  draft participation in public Pin reads/search/score/activity/engagement or
  notifications.
- Candidate 3 verification status: implementation and seven focused model/
  history/API/component/entrypoint/media/SQL suites (46 tests) pass locally;
  the broader route/ShadowPin set passes 9 suites and 107 tests. Hardening adds
  local-draft conflict recovery, safe draft switches, exact-origin routing,
  phone touch sizing, target-version enforcement, atomic leased image publish
  with scheduled orphan recovery, private-until-publish Bunny delivery, and
  bounded media work. The hardening backend gate passes a fresh local reset,
  expanded rollback verifier, database lint/advisors, Deno/Node checks, and 3
  focused suites with 21 tests. The expanded authenticated workflow passed on
  final immutable Netlify deploy `6a549b1e052c56307d851b7d` with two controlled
  accounts, Pixel Chromium `412x915`, and iPhone WebKit `390x844`. Nineteen
  recorded checks cover every entry path, image/local-video/URL selection,
  retry, private recovery, one Pin/event, Theater routing, and atomic edit/move/
  replacement. It found and fixed an existing-poster preview ordering bug; the
  exact deploy and focused regression now pass. Cleanup proved zero remaining
  scoped database/Storage artifacts. Linked history/dry-run and the combined
  Wave Two regression gate are clean.
  Physical installed-PWA proof remains Tayler's separate acceptance gate.
- Candidate 3 contract: [SHADOW_PIN_CREATOR_STUDIO.md](C:/repos/chat2.0/docs/SHADOW_PIN_CREATOR_STUDIO.md:1)
- Candidate 4: a future-invite-only First-Run Activation Journey with
  resumable identity, notification/Comfort review, one server-confirmed first
  action, and optional install guidance.
- Candidate 4 backend proof: additive linked migrations, future-only genuine
  invite enrollment with no backfill, forced owner-private RLS, validated step
  order, revision conflicts, canonical Chat/DM/Pin completion, invoker-only
  public RPC over an unexposed owner-checking definer, fail-closed future
  function defaults, clean local replay, transactional rollback verifier,
  zero linked lint findings, zero activation advisor findings, and linked
  no-pending proof.
- Candidate 4 product proof: immutable deploy `6a549b1e052c56307d851b7d`,
  six Pixel Chromium/iPhone WebKit profiles, 139 checks, and 47 screenshots.
  General Chat, DM, and ShadowPin actions pass in both engines with exact server
  enrollment, Escape/Back/reload resume, focused footer geometry, nested-route
  restoration, cross-owner denial, optional install contracts, zero browser/
  network/backend errors, and four exact intercepted push requests with zero
  live delivery. The run also found and fixed a Pin Browser-Back lookup race.
  Cleanup removed six users/invites, four messages, two conversations, and two
  hearts and proved all 14 counters zero. Email delivery was intentionally
  excluded; the official generated signup-link path created canonical Auth
  users without sending email.
- Candidate 4 contract: [FIRST_RUN_ACTIVATION_JOURNEY.md](C:/repos/chat2.0/docs/FIRST_RUN_ACTIVATION_JOURNEY.md:1)

## Prior Goal

### ShadowChat 2.0 Wave One

- Goal: build five high-impact product upgrades on the isolated
  `codex/shadowchat-2.0` branch, preserve the production frontend and shared
  Supabase contract, then publish a separate installable Netlify test site.
- Started: 2026-07-11
- Status: revision verified, live on the separate Netlify trial branch, and
  accepted for Wave Two. Activity and member report intake remain paused.
- July 12 phone refinement: removed the shared mobile header from all active
  tabs, relocated required nested actions without another bar, tightened the DM
  top controls, fixed neutral radial-release activation, and unified the
  ShadowPin Theater slide stage/source/transition geometry. Focused and full
  verification plus trial redeployment remain the closing gate for this pass.
- Candidate 1: Unified Activity HQ with an authoritative recipient ledger,
  realtime/recovery, exact Chat/DM/Pin routes, five-item phone navigation,
  accessible unread handling, and hard-bounded foreground toast lifetime.
- Current decision: preserve Candidate 1 source/backend but compile its
  navigation, provider, queries, and subscriptions out of the trial frontend.
- Backend proof: clean local database replay, zero Supabase lint findings,
  reviewed security-definer/table-grant contract, and rolled-back producer/RLS/
  cleanup verification across nine event cases.
- Browser proof: Android Chromium and actual WebKit phone layouts, exact
  General Chat/DM/Pin-comment handoffs, live DM-to-Activity prepend and badge
  increment, keyboard/focus review, and no final console errors.
- Roadmap: [SHADOWCHAT_2_0_WAVE_ONE.md](C:/repos/chat2.0/docs/SHADOWCHAT_2_0_WAVE_ONE.md:1)
- Feature contract: [ACTIVITY_HQ.md](C:/repos/chat2.0/docs/ACTIVITY_HQ.md:1)
- Candidate 2: ShadowPin Theater with one-tap immersive viewing, bounded cold
  exact links, horizontal paging and layered history, media lifecycle and
  third-party consent, zoom/swipe arbitration, visual-viewport Comments, and
  keyset comment pages.
- Candidate 2 proof: 84 focused tests plus 151-suite/752-test full regression;
  authenticated two-page PostgREST cursor proof; Android Chromium and actual
  WebKit phone acceptance with 48px control, history, comments, zoom,
  safe-area, and consent verification.
- Candidate 2 contract: [SHADOW_PIN_THEATER.md](C:/repos/chat2.0/docs/SHADOW_PIN_THEATER.md:1)
- Candidate 3: DM Conversation Hub with searchable Inbox/Unread/Archived
  modes, private pin/archive/manual-unread state, rich draft/mute/media rows,
  route-aware phone history, consolidated conversation details, bounded
  in-thread search/shared content, and authoritative old-message windows.
- Candidate 3 backend proof: clean local replay and three-user RLS verifier;
  immutable canonical participant pairs; narrowed message edits; legacy
  client send/edit/delete/read/reaction compatibility; automatic unarchive;
  Realtime preferences; and security-invoker bounded retrieval.
- Candidate 3 product proof: 157 suites / 789 tests, lint/typecheck/build and
  budgets, authenticated two-account DM smoke, plus Android Chromium and
  WebKit phone acceptance for pinning, details, search, exact routing, shared
  filters, 48-pixel controls, and header/system Back.
- Candidate 3 contract: [DM_CONVERSATION_HUB.md](C:/repos/chat2.0/docs/DM_CONVERSATION_HUB.md:1)
- Candidate 4: member reporting plus an operator Safety Case Center with
  private immutable evidence, reporter receipts, RLS-separated queues,
  optimistic versioning, and audited actions.
- Current decision: preserve intake/history source and the complete backend,
  pause all member-facing Report/My Reports UI, and keep the operator Case
  Center active for existing cases.
- Candidate 5: device-local Comfort Profiles for motion, transparency,
  contrast, text scale, message density, touch targets, autoplay, sound, and
  haptics, applied before React paints.
- Combined proof, July 12: 164 Jest suites / 829 passing tests, 41 Node
  contracts, 154 documentation files, clean lint/type/build/budgets, clean local
  and linked database lint/security contracts, and three linked additive
  migrations.
- Trial: `https://shadowchat-2-0-wave-one.netlify.app`; the public health
  manifest is authoritative for the current branch SHA. Full authenticated smoke, Pixel 7 feature probe,
  compact/Android/iPhone comfort matrix, Sharp media Function boundary, and
  controlling service worker passed. Physical installed-phone acceptance is
  the remaining approval step.

### Shadow Runner Playable Prototype Prep

- Goal: Rebuild the Shadow Runner title/menu surface as clean asset-driven UI,
  keep the phone-first landscape flow stable, preserve current gameplay
  geometry, and prepare the next Phaser playable-prototype checkpoint.
- Started: 2026-06-09
- Status: active
- Owner/agent: Codex
- Branch: `main`
- Current checkpoint: direct Shadow Runner entry without an access-code gate,
  campaign level-map progression, reusable level configs, Level 1 through
  Level 6 production routes, and mobile landscape/orientation handling.
- Roadmap: [`docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md`](C:/repos/chat2.0/docs/SHADOW_RUNNER_PLAYABLE_PROTOTYPE_ROADMAP.md:1)
- Latest pass, 2026-07-10: shipped playable Level 6 `Clockmaker Yard`, a
  generated background/terrain/Chrono asset set, the new Lantern Bandit Scout,
  a time-slowing Chrono Lantern power-up, five recovery checkpoints, and a
  route roughly 15 percent longer than Candle Fair without removing readable
  landing and recovery space.
- Combat pass, 2026-07-10: expanded health from 3 to 12 points, made the three
  HUD hearts represent lives and empty when lives are spent, added a separate
  proportional health bar, and assigned different damage values to enemy
  contact, projectiles, spikes, flames, and falls.
- Verification, 2026-07-10: targeted TypeScript/Jest/runtime-asset checks
  passed; production-preview phone play passed at `740x390` and `932x430` for
  Level 6 detail/start, checkpoints, Chrono activation, life-heart removal,
  all crawl/high/final route segments, pool caps, and completion. Tutorial and
  Levels 1-5 also passed landscape regression playthroughs, with an additional
  Android Level 5 pass. Evidence is in
  `output/playwright/shadow-runner-level6-final/`,
  `output/playwright/shadow-runner-health-regression-*/`, and
  `output/playwright/shadow-runner-level5-android-health-regression/`.
- Latest pass, 2026-06-09: generated dedicated options-scroll and options-row
  button assets; removed title back/sound controls; added title Options and
  in-game Pause scroll menus; widened the title menu scroll without increasing
  height; lowered the right mission-scroll pedestal; and hardened long-press
  selection/context-menu suppression across the Shadow Runner surface.
- Latest pass, 2026-06-10: wired the cleaner `clockwork-sentry-v2` runtime
  strip, kept the sentry on deterministic patrol bounds instead of side-block
  direction flips, and documented the clean HUD/heart/coin/health assets.
- Latest pass, 2026-06-11: fixed Level 1 terrain rendering by registering
  named Phaser frames from the generated stone sheet, generated and wired a
  dedicated tilt-bridge asset, added landing/contact/finish feedback polish,
  and cataloged the new Barrel Roller plus Ivy Viaduct asset batch.
- Latest pass, 2026-06-11: split the title actions into `Start Tutorial` and
  `Select Level`, generated a branded level-map scroll plus Level 1 thumbnail,
  added a locked grayscale 10-level campaign map, moved full Level 1 behind the
  map flow, kept the tutorial route short, introduced reusable level metadata
  for future maps, and cataloged the new Candle Jester / Candle Fair assets.
- Latest pass, 2026-06-11: replaced the card-grid level selector with a
  generated full-screen parchment campaign map, ten individual generated
  location-button assets, and a dotted route overlay that reflects
  locked/unlocked/completed progression.
- Latest pass, 2026-06-11: fixed the campaign-map back arrow hit area, changed
  the level-complete overlay to `Return to Map` / `Next Route`, aligned the
  generated tilt-bridge art to its collision plane, and documented progressive
  campaign difficulty plus future stronger tilt/dump-off bridge behavior.
- Latest pass, 2026-06-11: generated and wired a blank parchment
  level-detail popup for the full-screen campaign map, changed map stops to
  inspect before start/replay, added route type/difficulty/mechanic metadata
  for all 10 stops, preloaded campaign thumbnails to avoid black popup frames,
  and made Level 2 tilt-bridge wobble metadata slightly faster without
  changing collision.
- Latest pass, 2026-06-11: extended Level 1 and Level 2 into longer routes
  with multiple Clockwork Sentries, denser Level 2 spike placement, raised
  tilt-bridge visuals, gameplay slide influence from tilting bridges,
  functional crouch/crawl movement, generated translucent mobile control
  buttons, and a generated level-detail thumbnail frame.
- Latest pass, 2026-06-11: generated original Shadow Runner WAV sound effects,
  added a reusable audio manifest/preferences layer, wired menu/map/pause and
  Phaser gameplay events to pooled SFX playback, and changed music behavior so
  the Castle Bard loop is on by default in the lobby/title/map but pauses
  automatically during playable levels.
- Latest pass, 2026-06-11: hardened the Level 3 `Ivy Viaduct` route with a
  longer finish path, faster/heavier tilt bridges, extra spikes/coins/enemy
  pressure, safer Barrel Roller patrol bounds, local-preview enemy debug
  snapshots, story-facing mission/completion text, and a researched split-thumb
  mobile control layout with a large D-pad plus right-corner jump/attack
  controls.
- Latest pass, 2026-06-11: removed the Shadow Runner access-code gate, kept
  the rotate gate as the unsupported-orientation fallback, and added a
  picker-level best-effort fullscreen/landscape request that is released on
  Shadow Runner exit.
- Latest pass, 2026-06-15: added the playable Level 4 `Bell Tower Archives`
  route with required low-clearance archive platforms, risky optional coin
  lines, Scroll Thieves, Tower Archers with projectiles, mixed old enemies, and
  the Moonheart Crest health-restore/attack/damage-resistance boost.
- Verification, 2026-06-15: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome production-preview smoke passed at
  `932x430` and `740x390`, covering Bell Tower detail/start, required crouch
  traversal, Moonheart boost HUD, Tower Archer encounter, finish overlay, and a
  debug snapshot with grounded archers and moving patrol enemies. Evidence in
  `output/playwright/shadow-runner-bell-tower-20260615/`.
- Polish follow-up, 2026-06-15: replaced the Bell Tower arch-style crouch
  obstacle visuals with low-clearance overhead platforms assembled from Bell
  Tower slabs, blocks, and archive shelves, and rounded Moonheart boost HUD
  countdown updates to whole seconds for lighter React overlay churn.
  Production-preview evidence in
  `output/playwright/shadow-runner-polish-final-20260615/` covers title, map,
  playable Levels 1-4, Bell Tower low-clearance traversal, boost, enemy,
  completion, and `740x390` phone-landscape checks.
- Game audio follow-up, 2026-06-15: replaced the shared hidden `<audio>`
  soundtrack element for Shadow War, Shadow Checkers, and Shadow Runner with a
  foreground-only Web Audio soundtrack controller, hard-stopped game music on
  background/pagehide to avoid iPhone lock-screen media cards, and fixed the
  Shadow Runner title music action so stopped foreground music can restart from
  a user tap without disabling the saved music preference.
- Bell Tower crouch-control follow-up, 2026-06-15: lowered the low-clearance
  blocker bottoms so standing movement collides while crouched movement fits,
  raised the blocker tops so climbing onto the archive platforms is much
  harder, and changed the mobile D-pad crouch action from hold-to-crouch to
  tap-toggle crouch with jump clearing the crouch state.
- Bell Tower coin-route follow-up, 2026-06-15: lowered the crawl-space coins
  into the crouched hitbox lane, raised coin rendering above the archive
  platforms, added collision-only micro-steps for the optional top route, and
  placed six new high/top coins above the two low-clearance archive platforms.
- Shadow Runner medals, 2026-06-15: added generated runner and knight badge
  icons to the shared name-badge renderer; added a server-side Shadow Runner
  level catalog plus per-user completion ledger; seeded Level 4 `Bell Tower
  Archives` as the current hardest available route; and wired catalog/completion
  triggers so future harder level releases recalculate and revoke stale knight
  medals through `public.users` realtime updates.
- Latest pass, 2026-06-19: added playable Level 5 `Candle Fair Ruins` as the
  longest and hardest route so far, using the Candle Fair background/props
  sheet, Candle Jester enemies with short-range candle throws, multi-lane
  offscreen archer volley zones, shield pickups, improved tilt-bridge fall-off
  behavior, high-route fall damage, harder optional coin lines, and completion
  reporting for enemy clears. Added a forward migration that marks Level 5 as
  available and recalculates Shadow Runner knight medals against the new
  hardest route.
- Verification, 2026-06-19: removed eager `image.decode()` from Shadow Runner
  preload to stabilize constrained landscape title loads, added direct
  localhost entertainment preview entry for Shadow Runner QA, and verified
  Level 5 with `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`,
  `npm run build`, `npx jest --runInBand`, and installed-Chrome
  production-preview smoke at `740x390` plus a `932x430` full flow covering
  Level 5 start, tilt shortcut, shield pickup HUD, and completion dialog.
  Evidence in `output/playwright/shadow-runner-level5-20260619/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` passed.
  WebKit mobile landscape captures verified the revised controls at `932x430`
  and `740x390`; headed Chrome-channel foreground playtest verified Level 3
  patrol snapshots, combat/health, jump/crouch/attack input, and a focused
  Level 3 completion check. Evidence in
  `output/playwright/shadow-runner-controls-research/` and
  `output/playwright/shadow-runner-foreground/`.
- Verification, 2026-06-11: `npm run shadow-runner:audio`,
  generated WAV header validation, `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome-channel production-preview audio
  probes verified lobby music start, gameplay music pause, lobby resume on
  main-menu return, no in-game music button, all 19 SFX files fetch as RIFF
  WAVs, and touch gameplay SFX for jump, double jump, sword swing, land, and
  pause. Evidence in `output/playwright/shadow-runner-audio-pass/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, and `npm run build` passed.
  Chrome-channel production-preview visual smoke passed for Level 1/2 detail
  popups and Level 1/2 gameplay controls/enemy/hazard captures at `932x430`
  and `740x390`; evidence in
  `output/playwright/shadow-runner-next-goal/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, manifest JSON
  parse, and Chrome-channel production-preview smoke passed for playable,
  locked, completed, return-to-map, Level 2 unlock/start, and canvas launch
  flows at `932x430` and `740x390`; evidence in
  `output/playwright/shadow-runner-level-detail-goal/final/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  Chrome-channel production-preview smoke passed for map back navigation,
  Level 1 completion actions, return-to-map unlock state, and tilt-bridge
  visual alignment; evidence in
  `output/playwright/shadow-runner-map-actions-pass/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, manifest JSON
  parse, and Chrome-channel production-preview visual smoke passed for the
  full-screen campaign map at `932x430` and `740x390`; evidence in
  `output/playwright/shadow-runner-campaign-map-pass/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome-channel production-preview visual
  smoke passed for locked map, Level 1 completion unlock, and Level 2 launch;
  evidence in `output/playwright/shadow-runner-level-map-goal/`.
- Verification, 2026-06-11: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and
  `npx jest --runInBand` passed. Chrome-channel production-preview visual
  smoke passed at `932x430`; evidence in
  `output/playwright/shadow-runner-level1-goal/` shows visible generated stone
  chunks, the generated tilt bridge, sentry state, pause menu without `Exit
  Game`, and level-complete actions limited to restart/main menu.
- Verification: `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, and
  `npm run build` passed. Chrome mobile visual smoke passed at `740x390` and
  `932x430` with zero title-button scroll overrun and canceled `selectstart`
  / `contextmenu` events. Evidence:
  `output/playwright/shadow-runner-options-pass/final/`.
- Prototype verification, 2026-06-10: `npm run lint`,
  `npx tsc --noEmit -p tsconfig.app.json`, `npm run build`, and Chrome
  production-preview smoke passed. Evidence includes `932x430` and `740x390`
  HUD/pause/sentry captures in
  `output/playwright/shadow-runner-prototype-phase/`, plus foreground Chrome
  screenshots `19-headed-v2-sentry-a-932x430.png` and
  `20-headed-v2-sentry-b-932x430.png` showing the sentry moving across patrol.
- Prototype backlog:
  - Add gameplay HUD assets and DOM overlay: player health, enemy health,
    score/coins, pause, and checkpoint/finish feedback.
  - Keep movement rules in the existing simulation boundary and Phaser scene
    thin; do not tune level difficulty from automated test failures alone.
  - Add one reviewed enemy type first, then sword/jump defeat feedback.
  - Build one short test route around movement, jump, double jump, attack,
    crouch, one enemy, one tilt platform, and one finish marker.
  - Run real iPhone and Android checks for rotation, safe areas, load speed,
    and touch highlight behavior after each pushed visual/gameplay checkpoint.

## Latest Completed Goal - ShadowPin Short Video

- Goal: Add first-class short video pins to ShadowPin while preserving the
  existing mixed category feed, admin activity, hearts, and image-pin behavior.
- Started: 2026-05-29
- Status: complete
- Owner/agent: Codex
- Branch: merged to `main`
- Related roadmap: [`docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md`](C:/repos/chat2.0/docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md:1)
- User decisions: video pins mix with images; category covers stay image-only;
  feed autoplay is muted/focus-based; fullscreen viewer loads high-quality
  video; public users see only ready videos; creators/operators see processing
  failures; limits are 60 seconds, 150 MB, and 5 native uploads/day.

## Initial Interpretation

- User-visible outcome: Users can upload short phone videos, pin supported
  external video URLs, scroll a mixed image/video ShadowPin feed smoothly, turn
  on sound from the details overlay, and open video pins in a full-screen viewer.
- In scope: schema/RLS, Bunny native upload path, external video import path,
  client create/edit/replace flows, autoplay/focus playback, activity metadata,
  docs, focused tests, deployment, and verification.
- Out of scope: TikTok, video category covers, comments, realtime pin feeds,
  provider rehosting where terms or technical constraints make embeds safer for
  v1, direct Bunny pull-zone rendition URLs unless the environment is configured,
  and real-device autoplay/audio validation.
- Assumptions: Bunny Stream credentials already exist for Shado TV; adding a
  Bunny pull-zone URL is acceptable for direct rendition playback.

## Risk Areas

| Area | Risk | Mitigation | Status |
| --- | --- | --- | --- |
| Media delivery | Native video renditions depend on Bunny processing and pull-zone configuration. | Store poster immediately, keep processing state private to creator/operators, document `BUNNY_STREAM_PULL_ZONE_URL`. | active |
| Provider embeds | YouTube, X, Pinterest, and Instagram have provider-controlled autoplay behavior. | Use YouTube iframe autoplay where possible; extract Pinterest direct MP4/HLS URLs when exposed; keep other external providers as best-effort embed/source pins. | active |
| RLS/public visibility | Failed videos must not leak into public feeds. | New select policy only exposes non-image media when ready unless creator/operator. | active |
| Feed smoothness | Autoplay can hurt masonry scrolling. | Use focus IntersectionObserver, direct preview URL when available, muted loop playback, and pause offscreen. | active |
| Existing image behavior | Extending `shadow_pin_images` can regress images. | Keep table/field compatibility and route image flows through existing functions. | active |

## Milestones

| ID | Milestone | Status | Files/areas | Verification |
| --- | --- | --- | --- | --- |
| M1 | Recheck repo, docs, and latest commit | complete | `AGENTS.md`, ShadowPin docs/code, Bunny upload path | Static inspection, clean `main` matching `origin/main` |
| M2 | Define video roadmap and constraints | complete | Roadmap doc, progress log | User decisions captured |
| M3 | Extend schema and RLS | complete | `supabase/migrations/20260529223000_shadow_pin_video_pins.sql` | Remote migration applied |
| M4 | Add video upload/import service | complete | `supabase/functions/shadow-pin-video/index.ts`, `supabase/config.toml` | Edge Function deployed and live Bunny upload verified |
| M5 | Add client API and UI playback | complete | ShadowPin API, hooks, UI | Typecheck passed |
| M6 | Add direct URL replacement and Bunny embed fallback | complete | Netlify media function, ShadowPin UI/API | Lint, module load, focused Jest |
| M7 | Add tests/docs and run gates | complete | ShadowPin tests/docs | Typecheck, lint, build, Jest, preview mobile, production smoke, and live upload checks passed |

## Verification Log

| Date | Command/check | Result | Notes |
| --- | --- | --- | --- |
| 2026-05-29 | `Get-Command node,npm,npx` | pass | Required repo tooling is available. |
| 2026-05-29 | `git fetch --prune`; `git status --short --branch` | pass | Local `main` matches `origin/main`; worktree started clean. |
| 2026-05-29 | `npx tsc --noEmit -p tsconfig.app.json` | pass | App typecheck clean after video UI/API work. |
| 2026-05-29 | `npm run lint` | pass | ESLint clean. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx tests/useShadowPinHeartOptimism.test.tsx` | pass | 2 suites, 24 tests after focused video autoplay/embed/replacement coverage. |
| 2026-05-29 | `npm run build` | pass | Vite build completed; existing large-chunk warning remains. |
| 2026-05-29 | `npx jest --runInBand` | pass | 75 suites, 322 tests. |
| 2026-05-29 | `npm run qa:smoke:mobile -- --base-url=http://127.0.0.1:4174 --skip-build --run-name=shadow-pin-video-mobile-smoke` | pass | Mobile DM smoke passed against preview build. |
| 2026-05-29 | Custom Playwright iPhone preview screenshots | pass | `output/playwright/shadow-pin-video-visual/`; ShadowPin home, category empty state, and add-pin modal rendered without console errors. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote project sees `20260529223000_shadow_pin_video_pins.sql` as pending; not applied. |
| 2026-05-29 | `supabase secrets list` | pass | Bunny library/API secrets exist; `BUNNY_STREAM_PULL_ZONE_URL` is not configured. App now falls back to Bunny iframe playback. |
| 2026-05-29 | `node -e "import('./netlify/functions/shadow-pin-media.mjs')"` | pass | Netlify ShadowPin media module loads after URL-replacement action changes. |
| 2026-05-29 | esbuild bundle of `supabase/functions/shadow-pin-video/index.ts` with remote Deno imports externalized | pass | Syntax/bundling sanity check passed without Docker/Deno. |
| 2026-05-29 | `npm run lint` | pass | ESLint clean after replacement/fallback patch. |
| 2026-05-29 | `npx tsc --noEmit -p tsconfig.app.json` | pass | App typecheck clean after replacement/fallback patch. |
| 2026-05-29 | `npm run build` | pass | Vite build completed; existing large-chunk warning remains. |
| 2026-05-29 | `npx jest --runInBand` | pass | 75 suites, 325 tests. |
| 2026-05-29 | `npm run qa:smoke:mobile -- --base-url=http://127.0.0.1:4174 --skip-build --run-name=shadow-pin-video-mobile-smoke-2` | pass | Preview-build mobile smoke passed. |
| 2026-05-29 | `supabase db push` | pass | Applied `20260529223000_shadow_pin_video_pins.sql` to remote project `shsqqouecvdoifzufkqm`. |
| 2026-05-29 | `supabase functions deploy shadow-pin-video --no-verify-jwt --use-api` | pass | Deployed `shadow-pin-video`; latest listed version is 2 after cleanup action. |
| 2026-05-29 | `netlify deploy --build --prod` | pass | Production deploy live at `https://shadowchat-1-0.netlify.app`. |
| 2026-05-29 | `npm run qa:smoke:prod:headless` | pass | Production auth and resume-send smoke passed after Netlify deploy. |
| 2026-05-29 | Live Bunny upload smoke through `shadow-pin-video` | pass | Temporary 31 KB MP4 uploaded through Bunny TUS, synced to `ready`, then pin, Bunny asset, and category were cleaned up. |
| 2026-05-29 | Live Pinterest import smoke through `shadow-pin-video` | pass | Temporary Pinterest pin extracted direct `pinimg.com` MP4/HLS URLs, then pin and category were cleaned up. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote database is up to date after deploy. |
| 2026-05-29 | `git diff --check` | pass | Only line-ending warnings from Git on Windows. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx tests/useShadowPinHeartOptimism.test.tsx` | pass | 2 suites, 24 tests after final Edge Function cleanup patch. |
| 2026-05-29 | `npx jest --runInBand tests/ShadowPin.test.tsx` | pass | 23 tests after iframe sound controls and feed video-label visibility fix. |
| 2026-05-29 | `npm run lint`; `npx tsc --noEmit -p tsconfig.app.json`; `npm run build` | pass | ESLint clean, app typecheck clean, Vite build completed with existing large-chunk warning. |
| 2026-05-29 | `supabase db push --dry-run` | pass | Remote database remains up to date. |
| 2026-05-29 | `netlify deploy --prod --dir=dist` | pass | Production deploy live at `https://shadowchat-1-0.netlify.app`. |
| 2026-05-29 | `npm run qa:smoke:prod:headless` | pass | Production auth and resume-send smoke passed after deploy. |

## Files Changed So Far

| File | Reason |
| --- | --- |
| `supabase/migrations/20260529223000_shadow_pin_video_pins.sql` | Add mixed-media pin columns, video visibility RLS, heart guard, and score filtering. |
| `supabase/functions/shadow-pin-video/index.ts` | Add Bunny upload sessions, completion/status sync, and external video imports. |
| `supabase/config.toml` | Register `shadow-pin-video` with manual endpoint auth. |
| `netlify/functions/_shared/shadow-pin-media.mjs` | Add direct existing-pin image URL replacement and image URL-import metadata. |
| `netlify/functions/shadow-pin-media.mjs` | Add `update-image-from-url` action for normal pin replacement. |
| `src/features/shadow-pin/types.ts` | Add media/provider/video metadata types. |
| `src/features/shadow-pin/api/shadowPinApi.ts` | Route image/video source creation and replacement, capture posters, upload Bunny TUS files, and sync processing status. |
| `src/features/shadow-pin/hooks/useShadowPinImages.ts` | Poll creator-visible processing video pins and update cache. |
| `src/features/shadow-pin/ShadowPin.tsx` | Add mixed pin copy, video source input, feed autoplay, sound toggles, and video-aware fullscreen viewer. |
| `src/features/shadow-pin/hooks/useShadowPinActivityTracker.ts` | Add media/provider metadata to activity events. |
| `docs/SHADOW_PIN.md` | Document short video behavior and deployment. |
| `docs/SHADOW_PIN_SHORT_VIDEO_ROADMAP.md` | Capture product decisions, architecture, rollout, env, and verification gates. |
| `tests/ShadowPin.test.tsx`, `tests/useShadowPinHeartOptimism.test.tsx` | Update ShadowPin expectations and add mixed video pin coverage. |

## Current Status

- Implemented and deployed: schema, service surface, frontend API,
  feed/viewer UI, docs, tests, Supabase migration, Supabase Edge Function, and
  Netlify production build.
- Verified: lint, typecheck, build, focused Jest, full Jest, preview mobile
  smoke, production smoke, remote migration status, Edge Function listing, and
  a live native Bunny upload with cleanup.
- Remaining optional follow-up: configure `BUNNY_STREAM_PULL_ZONE_URL` for
  direct CDN playback URLs and run real-device iOS Safari / Android Chrome
  autoplay and audio gesture validation.

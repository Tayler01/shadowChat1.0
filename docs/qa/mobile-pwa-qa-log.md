# Mobile PWA QA Log

## Documentation Status - July 10, 2026

Older artifact paths remain historical evidence. The July 10 web Release A is
deployed, but its mobile/PWA-sensitive behavior still needs a fresh harness
artifact and physical-device pass.

Last updated: 2026-07-17

## July 17 Durable Notification Swipe Checkpoint

- Notification swipe-to-read now queues the exact event ID locally before the
  server call, waits for a confirmed Supabase acknowledgement before removing
  the card, restores the card on failure, and replays interrupted reads before
  the next inbox fetch. This closes the view-switch, reload, and PWA-restart
  return path.
- Gesture arbitration now commits once after a short threshold. A claimed left
  swipe locks vertical movement only inside the Catch-Up scroller until release
  or cancellation; vertical-first movement stays native.
- Full motion now uses a deterministic 28-piece fracture-and-ash sequence plus
  a brighter fracture band before the remaining cards slide up. Reduced motion
  uses a short fade and no-motion removes immediately, both only after server
  confirmation.
- The focused Catch-Up component/API suites passed 19 tests. The full Jest gate
  passed 235 suites and 1,290 tests with 16 existing todos; ESLint, TypeScript,
  the production build, paused-feature verification, and build budgets passed.
- A controlled notification response and read RPC were intercepted in-browser,
  so no backend rows changed. Pixel Chromium and iPhone WebKit both proved the
  lock/release cycle, all 28 fragments, one confirmed acknowledgement, empty
  retry ledger after success, no return after reload, zero horizontal overflow,
  and clean runtime diagnostics. Evidence:
  `output/playwright/catch-up/summary.json`.

## July 17 Destination Badges, Catch-Up Motion, And Discover Page Checkpoint

- Catch-Up notification cards now track the finger across the measured card
  width, accept deliberate distance or fast-flick intent, dissolve with a
  restrained gold-particle finish, and reflow the remaining list. Comfort
  reduced/no-motion modes keep the read action without decorative motion.
- Play unread state now drills from the bottom badge to Shado Live or Shadow
  Checkers, then to the exact room or match. ShadowPin drills from the bottom
  badge to Discover, category, exact Pin, and separate post/discussion state.
  Exact destination loads clear only their represented event IDs.
- Universal Discover is now the first-class `?view=discover` page. It uses the
  standard themed backdrop and leaves the phone bottom menu visible instead of
  mounting a modal portal.
- The focused notification/Play/Pins/Discover regression set passed 13 suites
  and 134 tests. The full Jest gate passed 235 suites and 1,282 tests with 16
  existing todos. ESLint, TypeScript, production build/budgets, documentation
  integrity, all 43 Node contracts, clean local migration replay, local/linked
  database lint, and the local security contract passed.
- The authenticated Pixel Chromium and iPhone WebKit Universal Discover gate
  passed standard-surface, routed-page, persistent-menu, result, Library,
  diagnostics, and overflow checks. The authenticated read-only Catch-Up gate
  passed both engines with zero acknowledgements or test residue. Evidence:
  `output/playwright/wave2-candidate1-discovery/summary.json` and
  `output/playwright/catch-up/summary.json`.

## July 17 Notification Center PFP And Swipe Checkpoint

- Notification-inbox events now resolve `actor_id` through the current
  API-safe public-profile relationship, so user-originated cards use current
  PFPs and clickable canonical profile actions; system events retain initials.
- Phone cards support swipe-left mark-as-read without opening the source.
  Vertical movement remains native scrolling, short horizontal gestures snap
  back, and the revealed Read button provides a keyboard-accessible equivalent.
- ShadowPin Creator Studio and its SQL contract explicitly accept a blank tag
  list; the phone field now says `Tags (optional)`.
- Focused component/API/model/SQL suites passed 28 tests. The full Jest gate
  passed 233 suites and 1,271 tests with 16 existing todos. ESLint, TypeScript,
  production build/budgets, documentation integrity, and all 43 Node contract
  tests passed.
- The authenticated read-only Catch-Up browser gate passed the same production
  build in Pixel Chromium and iPhone WebKit with no horizontal overflow,
  runtime diagnostics, acknowledgements, fixtures, uploads, or database
  residue. Evidence: `output/playwright/catch-up/summary.json`.

## July 16 Shado Live And DM Production Hotfix Checkpoint

- The deterministic real Shado Live browser verifier passed the fresh
  production build across its Pixel Chromium and iPhone WebKit host/listener
  flows. Evidence: `output/playwright/shado-live-real/summary.json`.
- A fresh, non-reused production preview at `http://127.0.0.1:4176` passed the
  authenticated DM smoke. Evidence:
  `output/playwright/dm-read-position-hotfix/summary.json`.
- Jest covers Live structured server errors, null/stale room recovery, host
  resume, host composer focus during reconnect, global access migration, and
  cursor-bounded DM auto-advance. The full gate passed 228 suites and 1,235
  tests with 16 existing todos.
- ESLint, app TypeScript, production build, paused-feature verification, bundle
  budgets, the 28-function manifest, and the linked migration dry run passed.
- Installed iPhone/Android microphone, keyboard, weak-network reconnect, and DM
  reopen behavior remain the physical-device acceptance check after deploy.

## July 15 Final Acceptance Automated Checkpoint

- Stable isolated deploy `6a5811bc762e6e6704058ca3` passed authenticated
  settings smoke plus `qa:final-acceptance-mobile` on Android Chromium and
  iPhone WebKit.
- The dedicated gate opened Active Users, Weather, presence-notification
  settings, and launcher-badge settings; it asserted zero horizontal overflow,
  exactly five visible in-bounds bottom-nav controls, and zero page errors.
- Active Users and Weather retained the obsidian-and-gold phone layout across
  `412x839` and `390x844` viewports. Presence settings expose independent
  in-app/push toggles and Everyone/Connections scope. Badge settings expose the
  five approved categories, a 99 display cap, and read-driven clearing copy.
- Linked Supabase proof reports no pending migrations or database-lint warnings;
  the security-definer contract and 24-function health manifest pass, and
  `send-push` v41 is active.
- These checks created no messages, notification events, database rows, or
  Storage objects. Evidence:
  `output/playwright/final-acceptance-6a5811bc-mobile/summary.json`.
- Production `main` remains unchanged. Installed iPhone/Android PWA permission,
  foreground/background push split, notification-center clearing, launcher
  badge, GPS, radar gestures, and real notification arrival remain physical-
  device acceptance items.

## July 13 Wave Three Inner Circles Automated Checkpoint

- Immutable isolated deploy `6a55892252f0d306fae5b852` passed the complete
  two-account Pixel Chromium/iPhone WebKit verifier. Stable isolated deploy
  `6a558acc257a6d21fa379fa2` serves byte-identical HTML and all 12 boot assets;
  a fresh stable iPhone WebKit session opened Connections and switched to
  Circles on the canonical route.
- The run covered People/Circles/detail/Back routing, create/rename/delete,
  atomic accepted-only member rejection, picker add/remove/re-add, private
  circle Pin filtering, empty state, universal Search, Theater, comments, and
  route restoration.
- Hub, editor, picker, feed, Theater, and comments remained inside Pixel
  `412x839` and iPhone `390x664` viewports, including compressed keyboard
  heights, with no horizontal overflow.
- Pixel Chromium and iPhone WebKit reported zero console, page, request, or
  HTTP errors. Exact cleanup restored Circle/member and feed-preference
  snapshots and left zero Connection, block, Pin, category, comment,
  notification, activity, or analytics residue. Evidence:
  `output/playwright/wave3-inner-circles/summary.json`.
- Production ShadowChat and `main` remain unchanged. Installed iPhone/Android
  PWA touch, browser-chrome, and resume acceptance remains a real-device gate.

## July 13 Wave Three ShadowPin Feed Modes Automated Checkpoint

- Immutable deploy `6a5575bcbc2a1131aab40695` and the stable isolated URL
  passed the exact same two-account Pixel Chromium/iPhone WebKit verifier.
- The run covered keyboard and touch mode selection, account-synced reload
  persistence, universal Search, waiting and accepted-empty states, exact
  cross-category chronological ordering, Connections-scoped Theater, hearts,
  comments, Browser Back, removal/block fail-closed behavior, and explicit
  reconnect recovery.
- Feed and Theater surfaces remained inside `412x839` and `390x664` visual
  viewports with zero horizontal overflow, runtime errors, failed requests,
  HTTP errors, or unexpected Supabase hosts. Expected report-only WebKit CSP
  messages remained diagnostics only.
- Exact cleanup restored both feed preferences and proved zero scoped
  Connection, block, Pin, category, heart, comment, notification, activity,
  analytics, or preference residue. Evidence:
  `output/playwright/wave3-shadow-pin-feed-modes/summary.json`.
- Production ShadowChat and `main` remain unchanged. Installed iPhone/Android
  PWA touch, browser-chrome, and resume acceptance remains a real-device gate.

## July 13 Wave Three Connections Automated Checkpoint

- Immutable deploy `6a556190a9c126b4758b29f1` passed twice with two
  authenticated accounts across Pixel Chromium and iPhone WebKit.
- The run covered exact `?view=dms&panel=connections` routing, Browser Back,
  Escape, search/profile entry, request/cancel/decline/accept/remove, realtime
  request and accepted banners, request badges, focus refresh, accepted-list
  profile/message entry, and return-focus behavior.
- The Connections sheet stayed within `412x839` and `390x664` visual
  viewports with no horizontal overflow, console errors, page errors, failed
  requests, HTTP error responses, or unexpected Supabase hosts.
- Existing DM history remained unchanged. Exact test pairs and Connection
  events were removed, notification/discovery preferences were restored, and
  the final residue check found no pair, block, event, preference, or DM drift.
- The isolated stable test URL now serves this checkpoint. Production
  ShadowChat and `main` remain unchanged; installed iPhone/Android acceptance
  is still required.

## July 13 ShadowChat 2.0 Phone Regression Hardening

- Physical-iPhone screenshots showed that Creator Studio's whole frame ended
  above the keyboard, leaving a large black band after the action footer. The
  frame now uses stable app height and reserves the iOS keyboard inset inside
  it instead of using visual-viewport height alone. Immutable deploy
  `6a5547c57eceb4541037f4b3` passed all 19 lifecycle checks; a non-zero iOS
  visual-offset simulation measured a `0px` footer-to-keyboard gap and a
  `12.21875px` focused-field-to-footer gap. Cleanup returned every generated
  database and Storage counter to zero. The identical build is live on the
  isolated stable URL as deploy `6a5548df38b181c08f7c4122`; production
  ShadowChat and `main` remain unchanged.
- General Chat thread proof was rerun against a fresh production build on
  Pixel Chromium `412x915` and iPhone WebKit `390x844`. Both engines retained
  the bottom navigation, rendered message actions at layer `150` above the
  sheet, kept the compressed composer against the bottom of the keyboard
  viewport, preserved the underlying Lounge during live replies, and reported
  zero console/page errors.
- The thread run created seven temporary text messages per engine pass and
  deletion-confirmed all of them with zero cleanup errors. Evidence:
  `output/playwright/wave2-candidate2-threads/summary.json`.
- A read-only ShadowPin Theater probe issued two rapid left swipes during the
  first transition. Pixel Chromium and iPhone WebKit both advanced from Pin 1
  to Pin 3 of 18, then remained stable for the post-settle sample with no route
  or title snapback and zero console/page errors. Evidence:
  `output/playwright/shadow-pin-theater-rapid-swipe/summary.json`.
- Creator Studio regression coverage now types title, description, and tags
  character by character while autosave runs, checks focused-field visibility
  in a `620px` simulated keyboard viewport, and requires automatic local image,
  local video, image URL, external-video poster, and authenticated link-preview
  rendering. The final immutable deploy
  `6a552eb8a7705fe8b607a0e5` passed all 19 Studio lifecycle checks with zero
  console, page, media-API, harness, database-cleanup, or Storage-cleanup
  errors.
- The first immutable Studio pass safely stopped on a Netlify media 401 after
  session rotation and removed every scoped draft/message/category artifact.
  The client now performs one locked refresh and exact-request retry on 401;
  focused API/Studio/shared-edge tests cover that recovery before the final
  immutable rerun. Each Netlify media attempt also has a 45-second ceiling, so
  a stalled provider request returns a retryable error instead of freezing the
  mobile editor.
- The remaining double-401 was isolated-site environment drift: its Supabase
  URL was correct, but its function-scoped service-role fingerprint did not
  match the linked project. The test site's production, deploy-preview, and
  branch-deploy values were rotated to the current key and marked secret;
  production ShadowChat was not changed.
- The comprehensive Creator Studio browser harness now bounds response-drain,
  context-close, and browser-close operations, writes harness diagnostics, and
  performs its database/Storage cleanup even when a Playwright engine will not
  close normally.
- General Chat threads and rapid ShadowPin Theater swipes were rerun against
  the same final immutable deploy on Pixel Chromium and iPhone WebKit and both
  passed again. Physical iOS/Android installed-PWA keyboard animation and
  hardware safe-area validation remain the real-device gate.
- The validated frontend was promoted from a draft-only deploy to the isolated
  site's stable test URL, `https://shadowchat-2-0-wave-one.netlify.app`, on
  deploy `6a552eb8a7705fe8b607a0e5`. Stable and immutable HTML/entry-script hashes
  matched exactly; the thread and rapid-swipe probes passed on the stable URL,
  and the 19-check Studio lifecycle passed on its immutable twin. Production
  ShadowChat and `main` were not changed.

## July 13 ShadowChat 2.0 First-Run Activation - Authenticated Checkpoint

- Exact immutable deploy only:
  `https://6a549b1e052c56307d851b7d--shadowchat-2-0-wave-one.netlify.app`.
  The verifier bound the API deploy ID, immutable origin, all 53 JavaScript
  chunks, and expected Supabase project before writes. Production and the
  mutable alias were not used.
- Six future-invite profiles passed 139 checks with 47 screenshots across Pixel
  Chromium and iPhone WebKit. General Chat, DM, and ShadowPin choices each pass
  in both engines with exact invite-hook enrollment, Escape/Browser-Back/reload
  resume, nested DM/Pin Back, focused footer geometry, 130% Comfort, canonical
  receipt completion, foreground success, and optional install behavior.
- Both engines had zero console, page, HTTP, request, navigation, unexpected
  origin/backend, or horizontal-overflow errors. Four exact Chat/DM push
  requests were intercepted and validated; no live push was delivered. Expected
  report-only WebKit CSP messages were recorded separately as diagnostics.
- The Pin flow exposed and fixed a real prefetch race: raw Browser Back could
  remove `?pin=` while locally opened Theater stayed mounted. Route absence now
  closes only the route-owned viewer and leaves the category masonry intact;
  focused Jest and both live engines pass.
- Strict cleanup removed 6 disposable Auth users, 6 invites, 2 Chat messages,
  2 DM messages, 2 conversations, and 2 Pin hearts. All 14 scoped remaining
  counters were zero and no recovery journal remained.
- Evidence:
  `output/playwright/wave2-candidate4-activation/activation-1783930103447-a91d2b7f0b9c/summary.json`.
- The official Supabase generated signup-link path created canonical invited
  users without sending email, so invite redemption/enrollment is proved but
  email delivery is explicitly not claimed. Native OS install-sheet acceptance,
  installed Home Screen launch, VoiceOver, TalkBack, and physical touch comfort
  remain the phone-acceptance scope.

## July 13 ShadowChat 2.0 ShadowPin Creator Studio - Authenticated Checkpoint

- Immutable isolated deploy only:
  `https://6a549b1e052c56307d851b7d--shadowchat-2-0-wave-one.netlify.app`.
  The verifier rejected mutable/unexpected origins and blocked any unexpected
  Supabase project host; production was not used.
- Two controlled accounts passed 19 recorded checks across Pixel Chromium
  `412x915` and iPhone WebKit `390x844`. Studio and Theater matched the visual
  viewport with no horizontal overflow; 130% text, reduced motion, and
  simulated keyboard compression also passed.
- Home, category, General Chat, DM, and existing-Pin edit entry points passed.
  Image upload, local short-video selection/metadata, external-video URL, and
  image URL passed, including one injected media retry and idempotent Storage
  duplicate recovery.
- Account A staged an image in the owner-private draft bucket, saved/exited,
  reloaded, recovered it through an owner-signed URL, and published exactly one
  canonical Pin. Repeating finalization returned the same Pin. Edit, category
  move, and media replacement retained the same Pin and emitted no new event.
- Account B could not read A's draft/asset or mint its signed URL. After
  publication B saw the exact Pin and received exactly one eligible
  notification plus its realtime toast.
- Exact Theater routing and close-to-ShadowPin-origin behavior passed. Both
  engines had zero console errors, page errors, unexpected Supabase hosts, and
  critical media/RPC/Storage responses; report-only CSP diagnostics were
  recorded separately.
- The expanded run found and fixed a real preview-order bug where an existing
  poster masked a newly selected replacement blob. The focused component test
  and exact deploy prove the replacement is visible immediately while the old
  public media remains canonical until finalization.
- Cleanup removed 4 drafts, 5 staged assets, 1 Pin, 24 notification rows, 24
  mirrored activity rows, 13 analytics events, 9 analytics sessions, 9 private
  Storage objects, 7 public objects, 1 Chat row, 1 DM row, and 2 temporary
  categories. Post-cleanup checks reported zero remaining scoped rows/objects.
- Evidence:
  `output/playwright/wave2-candidate3-creator-studio/summary.json` and the paired
  Pixel/iPhone Studio, recovery, and Theater screenshots in that directory.
- Remaining real-device scope: installed-PWA camera/library picker, native
  keyboard and safe areas, background upload/resume, VoiceOver, TalkBack, and
  touch comfort. Native Bunny/TUS provider upload was intentionally not spent
  by browser QA and remains covered by lifecycle/source tests. Automated WebKit
  is not physical-device certification.

## July 12 ShadowChat 2.0 ShadowPin Creator Studio - Historical Local Implementation

This entry records the implementation state before the authenticated checkpoint
above and is retained as historical evidence.

- Branch: `codex/shadowchat-2.0`; production `main` frontend remains
  unchanged.
- Candidate 3 uses one lazy four-stage Media/Details/Preview/Publish Studio
  with owner-private recovery, staged media, honest progress, explicit public
  confirmation, and exact Theater success handoff from ShadowPin, Chat, and DM
  entry points.
- Seven focused model, history, API, component, lazy/share-entry,
  private-media, and SQL source contract suites pass locally with 46 tests;
  the broader route/ShadowPin set passes 9 suites and 107 tests. The hardening
  assertions cover local/server recovery conflicts, draft-switch and Back
  flushes, late save receipts, exact-origin routing, phone touch targets,
  target-version rejection, atomic promotion recovery, private Bunny drafts,
  rate budgets, and asset caps. This is code-level proof, not browser or
  linked-backend acceptance.
- At this checkpoint, the required Pixel Chromium `412x915` and iPhone WebKit
  `390x844` proof still needed to cover home/category/Chat/DM/Edit entry prefills, image/video/URL preview,
  category/tags, close-reload-offline recovery, upload retry/resume, keyboard
  and safe areas, 130% text, large controls, reduced motion, Back/cold close,
  and zero overflow or console/page errors.
- At this checkpoint, required two-account proof still needed to keep Account A's draft/staged media invisible
  to B, deliver one Pin/event only after publish, suppress repeat events on
  edit/move/replacement, and keep old media visible until an atomic replacement
  succeeds.
- This historical entry did not claim a Candidate 3 browser artifact,
  physical-device result, production Pin, notification fanout, or
  test-data/media cleanup. The authenticated checkpoint above now records the
  later browser evidence and cleanup counts.
- Contract: [SHADOW_PIN_CREATOR_STUDIO.md](C:/repos/chat2.0/docs/SHADOW_PIN_CREATOR_STUDIO.md:1).

## July 12 ShadowChat 2.0 General Chat Threads Checkpoint

- Branch: `codex/shadowchat-2.0`; production `main` frontend remains
  unchanged.
- Candidate 2 implements a root-only General Chat feed and a routed thread
  surface: full-height phone sheet and `28rem` desktop drawer.
- Authenticated two-account proof passed Pixel Chromium `412x915` and iPhone
  WebKit `390x844` against a production build and the linked shared backend.
- Both engines verified exact viewport-sized sheet geometry, document
  `scrollWidth` equal to viewport width, safe-area composer placement, root
  messages only in the Lounge, chronological direct/nested replies, live
  nested reply arrival, a stable underlying root-card position, exact-target
  focus, and browser Back/cold-close behavior.
- Pixel and iPhone completed with zero console/page errors. SQL/Jest separately
  prove read-cursor ordering, block filtering, deletion placeholders, ACLs,
  routing, normalization, and reply isolation.
- Evidence:
  `output/playwright/wave2-candidate2-threads/summary.json` and paired thread /
  exact-target screenshots in that directory.
- Each run created seven text-only QA messages across two controlled accounts,
  including one composer-sent reply per browser profile.
  Cleanup deleted in dependency-safe order, confirmed every delete, queried
  for remaining IDs, and reported zero cleanup errors. Read-cursor writes were
  intercepted because their legacy owner-private table intentionally has no
  member delete policy; cursor behavior is covered by rollback-only SQL.
- Physical installed-PWA keyboard animation, VoiceOver/TalkBack, native safe
  areas, and touch comfort remain release-gate follow-ups.
- Contract: [GENERAL_CHAT_THREADS.md](C:/repos/chat2.0/docs/GENERAL_CHAT_THREADS.md:1).

## July 12 ShadowChat 2.0 Universal Discovery Checkpoint

- Branch: `codex/shadowchat-2.0`; production `main` frontend unchanged.
- Authenticated production-preview proof passed Pixel Chromium `412x915` and
  iPhone WebKit `390x844` for Discover empty/grouped results, Play scope, and
  Library scope.
- Both engines reported exact viewport/dialog width and height, document
  `scrollWidth` equal to viewport width, stable header geometry, and zero
  console/page errors.
- WebKit exposed and verified a message-card line-box regression that Chromium
  did not reproduce. Explicit block/flex button layout reduced the WebKit card
  from about `846px` to `222px` without changing content.
- Rapid scope changes no longer surface an unhandled abort page error.
- Evidence: `output/playwright/wave2-candidate1-discovery/summary.json` and the
  paired Pixel/iPhone screenshots in that directory.
- No posts, messages, uploads, saves, or collections were created by this
  browser pass, so no remote test-data cleanup was required.

## July 10 Release A Mobile QA Checkpoint

Release scope includes service-worker update behavior, accessible mobile
dialogs/message menus, bounded DM history, notification quiet hours and mutes,
personal blocking, global search/saved collections, and ShadowPin search,
comments, replies, and notification preferences.

- No new `qa:mobile-pwa` artifact is claimed by this documentation pass. The May
  artifacts below remain the latest recorded browser proof until the final
  release is run with `--no-reuse-server`.
- The separate Expo 57 / React Native 0.86 workspace passed local clean install,
  audit, lint, TypeScript, Expo Doctor `20/20`, and static web export. That is
  native toolchain evidence, not installed-PWA or production proof.
- Required release follow-up: fresh iPhone/WebKit and Android/Chromium harness
  coverage, then one installed iPhone and one installed Android pass after the
  production deploy.
- Do not publish a production ShadowPin post merely for smoke. A new pin fans
  notification events and web push to eligible members, and deleting it cannot
  recall delivered notifications. Use existing/staged content unless a real,
  controlled post is explicitly approved.

## Summary

Mobile PWA visual QA now runs through `npm run qa:mobile-pwa`, which uses `scripts/mobile-pwa-visual-qa.mjs` against a production-style Vite preview on `127.0.0.1:4174`.

Latest focused pass: `node scripts/mobile-pwa-visual-qa.mjs --run-name=mobile-header-media-pins-headed-20260517c --no-reuse-server --headed --slow-mo=70`.

- Result: passed.
- Profiles: Mobile Safari/WebKit iPhone small, Mobile Safari/WebKit iPhone large, Mobile Chrome Android medium, Mobile Chrome Android small.
- Checks: 100 passed, 0 failed, 0 not-tested notes.
- Artifacts: `output/playwright/mobile-header-media-pins-headed-20260517c/`.
- Foreground smoke pass: `node scripts/playwright-smoke.mjs --run-name=mobile-shell-headed-smoke-20260517g --headed --slow-mo=40 --no-reuse-server` passed `auth`, `dm`, and `mobile-dm-back`.
- QA cleanup: the mobile harness deleted its 4 group-chat posts during the run; lingering `Mobile PWA chat`, `Group smoke`, `Smoke ping`, and `Resume dm` QA rows were removed from group chat and DM tables after verification.
- Targeted real-device regression artifacts: `output/playwright/mobile-fixes-targeted/`.
- Prior complete public-profile coverage artifact: `output/playwright/mobile-pwa-audit-10/` with 84 passed, 0 failed, 0 not tested.

## Issue Log

| Issue ID | Status | Device profile | Route/screen | Reproduction steps | Screenshot path | Root cause | Files changed | Verification command | Notes/remaining risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| MPWA-001 | fixed | local QA environment | Playwright mobile browsers | Run `npm run qa:mobile-pwa -- --run-name=mobile-pwa-initial --no-reuse-server`. | n/a | Playwright was installed but the local browser binaries were missing. | none | `npx playwright install chromium webkit` | Environment dependency installed locally. |
| MPWA-002 | verified | all mobile profiles | core mobile PWA flows | Run the new mobile visual QA harness. | `output/playwright/mobile-pwa-final/summary.json` | The repo had mobile smoke coverage but no focused reusable PWA visual audit harness. | `package.json`; `scripts/mobile-pwa-visual-qa.mjs` | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-final --no-reuse-server` | Harness covers launch/session restore, chat, DMs, boards, settings, feedback, profile, message actions, composer focus/compression, and refocus simulation. |
| MPWA-003 | fixed | iPhone small WebKit, 390x844 | DM list | Navigate to DMs during the mobile PWA audit and navigate back to the DM list from a thread. | `output/playwright/mobile-pwa-audit-5/iphone-small-webkit-07-dm-list.png`; `output/playwright/mobile-pwa-final/summary.json` | The DM list panel used horizontal entrance motion that could be sampled mid-transition and clip controls on route entry or return-to-list. | `src/components/dms/DirectMessagesView.tsx` | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-final --no-reuse-server` | Removed the full-panel horizontal slide so the viewport-width DM list no longer creates transient mobile clipping. |
| MPWA-004 | fixed | Android small Chromium, 360x800 | DM list header | Navigate to DMs on the small Android profile. | `output/playwright/mobile-pwa-audit-7/android-small-chromium-07-dm-list.png` | The DM masthead did not leave enough shrink room for the new conversation button at the narrowest tested width. | `src/components/dms/DirectMessagesView.tsx` | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-audit-8 --no-reuse-server` | Header now has constrained flex behavior, a smaller logo/offset below 380px, truncated title text, and a non-shrinking plus button. |
| MPWA-005 | documented | all mobile profiles | dense secondary controls | Run the mobile PWA audit and review warnings in `summary.json`. | `output/playwright/mobile-pwa-final/summary.json` | Some reaction chips, reply links, weather/action buttons, and board reaction chips are visually small secondary controls. | docs only | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-final --no-reuse-server` | Automated audit records them as warnings, not blockers. Validate comfort on real installed iPhone and Android before deciding whether to enlarge dense secondary controls. |
| MPWA-006 | documented | iPhone small WebKit, 390x844 | public profile modal | Run `mobile-pwa-final` and open a public profile from the currently loaded chat content. | `output/playwright/mobile-pwa-final/summary.json`; `output/playwright/mobile-pwa-audit-10/summary.json` | In the final run, one visible opener did not produce a dialog on the iPhone-small profile. The same flow passed in the prior complete run and other final profiles. | `scripts/mobile-pwa-visual-qa.mjs`; docs only | `npm run qa:mobile-pwa -- --run-name=mobile-pwa-final --no-reuse-server` | Marked as non-blocking testability variance. Real-device validation should still tap public profiles from chat and DM content. |
| MPWA-007 | fixed | iPhone WebKit, 390x844 | General Chat weather popup | Tap the weather pill in the mobile chat header. | `output/playwright/mobile-fixes-targeted/iphone-weather-centered.png`; `output/playwright/mobile-fixes-targeted/summary.json` | The popup was absolutely anchored to the narrow header pill, so the 320px forecast surface could hang off the viewport on iPhone. | `src/components/chat/WeatherWidget.tsx`; `tests/WeatherWidget.test.tsx` | targeted Playwright geometry check; `npm run qa:mobile-pwa -- --run-name=mobile-pwa-phone-fixes-final --no-reuse-server` | Weather popup now uses a mobile fixed center position below the safe-area/header band, with desktop keeping the anchored dropdown behavior. |
| MPWA-008 | fixed | Android Chromium, iPhone WebKit | Boards > Shadow Pin category images | Open Boards, open Shadow Pin, then open a populated category with mixed aspect ratios. | `output/playwright/mobile-fixes-targeted/android-shadow-pin-grid.png`; `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Android Chromium rendered the old CSS multi-column masonry as one visible column, and a row-grid fallback fixed Android while removing the original packed staggered image flow. | `src/features/shadow-pin/ShadowPin.tsx`; `tests/ShadowPin.test.tsx`; `docs/SHADOW_PIN.md` | targeted Playwright geometry check; `node scripts/mobile-pwa-visual-qa.mjs --run-name=mobile-picker-masonry-weather-share-final --no-reuse-server` | The category image list now uses responsive balanced masonry columns: two columns on phone widths, then greedy-packed by aspect ratio so mixed image heights stagger without row gaps. |
| MPWA-009 | fixed | iPhone WebKit, Android Chromium, compressed keyboard simulation | General Chat GIF picker | Open + > GIF, then focus search while the viewport is keyboard-compressed. | `output/playwright/mobile-fixes-targeted/iphone-gif-picker-compressed.png`; `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | The picker was composer-anchored, so search could crowd the header and the translucent panel allowed chat content to show through behind the keyboard state. | `src/components/chat/GifPicker.tsx`; `tests/MessageInput.test.tsx` | targeted Playwright geometry check; `node scripts/mobile-pwa-visual-qa.mjs --run-name=mobile-picker-masonry-weather-share-final --no-reuse-server` | The mobile GIF picker is now a fixed full-screen portal with forced search focus and an opaque themed background. |
| MPWA-010 | fixed | iPhone WebKit, Android Chromium | General Chat grouped messages | Tap the edge of the second adjacent message from the same user to open the quick reaction rail. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | The quick picker lived inside the message bubble stacking context, so grouped bubbles could paint above it. | `src/components/chat/MessageItem.tsx`; `src/components/chat/QuickReactionRail.tsx`; `tests/MessageItem.test.tsx` | `npx jest --runInBand tests/MessageItem.test.tsx`; browser 390x844 check; mobile PWA harness | Quick reactions now render in a body-level portal with viewport-aware positioning, keeping them above grouped messages and away from screen edges. |
| MPWA-011 | fixed | iPhone WebKit, Android Chromium, keyboard-compressed | Chat, DMs, boards, news reactions | Open the full emoji picker from composer or message reactions while the keyboard is available. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Several emoji picker surfaces used local anchored panels, so mobile keyboards, message lists, and headers could overlap them. | `src/components/chat/EmojiPickerOverlay.tsx`; `src/components/chat/MessageInput.tsx`; `src/components/chat/MessageItem.tsx`; `src/components/chat/PinnedMessageItem.tsx`; `src/components/dms/DirectMessagesView.tsx`; `src/components/boards/BoardChat.tsx`; `src/components/news/NewsReactionBar.tsx`; `src/types.ts`; tests | targeted Jest; browser 390x844 check; mobile PWA harness | Phone-sized emoji pickers now use one fixed full-screen portal with forced search focus, opaque themed background, Escape/outside-close behavior on desktop, and shared typing support. |
| MPWA-012 | fixed | iPhone WebKit, Android Chromium | Group chat and DM image preview | Tap an uploaded image in a chat or DM thread. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Image previews could inherit local layout constraints and appear off-center or under app chrome. | `src/components/ui/ImageModal.tsx`; `src/components/chat/MessageItem.tsx`; `src/components/dms/DirectMessagesView.tsx` | browser 390x844 check; mobile PWA harness | Chat and DM image previews now share a body-level fixed modal that centers the image inside the safe-area viewport. Shadow Pin and Art Board previews stay on their own surfaces. |
| MPWA-013 | implemented | iPhone WebKit, Android Chromium | General Chat weather popup | Open weather, tap Share, and send the card into chat. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Weather could be discussed only as text; there was no themed image capture of the exact card the user sees. | `src/components/chat/WeatherWidget.tsx`; `src/components/chat/ChatView.tsx`; `package.json`; `package-lock.json`; `tests/WeatherWidget.test.tsx`; `docs/WEATHER_WIDGET.md` | `npx jest --runInBand tests/WeatherWidget.test.tsx`; full verification bundle | Weather share captures the themed popup with `html-to-image`, excludes controls, uploads through the existing chat media path, and sends it as an image message. |
| MPWA-014 | fixed | iPhone WebKit, Android Chromium | Pinned message preview | Pin a message with multiline/rich content and compare it with the original bubble. | `output/playwright/mobile-picker-masonry-weather-share-final/summary.json` | Pinned previews rendered raw text, so whitespace and rich message formatting did not match the original message layout. | `src/components/chat/PinnedMessageItem.tsx`; `tests/PinnedMessageItem.test.tsx` | `npx jest --runInBand tests/PinnedMessageItem.test.tsx`; full Jest | Pinned previews now use the same rich text renderer as chat bubbles, preserving spacing and link rendering. |
| MPWA-015 | verified | iPhone WebKit, Android Chromium | standardized header/menu, DMs, Boards, Entertainment, Settings, Pins, keyboard-compressed chat surfaces | Run the headed mobile PWA harness after the standardized mobile shell and media-derivative work. | `output/playwright/mobile-header-media-pins-headed-20260517c/summary.json` | Header/menu controls moved to a shared mobile shell, Settings moved to the header, Pins moved into bottom nav, and keyboard focus intentionally hides chat chrome. The harness had to be updated to expect hidden keyboard chrome, display-name-only DM headers, and immediate QA post cleanup. | `src/components/layout/MobileAppHeader.tsx`; `src/components/layout/MobileNav.tsx`; `src/components/layout/MobileChatFooter.tsx`; `src/components/dms/DirectMessagesView.tsx`; `src/components/boards/BoardsView.tsx`; `src/features/shadow-pin/ShadowPin.tsx`; `src/components/settings/SettingsView.tsx`; `src/features/games/GamesHome.tsx`; `scripts/mobile-pwa-visual-qa.mjs`; `scripts/playwright-smoke.mjs`; docs | headed mobile PWA harness; headed smoke; lint; typecheck; build; Jest | 100/100 headed mobile checks passed. Smoke passed auth, DM realtime, and mobile DM back navigation. |
| MPWA-016 | verified | Android/Chromium-style landscape and portrait Chrome-channel probes | Entertainment > Shadow Runner | Open Shadow Runner from the Entertainment picker, verify portrait rotate gate, open level map/detail popup, start Level 3, and QA-finish Level 1/2/3 with normal finish movement after teleport. | `output/playwright/shadow-runner-goal-20260611-square-frame/932x430-level3-popup-square-frame.png`; `output/playwright/shadow-runner-goal-20260611-postbuild/932x430-level3-complete.png`; `output/playwright/shadow-runner-goal-20260611-routes/portrait-390x740-rotate-gate.png` | Shadow Runner needed the next phone-gameplay validation pass after adding Level 3, square mission frames, and kind-aware enemy runtime state. | `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`; `src/features/games/shadow-runner/assets/manifest.ts`; `src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts`; `src/features/games/shadow-runner/game/levels.ts`; `src/features/games/shadow-runner/game/simulation.ts`; Shadow Runner docs | `npm run lint`; `npx tsc --noEmit -p tsconfig.app.json`; `npm run build`; custom Chrome-channel Playwright probes | Landscape gate remained open at `932x430` and `740x390`; portrait gate blocked play at `390x740`; true square popup frame measured `ratio: 1`; Level 1/2/3 completion overlays rendered. Real-device iOS/Android touch feel still needs follow-up after push. |

## July 15 Shado Live Real-Beta Automated Checkpoint

- The real client remains excluded from the default build and lazy-loads the
  LiveKit runtime only when `VITE_FEATURE_SHADO_LIVE_REAL=true`.
- Pixel Chromium and iPhone WebKit deterministic host/listener flows passed
  routing, lobby/stage layout, keyboard compression, safe areas, reconnect,
  terminal state, controls, and diagnostics with no camera, display-capture,
  recording, console, page, request, or response errors.
- Evidence: `output/playwright/shado-live-real/summary.json`.
- Physical installed-PWA audio routing, real microphone permission,
  Bluetooth/headphones, lock/unlock, weak-network recovery, and battery/thermal
  behavior remain under RD-030.

## July 16 Blocking Surface And Provider Checkpoint

- Catch-Up's current Pixel Chromium/iPhone WebKit captures show the oversized
  hero removed and the provenance/title/refresh/snapshot identity compressed
  into the standard flat mobile header.
- Six focused suites (21 tests), all 225 Jest suites (1,197 passing tests),
  lint, app TypeScript, build/budgets, and documentation integrity passed after
  the Catch-Up, Weather, radar, and Shado Live changes.
- The deterministic Shado Live browser gate passed Pixel Chromium and iPhone
  WebKit host/listener, keyboard, reconnect, control, and zero-runtime-residue
  checks in `output/playwright/shado-live-real/summary.json`.
- `npm run qa:shado-live:provider` passed against the real Supabase and LiveKit
  services with two controlled Chromium phone contexts. Host microphone
  publishing, listener audio attachment, participant visibility, room close,
  provider cleanup, and temporary Connection cleanup were verified.
- Automatic LiveKit Cloud webhooks remain the one external failure: the
  Supabase endpoint accepts a correctly signed synthetic LiveKit event, while
  real room lifecycle runs still produce zero automatic receipts. Re-run the
  LiveKit dashboard test event after correcting the webhook entry.

## Historical May Summary

The automated mobile PWA visual loop passed across the core installed-home-screen simulations. Final required checks also passed: lint, typecheck, build, Jest, existing mobile smoke, full smoke, and the focused mobile PWA harness. Remaining mobile-specific risk is limited to real-device behavior that Playwright cannot fully reproduce: native keyboard animation, iOS standalone status bar behavior, home indicator safe-area behavior on physical devices, and touch comfort for dense secondary controls.

That statement applies to the recorded May artifact set, not the July 10 local
candidate. Use the candidate checkpoint above until new browser and device
evidence is recorded.

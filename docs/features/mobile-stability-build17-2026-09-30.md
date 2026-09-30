# Mobile stability and native build 17

## Reported issues and implemented changes

- General, DM and Pins auto-follow could reclaim the bottom during an upward
  gesture before it cleared the bottom threshold. Touch/scroll intent now owns
  the viewport through the gesture and momentum; delayed resize/focus/typing
  updates respect reading position. Explicit latest/own-send still follows.
- Integrated realtime QA exposed a second retention issue: new inserts could
  replace the window during a tiny upward gesture. The controller now publishes
  reading ownership to data hooks synchronously. General/DM defer new rows while
  reading, including own-account sends from another device, and only page
  forward when the controller confirms a return to bottom. Mounted local send
  acknowledgements still reconcile normally. Pins receives the same synchronous
  following signal. Incoming indicators remain available for explicit latest.
- DM gesture listeners now bind when the conditional conversation scroll
  container mounts. Previously the hook could run before that element existed,
  leaving the shared touch-intent protection disconnected in DMs.
- Explicit DM latest waits for the fetched window to commit and jumps without
  animation; the old animation could be mistaken for user scroll and canceled.
  Pins restores saved history offsets rather than centering the saved comment.
  Gesture settling now persists the final anchor after upstream media changes,
  preventing a later return from using an obsolete offset.
- Saved DM restoration belongs to the mounted conversation/request generation.
  Its own loading and callback changes no longer dispose the only completion
  while leaving the conversation marked as already requested.
- Send-side keyboard swipes used passive delegated touch handlers. A bounded
  non-passive native touch listener now claims that gesture, preserves drafts,
  blurs once and prevents accidental sends. Repeated identical viewport
  measurements no longer republish layout notifications. Native pull-to-refresh
  is disabled to remove another competing recognizer/reload path.
- Native build 16 was portrait-only. Build 17 permits device orientations; the
  existing landscape gate already listens for viewport/orientation changes.
  This requires a new binary, not just a hosted update.
- Video paste can arrive with no movie bytes in a WebKit paste event. Build 17
  adds a local iOS Expo module that reads movie item-provider representations
  only after an explicit empty paste gesture. It copies temporary provider
  files inside the callback, transfers one 192 KiB chunk at a time and stages
  the result into the existing inline composer. Images/files use the existing
  path. Regular Send includes captions and attachments; x removes an item.
- Native clipboard recovery limits three videos/64 MiB total, fences navigation,
  account/conversation changes and stale completions, and removes temporary
  files on completion, cancellation, timeout or process restart. It respects
  Apple's paste permission. Old builds/PWAs do not advertise this native path.
- Native push enrollment's five reviewed RPC grants were revoked by earlier
  containment. A scoped migration restores account-bound ticket enrollment
  and credential lifecycle access; client errors preserve the actual failure
  stage. Separate bounded native delivery remains an exact-account canary,
  with old workers and response collectors retired.

## Validation boundary

Focused swipe, scroll, clipboard and enrollment tests passed before integration.
The exact shared hooks passed six swipe browser probes and six scroll probes
across Chromium/WebKit. Chromium swipe used real touch input; WebKit swipe
used synthetic replay. WebKit scroll used keyboard input because mobile wheel
is unsupported. These are controller/engine checks, not physical iOS acceptance.

Build 16's toolbar removal is physically confirmed by Tayler. Build 17's Swift
compilation, Photos movie representations, permissions, rotation and physical
keyboard/scroll behavior require the signed binary and subsequent phone tests.
Production, complete test and signed artifact evidence will be appended below.

## Source and linked server checks

- Full Jest: 320 suites, 2,898 passed, 16 existing TODOs. Node contracts: 402
  passed. Native worker Deno: 23 passed. Bounded migration: 17 assertions in a
  rolled-back local transaction, with fixture and cron cleanup verified.
- Root lint, app TypeScript, build/size/paused-feature budgets and audit passed.
  Mobile lint/types, dependency tests, clipboard controller tests (3/3), Doctor
  (20/20), audit and iOS Hermes export (1,239 modules) passed.
- Production migrations `20260930215452` and `20260930215719` applied; scoped
  worker deployed. Linked ACL contract passed, including 158 public definers
  and zero paused browser table grants. Native RPC ACLs and legacy cron hold
  were read back. Vault-authenticated worker health returned 200/production.
- Advisor changes are expected: four credential-bound anonymous RPCs and one
  authenticated ticket RPC are now exposed, and the private lease table has
  default-deny RLS without browser policies. Existing `pg_net` public-schema
  warning remains; no automatic extension relocation is part of this repair.
- EAS archive inspection found 388 files/101,465,550 bytes, one Swift module and
  podspec, zero environment files, signing keys or dependency trees. This is
  archive inclusion evidence, not signed compilation.

App Store requirements are in [the readiness checklist](app-store-readiness-2026-09-30.md).
PWA research evidence is in [the feedback case](ios-pwa-keyboard-feedback-2026-09-30.md).

## Final browser gate

The frozen source passed 26 live General/DM checks across Chromium and WebKit,
including affected-path retries after correcting non-atomic test snapshots and
waiting for actual restoration readiness. Twelve Pins checks passed against
local REST fixtures because no suitable non-deleted QA Pin existed. Pins fixture
results do not establish production Pin fanout. Native clipboard bridge replay
checks staging, removal, captions and Send; UIKit/Photos remains device-only.

Coverage includes cold unread, a five-pixel upward gesture with incoming data,
saved-position return, a forced 188-pixel upstream media change during a gesture,
bounded keyboard swipe and sender/recipient live updates. Final evidence is in
ignored `output/playwright/current-release-*` artifacts. Exact owned messages,
DMs and earlier fixture analytics were removed; Storage writes were zero, and
QA cursor/read/notification baselines were restored. Final phone screenshots
were reviewed. General's phone header is intentionally hidden by ChatView.

# ShadowChat 2.0 - Wave One

## Goal

Build and validate the first high-impact 2.0 product wave on the long-lived
`codex/shadowchat-2.0` branch, using the existing production Supabase project
through additive, backward-compatible contracts. Production `main` and its
Netlify frontend remain unchanged until Tayler approves the completed fork.

The prior Wave One checkpoint is deployed to the separate Netlify site
`shadowchat-2-0-wave-one` at
`https://shadowchat-2-0-wave-one.netlify.app` for phone testing.

## Candidate Sequence

1. **Unified Activity HQ** - implemented and preserved, but paused in the
   current trial revision. See
   [ACTIVITY_HQ.md](C:/repos/chat2.0/docs/ACTIVITY_HQ.md:1).
2. **ShadowPin Theater (immersive viewer)** - implemented and locally verified. See
   [SHADOW_PIN_THEATER.md](C:/repos/chat2.0/docs/SHADOW_PIN_THEATER.md:1).
3. **DM Conversation Hub** - implemented and locally verified. See
   [DM_CONVERSATION_HUB.md](C:/repos/chat2.0/docs/DM_CONVERSATION_HUB.md:1).
4. **Member reporting and operator case center** - implemented; member intake
   is paused while the operator Case Center remains available.
   See [MEMBER_REPORTING_CASE_CENTER.md](C:/repos/chat2.0/docs/MEMBER_REPORTING_CASE_CENTER.md:1).
5. **App-wide accessibility and comfort system** - implemented and locally verified.
   See [ACCESSIBILITY_COMFORT.md](C:/repos/chat2.0/docs/ACCESSIBILITY_COMFORT.md:1).

Each candidate gets its own research, focused implementation, tests, browser
proof, documentation update, and checkpoint commit. Combined regression and
shared-backend compatibility verification run after all five candidates.

All five candidate checkpoints remain implemented. Activity and member-facing
report intake are compile-time off for this revision; their source, schema, and
tests are retained. The
Candidate 5 browser proof covers compact 320px Chromium, Android Chromium, and
iPhone WebKit with authenticated device-local preference state. Physical iPhone
and Android installed-PWA accessibility validation remains part of the combined
release gate rather than the Candidate 5 local claim.

## Release Boundaries

- No 2.0 frontend change is pushed to production `main` during the trial.
- Shared Supabase changes must be additive, RLS-preserving, and compatible with
  both frontends.
- Any migration applied remotely must remain canonical and be included in the
  eventual main history even if a frontend candidate is rejected.
- Boards, News, Art Board, ESP Bridge, Activity, and member report intake remain
  paused.
- The 2.0 site gets a distinct Netlify identity, URL, and deployment authority.
- Production environment variables, domain bindings, and deploy hooks are not
  reassigned to the 2.0 site.

## Wave Completion Gate

The original Wave One checkpoint completed its gate. This requested trial
revision must repeat lint, TypeScript, build/budgets, focused/full Jest,
Chromium/WebKit phone QA, linked Supabase compatibility, and separate Netlify
smoke before Tayler's installed-phone approval. Nothing merges to `main` before
that acceptance.

## Trial Revision - July 12, 2026

- GIF search and `@ai` share one authenticated Edge caller that retries exactly
  once with a forced locked session refresh after a 401. Missing provider keys,
  CORS, and function drift were ruled out against the live trial; stale/expired
  per-origin browser JWTs reproduced the reported failures.
- Supabase Auth redirect configuration includes the exact trial origin for
  confirmation, recovery, and OAuth return flows.
- Activity UI/runtime and member report intake are compile-time paused. The
  shared Activity/moderation backend and operator case handling are preserved.
- DM inbox controls sit directly below the header. Rows use `You:`, `Draft:`,
  or the other member's name without a generic message-kind icon.
- ShadowPin details use minimal gold dots that stay above the overlay. Theater
  uses bare 48px chevrons/zoom glyphs, keyed active media, warm poster backing,
  and transition-end navigation to prevent old-frame flashes.
- General Chat removes its mobile top header and uses a smooth two-page footer:
  Chat/DMs/Pins/Play, then Weather/Active/Search/Settings with explicit
  forward/back chevrons. Desktop header controls remain available.

Revision verification passed 165 Jest suites with 839 passing tests and 16
intentional todos, zero-warning lint, TypeScript no-emit, the production build,
paused-chunk verification, and bundle budgets. The eager entry bundle decreased
to about 472 KiB raw / 142 KiB gzip. Authenticated Pixel proof confirmed the
header-free General Chat feed, both footer pages, compact DM controls, and named
DM previews. Local Pixel and WebKit Settings proof showed neither Activity nor
My Safety Reports. The deployed origin returned the exact branch SHA in its
health manifest, a configured push key, manifest/service-worker HTTP 200, the
media Function's expected HTTP 405 boundary, and 24 GIF results from a live
`klipy-gifs` HTTP 200 without sending test content.

The broad multi-screen ad hoc browser loop was retired during this revision
because one slow remote screen discarded unrelated completed evidence. Future
acceptance should use short, independently reported probes per surface and run
the full repository gate only after code changes that can invalidate it.

## Trial Deployment Evidence - July 12, 2026

- Git branch: `codex/shadowchat-2.0`; production `main` was not changed.
- Shared Supabase migrations `20260711194211`, `20260711225923`, and
  `20260712003000` are applied. Linked history and dry run are clean.
- Linked database lint returned zero findings. The reviewed authority contract
  matches 79 authenticated, 1 anonymous, 34 internal, and 34 private
  `SECURITY DEFINER` functions, with no paused browser grants.
- Netlify site: `shadowchat-2-0-wave-one`; the live health manifest identifies
  the exact branch commit. Production site/domain bindings were not changed.
- The Netlify Sharp media function returns the expected method/auth boundary
  after native Linux dependency packaging was verified live.
- Full authenticated live smoke passed auth, General Chat, Settings, DMs,
  resume-send, profile, mobile DM Back/refocus, and mobile Settings.
- Live Pixel 7 proof showed Activity Realtime `live`, DM Inbox/Unread/Archived,
  ShadowPin Theater Previous/Next/Close, and My Safety Reports.
- Live comfort QA passed compact 320px Chromium, Pixel 7 Chromium, and iPhone
  13 WebKit with 130% text, no horizontal overflow, visible focus, persisted
  prepaint preferences, and fixed-nav reachability.
- HTTPS PWA proof found a standalone manifest with three icons and an active,
  controlling `/sw.js` registration.

Physical VoiceOver, TalkBack, software-keyboard, native safe-area, push-permission,
and install-from-browser checks remain part of Tayler's phone trial rather than
automated conformance certification.

# ShadowChat 2.0 - Wave One

## Goal

Build and validate the first high-impact 2.0 product wave on the long-lived
`codex/shadowchat-2.0` branch, using the existing production Supabase project
through additive, backward-compatible contracts. Production `main` and its
Netlify frontend remain unchanged until Tayler approves the completed fork.

The completed wave is deployed to the separate Netlify site
`shadowchat-2-0-wave-one` at
`https://shadowchat-2-0-wave-one.netlify.app` for phone testing.

## Candidate Sequence

1. **Unified Activity HQ** - implemented locally and fully verified. See
   [ACTIVITY_HQ.md](C:/repos/chat2.0/docs/ACTIVITY_HQ.md:1).
2. **ShadowPin Theater (immersive viewer)** - implemented and locally verified. See
   [SHADOW_PIN_THEATER.md](C:/repos/chat2.0/docs/SHADOW_PIN_THEATER.md:1).
3. **DM Conversation Hub** - implemented and locally verified. See
   [DM_CONVERSATION_HUB.md](C:/repos/chat2.0/docs/DM_CONVERSATION_HUB.md:1).
4. **Member reporting and operator case center** - implemented and locally verified.
   See [MEMBER_REPORTING_CASE_CENTER.md](C:/repos/chat2.0/docs/MEMBER_REPORTING_CASE_CENTER.md:1).
5. **App-wide accessibility and comfort system** - implemented and locally verified.
   See [ACCESSIBILITY_COMFORT.md](C:/repos/chat2.0/docs/ACCESSIBILITY_COMFORT.md:1).

Each candidate gets its own research, focused implementation, tests, browser
proof, documentation update, and checkpoint commit. Combined regression and
shared-backend compatibility verification run after all five candidates.

All five candidate checkpoints are now implemented and locally verified. The
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
- Boards, News, Art Board, and ESP Bridge remain paused.
- The 2.0 site gets a distinct Netlify identity, URL, and deployment authority.
- Production environment variables, domain bindings, and deploy hooks are not
  reassigned to the 2.0 site.

## Wave Completion Gate

Wave One is implementation-complete: all five candidates pass lint, TypeScript,
production build/budgets, relevant Jest and SQL verification, actual WebKit and
Chromium phone QA, linked Supabase compatibility checks, full regression, and a
separate Netlify deploy smoke. Tayler's installed-phone acceptance remains the
approval gate before any merge to `main`.

## Trial Deployment Evidence - July 12, 2026

- Git branch: `codex/shadowchat-2.0`; production `main` was not changed.
- Shared Supabase migrations `20260711194211`, `20260711225923`, and
  `20260712003000` are applied. Linked history and dry run are clean.
- Linked database lint returned zero findings. The reviewed authority contract
  matches 79 authenticated, 1 anonymous, 34 internal, and 34 private
  `SECURITY DEFINER` functions, with no paused browser grants.
- Netlify site: `shadowchat-2-0-wave-one`; deploy
  `6a531bc1e38b9bdade466b6d`; production site/domain bindings were not changed.
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

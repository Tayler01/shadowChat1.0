# Shadow Runner Full-Finish Evidence

## Authority And Scope

This reconciles the existing rebuild plan and September 9 remaining-work snapshot
with inspected source and saved artifacts. It does not reduce the game scope or
turn a launch test into campaign certification. The September 30 delivery reset
supersedes the blanket 44-replay prerequisite. Physical-device limitations remain
explicit. The goal remains open where evidence is incomplete.

The working checkout is `C:/repos/chat2.0-main`. On October 5 it fast-forwarded
from the deployed Runner rebuild `39bd199c` to current remote main `a40565f5`,
preserving the nine newer chat/upload/native commits. The Runner patch was
reapplied without conflicts. Recovery stash
`4a413ad15267514540d3bcd7e58a3260885ae345` remains available. The separate original
checkout was not changed. No October 5 Runner patch has been pushed or deployed.

## Product And Evidence Reconciliation

- M1, B01-B10, G01-G09: Existing account-scoped operation journal, scene recovery,
  selective loading, sound lifecycle and medal refresh remain in source. Prior
  tests and September 30 backend checks cover implemented contracts, not every
  physical-device outcome. This patch does not change physics, saves or schema.
- M2, U01-U11: Rebuilt controls, HUD, campaign, journal and save UI are present.
  SR-PHONE-001 is confirmed: the fallback gate used to apply only during play.
  The patch extends it to every screen, suspends hidden dialog focus traps,
  preserves open dialog/finale state and keeps the rotate prompt usable.
- M3/M4, A01-A18: Source includes all ten district terrain families, separate
  district depth props, nine story-landmark sprites and three act tableaux.
  Masters/prompts and processed manifest remain outside runtime. Final September
  30 phone screenshots and targeted render tests prove these are integrated,
  not merely generated assets. Whole-route visual/animation review is not proven
  solely by these files or title screenshots; retain that distinction.
- S01-S10: Chapter stories, earned discoveries, journal and finale exist in
  source. `runtimeNarrative.ts`, `campaignStory.ts`, `campaignMoments.ts`,
  `RunnerCampaign.tsx` and `RunnerFinale.tsx` are the implementation authority.
  Prior narrative/persistence tests and local ending checks are reusable for
  unchanged behavior. This patch additionally covers rotation during the finale
  without advancement or lost failed-image recovery state.
- C01-C12, R01-R13, L00-L11, P01-P16, D01-D09: Existing scoped geometry, recovery,
  combat and input evidence remains relevant. Do not mark all named mastery
  transitions complete from launch tests. The remaining-work snapshot contains
  dated proposals and pre-fix failures; use later live evidence where present.
  Any transition without adequate evidence remains unverified, not silently
  accepted. No new gameplay blocker was reproduced during this continuation.

## Relay Evidence Correction

The inspected `runner-integrated-relay-20260930-02` iPhone result is marked failed
by its harness: `Ending requires a fresh matching recorded completion`.
It records 194 actual-input steps, five of five Flames, delivered state, 9 HP,
one remaining life and two checkpoint respawns, with no page errors. That supports
finite-life traversal and an in-world delivery, but its empty ending-beat list
does not certify the entire ending/save loop. The separate
`runner-boss-local-2026-09-30T15-16-22-513Z` ending/reload evidence is local arena
evidence, not a replacement full-route run. Neither artifact proves mastery.

## October 5 Representative Measurements

Existing campaign audit, Chromium phone profile, local built assets:

| Chapter | Game resource bodies | Decoded atlas estimate | Frame p95 | Frames over 50 ms |
| --- | --- | --- | --- | --- |
| East Gate | 3,107,135 bytes | 6.00 MiB | 16.8 ms | 0 |
| Candle Fair | 6,108,301 bytes | 24.00 MiB | 16.7 ms | 0 |
| Relay Spire | 6,083,387 bytes | 18.00 MiB | 16.7 ms | 0 |

Evidence directories: `runner-finish-baseline-20261005-east`,
`runner-finish-baseline-20261005-fair`, `runner-finish-baseline-20261005-relay`
under `output/playwright`. Each verifies build hashes, rendering and stable pause.
These samples predate the remote-main integration but Runner runtime/art were
unchanged by those upstream commits. They are three-second frame-scheduling
baselines, not sustained combat/GPU/device benchmarks. Resource bodies are game
requests only, not whole-app downloads; atlas dimensions times four are a partial
decoded-RGBA estimate, not measured peak process memory. Q08-Q11 remain only
partially evidenced; do not optimize graphics based on unsupported assumptions.

## Consolidated Patch And Remaining Gates

Fresh contact audit: `output/shadow-runner/asset-contact-finish-20261005.json`
checks ten atlases, 93 crops and 393 platform uses, measuring 289 supported
unrotated atlas uses. Its model was updated for calibrated moving-lift contact;
rotating decks and raster composites are explicitly excluded instead of using
obsolete pre-rebuild bridge formulas. Bounds/alpha inspection is not a full-route
visual certificate. Ivy's irregular plank edge has an 11.6-world-pixel central
P90 alpha-to-body gap; inspect the actual walk/contact before calling that a bug.
The local Ivy contact review in `runner-ivy-contact-20261005` settled at two
authored plank positions with foot Y=424 and unchanged health. The third position
was interrupted by an enemy hit, so it is not settled-contact evidence. The
middle-position screenshot was reviewed without an obvious contact defect.
These are QA placements, not route or mastery proof.
The bright guide-like RGB colors in the atlas preview were checked and none are
opaque inside the eight authored Ivy frames, so no live registration-artifact
defect is established and no replacement was generated on that assumption.

Q04 is reconciled: the 16 Jest TODOs are in
`tests/authInviteEmailVerification.todo.test.ts`, covering invite signup/admin,
verification/reset and SQL access contracts, not Runner-specific tests. They
remain TODOs; the Runner patch does not modify those domains or count them as passes.

Integrated candidate checks: 25 focused Runner/orientation/lifecycle/finale tests,
lint, app TypeScript, configured build/budgets (93.56 MiB), 200 Markdown docs and
diff whitespace checks pass. Integrated phone UI checks pass 19 portrait WebKit
surfaces and 21 Chromium surfaces, including rotation with options/journal open.
Screenshots are under `runner-rotation-integrated-20261005-iphone` and
`runner-rotation-integrated-20261005-android`.

The integrated full Jest checkpoint passed 322 suites and 2,944 tests, with the
16 existing TODOs excluded from passing totals. Results are saved at
`output/shadow-runner/jest-full-finish-20261005.json`. Node tests passed all 402;
the local Supabase function manifest verifier passed 29 classified functions.
None of these results establishes physical-device acceptance.

The existing campaign audit now supports bounded sample durations and retry
counts. `runner-sustained-retry-20261005-relay-03` passed a 15-second Chromium
start-scene sample: 901 frames, p95 16.7 ms and zero frames over 50 ms. Initial
and three genuine retry snapshots each had 593 display objects, 36 enemies and
149 tweens. Forced local QA deaths exercise retry lifecycle, not normal route
completion; identical counts do not prove total heap, audio or listener cleanup.
The first two probe attempts failed harness assumptions about final-death
respawn and Retry skipping briefing; those artifacts remain labeled failures.

Full dependency audit failed with five high findings in the development-only
Tailwind 3 / braces chain. Production-only audit passed with zero vulnerabilities.
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
lists no patched braces release. No forced Tailwind 4 migration or dependency
change was made. Security review is an explicit release item, not a waived gate.

- Orientation and dialog/finale focus regressions have focused Jest coverage.
  Phone-browser evidence is recorded in the testing master list; repeat only
  affected checks after integration or a newly discovered defect.
- Required lint, TypeScript, configured build/budgets and docs checks must pass
  on the integrated candidate. The source/tests/docs diff must remain Runner-only.
- F01-F09: The September 30 rebuild shipped. October 5 is an unshipped patch,
  not a new production SHA. Do not overwrite unrelated release notes or publish
  until consolidated-patch release is authorized.
- H01-H05: Physical installed-PWA/native rotation, touch combinations, safe areas,
  background/lock-screen audio, sustained heating/performance, upgrade and medal
  behavior remain device checks. Hosted Windows WebKit reload access-control
  warnings need a physical-device observation; they are not a clean error-free
  certification or proof of a new Runner regression.
- Full-route mastery coverage, timed optional detours, sustained busy-scene frame
  pacing and total repeated-scene memory growth remain evidence gaps. Use bounded
  targeted work and actual phone feedback; do not restart the exhaustive matrix.

No literal bug-free or fully physical-device-certified claim is supported.

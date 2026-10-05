# Shadow Runner Consolidated Patch Approval

## Outcome And Scope

Candidate: local `main` based on `a40565f5`, not committed or deployed.
The September 30 comprehensive rebuild is already shipped. This patch repairs
the confirmed portrait fallback and hidden-dialog focus issue; it does not
replace the campaign, alter saves, or certify every route as bug-free.

## Why And What Changed

SR-PHONE-001 reported missing landscape guidance on the main menu. Runner now
shows its existing rotate-phone fallback on title, map and play. Hidden dialogs
and the finale suspend their focus traps while preserving state. Supported
automatic orientation remains best-effort. Existing QA helpers were corrected
for current terrain layout and extended with bounded retry/frame sampling.

## Files Changed

- `src/features/games/shadow-runner/ShadowRunnerScreen.tsx`
- `src/features/games/shadow-runner/components/RunnerDialog.tsx`
- `src/features/games/shadow-runner/components/RunnerFinale.tsx`
- `src/features/games/shadow-runner/components/runnerDialogSuspension.ts`
- `tests/ShadowRunnerScreenProgress.test.tsx`
- `tests/shadowRunnerFinale.test.tsx`
- `scripts/shadow-runner-asset-contact-audit.mjs`
- `scripts/shadow-runner-campaign-audit.mjs`
- `scripts/shadow-runner-ui-smoke.mjs`
- `docs/SHADOW_RUNNER_DELIVERY_PLAN_2026-09-30.md`
- `docs/SHADOW_RUNNER_REBUILD_2026-09.md`
- `docs/SHADOW_RUNNER_FULL_FINISH_EVIDENCE_2026-10-05.md`
- `docs/SHADOW_RUNNER_PHONE_TESTING_MASTER_LIST.md`
- `docs/SHADOW_RUNNER_PATCH_APPROVAL_2026-10-05.md`
- `docs/features/feature-progress-log.md`
- `docs/qa/mobile-pwa-qa-log.md`

## Verification And Review Evidence

- Lint, app TypeScript and configured production build/budgets passed.
- Full Jest: 322 suites / 2,944 passing tests; 16 existing auth TODOs remain.
- Node: 402 passing tests. Local function manifest: 29 classified functions.
- WebKit portrait: 19 UI surfaces; Chromium phone profile: 21 surfaces.
- Reviewed rotate prompt and Ivy middle-plank contact screenshots.
- 15-second Relay start-scene sample and three retries passed; not combat proof.
- Production-only dependency audit: zero vulnerabilities. Full audit: FAILED,
  five high development-only findings in the Tailwind 3 / braces chain.
- Docs integrity passed for 201 Markdown files; whitespace checks passed.

Screenshots and exact qualifications are indexed in
[the evidence ledger](SHADOW_RUNNER_FULL_FINISH_EVIDENCE_2026-10-05.md).

Final source review confirmed that the orientation gate passes suspension to
`ShadowRunnerGame`; gameplay inputs are blocked through its existing overlay
state. Dialog/finale suspension removes the shared accessibility effect's
keyboard listener and scroll lock, and preserves parent state. No new defect
was found in that narrow review; this is not an independent full-game audit.

## Risk And Not Verified

Portrait dialog focus/state is the affected behavioral surface. Physical iPhone
Safari, installed PWA and native host rotation are not accepted yet. User's
reported host remains unspecified. Whole-route mastery, optional timed detours,
busy-scene device performance and total memory-growth acceptance are not implied
by automated checks. The development dependency advisory requires an explicit
security disposition; no breaking upgrade or policy waiver was made.

## Cleanup

QA used local disposable contexts and blocked outbound gameplay writes. No
remote messages, assets, schema or user progress were created or changed.
Recovery stashes are retained; original checkout is untouched. The task-owned
preview PID 27508 was matched by command, parent and creation time, then stopped
and verified absent (one task preview to zero). No other process was stopped.

## Push And Deploy Plan

Remain on main. Preserve upstream work and recheck remote identity before a
scoped commit. Apply current deployment-guide release gates, including security
review and exact-build production verification. No Supabase migration or backend
mutation is needed for this patch. Do not reuse an older release exception
without authorization. No PR or group announcement is part of this patch.

## Testing Release Authorized

On October 5 Tayler instructed: "If so push for testing." This authorizes the
prepared patch on main and its phone-test deployment. Physical-device acceptance
remains open after publication.

The dependency finding was reviewed for this release: all five reports derive
from the development-only braces parser; Tailwind scans fixed repository paths
in `tailwind.config.js`, and production dependencies audit clean. No game input
or server request is passed into that build-time parser. Proceed with this
bounded phone-test patch using the existing dependency lock. The full audit
remains failed and the upstream fix remains follow-up work; do not describe it
as a clean full audit or make a breaking Tailwind migration in this release.

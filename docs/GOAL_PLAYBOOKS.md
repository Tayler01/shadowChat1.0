# Codex Goal Playbooks

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Use these `/goal` prompts when a task is large enough to need repeated inspect,
patch, verify, and document loops. Keep one goal focused on one durable outcome.

Before starting any goal:

1. Read `AGENTS.md`.
2. Check `git status --short`.
3. Inspect the touched docs, scripts, tests, and app code before editing.
4. Prefer repo scripts over generic commands.
5. Keep changes small and update the relevant progress or QA doc as work lands.
6. Unless the prompt explicitly says otherwise, treat the product target as
   iPhone and Android phone usage first.

Core local verification commands:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

Behavior changes should also run targeted Jest. Browser, realtime, and
user-facing changes should run the closest iPhone/WebKit and Android/Chromium
smoke or visual QA script unless the task is explicitly desktop-only.

## Mobile PWA QA Loop

Use this when the goal is to find and fix mobile layout, keyboard, scroll,
composer, modal, or installed-PWA visual bugs.

```text
/goal Complete a focused mobile PWA QA and patch loop for ShadowChat without stopping until the core mobile PWA flows are verified with the repo's mobile QA harness, all major reproducible issues found during the loop are fixed or documented, and the required verification commands pass.

Context:
ShadowChat is a mobile-first PWA chat app used from iPhone and Android home screens. Mobile smoothness, safe-area spacing, keyboard behavior, composer visibility, scroll stability, touch comfort, media-loading speed, and realtime message UI correctness matter more than desktop polish for this goal.

Before changing code:
- Read AGENTS.md.
- Read docs/qa/mobile-pwa-qa-log.md.
- Read docs/qa/mobile-viewport-audit.md.
- Inspect package.json scripts.
- Inspect scripts/mobile-pwa-visual-qa.mjs and scripts/playwright-smoke.mjs.
- Inspect src/App.tsx, src/main.tsx, src/index.css, src/lib/mobileViewport.ts, chat components, DM components, board chat components, layout components, modals, manifest, and service worker files that are relevant to any found issue.
- Check git status and note existing local changes before editing.

Scope:
- Focus on mobile/PWA behavior only.
- Prioritize installed-home-screen-like flows, iPhone/WebKit, Android/Chromium, safe areas, keyboard compression, fixed footers, scroll containers, modals, navigation, and realtime message UI.
- Do not redesign unrelated UI.
- Do not change Supabase schema.
- Do not replace the existing QA harness with a generic Playwright config.

Loop:
1. Run the focused mobile harness with a new run name:
   npm run qa:mobile-pwa -- --run-name=<descriptive-run-name> --no-reuse-server
2. Inspect output/playwright/<run-name>/summary.json and screenshots.
3. Add or update an entry in docs/qa/mobile-pwa-qa-log.md for each issue.
4. Patch one issue at a time.
5. Re-run the narrowest useful QA command after each meaningful fix.
6. Update docs/qa/mobile-viewport-audit.md if the height, safe-area, composer, scroll, or modal strategy changes.
7. Continue until no major reproducible mobile issue remains in the tested flows.

Validation:
- Run npm run lint.
- Run npx tsc --noEmit -p tsconfig.app.json.
- Run npm run build.
- Run targeted Jest if touched code has existing coverage.
- Run npm run qa:mobile-pwa with a final run name.
- Run npm run qa:smoke:mobile if the change affects the mobile DM/back flow.

Stopping condition:
- Mobile PWA harness passes or any remaining failure is documented with evidence and a real-device-only reason.
- docs/qa/mobile-pwa-qa-log.md has final issue status, artifacts, files changed, and verification result.
- docs/qa/mobile-viewport-audit.md is updated if layout strategy changed.
- Lint, typecheck, build, and relevant tests pass or documented unrelated/pre-existing failures have evidence.

Final response:
- Summarize root causes fixed.
- List exact files changed.
- List commands run and pass/fail status.
- List artifact paths.
- List remaining real-device checks.
```

## Keyboard, Viewport, Safe-Area, And Composer Stability

Use this when the bug is about the message composer hiding, jumping, being
covered, or causing broken scroll on phones.

```text
/goal Stabilize ShadowChat's mobile keyboard, viewport, safe-area, and message composer behavior without stopping until chat, DM, and board composers remain visible and correctly padded across iPhone/WebKit and Android/Chromium PWA-like viewports, with verified scroll and modal behavior.

Before changing code:
- Read AGENTS.md.
- Read docs/qa/mobile-viewport-audit.md.
- Inspect index.html viewport meta tags.
- Inspect public/manifest.webmanifest and public/sw.js if standalone behavior matters.
- Inspect src/App.tsx, src/index.css, src/lib/mobileViewport.ts, MobileChatFooter, MessageList, ChatView, DirectMessagesView, BoardChat, layout components, and modal components.
- Inspect tests/mobileViewport.test.ts.
- Inspect scripts/mobile-pwa-visual-qa.mjs to understand how keyboard compression is simulated.

Audit:
- Document current usage of 100vh, 100dvh, safe-area env variables, fixed footers, internal scroll containers, visualViewport listeners, and mobile footer height variables.
- Update docs/qa/mobile-viewport-audit.md with any findings before or during the patch.

Implementation rules:
- Prefer the existing src/lib/mobileViewport.ts strategy over ad hoc per-component keyboard hacks.
- Keep app shell height, mobile footer measurement, and scroll padding centralized where practical.
- Avoid double-applying safe-area padding.
- Preserve desktop behavior.
- Do not redesign visual styling.
- Do not change Supabase behavior.

Validation:
- Run targeted Jest for mobile viewport logic if touched:
  npx jest --runInBand tests/mobileViewport.test.ts
- Run npm run qa:mobile-pwa with a run name that describes the fix.
- Run npm run qa:smoke:mobile if DMs or navigation are affected.
- Run npm run lint.
- Run npx tsc --noEmit -p tsconfig.app.json.
- Run npm run build.

Stopping condition:
- Composer remains visible in chat, DMs, and board chat in tested mobile profiles.
- No major horizontal overflow, footer overlap, header overlap, or modal overflow remains in tested flows.
- docs/qa/mobile-viewport-audit.md describes the final strategy and remaining real-device risks.
- Relevant tests and checks pass or documented unrelated failures have evidence.
```

## Optimistic Send And Realtime Dedupe

Use this for message send regressions, local echo, duplicate messages, failed
sends, or send-button/composer focus bugs.

```text
/goal Diagnose and harden ShadowChat optimistic message sending without stopping until local echo, Supabase persistence, realtime reconciliation, duplicate prevention, failed-send handling, and mobile composer stability are verified for both group chat and DMs.

Before changing code:
- Read AGENTS.md.
- Inspect MessageInput, ChatView, DirectMessagesView, src/hooks/useMessages.tsx, src/hooks/useDirectMessages.tsx, src/lib/supabase.ts, optimistic message helpers, unread/read logic, and realtime merge logic.
- Inspect tests/useMessages.test.tsx, tests/useDirectMessages.test.tsx, tests/MessageInput.test.tsx, tests/ChatView.test.tsx, and related message list tests.
- Inspect Supabase migrations and manual interfaces before describing schema behavior.
- Check remote migration state if any change depends on a database column, index, RPC, or policy.
- Create or update docs/features/feature-progress-log.md if the work has multiple milestones.

Requirements:
- Sender sees a pending/local message immediately after tapping send.
- Rapid taps do not create duplicate sends.
- Supabase insert success reconciles with the pending message.
- Realtime echo does not render a duplicate.
- Failed sends have visible safe handling and a retry or discard path if already supported or practical.
- Message order, read receipts, unread counts, and scroll-to-bottom behavior are preserved.
- Mobile composer focus and keyboard stability are preserved.

Implementation rules:
- Use existing message identity and client_message_id behavior where available.
- If schema support is missing or remote schema cache lags, preserve a narrow compatibility path instead of breaking sends.
- Do not weaken RLS.
- Do not bypass auth/session checks.
- Keep group chat and DM behavior aligned where their flows are intentionally similar.

Validation:
- Run targeted Jest:
  npx jest --runInBand tests/useMessages.test.tsx tests/useDirectMessages.test.tsx tests/MessageInput.test.tsx
- Add or update tests for local echo, dedupe, failed sends, and ordering when practical.
- Run npm run qa:smoke:dm or the closest relevant smoke scenario.
- Run npm run qa:smoke:mobile if mobile send/composer behavior changed.
- Run npm run lint.
- Run npx tsc --noEmit -p tsconfig.app.json.
- Run npm run build.
- For schema-dependent changes, run supabase migration list --linked and supabase db push --dry-run before considering production ready.

Stopping condition:
- Group chat and DM send behavior works with no duplicate messages in tested flows.
- Relevant Jest and smoke checks pass.
- Any schema or remote-state dependency is verified or explicitly documented.
- docs/features/feature-progress-log.md is updated when this was a multi-step effort.
```

## Mobile Performance Polish

Use this when the app feels sluggish, janky, or delayed on mobile.

```text
/goal Audit and improve ShadowChat mobile performance without stopping until the highest-impact avoidable UI jank, render waste, realtime churn, service-worker wait, and mobile interaction lag issues are identified, prioritized, safely fixed where in scope, and documented with verification.

Before changing code:
- Read AGENTS.md.
- Inspect src/App.tsx, src/components/layout, chat and DM list/rendering components, realtime hooks, presence hooks, badge/push/service-worker code, src/index.css, and scripts/playwright-smoke.mjs.
- Inspect existing performance-related tests, appBadge tests, realtime recovery tests, service worker badge tests, and mobile QA docs.
- Create or update docs/features/feature-progress-log.md if this becomes a multi-slice effort.

Prioritize:
- Fixed overlays, composers, footers, and mobile nav paint costs.
- Unnecessary full-row/detail refetches from realtime events.
- Presence, badge, service-worker, or hidden-tab churn.
- Broad transition-all usage on repeated or fixed UI.
- Message list rerenders, sorting, and merge churn.
- Delayed send feedback or scroll-to-bottom layout thrash.

Rules:
- Do not micro-optimize without a visible or measurable reason.
- Prefer local containment and targeted merges over broad refetching when safe.
- Do not remove intentional product polish unless it materially causes mobile jank.
- Keep patches small and separately verifiable.

Validation:
- Run targeted Jest for touched hooks/components.
- Run npm run qa:smoke or narrower smoke scripts for affected realtime/UI flows.
- Run npm run qa:mobile-pwa for mobile visual/performance-sensitive UI changes.
- Run npm run lint.
- Run npx tsc --noEmit -p tsconfig.app.json.
- Run npm run build.

Stopping condition:
- Top findings and fixes are documented.
- Safe high-impact fixes are implemented.
- Critical mobile flows still pass.
- Deferred optimizations have clear reasons and risk notes.
```

## Feature Plan Executor

Use this after a feature plan exists. The plan should define requirements,
milestones, data model impact, user flows, risk, and tests.

```text
/goal Implement the feature plan in docs/features/<FEATURE_PLAN>.md without stopping until every milestone is completed or explicitly deferred with evidence, relevant tests and smoke checks pass, mobile-first behavior is verified, and docs/features/feature-progress-log.md records the final status.

Before changing code:
- Read AGENTS.md.
- Read docs/features/<FEATURE_PLAN>.md.
- Read docs/features/feature-progress-log.md.
- Inspect relevant app routes, components, hooks, Supabase functions, migrations, tests, and smoke scripts.
- Convert the plan into checkpoints in docs/features/feature-progress-log.md before editing.

Implementation rules:
- Complete one milestone at a time.
- Keep changes scoped to the feature plan.
- Preserve realtime, auth, DMs, unread/read, push, and mobile PWA behavior unless the plan intentionally changes them.
- Do not change Supabase schema unless the plan requires it or there is no safe alternative.
- For schema changes, document migration, RLS impact, rollback/deploy risk, manual TypeScript interface updates, and remote verification.
- Do not redesign unrelated UI.

Validation:
- Run targeted Jest after each meaningful milestone when tests exist.
- Add tests for new state, utilities, hooks, or components when practical.
- Run browser smoke for user-visible flows.
- Run mobile QA for mobile-facing UI.
- Run npm run lint.
- Run npx tsc --noEmit -p tsconfig.app.json.
- Run npm run build.

Stopping condition:
- Every plan milestone is complete or explicitly deferred with reason.
- docs/features/feature-progress-log.md includes assumptions, files changed, verification, and remaining risks.
- Relevant automated and browser checks pass or documented unrelated failures have evidence.
```

## Production Smoke And Deploy Verification

Use this after a deploy or when production behavior is suspected to differ from
local behavior.

```text
/goal Verify ShadowChat production behavior for the affected release without stopping until the relevant production smoke checks, remote-state checks, and release notes show whether production is healthy or exactly what remains blocked.

Before changing code:
- Read AGENTS.md.
- Read docs/PRODUCTION_SMOKE_TESTING.md.
- Read docs/DEPLOYMENT_GUIDE.md.
- Inspect package.json production smoke scripts.
- Check whether the task involves Supabase migrations, Netlify deploys, Render workers, service workers, or production smoke accounts.

Scope:
- Prefer verification and diagnosis first.
- Do not patch production symptoms blindly.
- If code changes are needed, keep them narrow and re-run the relevant local and production checks.

Validation:
- For standard production smoke:
  npm run qa:smoke:prod
- For unattended/headless production smoke when appropriate:
  npm run qa:smoke:prod:headless
- For local gates after code changes:
  npm run lint
  npx tsc --noEmit -p tsconfig.app.json
  npm run build
- For schema-dependent releases:
  supabase migration list --linked
  supabase db push --dry-run

Stopping condition:
- Production smoke result is known and documented.
- Any remote schema/deploy mismatch is identified.
- If a fix was applied, local gates and relevant production checks pass.
- Final response states deploy/push status explicitly.
```

## Bug Report Into Goal Template

Use this when a real device or production user report comes back.

```text
/goal Reproduce, diagnose, fix, and verify the following ShadowChat bug without stopping until the bug is fixed in code, covered by the closest practical automated or smoke check, and documented in the relevant QA or feature log.

Bug:
[title]

Device/environment:
[device, OS, browser, installed PWA or browser tab, production or local]

Route/screen:
[route or visible screen]

Steps to reproduce:
1. [step]
2. [step]
3. [step]

Actual result:
[what happened]

Expected result:
[what should happen]

Evidence:
[screenshot/video/artifact/log path or description]

Constraints:
- Read AGENTS.md first.
- Reproduce or simulate before editing where practical.
- Preserve desktop behavior.
- Do not redesign unrelated UI.
- Do not change Supabase schema unless required and documented.
- Fix the smallest root cause.
- Update docs/qa/mobile-pwa-qa-log.md, docs/qa/mobile-viewport-audit.md, or docs/features/feature-progress-log.md as appropriate.

Stopping condition:
- Bug no longer reproduces in the closest practical test/smoke/QA loop.
- Relevant commands pass.
- Docs contain root cause, files changed, verification, and remaining risk.
```

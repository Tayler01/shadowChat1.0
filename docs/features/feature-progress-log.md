# Feature Progress Log

Use this log for long-running `/goal` work and feature implementations that span
multiple checkpoints. Keep entries concise, factual, and tied to verification.

## Current Goal

- Goal: Stabilize group chat scroll/load/send/media behavior, then port group chat feature parity to DMs while preserving DM left/right message alignment.
- Started: 2026-05-29
- Owner/agent: Codex
- Branch: current local checkout
- Related plan: User-approved group-chat-first refactor plan from 2026-05-29.
- Related issue/bug report: Group chat sometimes opens/resumes at an older/random position, bottom flickers on initial load, failed sends disappear after reload, image/video media rendering and media replies need polish, DMs need group-chat feature parity.

## Initial Interpretation

- User-visible outcome: Group chat opens and resumes at the latest messages unless explicitly deep-linked, failed sends stay visible with retry/discard after app restart, image/video messages render lighter and cleaner, media replies show useful previews, and DMs inherit the same chat features while keeping incoming messages left and own messages right.
- In scope: Group chat viewport/read cursor/history loading, persistent local failed-send outbox, group media/reply rendering, shared chat modules, DM feature parity, focused tests and smoke checks.
- Out of scope: Production push/deploy, unrelated UI redesign, unrelated News/Boards behavior, weakening RLS or auth boundaries.
- Assumptions: Supabase `client_message_id` and media thumbnail columns are available per existing migrations; local browser storage is acceptable for unsent local text and already-uploaded attachment URLs.
- Open questions: Real iOS/Android installed-PWA behavior still needs user/device review after local browser verification.

## Risk Areas

| Area | Risk | Mitigation | Status |
| --- | --- | --- | --- |
| Realtime | Send retries and refreshes can duplicate or reorder messages. | Reuse `client_message_id`, preserve existing realtime merge helpers, run targeted send/realtime tests. | active |
| Auth/session | Offline/session expiry failures must remain retryable without bypassing auth. | Keep `ensureSession`/refresh path and persist only client-side retry payloads. | active |
| Supabase schema/RLS | DM reply parity may require schema support. | Added narrow `dm_messages.reply_to` migration and updated manual TS types without policy changes. | complete |
| Mobile/PWA layout | Scroll, keyboard, footer, and media sizes can regress on phones. | Use existing viewport strategy and run mobile/scroll smoke scripts. | active |
| Push/service worker | Message send changes should not block push dispatch or badge cleanup. | Left push side effects non-blocking and verified smoke/resume flows. | complete |
| Design system | Media/retry controls could look off-theme. | Reuse existing obsidian/gold tokens and compact controls. | active |

## Milestones

| ID | Milestone | Status | Files/areas | Verification | Notes |
| --- | --- | --- | --- | --- | --- |
| M1 | Inspect existing flow and docs | complete | AGENTS.md, package scripts, chat/DM hooks/components, migrations/tests | Static inspection | Root-cause plan accepted by user. |
| M2 | Stabilize group chat scroll/send/media | complete | Group chat hook/components, shared local outbox/media helpers | Focused Jest, full Jest, build, smoke, scroll probe | Group chat opens through a guarded latest-window path, failed sends persist, and media renders smaller/cleaner. |
| M3 | Extract shared chat modules and port DMs | complete | Shared message display/outbox helpers, DM view/hook/schema | Typecheck, focused DM Jest, smoke DM/mobile | DM left/right alignment preserved. |
| M4 | Add/update tests | complete | Jest tests for scroll, outbox, media, DM parity | 321 Jest tests passed | Added DM reply and persisted failed-message retry coverage; updated media expectations. |
| M5 | Browser/mobile QA and final verification | complete | Smoke scripts and core gates | `qa:smoke`, `qa:chat-scroll`, `qa:smoke:resume` passed | No push requested. |

## Decisions

| Date | Decision | Reason | Impact |
| --- | --- | --- | --- |
| 2026-05-29 | Treat group chat as the source of truth before DM parity. | User wants group chat fully fixed first, then DMs mirrored from stable behavior. | Reduces duplicated bugs during the DM refactor. |
| 2026-05-29 | Preserve DM left/right alignment during feature parity work. | User likes that DM visual distinction. | Shared modules need alignment hooks/props. |
| 2026-05-29 | Persist failed local sends in scoped `localStorage` outboxes. | Failed sends must survive app close/reopen without database writes until retry succeeds. | Group scope is `general`; DM scope is `dm:<conversationId>`. |
| 2026-05-29 | Add `dm_messages.reply_to` for real DM reply parity. | DM replies need the same durable parent-message behavior as group chat. | Narrow migration plus manual TypeScript type update. |

## Verification Log

| Date | Command/check | Result | Artifact/path | Notes |
| --- | --- | --- | --- | --- |
| 2026-05-29 | `npm run lint` | pass | | ESLint clean. |
| 2026-05-29 | `npx tsc --noEmit -p tsconfig.app.json --pretty false` | pass | | App typecheck clean. |
| 2026-05-29 | `npm run build` | pass | `dist/` | Vite build completed; existing chunk-size warning remains. |
| 2026-05-29 | `npx jest --runInBand tests/MessageInput.test.tsx tests/MessageItem.test.tsx tests/MessageList.test.tsx tests/useMessages.test.tsx tests/useDirectMessages.test.tsx` | pass | | 5 suites, 78 tests. |
| 2026-05-29 | `npx jest --runInBand` | pass | | 75 suites, 321 tests. |
| 2026-05-29 | `npm run qa:smoke` | pass | `output/playwright/smoke-20260529210656/summary.json` | Auth, DM, mobile DM back scenarios passed. |
| 2026-05-29 | `npm run qa:chat-scroll` | pass | `output/playwright/chat-scroll-20260529210729/summary.json` | No long tasks; no over-budget frames. |
| 2026-05-29 | `npm run qa:smoke:resume` | pass | `output/playwright/smoke-20260529210758/summary.json` | Resume-send scenario passed. |

## Files Changed

| File | Reason | Notes |
| --- | --- | --- |
| `src/hooks/useUnreadScroll.ts` | Flush latest read cursor on hide/unmount when following latest. | Reduces stale cursor-driven resume jumps. |
| `src/components/chat/MessageList.tsx` | Gate automatic history loading, compact latest window, preserve anchors. | Manual top-scroll still loads history immediately. |
| `src/hooks/useMessages.tsx` | Add scoped persistent group outbox, retry/discard, and latest-window compaction. | Failed sends survive reload and retry with the same client id. |
| `src/components/chat/MessageItem.tsx` | Add retry/discard UI, media-aware replies, smaller thumbnails. | Videos use shared free-floating renderer. |
| `src/components/chat/MessageInput.tsx` | Support richer reply target previews. | Image replies show thumbnails in the composer. |
| `src/components/chat/VideoAttachment.tsx` | Remove frame/background/name strip. | Video appears free-floating. |
| `src/components/chat/messageDisplay.ts` | Shared media/reply display helpers. | Used by group chat and DMs. |
| `src/lib/localMessageOutbox.ts` | Shared scoped local outbox persistence. | Used by group chat and DMs. |
| `src/hooks/useDirectMessages.tsx` | Add DM reply send path, persistent outbox hydration/retry/discard. | Preserves existing realtime merge and refresh behavior. |
| `src/components/dms/DirectMessagesView.tsx` | Port group features to DMs: reply previews, GIF picker, quick reactions, retry/discard, media sizing. | Preserves incoming-left/own-right alignment. |
| `supabase/migrations/20260529143000_dm_message_replies.sql` | Add durable DM replies. | Adds `reply_to` and index. |
| `src/lib/supabase.ts`, `src/lib/optimisticMessages.ts` | Update manual types and schema fallback helper. | Keeps schema-dependent code typed. |
| `tests/MessageItem.test.tsx`, `tests/useDirectMessages.test.tsx` | Update/add coverage. | Covers new media rendering, DM reply payloads, and persisted failed-DM retry. |

## Final Status

- Outcome: Group chat scroll/load behavior, failed-send persistence/retry, media rendering, and media replies are implemented; DMs now mirror the group chat feature set while preserving left/right alignment.
- Completed milestones: M1-M5.
- Deferred items: Real iOS/Android installed-PWA manual review and user review of the exact visual thumbnail size against recent production images.
- Known risks: Remote Supabase environments need the new migration applied before durable DM replies are available there; code has schema fallback for older environments.
- Real-device validation needed: Yes, for installed PWA keyboard/safe-area/media feel.
- Push/deploy status: Not pushed; user requested local review first.
- Next recommended goal: User review on a phone-sized viewport/device, then push/deploy after approval.

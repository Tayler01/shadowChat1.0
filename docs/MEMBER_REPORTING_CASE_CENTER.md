# Member Reporting and Operator Case Center

## Status

Wave One Candidate 4 is implemented and deployed on the isolated
`codex/shadowchat-2.0` trial. This is a new safety domain. Product Feedback remains
the bug/feature intake and build workflow; it is not a moderation evidence
store. Additive migration `20260712003000` passed the Wave One shared-backend
checkpoint and is applied to the linked project.

The production frontend and the ShadowChat 2.0 frontend share one Supabase
project. Candidate 4 therefore uses only additive tables, RPCs, policies,
Storage configuration, Realtime publication entries, and TypeScript consumers.
No existing RPC signature or old-client write path changes.

## Product Contract

Members can report exactly five active target types:

- member profile
- General Chat message
- direct message
- ShadowPin post
- ShadowPin comment or reply

Boards, News, Art Board, and ESP Bridge are paused and are intentionally absent
from report targets, case filters, subscriptions, and enforcement presets.

The report sheet is phone-first and requires a safety reason before submission.
It previews the exact target evidence the server will preserve, accepts bounded
private context and optional private screenshots, and explicitly states that a
report does not automatically remove content, ban, notify, mute, or block a
member. Success returns a human-readable case reference. A reporter can later
see only their sanitized status and reporter-visible operator updates.

Reporter identity is never exposed to the reported member. Operators do not
receive general DM access: a DM report contains only the server-captured target
message and bounded metadata that the reporter was already permitted to read.

## Operator Contract

Settings > Admin gains a separate Safety Case Center with:

- New, Mine, In Review, and Resolved queues
- server-side status, severity, surface, reason, and assignment queues
- bounded keyset pagination and operator-safe Realtime refresh
- immutable evidence, people, and append-only timeline views
- guarded assignment, severity, status, private notes, and reporter updates
- confirmed no-action, supported content-removal, and scoped channel-ban actions

Every state mutation locks the case and requires the expected version. Stale
operator edits fail and refresh instead of silently overwriting another
operator. Case actions are transactional with their audit record. Cases and
evidence are retained; the UI has no hard-delete case path.

Role protection follows the existing authority source in `public.user_roles`:

- the full admin can review ordinary and sub-admin cases
- sub-admins can review only cases whose reporter and subject are ordinary
  members
- no operator can sanction themselves
- the full admin account cannot be sanctioned through the case center
- DMs remain outside operator content-deletion and channel-ban scope

## Backend Boundary

The additive domain consists of:

- `member_reports`: immutable, idempotent member intake
- `moderation_cases`: versioned operator queue and SLA snapshot
- `moderation_case_reports`: many-report to one-case linkage
- `moderation_evidence`: immutable server-captured target snapshots
- `moderation_case_events`: append-only operator/reporter-visible timeline
- `moderation_case_actions`: append-only enforcement audit
- `moderation_report_attachments`: verified private screenshot metadata
- `moderation_report_updates`: recipient-owned reporter-safe updates
- private `moderation-evidence` Storage bucket

All sensitive mutations use narrow RPCs. `submit_member_report` verifies the
caller can see the exact source, derives the subject and snapshot server-side,
rejects self-reporting, rate-limits abuse, deduplicates repeat taps, and never
trusts client-supplied author/content fields. Operator RPCs use current
`is_app_operator`/`is_app_admin` authority, row locks, version checks, bounded
results, explicit grants, and an empty search path.

Channel restrictions continue through `set_user_channel_bans`, including its
role hierarchy, public-reason requirement, expiry behavior, enforcement, and
public announcement. Internal case notes are kept separate from the public ban
reason. Supported content removal is limited to the exact reported General
Chat message, ShadowPin post, or ShadowPin comment and preserves evidence first.

## Implementation Map

- `supabase/migrations/20260712003000_member_reporting_case_center.sql` owns the
  schema, RLS, Storage, RPC, audit, SLA, and Realtime contract.
- `src/lib/moderationCases.ts` is the typed browser boundary.
- `src/features/moderation/MemberReportSheet.tsx` is lazy-loaded only after a
  member selects Report, keeping the initial bundle inside budget.
- `src/features/moderation/MyReportsPanel.tsx` shows sanitized reporter history
  and subscribes only to recipient-owned updates.
- `src/features/moderation/ModerationCaseCenter.tsx` is the lazy operator queue,
  evidence, assignment, transition, and confirmed-action workspace.
- `scripts/verify-member-reporting-case-center-local.sql` is the executable
  multi-role database proof.

## Release Gate

Candidate 4 is complete only when automated and browser proof shows:

- target visibility cannot be bypassed with a known UUID
- reporter identity and internal notes are unavailable to subjects/unrelated users
- DM evidence is one reported message and never a conversation browser
- repeat taps are idempotent and report-rate limits fail closed
- deleted or edited content cannot erase its captured evidence
- sub-admin/full-admin hierarchy matches current moderation authority
- stale case versions cannot clobber another operator
- failed enforcement work rolls back its subtransaction while the failed
  attempt remains visible in append-only action and event audit rows
- all five entry points, My Reports, queue, case detail, and confirmations work
  with 48-pixel controls, focus return, safe areas, and phone keyboards
- disposable report data and every uploaded evidence object are removed after QA

## Local Verification - July 11, 2026

- clean local migration replay passed
- `scripts/verify-member-reporting-case-center-local.sql` passed for reporter,
  subject, unrelated member, sub-admin, and full-admin roles
- local database lint and security advisor returned no errors
- focused reporting tests passed, including all five entry-point contracts,
  evidence upload cleanup, receipt mapping, sanitized reporter history, signed
  evidence, versioning, and immutable SQL controls
- the full repository gate passed: lint, TypeScript, production build and
  budgets, 160 Jest suites, 803 passing tests, and 16 intentional todos
- authenticated Android/Chromium and iPhone/WebKit acceptance passed against a
  clean local Supabase stack for Report, receipt, My Safety Reports, operator
  queue, and exact immutable evidence
- the local database was reset after acceptance; `member_reports` returned zero

The July 12 linked authority contract, migration history, dry run, and database
lint pass. The separate Netlify trial loads My Safety Reports on a live Pixel 7
profile. Operator action acceptance remains covered by the local multi-role SQL
and browser evidence until real queue data exists.

## Deferred Until Real Queue Evidence Exists

- automated severity or account suspension
- bulk actions
- cross-case clustering and reporter reputation scoring
- free-form operator-to-reporter messaging
- cases for paused product domains
- Activity HQ or push mirroring of moderation updates

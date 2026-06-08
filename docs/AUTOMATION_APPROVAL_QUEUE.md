# Automation Approval Queue

## Documentation Status - June 8, 2026

This doc describes the v1 Settings > Admin > Automation Approvals surface added
for the ShadowChat improvement automation loop.

## Purpose

The automation approval queue is a full-admin review surface for scan, build,
documentation, and batch-review packets. It gives Tayler a durable place to
review candidate metadata, risk notes, evidence, generated prompts, verification
plans, branch links, preview links, artifact links, and packet links before
manual action continues.

V1 is queue-only:

- approving a packet records full-admin intent and an audit event
- rejecting a packet records the decision and optional reason
- archiving a packet removes it from the open queue view
- no runner starts from approval
- no code is pushed, merged, deployed, or executed from approval

## Finished Automation Contract

The intended automation wrapper is a single scheduled local workflow. Once it
is built, the run should:

1. verify local tool health and stop for dead-stop setup issues
2. scan the repo for 5-10 candidates in each improvement category
3. run 3-5 category-local subagent reviews to choose one candidate per category
4. submit the five selected candidates for approval before build work
5. build approved candidates one at a time with scouting, research, roadmap,
   implementation, and candidate-level testing
6. run combined local verification after all five candidates are done
7. package changed files, rationale, risks, checks, cleanup proof, screenshots,
   branch links, preview links, and artifacts into one review packet
8. wait for Tayler's final approval
9. push only approved candidates directly to `main` and watch CI/deploy/remote
   state

The queue remains the human gate in that loop. It records approval intent and
review artifacts, but it should not hide failed tests, start builds, push code,
or mutate production state without an explicit approval step.

## Backend Surface

Main tables:

- `public.automation_approval_packets`: packet metadata, status, evidence,
  links, generated prompt, verification plan, review markdown, redacted logs,
  and decision fields.
- `public.automation_approval_packet_events`: append-only audit events for
  packet creation, review readiness, approval, rejection, archive decisions, and
  future runner updates.

Main RPCs:

- `approve_automation_approval_packet`
- `reject_automation_approval_packet`
- `archive_automation_approval_packet`

All three RPCs are `SECURITY DEFINER`, set `search_path = public`, and require
`public.is_app_admin(auth.uid())`.

## Access Model

- Full admins can read packets and events through RLS-backed `SELECT` access.
- Full admins can approve, reject, and archive packets through the RPCs.
- Sub-admins, normal users, and anonymous callers cannot read or mutate the
  queue.
- Browser clients do not receive direct `INSERT`, `UPDATE`, or `DELETE`
  privileges on queue tables.
- Future automation writers should use service-role credentials from trusted
  server-side code only.

## UI Safety

The Settings panel renders packet text as escaped React text or plain
preformatted content. Packet links only render when they parse as `http` or
`https` URLs. The panel does not use `dangerouslySetInnerHTML`.

## Validation

After queue changes, run:

```powershell
npx jest --runInBand --runTestsByPath tests/automationApprovalQueueSql.test.ts tests/automationApprovals.test.ts tests/AdminAutomationApprovals.test.tsx tests/SettingsView.test.tsx
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

For schema work, also run local Supabase reset/lint when practical and run
`supabase db push --dry-run` before approving a production schema push.

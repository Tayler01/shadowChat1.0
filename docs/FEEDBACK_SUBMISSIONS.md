# Feedback Submissions

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

ShadowChat users can submit bug reports and feature ideas from Settings.

## User Flow

1. Open Settings.
2. Choose **Send Feedback** in the Feedback section.
3. Pick **Bug report** or **Feature idea**.
4. Add a brief description and details.
5. Optionally attach screenshots or concept images.
6. Submit.

## Backend Storage

- Table: `public.feedback_submissions`
- Attachment bucket: `feedback-attachments`
- Bucket visibility: private
- Attachment path format: `<user_id>/<submission_id>/<attachment>`
- Supported attachment types: PNG, JPEG, WebP, GIF
- Attachment limit: 5 images per submission, 10 MB per image

Rows are scoped to the submitting user with Row Level Security. Users can insert
and read their own submissions. App operators can now read all submissions from
**Settings > Admin > Feedback Review**. The attachment bucket stays private;
operators receive short-lived signed URLs after the storage `SELECT` policy
confirms their admin-class access.

Admin review also allows operators to delete submitted bugs and suggestions.
Deleting removes the `feedback_submissions` row first, then cleans up attached
private images best-effort. Status editing, assignment, notifications, and
moderation workflows are intentionally deferred.

## Feedback Builds

Full admins get an additional **Feedback Builds** lane inside Feedback Review.
Sub-admin operators can continue reviewing submissions, but they cannot see or
start Codex build runs.

The build workflow uses two additional tables:

- `public.feedback_build_runs`
- `public.feedback_build_run_logs`

Admins do not write directly to those tables from the browser. The UI calls
these RPCs instead:

- `create_feedback_build_run`
- `retry_feedback_build_run`
- `approve_feedback_build_merge`
- `archive_feedback_build_run`

Starting or retrying a build requires a companion prompt with at least 20
characters. Attached screenshots are included by default, and a full admin can
exclude any image before queueing the run. The generated prompt is stored on the
run for review. Stage notes are append-only logs created as Codex finishes each
step.

Run statuses shown in the admin UI:

1. Pending
2. Running
3. Ready for Testing
4. Failed
5. Archived

The backend also stores merge-oriented states used by the processor:
`approved_to_merge`, `merging`, and `merged`.

The Codex processor should handle one repo operation globally at a time. It
processes merge-approved runs first, then pending runs. The required stage log
sequence is:

1. `queued`
2. `classifying`
3. `reviewing_affected_code`
4. `debugging_existing_behavior`
5. `researching_solution`
6. `planning`
7. `reviewing_plan_against_code`
8. `implementing`
9. `testing`
10. `branch_pushed`
11. `ready_for_testing`
12. `approved_to_merge`
13. `merging`
14. `documenting_cleanup`
15. `merged`

Failures can be retried from the admin run detail. Retries create a new pending
run and restart from classification. Runs are archived, not deleted.

When a run reaches Ready for Testing, the detail view shows the draft PR link,
Netlify preview URL when available, branch name, generated prompt, screenshots
marked Included or Excluded, and the stage-by-stage Codex notes. If the PR
exists but the Netlify preview URL is missing, the run should still be Ready for
Testing with a warning instead of Failed.

Feedback Builds should get their preview URLs from the GitHub Actions
`Netlify Preview Deploy` workflow. That workflow runs on PRs against `main`,
deploys the PR build to Netlify with the alias `pr-<pull-request-number>`, and
posts a sticky PR comment containing the preview URL. If that workflow is
temporarily unavailable, the processor can fall back to a manual Netlify draft
deploy and store that returned URL on `feedback_build_runs.preview_url`.

After a full admin approves a run to merge, the processor reruns the gates,
squash-merges to `main`, records the merge summary and commit SHA, closes the
original feedback submission, deletes the remote feature branch, and logs the
cleanup step.

## Evening Report Recognition

The daily Shado update should include public-safe credit for submitters whose
feedback builds merged that day when `recognition_enabled = true`. Mention the
display name or username only. Do not include screenshots, private companion
prompt text, or sensitive bug details in the chat announcement.

The evening report runs daily at 8:00 PM Eastern. It should include merged
Feedback Builds and normal `main` commits from the day. If there were no app
updates, it should still post a short, energetic good-evening message from
Shado.

## Deployment

Run the normal schema deployment before shipping the frontend:

```powershell
supabase db push --yes
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
git push origin main
```

The GitHub Actions Netlify production deploy runs on pushes to `main`. The
Supabase migration must be applied before that production UI can upload to the
`feedback-attachments` bucket, insert `feedback_submissions` rows, or let app
operators review submitted attachments.

## End-To-End Validation

For any change to this flow, verify all of the following:

1. Open Settings in a signed-in browser session.
2. Open **Send Feedback**.
3. Submit one bug report or feature idea with an image attachment.
4. Query `public.feedback_submissions` as the same user and confirm the title,
   type, description, and attachment metadata.
5. Download the attachment from `feedback-attachments` as the same user.
6. Open **Settings > Admin > Feedback Review** as an app operator and confirm the
   row appears with its signed image attachment.
7. Open the submission detail modal and confirm the delete action removes it
   from the list.
8. Run the Settings smoke scenario or the full smoke suite.

The April 28, 2026 release was verified with:

```powershell
node scripts/playwright-smoke.mjs --scenario=full --run-name=full-smoke-feedback-release-20260428 --headed --slow-mo=100 --no-reuse-server
node scripts/playwright-smoke.mjs --base-url=https://shadochat.online --scenario=settings --account-mode=env --run-name=prod-feedback-settings-postdeploy --headed --slow-mo=100 --skip-build
```

The production feedback E2E also created a real feedback row and downloaded the
private image attachment. Its artifact summary is at
`output/playwright/feedback-prod-e2e-1777419359750/summary.json`.

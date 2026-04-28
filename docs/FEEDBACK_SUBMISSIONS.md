# Feedback Submissions

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
and read their own submissions. Admin review, admin notifications, and cross-user
review access are intentionally deferred until the admin tooling is built.

## Deployment

Run the normal schema deployment before shipping the frontend:

```powershell
supabase db push --yes
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
npx netlify deploy --prod
```

The Netlify deploy must happen after the Supabase migration so the production
Settings UI can upload to the `feedback-attachments` bucket and insert
`feedback_submissions` rows.

## End-To-End Validation

For any change to this flow, verify all of the following:

1. Open Settings in a signed-in browser session.
2. Open **Send Feedback**.
3. Submit one bug report or feature idea with an image attachment.
4. Query `public.feedback_submissions` as the same user and confirm the title,
   type, description, and attachment metadata.
5. Download the attachment from `feedback-attachments` as the same user.
6. Run the Settings smoke scenario or the full smoke suite.

The April 28, 2026 release was verified with:

```powershell
node scripts/playwright-smoke.mjs --scenario=full --run-name=full-smoke-feedback-release-20260428 --headed --slow-mo=100 --no-reuse-server
node scripts/playwright-smoke.mjs --base-url=https://shadowchat-1-0.netlify.app --scenario=settings --account-mode=env --run-name=prod-feedback-settings-postdeploy --headed --slow-mo=100 --skip-build
```

The production feedback E2E also created a real feedback row and downloaded the
private image attachment. Its artifact summary is at
`output/playwright/feedback-prod-e2e-1777419359750/summary.json`.

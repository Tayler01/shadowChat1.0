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

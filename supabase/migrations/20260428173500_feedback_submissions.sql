/*
  # User feedback submissions

  Adds the first production path for users to submit bug reports and feature
  ideas from Settings. Attachments are private Storage objects scoped to the
  submitting user's folder so later admin tooling can review them without
  exposing customer screenshots publicly.
*/

CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  submission_type text NOT NULL CHECK (submission_type IN ('bug', 'feature')),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 140),
  description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 10 AND 4000),
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'planned', 'closed')),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_user_created_idx
  ON public.feedback_submissions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_submissions_status_created_idx
  ON public.feedback_submissions (status, created_at DESC);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create their own feedback submissions" ON public.feedback_submissions;
DROP POLICY IF EXISTS "Users can read their own feedback submissions" ON public.feedback_submissions;

CREATE POLICY "Users can create their own feedback submissions"
ON public.feedback_submissions
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can read their own feedback submissions"
ON public.feedback_submissions
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'feedback-attachments',
  'feedback-attachments',
  false,
  10485760,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload their own feedback attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read their own feedback attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own feedback attachments" ON storage.objects;

CREATE POLICY "Users can upload their own feedback attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'feedback-attachments'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Users can read their own feedback attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

CREATE POLICY "Users can delete their own feedback attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND (storage.foldername(name))[1] = (select auth.uid())::text
);

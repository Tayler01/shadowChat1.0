/*
  # Feedback admin review access

  Gives app operators read-only access to submitted feedback and private
  feedback attachments so the Admin Feedback Review tab can list bugs,
  suggestions, and screenshots without making the bucket public.
*/

DROP POLICY IF EXISTS "App operators can read feedback submissions" ON public.feedback_submissions;
CREATE POLICY "App operators can read feedback submissions"
ON public.feedback_submissions
FOR SELECT
TO authenticated
USING (public.is_app_operator(auth.uid()));

DROP POLICY IF EXISTS "App operators can read feedback attachments" ON storage.objects;
CREATE POLICY "App operators can read feedback attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND public.is_app_operator(auth.uid())
);

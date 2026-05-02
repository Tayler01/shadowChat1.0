/*
  # Feedback admin delete access

  Lets app operators remove submitted bugs and suggestions from the Admin
  Feedback Review tab. Operators can also remove the corresponding private
  attachment objects so deleted submissions do not leave orphaned screenshots.
*/

DROP POLICY IF EXISTS "App operators can delete feedback submissions" ON public.feedback_submissions;
CREATE POLICY "App operators can delete feedback submissions"
ON public.feedback_submissions
FOR DELETE
TO authenticated
USING (public.is_app_operator((select auth.uid())));

DROP POLICY IF EXISTS "App operators can delete feedback attachments" ON storage.objects;
CREATE POLICY "App operators can delete feedback attachments"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'feedback-attachments'
  AND public.is_app_operator((select auth.uid()))
);

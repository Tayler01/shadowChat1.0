/*
  # Feedback build runs

  Adds the full-admin-only queue that turns reviewed feedback submissions into
  structured Codex build runs. The browser can read run state and call narrow
  RPCs, while the Codex cron runner records stage logs and repo outcomes with
  service-role credentials.
*/

CREATE TABLE IF NOT EXISTS public.feedback_build_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_submission_id uuid NOT NULL REFERENCES public.feedback_submissions(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  companion_prompt text NOT NULL CHECK (char_length(trim(companion_prompt)) >= 20),
  generated_prompt text NOT NULL,
  included_attachments jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(included_attachments) = 'array'),
  recognition_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN (
      'pending',
      'running',
      'ready_for_testing',
      'failed',
      'approved_to_merge',
      'merging',
      'merged',
      'archived'
    )
  ),
  current_stage text NOT NULL DEFAULT 'queued' CHECK (
    current_stage IN (
      'queued',
      'classifying',
      'reviewing_affected_code',
      'debugging_existing_behavior',
      'researching_solution',
      'planning',
      'reviewing_plan_against_code',
      'implementing',
      'testing',
      'branch_pushed',
      'ready_for_testing',
      'approved_to_merge',
      'merging',
      'documenting_cleanup',
      'merged',
      'failed',
      'archived'
    )
  ),
  branch_name text,
  pr_url text,
  preview_url text,
  preview_warning text,
  summary text,
  merge_commit_sha text,
  failure_message text,
  approved_merge_at timestamptz,
  approved_merge_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  archived_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_build_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.feedback_build_runs(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (
    stage IN (
      'queued',
      'classifying',
      'reviewing_affected_code',
      'debugging_existing_behavior',
      'researching_solution',
      'planning',
      'reviewing_plan_against_code',
      'implementing',
      'testing',
      'branch_pushed',
      'ready_for_testing',
      'approved_to_merge',
      'merging',
      'documenting_cleanup',
      'merged',
      'failed',
      'archived'
    )
  ),
  message text NOT NULL CHECK (char_length(trim(message)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_build_runs_submission_created_idx
  ON public.feedback_build_runs (feedback_submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_build_runs_status_created_idx
  ON public.feedback_build_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_build_runs_active_global_idx
  ON public.feedback_build_runs (created_at ASC)
  WHERE status IN ('running', 'approved_to_merge', 'merging');

CREATE INDEX IF NOT EXISTS feedback_build_run_logs_run_created_idx
  ON public.feedback_build_run_logs (run_id, created_at ASC);

DROP TRIGGER IF EXISTS update_feedback_build_runs_updated_at ON public.feedback_build_runs;
CREATE TRIGGER update_feedback_build_runs_updated_at
  BEFORE UPDATE ON public.feedback_build_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.feedback_build_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_build_run_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full admins can read feedback build runs" ON public.feedback_build_runs;
CREATE POLICY "Full admins can read feedback build runs"
ON public.feedback_build_runs
FOR SELECT
TO authenticated
USING (public.is_app_admin((select auth.uid())));

DROP POLICY IF EXISTS "Full admins can read feedback build run logs" ON public.feedback_build_run_logs;
CREATE POLICY "Full admins can read feedback build run logs"
ON public.feedback_build_run_logs
FOR SELECT
TO authenticated
USING (
  public.is_app_admin((select auth.uid()))
  AND EXISTS (
    SELECT 1
    FROM public.feedback_build_runs runs
    WHERE runs.id = feedback_build_run_logs.run_id
  )
);

CREATE OR REPLACE FUNCTION public.build_feedback_run_prompt(
  target_submission public.feedback_submissions,
  submitter_name text,
  submitter_username text,
  companion_prompt text,
  included_attachments jsonb,
  recognition_enabled boolean
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN concat_ws(
    E'\n\n',
    'ShadowChat feedback build request',
    concat('Submission id: ', target_submission.id),
    concat('Submission type: ', target_submission.submission_type),
    concat('Title: ', target_submission.title),
    concat('Submitter: ', COALESCE(NULLIF(submitter_name, ''), submitter_username, 'Unknown user')),
    concat('Submitter handle: ', COALESCE('@' || NULLIF(submitter_username, ''), 'unknown')),
    concat('Recognition allowed in evening report: ', CASE WHEN recognition_enabled THEN 'yes' ELSE 'no' END),
    concat('Included attachment metadata: ', included_attachments::text),
    concat(E'User submission:\n', target_submission.description),
    concat(E'Admin companion prompt:\n', trim(companion_prompt)),
    E'Required Codex workflow:\n1. Classify the issue or feature area.\n2. Review the affected code and docs before editing.\n3. Debug the existing behavior and confirm it is not a simple local bug.\n4. Research the best fit for the codebase and provider docs where needed.\n5. Build a comprehensive step-by-step implementation plan.\n6. Compare the plan with existing code to remove overlap and avoid conflicts.\n7. Implement the change on a codex/feedback-* branch.\n8. Run lint, typecheck, build, and targeted tests.\n9. Push the branch, open a draft PR, and attach a Netlify preview when available.\n10. Record stage logs as each step completes.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_feedback_build_run(
  p_feedback_submission_id uuid,
  p_companion_prompt text,
  p_included_attachments jsonb DEFAULT '[]'::jsonb,
  p_recognition_enabled boolean DEFAULT true
)
RETURNS public.feedback_build_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  target_submission public.feedback_submissions%ROWTYPE;
  submitter_record public.users%ROWTYPE;
  created_run public.feedback_build_runs%ROWTYPE;
  generated text;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only full admins can start feedback build runs';
  END IF;

  IF char_length(trim(COALESCE(p_companion_prompt, ''))) < 20 THEN
    RAISE EXCEPTION 'Add at least 20 characters of companion prompt context';
  END IF;

  IF p_included_attachments IS NULL OR jsonb_typeof(p_included_attachments) <> 'array' THEN
    RAISE EXCEPTION 'Included attachments must be a JSON array';
  END IF;

  SELECT *
  INTO target_submission
  FROM public.feedback_submissions
  WHERE id = p_feedback_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback submission not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.feedback_build_runs runs
    WHERE runs.feedback_submission_id = p_feedback_submission_id
      AND runs.status IN ('pending', 'running', 'approved_to_merge', 'merging')
  ) THEN
    RAISE EXCEPTION 'This feedback submission already has an active build run';
  END IF;

  SELECT *
  INTO submitter_record
  FROM public.users
  WHERE id = target_submission.user_id;

  generated := public.build_feedback_run_prompt(
    target_submission,
    submitter_record.display_name,
    submitter_record.username,
    p_companion_prompt,
    p_included_attachments,
    COALESCE(p_recognition_enabled, true)
  );

  INSERT INTO public.feedback_build_runs (
    feedback_submission_id,
    created_by,
    companion_prompt,
    generated_prompt,
    included_attachments,
    recognition_enabled
  )
  VALUES (
    p_feedback_submission_id,
    actor_user_id,
    trim(p_companion_prompt),
    generated,
    p_included_attachments,
    COALESCE(p_recognition_enabled, true)
  )
  RETURNING * INTO created_run;

  INSERT INTO public.feedback_build_run_logs (run_id, stage, message)
  VALUES (created_run.id, 'queued', 'Build request queued for the Codex processor.');

  UPDATE public.feedback_submissions
  SET status = 'reviewing'
  WHERE id = p_feedback_submission_id
    AND status <> 'closed';

  RETURN created_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_feedback_build_run(
  p_previous_run_id uuid,
  p_companion_prompt text,
  p_included_attachments jsonb DEFAULT NULL,
  p_recognition_enabled boolean DEFAULT NULL
)
RETURNS public.feedback_build_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  previous_run public.feedback_build_runs%ROWTYPE;
  next_run public.feedback_build_runs%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only full admins can retry feedback build runs';
  END IF;

  SELECT *
  INTO previous_run
  FROM public.feedback_build_runs
  WHERE id = p_previous_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback build run not found';
  END IF;

  IF previous_run.status <> 'failed' THEN
    RAISE EXCEPTION 'Only failed feedback build runs can be retried';
  END IF;

  SELECT *
  INTO next_run
  FROM public.create_feedback_build_run(
    previous_run.feedback_submission_id,
    p_companion_prompt,
    COALESCE(p_included_attachments, previous_run.included_attachments),
    COALESCE(p_recognition_enabled, previous_run.recognition_enabled)
  );

  INSERT INTO public.feedback_build_run_logs (run_id, stage, message, metadata)
  VALUES (
    next_run.id,
    'queued',
    'Retry created from failed feedback build run.',
    jsonb_build_object('previous_run_id', previous_run.id)
  );

  RETURN next_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_feedback_build_merge(p_run_id uuid)
RETURNS public.feedback_build_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  target_run public.feedback_build_runs%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only full admins can approve feedback build merges';
  END IF;

  SELECT *
  INTO target_run
  FROM public.feedback_build_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback build run not found';
  END IF;

  IF target_run.status <> 'ready_for_testing' THEN
    RAISE EXCEPTION 'Only ready-for-testing feedback build runs can be approved';
  END IF;

  IF target_run.pr_url IS NULL OR trim(target_run.pr_url) = '' THEN
    RAISE EXCEPTION 'A pull request URL is required before merge approval';
  END IF;

  UPDATE public.feedback_build_runs
  SET
    status = 'approved_to_merge',
    current_stage = 'approved_to_merge',
    approved_merge_at = now(),
    approved_merge_by = actor_user_id
  WHERE id = p_run_id
  RETURNING * INTO target_run;

  INSERT INTO public.feedback_build_run_logs (run_id, stage, message)
  VALUES (target_run.id, 'approved_to_merge', 'Admin approved this feedback build for merge.');

  RETURN target_run;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_feedback_build_run(p_run_id uuid)
RETURNS public.feedback_build_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  target_run public.feedback_build_runs%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only full admins can archive feedback build runs';
  END IF;

  SELECT *
  INTO target_run
  FROM public.feedback_build_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Feedback build run not found';
  END IF;

  IF target_run.status IN ('running', 'approved_to_merge', 'merging') THEN
    RAISE EXCEPTION 'Active feedback build runs cannot be archived';
  END IF;

  UPDATE public.feedback_build_runs
  SET
    status = 'archived',
    current_stage = 'archived',
    archived_at = COALESCE(archived_at, now()),
    archived_by = COALESCE(archived_by, actor_user_id)
  WHERE id = p_run_id
  RETURNING * INTO target_run;

  INSERT INTO public.feedback_build_run_logs (run_id, stage, message)
  VALUES (target_run.id, 'archived', 'Admin archived this feedback build run.');

  RETURN target_run;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_feedback_run_prompt(public.feedback_submissions, text, text, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_feedback_build_run(uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_feedback_build_run(uuid, text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_feedback_build_merge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_feedback_build_run(uuid) TO authenticated;

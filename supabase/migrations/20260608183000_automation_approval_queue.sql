/*
  # Automation approval queue

  Adds a full-admin-only review queue for ShadowChat automation packets. This is
  intentionally queue-only in v1: approving a packet records intent and audit
  history, but it does not push, deploy, merge, or start a runner.
*/

CREATE TABLE IF NOT EXISTS public.automation_approval_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_type text NOT NULL DEFAULT 'build' CHECK (
    packet_type IN ('scan', 'build', 'docs', 'batch_review')
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'archived', 'ready_for_review')
  ),
  candidate_id text CHECK (candidate_id IS NULL OR char_length(candidate_id) <= 80),
  source_key text UNIQUE CHECK (source_key IS NULL OR char_length(source_key) <= 160),
  category text CHECK (category IS NULL OR char_length(category) <= 80),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 180),
  summary text NOT NULL DEFAULT '' CHECK (char_length(summary) <= 8000),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence) = 'array'),
  risk_notes text NOT NULL DEFAULT '' CHECK (char_length(risk_notes) <= 8000),
  proposed_scope text NOT NULL DEFAULT '' CHECK (char_length(proposed_scope) <= 12000),
  generated_prompt text NOT NULL DEFAULT '' CHECK (char_length(generated_prompt) <= 20000),
  verification_plan text NOT NULL DEFAULT '' CHECK (char_length(verification_plan) <= 12000),
  branch_name text CHECK (branch_name IS NULL OR char_length(branch_name) <= 240),
  pr_url text CHECK (pr_url IS NULL OR char_length(pr_url) <= 2048),
  preview_url text CHECK (preview_url IS NULL OR char_length(preview_url) <= 2048),
  artifact_url text CHECK (artifact_url IS NULL OR char_length(artifact_url) <= 2048),
  packet_url text CHECK (packet_url IS NULL OR char_length(packet_url) <= 2048),
  review_markdown text NOT NULL DEFAULT '' CHECK (char_length(review_markdown) <= 30000),
  redacted_logs jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(redacted_logs) = 'array'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  rejection_reason text CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 2000),
  archived_at timestamptz,
  archived_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_approval_packet_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid NOT NULL REFERENCES public.automation_approval_packets(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('created', 'review_ready', 'approved', 'rejected', 'archived', 'status_changed', 'runner_update')
  ),
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  message text NOT NULL CHECK (char_length(trim(message)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS automation_approval_packets_status_created_idx
  ON public.automation_approval_packets (status, created_at DESC);

CREATE INDEX IF NOT EXISTS automation_approval_packets_type_created_idx
  ON public.automation_approval_packets (packet_type, created_at DESC);

CREATE INDEX IF NOT EXISTS automation_approval_packets_candidate_idx
  ON public.automation_approval_packets (candidate_id)
  WHERE candidate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS automation_approval_packets_source_key_idx
  ON public.automation_approval_packets (source_key)
  WHERE source_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS automation_approval_packet_events_packet_created_idx
  ON public.automation_approval_packet_events (packet_id, created_at ASC);

DROP TRIGGER IF EXISTS update_automation_approval_packets_updated_at ON public.automation_approval_packets;
CREATE TRIGGER update_automation_approval_packets_updated_at
  BEFORE UPDATE ON public.automation_approval_packets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.automation_approval_packets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_approval_packet_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full admins can read automation approval packets" ON public.automation_approval_packets;
CREATE POLICY "Full admins can read automation approval packets"
ON public.automation_approval_packets
FOR SELECT
TO authenticated
USING (public.is_app_admin((select auth.uid())));

DROP POLICY IF EXISTS "Full admins can read automation approval packet events" ON public.automation_approval_packet_events;
CREATE POLICY "Full admins can read automation approval packet events"
ON public.automation_approval_packet_events
FOR SELECT
TO authenticated
USING (
  public.is_app_admin((select auth.uid()))
  AND EXISTS (
    SELECT 1
    FROM public.automation_approval_packets packets
    WHERE packets.id = automation_approval_packet_events.packet_id
  )
);

CREATE OR REPLACE FUNCTION public.approve_automation_approval_packet(p_packet_id uuid)
RETURNS public.automation_approval_packets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  target_packet public.automation_approval_packets%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only full admins can approve automation packets';
  END IF;

  SELECT *
  INTO target_packet
  FROM public.automation_approval_packets
  WHERE id = p_packet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Automation approval packet not found';
  END IF;

  IF target_packet.status NOT IN ('pending', 'ready_for_review') THEN
    RAISE EXCEPTION 'Only pending or ready-for-review automation packets can be approved';
  END IF;

  UPDATE public.automation_approval_packets
  SET
    status = 'approved',
    approved_at = now(),
    approved_by = actor_user_id,
    rejected_at = NULL,
    rejected_by = NULL,
    rejection_reason = NULL
  WHERE id = p_packet_id
  RETURNING * INTO target_packet;

  INSERT INTO public.automation_approval_packet_events (packet_id, event_type, actor_id, message)
  VALUES (target_packet.id, 'approved', actor_user_id, 'Full admin approved this automation packet for the next manual step.');

  RETURN target_packet;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_automation_approval_packet(
  p_packet_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS public.automation_approval_packets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  target_packet public.automation_approval_packets%ROWTYPE;
  normalized_reason text := NULLIF(left(trim(COALESCE(p_reason, '')), 2000), '');
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only full admins can reject automation packets';
  END IF;

  SELECT *
  INTO target_packet
  FROM public.automation_approval_packets
  WHERE id = p_packet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Automation approval packet not found';
  END IF;

  IF target_packet.status NOT IN ('pending', 'ready_for_review') THEN
    RAISE EXCEPTION 'Only pending or ready-for-review automation packets can be rejected';
  END IF;

  UPDATE public.automation_approval_packets
  SET
    status = 'rejected',
    rejected_at = now(),
    rejected_by = actor_user_id,
    rejection_reason = normalized_reason,
    approved_at = NULL,
    approved_by = NULL
  WHERE id = p_packet_id
  RETURNING * INTO target_packet;

  INSERT INTO public.automation_approval_packet_events (packet_id, event_type, actor_id, message, metadata)
  VALUES (
    target_packet.id,
    'rejected',
    actor_user_id,
    COALESCE(normalized_reason, 'Full admin rejected this automation packet.'),
    jsonb_build_object('reason', normalized_reason)
  );

  RETURN target_packet;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_automation_approval_packet(p_packet_id uuid)
RETURNS public.automation_approval_packets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_user_id uuid := auth.uid();
  target_packet public.automation_approval_packets%ROWTYPE;
BEGIN
  IF actor_user_id IS NULL OR NOT public.is_app_admin(actor_user_id) THEN
    RAISE EXCEPTION 'Only full admins can archive automation packets';
  END IF;

  SELECT *
  INTO target_packet
  FROM public.automation_approval_packets
  WHERE id = p_packet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Automation approval packet not found';
  END IF;

  IF target_packet.status = 'archived' THEN
    RAISE EXCEPTION 'Automation approval packet is already archived';
  END IF;

  UPDATE public.automation_approval_packets
  SET
    status = 'archived',
    archived_at = COALESCE(archived_at, now()),
    archived_by = COALESCE(archived_by, actor_user_id)
  WHERE id = p_packet_id
  RETURNING * INTO target_packet;

  INSERT INTO public.automation_approval_packet_events (packet_id, event_type, actor_id, message)
  VALUES (target_packet.id, 'archived', actor_user_id, 'Full admin archived this automation packet.');

  RETURN target_packet;
END;
$$;

REVOKE ALL ON TABLE public.automation_approval_packets FROM anon, authenticated;
REVOKE ALL ON TABLE public.automation_approval_packet_events FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_automation_approval_packet(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_automation_approval_packet(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_automation_approval_packet(uuid) FROM PUBLIC;
GRANT SELECT ON TABLE public.automation_approval_packets TO authenticated;
GRANT SELECT ON TABLE public.automation_approval_packet_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_automation_approval_packet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_automation_approval_packet(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_automation_approval_packet(uuid) TO authenticated;

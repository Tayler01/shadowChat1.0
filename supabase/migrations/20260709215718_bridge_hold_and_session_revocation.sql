/*
  Pause the preserved ESP Bridge control plane without deleting history.

  Re-enabling the feature must be deliberate: deploy the server gate with
  BRIDGE_API_ENABLED=true, move disabled devices back to `unpaired`, and issue
  fresh pairing/session credentials. Revoked credentials are never restored.
*/

WITH affected_devices AS (
  SELECT
    device.id,
    device.paired_user_id,
    device.status AS previous_status,
    (
      SELECT count(*)
      FROM public.bridge_device_sessions AS session
      WHERE session.device_id = device.id
        AND session.status IN ('active', 'rotating')
    ) AS revoked_session_count,
    (
      SELECT count(*)
      FROM public.bridge_pairing_codes AS pairing_code
      WHERE pairing_code.device_id = device.id
        AND pairing_code.status = 'pending'
    ) AS revoked_pairing_code_count
  FROM public.bridge_devices AS device
  WHERE device.status IN ('unpaired', 'pairing_pending', 'paired')
)
INSERT INTO public.bridge_audit_events (
  device_id,
  user_id,
  event_type,
  event_payload
)
SELECT
  affected_devices.id,
  affected_devices.paired_user_id,
  'feature_paused',
  jsonb_build_object(
    'feature', 'esp_bridge',
    'previous_device_status', affected_devices.previous_status,
    'revoked_session_count', affected_devices.revoked_session_count,
    'revoked_pairing_code_count', affected_devices.revoked_pairing_code_count,
    'paused_at', statement_timestamp()
  )
FROM affected_devices;

UPDATE public.bridge_device_sessions
SET
  status = 'revoked',
  revoked_at = coalesce(revoked_at, statement_timestamp()),
  access_token_hash = NULL,
  refresh_token_hash = NULL
WHERE status IN ('active', 'rotating');

UPDATE public.bridge_pairing_codes
SET status = 'revoked'
WHERE status = 'pending';

UPDATE public.bridge_devices
SET
  status = 'disabled',
  recovery_token_hash = NULL
WHERE status IN ('unpaired', 'pairing_pending', 'paired');

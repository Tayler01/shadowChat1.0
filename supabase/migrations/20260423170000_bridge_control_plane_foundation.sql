/*
  # ESP bridge control-plane foundation

  1. New tables
    - `bridge_devices`
    - `bridge_pairing_codes`
    - `bridge_pairings`
    - `bridge_device_sessions`
    - `bridge_audit_events`

  2. Security
    - Enable RLS on bridge lifecycle tables
    - No broad authenticated client policies yet; control-plane access will
      flow through Edge Functions using service-role access

  3. Operational helpers
    - Indexes for device lookup, pairing lookup, and active-session lookup
    - `updated_at` triggers on mutable bridge lifecycle tables
*/

CREATE TABLE IF NOT EXISTS public.bridge_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_serial text NOT NULL UNIQUE,
  hardware_model text NOT NULL,
  firmware_version text NOT NULL,
  status text NOT NULL DEFAULT 'unpaired',
  paired_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  last_seen_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_devices_status_check
    CHECK (status IN ('unpaired', 'pairing_pending', 'paired', 'revoked', 'disabled'))
);

CREATE TABLE IF NOT EXISTS public.bridge_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.bridge_devices(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_pairing_codes_status_check
    CHECK (status IN ('pending', 'consumed', 'expired', 'revoked'))
);

CREATE TABLE IF NOT EXISTS public.bridge_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.bridge_devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  paired_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz NULL,
  revoked_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_pairings_status_check
    CHECK (status IN ('pending', 'paired', 'revoked', 'expired'))
);

CREATE TABLE IF NOT EXISTS public.bridge_device_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.bridge_devices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  supabase_session_id uuid NULL,
  status text NOT NULL DEFAULT 'active',
  issued_at timestamptz NOT NULL DEFAULT now(),
  last_refresh_at timestamptz NULL,
  last_rotated_at timestamptz NULL,
  expires_at timestamptz NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bridge_device_sessions_status_check
    CHECK (status IN ('active', 'rotating', 'revoked', 'expired'))
);

CREATE TABLE IF NOT EXISTS public.bridge_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NULL REFERENCES public.bridge_devices(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_devices_paired_user_id
  ON public.bridge_devices(paired_user_id);

CREATE INDEX IF NOT EXISTS idx_bridge_devices_status
  ON public.bridge_devices(status);

CREATE INDEX IF NOT EXISTS idx_bridge_pairing_codes_device_status
  ON public.bridge_pairing_codes(device_id, status);

CREATE INDEX IF NOT EXISTS idx_bridge_pairing_codes_expires_at
  ON public.bridge_pairing_codes(expires_at);

CREATE INDEX IF NOT EXISTS idx_bridge_pairings_device_status
  ON public.bridge_pairings(device_id, status);

CREATE INDEX IF NOT EXISTS idx_bridge_pairings_user_status
  ON public.bridge_pairings(user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_pairings_one_active_pair
  ON public.bridge_pairings(device_id)
  WHERE status = 'paired';

CREATE INDEX IF NOT EXISTS idx_bridge_device_sessions_device_status
  ON public.bridge_device_sessions(device_id, status);

CREATE INDEX IF NOT EXISTS idx_bridge_device_sessions_user_status
  ON public.bridge_device_sessions(user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bridge_device_sessions_one_active_session
  ON public.bridge_device_sessions(device_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_bridge_audit_events_device_created
  ON public.bridge_audit_events(device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bridge_audit_events_user_created
  ON public.bridge_audit_events(user_id, created_at DESC);

ALTER TABLE public.bridge_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_audit_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_bridge_devices_updated_at ON public.bridge_devices;
CREATE TRIGGER update_bridge_devices_updated_at
  BEFORE UPDATE ON public.bridge_devices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_bridge_pairings_updated_at ON public.bridge_pairings;
CREATE TRIGGER update_bridge_pairings_updated_at
  BEFORE UPDATE ON public.bridge_pairings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_bridge_device_sessions_updated_at ON public.bridge_device_sessions;
CREATE TRIGGER update_bridge_device_sessions_updated_at
  BEFORE UPDATE ON public.bridge_device_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

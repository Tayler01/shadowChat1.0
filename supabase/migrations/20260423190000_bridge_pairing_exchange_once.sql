alter table public.bridge_pairing_codes
  add column if not exists session_exchanged_at timestamptz null;

create index if not exists idx_bridge_pairing_codes_session_exchange
  on public.bridge_pairing_codes (device_id, code, session_exchanged_at)
  where status = 'consumed';

alter table public.bridge_devices
  add column if not exists recovery_token_hash text null;

comment on column public.bridge_devices.recovery_token_hash is
  'Hash of the long-lived recovery secret stored only on the physical bridge after owner-approved pairing.';

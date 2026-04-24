alter table public.bridge_devices
  add column if not exists bridge_user_id uuid null references public.users(id) on delete set null;

alter table public.bridge_pairings
  add column if not exists bridge_user_id uuid null references public.users(id) on delete set null;

alter table public.bridge_device_sessions
  add column if not exists owner_user_id uuid null references public.users(id) on delete set null;

create unique index if not exists idx_bridge_devices_bridge_user_id
  on public.bridge_devices (bridge_user_id)
  where bridge_user_id is not null;

create index if not exists idx_bridge_pairings_bridge_user_status
  on public.bridge_pairings (bridge_user_id, status)
  where bridge_user_id is not null;

create index if not exists idx_bridge_device_sessions_owner_status
  on public.bridge_device_sessions (owner_user_id, status)
  where owner_user_id is not null;

comment on column public.bridge_devices.paired_user_id is
  'Human owner account that approved/administers the bridge.';

comment on column public.bridge_devices.bridge_user_id is
  'Dedicated ShadowChat user identity used by the physical bridge device.';

comment on column public.bridge_pairings.user_id is
  'Human owner account that approved/administers this pairing.';

comment on column public.bridge_pairings.bridge_user_id is
  'Dedicated ShadowChat user identity bound to this pairing.';

comment on column public.bridge_device_sessions.user_id is
  'Dedicated ShadowChat user identity authenticated by this bridge session.';

comment on column public.bridge_device_sessions.owner_user_id is
  'Human owner account that controls/revokes this bridge session.';

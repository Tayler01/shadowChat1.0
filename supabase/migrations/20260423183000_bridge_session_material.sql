alter table public.bridge_device_sessions
  add column if not exists access_token_hash text,
  add column if not exists refresh_token_hash text;

create index if not exists idx_bridge_device_sessions_access_token_hash
  on public.bridge_device_sessions (access_token_hash)
  where status = 'active' and access_token_hash is not null;

create index if not exists idx_bridge_device_sessions_refresh_token_hash
  on public.bridge_device_sessions (refresh_token_hash)
  where status = 'active' and refresh_token_hash is not null;

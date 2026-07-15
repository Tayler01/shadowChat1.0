/* Owner-private saved locations for the full Weather page. */

begin;

create table if not exists public.user_weather_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  location_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  timezone text,
  country_code text,
  admin1 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_weather_locations_name_check
    check (char_length(trim(location_name)) between 1 and 180),
  constraint user_weather_locations_latitude_check
    check (latitude between -90 and 90),
  constraint user_weather_locations_longitude_check
    check (longitude between -180 and 180),
  constraint user_weather_locations_country_code_check
    check (country_code is null or char_length(country_code) between 2 and 3),
  constraint user_weather_locations_owner_coordinate_key
    unique (user_id, latitude, longitude)
);

create index if not exists user_weather_locations_owner_updated_idx
  on public.user_weather_locations (user_id, updated_at desc, id);

alter table public.user_weather_locations enable row level security;

drop policy if exists "Users can view their own saved weather locations"
  on public.user_weather_locations;
create policy "Users can view their own saved weather locations"
  on public.user_weather_locations
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own saved weather locations"
  on public.user_weather_locations;
create policy "Users can add their own saved weather locations"
  on public.user_weather_locations
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own saved weather locations"
  on public.user_weather_locations;
create policy "Users can update their own saved weather locations"
  on public.user_weather_locations
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own saved weather locations"
  on public.user_weather_locations;
create policy "Users can delete their own saved weather locations"
  on public.user_weather_locations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.user_weather_locations
  from public, anon, authenticated;
grant select, insert, update, delete on table public.user_weather_locations
  to authenticated;
grant select, insert, update, delete on table public.user_weather_locations
  to service_role;

comment on table public.user_weather_locations is
  'Owner-private saved locations for the Weather page. The current location remains in user_weather_preferences.';

commit;

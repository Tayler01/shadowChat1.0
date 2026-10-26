-- Stage before enabling private client mode and disabling public channels in
-- Realtime Settings. This SQL does not change the hosted Realtime toggle.
begin;

-- Postgres Changes still enforces each source table's RLS per delivered row.
-- The channel SELECT gate only permits a database-subscription namespace plus
-- the exact server-authored release-notice topic. Client Broadcast/Presence is
-- never an alternate member-content transport.
create policy "Active members join database and release channels"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select private.is_active_member())
  and ((select realtime.topic()) like 'shadowchat:db:%'
    or (select realtime.topic()) = 'app-release-updates')
);

create policy "Constrain member realtime topics"
on realtime.messages as restrictive for select to authenticated
using (
  extension = 'broadcast'
  and (select private.is_active_member())
  and ((select realtime.topic()) like 'shadowchat:db:%'
    or (select realtime.topic()) = 'app-release-updates')
);

create policy "No anonymous private realtime reads"
on realtime.messages as restrictive for select to anon using (false);

-- A restrictive policy also closes any older permissive INSERT policy. The
-- trusted publisher uses the service role; no browser credential can publish.
create policy "No browser Broadcast or Presence writes"
on realtime.messages as restrictive for insert to anon, authenticated
with check (false);

commit;

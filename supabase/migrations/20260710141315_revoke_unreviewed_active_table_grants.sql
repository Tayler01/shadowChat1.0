/*
  # Align historical active-table grants with the reviewed release contract

  Clean rebuilds already omit these DELETE privileges, but the hosted project
  retained them from older grant history. Revoke only the two linked-project
  extras so local and production authority are deterministic.
*/

begin;

revoke delete on table public.dm_conversations from authenticated;
revoke delete on table public.notification_preferences from authenticated;

commit;

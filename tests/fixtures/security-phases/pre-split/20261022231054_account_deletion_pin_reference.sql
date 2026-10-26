-- A user who pinned somebody else's General Chat message must be deletable.
-- Preserve the message and its pinned state; remove only the deleted actor link.
begin;
alter table public.messages drop constraint if exists messages_pinned_by_fkey;
alter table public.messages add constraint messages_pinned_by_fkey
  foreign key (pinned_by) references public.users(id) on delete set null;
commit;

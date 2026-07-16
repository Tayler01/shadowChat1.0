begin;

create table public.shadow_pin_comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.shadow_pin_comments(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade default auth.uid(),
  emoji text not null check (
    emoji = btrim(emoji)
    and char_length(emoji) between 1 and 32
  ),
  created_at timestamptz not null default now(),
  constraint shadow_pin_comment_reactions_unique
    unique (comment_id, user_id, emoji)
);

alter table public.shadow_pin_comment_reactions enable row level security;

create policy "Members can read reactions on visible ShadowPin comments"
  on public.shadow_pin_comment_reactions
  for select
  to authenticated
  using (
    not private.users_have_block((select auth.uid()), user_id)
    and
    exists (
      select 1
      from public.shadow_pin_comments comments
      where comments.id = shadow_pin_comment_reactions.comment_id
        and not private.users_have_block((select auth.uid()), comments.author_id)
    )
  );

create policy "Members can add own reactions to visible ShadowPin comments"
  on public.shadow_pin_comment_reactions
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.shadow_pin_comments comments
      where comments.id = shadow_pin_comment_reactions.comment_id
        and not private.users_have_block((select auth.uid()), comments.author_id)
    )
  );

create policy "Members can remove own ShadowPin comment reactions"
  on public.shadow_pin_comment_reactions
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.toggle_shadow_pin_comment_reaction(
  target_comment_id uuid,
  target_emoji text
)
returns table (
  emoji text,
  reaction_count bigint,
  user_ids uuid[]
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_emoji text := btrim(target_emoji);
  removed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if normalized_emoji is null
    or normalized_emoji = ''
    or char_length(normalized_emoji) > 32 then
    raise exception 'Reaction must be between 1 and 32 characters';
  end if;

  perform 1
  from public.shadow_pin_comments comments
  where comments.id = target_comment_id
    and not private.users_have_block(auth.uid(), comments.author_id);

  if not found then
    raise exception 'ShadowPin comment is not available';
  end if;

  delete from public.shadow_pin_comment_reactions reactions
  where reactions.comment_id = target_comment_id
    and reactions.user_id = auth.uid()
    and reactions.emoji = normalized_emoji;

  get diagnostics removed_count = row_count;

  if removed_count = 0 then
    insert into public.shadow_pin_comment_reactions (comment_id, user_id, emoji)
    values (target_comment_id, auth.uid(), normalized_emoji);
  end if;

  return query
  select
    reactions.emoji,
    count(*)::bigint,
    array_agg(reactions.user_id order by reactions.created_at, reactions.user_id)
  from public.shadow_pin_comment_reactions reactions
  where reactions.comment_id = target_comment_id
  group by reactions.emoji
  order by min(reactions.created_at), reactions.emoji;
end;
$$;

revoke all on table public.shadow_pin_comment_reactions
  from public, anon;
grant select, insert, delete on table public.shadow_pin_comment_reactions
  to authenticated;
grant select, insert, delete on table public.shadow_pin_comment_reactions
  to service_role;

revoke all on function public.toggle_shadow_pin_comment_reaction(uuid, text)
  from public, anon;
grant execute on function public.toggle_shadow_pin_comment_reaction(uuid, text)
  to authenticated, service_role;

commit;

begin;

-- Supabase's performance advisor recommends evaluating auth.uid() once per
-- statement. Keep this list explicit so policy drift fails closed instead of
-- silently rewriting unrelated authorization rules.
do $migration$
declare
  target record;
  current_qual text;
  current_check text;
  optimized_qual text;
  optimized_check text;
  statement text;
begin
  for target in
    select *
    from (values
      ('admin_role_audit', 'Full admins can read admin role audit'),
      ('admin_role_notifications', 'Users can read own admin role notifications'),
      ('app_release_receipts', 'Users can insert own app release receipts'),
      ('app_release_receipts', 'Users can read own app release receipts'),
      ('app_release_receipts', 'Users can update own app release receipts'),
      ('dm_conversations', 'Users can create conversations'),
      ('dm_conversations', 'Users can read own conversations'),
      ('dm_conversations', 'Users can update own conversations'),
      ('dm_messages', 'Users can delete own DM messages'),
      ('dm_messages', 'Users can insert DM messages'),
      ('dm_messages', 'Users can read messages from own conversations'),
      ('hype_bonus_grants', 'Users can read own Hype bonus grants'),
      ('message_reactions', 'Users can remove own reactions'),
      ('news_feed_items', 'App operators can delete feed items'),
      ('news_feed_items', 'App operators can update feed items'),
      ('news_feed_items', 'Authenticated users can read today''s visible feed'),
      ('news_sources', 'App operators can delete sources'),
      ('news_sources', 'App operators can insert sources'),
      ('news_sources', 'App operators can update sources'),
      ('notification_events', 'Users can update their own notification events'),
      ('notification_events', 'Users can view their own notification events'),
      ('notification_preferences', 'Users can insert their own notification preferences'),
      ('notification_preferences', 'Users can update their own notification preferences'),
      ('notification_preferences', 'Users can view their own notification preferences'),
      ('push_subscriptions', 'Users can delete their own push subscriptions'),
      ('push_subscriptions', 'Users can insert their own push subscriptions'),
      ('push_subscriptions', 'Users can update their own push subscriptions'),
      ('push_subscriptions', 'Users can view their own push subscriptions'),
      ('shadow_pin_image_hearts', 'Users can add own shadow pin image hearts'),
      ('shadow_pin_images', 'Authenticated users can read shadow pin images'),
      ('shadow_runner_level_completions', 'Users can read own Shadow Runner completions'),
      ('user_sessions', 'Users can manage own sessions')
    ) as targets(table_name, policy_name)
  loop
    select policies.qual, policies.with_check
      into current_qual, current_check
    from pg_policies policies
    where policies.schemaname = 'public'
      and policies.tablename = target.table_name
      and policies.policyname = target.policy_name;

    if not found then
      raise exception 'Expected RLS policy %.% is missing', target.table_name, target.policy_name;
    end if;

    -- pg_policies renders an already-cached auth.uid() as this subquery. Mask
    -- it before replacing any remaining row-by-row calls so reruns are safe.
    optimized_qual := replace(coalesce(current_qual, ''), '( SELECT auth.uid() AS uid)', '__AUTH_UID_INITPLAN__');
    optimized_qual := replace(optimized_qual, 'auth.uid()', '(select auth.uid())');
    optimized_qual := replace(optimized_qual, '__AUTH_UID_INITPLAN__', '(select auth.uid())');

    optimized_check := replace(coalesce(current_check, ''), '( SELECT auth.uid() AS uid)', '__AUTH_UID_INITPLAN__');
    optimized_check := replace(optimized_check, 'auth.uid()', '(select auth.uid())');
    optimized_check := replace(optimized_check, '__AUTH_UID_INITPLAN__', '(select auth.uid())');

    statement := format('alter policy %I on public.%I to authenticated', target.policy_name, target.table_name);
    if current_qual is not null then
      statement := statement || format(' using (%s)', optimized_qual);
    end if;
    if current_check is not null then
      statement := statement || format(' with check (%s)', optimized_check);
    end if;

    execute statement;
  end loop;
end
$migration$;

-- Make update postconditions explicit on policies that previously relied on
-- PostgreSQL's implicit USING fallback.
alter policy "Users can update own conversations"
  on public.dm_conversations
  to authenticated
  using ((select auth.uid()) = any (participants))
  with check ((select auth.uid()) = any (participants));

alter policy "Users can update own DM messages"
  on public.dm_messages
  to authenticated
  using ((select auth.uid()) = sender_id)
  with check ((select auth.uid()) = sender_id);

alter policy "Users can manage own sessions"
  on public.user_sessions
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The duplicate policy had the same predicate as the canonical DM update
-- policy and only doubled policy work for every update.
drop policy "Users can update own messages" on public.dm_messages;

-- Split the app-release ALL policy so SELECT has one combined permissive
-- expression while write operations remain admin-only.
drop policy "App admins can manage app releases" on public.app_releases;
drop policy "Authenticated users can read active app releases" on public.app_releases;

create policy "Authenticated users can read app releases"
  on public.app_releases
  for select
  to authenticated
  using (
    ((active = true) and (published_at <= now()))
    or public.is_app_admin((select auth.uid()))
  );

create policy "App admins can insert app releases"
  on public.app_releases
  for insert
  to authenticated
  with check (public.is_app_admin((select auth.uid())));

create policy "App admins can update app releases"
  on public.app_releases
  for update
  to authenticated
  using (public.is_app_admin((select auth.uid())))
  with check (public.is_app_admin((select auth.uid())));

create policy "App admins can delete app releases"
  on public.app_releases
  for delete
  to authenticated
  using (public.is_app_admin((select auth.uid())));

-- Operators and published-content readers share one SELECT policy.
drop policy "Authenticated users can read published Shado TV content blocks"
  on public.shado_tv_content_blocks;
drop policy "Operators can read all Shado TV content blocks"
  on public.shado_tv_content_blocks;

create policy "Authenticated users can read allowed Shado TV content blocks"
  on public.shado_tv_content_blocks
  for select
  to authenticated
  using (
    public.is_app_operator((select auth.uid()))
    or (
      deleted_at is null
      and visibility_status = 'published'
      and exists (
        select 1
        from public.shado_tv_channels channels
        where channels.id = shado_tv_content_blocks.channel_id
          and channels.deleted_at is null
          and channels.visibility_status = 'published'
      )
    )
  );

-- An ALL policy also participates in SELECT. Split ownership writes from the
-- existing read-all presence policy to avoid duplicate SELECT evaluation.
drop policy "Users can update own presence" on public.user_presence;

create policy "Users can insert own presence"
  on public.user_presence
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own presence"
  on public.user_presence
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own presence"
  on public.user_presence
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

commit;

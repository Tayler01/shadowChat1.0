-- Isolated branch only: jwldrnmhrmwsyrfhmrkg. The caller must independently
-- verify the branch target, then replace the one run token from the exact
-- scripts/streamlined-staged-fixture.mjs manifest while its fixtures exist.
-- Reads only; no rows, roles, policies or protected-admin state are changed.
begin read only;
set local standard_conforming_strings = on;
do $profile_qa$
declare
  run_token constant text := 'REPLACE_WITH_EXACT_QA_RUN_TOKEN';
  fixture_users uuid[];
  fixture_conversation uuid;
  fixture_root uuid;
  fixture_dm uuid;
  matches integer;
begin
  if run_token !~ '^qa-[0-9]{13}-[0-9a-f]{8}$' then
    raise exception 'Supply the exact isolated browser fixture run token';
  end if;
  select array_agg(u.id order by a.email) into fixture_users
  from public.users u join auth.users a on a.id=u.id
  where a.email in(run_token||'.1@example.invalid',run_token||'.2@example.invalid')
    and u.email=a.email and u.username ~ '^qa_browser_[0-9a-f]{10}$';
  if coalesce(cardinality(fixture_users),0)<>2 then
    raise exception 'Exact two synthetic fixture members are required';
  end if;
  select count(*)::integer into matches from public.dm_conversations
    where cardinality(participants)=2 and participants @> fixture_users;
  if matches<>1 then raise exception 'Exact synthetic conversation is required'; end if;
  select id into fixture_conversation from public.dm_conversations
    where cardinality(participants)=2 and participants @> fixture_users;
  select count(*)::integer into matches from public.messages
    where user_id=fixture_users[2] and content=run_token||' group text';
  if matches<>1 then raise exception 'Exact synthetic General root is required'; end if;
  select id into fixture_root from public.messages
    where user_id=fixture_users[2] and content=run_token||' group text';
  select count(*)::integer into matches from public.dm_messages
    where conversation_id=fixture_conversation and sender_id=fixture_users[2]
      and content=run_token||' direct message';
  if matches<>1 then raise exception 'Exact synthetic DM is required'; end if;
  select id into fixture_dm from public.dm_messages
    where conversation_id=fixture_conversation and sender_id=fixture_users[2]
      and content=run_token||' direct message';

  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',fixture_users[1])::text,true);
  execute 'set local role authenticated';
  if current_user<>'authenticated' or auth.uid() is distinct from fixture_users[1] then
    raise exception 'Member role binding failed';
  end if;
  perform * from public.get_dm_message_window(fixture_conversation,fixture_dm,50);
  perform * from public.get_dm_read_window(fixture_conversation,null,null,null,null,null,true,50);
  perform * from public.get_general_chat_message_window(null,null,null,50);
  perform * from public.get_general_chat_thread(fixture_root,null,null,null,50);
  perform * from public.get_general_chat_thread_read_window(fixture_root,null,null,null,null,null,true,50);
  perform * from public.get_general_chat_thread_summaries(array[fixture_root]);
  perform * from public.get_general_chat_threaded_window(null,null,null,50);
  perform public.get_my_catch_up_v1(6,168);
  perform * from public.list_dm_shared_content(fixture_conversation,'all',30,null,null);
  perform * from public.list_my_saved_discovery_items(null,100);
  perform * from public.list_my_saved_messages(null,100);
  perform * from public.search_dm_conversation_messages(fixture_conversation,run_token,30,null,null);
  perform * from public.search_my_messages(run_token,40,null);
  begin
    perform email from public.users limit 1;
    raise exception 'Sensitive email SELECT unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform full_name from public.users limit 1;
    raise exception 'Sensitive full_name SELECT unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$profile_qa$;
select 13 as invoker_rpcs_executed,2 as sensitive_columns_denied;
rollback;

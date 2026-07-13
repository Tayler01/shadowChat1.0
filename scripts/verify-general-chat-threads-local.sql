begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000501',
    'authenticated', 'authenticated', 'threads-a@example.test', '', now(),
    '{}'::jsonb, '{"username":"threads_a","display_name":"Threads A"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000502',
    'authenticated', 'authenticated', 'threads-b@example.test', '', now(),
    '{}'::jsonb, '{"username":"threads_b","display_name":"Threads B"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000503',
    'authenticated', 'authenticated', 'threads-c@example.test', '', now(),
    '{}'::jsonb, '{"username":"threads_c","display_name":"Threads C"}'::jsonb,
    now(), now()
  );

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.messages (id, user_id, content, created_at)
values (
  '51000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000501',
  'Thread root',
  '2026-07-12 20:00:00+00'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000502","role":"authenticated"}',
  true
);
set local role authenticated;

-- A legacy client writes only reply_to. The server must derive the mapping.
insert into public.messages (id, user_id, content, reply_to, created_at)
values (
  '52000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000502',
  'First reply',
  '51000000-0000-0000-0000-000000000501',
  '2026-07-12 20:01:00+00'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000503', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000503","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.messages (id, user_id, content, reply_to, created_at)
values (
  '53000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000503',
  'Nested reply',
  '52000000-0000-0000-0000-000000000501',
  '2026-07-12 20:02:00+00'
);

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000501', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000501","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  old_window jsonb;
  root_window record;
  thread_page record;
  thread_summary jsonb;
  first_reply_at timestamptz;
  denial_observed boolean;
begin
  if not exists (
    select 1
    from public.general_chat_thread_replies mapping
    where mapping.message_id = '52000000-0000-0000-0000-000000000501'
      and mapping.thread_id = '51000000-0000-0000-0000-000000000501'
      and mapping.parent_message_id = '51000000-0000-0000-0000-000000000501'
      and mapping.thread_started_at = '2026-07-12 20:00:00+00'
  ) then
    raise exception 'Legacy direct reply was not mapped to its root';
  end if;

  if not exists (
    select 1
    from public.general_chat_thread_replies mapping
    where mapping.message_id = '53000000-0000-0000-0000-000000000501'
      and mapping.thread_id = '51000000-0000-0000-0000-000000000501'
      and mapping.parent_message_id = '52000000-0000-0000-0000-000000000501'
  ) then
    raise exception 'Nested reply did not inherit the canonical root';
  end if;

  select message_window.messages
  into old_window
  from public.get_general_chat_message_window(null, null, null, 100) message_window;

  if jsonb_array_length(old_window) <> 3 then
    raise exception 'Legacy flat General Chat RPC changed behavior';
  end if;

  select *
  into root_window
  from public.get_general_chat_threaded_window(
    '53000000-0000-0000-0000-000000000501', null, null, 50
  );

  if jsonb_array_length(root_window.messages) <> 1
    or root_window.messages->0->>'id' <> '51000000-0000-0000-0000-000000000501'
    or root_window.target_thread_id <> '51000000-0000-0000-0000-000000000501'
    or root_window.anchor_status <> 'resolved' then
    raise exception 'Root-only window did not resolve a reply target to its root';
  end if;

  thread_summary := root_window.messages->0->'thread_summary';
  if (thread_summary->>'reply_count')::integer <> 2
    or (thread_summary->>'unread_count')::integer <> 2
    or thread_summary->>'latest_reply_id' <> '53000000-0000-0000-0000-000000000501'
    or thread_summary->>'latest_reply_preview' <> 'Nested reply'
    or thread_summary->'latest_reply_author'->>'id' <> '00000000-0000-0000-0000-000000000503'
    or jsonb_array_length(thread_summary->'participants') <> 2 then
    raise exception 'Stable thread summary shape or values are incorrect: %', thread_summary;
  end if;

  select *
  into thread_page
  from public.get_general_chat_thread(
    '51000000-0000-0000-0000-000000000501',
    '53000000-0000-0000-0000-000000000501',
    null,
    null,
    50
  );

  if thread_page.root_message->>'id' <> '51000000-0000-0000-0000-000000000501'
    or jsonb_array_length(thread_page.replies) <> 2
    or thread_page.replies->0->>'id' <> '52000000-0000-0000-0000-000000000501'
    or thread_page.replies->1->>'id' <> '53000000-0000-0000-0000-000000000501'
    or thread_page.anchor_status <> 'resolved' then
    raise exception 'Chronological thread page is incorrect';
  end if;

  select *
  into thread_page
  from public.get_general_chat_thread(
    '51000000-0000-0000-0000-000000000501',
    '52000000-0000-0000-0000-000000000501',
    null,
    null,
    2
  );

  if jsonb_array_length(thread_page.replies) <> 2
    or thread_page.replies->0->>'id' <> '52000000-0000-0000-0000-000000000501'
    or thread_page.replies->1->>'id' <> '53000000-0000-0000-0000-000000000501' then
    raise exception 'Target-centered thread page omitted its newer side';
  end if;

  select created_at into first_reply_at
  from public.messages
  where id = '52000000-0000-0000-0000-000000000501';

  perform public.set_user_read_cursor(
    'general_chat_thread',
    '51000000-0000-0000-0000-000000000501',
    '52000000-0000-0000-0000-000000000501',
    first_reply_at
  );

  select summaries.summary
  into thread_summary
  from public.get_general_chat_thread_summaries(
    array['51000000-0000-0000-0000-000000000501'::uuid]
  ) summaries;

  if (thread_summary->>'unread_count')::integer <> 1 then
    raise exception 'Thread unread cursor did not use the paired timestamp/id key';
  end if;

  denial_observed := false;
  begin
    update public.messages
    set reply_to = '53000000-0000-0000-0000-000000000501'
    where id = '51000000-0000-0000-0000-000000000501';
  exception when others then
    denial_observed := true;
  end;
  if not denial_observed then
    raise exception 'Cycle-forming reply update was accepted';
  end if;

  denial_observed := false;
  begin
    insert into public.messages (id, user_id, content, reply_to)
    values (
      '54000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000501',
      'Self cycle attempt',
      '54000000-0000-0000-0000-000000000501'
    );
  exception when others then
    denial_observed := true;
  end;
  if not denial_observed then
    raise exception 'Self-reply cycle was accepted';
  end if;

  denial_observed := false;
  begin
    insert into public.general_chat_thread_replies (
      message_id, thread_id, thread_started_at, parent_message_id
    ) values (
      '51000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000502',
      now(),
      '00000000-0000-0000-0000-000000000503'
    );
  exception when others then
    denial_observed := true;
  end;
  if not denial_observed then
    raise exception 'Authenticated caller forged a thread mapping';
  end if;

  denial_observed := false;
  begin
    perform *
    from public.get_general_chat_thread_summaries(
      (select array_agg(md5(number::text)::uuid) from generate_series(1, 51) number)
    );
  exception when others then
    denial_observed := true;
  end;
  if not denial_observed then
    raise exception 'Summary batch accepted more than 50 roots';
  end if;
end
$$;

-- A reciprocal block hides the existing reply/mapping and prevents a new one.
insert into public.user_blocks (blocker_id, blocked_id)
values (
  '00000000-0000-0000-0000-000000000501',
  '00000000-0000-0000-0000-000000000503'
);

do $$
declare
  thread_summary jsonb;
  thread_page record;
  denial_observed boolean := false;
begin
  if exists (
    select 1
    from public.general_chat_thread_replies mapping
    where mapping.message_id = '53000000-0000-0000-0000-000000000501'
  ) then
    raise exception 'Blocked reply mapping remained visible';
  end if;

  select summaries.summary
  into thread_summary
  from public.get_general_chat_thread_summaries(
    array['51000000-0000-0000-0000-000000000501'::uuid]
  ) summaries;

  if (thread_summary->>'reply_count')::integer <> 1
    or jsonb_array_length(thread_summary->'participants') <> 1 then
    raise exception 'Blocked reply leaked into thread summary';
  end if;

  select * into thread_page
  from public.get_general_chat_thread(
    '51000000-0000-0000-0000-000000000501', null, null, null, 50
  );

  if jsonb_array_length(thread_page.replies) <> 1 then
    raise exception 'Blocked reply leaked into thread page';
  end if;

  begin
    insert into public.messages (user_id, content, reply_to)
    values (
      '00000000-0000-0000-0000-000000000501',
      'Blocked reply attempt',
      '53000000-0000-0000-0000-000000000501'
    );
  exception when others then
    denial_observed := true;
  end;
  if not denial_observed then
    raise exception 'Reciprocal block did not reject a new reply';
  end if;
end
$$;

delete from public.user_blocks
where blocker_id = '00000000-0000-0000-0000-000000000501'
  and blocked_id = '00000000-0000-0000-0000-000000000503';

-- Deleting a root must preserve mapped replies and return an unavailable root.
delete from public.messages
where id = '51000000-0000-0000-0000-000000000501';

do $$
declare
  thread_page record;
  root_window record;
begin
  if (select count(*) from public.general_chat_thread_replies
      where thread_id = '51000000-0000-0000-0000-000000000501') <> 2 then
    raise exception 'Root deletion removed stable reply mappings';
  end if;

  select * into thread_page
  from public.get_general_chat_thread(
    '51000000-0000-0000-0000-000000000501', null, null, null, 50
  );

  if thread_page.root_message->>'unavailable' <> 'true'
    or jsonb_array_length(thread_page.replies) <> 2 then
    raise exception 'Deleted root did not produce a placeholder with surviving replies';
  end if;

  select * into root_window
  from public.get_general_chat_threaded_window(null, null, null, 50);

  if jsonb_array_length(root_window.messages) <> 0 then
    raise exception 'Surviving mapped replies reappeared as roots after root deletion';
  end if;
end
$$;

reset role;

do $$
begin
  if has_function_privilege(
    'anon',
    'public.get_general_chat_threaded_window(uuid,uuid,timestamp with time zone,integer)',
    'EXECUTE'
  ) then
    raise exception 'Anon can execute the threaded root window';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_general_chat_thread(uuid,uuid,timestamp with time zone,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'Anon can execute the thread page';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_general_chat_thread_summaries(uuid[])',
    'EXECUTE'
  ) then
    raise exception 'Anon can execute thread summaries';
  end if;

  if has_table_privilege(
    'anon', 'public.general_chat_thread_replies', 'SELECT'
  ) then
    raise exception 'Anon can select thread mappings';
  end if;
end
$$;

rollback;

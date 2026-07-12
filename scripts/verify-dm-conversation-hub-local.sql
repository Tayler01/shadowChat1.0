begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000201',
    'authenticated', 'authenticated', 'dm-hub-a@example.test', '', now(),
    '{}'::jsonb, '{"username":"dm_hub_a","display_name":"DM Hub A"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000202',
    'authenticated', 'authenticated', 'dm-hub-b@example.test', '', now(),
    '{}'::jsonb, '{"username":"dm_hub_b","display_name":"DM Hub B"}'::jsonb,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000203',
    'authenticated', 'authenticated', 'dm-hub-c@example.test', '', now(),
    '{}'::jsonb, '{"username":"dm_hub_c","display_name":"DM Hub C"}'::jsonb,
    now(), now()
  );

insert into public.dm_conversations (id, participants, last_message_at)
values
  (
    '10000000-0000-0000-0000-000000000201',
    array[
      '00000000-0000-0000-0000-000000000201'::uuid,
      '00000000-0000-0000-0000-000000000202'::uuid
    ],
    '2026-07-11 20:00:00+00'
  ),
  (
    '10000000-0000-0000-0000-000000000202',
    array[
      '00000000-0000-0000-0000-000000000201'::uuid,
      '00000000-0000-0000-0000-000000000203'::uuid
    ],
    '2026-07-11 20:00:00+00'
  );

insert into public.dm_messages (
  id, conversation_id, sender_id, content, message_type, file_url,
  thumbnail_url, created_at, updated_at
)
values
  (
    '20000000-0000-0000-0000-000000000201',
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000201',
    'first searchable needle', 'text', null, null,
    '2026-07-11 20:01:00+00', '2026-07-11 20:01:00+00'
  ),
  (
    '20000000-0000-0000-0000-000000000202',
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000202',
    'photo searchable needle', 'image', 'https://example.test/photo.jpg',
    'https://example.test/photo-thumb.jpg',
    '2026-07-11 20:02:00+00', '2026-07-11 20:02:00+00'
  ),
  (
    '20000000-0000-0000-0000-000000000203',
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000201',
    'visit https://example.test/story', 'text', null, null,
    '2026-07-11 20:03:00+00', '2026-07-11 20:03:00+00'
  ),
  (
    '20000000-0000-0000-0000-000000000204',
    '10000000-0000-0000-0000-000000000201',
    '00000000-0000-0000-0000-000000000202',
    'document', 'file', 'https://example.test/file.pdf', null,
    '2026-07-11 20:04:00+00', '2026-07-11 20:04:00+00'
  );

insert into public.dm_conversation_preferences (
  user_id, conversation_id, archived_at
)
values (
  '00000000-0000-0000-0000-000000000201',
  '10000000-0000-0000-0000-000000000201',
  now()
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_messages'
  ) then
    raise exception 'dm_messages is not in the Realtime publication';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'dm_conversation_preferences'
  ) then
    raise exception 'dm_conversation_preferences is not in the Realtime publication';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000202","role":"authenticated"}',
  true
);
set local role authenticated;

insert into public.dm_conversation_preferences (
  user_id, conversation_id, pinned_at, marked_unread_at
)
values (
  '00000000-0000-0000-0000-000000000202',
  '10000000-0000-0000-0000-000000000201',
  now(), now()
);

insert into public.dm_messages (
  id, conversation_id, sender_id, content, message_type, created_at, updated_at
)
values (
  '20000000-0000-0000-0000-000000000205',
  '10000000-0000-0000-0000-000000000201',
  '00000000-0000-0000-0000-000000000202',
  'old client send compatibility',
  'text',
  '2026-07-11 20:05:00+00',
  '2026-07-11 20:05:00+00'
);

do $$
begin
  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = '10000000-0000-0000-0000-000000000201'
      and conversations.last_message_at = '2026-07-11 20:05:00+00'
  ) then
    raise exception 'Server last-message trigger failed after UPDATE revocation';
  end if;

  delete from public.dm_messages
  where id = '20000000-0000-0000-0000-000000000205';

  if exists (
    select 1 from public.dm_messages
    where id = '20000000-0000-0000-0000-000000000205'
  ) then
    raise exception 'Legacy authenticated DM DELETE stopped working';
  end if;

  if not exists (
    select 1
    from public.dm_conversations conversations
    where conversations.id = '10000000-0000-0000-0000-000000000201'
      and conversations.last_message_at = '2026-07-11 20:04:00+00'
  ) then
    raise exception 'DM DELETE did not restore the authoritative inbox timestamp';
  end if;
end
$$;

do $$
declare
  direct_insert_denied boolean := false;
  participant_update_denied boolean := false;
  preference_insert_denied boolean := false;
  message_column_denied boolean := false;
  original_conversation_id uuid;
  repeated_conversation_id uuid;
begin
  if (select count(*) from public.dm_conversation_preferences) <> 1 then
    raise exception 'Preference owner isolation failed';
  end if;

  begin
    insert into public.dm_conversations (participants)
    values (array[
      '00000000-0000-0000-0000-000000000202'::uuid,
      '00000000-0000-0000-0000-000000000203'::uuid
    ]);
  exception when insufficient_privilege then
    direct_insert_denied := true;
  end;
  if not direct_insert_denied then
    raise exception 'Authenticated direct conversation INSERT was not denied';
  end if;

  begin
    update public.dm_conversations
    set participants = array[
      '00000000-0000-0000-0000-000000000202'::uuid,
      '00000000-0000-0000-0000-000000000203'::uuid
    ]
    where id = '10000000-0000-0000-0000-000000000201';
  exception when insufficient_privilege then
    participant_update_denied := true;
  end;
  if not participant_update_denied then
    raise exception 'Authenticated conversation participant UPDATE was not denied';
  end if;

  begin
    insert into public.dm_conversation_preferences (user_id, conversation_id)
    values (
      '00000000-0000-0000-0000-000000000202',
      '10000000-0000-0000-0000-000000000202'
    );
  exception when insufficient_privilege then
    preference_insert_denied := true;
  end;
  if not preference_insert_denied then
    raise exception 'Nonparticipant preference INSERT was not denied';
  end if;

  update public.dm_messages
  set content = 'edited searchable needle', edited_at = now()
  where id = '20000000-0000-0000-0000-000000000202';
  if not exists (
    select 1 from public.dm_messages
    where id = '20000000-0000-0000-0000-000000000202'
      and content = 'edited searchable needle'
      and edited_at is not null
  ) then
    raise exception 'Allowed DM content edit did not persist';
  end if;

  begin
    update public.dm_messages
    set read_by = array['00000000-0000-0000-0000-000000000202'::uuid]
    where id = '20000000-0000-0000-0000-000000000202';
  exception when insufficient_privilege then
    message_column_denied := true;
  end;
  if not message_column_denied then
    raise exception 'Authenticated member could mutate protected DM columns';
  end if;

  select public.get_or_create_dm_conversation(
    '00000000-0000-0000-0000-000000000203'
  ) into original_conversation_id;
  select public.get_or_create_dm_conversation(
    '00000000-0000-0000-0000-000000000203'
  ) into repeated_conversation_id;
  if original_conversation_id is distinct from repeated_conversation_id then
    raise exception 'get_or_create created duplicate pair conversations';
  end if;

  if (
    select count(*)
    from public.search_dm_conversation_messages(
      '10000000-0000-0000-0000-000000000201', 'needle', 50, null, null
    )
  ) <> 2 then
    raise exception 'Conversation-scoped search returned the wrong rows';
  end if;

  if not exists (
    select 1
    from public.search_dm_conversation_messages(
      '10000000-0000-0000-0000-000000000201',
      'needle',
      1,
      '2026-07-11 20:02:00+00',
      '20000000-0000-0000-0000-000000000202'
    ) results
    where results.id = '20000000-0000-0000-0000-000000000201'
  ) then
    raise exception 'Conversation search keyset did not advance deterministically';
  end if;

  if (
    select count(*)
    from public.list_dm_shared_content(
      '10000000-0000-0000-0000-000000000201', 'all', 50, null, null
    )
  ) <> 3 then
    raise exception 'Shared-content all filter returned the wrong rows';
  end if;

  if (
    select count(*)
    from public.list_dm_shared_content(
      '10000000-0000-0000-0000-000000000201', 'links', 50, null, null
    )
  ) <> 1 then
    raise exception 'Shared-content link filter returned the wrong rows';
  end if;

  if not exists (
    select 1
    from public.get_dm_message_window(
      '10000000-0000-0000-0000-000000000201',
      '20000000-0000-0000-0000-000000000202',
      3
    ) target_window
    where target_window.target_status = 'resolved'
      and jsonb_array_length(target_window.messages) = 3
      and target_window.has_older = false
      and target_window.has_newer = true
  ) then
    raise exception 'Exact DM target window was not centered and bounded';
  end if;

  if (
    select count(*)
    from public.get_dm_conversations()
  ) < 2 then
    raise exception 'Legacy get_dm_conversations contract stopped working';
  end if;

  perform public.mark_dm_messages_read('10000000-0000-0000-0000-000000000201');

  perform public.toggle_message_reaction(
    '20000000-0000-0000-0000-000000000201',
    'hub-heart',
    true
  );
  if not exists (
    select 1
    from public.dm_messages messages
    where messages.id = '20000000-0000-0000-0000-000000000201'
      and messages.reactions ? 'hub-heart'
  ) then
    raise exception 'Legacy guarded DM reaction stopped working';
  end if;
end
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.dm_conversation_preferences preferences
    where preferences.user_id = '00000000-0000-0000-0000-000000000201'
      and preferences.conversation_id = '10000000-0000-0000-0000-000000000201'
      and preferences.archived_at is not null
  ) then
    raise exception 'New DM did not unarchive another participant preference';
  end if;
end
$$;

insert into public.user_blocks (blocker_id, blocked_id)
values (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000201'
);

set local role authenticated;

do $$
begin
  if exists (
    select 1
    from public.search_dm_conversation_messages(
      '10000000-0000-0000-0000-000000000201', 'first', 30, null, null
    )
  ) then
    raise exception 'Blocked sender leaked through conversation search';
  end if;

  if not exists (
    select 1
    from public.get_dm_message_window(
      '10000000-0000-0000-0000-000000000201',
      '20000000-0000-0000-0000-000000000201',
      25
    ) target_window
    where target_window.target_status = 'missing'
      and target_window.messages = '[]'::jsonb
  ) then
    raise exception 'Blocked exact target did not fail closed';
  end if;

  if not exists (
    select 1
    from public.get_dm_conversations() conversations
    where conversations.id = '10000000-0000-0000-0000-000000000201'
      and conversations.is_blocked
      and conversations.last_message is null
      and conversations.unread_count = 0
  ) then
    raise exception 'Legacy blocked-thread privacy contract changed';
  end if;
end
$$;

reset role;
rollback;

select 'dm-conversation-hub-local-verification-passed' as result;

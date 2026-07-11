begin;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000101',
    'authenticated',
    'authenticated',
    'activity-a@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"username":"activity_a","display_name":"Activity A"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000102',
    'authenticated',
    'authenticated',
    'activity-b@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"username":"activity_b","display_name":"Activity B"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000103',
    'authenticated',
    'authenticated',
    'activity-c@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{"username":"activity_c","display_name":"Activity C"}'::jsonb,
    now(),
    now()
  );

do $$
begin
  if (
    select count(*)
    from public.users
    where id in (
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103'
    )
  ) <> 3 then
    raise exception 'Activity verifier could not create its isolated users';
  end if;
end
$$;

insert into public.dm_conversations (id, participants)
values (
  '10000000-0000-0000-0000-000000000001',
  array[
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid
  ]
);

insert into public.dm_messages (id, conversation_id, sender_id, content)
values (
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'Activity DM'
);

insert into public.messages (id, user_id, content)
values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  'Activity parent'
);

insert into public.messages (id, user_id, content, reply_to)
values (
  '30000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000101',
  '@activity_c,@activity_b adjacent mentions',
  '30000000-0000-0000-0000-000000000001'
);

insert into public.message_reactions (id, message_id, user_id, emoji)
values (
  '40000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'gold-heart'
);

insert into public.hype_events (
  id,
  actor_id,
  event_type,
  message_id,
  message_author_id
)
values (
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'message',
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102'
);

insert into public.shadow_pin_images (
  id,
  creator_id,
  title,
  image_url,
  image_path,
  processing_status
)
values (
  '60000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000101',
  'Activity Pin',
  'https://example.test/activity-pin.jpg',
  'activity/activity-pin.jpg',
  'ready'
);

insert into public.shadow_pin_comments (
  id,
  image_id,
  author_id,
  body
)
values (
  '70000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000102',
  'Activity comment'
);

insert into public.shadow_pin_comments (
  id,
  image_id,
  author_id,
  parent_comment_id,
  body
)
values (
  '70000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000103',
  '70000000-0000-0000-0000-000000000001',
  'Activity reply'
);

do $$
begin
  if (select count(*) from public.activity_events) <> 9 then
    raise exception 'Expected 9 Activity events, got %', (
      select count(*) from public.activity_events
    );
  end if;

  if (
    select count(*)
    from public.activity_events
    where user_id = '00000000-0000-0000-0000-000000000102'
  ) <> 6 then
    raise exception 'Recipient B did not receive the expected six events';
  end if;

  if not exists (
    select 1
    from public.activity_events
    where user_id = '00000000-0000-0000-0000-000000000103'
      and type = 'mention'
      and message_id = '30000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Adjacent mention parsing did not create recipient C activity';
  end if;

  if exists (
    select 1
    from public.activity_events
    where user_id = '00000000-0000-0000-0000-000000000102'
      and type = 'mention'
  ) then
    raise exception 'Reply recipient received a duplicate mention event';
  end if;

  if exists (
    select 1
    from public.activity_events
    where user_id = actor_id
  ) then
    raise exception 'Self activity was created';
  end if;
end
$$;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-0000-0000-000000000102',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000102","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if (select count(*) from public.activity_events) <> 6 then
    raise exception 'RLS did not expose exactly recipient B activity';
  end if;

  if exists (
    select 1
    from public.activity_events
    where user_id = '00000000-0000-0000-0000-000000000101'
  ) then
    raise exception 'Cross-recipient Activity row leaked through RLS';
  end if;
end
$$;

update public.activity_events
set read_at = now()
where user_id = '00000000-0000-0000-0000-000000000102';

do $$
declare
  mutation_was_denied boolean := false;
begin
  begin
    update public.activity_events
    set body_preview = body_preview
    where user_id = '00000000-0000-0000-0000-000000000102';
  exception when insufficient_privilege then
    mutation_was_denied := true;
  end;

  if not mutation_was_denied then
    raise exception 'Authenticated member could mutate server-owned Activity content';
  end if;
end
$$;

reset role;

update public.shadow_pin_images
set deleted_at = now(),
    deleted_by = '00000000-0000-0000-0000-000000000101'
where id = '60000000-0000-0000-0000-000000000001';

delete from public.messages
where id in (
  '30000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002'
);

do $$
begin
  if (select count(*) from public.activity_events) <> 1
    or not exists (
      select 1
      from public.activity_events
      where type = 'dm_message'
        and user_id = '00000000-0000-0000-0000-000000000102'
        and actor_id = '00000000-0000-0000-0000-000000000101'
    ) then
    raise exception 'Source cleanup left orphaned Activity rows';
  end if;
end
$$;

insert into public.user_blocks (blocker_id, blocked_id)
values (
  '00000000-0000-0000-0000-000000000102',
  '00000000-0000-0000-0000-000000000101'
);

do $$
begin
  if exists (select 1 from public.activity_events) then
    raise exception 'Blocking did not remove reciprocal Activity history';
  end if;
end
$$;

rollback;

select 'activity-events-local-verification-passed' as result;

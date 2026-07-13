begin;

insert into private.signup_invites (
  id, code_hash, created_at, expires_at, redeemed_at, redeemed_by, redeemed_email
)
values
  ('a1000000-0000-0000-0000-000000000a01', repeat('a', 64), now(), now() + interval '1 day', now(), '00000000-0000-0000-0000-000000000a01', 'activation-a@example.test'),
  ('b1000000-0000-0000-0000-000000000a02', repeat('b', 64), now(), now() + interval '1 day', now(), '00000000-0000-0000-0000-000000000a02', 'activation-b@example.test'),
  ('c1000000-0000-0000-0000-000000000a03', repeat('c', 64), now(), now() + interval '1 day', now(), '00000000-0000-0000-0000-000000000a03', 'activation-c@example.test'),
  ('d1000000-0000-0000-0000-000000000a09', repeat('d', 64), now(), now() + interval '1 day', now(), '00000000-0000-0000-0000-000000000a09', 'activation-old@example.test');

insert into private.signup_invite_redemptions (
  id, invite_id, redeemed_by, redeemed_email, redeemed_at
)
values
  ('a2000000-0000-0000-0000-000000000a01', 'a1000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a01', 'activation-a@example.test', now()),
  ('b2000000-0000-0000-0000-000000000a02', 'b1000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-000000000a02', 'activation-b@example.test', now()),
  ('c2000000-0000-0000-0000-000000000a03', 'c1000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a03', 'activation-c@example.test', now()),
  ('d2000000-0000-0000-0000-000000000a09', 'd1000000-0000-0000-0000-000000000a09', '00000000-0000-0000-0000-000000000a09', 'activation-old@example.test', now());

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000a01','authenticated','authenticated','activation-a@example.test','',now(),'{}','{"username":"activation_a","display_name":"Activation A"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000a02','authenticated','authenticated','activation-b@example.test','',now(),'{}','{"username":"activation_b","display_name":"Activation B"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000a03','authenticated','authenticated','activation-c@example.test','',now(),'{}','{"username":"activation_c","display_name":"Activation C"}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000a08','authenticated','authenticated','activation-no-invite@example.test','',now(),'{}','{"username":"activation_no_invite","display_name":"No Invite"}',now(),now()),
  (
    '00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000a09','authenticated','authenticated','activation-old@example.test','',now(),'{}','{"username":"activation_old","display_name":"Old Invite"}',
    (select started_at - interval '1 second' from private.activation_rollouts where rollout_key = 'first_run_activation_v1'),
    now()
  );

do $$
begin
  if (select count(*) from public.user_activation_journeys) <> 3 then
    raise exception 'Future invite enrollment count was not exactly three';
  end if;

  if exists (
    select 1 from public.user_activation_journeys
    where user_id in (
      '00000000-0000-0000-0000-000000000a08',
      '00000000-0000-0000-0000-000000000a09'
    )
  ) then
    raise exception 'Non-invite or pre-rollout user was enrolled';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a01","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  journey jsonb;
  revision integer;
  denied boolean;
begin
  journey := public.get_my_activation_journey();
  if journey->>'current_step' <> 'identity' or (journey->>'revision')::integer <> 1 then
    raise exception 'Initial activation state is incorrect: %', journey;
  end if;

  if exists (
    select 1 from public.user_activation_journeys
    where user_id = '00000000-0000-0000-0000-000000000a02'
  ) then
    raise exception 'Owner-private activation row leaked across RLS';
  end if;

  denied := false;
  begin
    update public.user_activation_journeys
    set completed_at = now()
    where user_id = '00000000-0000-0000-0000-000000000a01';
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Direct activation mutation was accepted'; end if;

  denied := false;
  begin
    perform public.update_my_activation_journey(1, 'preferences', 'notifications_later');
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'Preferences were accepted before identity'; end if;

  denied := false;
  begin
    perform public.update_my_activation_journey(1, 'install', 'later');
  exception when check_violation then denied := true; end;
  if not denied then raise exception 'Install was accepted before core completion'; end if;

  journey := public.update_my_activation_journey(1, 'identity', null);
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'presentation', 'minimized');
  if journey->>'presentation_state' <> 'minimized' or journey->>'dismissed_at' is null then
    raise exception 'Minimized presentation was not persisted';
  end if;
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'presentation', 'expanded');
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'preferences', 'notifications_later');
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'first_action', 'direct_message');
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'presentation', 'minimized');
  revision := (journey->>'revision')::integer;

  denied := false;
  begin
    perform public.update_my_activation_journey(1, 'install', 'later');
  exception when serialization_failure then denied := true; end;
  if not denied then raise exception 'Stale activation revision was accepted'; end if;

  if journey->>'current_step' <> 'first_action'
    or journey->>'selected_first_action_kind' <> 'direct_message'
    or journey->>'presentation_state' <> 'minimized'
    or journey->>'completed_at' is not null then
    raise exception 'Selected first action state is incorrect: %', journey;
  end if;
end
$$;

reset role;

-- A non-selected General Chat action must not advance the journey.
insert into public.messages (id, user_id, content)
values ('aa000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000a01', 'Not the selected action');

do $$
begin
  if exists (
    select 1 from public.user_activation_journeys
    where user_id = '00000000-0000-0000-0000-000000000a01'
      and first_action_completed_at is not null
  ) then
    raise exception 'Non-selected canonical action advanced the journey';
  end if;
end
$$;

insert into public.dm_conversations (id, participants)
values (
  'da000000-0000-0000-0000-000000000a01',
  array['00000000-0000-0000-0000-000000000a01'::uuid, '00000000-0000-0000-0000-000000000a02'::uuid]
);

insert into public.dm_messages (id, conversation_id, sender_id, content)
values (
  'db000000-0000-0000-0000-000000000a01',
  'da000000-0000-0000-0000-000000000a01',
  '00000000-0000-0000-0000-000000000a01',
  'Selected DM action'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a01","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  journey jsonb;
  completed_at_before text;
begin
  journey := public.get_my_activation_journey();
  if journey->>'current_step' <> 'complete'
    or journey->>'first_action_kind' <> 'direct_message'
    or journey->>'first_action_id' <> 'db000000-0000-0000-0000-000000000a01'
    or journey->>'presentation_state' <> 'expanded'
    or journey->>'dismissed_at' is not null
    or journey->>'completed_at' is null then
    raise exception 'Selected DM did not complete the journey: %', journey;
  end if;

  completed_at_before := journey->>'completed_at';
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'install', 'later');
  if journey->>'completed_at' <> completed_at_before
    or journey->>'install_choice' <> 'later' then
    raise exception 'Optional install changed core completion: %', journey;
  end if;

end
$$;

reset role;

-- Verify the General Chat action route and the complete-before-action guard.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a02', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a02","role":"authenticated"}', true);
set local role authenticated;

do $$
declare journey jsonb;
begin
  journey := public.update_my_activation_journey(1, 'identity', null);
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'preferences', 'notifications_unsupported');
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'first_action', 'group_message');
  if journey->>'completed_at' is not null then
    raise exception 'Selection completed the journey before its canonical action';
  end if;
end
$$;

insert into public.messages (id, user_id, content)
values ('bb000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-000000000a02', 'Selected group action');

do $$
declare journey jsonb := public.get_my_activation_journey();
begin
  if journey->>'first_action_kind' <> 'group_message' or journey->>'completed_at' is null then
    raise exception 'Selected General Chat action did not complete the journey: %', journey;
  end if;
end
$$;

reset role;

-- Verify the ShadowPin heart action route.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000a03', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000a03","role":"authenticated"}', true);
set local role authenticated;

do $$
declare journey jsonb;
begin
  journey := public.update_my_activation_journey(1, 'identity', null);
  journey := public.update_my_activation_journey((journey->>'revision')::integer, 'preferences', 'notifications_denied');
  perform public.update_my_activation_journey((journey->>'revision')::integer, 'first_action', 'shadow_pin_heart');
end
$$;

reset role;

insert into public.shadow_pin_categories (id, creator_id, title, image_url, image_path)
values ('ca000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a03', 'Activation category', 'https://example.test/category.webp', 'activation/category.webp');

insert into public.shadow_pin_images (id, category_id, creator_id, title, image_url, image_path)
values ('cb000000-0000-0000-0000-000000000a03', 'ca000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a03', 'Activation pin', 'https://example.test/pin.webp', 'activation/pin.webp');

insert into public.shadow_pin_image_hearts (image_id, user_id)
values ('cb000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a03');

do $$
begin
  if not exists (
    select 1 from public.user_activation_journeys
    where user_id = '00000000-0000-0000-0000-000000000a03'
      and first_action_kind = 'shadow_pin_heart'
      and first_action_id = 'cb000000-0000-0000-0000-000000000a03'
      and completed_at is not null
  ) then
    raise exception 'Selected ShadowPin heart did not complete the journey';
  end if;
end
$$;

-- Repeating later canonical actions must not replace the first action receipt.
insert into public.messages (id, user_id, content)
values ('cc000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000a03', 'Later action');

do $$
begin
  if not exists (
    select 1 from public.user_activation_journeys
    where user_id = '00000000-0000-0000-0000-000000000a03'
      and first_action_kind = 'shadow_pin_heart'
      and first_action_id = 'cb000000-0000-0000-0000-000000000a03'
  ) then
    raise exception 'First action receipt was not idempotent';
  end if;
end
$$;

rollback;

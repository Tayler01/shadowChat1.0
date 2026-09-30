-- Run after the bounded native migration inside the SAME rolled-back local
-- transaction. No secrets are read and no HTTP is enqueued by these tests.
set local session_replication_role = replica;
insert into public.users(id, username, display_name) values
 ('95000000-0000-4000-8000-000000000001','native_canary_fixture','Native Canary'),
 ('95000000-0000-4000-8000-000000000002','native_other_fixture','Other User');
set local session_replication_role = origin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);

update public.notification_v2_runtime_config set delivery_mode='disabled', worker_invocation_enabled=false,
 receipt_reconciliation_enabled=false, all_users_enabled=false, enabled_categories='{}', canary_user_ids='{}'
 where singleton;
do $$ begin
 if public.acquire_native_notification_worker_v2('deliver') is not null then raise exception 'Disabled worker acquired lease'; end if;
 if private.request_bounded_native_notification_canary() is not null then raise exception 'Disabled scheduler requested HTTP'; end if;
 if exists(select 1 from cron.job where jobname='shadowchat-native-push-canary' and active) then raise exception 'Canary schedule enabled by migration'; end if;
 if exists(select 1 from pg_trigger where tgrelid='public.notification_outbox_v2'::regclass and tgname='request_notification_delivery_v2_after_insert') then raise exception 'Unsafe legacy insertion dispatch remains'; end if;
 if has_function_privilege('anon','public.acquire_native_notification_worker_v2(text)','execute')
  or has_function_privilege('authenticated','public.release_native_notification_worker_v2(uuid)','execute')
  or has_function_privilege('service_role','private.request_bounded_native_notification_canary()','execute') then raise exception 'Worker privilege leaked'; end if;
end $$;

update public.notification_v2_runtime_config set delivery_mode='active', worker_invocation_enabled=true,
 receipt_reconciliation_enabled=true, all_users_enabled=false, enabled_categories=array['dm'],
 canary_user_ids=array['95000000-0000-4000-8000-000000000001']::uuid[], activation_watermark=now()-interval '1 second',
 worker_url='https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2' where singleton;
do $$ begin
 if private.request_bounded_native_notification_canary() is not null then raise exception 'Idle active scheduler requested HTTP'; end if;
 if public.acquire_native_notification_worker_v2('deliver') is not null then raise exception 'Idle active worker acquired lease'; end if;
end $$;

-- Isolate the actual V2 materializer from unrelated event delivery triggers.
alter table public.notification_events disable trigger user;
alter table public.notification_events enable trigger materialize_notification_envelope_v2_insert;
insert into public.notification_events(id,user_id,type,entity_id,payload,dedupe_key,category,created_at,presentation_expires_at) values
 ('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000001','dm_message','95000000-0000-4000-8000-000000000031','{}','native-canary-1','dm',now(),now()+interval '90 seconds'),
 ('95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000002','dm_message','95000000-0000-4000-8000-000000000032','{}','native-other-1','dm',now(),now()+interval '90 seconds'),
 ('95000000-0000-4000-8000-000000000013','95000000-0000-4000-8000-000000000001','dm_message','95000000-0000-4000-8000-000000000033','{}','native-old-1','dm',now()-interval '2 minutes',now()+interval '90 seconds'),
 ('95000000-0000-4000-8000-000000000014','95000000-0000-4000-8000-000000000001','group_message','95000000-0000-4000-8000-000000000034','{}','native-disabled-category','group',now(),now()+interval '90 seconds');

do $$ declare owner uuid; next_owner uuid; claim record; begin
 if (select count(*) from public.notification_outbox_v2 where user_id='95000000-0000-4000-8000-000000000001')<>1 then raise exception 'Old or disabled-category events projected'; end if;
 if exists(select 1 from public.notification_envelopes_v2 where event_id in ('95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000013','95000000-0000-4000-8000-000000000014')) then raise exception 'Projection escaped account/category/watermark gate'; end if;
 owner := public.acquire_native_notification_worker_v2('deliver');
 if owner is null then raise exception 'Eligible canary did not acquire lease'; end if;
 if public.acquire_native_notification_worker_v2('deliver') is not null then raise exception 'Concurrent worker stole singleton lease'; end if;
 if public.release_native_notification_worker_v2(gen_random_uuid()) then raise exception 'Wrong lease owner released singleton'; end if;
 select * into claim from public.claim_notification_outbox_v2(2,30);
 if claim.event_id is distinct from '95000000-0000-4000-8000-000000000011'::uuid then raise exception 'Wrong event claimed'; end if;
 if exists(select 1 from public.claim_notification_outbox_v2(2,30)) then raise exception 'Live outbox lease reclaimed'; end if;
 if (select max_attempts from public.notification_outbox_v2 where id=claim.outbox_id)<>3 then raise exception 'Retry ceiling not reduced to three'; end if;
 perform public.complete_notification_outbox_v2(claim.outbox_id,claim.lease_token,'pending',null,1);
 update public.notification_outbox_v2 set available_at=now(),attempt_count=3 where id=claim.outbox_id;
 if exists(select 1 from public.claim_notification_outbox_v2(2,30)) then raise exception 'Exhausted event claimed'; end if;
 if not public.release_native_notification_worker_v2(owner) then raise exception 'Lease owner could not release'; end if;
 raise notice 'PASS 17 bounded native canary idle, ACL, default-pause, projection, dedupe and retry assertions';
end $$;
rollback;

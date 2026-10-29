-- Run in one rolled-back LOCAL transaction after the September30 canary and
-- immediate-wake migrations. net.http_post is replaced transactionally; no
-- provider request, credentials, or real member fixtures are used.
create temporary table wake_http_calls (id bigserial primary key, task text, queued_at timestamptz default clock_timestamp());
create temporary table wake_http_mode (fail boolean not null);
insert into wake_http_mode values(false);
create or replace function net.http_post(url text,body jsonb default '{}'::jsonb,
 params jsonb default '{}'::jsonb,headers jsonb default '{"Content-Type":"application/json"}'::jsonb,
 timeout_milliseconds integer default 5000)
returns bigint language plpgsql as $$
declare result bigint;
begin
 if (select fail from pg_temp.wake_http_mode) then raise exception 'Synthetic HTTP enqueue failure'; end if;
 if url <> 'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'
  or body->>'action' <> 'bounded_canary' or body->>'task' not in('deliver','receipts')
  or timeout_milliseconds <> 9000 then raise exception 'Dispatch bounds changed'; end if;
 insert into pg_temp.wake_http_calls(task) values(body->>'task') returning id into result;
 return result;
end $$;
create function pg_temp.check_wake(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
select pg_temp.check_wake(not exists(select 1 from vault.secrets where name='shadowchat_notification_v2_worker_secret'),'No preexisting secret in LOCAL fixture');
select vault.create_secret(repeat('synthetic-fixture-',3),'shadowchat_notification_v2_worker_secret');
set local session_replication_role=replica;
insert into public.users(id,username,display_name) values('96000000-0000-4000-8000-000000000001','wake_fixture','Wake Fixture');
set local session_replication_role=origin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.notification_v2_runtime_config set delivery_mode='disabled',worker_invocation_enabled=false,
 receipt_reconciliation_enabled=false,all_users_enabled=false,enabled_categories='{}',canary_user_ids='{}' where singleton;
select pg_temp.check_wake(private.request_bounded_native_notification_canary() is null,'Disabled runtime does not queue');
select pg_temp.check_wake((select count(*)=0 from wake_http_calls),'Disabled HTTP count0');
select pg_temp.check_wake(not has_function_privilege('anon','private.request_native_notification_wake_v1(boolean)','execute')
 and not has_function_privilege('authenticated','private.request_native_notification_wake_v1(boolean)','execute')
 and not has_function_privilege('service_role','private.request_native_notification_wake_v1(boolean)','execute'),'Wake helper stays private');
select pg_temp.check_wake(not exists(select 1 from pg_trigger where tgrelid='public.notification_outbox_v2'::regclass
 and tgname='request_notification_delivery_v2_after_insert'),'Old collector trigger absent');
update public.notification_v2_runtime_config set delivery_mode='active',worker_invocation_enabled=true,
 receipt_reconciliation_enabled=true,all_users_enabled=false,enabled_categories=array['dm'],
 canary_user_ids=array['96000000-0000-4000-8000-000000000001']::uuid[],activation_watermark=now()-interval '1 second',
 worker_url='https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2' where singleton;
select pg_temp.check_wake(private.request_bounded_native_notification_canary() is null,'Active idle no HTTP');
alter table public.notification_events disable trigger user;
alter table public.notification_events enable trigger materialize_notification_envelope_v2_insert;
create function pg_temp.add_wake_event(suffix integer) returns void language plpgsql as $$
declare event_uuid uuid := ('96000000-0000-4000-8000-'||lpad(suffix::text,12,'0'))::uuid;
begin
 insert into public.notification_events(id,user_id,type,entity_id,payload,dedupe_key,category,created_at,presentation_expires_at)
 values(event_uuid,'96000000-0000-4000-8000-000000000001','dm_message',event_uuid,'{}','wake-'||suffix,'dm',clock_timestamp(),clock_timestamp()+interval '90 seconds');
end $$;
select pg_temp.add_wake_event(11);
select pg_temp.check_wake((select count(*)=1 from wake_http_calls),'Insert wakes immediately before cron');
select pg_temp.check_wake((select count(*)=1 from public.notification_outbox_v2 where user_id='96000000-0000-4000-8000-000000000001'),'Complete event/envelope visible to afterstatement wake');
do $$ declare owner uuid; before_count integer; i integer; begin
 owner:=public.acquire_native_notification_worker_v2('deliver');
 perform pg_temp.check_wake(owner is not null,'Worker acquired');
 perform pg_temp.add_wake_event(12);
 perform pg_temp.check_wake((select count(*)=1 from wake_http_calls),'Arrival duringlease coalesces without HTTP');
 perform pg_temp.check_wake(not public.release_native_notification_worker_v2(gen_random_uuid()),'Wrong owner cannot release/reschedule');
 perform pg_temp.check_wake((select lease_token=owner and invocation_reserved_until>now() from private.notification_native_worker_lease_v2),'Wrong owner preserves reservation');
 perform pg_temp.check_wake(public.release_native_notification_worker_v2(owner),'Owner releases');
 perform pg_temp.check_wake((select count(*)=2 from wake_http_calls),'Release wakes pending immediately despite30s reservation');
 -- Keep the synthetic pending row to exercise the continuation hard ceiling.
 for i in 1..4 loop
  owner:=public.acquire_native_notification_worker_v2('deliver');
  perform pg_temp.check_wake(owner is not null,'Successor can acquire');
  perform public.release_native_notification_worker_v2(owner);
 end loop;
 perform pg_temp.check_wake((select count(*)=5 from wake_http_calls),'Initial plusfour successors maximum without newwrite');
 perform pg_temp.check_wake(private.request_native_notification_wake_v1(true) is null,'Exhausted continuation stays idle');
 perform pg_temp.add_wake_event(13);
 perform pg_temp.check_wake((select count(*)=6 from wake_http_calls),'New message starts newburst without minutecooldown');
 owner:=public.acquire_native_notification_worker_v2('deliver');
 update public.notification_outbox_v2 set status='delivered' where user_id='96000000-0000-4000-8000-000000000001';
 perform public.release_native_notification_worker_v2(owner);
 perform pg_temp.check_wake((select count(*)=6 from wake_http_calls),'No idle continuation');
 perform pg_temp.check_wake((select invocation_reserved_until is null and lease_token is null from private.notification_native_worker_lease_v2),'Successful idle release clears reservation');
end $$;
-- Enqueue failure must retain event/outbox for cron, not fail a chat write.
update wake_http_mode set fail=true;
select pg_temp.add_wake_event(14);
select pg_temp.check_wake(exists(select 1 from public.notification_outbox_v2 where event_id='96000000-0000-4000-8000-000000000014'),'HTTP enqueue failure retains durableoutbox');
update wake_http_mode set fail=false;
select pg_temp.check_wake(private.request_bounded_native_notification_canary() is not null,'Cron recovers enqueuefailure');
-- A wrong deployment URL and broadened audience both failclosed.
update private.notification_native_worker_lease_v2 set invocation_reserved_until=null;
do $$ begin
 begin
  update public.notification_v2_runtime_config set worker_url='https://aaaaaaaaaaaaaaaaaaaa.supabase.co/functions/v1/deliver-notifications-v2' where singleton;
  raise exception 'Wrong URL unexpectedly accepted';
 exception when check_violation then null;
 end;
end $$;
update public.notification_v2_runtime_config set worker_url='https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2',all_users_enabled=true where singleton;
select pg_temp.check_wake(private.request_bounded_native_notification_canary() is null,'Broad audience blocked');
select 'PASS immediate wake, coalescing, ownership, bounded continuation, newarrival reset, idle, enqueuefailure, ACL and URL/runtime gates' as result;

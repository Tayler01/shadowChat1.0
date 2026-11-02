-- Owned schema-only LOCAL database only. Real native SQL functions, synthetic
-- members/tokens, transactional HTTP/Vault stubs; no provider or member traffic.
begin;
set local statement_timeout='45s';
select set_config('request.jwt.claims','{"role":"service_role"}',true);
create temporary table qa_metrics(name text primary key,value numeric not null);
insert into qa_metrics values('vault_reads',0),('provider_messages',0),('max_claim',0);
create temporary table qa_faults(enqueue_failure boolean not null default false);
insert into qa_faults default values;
alter table private.qa_native_http_calls add column processed boolean not null default false;
alter table vault.decrypted_secrets rename to fixture_secret;
create function pg_temp.read_fixture_secret() returns table(name text,decrypted_secret text,updated_at timestamptz)
language plpgsql as $$begin
 update qa_metrics set value=value+1 where qa_metrics.name='vault_reads';
 return query select s.name,s.decrypted_secret,s.updated_at from vault.fixture_secret s;
end$$;
create view vault.decrypted_secrets as select * from pg_temp.read_fixture_secret();
create or replace function net.http_post(url text,body jsonb default '{}'::jsonb,params jsonb default '{}'::jsonb,
 headers jsonb default '{}'::jsonb,timeout_milliseconds integer default 9000)returns bigint language plpgsql as $$
declare r bigint;begin
 if (select enqueue_failure from qa_faults) then raise exception 'Synthetic enqueue failure'; end if;
 if url<>'https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'
 or body->>'action'<>'bounded_canary' or body->>'task' not in('deliver','receipts')
 or timeout_milliseconds<>9000 then raise exception 'Dispatch boundary changed';end if;
 insert into private.qa_native_http_calls(task)values(body->>'task')returning id into r;return r;
end$$;
create function pg_temp.check_native(ok boolean,label text)returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;end$$;
create function pg_temp.member_id(n integer)returns uuid language sql immutable as $$
 select ('97000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.install_id(n integer)returns uuid language sql immutable as $$
 select ('98000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.event_id(n integer)returns uuid language sql immutable as $$
 select ('99000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;

create trigger materialize_native_test after insert on public.notification_events
 for each row execute function private.materialize_notification_envelope_v2();
create trigger guard_native_test before insert on public.notification_outbox_v2
 for each row execute function private.guard_notification_outbox_v2_insert();
create trigger wake_native_test after insert on public.notification_outbox_v2
 referencing new table as inserted_notification_outbox
 for each statement execute function private.wake_new_native_notification_outbox_v1();

insert into auth.users(id)select pg_temp.member_id(n)from generate_series(1,28)n;
insert into public.users(id,username,display_name)select pg_temp.member_id(n),'native_fixture_'||n,'Native fixture' from generate_series(1,28)n;
insert into public.notification_installations(id,user_id,installation_key,platform,app_id,environment,build_number,community_scope_version)
 select pg_temp.install_id(n),pg_temp.member_id(n),gen_random_uuid(),'ios','com.shadowchat.mobile','production','26',1 from generate_series(1,28)n;
insert into private.notification_installation_credentials(installation_id,user_id,credential_hash)
 select pg_temp.install_id(n),pg_temp.member_id(n),repeat(md5(n::text),2)from generate_series(1,28)n;
insert into private.notification_native_tokens(installation_id,user_id,provider,environment,token,token_hash)
 select pg_temp.install_id(n),pg_temp.member_id(n),'expo','production','ExponentPushToken[synthetic-'||n||']',repeat(md5(n::text),2)from generate_series(1,28)n;
-- Preserve legacy full-native authenticated registration; scoped enrollment is
-- still mandatory for scoped devices. Eight other identities fail closed.
update public.notification_installations set community_scope_version=null where user_id=pg_temp.member_id(20);
delete from private.notification_installation_credentials where user_id in(pg_temp.member_id(20),pg_temp.member_id(24));
delete from auth.users where id=pg_temp.member_id(21);
update auth.users set banned_until=now()+interval '1 day' where id=pg_temp.member_id(22);
insert into private.account_deletion_jobs values(pg_temp.member_id(23));
update public.notification_installations set revoked_at=now()where user_id=pg_temp.member_id(25);
update private.notification_native_tokens set enabled=false,disabled_at=now()where user_id=pg_temp.member_id(26);
delete from public.users where id=pg_temp.member_id(27);
update private.notification_native_tokens set token='not-a-valid-expo-push-token'where user_id=pg_temp.member_id(28);
select pg_temp.check_native((select count(*)=20 from generate_series(1,28)n where private.native_notification_recipient_eligible_v1(pg_temp.member_id(n))),'Exactly20 eligible including legacy full-native; missingAuth/banned/deleting/credential/revoked/token/profile/malformed denied');
select pg_temp.check_native(not has_function_privilege('anon','private.native_notification_recipient_eligible_v1(uuid)','execute')
 and not has_function_privilege('authenticated','public.claim_notification_outbox_v2(integer,integer)','execute'),'Private recipient authority and service-only claim ACLs');
select pg_temp.check_native((select audience_mode='canary' and delivery_mode='disabled' from public.notification_v2_runtime_config where singleton),'Migration defaults paused canary');
select pg_temp.check_native(not exists(select 1 from cron.job where active),'Migration never enables schedules');

create function pg_temp.add_event(number integer,member integer,kind text default 'group_message')returns void language plpgsql as $$begin
 insert into public.notification_events(id,user_id,type,entity_id,payload,dedupe_key,category,created_at,presentation_expires_at)
 values(pg_temp.event_id(number),pg_temp.member_id(member),kind,pg_temp.event_id(900),'{}','native-prod-'||number,
 case when kind='dm_message'then'dm'else'group'end,now(),now()+interval '2 hours');
end$$;
update public.notification_v2_runtime_config set delivery_mode='active',worker_invocation_enabled=true,
 receipt_reconciliation_enabled=true,all_users_enabled=false,enabled_categories=array['dm','general_chat'],
 canary_user_ids=(select array_agg(pg_temp.member_id(n))from generate_series(1,10)n),activation_watermark=now()-interval '1 second',
 worker_url='https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/deliver-notifications-v2'where singleton;
select pg_temp.add_event(1,1);select pg_temp.add_event(2,11);
select pg_temp.check_native((select count(*)=1 from public.notification_outbox_v2),'Canary10 keeps unnamed recipients out');
update public.notification_v2_runtime_config set canary_user_ids=(select array_agg(pg_temp.member_id(n))from generate_series(1,20)n)where singleton;
select pg_temp.add_event(3,1);
select pg_temp.check_native(not exists(select 1 from public.notification_outbox_v2 where event_id=pg_temp.event_id(3)),'Protected canary cap remains10, not20');
-- Reset only this owned fixture state before production workload.
truncate public.notification_delivery_targets_v2,public.notification_outbox_v2,public.notification_envelopes_v2,public.notification_events;
truncate private.qa_native_http_calls restart identity;
update private.notification_native_worker_lease_v2 set lease_token=null,lease_expires_at=null,invocation_reserved_until=null,wake_continuations_remaining=0,last_action=null;
update public.notification_v2_runtime_config set audience_mode='production',all_users_enabled=true,canary_user_ids='{}'where singleton;
-- Valid device A cannot accidentally authorize the same member's revoked-credential B.
insert into public.notification_installations(id,user_id,installation_key,platform,app_id,environment,build_number,community_scope_version)
 values(pg_temp.install_id(88),pg_temp.member_id(1),gen_random_uuid(),'ios','com.shadowchat.mobile','production','26',1);
insert into private.notification_native_tokens(installation_id,user_id,provider,environment,token,token_hash)
 values(pg_temp.install_id(88),pg_temp.member_id(1),'expo','production','ExponentPushToken[synthetic-revoked-device]',repeat(md5('device88'),2));
insert into private.notification_installation_credentials(installation_id,user_id,credential_hash,revoked_at)
 values(pg_temp.install_id(88),pg_temp.member_id(1),repeat(md5('credential88'),2),now());
select pg_temp.check_native((select count(*)=1 from public.list_notification_native_delivery_tokens_v2(
 pg_temp.member_id(1),array[pg_temp.install_id(1),pg_temp.install_id(88)],'production')),'Valid member does not authorize revoked scoped second device');
select pg_temp.check_native((select count(*)=1 from public.list_notification_native_delivery_tokens_v2(
 pg_temp.member_id(20),array[pg_temp.install_id(20)],'production')),'Legacy unscoped native token remains supported');
do $$begin
 begin perform public.claim_notification_outbox_v2(3,30);raise exception 'Batch3 was accepted';
 exception when raise_exception then if sqlerrm='Batch3 was accepted'then raise;end if;end;
 begin perform public.list_notification_native_delivery_tokens_v2(pg_temp.member_id(1),
  array[pg_temp.install_id(1),pg_temp.install_id(2),pg_temp.install_id(88)],'production');raise exception 'Token3 was accepted';
 exception when raise_exception then if sqlerrm='Token3 was accepted'then raise;end if;end;
end$$;
-- One canonical General source, twenty eligible recipient events in one statement.
do $$declare started timestamptz:=clock_timestamp();begin
 insert into public.notification_events(id,user_id,type,entity_id,payload,dedupe_key,category,created_at,presentation_expires_at)
 select pg_temp.event_id(100+n),pg_temp.member_id(n),'group_message',pg_temp.event_id(900),'{}','prod-group-'||n,'group',now(),now()+interval '2 hours'from generate_series(1,20)n;
 insert into qa_metrics values('fanout20_insert_ms',extract(epoch from clock_timestamp()-started)*1000);
end$$;
select pg_temp.check_native((select count(*)=20 from public.notification_outbox_v2),'All20 production recipients materialized simultaneously');
select pg_temp.check_native((select count(*)=1 from private.qa_native_http_calls),'Twenty-row fanout coalesces to one initial HTTP enqueue');
select pg_temp.add_event(201,21);select pg_temp.add_event(202,22);select pg_temp.add_event(203,23);
select pg_temp.add_event(204,24);select pg_temp.add_event(205,25);select pg_temp.add_event(206,26);select pg_temp.add_event(207,27);
select pg_temp.add_event(208,28);
select pg_temp.check_native((select count(*)=20 from public.notification_outbox_v2),'Ineligible recipients never project an outbox');

-- Simulated provider completion drives the REAL acquire/claim/lease/release/wake
-- functions. Actual Edge transport/retry/suppression contracts are Deno-tested.
create function pg_temp.process_next()returns boolean language plpgsql as $$
declare request record;owner uuid;claim record;target record;claimed integer:=0;begin
 select * into request from private.qa_native_http_calls where not processed order by id limit 1 for update;
 if not found then return false;end if;
 update private.qa_native_http_calls set processed=true where id=request.id;
 owner:=public.acquire_native_notification_worker_v2(request.task);
 if owner is null then return true;end if;
 if request.task='deliver'then
  for claim in select * from public.claim_notification_outbox_v2(2,30)loop
   claimed:=claimed+1;
   perform pg_temp.check_native(public.validate_notification_outbox_v2_lease(claim.outbox_id,claim.lease_token),'Production pre-provider recipient lease valid');
   insert into public.notification_delivery_targets_v2(outbox_id,event_id,installation_id,transport,status,attempt_count,provider_message_id,next_receipt_check_at,receipt_attempt_count,receipt_expires_at,last_status_code)
   select claim.outbox_id,claim.event_id,i.id,'expo','accepted',1,'synthetic-ticket-'||claim.event_id,now()+interval '15 minutes',0,now()+interval '6 hours',200
   from public.notification_installations i where i.user_id=claim.user_id and i.revoked_at is null limit 1
   on conflict(event_id,installation_id,transport)do nothing;
   update qa_metrics set value=value+1 where name='provider_messages';
   perform public.complete_notification_outbox_v2(claim.outbox_id,claim.lease_token,'accepted',null,1);
  end loop;
  update qa_metrics set value=greatest(value,claimed)where name='max_claim';
 else
  for target in select * from public.notification_delivery_targets_v2
   where transport='expo'and status='accepted'and next_receipt_check_at<=now()and receipt_attempt_count<3
   and created_at>=(select activation_watermark from public.notification_v2_runtime_config where singleton)
   order by next_receipt_check_at,created_at limit 5 for update loop
   update public.notification_delivery_targets_v2 set status='delivered',receipt_attempt_count=receipt_attempt_count+1,
    next_receipt_check_at=null,completed_at=now()where id=target.id;
   update public.notification_outbox_v2 set status='delivered',completed_at=now()where id=target.outbox_id;
  end loop;
 end if;
 perform public.release_native_notification_worker_v2(owner);return true;
end$$;
create function pg_temp.drain_burst()returns integer language plpgsql as $$declare n integer:=0;begin
 while pg_temp.process_next()loop n:=n+1;if n>5 then raise exception 'Burst exceeded five invocations';end if;end loop;return n;end$$;
do $$declare started timestamptz:=clock_timestamp();n integer;begin
 n:=pg_temp.drain_burst();perform pg_temp.check_native(n=5,'First production burst still exactlyfivecalls');
 perform pg_temp.check_native((select count(*)=10 from public.notification_outbox_v2 where status='pending'),'Ten remain after bounded first burst');
 insert into qa_metrics values('first10_dispatch_ms',extract(epoch from clock_timestamp()-started)*1000);
end$$;
-- Proposed ROOT-REVIEWED production recovery cadence, not an activated schedule.
update cron.job set schedule='10 seconds'where jobname='shadowchat-native-push-canary';
do $$declare started timestamptz:=clock_timestamp();begin
 perform pg_sleep(10); -- Actual next-tick delay, not a claimed instantaneous drain.
 perform private.request_bounded_native_notification_canary();
 perform pg_temp.check_native(pg_temp.drain_burst()=5,'Ten remaining drain at next bounded tick');
 insert into qa_metrics values('second10_with_recovery_wait_ms',extract(epoch from clock_timestamp()-started)*1000);
end$$;
select pg_temp.check_native((select count(*)=20 from public.notification_delivery_targets_v2 where status='accepted'),'All20 simultaneous recipients accepted aftertwo boundedbursts');
select pg_temp.check_native(not exists(select 1 from public.notification_outbox_v2 where status in('pending','processing')),'No production delivery backlog after second tick');
select pg_temp.check_native((select value=2 from qa_metrics where name='max_claim'),'SQL claims never exceedtwo');

-- Due receipts cannot starve behind new production traffic.
update public.notification_delivery_targets_v2 set next_receipt_check_at=now()-interval '1 second';
truncate private.qa_native_http_calls restart identity;
select pg_temp.add_event(301,1);select pg_temp.add_event(302,2);
select pg_temp.check_native((select task='receipts'from private.qa_native_http_calls where id=1),'Due receipts get first turn after previous delivery');
select pg_temp.check_native(pg_temp.drain_burst()=5,'Mixed receipt/delivery burst stays withinfivecalls');
select pg_temp.check_native((select task='deliver'from private.qa_native_http_calls where id=2),'New delivery follows receipt turn');
select pg_temp.check_native((select count(*)=20 from public.notification_delivery_targets_v2 where status='delivered'),'Twenty accepted receipts reconciled during mixed workload');
-- Newly sent two targets become due on a later tick, still bounded/no resend.
update public.notification_delivery_targets_v2 set next_receipt_check_at=now()-interval '1 second'where status='accepted';
do $$begin perform private.request_bounded_native_notification_canary();perform pg_temp.drain_burst();end$$;
select pg_temp.check_native((select count(*)=22 from public.notification_delivery_targets_v2 where status='delivered'),'New targets also reach terminal receipt state');

-- Enqueue failure retains durable eligible work for a later fresh recovery tick.
update qa_faults set enqueue_failure=true;
select pg_temp.add_event(401,1);
select pg_temp.check_native(exists(select 1 from public.notification_outbox_v2 where event_id=pg_temp.event_id(401)and status='pending'),'HTTP enqueue failure does not fail member event');
update qa_faults set enqueue_failure=false;
do $$begin perform private.request_bounded_native_notification_canary();perform pg_temp.drain_burst();end$$;
select pg_temp.check_native(exists(select 1 from public.notification_delivery_targets_v2 where event_id=pg_temp.event_id(401)and status='accepted'),'Recovery accepts durable failed-enqueue work');
-- Revoke after claim: final pre-provider validation must deny it.
select pg_temp.add_event(501,2);
do $$declare owner uuid;c record;begin
 owner:=public.acquire_native_notification_worker_v2('deliver');select * into c from public.claim_notification_outbox_v2(2,30);
 update auth.users set banned_until=now()+interval '1 day'where id=pg_temp.member_id(2);
 perform pg_temp.check_native(not public.validate_notification_outbox_v2_lease(c.outbox_id,c.lease_token),'Auth ban afterclaim blocks finalsend lease');
 perform public.complete_notification_outbox_v2(c.outbox_id,c.lease_token,'cancelled','Synthetic recipient revoked',1);
 perform public.release_native_notification_worker_v2(owner);
end$$;

-- Historical backlog and indexed idle checks: no replay, Vault or HTTP load.
update public.notification_delivery_targets_v2 set status='delivered',next_receipt_check_at=null where status='accepted';
update public.notification_outbox_v2 set status='delivered'where status='accepted';
update private.notification_native_worker_lease_v2 set lease_token=null,lease_expires_at=null,invocation_reserved_until=null;
-- Foreign-environment accepted receipts cannot make the production SQL scheduler
-- repeatedly wake a worker whose receipt query correctly filters production.
insert into public.notification_installations(id,user_id,installation_key,platform,app_id,environment)
 values(pg_temp.install_id(99),pg_temp.member_id(1),gen_random_uuid(),'ios','fixture.preview','preview');
insert into public.notification_delivery_targets_v2(outbox_id,event_id,installation_id,transport,status,
 attempt_count,provider_message_id,next_receipt_check_at,receipt_expires_at)
 select o.id,o.event_id,pg_temp.install_id(99),'expo','accepted',1,'synthetic-foreign-ticket',
 now()-interval '1 second',now()+interval '6 hours'from public.notification_outbox_v2 o where o.event_id=pg_temp.event_id(101);
select pg_temp.check_native(public.acquire_native_notification_worker_v2('receipts')is null,'Foreign environment receipt never acquires production lease');
select pg_temp.check_native(private.request_bounded_native_notification_canary()is null,'Foreign environment receipt never wakes production worker');
alter table public.notification_outbox_v2 disable trigger user;
insert into public.notification_outbox_v2(event_id,user_id,delivery_mode,status,created_at,expires_at)
 select gen_random_uuid(),pg_temp.member_id(1),'active','pending',now()-interval '2 days',now()+interval '1 hour'from generate_series(1,10000);
alter table public.notification_outbox_v2 enable trigger user;
analyze public.notification_outbox_v2;
do $$declare started timestamptz:=clock_timestamp();v numeric;h bigint;i integer;begin
 select value into v from qa_metrics where name='vault_reads';select count(*)into h from private.qa_native_http_calls;
 for i in 1..1000 loop perform pg_temp.check_native(private.request_bounded_native_notification_canary()is null,'Idle/historical-onlytick returns beforeHTTP');end loop;
 insert into qa_metrics values('idle1000_with10000_historical_ms',extract(epoch from clock_timestamp()-started)*1000);
 perform pg_temp.check_native((select value=v from qa_metrics where name='vault_reads'),'Idle neverreadsVault');
 perform pg_temp.check_native((select count(*)=h from private.qa_native_http_calls),'Idle neverqueuesHTTP');
end$$;
select pg_temp.check_native(not exists(select 1 from cron.job where active),'No actual scheduler enabled by tests');
select jsonb_object_agg(name,value)as native_production_metrics from qa_metrics;
explain(analyze,buffers,costs off)
 select id from public.notification_outbox_v2 where delivery_mode='active'and status in('pending','processing')
 and attempt_count<3 and created_at>=now()-interval '1 second'and available_at<=now()order by created_at,available_at,id limit 2;
select 'PASS production20 fanout;2x5-call bursts/10s recovery;receipt fairness;eligibility;revocation;no-replay/idle' result;
rollback;

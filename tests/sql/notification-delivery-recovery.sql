-- Dedicated isolated local database only. No provider calls; every fixture rolls back.
begin;
set local session_replication_role = replica;
insert into public.users(id,username,display_name) values ('94000000-0000-4000-8000-000000000001','delivery_fixture','Delivery Fixture');
insert into public.push_subscriptions(id,user_id,endpoint,p256dh,auth) values
 ('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000001','https://example.invalid/a','test','test'),
 ('94000000-0000-4000-8000-000000000012','94000000-0000-4000-8000-000000000001','https://example.invalid/b','test','test');
insert into public.dm_conversations(id,participants) values ('94000000-0000-4000-8000-000000000041',array['94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002']::uuid[]);
insert into public.dm_messages(id,conversation_id,sender_id,content) values ('94000000-0000-4000-8000-000000000031','94000000-0000-4000-8000-000000000041','94000000-0000-4000-8000-000000000001','Synthetic lease test');
insert into public.notification_events(id,user_id,type,entity_id,dm_message_id,conversation_id,payload,dedupe_key,category,presentation_expires_at) values
 ('94000000-0000-4000-8000-000000000021','94000000-0000-4000-8000-000000000001','reaction','94000000-0000-4000-8000-000000000031','94000000-0000-4000-8000-000000000031','94000000-0000-4000-8000-000000000041','{}','notification-lease-fixture','interactions',now()+interval '5 minutes');
insert into public.notification_delivery_jobs(notification_event_id,user_id,available_at,expires_at) values ('94000000-0000-4000-8000-000000000021','94000000-0000-4000-8000-000000000001',now(),now()+interval '5 minutes');
set local session_replication_role = origin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$ declare ids uuid[]; result record; begin
 ids := public.claim_notification_delivery_targets('94000000-0000-4000-8000-000000000021',array['94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000012']::uuid[],'94000000-0000-4000-8000-000000000051');
 if cardinality(ids)<>2 then raise exception 'Expected two initial device leases'; end if;
 ids := public.claim_notification_delivery_targets('94000000-0000-4000-8000-000000000021',array['94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000012']::uuid[],'94000000-0000-4000-8000-000000000052');
 if cardinality(ids)<>0 then raise exception 'Concurrent worker stole active device lease'; end if;
 perform public.complete_notification_delivery_targets('94000000-0000-4000-8000-000000000021','94000000-0000-4000-8000-000000000051','[{"subscription_id":"94000000-0000-4000-8000-000000000011","status":"delivered","response_status":201},{"subscription_id":"94000000-0000-4000-8000-000000000012","status":"pending","response_status":503}]');
 update public.notification_events set sent_at=now() where id='94000000-0000-4000-8000-000000000021';
 if (select status from public.notification_delivery_jobs where notification_event_id='94000000-0000-4000-8000-000000000021')<>'pending' then raise exception 'Partial success lost pending device'; end if;
 update private.notification_delivery_recovery_runtime set lease_until=now()-interval '1 second';
 select * into result from public.claim_notification_delivery_jobs(10) where notification_event_id='94000000-0000-4000-8000-000000000021';
 if result.job_id is null then raise exception 'Recovery excluded partially sent event'; end if;
 if result.payload->>'is_dm'<>'true' or result.payload->>'conversation_id'<>'94000000-0000-4000-8000-000000000041' or result.payload->>'message_id'<>'94000000-0000-4000-8000-000000000031' then raise exception 'Canonical DM reaction routing lost'; end if;
 update public.push_subscriptions set enabled=false where id='94000000-0000-4000-8000-000000000012';
 ids := public.claim_notification_delivery_targets('94000000-0000-4000-8000-000000000021',array['94000000-0000-4000-8000-000000000012']::uuid[],'94000000-0000-4000-8000-000000000052');
 if cardinality(ids)<>0 then raise exception 'Leased disabled device'; end if;
 update public.push_subscriptions set enabled=true where id='94000000-0000-4000-8000-000000000012';
 ids := public.claim_notification_delivery_targets('94000000-0000-4000-8000-000000000021',array['94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000012']::uuid[],'94000000-0000-4000-8000-000000000052');
 if ids<>array['94000000-0000-4000-8000-000000000012']::uuid[] then raise exception 'Recovery replayed successful endpoint'; end if;
 update public.notification_events set read_at=now() where id='94000000-0000-4000-8000-000000000021';
 perform public.complete_notification_delivery_targets('94000000-0000-4000-8000-000000000021','94000000-0000-4000-8000-000000000052','[{"subscription_id":"94000000-0000-4000-8000-000000000012","status":"delivered","response_status":201}]');
 if (select status from public.notification_delivery_targets where subscription_id='94000000-0000-4000-8000-000000000012')<>'failed' then raise exception 'Late worker resurrected read event'; end if;
 if has_function_privilege('authenticated','public.claim_notification_delivery_targets(uuid,uuid[],uuid)','execute') or has_function_privilege('anon','public.complete_notification_delivery_targets(uuid,uuid,jsonb)','execute') then raise exception 'Service-only endpoint RPC leaked'; end if;
 if private.request_web_push_recovery() is not null then raise exception 'Empty queue generated HTTP'; end if;
 raise notice 'PASS 10 notification device lease/recovery/security/idle assertions';
end $$;
rollback;


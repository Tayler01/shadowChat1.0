/*
  # Enable bounded Web Push recovery through Supabase Cron

  Invokes the already-bounded send-push recovery action once per minute using
  an encrypted Vault credential. This does not reactivate any legacy recovery,
  native/TestFlight delivery, receipt reconciliation, or response collector.
  pg_net removes response rows after its configured TTL; application SQL never
  scans or joins net._http_response.
*/

begin;

create or replace function private.request_web_push_recovery()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovery_url text;
  recovery_secret text;
  request_id bigint;
begin
  select secrets.decrypted_secret
  into recovery_url
  from vault.decrypted_secrets secrets
  where secrets.name = 'shadowchat_web_push_recovery_url'
  order by secrets.updated_at desc
  limit 1;

  select secrets.decrypted_secret
  into recovery_secret
  from vault.decrypted_secrets secrets
  where secrets.name = 'shadowchat_web_push_recovery_secret'
  order by secrets.updated_at desc
  limit 1;

  if recovery_url is null
    or recovery_url !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/send-push$'
    or recovery_secret is null
    or length(recovery_secret) < 32 then
    return null;
  end if;

  select net.http_post(
    url := recovery_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-shadowchat-recovery-secret', recovery_secret
    ),
    body := jsonb_build_object('type', 'notification_delivery_recovery'),
    timeout_milliseconds := 25000
  )
  into request_id;

  return request_id;
end;
$$;

revoke all on function private.request_web_push_recovery()
  from public, anon, authenticated, service_role;

do $schedule_web_push_recovery$
declare
  existing_job_id bigint;
begin
  for existing_job_id in
    select jobs.jobid
    from cron.job jobs
    where jobs.jobname = 'shadowchat-web-push-recovery'
  loop
    perform cron.unschedule(existing_job_id);
  end loop;

  perform cron.schedule(
    'shadowchat-web-push-recovery',
    '* * * * *',
    $command$select private.request_web_push_recovery();$command$
  );
end
$schedule_web_push_recovery$;

commit;

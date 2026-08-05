/*
  # Pause notification delivery workers after production contention

  Chat, auth, recipient-owned notification events, unread state, and Realtime
  remain active. Only background push-delivery work is parked until the worker
  and response-collector paths can be requalified under production load.
*/

begin;

do $pause_notification_cron$
declare
  target_job_id bigint;
begin
  for target_job_id in
    select jobs.jobid
    from cron.job jobs
    where jobs.jobname in (
      'notification-delivery-recovery',
      'shadowchat-notification-v2-delivery-recovery',
      'shadowchat-notification-v2-receipts',
      'shadowchat-notification-v2-worker-response-collector'
    )
  loop
    perform cron.alter_job(job_id := target_job_id, active := false);
  end loop;
end
$pause_notification_cron$;

update public.notification_v2_runtime_config runtime
set
  delivery_mode = 'disabled',
  enabled_categories = '{}'::text[],
  canary_user_ids = '{}'::uuid[],
  all_users_enabled = false,
  worker_invocation_enabled = false,
  receipt_reconciliation_enabled = false,
  worker_url = null,
  worker_probe_url = null,
  last_worker_error = 'Paused after 2026-08-04 production database contention',
  updated_at = now()
where runtime.singleton = true;

commit;

-- Read-only evidence after explicitly enabling the reviewed scheduler. Cron
-- success means HTTP was queued; the worker's aggregate completion timestamps
-- and a synthetic bounded-drain test establish end-to-end operation.
begin transaction read only;
select jsonb_build_object(
  'worker', public.get_legacy_account_deletion_reconciliation_status(),
  'schedule', (select coalesce(jsonb_agg(jsonb_build_object(
    'active', j.active, 'schedule', j.schedule,
    'expected_command', j.command = 'select private.request_legacy_account_deletion_reconciliation();'
  )), '[]'::jsonb) from cron.job j where j.jobname = 'shadowchat-legacy-account-deletion'),
  'browser_dispatch_allowed', has_function_privilege('anon', 'private.request_legacy_account_deletion_reconciliation()', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.request_legacy_account_deletion_reconciliation()', 'EXECUTE'),
  'bound_project_ref', (select project_ref from private.legacy_account_deletion_dispatch_config where singleton),
  'recent_schedule_runs', (select coalesce(jsonb_agg(r), '[]'::jsonb) from (
    select d.status, d.start_time, d.end_time
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'shadowchat-legacy-account-deletion'
    order by d.start_time desc limit 3
  ) r)
) as reconciliation;
rollback;

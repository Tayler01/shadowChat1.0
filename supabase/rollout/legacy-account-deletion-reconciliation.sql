-- EXPLICIT OPERATIONS STEP. Never include this file in migration auto-apply.
-- Isolated acceptance PASSED on 2026-10-23: actual Cron/pg_net completed both
-- a held legacy deletion and an already-authorized job after synthetic Auth404,
-- each in one worker attempt. Evidence: output/privacy/streamlined-staged/
-- scheduler-proof.json and the two referenced fixtures/scheduler-readback.json.
-- Teardown verified zero fixture Auth/Storage/jobs/aliases/leases, active Cron,
-- Vault secrets, dispatch targets and queued requests; dispatcher stayed dormant.
-- This proves the isolated worker path. Production scheduling remains a separate
-- reviewed step after the current main release and its compatibility gates pass.
-- Run only after the replacement delete-account endpoint, an isolated hosted
-- reconciliation test, and current production deletion preparation pass.
-- Provision these dedicated Vault entries through the approved secret channel:
--   shadowchat_legacy_deletion_reconcile_url
--   shadowchat_legacy_deletion_service_role_key
-- They must belong to THIS project. Branch tests must use branch-only values;
-- disable inherited outgoing jobs before creating any branch fixtures.
-- Set session readiness/target immediately before this reviewed transaction:
--   shadowchat.legacy_deletion_readiness = verified
--   shadowchat.legacy_deletion_project_ref = the exact selected project ref
--   shadowchat.legacy_deletion_credential_sha256 = SHA-256 of the exact reviewed
--     default secret API key returned for that project by the trusted key lookup
-- Opaque secret keys do not encode their project. Verify that lookup first;
-- pin its fingerprint independently of the Vault value. Never print the key.
-- Supabase CLI masks modern API keys unless --reveal is explicitly supplied:
--   supabase projects api-keys --project-ref <selected-ref> --reveal --output json
-- Capture that command's output only in trusted process memory, select the
-- default secret for the exact project, and provision Vault without logs/files.
-- This schedules completion of already-authorized legacy jobs only. It does
-- not initiate deletion, prune receipts, purge evidence or change Auth config.
begin;

do $readiness$
declare
  project_ref text := current_setting('shadowchat.legacy_deletion_project_ref', true);
  reviewed_key_sha256 text := current_setting('shadowchat.legacy_deletion_credential_sha256', true);
  configured_url text;
  configured_key text;
  payload_segment text;
  key_claims jsonb;
begin
  if coalesce(current_setting('shadowchat.legacy_deletion_readiness', true), '') <> 'verified'
    or project_ref is null or project_ref !~ '^[a-z]{20}$'
    or reviewed_key_sha256 is null or reviewed_key_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Verified legacy deletion integration and an exact project target are required';
  end if;
  if to_regnamespace('cron') is null or to_regnamespace('net') is null or to_regnamespace('vault') is null then
    raise exception 'Cron, pg_net and Vault are required';
  end if;
  if to_regprocedure('public.claim_legacy_account_deletion_job(uuid)') is null
    or to_regprocedure('public.finish_legacy_account_deletion_attempt(uuid,uuid,boolean)') is null
    or to_regprocedure('public.get_legacy_account_deletion_reconciliation_status()') is null then
    raise exception 'The bounded legacy reconciliation foundation is missing';
  end if;
  if not exists(select 1 from pg_proc p where p.oid = to_regprocedure('private.request_legacy_account_deletion_reconciliation()')
    and p.prosecdef and p.proconfig @> array['search_path=""']
    and encode(sha256(convert_to(replace(p.prosrc, E'\r\n', E'\n'), 'UTF8')), 'hex') = '75ea497eb0c4db70226a291e3fb5b764d8cb761b4e068b0f596e05c38adbfc73') then
    raise exception 'The reviewed dormant reconciliation dispatcher is missing or changed';
  end if;
  if has_function_privilege('anon', 'private.request_legacy_account_deletion_reconciliation()', 'EXECUTE')
    or has_function_privilege('authenticated', 'private.request_legacy_account_deletion_reconciliation()', 'EXECUTE')
    or has_function_privilege('service_role', 'private.request_legacy_account_deletion_reconciliation()', 'EXECUTE') then
    raise exception 'The reconciliation dispatcher has unexpected execution grants';
  end if;
  if not exists(select 1 from pg_class c
    where c.oid = to_regclass('private.legacy_account_deletion_dispatch_config') and c.relrowsecurity) then
    raise exception 'The owner-only reconciliation target configuration is missing';
  end if;
  if has_table_privilege('anon', 'private.legacy_account_deletion_dispatch_config', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('authenticated', 'private.legacy_account_deletion_dispatch_config', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    or has_table_privilege('service_role', 'private.legacy_account_deletion_dispatch_config', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'The reconciliation target configuration has unexpected grants';
  end if;
  if exists(select 1 from private.legacy_account_deletion_dispatch_config configured
    where configured.singleton and configured.project_ref is not null
      and configured.project_ref <> current_setting('shadowchat.legacy_deletion_project_ref')) then
    raise exception 'The reconciliation dispatcher is already bound to another project';
  end if;
  if (select count(*) from vault.decrypted_secrets where name = 'shadowchat_legacy_deletion_reconcile_url') <> 1
    or (select count(*) from vault.decrypted_secrets where name = 'shadowchat_legacy_deletion_service_role_key') <> 1 then
    raise exception 'Exactly one dedicated reconciliation URL and service credential must be configured';
  end if;
  select decrypted_secret into configured_url from vault.decrypted_secrets
    where name = 'shadowchat_legacy_deletion_reconcile_url';
  if configured_url is distinct from 'https://' || project_ref || '.supabase.co/functions/v1/delete-account' then
    raise exception 'The dedicated reconciliation URL differs from the selected project';
  end if;
  select decrypted_secret into configured_key from vault.decrypted_secrets
    where name = 'shadowchat_legacy_deletion_service_role_key';
  if left(configured_key, 10) = 'sb_secret_'
    and (strpos(configured_key, '...') > 0 or strpos(configured_key, U&'\2026') > 0) then
    raise exception 'A masked API key cannot be used; repeat the trusted project key lookup with --reveal';
  end if;
  if configured_key is null
    or encode(sha256(convert_to(configured_key, 'UTF8')), 'hex') is distinct from reviewed_key_sha256 then
    raise exception 'The service credential differs from the independently reviewed fingerprint';
  end if;
  if configured_key ~ '^sb_secret_[A-Za-z0-9_-]+$' and length(configured_key) between 30 and 266 then
    null; -- Exact project provenance came from the reviewed key lookup above.
  elsif configured_key ~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' then
    begin
      payload_segment := split_part(configured_key, '.', 2);
      key_claims := convert_from(decode(translate(payload_segment, '-_', '+/')
        || repeat('=', (4 - length(payload_segment) % 4) % 4), 'base64'), 'UTF8')::jsonb;
    exception when others then
      raise exception 'The reconciliation service credential is invalid';
    end;
    if key_claims->>'role' is distinct from 'service_role'
      or key_claims->>'ref' is distinct from project_ref then
      raise exception 'The reconciliation service credential differs from the selected project or role';
    end if;
  else
    raise exception 'The reconciliation service credential is invalid';
  end if;
  if exists(select 1 from cron.job where jobname = 'shadowchat-legacy-account-deletion'
    and command <> 'select private.request_legacy_account_deletion_reconciliation();') then
    raise exception 'The reconciliation schedule name belongs to a different command';
  end if;
end;
$readiness$;

insert into private.legacy_account_deletion_dispatch_config(singleton, project_ref, credential_sha256)
values (true, current_setting('shadowchat.legacy_deletion_project_ref'), current_setting('shadowchat.legacy_deletion_credential_sha256'))
on conflict(singleton) do update set project_ref = excluded.project_ref, credential_sha256 = excluded.credential_sha256, updated_at = now();

select cron.schedule('shadowchat-legacy-account-deletion', '* * * * *',
  'select private.request_legacy_account_deletion_reconciliation();');
commit;

-- A successful Cron HTTP queue is not proof of cleanup. Verify the aggregate
-- get_legacy_account_deletion_reconciliation_status() after a synthetic held
-- job is released, and retain the exact worker/drain result before closeout.

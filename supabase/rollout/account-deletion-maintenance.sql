-- Run separately only after deletion RPC/Edge/client integration is verified.
-- This removes minimal COMPLETED receipts, never pending cleanup or evidence.
-- Authorization expires at 24h; hourly physical pruning bounds it to 25h.
do $$ begin
  if coalesce(current_setting('shadowchat.account_deletion_readiness',true),'') <> 'verified' then
    raise exception 'Verify deletion integration before scheduling receipt cleanup';
  end if;
  if to_regnamespace('cron') is null then raise exception 'pg_cron is required for hourly receipt cleanup'; end if;
end; $$;
select cron.schedule('account-deletion-receipt-prune','17 * * * *','select public.prune_account_deletion_receipts()');

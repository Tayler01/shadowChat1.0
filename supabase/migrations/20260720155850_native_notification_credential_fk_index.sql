begin;

create index if not exists notification_installation_credentials_owner_idx
  on private.notification_installation_credentials (installation_id, user_id);

commit;

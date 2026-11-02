-- Complete account deletion must not retain departed public-profile/media
-- snapshots in other members' notification inboxes. No remote backfill, provider
-- operation or restricted moderation-record deletion is performed here.
begin;

create or replace function public.erase_account_data(target_user_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare job private.account_deletion_jobs%rowtype;
begin
  select * into strict job from private.account_deletion_jobs where user_id = target_user_id for update;
  if job.state in ('data_removed','completed') then return; end if;
  if job.state <> 'storage_removed' then raise exception 'Storage cleanup must finish before removing content'; end if;
  perform set_config('shadowchat.account_deletion_user', target_user_id::text, true);
  delete from private.bunny_upload_reservations where owner_id=target_user_id;

  delete from public.user_channel_bans b where b.target_user_id = erase_account_data.target_user_id
    and not exists(select 1 from public.moderation_action_channel_bans a where a.channel_ban_id = b.id);

  -- Notification payloads are delivery copies, not retained safety evidence.
  -- Remove departed-actor snapshots and notices about Pins being erased before
  -- canonical owner references disappear. Keep unrelated recipients' activity.
  delete from public.notification_events event
  where event.user_id = target_user_id
    or event.actor_id = target_user_id
    or event.payload->'actor'->>'id' = target_user_id::text
    or (left(event.type, 11) = 'shadow_pin_' and exists (
      select 1 from public.shadow_pin_images pin
      where pin.creator_id = target_user_id
        and (event.entity_id = pin.id or event.payload->>'image_id' = pin.id::text)
    ));

  -- Remove authored content explicitly: their old owner FKs were SET NULL.
  delete from public.shadow_pin_images where creator_id = target_user_id;
  -- Preserve other authors' Pins in a shared category, replacing the departing
  -- owner's cover and text with one surviving Pin. Keep its hidden state.
  update public.shadow_pin_categories c set title = 'Shared Pins', description = null,
    image_url = replacement.image_url, image_path = replacement.image_path,
    thumbnail_url = replacement.thumbnail_url, thumbnail_path = replacement.thumbnail_path,
    medium_url = replacement.medium_url, medium_path = replacement.medium_path
  from (select distinct on (category_id) category_id, image_url, image_path, thumbnail_url, thumbnail_path, medium_url, medium_path
    from public.shadow_pin_images where category_id is not null and creator_id is distinct from target_user_id order by category_id, created_at desc, id) replacement
  where c.creator_id = target_user_id and c.id = replacement.category_id;
  delete from public.shadow_pin_categories c where c.creator_id = target_user_id
    and not exists(select 1 from public.shadow_pin_images i where i.category_id = c.id);
  delete from public.shado_tv_videos where created_by = target_user_id;
  -- A caption contributed to a different member's video stays unless its file
  -- was itself in this member's removed upload prefix; never leave a broken row.
  delete from public.shado_tv_captions where created_by = target_user_id
    and split_part(storage_path, '/', 1) = target_user_id::text;
  update public.shado_tv_channels set title = 'Community channel', slug = 'community-' || id::text,
    tagline = null, description = null, ticket_asset_url = null, hero_asset_url = null,
    ticket_asset_path = null, hero_asset_path = null where created_by = target_user_id;

  delete from public.live_room_events e where e.actor_user_id = erase_account_data.target_user_id or e.target_user_id = erase_account_data.target_user_id;
  delete from public.live_provider_webhook_receipts where participant_user_id = target_user_id or participant_identity = target_user_id::text;
  delete from public.live_provider_operations o where o.actor_user_id = erase_account_data.target_user_id or o.target_user_id = erase_account_data.target_user_id
    or exists(select 1 from public.live_rooms r where r.id = o.room_id and r.host_user_id = erase_account_data.target_user_id);
  update public.live_rooms set title = 'Ended room', description = '', status = 'ended', ended_at = coalesce(ended_at, now()),
    host_disconnected_at = null, host_grace_expires_at = null, ended_reason = 'Account deleted', revision = revision + 1, updated_at = now()
    where host_user_id = target_user_id;
  -- Existing CASCADE FKs remove messages, DMs, drafts, comments, connections,
  -- preferences, device tokens and per-member state when Auth deletes the user.
  -- Submitted reports/evidence remain in the restricted safety-case domain.
  update private.account_deletion_jobs set state = 'data_removed', updated_at = now() where user_id = target_user_id;
end;
$$;

revoke all on function public.erase_account_data(uuid) from public,anon,authenticated;
grant execute on function public.erase_account_data(uuid) to service_role;
commit;

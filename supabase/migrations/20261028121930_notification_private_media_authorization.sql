-- Delivery-only media authorization. Never impersonate a recipient session or
-- treat caller-writable URLs as authority to sign private Storage/Bunny objects.
begin;

create function public.get_notification_pin_media_for_service(target_event_id uuid, target_user_id uuid, target_image_id uuid)
returns table(id uuid, creator_id uuid, title text, thumbnail_url text, image_content_type text, provider text, provider_asset_id text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.creator_id, p.title,
    coalesce(p.thumbnail_url,p.medium_url,p.image_url),p.image_content_type,p.provider,p.provider_asset_id
  from public.notification_events e
  join public.notification_preferences preferences on preferences.user_id=e.user_id
  join public.shadow_pin_images p on p.id=coalesce(target_image_id,
    case when e.type='shadow_pin_post' then e.entity_id
      when e.type in ('shadow_pin_comment','shadow_pin_reply') then
        (select comment.image_id from public.shadow_pin_comments comment where comment.id=e.entity_id)
      else null end)
  join public.shadow_pin_categories c on c.id=p.category_id
  where current_user='service_role'
    and e.id=target_event_id and e.user_id=target_user_id
    and e.read_at is null and e.resolved_at is null
    and preferences.notifications_enabled is true
    and case e.type
      when 'shadow_pin_post' then coalesce(preferences.shadow_pin_new_post_enabled,true)
      when 'shadow_pin_comment' then coalesce(preferences.shadow_pin_comment_enabled,true)
      when 'shadow_pin_reply' then coalesce(preferences.shadow_pin_reply_enabled,true)
      else false end
    and public.is_active_member_for_service(target_user_id)
    and public.is_active_member_for_service(p.creator_id)
    and (e.actor_id is null or public.is_active_member_for_service(e.actor_id))
    and p.deleted_at is null and c.deleted_at is null
    and (p.media_type='image' or p.processing_status='ready' or p.creator_id=target_user_id or public.is_app_operator(target_user_id))
    and (
      (e.type='shadow_pin_post' and e.entity_id=p.id)
      or (e.type in ('shadow_pin_comment','shadow_pin_reply') and exists (
        select 1 from public.shadow_pin_comments comment
        where comment.id=e.entity_id and comment.image_id=p.id
          and public.is_active_member_for_service(comment.author_id)
          and not exists (select 1 from public.user_blocks b
            where (b.blocker_id=target_user_id and b.blocked_id=comment.author_id)
              or (b.blocked_id=target_user_id and b.blocker_id=comment.author_id))
      ))
    )
    and not exists (select 1 from public.user_blocks b
      where (b.blocker_id=target_user_id and b.blocked_id in (p.creator_id,c.creator_id,e.actor_id))
         or (b.blocked_id=target_user_id and b.blocker_id in (p.creator_id,c.creator_id,e.actor_id)));
$$;

revoke all on function public.get_notification_pin_media_for_service(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_notification_pin_media_for_service(uuid,uuid,uuid) to service_role;
comment on function public.get_notification_pin_media_for_service(uuid,uuid,uuid) is
  'Service-only fresh recipient/event/preference/Pin visibility check. Returned canonical references still require owner-path or Bunny registry provenance before delivery-only signing.';

commit;

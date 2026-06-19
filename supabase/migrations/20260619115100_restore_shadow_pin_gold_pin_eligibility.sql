/*
  # Restore Shadow Pin gold pin eligibility

  The primary admin can still contribute ShadowPin content and remain in the
  private score ledger, but the one-user rotating gold pin must be awarded to
  the highest-scoring non-admin user.
*/

create or replace function private.refresh_shadow_pin_scores()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  champion_id uuid;
begin
  delete from private.shadow_pin_scores
  where user_id is not null;

  insert into private.shadow_pin_scores (
    user_id,
    image_count,
    received_like_count,
    image_points,
    like_points,
    total_score,
    last_scored_at,
    updated_at
  )
  select
    images.creator_id as user_id,
    count(distinct images.id)::integer as image_count,
    count(hearts.user_id)::integer as received_like_count,
    count(distinct images.id)::integer as image_points,
    (count(hearts.user_id)::integer * 2) as like_points,
    (count(distinct images.id)::integer + (count(hearts.user_id)::integer * 2)) as total_score,
    max(greatest(images.created_at, coalesce(hearts.created_at, images.created_at))) as last_scored_at,
    now() as updated_at
  from public.shadow_pin_images images
  left join public.shadow_pin_image_hearts hearts
    on hearts.image_id = images.id
   and hearts.user_id is distinct from images.creator_id
  where images.creator_id is not null
    and images.deleted_at is null
    and images.category_id is not null
    and (
      images.media_type = 'image'
      or images.processing_status = 'ready'
    )
  group by images.creator_id
  having count(distinct images.id) > 0;

  select scores.user_id
  into champion_id
  from private.shadow_pin_scores scores
  join public.users users
    on users.id = scores.user_id
   and users.admin_role is distinct from 'admin'
  where scores.total_score > 0
  order by
    scores.total_score desc,
    scores.received_like_count desc,
    scores.image_count desc,
    scores.last_scored_at desc nulls last,
    scores.user_id asc
  limit 1;

  update public.users users
  set shadow_pin_gold_pin = (champion_id is not null and users.id = champion_id)
  where users.shadow_pin_gold_pin is distinct from (champion_id is not null and users.id = champion_id);
end;
$$;

revoke all on function private.refresh_shadow_pin_scores() from public, anon, authenticated;

select private.refresh_shadow_pin_scores();

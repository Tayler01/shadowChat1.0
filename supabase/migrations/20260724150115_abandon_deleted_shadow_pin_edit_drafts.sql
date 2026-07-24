/*
  Close stale Creator Studio edit receipts whose canonical target Pin was
  soft-deleted. The web client also filters unavailable targets so this
  one-time cleanup does not need a cross-row delete trigger on the hot Pin path.
*/

begin;

update public.shadow_pin_creator_drafts draft
set
  state = 'abandoned',
  expires_at = least(draft.expires_at, now()),
  promotion_lease_token = null,
  promotion_lease_expires_at = null,
  promotion_asset_id = null,
  last_error_code = null,
  last_error_message = null
from public.shadow_pin_images image
where image.id = draft.target_image_id
  and image.deleted_at is not null
  and draft.state not in ('published', 'abandoned');

commit;

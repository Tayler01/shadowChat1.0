# ShadowPin

ShadowPin is a logged-in public image board inside the existing Boards system. It adds a `Shadow Pin` static board node that opens a mobile-first category grid and per-category image masonry view.

## V1 Scope

- Public categories for authenticated users.
- Public image pins inside categories.
- Device upload or server-side URL import for category covers and image pins.
- One heart per user per category or image.
- Creator/operator edit and soft delete controls.
- No realtime, notifications, comments, tags, search, or filters.

## Data Model

Migration: `supabase/migrations/20260512203054_shadow_pin_domain.sql`

- `shadow_pin_categories`: category metadata, cover asset, soft delete fields, heart count.
- `shadow_pin_images`: pin metadata, image asset, optional `category_id` for admin orphaning, soft delete fields, heart count.
- `shadow_pin_category_hearts`: one heart per user/category.
- `shadow_pin_image_hearts`: one heart per user/image.

The migration also creates the public Supabase Storage bucket `shadow-pin` with a 15MB limit and JPEG, PNG, WebP, and GIF MIME allow-list. Storage paths are user-prefixed so authenticated users can upload only under their own folder.

## Permissions

ShadowPin uses the existing app admin model. `is_app_operator()` is used for admin-class actions, matching nearby operator tooling. Regular users can create categories/images and heart any visible item. Creators can edit their own content and delete their own images. Creators can delete a category only when it has no visible images. Operators can delete populated categories; child images are preserved and uncategorized by setting `category_id` to `NULL`.

## URL Imports

Function: `supabase/functions/shadow-pin-import-image/index.ts`

The Edge Function authenticates the caller, validates the URL, rejects local/private hosts where practical, checks image MIME and size, copies the image into `shadow-pin` Storage, then creates the category or image row. The frontend never hotlinks pasted URLs.

## Image Layout

Category image views use a deterministic JavaScript masonry layout instead of
CSS multi-column layout. Phone widths render two columns, wider screens add
columns, and images are greedily assigned by aspect ratio so mixed image
heights keep the packed staggered flow without row gaps.

Do not replace this with CSS columns without Android Chromium verification; a
previous CSS-column version collapsed to a single visible column on Android. Do
not replace it with a row-locked grid either, because small images beside tall
images leave the gaps that the masonry layout is meant to avoid.

## Local Testing

```powershell
npm run lint
npm run typecheck
npm run build
npx jest --runInBand tests/BoardBubbleMap.test.tsx
```

For remote use, apply the migration and deploy the Edge Function:

```powershell
supabase db push
supabase functions deploy shadow-pin-import-image
```

## Known V1 Limitations

- URL cover replacement during category editing is intentionally not included; creators can replace covers with device uploads.
- Stored assets are preserved after soft deletes. A future cleanup job can archive old unused objects.
- Pull-to-refresh is not custom-built; views refetch on open/return and after mutations.

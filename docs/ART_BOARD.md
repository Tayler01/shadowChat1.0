# Art Board

Art Board is the shared visual mood-board surface under Boards. It is a
separate backend domain from News Feed, board chats, DMs, and General Chat.

## User Experience

- The Boards map opens `Art Board` as a free-panning canvas with Home, zoom,
  About, Add, and Recently Added controls.
- Users can add images or pastel sticky notes.
- Image adds support local upload or URL import. URL import copies the image
  into Supabase Storage before it becomes an Art Board item.
- Sticky notes support simple bold, italic, bullet, link, title, caption, tag,
  color, resize, rotation, and layer adjustments.
- Items can overlap. Creators can move, resize, rotate, edit metadata, link,
  and delete their own items.
- Admins and sub-admins can remove Art Board items from the item action menu,
  but they do not edit another user's art.
- Item links are non-directional and use preset labels such as `related`,
  `inspired by`, `reference`, `part of`, and `contrast`.
- Reactions are intentionally small and art-specific: `heart`, `spark`, `fire`,
  and `idea`. Counts live in the detail popup.

## Backend

Canonical migrations:

- [`20260504012117_art_board_domain.sql`](C:/repos/chat2.0/supabase/migrations/20260504012117_art_board_domain.sql:1)
- [`20260504021602_art_board_z_index_bigint.sql`](C:/repos/chat2.0/supabase/migrations/20260504021602_art_board_z_index_bigint.sql:1)

Tables:

- `public.art_board_items`: canvas items, placement, sizing, rotation, metadata,
  soft-delete state, and aggregated reaction summaries.
- `public.art_board_links`: non-directional item-to-item relationships.
- `public.art_board_reactions`: individual reaction rows used to aggregate item
  reaction summaries and drive in-app owner notifications.

Storage:

- `art-board`: public image bucket for uploaded and imported images.
- Users can write only inside their own first-level folder.
- Imported URLs are fetched through `art-board-import-image` so private/local
  URLs are rejected and copied into Storage.

Realtime:

- `art_board_items`, `art_board_links`, and `art_board_reactions` are published
  to Supabase Realtime.
- The app does not stream live drag state. Placement changes autosave after the
  user stops moving/resizing/rotating.

## Moderation

The `art_board` ban scope blocks adding, editing, deleting, linking, and
reactions on Art Board while leaving browsing open. `all_interaction` also
blocks Art Board interactions.

Art Board deletes are soft deletes through `delete_art_board_item`. Linked rows
and reactions are removed when an item is soft-deleted.

## Validation

Minimum checks after Art Board changes:

```powershell
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npx jest tests/NewsView.test.tsx tests/ArtBoard.test.tsx --runInBand
npm run build
npx supabase db lint --linked --fail-on error
```

Recommended browser pass:

1. Open a production-style preview build on mobile viewport.
2. Sign in with a smoke account.
3. Open Boards, then Art Board.
4. Confirm the empty canvas settles, `+` opens, Sticky Note opens, formatting
   buttons work, and no console/page errors appear.
5. Create a temporary sticky note through normal RLS, toggle a reaction, then
   soft-delete it through `delete_art_board_item`.

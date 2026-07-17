# Universal Discovery & Library

## Status - Production

Universal Discovery and Library are part of the production app. On July 17,
2026, Discover moved from a full-screen modal portal to the first-class
`?view=discover` app route.

## Product Behavior

The existing Search utility opens a full-height, safe-area-aware **Discover**
page. It uses the standard themed app backdrop, leaves the desktop sidebar and
phone bottom menu visible, and provides six scopes:

- **All**: bounded grouped previews from every searchable source
- **Messages**: caller-visible General Chat and DM messages
- **People**: DM-discoverable public profiles
- **Pins**: visible ShadowPin media, tags, creators, and categories
- **Play**: Play destinations plus published Shado TV and Shadow Mystery items
- **Library**: private saved messages, Pins, videos, and stories organized into
  the existing private collections

Search begins after two characters and a short debounce. Providers run in
parallel with stable group order, per-source caps, cancellation and stale-
request protection. If one provider fails, that group reports a local error;
successful groups stay usable.

Opening a result uses exact URL state:

- General Chat: `?view=chat&message=<id>`
- DM: `?view=dms&conversation=<id>&message=<id>`
- ShadowPin Theater: `?view=pins&pin=<id>`
- Play: `?view=games&experience=<typed-id>&item=<optional-id-or-slug>`

Query and scope are encoded only while the Discover page is active as `q` and
`scope`. Opening a result clears those parameters from the destination URL,
while Browser Back restores the prior Discover route and search state.

## Library Behavior

The original `message_collections` and `saved_messages` tables and RPCs remain
unchanged. The additive `saved_discovery_items` table stores only:

- visible ShadowPin posts
- published, nondeleted Shado TV videos whose channel is published
- published Shadow Mystery stories

Profiles and static Play destinations are discoverable but not saveable in
this version. A save can be unfiled or assigned to one caller-owned collection.
Deleting a collection sets the save's collection to null, so it remains in All
Library. Saved items can be moved or removed from the Library.

Library reads always rejoin the live source under current visibility. A Pin or
Play item that becomes blocked, deleted, hidden, or unpublished disappears
from Library results without exposing a stale stored snapshot. The owner can
still remove the private save after its source becomes unavailable.

## Privacy And Security

- Messages use the existing `search_my_messages` `SECURITY INVOKER` RPC and
  inherit General Chat/DM RLS and reciprocal personal blocking.
- People use `search_users`, retaining authentication, `dm_discoverable`, safe
  profile projection, and reciprocal block checks. Raw `users` rows are never
  a discovery source.
- Pins use `search_shadow_pin_images` and existing Pin/category RLS.
- Play content uses the bounded, indexed
  `search_published_play_content` `SECURITY INVOKER` RPC with explicit consumer
  publication predicates even for operators.
- New Library RPCs are authenticated-only `SECURITY INVOKER` functions with an
  empty `search_path`. `PUBLIC` and `anon` execution is revoked.
- Discovery never queries `storage.objects`. Attachment visibility comes from
  the source message. Returned thumbnail paths are metadata only and add no
  Storage list/read grant.

## Source Map

- `src/components/search/GlobalSearchButton.tsx`: routed utility launcher
- `src/features/discovery/UniversalDiscoveryDialog.tsx`: phone-first UI,
  standard page shell, grouped results, exact handoffs, and Library management
- `src/features/discovery/discoveryApi.ts`: bounded multi-provider orchestration
- `src/features/discovery/playDiscoveryApi.ts`: indexed Play RPC adapter
- `src/features/discovery/playDiscoveryCatalog.ts`: compact non-media Play
  destination metadata
- `src/lib/messageLibrary.ts`: message and non-message Library clients
- `src/lib/appRouting.ts`: typed Play URL/history contract
- `supabase/migrations/20260712224323_discovery_library_non_message_items.sql`:
  private saves, RLS/RPCs, and Play full-text indexes

## Verification

The production checkpoint requires:

```powershell
npx supabase db reset --local --no-seed --yes
npx supabase db lint --local --schema public --level error --fail-on error
npx jest --runInBand
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

The rollback-only database verifier is
`scripts/verify-discovery-library-local.sql`. Browser acceptance covers Pixel
Chromium and iPhone WebKit, safe areas, keyboard compression, partial errors,
exact routes, Back restoration, collection actions, and no console/page errors.
Any test-created rows or media must be removed before acceptance.

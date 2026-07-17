# Message Library

## Documentation Status - July 17, 2026

Universal message search, private saves, and personal collections shipped in
the July 10 Release A backend-first deployment, including
`20260710043132_universal_search_saved_collections.sql`. The latest successful
`main` workflow, linked checks, and public health manifest are the authority for
the current live build while release closeout finishes its forward historical-
grant correction.

## Product Behavior

Universal Discovery extends this foundation without changing the shipped
message contracts. See
[UNIVERSAL_DISCOVERY_LIBRARY.md](C:/repos/chat2.0/docs/UNIVERSAL_DISCOVERY_LIBRARY.md:1).

On production `main`, app-header and phone-tool search controls open the
first-class `?view=discover` page with the standard app backdrop and persistent
navigation. It includes message search and a unified Library:

- **Messages** searches caller-visible General Chat and DM message text.
- **Library** lists the caller's saved messages alongside eligible Pins and
  Play content, filtered by the same private collections.

Search waits briefly while the member types, ranks full-text matches, and
returns the newest/ranked results with API-safe author presentation fields.
Opening a result routes to General Chat or the correct DM conversation and adds
the message id to the URL for deep-link positioning.

A member can save one copy of a General Chat or DM message, leave it unfiled, or
place it in a private collection. Saving the same message again moves/updates
the existing save. Deleting a collection does not delete its messages; their
`collection_id` becomes null and they remain under All saved messages.

## Privacy And Visibility

Search runs as `SECURITY INVOKER`. Existing General Chat, DM, profile, and
personal-block RLS remains the visibility authority, so the search function
cannot reveal a message the caller could not select normally.

`public.message_collections`, `public.saved_messages`, and Wave Two's additive
`public.saved_discovery_items` are private to their
owner under RLS. A save may reference only a visible General Chat message or a
DM whose conversation includes the caller, and it may be assigned only to a
collection owned by that caller. Removing a source message cascades its saved
reference; removing a collection preserves the save.

## Data Model And APIs

Canonical migration:

- `20260710043132_universal_search_saved_collections.sql`
- `20260712224323_discovery_library_non_message_items.sql` (Wave Two additive
  non-message Library; existing message APIs unchanged)

Tables:

- `message_collections`: owner, unique case-insensitive name, optional
  description/accent, sort order, and timestamps
- `saved_messages`: owner, optional collection, General/DM source identity,
  optional private note, and timestamps
- `saved_discovery_items`: owner, optional existing collection, and exactly one
  visible ShadowPin/Shado TV/Shadow Mystery target

Search uses GIN full-text indexes over General Chat and DM content. The public
member APIs are:

- `search_my_messages(search_query, result_limit, before_created_at)`
- `list_my_saved_messages(collection_filter, result_limit)`
- `save_message_to_library(target_source, target_message_id,
  target_collection_id, target_note)`

The current UI requests up to 40 search results and up to 200 saved results.
The backend supports notes, collection descriptions/colors, sort order, and a
search cursor even where the first UI does not yet expose every field.

## Frontend Source Map

- `src/components/search/GlobalSearchButton.tsx`: lazy routed Discover launcher
- `src/features/discovery/UniversalDiscoveryDialog.tsx`: discovery scopes,
  collections, save/move/remove actions, and exact result routing
- `src/lib/messageLibrary.ts`: authenticated search/save/collection client API
- `src/components/layout/MobileAppHeader.tsx`: lazy app-header entry point

## Verification

Run:

```powershell
npx jest --runInBand tests/messageLibrarySql.test.ts tests/discoveryLibrarySql.test.ts tests/GlobalSearchButton.test.tsx
```

For browser QA, verify General Chat and DM matches, save/move/remove behavior,
collection deletion, deep links, blocked-user filtering, keyboard focus,
safe-area layout, the persistent phone menu, and zero horizontal overflow.
Test data must be removed before the run is called complete.

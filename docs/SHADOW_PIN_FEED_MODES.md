# ShadowPin Feed Modes

## Documentation Status - July 13, 2026

This is the product, privacy, routing, data, and acceptance contract for
ShadowChat 2.0 Wave Three Candidate 2. The implementation lives only on
`codex/shadowchat-2.0` during the trial. Production `main` and the production
Netlify frontend remain unchanged.

## Product Contract

ShadowPin has two member-controlled home modes:

- **Discover** is the default. It preserves the existing category-first home,
  category ordering, universal search, category hearts, Creator Studio, and
  category-scoped Theater.
- **Connections** is a cross-category chronological feed of Pins created by
  accepted, currently unblocked Connections. It excludes the caller's own
  Pins, pending and inactive relationships, deleted content, unavailable
  categories, and media that the existing ShadowPin visibility contract would
  hide.

Connections is not a recommendation algorithm. It does not rank by hearts,
popularity, public graph data, activity score, or AI. Ordering is always
`created_at DESC, id DESC`.

The mode selector is an in-flow, equal-width segmented tablist at the top of
the ShadowPin home, below the floating safe-area controls and before the
Creator Studio resume card. Search remains universal in both modes. Creator
Studio remains available in both modes, but the member's own newly published
Pin is not inserted into the Connections feed.

## Preference And Routes

The preferred mode is account-synced in the owner-private
`shadow_pin_feed_preferences` table. Browser roles cannot read or write that
table directly; guarded caller-scoped RPCs own the preference.

Resolution order is:

1. an explicit valid route mode
2. the last user-keyed in-memory value for immediate paint
3. the authoritative server preference
4. Discover

Canonical home routes are:

- Discover: `?view=pins`
- Connections: `?view=pins&feed=connections`

Mode changes replace the current history entry so Browser Back does not cycle
through filters. The preference is switched optimistically. A save failure
keeps the selected session mode, reports that the default was not saved, and
offers a retry; it never paints Discover content under a Connections label.

Pins opened from Connections retain `feed=connections`. Connections Theater
uses the same eligible chronological sequence as the feed, including keyset
pagination and an exact target window for cold routes. It never falls through
to unrelated category Pins while the Connections context is active. Ordinary
mode-neutral Pin permalinks keep the existing category Theater behavior.

If a cold Connections target is no longer eligible but remains visible under
normal ShadowPin RLS, the app removes the private feed context and opens the
normal Pin route. If the target is no longer RLS-visible, it reports that the
Pin is unavailable without revealing its creator or media.

## Data And Security Contract

Public invoker wrappers:

- `get_my_shadow_pin_feed_mode()`
- `set_my_shadow_pin_feed_mode(target_mode text)`
- `list_my_shadow_pin_connection_feed(result_limit integer,
  before_created_at timestamptz, before_id uuid)`
- `get_my_shadow_pin_connection_feed_window(target_image_id uuid)`

The implementations live in the unexposed `shadow_pin_private` schema, pin
`search_path = ''`, authenticate with `auth.uid()`, and reproduce the canonical
accepted pair plus reciprocal-block contract directly from `user_connections`
and `user_blocks`. Browser roles receive no direct preference-table,
Connection-table, block-table, or private predicate access.

The feed RPC returns only eligible Pin IDs, timestamps, caller heart state, and
pagination metadata. The browser then loads those exact Pin rows through the
existing ShadowPin RLS and safe public-profile projection. This keeps media,
profile, category, and tag visibility under the same RLS path as Discover and
avoids privileged profile or media serialization.

The privileged eligibility query explicitly reproduces current ShadowPin read
conditions: nondeleted Pin, active category, existing image/video processing
semantics, reciprocal block exclusion, nonself creator, and accepted
Connection. Existing permissive plus restrictive ShadowPin policies are not
replaced.

Pagination is bounded and keyset-based on `(created_at, id)`. Both cursor
fields are required together. The additive partial index is
`shadow_pin_images_creator_connections_feed_idx`. Accepted creator IDs and
reciprocal blocks are materialized once per request; bounded lateral index
probes merge each creator's newest eligible Pins instead of scanning the full
Pin table. A trigger makes the pagination identity fields `id` and
`created_at` immutable after insert.

## Loading, Empty, And Recovery States

- Initial Connections load uses a stable masonry-shaped skeleton and a polite
  status announcement.
- Pagination appends up to 30 Pins without removing loaded content.
- No accepted Connections shows “Your Connections feed is waiting,” with
  actions to open Connections and View Discover.
- Accepted Connections without eligible Pins shows “No new Pins from your
  Connections,” with actions to Manage Connections and View Discover.
- A first-page error shows Retry and View Discover. A refresh error keeps
  already loaded Pins and presents a bounded retry notice.
- Connection removal and personal blocking invalidate and canonically refresh
  the feed. Blocking removes the creator immediately. Unblocking does not
  restore the removed Connection.
- Focus and visible-page recovery refresh the feed so multi-device changes do
  not leave stale relationship content painted.

## Accessibility And Mobile Contract

- The selector uses `tablist` and `tab` semantics, `aria-selected`, roving
  focus, `aria-controls`, and Left/Right/Home/End keyboard behavior.
- The selected mode is conveyed by text, shape/border, and semantics rather
  than gold color alone.
- Targets are at least 44px and expand with the shared Large Controls comfort
  profile.
- Motion follows the shared Comfort provider. Reduced/no-motion modes switch
  immediately; there is no custom media query or storage path.
- Phone masonry remains the existing deterministic JavaScript layout, with
  safe-area padding, browser zoom, 130% text support, and no horizontal
  overflow.
- A mode switch unmounts or pauses hidden media; at most one feed video or
  iframe is active.

## Verification And Cleanup

Acceptance requires:

- transactional SQL proof for preference privacy, accepted/pending/inactive/
  blocked/self filtering, processing visibility, keyset pagination, target
  windows, input validation, and least privileges
- focused Jest for API normalization, preference behavior, delayed-response
  isolation, event/focus invalidation, tabs, routing, empty/error states,
  engagement, and Theater context
- Pixel Chromium and iPhone WebKit proof with roles swapped for persistence,
  rapid mode switching, Connection lifecycle refresh, exact Theater/comments/
  Back behavior, Studio return, search independence, safe areas, text scale,
  and zero horizontal overflow
- no unexpected console, page, request, response, Supabase-host, or media-player
  failures
- unchanged production frontend smoke after the additive migration
- cleanup by exact IDs with zero Pin, heart, comment, tag, activity,
  notification, Connection, block, preference, Storage, or media residue

## Explicit V1 Exclusions

- “For You” or AI ranking
- public following/follower feeds or graph counts
- client-side filtering of broad Pin pages
- implicit Connection creation or restoration
- mode-scoped universal search
- public feed-mode preference
- Inner Circle filtering or sharing; Wave Three Candidate 3 owns that work

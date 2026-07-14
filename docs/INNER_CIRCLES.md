# Inner Circles

## Documentation Status - July 13, 2026

This is the product, privacy, routing, backend, ShadowPin, and acceptance
contract for ShadowChat 2.0 Wave Three Candidate 3. Work remains isolated on
`codex/shadowchat-2.0`; production `main` and production Netlify stay unchanged.

Candidate 3 is accepted. Additive migration `20260713235745` is linked to the
shared Supabase project with no pending drift, and the unchanged production
frontend passed its auth/resume-send compatibility smoke. The complete
Pixel Chromium/iPhone WebKit proof passed against immutable isolated deploy
`6a55892252f0d306fae5b852`; stable isolated deploy
`6a558acc257a6d21fa379fa2` serves the byte-identical boot artifact and passed a
fresh iPhone WebKit Connections -> Circles route check.

## Product Contract

Inner Circles are private lists of accepted Connections. Only the owner can see
a circle's name, membership, or count. A circle organizes people and narrows
what its owner views; it is not a new relationship, publishing audience,
visibility permission, group chat, notification list, badge, mutuals signal,
or popularity count.

V1 limits are:

- 10 circles per owner
- 50 members per circle
- names normalized to one line, 1-40 characters, case-insensitively unique per
  owner, with no control characters
- one Connection may belong to multiple circles
- the owner is implicit and cannot be a member

Adding or removing a member is silent. The member is never told which circles
contain them. Circle mutation never alters DM history, message permissions,
Connection state, or public profile data.

## Connections Hub And Routes

Inner Circles live inside the existing Connections surface, not bottom
navigation. A first-level `People | Circles` tablist sits below the Connections
header. People preserves the accepted/requests/sent tabs and universal people
search. Circles shows the private-list explainer, create action, and complete
bounded circle list.

Canonical routes are:

- People: `?view=dms&panel=connections`
- Circles: `?view=dms&panel=connections&section=circles`
- Circle detail:
  `?view=dms&panel=connections&section=circles&circle=<uuid>`

People/Circles switching replaces history. Opening a detail pushes one layer,
so Browser Back returns detail -> Circles -> the underlying DM Hub. A cold
invalid, deleted, or foreign UUID shows Circle unavailable and offers a safe
return; it never reveals another owner's name or membership.

Circle detail shows the private name, `x of 50`, Rename/Delete, Add
Connections, and member rows with Message and labeled Remove actions. The
picker searches only accepted, currently unblocked Connections and applies a
single all-or-nothing bounded add.

## Membership Lifecycle

Membership is keyed by `(circle_id, member_id)` and revalidates the canonical
accepted/unblocked Connection predicate on every mutation and read.

- accepted -> inactive removes both owners' memberships for that pair
- deleting the Connection removes both owners' memberships
- personal block removes the Connection and both owners' memberships
- unblock and later reconnect never restore old membership
- deleting a circle hard-deletes its memberships without touching Connections,
  DMs, Pins, or messages
- add/remove/create/delete retries are idempotent; rename uses expected
  revision so stale clients cannot silently overwrite a newer name

Owner/circle transaction locks enforce the 10/50 limits under concurrent
requests. Connection-pair locks make add-vs-remove/block races finish with no
stale membership.

## Data And Security Contract

Additive tables:

- `public.inner_circles`: owner, private name/key, revision, timestamps
- `public.inner_circle_members`: circle, member, added timestamp

Both tables use RLS defense in depth, have no direct `anon` or `authenticated`
table privileges, and are not published through Postgres Changes. Browser code
uses public `SECURITY INVOKER` wrappers whose fixed-search-path privileged
implementations live in an unexposed schema:

- `list_my_inner_circles()`
- `list_my_inner_circle_members(target_circle_id uuid)`
- `mutate_my_inner_circle(target_circle_id uuid, target_action text,
  target_name text, expected_revision integer)`
- `mutate_my_inner_circle_member(target_circle_id uuid,
  target_member_id uuid, target_action text)`
- `set_my_inner_circle_members(target_circle_id uuid,
  target_member_ids uuid[])`

Every call authenticates with `auth.uid()`, verifies ownership, validates
inputs and limits server-side, and returns only caller-owned records plus the
existing safe public-profile projection. Guessed foreign UUIDs fail with
generic unavailable behavior. The picker uses the bulk setter so its complete
selection is validated and committed atomically; any unavailable member or
limit violation rolls back the whole change.

Circle changes do not create visible notifications, Activity items, push,
email, SMS, or analytics containing circle names/members. Local owner events,
focus recovery, and guarded reads keep open clients current. Personal block
and Connection events remove affected members/content immediately before a
refetch can succeed.

## ShadowPin Connections Filter

Only the Connections feed gains a single in-flow `All Connections` / selected
circle filter. The route is:

`?view=pins&feed=connections&circle=<uuid>`

The circle UUID is transient route state, not a third feed mode and not an
account preference. Discover removes it. Search remains universal and
circle-independent. Creator Studio remains public/Discover behavior; V1 has no
Share to Circle or circle-only Pin audience.

The server-side circle feed/window APIs only narrow Pins already eligible in
All Connections. They intersect owner membership with current accepted,
unblocked relationships and the existing Pin/category/media/operator
visibility contract on every page:

- `list_my_shadow_pin_circle_feed(target_circle_id uuid,
  result_limit integer, before_created_at timestamptz, before_id uuid)`
- `get_my_shadow_pin_circle_feed_window(target_circle_id uuid,
  target_image_id uuid)`

The privileged result contains IDs/timestamps/heart metadata only; exact Pins
are hydrated through existing ShadowPin RLS and safe profile projections.
Ordering remains `(created_at DESC, id DESC)`. Theater/comments preserve the
circle route and swipe only within that sequence.

If a routed Pin leaves the circle but remains eligible in All Connections, the
app drops only `circle` and explains the broader fallback. If it is no longer a
Connection Pin but remains normally RLS-visible, Candidate 2's Discover
fallback applies. Otherwise it is unavailable. The app never paints a broader
feed under a selected circle label.

Distinct empty states are required:

- no members: `This circle is empty` plus Manage
- members but no eligible Pins: `No Pins from <name> yet`
- invalid/deleted/foreign: `Circle unavailable`
- first-page failure: keep the selected circle label, show Retry, and do not
  fall through to All Connections

## Accessibility And Mobile Contract

- both selector levels use real tablist/tab semantics, roving focus,
  Left/Right/Home/End, visible focus, and text/shape semantics beyond gold
- targets are at least 44px and expand through shared Large Controls
- list/listitem, checkbox, live-count, dialog focus-trap, and focus-restoration
  semantics are explicit
- create/rename drafts and validation survive retry; picker actions remain
  pinned above keyboard and safe area
- surfaces support `100dvh`, 320px width, browser zoom, 130% text, forced
  colors, reduced/no motion through Comfort, and no horizontal overflow
- no eager circle query/subscription runs until Connections/Circles or the
  Connections feed filter is used

## Verification And Cleanup

Acceptance requires transactional SQL proof for owner isolation, least
privilege, name/limit/concurrency behavior, idempotency, safe profiles,
accepted-only membership, teardown/no-restore, guessed-ID denial, circle feed
eligibility, keyset/window behavior, and zero residue.

Focused Jest must cover models/APIs/hooks, stale-response isolation, optimistic
rollback, routes, People/Circles/details, keyboard and focus semantics, picker
limits, ShadowPin filtering, empty/error/fallback behavior, and Theater context.

Authenticated Pixel Chromium and iPhone WebKit proof must cover create,
rename, add/remove, reconnect teardown, route/Back, multi-device refresh,
circle feed/empty/Theater/comments, safe-area/keyboard geometry, diagnostics,
and exact cleanup/restoration. The unchanged production frontend must pass its
compatibility smoke after any additive migration.

The accepted evidence is
`output/playwright/wave3-inner-circles/summary.json`. It proves the lifecycle,
atomic accepted-only rejection, scoped feed/Theater/comments behavior, mobile
geometry, zero console/page/request/HTTP errors, exact preference restoration,
and zero Connection/block/Circle/member/Pin/category/comment/notification/
activity/analytics residue.

## Explicit V1 Exclusions

- circle publishing audiences or visibility ACLs
- Share to Circle, member notifications, invitations, or acceptance
- group DMs, chat rooms, voice, or Shado Live
- public names, membership, counts, mutuals, badges, or profiles
- automatic/dynamic/smart circles, AI recommendations, contact import
- icons, colors, covers, descriptions, sharing, transfer, clone, or reorder
- Activity/reporting, Boards, News, Art Board, ESP Bridge, or Catch-Up

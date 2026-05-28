# Shadow Pin Activity Analytics Plan

This plan captures the first planning pass for an admin-visible Shadow Pin
activity dashboard. It is intentionally scoped as a planning artifact before
schema, instrumentation, and UI implementation.

## Goal

Build an easy-to-read admin analytics surface for Shadow Pin that shows who is
using it, what content and categories they interact with, how long they spend,
and what they create or change over time.

The dashboard should support future features by storing structured activity
events and summary data instead of only rendering one-off UI metrics.

## Access

- Available to both full `admin` and `sub_admin` operators.
- Do not show email addresses in this surface.
- Identify users by display name and username.
- Include activity from everyone, including full admin and sub-admin users.

## Existing Backfillable Data

Backfill every factual Shadow Pin event already present in the database:

- Category creation from `shadow_pin_categories.created_at`.
- Pin creation from `shadow_pin_images.created_at`.
- Category heart events from `shadow_pin_category_hearts.created_at`.
- Pin heart events from `shadow_pin_image_hearts.created_at`.
- Existing creator IDs, item IDs, titles, category relationships, and timestamps.

Historical visit, view, and dwell-time data does not exist today. Those metrics
start from the rollout date of the new instrumentation.

## Activity To Track

Track all of the following as structured analytics events:

- Shadow Pin visits.
- Category views and category dwell time.
- Pin views when a pin is visible on screen.
- Pin opens in the image viewer.
- Heart added and heart removed for categories.
- Heart added and heart removed for pins.
- Share taps.
- Category created, edited, and deleted.
- Pin created, edited, and deleted.

Each event should preserve enough snapshot data to remain readable if the
category or pin is later edited or deleted:

- Category or pin ID.
- Category or pin title at event time.
- Thumbnail or image URL/path at event time when practical.
- Related category ID and category title for pin events when practical.
- Actor user ID.
- Event timestamp.
- Duration where the event represents dwell time.

Do not store category or pin descriptions in raw analytics events by default.
Keep snapshots privacy-minimal: IDs, titles, category names, thumbnails, action
metadata, actor, timestamp, and duration. Add descriptions later only if a
future feature truly needs them.

## Session And Duration Rules

- Logged-in users only.
- A Shadow Pin visit counts after the user spends at least 5 seconds in the
  Shadow Pin surface.
- Track total active visible time in Shadow Pin.
- Track per-category active visible dwell time.
- A category visit counts after at least 3 seconds inside that category.
- Count active visible time only. Pause timers when the tab/app is hidden,
  backgrounded, unloading, or the phone is locked.
- No realtime dashboard updates are needed. Provide a manual refresh button.
- For new dwell-time events, the client should measure active visible duration
  and send duration seconds through the analytics RPC. The server should attach
  the authoritative received timestamp and avoid trusting client timestamps for
  event ordering.

## Pin View Rules

- A `pin viewed` event means the pin thumbnail appeared on screen in the
  category grid.
- Require roughly 1 second of visibility before counting the pin as viewed.
- Count each pin view once per user per Shadow Pin session. If the user leaves
  and starts a later session, the same pin can count again.
- V1 does not need device, browser, or viewport context.

## Retention

- Keep raw detailed events for 180 days.
- Keep daily summary rows indefinitely.
- Use summaries for long-term graphs and trend comparisons.
- V1 can compute dashboard summaries from raw events through admin-only RPCs.
  The daily summary table is still part of the target design, but automatic
  summary generation can wait until event volume or retention needs justify it.

## Admin Dashboard

Add a new Settings > Admin section, tentatively titled `Shadow Pin Activity`.

Dashboard behavior:

- Default date range: last 7 days.
- Quick presets: today, 7 days, 30 days, and 90 days.
- Date-first layout with quick user and category filters.
- Support comparing the selected range against the previous equivalent range
  when practical, such as this week versus last week. Show simple deltas for
  visits, active time, score, posts, and views.
- Organize charts into mobile-friendly tabs: `Users`, `Categories`, and `Pins`.
- Manual refresh button.
- No CSV/export support in v1.

Primary spreadsheet-style table:

- Table rows should follow the active chart tab.
- `Users`: one row per user with visits, total active time, categories viewed,
  pins viewed, pins opened, posts, categories created, hearts, shares,
  edits/deletes, and weighted activity score.
- `Categories`: one row per category with visits, active time, unique visitors,
  pin views, pin opens, pins created, hearts, shares, and latest activity.
- `Pins`: one row per pin with grid views, opens, hearts, shares, creator,
  category, created date, and latest activity.
- Category and pin rows should include small thumbnail previews where available,
  with compact sizing so the tables remain scannable on mobile.
- Tapping a user, category, or pin row should open the drilldown timeline with
  that entity applied as a filter.

Graph priority:

- Users by weighted activity score.
- Top categories by visits, active time, pin views, and created pins.
- Top pins by grid views, opens, hearts, and shares.
- Keep raw counts visible beside the weighted score so the score is
  explainable.
- Use polished, responsive charts for v1 rather than barebones CSS-only
  visualizations. `recharts` is the selected production chart dependency for
  this feature. Keep bundle impact reasonable.
- The weighted score is admin-only analytics for now and should not affect the
  existing public Shadow Pin gold pin badge or leaderboard behavior.

Initial weighted activity score:

- Qualified Shadow Pin visit: 2 points.
- Category visit: 2 points.
- Pin viewed in grid: 1 point.
- Pin opened in viewer: 3 points.
- Heart added: 3 points.
- Heart removed: 1 point.
- Share tapped: 4 points.
- Category created: 12 points.
- Pin posted: 10 points.
- Category or pin edited: 4 points.
- Category or pin deleted: 3 points.
- Active visible time: 1 point per minute, capped at 30 time points per user
  per day so leaving a page open cannot dominate the score.

This formula intentionally favors creation, sharing, and direct engagement while
still recognizing browsing activity. The dashboard should show the formula or a
brief score breakdown near the graph so admins can understand why a user ranks
where they do.

Drilldown:

- Provide a raw event timeline table for the selected date range, user, and/or
  category.
- Include an action-type filter for views, opens, posts, hearts, shares, edits,
  deletes, visits, and all activity.
- Timeline rows should show user, action, time, title/category, and duration
  when available.
- Keep the default view aggregate-first. Show the user score graph and
  spreadsheet-style user table first, then reveal the raw timeline after an
  admin selects a user/category or explicitly opens drilldown. This keeps the
  surface readable on phone-sized admin views.

## Likely Implementation Shape

Use a dedicated Shadow Pin analytics backend domain rather than mixing analytics
into chat, DM, or general message tables.

Likely schema pieces:

- `shadow_pin_activity_sessions` for per-user Shadow Pin sessions, visit
  threshold state, and total active duration.
- `shadow_pin_activity_events` for normalized raw events with event type,
  target IDs, snapshot metadata, and optional duration.
- `shadow_pin_activity_daily_summaries` for long-term per-day/per-user rollups,
  added when retention/scale requires materialized summaries.
- Admin-only summary RPCs for dashboard tables and graphs.
- Admin-only event timeline RPC with filters and pagination.

Frontend instrumentation should live near the Shadow Pin feature, likely as a
small analytics helper or hook used by `src/features/shadow-pin/ShadowPin.tsx`.
It should batch or debounce write activity enough to avoid noisy network churn,
especially on mobile.

Normal users should record analytics through a narrow RPC entrypoint rather
than inserting directly into the raw event table from feature code. The RPC
should validate allowed event types, enforce `auth.uid()` as the actor, attach
server-side timestamps, and write normalized rows. Table grants/RLS should still
prevent users from reading analytics data. Admin-class dashboard reads should go
through separate guarded RPCs.

## Rollout And Verification Notes

- Create migrations with Supabase CLI before implementation.
- Keep RLS strict: normal users can write their own activity events but cannot
  read analytics rows; admin-class users can read aggregated dashboard data
  through guarded RPCs.
- Backfill historic creation and heart events using existing timestamps.
- Verify admin/sub-admin access and non-admin denial paths.
- Verify mobile browsing instrumentation does not make Shadow Pin feel slower.
- Run the repo's standard checks after code changes:
  - `npm run lint`
  - `npx tsc --noEmit -p tsconfig.app.json`
  - `npm run build`
- Run targeted Jest/browser smoke coverage when implementation touches behavior
  or UI.

## Open Planning Questions

- Whether later versions should materialize daily summaries with a scheduled job
  once raw event volume grows.
- Whether later versions should add CSV export.

## Default Implementation Assumptions

Unless implementation discovery shows a better repo-native pattern:

- Use an RPC-based event recorder for normal user activity.
- Use admin-only RPCs for dashboard summaries, chart data, and timeline rows.
- Keep raw event writes narrow and append-only.
- Prefer a polished lightweight chart library over handmade charts.
- Keep the v1 admin UI compact, mobile-first, and tabbed.
- Avoid export, realtime dashboard subscriptions, device/browser fingerprinting,
  and public leaderboard connections in v1.
- Document privacy and admin access behavior if the implementation changes
  operator-visible user activity data.

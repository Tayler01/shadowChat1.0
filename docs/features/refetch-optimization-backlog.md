# Refetch Optimization Backlog

## Documentation Status - June 1, 2026

Reviewed during the June 1, 2026 documentation refresh. This feature guide is current for the shipped product surface, with any known hardening or polish follow-ups tracked in [FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md](C:/repos/chat2.0/docs/FULL_CODEBASE_AUDIT_NEXT_STEPS_2026-06-01.md:1).

Use this list for focused performance work. These items were found during
inspection on 2026-05-18 and should be re-verified before changing behavior.

## Candidates

| Area | Original behavior | Why it repeated | Status |
| --- | --- | --- | --- |
| Header weather | Weather preference and forecast loaded from each `WeatherWidget` mount. | Every page renders its own `MobileAppHeader`, and the widget owned `useWeatherForecast`. | Fixed: app-level `WeatherProvider` plus in-memory preference/forecast caches. |
| DM user directory | `useAllUsers` fetched the full DM-discoverable user list when `DirectMessagesView` mounted. | The hook was mounted at the top of DMs, even before the new-message picker opened. | Fixed: lazy-load on picker open with an in-memory directory cache. |
| Settings admin access | `useAdminAccess` checked role and could fetch all admin-manageable users on every Settings mount. | Settings mounted the hook at the top level, regardless of which section was opened. | Fixed: role is cached separately; user list loads only in Admin > Access. |
| Settings news admin | `useNewsAdmin` checked operator state and fetched news sources on every Settings mount. | Settings mounted the hook at the top level, even outside Admin > News Sources. | Fixed: loads only when the News Sources panel opens and then reuses in-memory state. |
| Settings push state | `usePushNotifications` fetched preferences and synced the current device subscription on Settings mount/focus. | Settings mounted the hook at the top level, even outside notification settings. | Fixed: loads and focus-refreshes only while Notifications & Audio is active. |
| Shadow Pin categories | Categories fetched every time the Pins view mounted. | Pins is a lazy route and its category hook owned mount-local state. | Fixed: feature-level 5-minute cache with mutation updates and invalidation. |
| Shadow Pin category images | Category metadata and first image page fetched each time a category page mounted. | Category image state was local to the active category screen. | Fixed: per-category 5-minute image/page cache with mutation updates. |
| Board subviews | News Feed, News Chat, Board Chat, and Art Board loaded fresh when their board surface opened. | Board contents are mounted only after selecting a board. | Fixed: short in-memory caches for immediate reopen; manual refresh/realtime recovery still force refetch. |

## Notes

- General chat messages, DM conversations, presence, and board badges are already
  app-level providers and are not the same class of page-switch refetch.
- Dev-only React `StrictMode` can make mount effects appear to run twice locally,
  but production page-switch refetches still need their own caching strategy.
- These are intentionally memory-only caches. They reset on full app reload or
  are keyed by the current user where rows include viewer-specific state. That
  keeps private/user-scoped data out of `localStorage` while still avoiding
  clean page-switch refetches.

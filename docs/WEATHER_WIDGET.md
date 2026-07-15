# Weather

## Documentation Status - July 15, 2026

Weather is a full, mobile-first app page. The compact controls in General Chat
and the bottom tool rail are navigation buttons; they no longer open a popup.
Weather location data remains private to the owning user.

## Product Behavior

The Weather page provides:

- current conditions and detailed metrics;
- the next 24 hours and a 10-day forecast;
- explicit current-device GPS lookup;
- city and postal-code search;
- private saved locations;
- Fahrenheit and Celsius unit modes;
- US severe-weather alerts;
- an on-demand interactive radar with observed and forecast frames;
- manual refresh; and
- a themed image share to General Chat.

Air quality, pollen, lightning maps, and historical weather are intentionally
outside the v1 scope. Weather and radar are best-effort information surfaces,
not replacements for official emergency guidance.

The GPS prompt only runs after the member taps **Use current location**. The
browser permission policy allows geolocation for this app origin, but the app
does not request location in the background or continuously track a device.

## Navigation

- The compact General Chat weather pill opens `?view=weather`.
- The Weather icon on the bottom tool page opens the same route and remains
  selected while the page is active.
- The mobile bottom navigation remains visible on the Weather page.
- The radar chunk and Leaflet runtime are loaded only after the member chooses
  **Show radar**, protecting initial app and Weather-page startup.

## Private Data Model

The current weather location remains in
`public.user_weather_preferences`, created by
[`20260502042003_user_weather_preferences.sql`](../supabase/migrations/20260502042003_user_weather_preferences.sql).

Saved locations live in owner-private `public.user_weather_locations`, created
by
[`20260715214708_weather_saved_locations.sql`](../supabase/migrations/20260715214708_weather_saved_locations.sql).

Both tables use authenticated owner-only RLS. Location rows are not public
profile data and are not added to the Realtime publication. The current-device
GPS result is stored only when the member explicitly chooses it as their
weather location.

## Providers And Attribution

- Forecast and geocoding: Open-Meteo
  (`api.open-meteo.com` and `geocoding-api.open-meteo.com`).
- US severe alerts: National Weather Service (`api.weather.gov`). Locations
  outside NWS coverage return no NWS alerts without blocking the forecast.
- Radar frames: RainViewer (`api.rainviewer.com` and
  `tilecache.rainviewer.com`).
- Interactive base map: OpenStreetMap standard tiles
  (`tile.openstreetmap.org`).

All provider calls are browser-side and use public, no-key endpoints. Do not
add provider tokens to `VITE_*` variables. The radar surface visibly credits
OpenStreetMap and RainViewer. Netlify uses
`strict-origin-when-cross-origin` so the standard OpenStreetMap tile service can
receive an origin referer, and its report-only CSP includes the forecast,
alert, radar, and map hosts.

## Weather Sharing

The Weather page renders a fixed-width off-screen obsidian-and-gold card,
captures it with `html-to-image`, uploads it through the existing chat image
path, and sends it to General Chat. Sharing is explicit and does not expose the
member's saved-location list.

## Frontend Map

- [`src/features/weather/WeatherView.tsx`](../src/features/weather/WeatherView.tsx):
  full page, search, GPS, saved locations, alerts, units, forecast, and share.
- [`src/features/weather/RadarMap.tsx`](../src/features/weather/RadarMap.tsx):
  lazy Leaflet/OpenStreetMap/RainViewer surface.
- [`src/features/weather/WeatherIcon.tsx`](../src/features/weather/WeatherIcon.tsx):
  shared weather icon mapping.
- [`src/components/chat/WeatherWidget.tsx`](../src/components/chat/WeatherWidget.tsx):
  compact and bottom-nav route controls.
- [`src/hooks/useWeatherPreference.ts`](../src/hooks/useWeatherPreference.ts):
  current private preference load/save/clear.
- [`src/hooks/useWeatherForecast.ts`](../src/hooks/useWeatherForecast.ts):
  shared forecast cache and refresh lifecycle.
- [`src/lib/weather.ts`](../src/lib/weather.ts): provider mappings and private
  preference/saved-location helpers.

## Validation

Focused checks:

```powershell
npx jest --runInBand tests/weather.test.ts tests/WeatherWidget.test.tsx tests/WeatherView.test.tsx tests/Navigation.test.tsx tests/appRouting.test.ts
node --test tests/netlifySecurityHeaders.node.test.mjs tests/weatherSavedLocationsSql.node.test.mjs
```

Phone QA should verify on iPhone WebKit and Android Chromium:

1. Weather opens from both existing icons and keeps the bottom navigation.
2. GPS is requested only after tapping the current-location button.
3. Search, saved-location switching/removal, refresh, and unit changes work.
4. Hourly and 10-day rows scroll without page-level horizontal overflow.
5. Radar loads on demand, pans and zooms, shows attribution, and respects the
   Comfort motion policy.
6. Sharing creates one readable General Chat image.
7. Denied GPS, unavailable alerts, and unavailable radar fail gracefully.

Physical-device validation remains required for installed-PWA GPS permission
behavior and real iOS/Android map gestures.

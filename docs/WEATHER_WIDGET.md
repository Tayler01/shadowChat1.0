# Weather Widget

The General Chat header includes a small per-user weather widget beside the
active-user count control.

## Product Behavior

- The compact header pill shows only a weather icon and the current temperature.
- Clicking it opens a popup with current conditions and a short forecast.
- The popup can route users directly to Account & Profile settings when no
  location is selected.
- Location is personal to the signed-in user. It is not stored on public profile
  rows and is not visible to other users.

## Settings Flow

Users choose their weather location from:

```text
Settings > Account & Profile > Weather Location
```

The settings card supports city or postal-code search, saving a selected
location, and clearing the location.

## Data Model

Private weather preferences live in `public.user_weather_preferences`, created
by
[`20260502042003_user_weather_preferences.sql`](C:/repos/chat2.0/supabase/migrations/20260502042003_user_weather_preferences.sql:1).

Stored fields:

- `user_id`
- `location_name`
- `latitude`
- `longitude`
- `timezone`
- `country_code`
- `admin1`
- `temperature_unit`

RLS allows each authenticated user to select, insert, update, and delete only
their own weather preference row. The table is intentionally not in the
Supabase Realtime publication because weather settings are private and refresh
on demand.

## Weather Provider

The browser calls Open-Meteo directly:

- Forecast API: `https://api.open-meteo.com/v1/forecast`
- Geocoding API: `https://geocoding-api.open-meteo.com/v1/search`

No API key is required for the current non-commercial style integration, and no
weather provider token should be added to a browser-visible `VITE_*` variable.

## Frontend Map

- [`src/components/chat/WeatherWidget.tsx`](C:/repos/chat2.0/src/components/chat/WeatherWidget.tsx:1): compact header control and forecast popup.
- [`src/components/settings/WeatherLocationSettings.tsx`](C:/repos/chat2.0/src/components/settings/WeatherLocationSettings.tsx:1): Account & Profile location picker.
- [`src/hooks/useWeatherPreference.ts`](C:/repos/chat2.0/src/hooks/useWeatherPreference.ts:1): private preference load/save/clear hook.
- [`src/hooks/useWeatherForecast.ts`](C:/repos/chat2.0/src/hooks/useWeatherForecast.ts:1): forecast refresh hook.
- [`src/lib/weather.ts`](C:/repos/chat2.0/src/lib/weather.ts:1): Open-Meteo mapping and Supabase preference helpers.

## Validation

Targeted tests:

```powershell
npx jest --runInBand tests/WeatherWidget.test.tsx tests/WeatherLocationSettings.test.tsx tests/weather.test.ts
```

For UI changes, run a preview build and verify:

1. Desktop General Chat header shows the compact weather pill.
2. Weather popup opens and fits inside the viewport.
3. Mobile General Chat header keeps the weather and active-user pills visible.
4. Account & Profile shows the Weather Location card.
5. Clearing a location returns the header popup to the settings prompt.

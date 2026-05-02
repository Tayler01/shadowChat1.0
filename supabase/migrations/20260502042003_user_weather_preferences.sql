/*
  # User weather preferences

  Stores each signed-in user's selected weather location for the General Chat
  header widget. Location preferences are private to the owning user and kept
  out of public profile rows.
*/

CREATE TABLE IF NOT EXISTS public.user_weather_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  location_name text NOT NULL CHECK (char_length(trim(location_name)) BETWEEN 2 AND 180),
  latitude double precision NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude double precision NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  timezone text,
  country_code text CHECK (country_code IS NULL OR char_length(country_code) = 2),
  admin1 text,
  temperature_unit text NOT NULL DEFAULT 'fahrenheit' CHECK (temperature_unit IN ('fahrenheit', 'celsius')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_weather_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own weather preference" ON public.user_weather_preferences;
DROP POLICY IF EXISTS "Users can create their own weather preference" ON public.user_weather_preferences;
DROP POLICY IF EXISTS "Users can update their own weather preference" ON public.user_weather_preferences;
DROP POLICY IF EXISTS "Users can delete their own weather preference" ON public.user_weather_preferences;

CREATE POLICY "Users can read their own weather preference"
ON public.user_weather_preferences
FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create their own weather preference"
ON public.user_weather_preferences
FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update their own weather preference"
ON public.user_weather_preferences
FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete their own weather preference"
ON public.user_weather_preferences
FOR DELETE
TO authenticated
USING ((select auth.uid()) = user_id);

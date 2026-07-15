import { getWorkingClient } from './supabase'

export type WeatherTemperatureUnit = 'fahrenheit' | 'celsius'

export type WeatherConditionKind =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'unknown'

export interface WeatherLocationResult {
  id: number
  name: string
  latitude: number
  longitude: number
  timezone?: string
  country?: string
  country_code?: string
  admin1?: string
}

export interface WeatherPreference {
  user_id: string
  location_name: string
  latitude: number
  longitude: number
  timezone?: string | null
  country_code?: string | null
  admin1?: string | null
  temperature_unit: WeatherTemperatureUnit
  created_at?: string
  updated_at?: string
}

export interface SavedWeatherLocation {
  id: string
  user_id: string
  location_name: string
  latitude: number
  longitude: number
  timezone?: string | null
  country_code?: string | null
  admin1?: string | null
  created_at: string
  updated_at: string
}

export interface WeatherCondition {
  kind: WeatherConditionKind
  label: string
}

export interface WeatherCurrentConditions {
  time: string
  temperature: number
  apparentTemperature: number
  relativeHumidity: number
  precipitation: number
  weatherCode: number
  isDay: boolean
  windSpeed: number
  windGusts: number
  dewPoint: number
  visibility: number
  pressure: number
  uvIndex: number
  condition: WeatherCondition
}

export interface WeatherHourlyForecast {
  time: string
  temperature: number
  apparentTemperature: number
  precipitationProbability: number | null
  precipitation: number
  weatherCode: number
  windSpeed: number
  windGusts: number
  relativeHumidity: number
  condition: WeatherCondition
}

export interface WeatherDailyForecast {
  date: string
  weatherCode: number
  condition: WeatherCondition
  temperatureMax: number
  temperatureMin: number
  precipitationProbabilityMax: number | null
  precipitationSum: number | null
  rainSum: number | null
  snowfallSum: number | null
  windSpeedMax: number | null
  windGustsMax: number | null
  sunrise: string | null
  sunset: string | null
  uvIndexMax: number | null
}

export interface WeatherForecast {
  current: WeatherCurrentConditions
  hourly: WeatherHourlyForecast[]
  daily: WeatherDailyForecast[]
  timezone: string
  temperatureUnit: WeatherTemperatureUnit
  windSpeedUnit: 'mph' | 'km/h'
  precipitationUnit: 'in' | 'mm'
  visibilityUnit: 'mi' | 'km'
}

export interface WeatherAlert {
  id: string
  headline: string
  event: string
  severity: string
  urgency: string
  description: string
  instruction: string | null
  effective: string | null
  expires: string | null
  web: string | null
}

export interface WeatherRadarFrame {
  time: number
  path: string
  forecast: boolean
}

export interface WeatherRadarManifest {
  host: string
  frames: WeatherRadarFrame[]
  generatedAt: number | null
}

const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const NWS_ALERTS_ENDPOINT = 'https://api.weather.gov/alerts/active'
const RAINVIEWER_ENDPOINT = 'https://api.rainviewer.com/public/weather-maps.json'

export const WEATHER_PREFERENCE_UPDATED_EVENT = 'shadowchat:weather-preference-updated'

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const toNullableNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const normalizeUnit = (value?: string | null): WeatherTemperatureUnit =>
  value === 'celsius' ? 'celsius' : 'fahrenheit'

const optionalText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value : null

export const formatTemperature = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  return `${Math.round(value)}\u00b0`
}

export const getTemperatureUnitLabel = (unit: WeatherTemperatureUnit) =>
  unit === 'celsius' ? 'C' : 'F'

export const getWeatherLocationLabel = (location: Pick<
  WeatherLocationResult,
  'name' | 'admin1' | 'country' | 'country_code'
>) => {
  const parts = [
    location.name,
    location.admin1,
    location.country || location.country_code,
  ].filter((part, index, allParts): part is string => (
    Boolean(part) && allParts.findIndex(candidate => candidate === part) === index
  ))

  return parts.join(', ')
}

export const weatherPreferenceToLocation = (preference: WeatherPreference): WeatherLocationResult => ({
  id: 0,
  name: preference.location_name,
  latitude: preference.latitude,
  longitude: preference.longitude,
  timezone: preference.timezone || undefined,
  country_code: preference.country_code || undefined,
  admin1: preference.admin1 || undefined,
})

export const savedWeatherLocationToResult = (location: SavedWeatherLocation): WeatherLocationResult => ({
  id: 0,
  name: location.location_name,
  latitude: location.latitude,
  longitude: location.longitude,
  timezone: location.timezone || undefined,
  country_code: location.country_code || undefined,
  admin1: location.admin1 || undefined,
})

export const getWeatherCondition = (
  weatherCode: number | null | undefined,
  isDay = true
): WeatherCondition => {
  if (weatherCode === 0) return { kind: 'clear', label: isDay ? 'Clear' : 'Clear night' }
  if (weatherCode === 1 || weatherCode === 2) return { kind: 'partly-cloudy', label: 'Partly cloudy' }
  if (weatherCode === 3) return { kind: 'cloudy', label: 'Cloudy' }
  if (weatherCode === 45 || weatherCode === 48) return { kind: 'fog', label: 'Fog' }
  if ([51, 53, 55, 56, 57].includes(Number(weatherCode))) return { kind: 'drizzle', label: 'Drizzle' }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(Number(weatherCode))) return { kind: 'rain', label: 'Rain' }
  if ([71, 73, 75, 77, 85, 86].includes(Number(weatherCode))) return { kind: 'snow', label: 'Snow' }
  if ([95, 96, 99].includes(Number(weatherCode))) return { kind: 'thunderstorm', label: 'Thunderstorms' }
  return { kind: 'unknown', label: 'Weather' }
}

export async function searchWeatherLocations(query: string): Promise<WeatherLocationResult[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) return []

  const url = new URL(GEOCODING_ENDPOINT)
  url.searchParams.set('name', normalizedQuery)
  url.searchParams.set('count', '8')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error('Unable to search locations')

  const payload = await response.json()
  return Array.isArray(payload.results) ? payload.results : []
}

export async function fetchWeatherPreference(userId: string): Promise<WeatherPreference | null> {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('user_weather_preferences')
    .select('user_id, location_name, latitude, longitude, timezone, country_code, admin1, temperature_unit, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return {
    ...(data as WeatherPreference),
    temperature_unit: normalizeUnit((data as WeatherPreference).temperature_unit),
  }
}

export async function saveWeatherPreference(
  location: WeatherLocationResult,
  temperatureUnit: WeatherTemperatureUnit = 'fahrenheit'
): Promise<WeatherPreference> {
  const workingClient = await getWorkingClient()
  const { data: { user }, error: userError } = await workingClient.auth.getUser()

  if (userError) throw userError
  if (!user) throw new Error('Sign in before setting weather')

  const row = {
    user_id: user.id,
    location_name: location.id === 0 ? location.name : getWeatherLocationLabel(location),
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone || null,
    country_code: location.country_code || null,
    admin1: location.admin1 || null,
    temperature_unit: temperatureUnit,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await workingClient
    .from('user_weather_preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select('user_id, location_name, latitude, longitude, timezone, country_code, admin1, temperature_unit, created_at, updated_at')
    .single()

  if (error) throw error
  return {
    ...(data as WeatherPreference),
    temperature_unit: normalizeUnit((data as WeatherPreference).temperature_unit),
  }
}

export async function clearWeatherPreference(userId: string) {
  const workingClient = await getWorkingClient()
  const { error } = await workingClient
    .from('user_weather_preferences')
    .delete()
    .eq('user_id', userId)

  if (error) throw error
}

export async function fetchSavedWeatherLocations(userId: string): Promise<SavedWeatherLocation[]> {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('user_weather_locations')
    .select('id, user_id, location_name, latitude, longitude, timezone, country_code, admin1, created_at, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data || []) as SavedWeatherLocation[]
}

export async function saveWeatherLocation(location: WeatherPreference): Promise<SavedWeatherLocation> {
  const workingClient = await getWorkingClient()
  const row = {
    user_id: location.user_id,
    location_name: location.location_name,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone || null,
    country_code: location.country_code || null,
    admin1: location.admin1 || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await workingClient
    .from('user_weather_locations')
    .upsert(row, { onConflict: 'user_id,latitude,longitude' })
    .select('id, user_id, location_name, latitude, longitude, timezone, country_code, admin1, created_at, updated_at')
    .single()

  if (error) throw error
  return data as SavedWeatherLocation
}

export async function deleteSavedWeatherLocation(locationId: string, userId: string) {
  const workingClient = await getWorkingClient()
  const { error } = await workingClient
    .from('user_weather_locations')
    .delete()
    .eq('id', locationId)
    .eq('user_id', userId)

  if (error) throw error
}

async function fetchWeatherForecastForScope(
  preference: WeatherPreference,
  detailed: boolean
): Promise<WeatherForecast> {
  const temperatureUnit = normalizeUnit(preference.temperature_unit)
  const metric = temperatureUnit === 'celsius'
  const url = new URL(FORECAST_ENDPOINT)
  url.searchParams.set('latitude', String(preference.latitude))
  url.searchParams.set('longitude', String(preference.longitude))
  const currentFields = [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'precipitation',
    'weather_code',
    'is_day',
    'wind_speed_10m',
    'wind_gusts_10m',
  ]
  if (detailed) currentFields.push('dew_point_2m', 'visibility', 'surface_pressure')
  url.searchParams.set('current', currentFields.join(','))
  if (detailed) {
    url.searchParams.set('hourly', [
      'temperature_2m',
      'apparent_temperature',
      'precipitation_probability',
      'precipitation',
      'weather_code',
      'wind_speed_10m',
      'wind_gusts_10m',
      'relative_humidity_2m',
      'uv_index',
    ].join(','))
  }
  const dailyFields = [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_probability_max',
    'precipitation_sum',
  ]
  if (detailed) {
    dailyFields.push(
      'rain_sum',
      'snowfall_sum',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'sunrise',
      'sunset',
      'uv_index_max'
    )
  }
  url.searchParams.set('daily', dailyFields.join(','))
  url.searchParams.set('forecast_days', detailed ? '10' : '5')
  url.searchParams.set('timezone', preference.timezone || 'auto')
  url.searchParams.set('temperature_unit', temperatureUnit)
  url.searchParams.set('wind_speed_unit', metric ? 'kmh' : 'mph')
  url.searchParams.set('precipitation_unit', metric ? 'mm' : 'inch')

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error('Unable to load weather')

  const payload = await response.json()
  if (!payload.current || !payload.daily || (detailed && !payload.hourly)) {
    throw new Error('Weather response was incomplete')
  }

  const currentCode = toNumber(payload.current.weather_code)
  const isDay = payload.current.is_day !== 0
  const currentTime = String(payload.current.time || '')
  const hourlyTimes = Array.isArray(payload.hourly?.time) ? payload.hourly.time : []
  const firstCurrentHour = Math.max(0, hourlyTimes.findIndex((time: string) => time >= currentTime))
  const rawVisibility = toNumber(payload.current.visibility)
  const dailyTimes = Array.isArray(payload.daily.time) ? payload.daily.time : []
  const currentHourIndex = firstCurrentHour

  return {
    timezone: payload.timezone || preference.timezone || 'Local',
    temperatureUnit,
    windSpeedUnit: metric ? 'km/h' : 'mph',
    precipitationUnit: metric ? 'mm' : 'in',
    visibilityUnit: metric ? 'km' : 'mi',
    current: {
      time: currentTime,
      temperature: toNumber(payload.current.temperature_2m),
      apparentTemperature: toNumber(payload.current.apparent_temperature),
      relativeHumidity: toNumber(payload.current.relative_humidity_2m),
      precipitation: toNumber(payload.current.precipitation),
      weatherCode: currentCode,
      isDay,
      windSpeed: toNumber(payload.current.wind_speed_10m),
      windGusts: toNumber(payload.current.wind_gusts_10m),
      dewPoint: toNumber(payload.current.dew_point_2m),
      visibility: rawVisibility / (metric ? 1000 : 1609.344),
      pressure: toNumber(payload.current.surface_pressure),
      uvIndex: toNumber(payload.hourly?.uv_index?.[currentHourIndex]),
      condition: getWeatherCondition(currentCode, isDay),
    },
    hourly: hourlyTimes.slice(firstCurrentHour, firstCurrentHour + 24).map((time: string, offset: number) => {
      const index = firstCurrentHour + offset
      const weatherCode = toNumber(payload.hourly?.weather_code?.[index])
      return {
        time,
        temperature: toNumber(payload.hourly?.temperature_2m?.[index]),
        apparentTemperature: toNumber(payload.hourly?.apparent_temperature?.[index]),
        precipitationProbability: toNullableNumber(payload.hourly?.precipitation_probability?.[index]),
        precipitation: toNumber(payload.hourly?.precipitation?.[index]),
        weatherCode,
        windSpeed: toNumber(payload.hourly?.wind_speed_10m?.[index]),
        windGusts: toNumber(payload.hourly?.wind_gusts_10m?.[index]),
        relativeHumidity: toNumber(payload.hourly?.relative_humidity_2m?.[index]),
        condition: getWeatherCondition(weatherCode, true),
      }
    }),
    daily: dailyTimes.map((date: string, index: number) => {
      const weatherCode = toNumber(payload.daily.weather_code?.[index])
      return {
        date,
        weatherCode,
        condition: getWeatherCondition(weatherCode, true),
        temperatureMax: toNumber(payload.daily.temperature_2m_max?.[index]),
        temperatureMin: toNumber(payload.daily.temperature_2m_min?.[index]),
        precipitationProbabilityMax: toNullableNumber(payload.daily.precipitation_probability_max?.[index]),
        precipitationSum: toNullableNumber(payload.daily.precipitation_sum?.[index]),
        rainSum: toNullableNumber(payload.daily.rain_sum?.[index]),
        snowfallSum: toNullableNumber(payload.daily.snowfall_sum?.[index]),
        windSpeedMax: toNullableNumber(payload.daily.wind_speed_10m_max?.[index]),
        windGustsMax: toNullableNumber(payload.daily.wind_gusts_10m_max?.[index]),
        sunrise: optionalText(payload.daily.sunrise?.[index]),
        sunset: optionalText(payload.daily.sunset?.[index]),
        uvIndexMax: toNullableNumber(payload.daily.uv_index_max?.[index]),
      }
    }),
  }
}

export function fetchWeatherForecast(preference: WeatherPreference): Promise<WeatherForecast> {
  return fetchWeatherForecastForScope(preference, false)
}

export function fetchDetailedWeatherForecast(preference: WeatherPreference): Promise<WeatherForecast> {
  return fetchWeatherForecastForScope(preference, true)
}

export async function fetchWeatherAlerts(preference: WeatherPreference): Promise<WeatherAlert[]> {
  if (preference.country_code && preference.country_code.toUpperCase() !== 'US') return []
  const url = new URL(NWS_ALERTS_ENDPOINT)
  url.searchParams.set('point', `${preference.latitude},${preference.longitude}`)

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/geo+json' },
    })
    if (!response.ok) return []

    const payload = await response.json()
    const features = Array.isArray(payload.features) ? payload.features : []
    return features.map((feature: Record<string, unknown>) => {
      const properties = (feature.properties || {}) as Record<string, unknown>
      return {
        id: String(feature.id || properties.id || crypto.randomUUID()),
        headline: String(properties.headline || properties.event || 'Weather alert'),
        event: String(properties.event || 'Weather alert'),
        severity: String(properties.severity || 'Unknown'),
        urgency: String(properties.urgency || 'Unknown'),
        description: String(properties.description || ''),
        instruction: optionalText(properties.instruction),
        effective: optionalText(properties.effective),
        expires: optionalText(properties.expires),
        web: optionalText(properties['@id'] || feature.id),
      }
    })
  } catch {
    return []
  }
}

export async function fetchWeatherRadarManifest(): Promise<WeatherRadarManifest> {
  const response = await fetch(RAINVIEWER_ENDPOINT)
  if (!response.ok) throw new Error('Radar is temporarily unavailable')

  const payload = await response.json()
  const past = Array.isArray(payload.radar?.past) ? payload.radar.past : []
  const nowcast = Array.isArray(payload.radar?.nowcast) ? payload.radar.nowcast : []
  return {
    host: typeof payload.host === 'string' ? payload.host : 'https://tilecache.rainviewer.com',
    generatedAt: toNullableNumber(payload.generated),
    frames: [
      ...past.map((frame: Record<string, unknown>) => ({
        time: toNumber(frame.time),
        path: String(frame.path || ''),
        forecast: false,
      })),
      ...nowcast.map((frame: Record<string, unknown>) => ({
        time: toNumber(frame.time),
        path: String(frame.path || ''),
        forecast: true,
      })),
    ].filter(frame => frame.time > 0 && frame.path),
  }
}

export function notifyWeatherPreferenceUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(WEATHER_PREFERENCE_UPDATED_EVENT))
}

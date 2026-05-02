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
}

export interface WeatherForecast {
  current: WeatherCurrentConditions
  daily: WeatherDailyForecast[]
  timezone: string
  temperatureUnit: WeatherTemperatureUnit
}

const GEOCODING_ENDPOINT = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

export const WEATHER_PREFERENCE_UPDATED_EVENT = 'shadowchat:weather-preference-updated'

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const normalizeUnit = (value?: string | null): WeatherTemperatureUnit =>
  value === 'celsius' ? 'celsius' : 'fahrenheit'

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

export const getWeatherCondition = (
  weatherCode: number | null | undefined,
  isDay = true
): WeatherCondition => {
  if (weatherCode === 0) {
    return { kind: 'clear', label: isDay ? 'Clear' : 'Clear night' }
  }

  if (weatherCode === 1 || weatherCode === 2) {
    return { kind: 'partly-cloudy', label: 'Partly cloudy' }
  }

  if (weatherCode === 3) {
    return { kind: 'cloudy', label: 'Cloudy' }
  }

  if (weatherCode === 45 || weatherCode === 48) {
    return { kind: 'fog', label: 'Fog' }
  }

  if ([51, 53, 55, 56, 57].includes(Number(weatherCode))) {
    return { kind: 'drizzle', label: 'Drizzle' }
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(Number(weatherCode))) {
    return { kind: 'rain', label: 'Rain' }
  }

  if ([71, 73, 75, 77, 85, 86].includes(Number(weatherCode))) {
    return { kind: 'snow', label: 'Snow' }
  }

  if ([95, 96, 99].includes(Number(weatherCode))) {
    return { kind: 'thunderstorm', label: 'Thunderstorms' }
  }

  return { kind: 'unknown', label: 'Weather' }
}

export async function searchWeatherLocations(query: string): Promise<WeatherLocationResult[]> {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length < 2) return []

  const url = new URL(GEOCODING_ENDPOINT)
  url.searchParams.set('name', normalizedQuery)
  url.searchParams.set('count', '6')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error('Unable to search locations')
  }

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
    location_name: getWeatherLocationLabel(location),
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

export async function fetchWeatherForecast(
  preference: WeatherPreference
): Promise<WeatherForecast> {
  const temperatureUnit = normalizeUnit(preference.temperature_unit)
  const url = new URL(FORECAST_ENDPOINT)
  url.searchParams.set('latitude', String(preference.latitude))
  url.searchParams.set('longitude', String(preference.longitude))
  url.searchParams.set('current', [
    'temperature_2m',
    'apparent_temperature',
    'relative_humidity_2m',
    'precipitation',
    'weather_code',
    'is_day',
    'wind_speed_10m',
    'wind_gusts_10m',
  ].join(','))
  url.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_probability_max',
    'precipitation_sum',
  ].join(','))
  url.searchParams.set('forecast_days', '5')
  url.searchParams.set('timezone', preference.timezone || 'auto')
  url.searchParams.set('temperature_unit', temperatureUnit)
  url.searchParams.set('wind_speed_unit', 'mph')
  url.searchParams.set('precipitation_unit', 'inch')

  const response = await fetch(url.toString())
  if (!response.ok) {
    throw new Error('Unable to load weather')
  }

  const payload = await response.json()
  if (!payload.current || !payload.daily) {
    throw new Error('Weather response was incomplete')
  }

  const currentCode = toNumber(payload.current.weather_code)
  const isDay = payload.current.is_day !== 0
  const dailyTimes = Array.isArray(payload.daily.time) ? payload.daily.time : []

  return {
    timezone: payload.timezone || preference.timezone || 'Local',
    temperatureUnit,
    current: {
      time: payload.current.time,
      temperature: toNumber(payload.current.temperature_2m),
      apparentTemperature: toNumber(payload.current.apparent_temperature),
      relativeHumidity: toNumber(payload.current.relative_humidity_2m),
      precipitation: toNumber(payload.current.precipitation),
      weatherCode: currentCode,
      isDay,
      windSpeed: toNumber(payload.current.wind_speed_10m),
      windGusts: toNumber(payload.current.wind_gusts_10m),
      condition: getWeatherCondition(currentCode, isDay),
    },
    daily: dailyTimes.map((date: string, index: number) => {
      const weatherCode = toNumber(payload.daily.weather_code?.[index])
      return {
        date,
        weatherCode,
        condition: getWeatherCondition(weatherCode, true),
        temperatureMax: toNumber(payload.daily.temperature_2m_max?.[index]),
        temperatureMin: toNumber(payload.daily.temperature_2m_min?.[index]),
        precipitationProbabilityMax:
          typeof payload.daily.precipitation_probability_max?.[index] === 'number'
            ? payload.daily.precipitation_probability_max[index]
            : null,
        precipitationSum:
          typeof payload.daily.precipitation_sum?.[index] === 'number'
            ? payload.daily.precipitation_sum[index]
            : null,
      }
    }),
  }
}

export function notifyWeatherPreferenceUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(WEATHER_PREFERENCE_UPDATED_EVENT))
}

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useWeatherPreference } from './useWeatherPreference'
import {
  fetchWeatherForecast,
  type WeatherForecast,
  type WeatherPreference,
} from '../lib/weather'

const WEATHER_REFRESH_MS = 10 * 60 * 1000
const getVisibleDocument = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden'

type WeatherForecastState = {
  preference: WeatherPreference | null
  forecast: WeatherForecast | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

type ForecastCacheEntry = {
  forecast: WeatherForecast
  fetchedAt: number
}

const WeatherForecastContext = createContext<WeatherForecastState | null>(null)
const forecastCacheByPreferenceKey = new Map<string, ForecastCacheEntry>()
const forecastRequestByPreferenceKey = new Map<string, Promise<WeatherForecast>>()

const getPreferenceCacheKey = (preference: WeatherPreference) => [
  preference.location_name,
  preference.latitude,
  preference.longitude,
  preference.temperature_unit,
].join(':')

const getFreshForecastCache = (cacheKey: string) => {
  const cached = forecastCacheByPreferenceKey.get(cacheKey)
  if (!cached) return null
  return Date.now() - cached.fetchedAt < WEATHER_REFRESH_MS ? cached : null
}

const loadWeatherForecast = (preference: WeatherPreference, force = false) => {
  const cacheKey = getPreferenceCacheKey(preference)
  const cached = getFreshForecastCache(cacheKey)
  if (!force && cached) return Promise.resolve(cached.forecast)

  const existingRequest = forecastRequestByPreferenceKey.get(cacheKey)
  if (!force && existingRequest) return existingRequest

  const request = fetchWeatherForecast(preference)
    .then(forecast => {
      forecastCacheByPreferenceKey.set(cacheKey, {
        forecast,
        fetchedAt: Date.now(),
      })
      return forecast
    })
    .finally(() => {
      forecastRequestByPreferenceKey.delete(cacheKey)
    })

  forecastRequestByPreferenceKey.set(cacheKey, request)
  return request
}

function useWeatherForecastState(enabled = true): WeatherForecastState {
  const {
    preference,
    loading: preferenceLoading,
    error: preferenceError,
    refresh: refreshPreference,
  } = useWeatherPreference({ enabled })
  const cachedForecast = preference
    ? getFreshForecastCache(getPreferenceCacheKey(preference))?.forecast ?? null
    : null
  const [forecast, setForecast] = useState<WeatherForecast | null>(cachedForecast)
  const [loadingForecast, setLoadingForecast] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)
  const forecastRequestIdRef = useRef(0)

  const refreshForecast = useCallback(async (
    nextPreference: WeatherPreference | null = preference,
    options: { force?: boolean } = {}
  ) => {
    if (!enabled) return

    const requestId = forecastRequestIdRef.current + 1
    forecastRequestIdRef.current = requestId

    if (!nextPreference) {
      setForecast(null)
      setForecastError(null)
      return
    }

    const cacheKey = getPreferenceCacheKey(nextPreference)
    const cached = getFreshForecastCache(cacheKey)
    if (!options.force && cached) {
      setForecast(cached.forecast)
      setForecastError(null)
      setLoadingForecast(false)
      return
    }

    setLoadingForecast(!cached || Boolean(options.force))
    try {
      const nextForecast = await loadWeatherForecast(nextPreference, options.force)
      if (requestId === forecastRequestIdRef.current) {
        setForecast(nextForecast)
        setForecastError(null)
      }
    } catch (err) {
      if (requestId === forecastRequestIdRef.current) {
        setForecastError(err instanceof Error ? err.message : 'Unable to load weather')
      }
    } finally {
      if (requestId === forecastRequestIdRef.current) {
        setLoadingForecast(false)
      }
    }
  }, [enabled, preference])

  useEffect(() => {
    if (!enabled) return
    void refreshForecast()
  }, [enabled, refreshForecast])

  useEffect(() => {
    if (!enabled || !preference) return

    const refreshWhenVisible = () => {
      if (getVisibleDocument()) {
        void refreshForecast()
      }
    }

    const interval = window.setInterval(refreshWhenVisible, WEATHER_REFRESH_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshWhenVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshWhenVisible)
    }
  }, [enabled, preference, refreshForecast])

  const refresh = useCallback(async () => {
    if (!enabled) return
    const nextPreference = await refreshPreference()
    await refreshForecast(nextPreference ?? null, { force: true })
  }, [enabled, refreshForecast, refreshPreference])

  return useMemo(() => ({
    preference,
    forecast,
    loading: preferenceLoading || loadingForecast,
    error: preferenceError || forecastError,
    refresh,
  }), [forecast, forecastError, loadingForecast, preference, preferenceError, preferenceLoading, refresh])
}

export function WeatherProvider({ children }: { children: ReactNode }) {
  const value = useWeatherForecastState(true)

  return createElement(WeatherForecastContext.Provider, { value }, children)
}

export function useWeatherForecast() {
  const context = useContext(WeatherForecastContext)
  const fallback = useWeatherForecastState(!context)
  return context ?? fallback
}

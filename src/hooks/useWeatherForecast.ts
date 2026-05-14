import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWeatherPreference } from './useWeatherPreference'
import {
  fetchWeatherForecast,
  type WeatherForecast,
  type WeatherPreference,
} from '../lib/weather'

const WEATHER_REFRESH_MS = 10 * 60 * 1000
const getVisibleDocument = () =>
  typeof document === 'undefined' || document.visibilityState !== 'hidden'

export function useWeatherForecast() {
  const {
    preference,
    loading: preferenceLoading,
    error: preferenceError,
    refresh: refreshPreference,
  } = useWeatherPreference()
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [loadingForecast, setLoadingForecast] = useState(false)
  const [forecastError, setForecastError] = useState<string | null>(null)
  const forecastRequestIdRef = useRef(0)

  const refreshForecast = useCallback(async (nextPreference: WeatherPreference | null = preference) => {
    const requestId = forecastRequestIdRef.current + 1
    forecastRequestIdRef.current = requestId

    if (!nextPreference) {
      setForecast(null)
      setForecastError(null)
      return
    }

    setLoadingForecast(true)
    try {
      const nextForecast = await fetchWeatherForecast(nextPreference)
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
  }, [preference])

  useEffect(() => {
    void refreshForecast()
  }, [refreshForecast])

  useEffect(() => {
    if (!preference) return

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
  }, [preference, refreshForecast])

  const refresh = useCallback(async () => {
    const nextPreference = await refreshPreference()
    await refreshForecast(nextPreference ?? null)
  }, [refreshForecast, refreshPreference])

  return useMemo(() => ({
    preference,
    forecast,
    loading: preferenceLoading || loadingForecast,
    error: preferenceError || forecastError,
    refresh,
  }), [forecast, forecastError, loadingForecast, preference, preferenceError, preferenceLoading, refresh])
}

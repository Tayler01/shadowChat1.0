import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWeatherPreference } from './useWeatherPreference'
import {
  fetchWeatherForecast,
  type WeatherForecast,
} from '../lib/weather'

const WEATHER_REFRESH_MS = 10 * 60 * 1000

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

  const refreshForecast = useCallback(async () => {
    if (!preference) {
      setForecast(null)
      setForecastError(null)
      return
    }

    setLoadingForecast(true)
    try {
      setForecast(await fetchWeatherForecast(preference))
      setForecastError(null)
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : 'Unable to load weather')
    } finally {
      setLoadingForecast(false)
    }
  }, [preference])

  useEffect(() => {
    void refreshForecast()
  }, [refreshForecast])

  useEffect(() => {
    if (!preference) return

    const interval = window.setInterval(() => {
      void refreshForecast()
    }, WEATHER_REFRESH_MS)

    return () => window.clearInterval(interval)
  }, [preference, refreshForecast])

  const refresh = useCallback(async () => {
    await refreshPreference()
    await refreshForecast()
  }, [refreshForecast, refreshPreference])

  return useMemo(() => ({
    preference,
    forecast,
    loading: preferenceLoading || loadingForecast,
    error: preferenceError || forecastError,
    refresh,
  }), [forecast, forecastError, loadingForecast, preference, preferenceError, preferenceLoading, refresh])
}

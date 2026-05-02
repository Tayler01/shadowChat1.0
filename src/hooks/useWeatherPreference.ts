import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './useAuth'
import {
  clearWeatherPreference,
  fetchWeatherPreference,
  notifyWeatherPreferenceUpdated,
  saveWeatherPreference,
  WEATHER_PREFERENCE_UPDATED_EVENT,
  type WeatherLocationResult,
  type WeatherPreference,
  type WeatherTemperatureUnit,
} from '../lib/weather'

export function useWeatherPreference() {
  const { user } = useAuth()
  const [preference, setPreference] = useState<WeatherPreference | null>(null)
  const [loading, setLoading] = useState(Boolean(user))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setPreference(null)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    try {
      setPreference(await fetchWeatherPreference(user.id))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load weather location')
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleUpdated = () => {
      void refresh()
    }

    window.addEventListener(WEATHER_PREFERENCE_UPDATED_EVENT, handleUpdated)
    return () => window.removeEventListener(WEATHER_PREFERENCE_UPDATED_EVENT, handleUpdated)
  }, [refresh])

  const save = useCallback(async (
    location: WeatherLocationResult,
    temperatureUnit: WeatherTemperatureUnit = preference?.temperature_unit || 'fahrenheit'
  ) => {
    setSaving(true)
    try {
      const nextPreference = await saveWeatherPreference(location, temperatureUnit)
      setPreference(nextPreference)
      setError(null)
      notifyWeatherPreferenceUpdated()
      return nextPreference
    } finally {
      setSaving(false)
    }
  }, [preference?.temperature_unit])

  const clear = useCallback(async () => {
    if (!user?.id) return

    setSaving(true)
    try {
      await clearWeatherPreference(user.id)
      setPreference(null)
      setError(null)
      notifyWeatherPreferenceUpdated()
    } finally {
      setSaving(false)
    }
  }, [user?.id])

  return useMemo(() => ({
    preference,
    loading,
    saving,
    error,
    refresh,
    save,
    clear,
  }), [clear, error, loading, preference, refresh, save, saving])
}

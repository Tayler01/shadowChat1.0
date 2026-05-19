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

const cachedPreferenceByUserId = new Map<string, WeatherPreference | null>()
const preferenceRequestByUserId = new Map<string, Promise<WeatherPreference | null>>()

type UseWeatherPreferenceOptions = {
  enabled?: boolean
}

const loadWeatherPreference = (userId: string, force = false) => {
  if (!force && cachedPreferenceByUserId.has(userId)) {
    return Promise.resolve(cachedPreferenceByUserId.get(userId) ?? null)
  }

  const existingRequest = preferenceRequestByUserId.get(userId)
  if (!force && existingRequest) return existingRequest

  const request = fetchWeatherPreference(userId)
    .then(preference => {
      cachedPreferenceByUserId.set(userId, preference)
      return preference
    })
    .finally(() => {
      preferenceRequestByUserId.delete(userId)
    })

  preferenceRequestByUserId.set(userId, request)
  return request
}

export function useWeatherPreference(options: UseWeatherPreferenceOptions = {}) {
  const enabled = options.enabled ?? true
  const { user } = useAuth()
  const cachedPreference = user?.id && cachedPreferenceByUserId.has(user.id)
    ? cachedPreferenceByUserId.get(user.id) ?? null
    : null
  const [preference, setPreference] = useState<WeatherPreference | null>(cachedPreference)
  const [loading, setLoading] = useState(Boolean(enabled && user?.id && !cachedPreferenceByUserId.has(user.id)))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (force = false) => {
    if (!enabled || !user?.id) {
      setPreference(null)
      setLoading(false)
      return null
    }

    const hasCachedPreference = cachedPreferenceByUserId.has(user.id)
    if (!force && hasCachedPreference) {
      const nextPreference = cachedPreferenceByUserId.get(user.id) ?? null
      setPreference(nextPreference)
      setLoading(false)
      setError(null)
      return nextPreference
    }

    setLoading(!hasCachedPreference || force)
    try {
      const nextPreference = await loadWeatherPreference(user.id, force)
      setPreference(nextPreference)
      setError(null)
      return nextPreference
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load weather location')
      return null
    } finally {
      setLoading(false)
    }
  }, [enabled, user?.id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined

    const handleUpdated = () => {
      void refresh()
    }

    window.addEventListener(WEATHER_PREFERENCE_UPDATED_EVENT, handleUpdated)
    return () => window.removeEventListener(WEATHER_PREFERENCE_UPDATED_EVENT, handleUpdated)
  }, [enabled, refresh])

  const save = useCallback(async (
    location: WeatherLocationResult,
    temperatureUnit: WeatherTemperatureUnit = preference?.temperature_unit || 'fahrenheit'
  ) => {
    setSaving(true)
    try {
      const nextPreference = await saveWeatherPreference(location, temperatureUnit)
      if (user?.id) {
        cachedPreferenceByUserId.set(user.id, nextPreference)
      }
      setPreference(nextPreference)
      setError(null)
      notifyWeatherPreferenceUpdated()
      return nextPreference
    } finally {
      setSaving(false)
    }
  }, [preference?.temperature_unit, user?.id])

  const clear = useCallback(async () => {
    if (!user?.id) return

    setSaving(true)
    try {
      await clearWeatherPreference(user.id)
      cachedPreferenceByUserId.set(user.id, null)
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

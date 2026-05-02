import React, { useEffect, useMemo, useState } from 'react'
import { Check, CloudSun, Loader2, MapPin, Search, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useWeatherPreference } from '../../hooks/useWeatherPreference'
import {
  getWeatherLocationLabel,
  searchWeatherLocations,
  type WeatherLocationResult,
} from '../../lib/weather'
import { Button } from '../ui/Button'

const formatCoordinates = (latitude: number, longitude: number) =>
  `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`

export function WeatherLocationSettings() {
  const {
    preference,
    loading,
    saving,
    error: preferenceError,
    save,
    clear,
  } = useWeatherPreference()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WeatherLocationResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  useEffect(() => {
    if (!preference) return
    setQuery(preference.location_name)
  }, [preference])

  useEffect(() => {
    const normalizedQuery = query.trim()

    if (normalizedQuery.length < 2 || normalizedQuery === preference?.location_name) {
      setResults([])
      setSearching(false)
      setSearchError(null)
      return
    }

    let active = true
    const timer = window.setTimeout(() => {
      setSearching(true)
      searchWeatherLocations(normalizedQuery)
        .then(nextResults => {
          if (!active) return
          setResults(nextResults)
          setSearchError(null)
        })
        .catch(err => {
          if (!active) return
          setResults([])
          setSearchError(err instanceof Error ? err.message : 'Unable to search locations')
        })
        .finally(() => {
          if (active) {
            setSearching(false)
          }
        })
    }, 300)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [preference?.location_name, query])

  const selectedLabel = useMemo(() => (
    preference
      ? `${preference.location_name} / ${formatCoordinates(preference.latitude, preference.longitude)}`
      : 'No weather location selected'
  ), [preference])

  const handleSelect = async (location: WeatherLocationResult) => {
    try {
      const nextPreference = await save(location)
      setQuery(nextPreference.location_name)
      setResults([])
      toast.success('Weather location saved')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to save weather location')
    }
  }

  const handleClear = async () => {
    try {
      await clear()
      setQuery('')
      setResults([])
      toast.success('Weather location cleared')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Failed to clear weather location')
    }
  }

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-2.5 text-[var(--text-gold)]">
          <CloudSun className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Weather Location</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
            Choose the city used by the General Chat weather widget.
          </p>
        </div>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Current</p>
            <p className="mt-1 truncate text-sm font-medium text-[var(--text-primary)]">
              {loading ? 'Loading weather location' : selectedLabel}
            </p>
          </div>
          {preference && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleClear()}
              disabled={saving}
              className="w-full justify-center sm:w-auto"
            >
              <X className="mr-2 h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">Search city or postal code</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Nashville, New York, 90210..."
              className="obsidian-input w-full rounded-[var(--radius-md)] py-3 pl-9 pr-10 text-sm"
            />
            {(searching || saving) && (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
            )}
          </div>
        </label>

        {(preferenceError || searchError) && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-3 text-sm text-red-100">
            {preferenceError || searchError}
          </div>
        )}

        {results.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)]">
            {results.map(result => (
              <button
                key={`${result.id}-${result.latitude}-${result.longitude}`}
                type="button"
                onClick={() => void handleSelect(result)}
                disabled={saving}
                className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-[var(--border-subtle)] px-3 py-3 text-left last:border-b-0 transition-colors hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-60"
              >
                <MapPin className="h-4 w-4 text-[var(--text-gold)]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[var(--text-primary)]">
                    {getWeatherLocationLabel(result)}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                    {formatCoordinates(result.latitude, result.longitude)}
                    {result.timezone ? ` / ${result.timezone}` : ''}
                  </span>
                </span>
                <Check className="h-4 w-4 text-[var(--text-muted)]" />
              </button>
            ))}
          </div>
        )}

        {query.trim().length >= 2 && !searching && results.length === 0 && query.trim() !== preference?.location_name && !searchError && (
          <p className="mt-3 text-sm text-[var(--text-muted)]">No matching locations yet.</p>
        )}
      </div>
    </div>
  )
}

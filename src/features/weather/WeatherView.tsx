import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import {
  AlertTriangle,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  CloudRain,
  Compass,
  Droplets,
  Eye,
  Gauge,
  Loader2,
  LocateFixed,
  Map,
  MapPin,
  RefreshCw,
  Search,
  Share2,
  Sunrise,
  Sunset,
  Trash2,
  Wind,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import { useAuth } from '../../hooks/useAuth'
import { useOptionalMessages } from '../../hooks/MessagesContext'
import { useWeatherForecast } from '../../hooks/useWeatherForecast'
import { useWeatherPreference } from '../../hooks/useWeatherPreference'
import { uploadChatImageAsset } from '../../lib/supabase'
import {
  deleteSavedWeatherLocation,
  fetchDetailedWeatherForecast,
  fetchSavedWeatherLocations,
  fetchWeatherAlerts,
  formatTemperature,
  getTemperatureUnitLabel,
  getWeatherLocationLabel,
  savedWeatherLocationToResult,
  saveWeatherLocation,
  searchWeatherLocations,
  weatherPreferenceToLocation,
  type SavedWeatherLocation,
  type WeatherAlert,
  type WeatherDailyForecast,
  type WeatherForecast,
  type WeatherLocationResult,
  type WeatherTemperatureUnit,
} from '../../lib/weather'
import type { AppView } from '../../types/navigation'
import { WeatherIcon } from './WeatherIcon'

const RadarMap = lazy(() => import('./RadarMap').then(module => ({ default: module.RadarMap })))

interface WeatherViewProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
}

const formatHour = (time: string) => new Date(time).toLocaleTimeString(undefined, { hour: 'numeric' })
const formatDay = (date: string, index: number) => index === 0
  ? 'Today'
  : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
const formatClock = (time: string | null) => time
  ? new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  : '--'
const formatCoordinate = (value: number) => value.toFixed(3)

function DailyRow({ day, index }: { day: WeatherDailyForecast; index: number }) {
  return (
    <div className="grid grid-cols-[3.3rem_2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] px-3 py-2.5 sm:grid-cols-[4rem_2.25rem_minmax(0,1fr)_6rem_auto]">
      <span className="text-sm font-semibold text-[var(--text-primary)]">{formatDay(day.date, index)}</span>
      <span className="text-[var(--theme-accent-readable)]">
        <WeatherIcon kind={day.condition.kind} className="h-5 w-5" />
      </span>
      <span className="min-w-0 truncate text-xs text-[var(--text-muted)] sm:text-sm">{day.condition.label}</span>
      <span className="hidden items-center gap-1 text-xs text-[var(--text-muted)] sm:flex">
        <CloudRain className="h-3.5 w-3.5" />
        {day.precipitationProbabilityMax ?? 0}%
      </span>
      <span className="whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">
        {formatTemperature(day.temperatureMax)} <span className="text-[var(--text-muted)]">/ {formatTemperature(day.temperatureMin)}</span>
      </span>
    </div>
  )
}

function WeatherShareCard({ forecast, locationName }: { forecast: WeatherForecast; locationName: string }) {
  return (
    <div className="w-[360px] bg-[#090a0c] p-5 text-white">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d7aa46]">ShadowChat Weather</p>
      <h2 className="mt-2 text-xl font-bold">{locationName}</h2>
      <div className="mt-5 flex items-end justify-between rounded-2xl border border-[rgba(215,170,70,0.3)] bg-[linear-gradient(145deg,rgba(215,170,70,0.13),rgba(255,255,255,0.03))] p-5">
        <div>
          <p className="text-6xl font-black leading-none">{formatTemperature(forecast.current.temperature)}</p>
          <p className="mt-2 text-sm text-[#c5c2bc]">Feels like {formatTemperature(forecast.current.apparentTemperature)}</p>
        </div>
        <div className="text-right text-[#f4d27b]">
          <WeatherIcon kind={forecast.current.condition.kind} isDay={forecast.current.isDay} className="ml-auto h-10 w-10" />
          <p className="mt-2 text-sm font-semibold text-white">{forecast.current.condition.label}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {forecast.daily.slice(0, 3).map((day, index) => (
          <div key={day.date} className="rounded-xl bg-[rgba(255,255,255,0.05)] p-3">
            <p className="text-xs text-[#aaa7a1]">{formatDay(day.date, index)}</p>
            <WeatherIcon kind={day.condition.kind} className="mx-auto my-2 h-5 w-5 text-[#d7aa46]" />
            <p className="text-sm font-semibold">{formatTemperature(day.temperatureMax)} / {formatTemperature(day.temperatureMin)}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[10px] text-[#77736c]">Forecast by Open-Meteo</p>
    </div>
  )
}

export function WeatherView({ currentView, onViewChange }: WeatherViewProps) {
  const { user } = useAuth()
  const messages = useOptionalMessages()
  const {
    preference,
    loading: compactLoading,
    error: compactError,
    refresh: refreshCompact,
  } = useWeatherForecast()
  const { save, saving } = useWeatherPreference()
  const [forecast, setForecast] = useState<WeatherForecast | null>(null)
  const [detailedLoading, setDetailedLoading] = useState(false)
  const [detailedError, setDetailedError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<WeatherLocationResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [savedLocations, setSavedLocations] = useState<SavedWeatherLocation[]>([])
  const [savedLoading, setSavedLoading] = useState(false)
  const [alerts, setAlerts] = useState<WeatherAlert[]>([])
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [radarExpanded, setRadarExpanded] = useState(false)
  const [sharing, setSharing] = useState(false)
  const shareRef = useRef<HTMLDivElement>(null)

  const currentSavedLocation = useMemo(() => savedLocations.find(location => (
    preference && Math.abs(location.latitude - preference.latitude) < 0.00001
      && Math.abs(location.longitude - preference.longitude) < 0.00001
  )) || null, [preference, savedLocations])
  const loading = compactLoading || detailedLoading
  const error = detailedError || compactError

  const loadSavedLocations = useCallback(async () => {
    if (!user?.id) return
    setSavedLoading(true)
    try {
      setSavedLocations(await fetchSavedWeatherLocations(user.id))
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to load saved locations')
    } finally {
      setSavedLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void loadSavedLocations()
  }, [loadSavedLocations])

  useEffect(() => {
    if (!preference) {
      setForecast(null)
      setDetailedError(null)
      return
    }

    let active = true
    setDetailedLoading(true)
    fetchDetailedWeatherForecast(preference)
      .then(nextForecast => {
        if (!active) return
        setForecast(nextForecast)
        setDetailedError(null)
      })
      .catch(nextError => {
        if (!active) return
        setDetailedError(nextError instanceof Error ? nextError.message : 'Unable to load detailed weather')
      })
      .finally(() => {
        if (active) setDetailedLoading(false)
      })

    return () => {
      active = false
    }
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
        .catch(nextError => {
          if (!active) return
          setResults([])
          setSearchError(nextError instanceof Error ? nextError.message : 'Unable to search locations')
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 300)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [preference?.location_name, query])

  useEffect(() => {
    if (!preference) {
      setAlerts([])
      return
    }
    let active = true
    setAlertsLoading(true)
    fetchWeatherAlerts(preference)
      .then(nextAlerts => {
        if (active) setAlerts(nextAlerts)
      })
      .finally(() => {
        if (active) setAlertsLoading(false)
      })
    return () => {
      active = false
    }
  }, [preference])

  const selectLocation = async (location: WeatherLocationResult) => {
    try {
      const next = await save(location, preference?.temperature_unit || 'fahrenheit')
      setQuery(next.location_name)
      setResults([])
      toast.success(`Weather set to ${next.location_name}`)
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to update weather location')
    }
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Location is not supported by this browser.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      position => {
        const location: WeatherLocationResult = {
          id: Date.now(),
          name: 'Current location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }
        void selectLocation(location).finally(() => setLocating(false))
      },
      nextError => {
        setLocating(false)
        toast.error(nextError.code === nextError.PERMISSION_DENIED
          ? 'Location permission was denied. You can still search for a city.'
          : 'Your current location could not be determined.')
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 5 * 60_000 }
    )
  }

  const changeUnit = async (temperatureUnit: WeatherTemperatureUnit) => {
    if (!preference || preference.temperature_unit === temperatureUnit) return
    try {
      await save(weatherPreferenceToLocation(preference), temperatureUnit)
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to change units')
    }
  }

  const toggleSavedLocation = async () => {
    if (!preference || !user?.id) return
    try {
      if (currentSavedLocation) {
        await deleteSavedWeatherLocation(currentSavedLocation.id, user.id)
        setSavedLocations(current => current.filter(location => location.id !== currentSavedLocation.id))
        toast.success('Location removed from saved places')
      } else {
        const location = await saveWeatherLocation(preference)
        setSavedLocations(current => [location, ...current.filter(item => item.id !== location.id)])
        toast.success('Location saved')
      }
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to update saved places')
    }
  }

  const refreshAll = async () => {
    if (!preference) return
    setDetailedLoading(true)
    try {
      const [nextForecast, nextAlerts] = await Promise.all([
        fetchDetailedWeatherForecast(preference),
        fetchWeatherAlerts(preference),
        refreshCompact(),
      ])
      setForecast(nextForecast)
      setAlerts(nextAlerts)
      setDetailedError(null)
      toast.success('Weather updated')
    } catch (nextError) {
      setDetailedError(nextError instanceof Error ? nextError.message : 'Unable to refresh weather')
    } finally {
      setDetailedLoading(false)
    }
  }

  const shareWeather = async () => {
    if (!forecast || !preference || !shareRef.current || sharing) return
    setSharing(true)
    try {
      if (!messages) throw new Error('General Chat is still loading.')
      const target = shareRef.current
      const height = Math.max(1, Math.ceil(target.scrollHeight || target.getBoundingClientRect().height))
      const blob = await toBlob(target, {
        cacheBust: true,
        width: 360,
        height,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        backgroundColor: '#090a0c',
      })
      if (!blob) throw new Error('Unable to capture weather')
      const asset = await uploadChatImageAsset(
        new File([blob], `shado-weather-${Date.now()}.png`, { type: blob.type || 'image/png' }),
        'weather'
      )
      const sent = await messages.sendMessage(
        `Weather for ${preference.location_name}`,
        'image',
        asset.publicUrl,
        undefined,
        asset.thumbnailUrl
      )
      if (sent) toast.success('Weather shared to General Chat')
    } catch (nextError) {
      toast.error(nextError instanceof Error ? nextError.message : 'Unable to share weather')
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)+4.2rem)] text-sm md:pb-0" data-testid="weather-view">
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="Weather"
        eyebrow={preference?.location_name || 'Local forecast'}
        showSearch={false}
        className="hidden md:flex"
      />

      {forecast && preference && (
        <div ref={shareRef} aria-hidden="true" className="pointer-events-none fixed left-[-10000px] top-0">
          <WeatherShareCard forecast={forecast} locationName={preference.location_name} />
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pt-6">
        <div className="mx-auto w-full max-w-4xl space-y-4">
          <header className="border-b border-[var(--border-subtle)] px-1 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent-readable)]">Weather</p>
                <h1 className="mt-0.5 truncate text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
                  {preference?.location_name || 'Choose a location'}
                </h1>
                {preference && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <MapPin className="h-3.5 w-3.5" />
                    {formatCoordinate(preference.latitude)}, {formatCoordinate(preference.longitude)}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-0.5" aria-label="Temperature units">
                  {(['fahrenheit', 'celsius'] as const).map(unit => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => void changeUnit(unit)}
                      disabled={!preference || saving}
                      aria-pressed={preference?.temperature_unit === unit}
                      className={`min-h-10 min-w-10 rounded-full px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] ${preference?.temperature_unit === unit ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]' : 'text-[var(--text-muted)]'}`}
                    >
                      &deg;{getTemperatureUnitLabel(unit)}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => void refreshAll()} disabled={!preference || loading} aria-label="Refresh weather" className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-50">
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

          </header>

          <section className="glass-panel rounded-[var(--radius-md)] border border-[var(--border-panel)] p-2.5" aria-label="Choose weather location">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="relative block">
                <span className="sr-only">Search city or postal code</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search city or postal code"
                  className="obsidian-input min-h-12 w-full rounded-full py-3 pl-10 pr-11 text-base md:text-sm"
                />
                {searching && <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--theme-accent-readable)]" />}
              </label>
              <button type="button" onClick={useCurrentLocation} disabled={locating || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border-glow)] bg-[rgba(215,170,70,0.09)] px-3.5 text-sm font-semibold text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-55">
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                Use current location
              </button>
            </div>

            {searchError && <p role="alert" className="mt-3 text-sm text-red-100">{searchError}</p>}
            {results.length > 0 && (
              <div className="mt-2 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(6,7,8,0.97)] shadow-[var(--shadow-panel-strong)]">
                {results.map(result => (
                  <button key={`${result.id}-${result.latitude}`} type="button" onClick={() => void selectLocation(result)} disabled={saving} className="flex min-h-12 w-full items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3 text-left last:border-0 hover:bg-[rgba(255,255,255,0.04)] disabled:opacity-55">
                    <MapPin className="h-4 w-4 shrink-0 text-[var(--theme-accent-readable)]" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[var(--text-primary)]">{getWeatherLocationLabel(result)}</span>
                      <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{formatCoordinate(result.latitude)}, {formatCoordinate(result.longitude)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {savedLocations.length > 0 && (
            <section aria-labelledby="saved-weather-locations-title">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <h2 id="saved-weather-locations-title" className="font-semibold text-[var(--text-primary)]">Saved locations</h2>
                {savedLoading && <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {savedLocations.map(location => (
                  <button key={location.id} type="button" onClick={() => void selectLocation(savedWeatherLocationToResult(location))} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] ${currentSavedLocation?.id === location.id ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]' : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]'}`}>
                    {location.location_name}
                  </button>
                ))}
              </div>
            </section>
          )}

          {error && (
            <div role="alert" className="rounded-[var(--radius-lg)] border border-red-300/20 bg-red-950/15 px-4 py-3 text-red-100">{error}</div>
          )}

          {!preference ? (
            <section className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] p-8 text-center">
              <Compass className="mx-auto h-8 w-8 text-[var(--theme-accent-readable)]" />
              <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">Make weather local</h2>
              <p className="mx-auto mt-2 max-w-md leading-6 text-[var(--text-muted)]">Use your phone location or search for a city. Your location stays private to your account.</p>
            </section>
          ) : !forecast ? (
            <div className="grid min-h-52 place-items-center rounded-[var(--radius-xl)] border border-[var(--border-subtle)]">
              <Loader2 className="h-7 w-7 animate-spin text-[var(--theme-accent-readable)]" aria-label="Loading weather" />
            </div>
          ) : (
            <>
              <section className="rounded-[var(--radius-lg)] border border-[rgba(215,170,70,0.28)] bg-[linear-gradient(145deg,rgba(215,170,70,0.11),rgba(255,255,255,0.025))] p-4" aria-labelledby="current-weather-title">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p id="current-weather-title" className="text-xs font-semibold uppercase tracking-[0.17em] text-[var(--text-muted)]">Right now</p>
                    <p className="mt-2 text-5xl font-black tracking-[-0.055em] text-[var(--text-primary)] sm:text-6xl">{formatTemperature(forecast.current.temperature)}</p>
                    <p className="mt-1.5 text-xs text-[var(--text-secondary)] sm:text-sm">Feels like {formatTemperature(forecast.current.apparentTemperature)}</p>
                  </div>
                  <div className="text-right">
                    <span className="ml-auto grid h-14 w-14 place-items-center rounded-full border border-[var(--border-glow)] bg-[rgba(0,0,0,0.2)] text-[var(--theme-accent-readable)]">
                      <WeatherIcon kind={forecast.current.condition.kind} isDay={forecast.current.isDay} className="h-7 w-7" />
                    </span>
                    <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{forecast.current.condition.label}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: 'Humidity', value: `${Math.round(forecast.current.relativeHumidity)}%`, Icon: Droplets },
                    { label: 'Wind', value: `${Math.round(forecast.current.windSpeed)} ${forecast.windSpeedUnit}`, Icon: Wind },
                    { label: 'Gusts', value: `${Math.round(forecast.current.windGusts)} ${forecast.windSpeedUnit}`, Icon: Compass },
                    { label: 'Rain', value: `${forecast.current.precipitation.toFixed(2)} ${forecast.precipitationUnit}`, Icon: CloudRain },
                    { label: 'Dew point', value: formatTemperature(forecast.current.dewPoint), Icon: Droplets },
                    { label: 'Visibility', value: `${forecast.current.visibility.toFixed(1)} ${forecast.visibilityUnit}`, Icon: Eye },
                    { label: 'Pressure', value: `${Math.round(forecast.current.pressure)} hPa`, Icon: Gauge },
                    { label: 'UV index', value: forecast.current.uvIndex.toFixed(1), Icon: Sunrise },
                  ].map(({ label, value, Icon }) => (
                    <div key={label} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.17)] p-2.5">
                      <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]"><Icon className="h-3.5 w-3.5" />{label}</p>
                      <p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void toggleSavedLocation()} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]">
                    {currentSavedLocation ? <BookmarkCheck className="h-4 w-4 text-[var(--theme-accent-readable)]" /> : <Bookmark className="h-4 w-4" />}
                    {currentSavedLocation ? 'Saved' : 'Save location'}
                  </button>
                  <button type="button" onClick={() => void shareWeather()} disabled={sharing} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3.5 text-sm font-semibold text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-55">
                    {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                    Share to Chat
                  </button>
                  {currentSavedLocation && (
                    <button type="button" onClick={() => void toggleSavedLocation()} aria-label="Remove current location from saved places" className="grid min-h-11 min-w-11 place-items-center rounded-full border border-[var(--border-subtle)] text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </section>

              <section aria-labelledby="weather-alerts-title">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <h2 id="weather-alerts-title" className="text-base font-bold text-[var(--text-primary)] sm:text-lg">Severe weather alerts</h2>
                  <span className="text-xs text-[var(--text-muted)]">US alerts from NWS</span>
                </div>
                {alertsLoading ? (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4 text-[var(--text-muted)]">Checking official alerts...</div>
                ) : alerts.length ? (
                  <div className="space-y-2">
                    {alerts.map(alert => (
                      <details key={alert.id} className="group rounded-[var(--radius-lg)] border border-amber-300/25 bg-amber-950/15 p-4">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 font-semibold text-amber-50 focus-visible:outline-none">
                          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-300" />
                          <span className="min-w-0 flex-1">{alert.headline}</span>
                          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="mt-3 space-y-3 border-t border-amber-300/15 pt-3 text-sm leading-6 text-amber-50/80">
                          <p>{alert.description}</p>
                          {alert.instruction && <p className="font-medium text-amber-50">{alert.instruction}</p>}
                          <p className="text-xs">Severity: {alert.severity} / Urgency: {alert.urgency}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] p-4 text-[var(--text-muted)]">No active official alerts were found for this location.</div>
                )}
              </section>

              <section aria-labelledby="hourly-forecast-title">
                <h2 id="hourly-forecast-title" className="mb-3 px-1 text-base font-bold text-[var(--text-primary)] sm:text-lg">Next 24 hours</h2>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {forecast.hourly.map(hour => (
                    <article key={hour.time} className="min-w-[4.75rem] shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] px-2.5 py-3 text-center">
                      <p className="text-xs font-medium text-[var(--text-muted)]">{formatHour(hour.time)}</p>
                      <WeatherIcon kind={hour.condition.kind} className="mx-auto my-2.5 h-5 w-5 text-[var(--theme-accent-readable)]" />
                      <p className="text-sm font-bold text-[var(--text-primary)]">{formatTemperature(hour.temperature)}</p>
                      <p className="mt-1.5 text-[0.64rem] text-[#8ec8ed]">{hour.precipitationProbability ?? 0}% rain</p>
                    </article>
                  ))}
                </div>
              </section>

              <section aria-labelledby="daily-forecast-title">
                <h2 id="daily-forecast-title" className="mb-3 px-1 text-base font-bold text-[var(--text-primary)] sm:text-lg">10-day forecast</h2>
                <div className="space-y-2">
                  {forecast.daily.map((day, index) => <DailyRow key={day.date} day={day} index={index} />)}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5"><p className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Sunrise className="h-4 w-4" /> Sunrise</p><p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{formatClock(forecast.daily[0]?.sunrise || null)}</p></div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5"><p className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Sunset className="h-4 w-4" /> Sunset</p><p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{formatClock(forecast.daily[0]?.sunset || null)}</p></div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5"><p className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><Wind className="h-4 w-4" /> Peak wind</p><p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{Math.round(forecast.daily[0]?.windSpeedMax || 0)} {forecast.windSpeedUnit}</p></div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2.5"><p className="flex items-center gap-2 text-xs text-[var(--text-muted)]"><CloudRain className="h-4 w-4" /> Precipitation</p><p className="mt-1.5 text-sm font-semibold text-[var(--text-primary)]">{(forecast.daily[0]?.precipitationSum || 0).toFixed(2)} {forecast.precipitationUnit}</p></div>
                </div>
              </section>

              <section aria-labelledby="radar-title">
                <div className="mb-3 flex items-center justify-between gap-3 px-1">
                  <div>
                    <h2 id="radar-title" className="text-base font-bold text-[var(--text-primary)] sm:text-lg">Interactive radar</h2>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Pan, zoom, and scrub observed and forecast frames.</p>
                  </div>
                  {!radarExpanded && (
                    <button type="button" onClick={() => setRadarExpanded(true)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] px-4 font-semibold text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]">
                      <Map className="h-4 w-4" /> Show radar
                    </button>
                  )}
                </div>
                {radarExpanded && (
                  <Suspense fallback={<div className="grid h-80 place-items-center rounded-[var(--radius-xl)] border border-[var(--border-subtle)]"><Loader2 className="h-6 w-6 animate-spin text-[var(--theme-accent-readable)]" /></div>}>
                    <RadarMap latitude={preference.latitude} longitude={preference.longitude} locationName={preference.location_name} />
                  </Suspense>
                )}
              </section>

              <footer className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-4 py-3 text-xs leading-5 text-[var(--text-muted)]">
                Forecast by Open-Meteo. US severe alerts by the National Weather Service. Radar by RainViewer. Weather data is best-effort; follow official local guidance during dangerous conditions.
              </footer>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

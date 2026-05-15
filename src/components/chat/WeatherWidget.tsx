import React, { useEffect, useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Moon,
  Share2,
  Sun,
} from 'lucide-react'
import { useWeatherForecast } from '../../hooks/useWeatherForecast'
import {
  formatTemperature,
  getTemperatureUnitLabel,
  type WeatherConditionKind,
  type WeatherDailyForecast,
} from '../../lib/weather'

interface WeatherWidgetProps {
  onOpenSettings?: () => void
  onShareWeather?: (file: File) => Promise<void>
}

const SETTINGS_SECTION_STORAGE_KEY = 'shadowchat:settings-section'
const WEATHER_SETTINGS_SECTION = 'account-profile'
const iconClass = 'h-4 w-4'

function WeatherIcon({
  kind,
  isDay = true,
  className = iconClass,
}: {
  kind: WeatherConditionKind
  isDay?: boolean
  className?: string
}) {
  if (kind === 'clear') {
    return isDay ? <Sun className={className} /> : <Moon className={className} />
  }

  if (kind === 'partly-cloudy') return <CloudSun className={className} />
  if (kind === 'fog') return <CloudFog className={className} />
  if (kind === 'drizzle') return <CloudDrizzle className={className} />
  if (kind === 'rain') return <CloudRain className={className} />
  if (kind === 'snow') return <CloudSnow className={className} />
  if (kind === 'thunderstorm') return <CloudLightning className={className} />
  return <Cloud className={className} />
}

const formatDay = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
  })

const formatUpdated = (value?: string) => {
  if (!value) return 'Updated now'

  return `Updated ${new Date(value).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

function ForecastRow({
  day,
}: {
  day: WeatherDailyForecast
}) {
  return (
    <div className="grid grid-cols-[3rem_auto_1fr_auto] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {formatDay(day.date)}
      </span>
      <span className="text-[var(--text-gold)]">
        <WeatherIcon kind={day.condition.kind} className="h-4 w-4" />
      </span>
      <span className="truncate text-sm text-[var(--text-secondary)]">{day.condition.label}</span>
      <span className="text-sm font-medium text-[var(--text-primary)]">
        {formatTemperature(day.temperatureMax)} / {formatTemperature(day.temperatureMin)}
      </span>
    </div>
  )
}

export function WeatherWidget({ onOpenSettings, onShareWeather }: WeatherWidgetProps) {
  const { preference, forecast, loading, error } = useWeatherForecast()
  const [open, setOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const weatherShareRef = useRef<HTMLDivElement>(null)
  const current = forecast?.current

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const handleSettings = () => {
    setOpen(false)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, WEATHER_SETTINGS_SECTION)
    }
    onOpenSettings?.()
  }

  const handleShareWeather = async () => {
    if (!onShareWeather || !weatherShareRef.current || !current) return

    const captureTarget = weatherShareRef.current
    const captureRect = captureTarget.getBoundingClientRect()
    const captureWidth = Math.ceil(Math.max(captureTarget.scrollWidth, captureRect.width, 320))
    const measuredCaptureHeight = Math.max(captureTarget.scrollHeight, captureRect.height)
    const captureHeight = Math.ceil(measuredCaptureHeight || 1)

    setSharing(true)
    try {
      const blob = await toBlob(captureTarget, {
        cacheBust: true,
        width: captureWidth,
        height: captureHeight,
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-app').trim() || '#08090a',
        style: {
          width: `${captureWidth}px`,
          height: `${captureHeight}px`,
          maxHeight: 'none',
          overflow: 'visible',
          position: 'static',
          left: 'auto',
          top: 'auto',
          transform: 'none',
        },
        filter: node => !(node instanceof HTMLElement && node.dataset.weatherShareExclude === 'true'),
      })

      if (!blob) {
        throw new Error('Unable to capture weather')
      }

      await onShareWeather(new File([blob], `shado-weather-${Date.now()}.png`, { type: blob.type || 'image/png' }))
      setOpen(false)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.28)] sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs"
        aria-label={current ? `${formatTemperature(current.temperature)} and ${current.condition.label}` : 'Weather settings'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="text-[var(--text-gold)]">
          {current ? (
            <WeatherIcon kind={current.condition.kind} isDay={current.isDay} />
          ) : (
            <MapPin className="h-4 w-4" />
          )}
        </span>
        <span className="min-w-[1.8rem] text-center text-xs font-semibold text-[var(--text-primary)]">
          {current ? formatTemperature(current.temperature) : loading ? '--' : 'Set'}
        </span>
      </button>

      {open && (
        <div
          ref={weatherShareRef}
          role="dialog"
          aria-label="Weather forecast"
          className="popup-surface fixed left-1/2 top-[calc(env(safe-area-inset-top)_+_4.75rem)] z-[80] mt-0 max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_6rem)] w-[min(20rem,calc(100vw_-_1rem))] -translate-x-1/2 overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-panel)] shadow-[var(--shadow-panel-strong)] sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[calc(100vh_-_8rem)] sm:w-80 sm:max-w-[calc(100vw_-_2rem)] sm:translate-x-0 sm:overflow-hidden"
        >
          <div className="border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                  Weather
                </p>
                <p className="mt-1 truncate text-sm font-medium text-[var(--text-primary)]">
                  {preference?.location_name || 'No location selected'}
                </p>
              </div>
              {onShareWeather && current && (
                <button
                  type="button"
                  onClick={() => void handleShareWeather()}
                  disabled={sharing}
                  data-weather-share-exclude="true"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--theme-accent-readable)] disabled:cursor-wait disabled:opacity-60"
                  aria-label="Share weather to chat"
                >
                  <Share2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {!preference ? (
            <div className="px-4 py-5">
              <p className="text-sm leading-6 text-[var(--text-muted)]">
                Pick a city in Settings so General Chat can show your local weather here.
              </p>
              <button
                type="button"
                onClick={handleSettings}
                className="mt-4 w-full rounded-[var(--radius-sm)] border border-[var(--border-panel)] bg-[var(--bg-panel)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
              >
                Open Weather Settings
              </button>
            </div>
          ) : error ? (
            <div className="px-4 py-5 text-sm leading-6 text-red-100">
              {error}
            </div>
          ) : !current ? (
            <div className="px-4 py-5 text-sm text-[var(--text-muted)]">
              Loading weather.
            </div>
          ) : (
            <div className="space-y-4 p-4">
              <div className="rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.06)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-4xl font-semibold leading-none text-[var(--text-primary)]">
                      {formatTemperature(current.temperature)}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                      {'\u00b0'}{getTemperatureUnitLabel(forecast.temperatureUnit)}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[rgba(215,170,70,0.2)] bg-[rgba(255,255,255,0.04)] text-[var(--text-gold)]">
                      <WeatherIcon kind={current.condition.kind} isDay={current.isDay} className="h-6 w-6" />
                    </span>
                    <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{current.condition.label}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-[var(--radius-sm)] bg-[rgba(0,0,0,0.18)] p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Feels</p>
                    <p className="mt-1 font-medium text-[var(--text-primary)]">{formatTemperature(current.apparentTemperature)}</p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-[rgba(0,0,0,0.18)] p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Humidity</p>
                    <p className="mt-1 font-medium text-[var(--text-primary)]">{Math.round(current.relativeHumidity)}%</p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-[rgba(0,0,0,0.18)] p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Wind</p>
                    <p className="mt-1 font-medium text-[var(--text-primary)]">{Math.round(current.windSpeed)} mph</p>
                  </div>
                  <div className="rounded-[var(--radius-sm)] bg-[rgba(0,0,0,0.18)] p-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Rain</p>
                    <p className="mt-1 font-medium text-[var(--text-primary)]">{current.precipitation.toFixed(2)} in</p>
                  </div>
                </div>

                <p className="mt-3 text-xs text-[var(--text-muted)]">{formatUpdated(current.time)}</p>
              </div>

              <div className="space-y-2">
                {forecast.daily.map(day => (
                  <ForecastRow key={day.date} day={day} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

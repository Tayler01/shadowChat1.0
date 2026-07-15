import { MapPin } from 'lucide-react'
import { useWeatherForecast } from '../../hooks/useWeatherForecast'
import { formatTemperature } from '../../lib/weather'
import { WeatherIcon } from '../../features/weather/WeatherIcon'

interface WeatherWidgetProps {
  onOpen: () => void
  active?: boolean
  variant?: 'compact' | 'nav'
}

export function WeatherWidget({ onOpen, active = false, variant = 'compact' }: WeatherWidgetProps) {
  const { preference, forecast, loading } = useWeatherForecast()
  const current = forecast?.current
  const label = current
    ? `Open weather for ${preference?.location_name || 'your location'}, ${formatTemperature(current.temperature)} and ${current.condition.label}`
    : 'Open weather'

  return (
    <button
      type="button"
      onClick={onOpen}
      className={variant === 'nav'
        ? `flex h-full min-h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1.5 text-[0.625rem] transition-colors hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-accent)] ${active ? 'bg-[var(--nav-active-bg)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]' : 'text-[var(--text-muted)]'}`
        : 'inline-flex min-h-7 items-center gap-1 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] sm:min-h-8 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs'}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <span className={variant === 'nav' ? 'mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)] text-[var(--text-gold)]' : 'text-[var(--text-gold)]'}>
        {current ? (
          <WeatherIcon kind={current.condition.kind} isDay={current.isDay} className="h-4 w-4" />
        ) : (
          <MapPin className="h-4 w-4" />
        )}
      </span>
      <span className={variant === 'nav' ? '' : 'min-w-[1.8rem] text-center text-xs font-semibold text-[var(--text-primary)]'}>
        {variant === 'nav' ? 'Weather' : current ? formatTemperature(current.temperature) : loading ? '--' : 'Weather'}
      </span>
    </button>
  )
}

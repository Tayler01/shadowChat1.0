import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-react'
import type { WeatherConditionKind } from '../../lib/weather'

export function WeatherIcon({
  kind,
  isDay = true,
  className = 'h-5 w-5',
}: {
  kind: WeatherConditionKind
  isDay?: boolean
  className?: string
}) {
  if (kind === 'clear') return isDay ? <Sun className={className} /> : <Moon className={className} />
  if (kind === 'partly-cloudy') return <CloudSun className={className} />
  if (kind === 'fog') return <CloudFog className={className} />
  if (kind === 'drizzle') return <CloudDrizzle className={className} />
  if (kind === 'rain') return <CloudRain className={className} />
  if (kind === 'snow') return <CloudSnow className={className} />
  if (kind === 'thunderstorm') return <CloudLightning className={className} />
  return <Cloud className={className} />
}

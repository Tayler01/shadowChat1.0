import { useEffect, useMemo, useRef, useState } from 'react'
import L, { type Map as LeafletMap, type TileLayer } from 'leaflet'
import { Pause, Play, RefreshCw } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { useComfortPreferences } from '../../hooks/useComfortPreferences'
import {
  fetchWeatherRadarManifest,
  type WeatherRadarManifest,
} from '../../lib/weather'

interface RadarMapProps {
  latitude: number
  longitude: number
  locationName: string
}

const formatFrameTime = (unixSeconds: number) => new Date(unixSeconds * 1000).toLocaleTimeString(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

const RADAR_OPACITY = 0.68
const RADAR_FADE_MS = 220
const RADAR_FRAME_DWELL_MS = 1_000
const RADAR_LOAD_TIMEOUT_MS = 7_000

export function RadarMap({ latitude, longitude, locationName }: RadarMapProps) {
  const { isReducedMotion } = useComfortPreferences()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const radarLayerRef = useRef<TileLayer | null>(null)
  const pendingRadarLayerRef = useRef<TileLayer | null>(null)
  const radarRequestRef = useRef(0)
  const radarTransitionTimerRef = useRef<number | null>(null)
  const radarLoadTimerRef = useRef<number | null>(null)
  const [manifest, setManifest] = useState<WeatherRadarManifest | null>(null)
  const [frameIndex, setFrameIndex] = useState(0)
  const [displayedFrameIndex, setDisplayedFrameIndex] = useState<number | null>(null)
  const [frameLoading, setFrameLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)

  const frames = useMemo(() => manifest?.frames || [], [manifest?.frames])
  const frame = frames[frameIndex] || null
  const displayedFrame = displayedFrameIndex === null ? null : frames[displayedFrameIndex] || null

  const refresh = async () => {
    setLoading(true)
    try {
      const nextManifest = await fetchWeatherRadarManifest()
      setManifest(nextManifest)
      const latestFrameIndex = Math.max(0, nextManifest.frames.length - 1)
      setFrameIndex(latestFrameIndex)
      setDisplayedFrameIndex(null)
      setError(nextManifest.frames.length ? null : 'No radar frames are available right now.')
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Radar is temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 2,
      maxZoom: 12,
    }).setView([latitude, longitude], 7)

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    L.circleMarker([latitude, longitude], {
      radius: 6,
      color: '#f4d27b',
      fillColor: '#d7aa46',
      fillOpacity: 0.95,
      weight: 2,
    }).bindTooltip(locationName).addTo(map)

    mapRef.current = map
    window.setTimeout(() => map.invalidateSize(), 0)

    return () => {
      radarRequestRef.current += 1
      if (radarTransitionTimerRef.current !== null) window.clearTimeout(radarTransitionTimerRef.current)
      if (radarLoadTimerRef.current !== null) window.clearTimeout(radarLoadTimerRef.current)
      pendingRadarLayerRef.current = null
      radarLayerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, [latitude, locationName, longitude])

  useEffect(() => {
    mapRef.current?.setView([latitude, longitude], mapRef.current.getZoom(), { animate: false })
  }, [latitude, longitude])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !manifest || !frame) return

    const requestId = ++radarRequestRef.current
    setFrameLoading(true)
    if (radarTransitionTimerRef.current !== null) window.clearTimeout(radarTransitionTimerRef.current)
    if (radarLoadTimerRef.current !== null) window.clearTimeout(radarLoadTimerRef.current)
    if (pendingRadarLayerRef.current) {
      map.removeLayer(pendingRadarLayerRef.current)
      pendingRadarLayerRef.current = null
    }

    const pendingLayer = L.tileLayer(
      `${manifest.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
      {
        opacity: 0,
        zIndex: 8,
        attribution: '&copy; RainViewer',
      }
    )
    pendingRadarLayerRef.current = pendingLayer

    const discardPendingLayer = () => {
      if (radarRequestRef.current !== requestId) return
      if (radarLoadTimerRef.current !== null) {
        window.clearTimeout(radarLoadTimerRef.current)
        radarLoadTimerRef.current = null
      }
      if (pendingRadarLayerRef.current === pendingLayer) pendingRadarLayerRef.current = null
      if (map.hasLayer(pendingLayer)) map.removeLayer(pendingLayer)
      setFrameLoading(false)
    }

    const promotePendingLayer = () => {
      if (radarRequestRef.current !== requestId) {
        if (map.hasLayer(pendingLayer)) map.removeLayer(pendingLayer)
        return
      }
      if (radarLoadTimerRef.current !== null) {
        window.clearTimeout(radarLoadTimerRef.current)
        radarLoadTimerRef.current = null
      }

      const previousLayer = radarLayerRef.current
      const container = pendingLayer.getContainer()
      if (container) container.style.transition = `opacity ${RADAR_FADE_MS}ms ease-out`
      window.setTimeout(() => {
        if (radarRequestRef.current === requestId) pendingLayer.setOpacity(RADAR_OPACITY)
      }, 0)

      radarTransitionTimerRef.current = window.setTimeout(() => {
        if (radarRequestRef.current !== requestId) return
        if (previousLayer && previousLayer !== pendingLayer && map.hasLayer(previousLayer)) {
          map.removeLayer(previousLayer)
        }
        radarLayerRef.current = pendingLayer
        pendingRadarLayerRef.current = null
        radarTransitionTimerRef.current = null
        setDisplayedFrameIndex(frameIndex)
        setFrameLoading(false)
      }, RADAR_FADE_MS)
    }

    pendingLayer.once('load', promotePendingLayer)
    pendingLayer.addTo(map)
    radarLoadTimerRef.current = window.setTimeout(discardPendingLayer, RADAR_LOAD_TIMEOUT_MS)

    return () => {
      pendingLayer.off('load', promotePendingLayer)
      if (radarRequestRef.current !== requestId && map.hasLayer(pendingLayer)) {
        map.removeLayer(pendingLayer)
      }
    }
  }, [frame, frameIndex, manifest])

  useEffect(() => {
    if (!playing || isReducedMotion || frameLoading || frames.length < 2) return undefined
    const timer = window.setTimeout(() => {
      setFrameIndex(index => (index + 1) % frames.length)
    }, RADAR_FRAME_DWELL_MS)
    return () => window.clearTimeout(timer)
  }, [frameLoading, frameIndex, frames.length, isReducedMotion, playing])

  useEffect(() => {
    if (isReducedMotion) setPlaying(false)
  }, [isReducedMotion])

  return (
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <div>
          <h3 className="font-semibold text-[var(--text-primary)]">Live radar</h3>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {displayedFrame
              ? `${displayedFrame.forecast ? 'Forecast' : 'Observed'} ${formatFrameTime(displayedFrame.time)}`
              : frame
                ? 'Loading the first radar frame'
                : 'Loading radar frames'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Refresh weather radar"
          className="grid h-11 w-11 place-items-center rounded-full border border-[var(--border-subtle)] text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-55"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div ref={containerRef} className="h-[20rem] w-full bg-[#111418] sm:h-[24rem]" aria-label={`Interactive weather radar for ${locationName}`} />

      <div className="space-y-3 border-t border-[var(--border-subtle)] px-4 py-3">
        {error ? (
          <p role="status" className="text-sm text-amber-100">{error}</p>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPlaying(value => !value)}
                disabled={isReducedMotion || frames.length < 2}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] px-4 text-sm font-semibold text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-50"
                aria-label={isReducedMotion ? 'Radar animation disabled by Comfort settings' : playing ? 'Pause radar animation' : 'Play radar animation'}
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <input
                type="range"
                min="0"
                max={Math.max(0, frames.length - 1)}
                value={Math.min(frameIndex, Math.max(0, frames.length - 1))}
                onChange={event => {
                  setPlaying(false)
                  setFrameIndex(Number(event.target.value))
                }}
                disabled={frames.length < 2}
                aria-label="Radar frame"
                className="min-h-11 min-w-0 flex-1 accent-[var(--theme-accent)]"
              />
            </div>
            {isReducedMotion && (
              <p className="text-xs leading-5 text-[var(--text-muted)]">
                Radar animation is paused by your Comfort motion setting. You can still move through frames with the slider.
              </p>
            )}
          </>
        )}
        <p className="text-[0.68rem] leading-5 text-[var(--text-muted)]">
          Map &copy; OpenStreetMap contributors. Radar &copy; RainViewer. Radar is best-effort and should not replace official safety guidance.
        </p>
      </div>
    </div>
  )
}

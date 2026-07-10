import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import type { ShadoTvCaptionTrack, ShadoTvVideo, ShadoTvWatchEventType } from './data'
import {
  getShadoTvPremiereOffset,
  shouldCorrectShadoTvPremierePosition,
  shouldRecordShadoTvProgress,
} from './playback'

export interface ShadoTvPlaybackEvent {
  type: ShadoTvWatchEventType
  positionSeconds: number
  durationSeconds: number | null
}

interface ShadoTvStreamFrameProps {
  src: string
  title: string
  video?: ShadoTvVideo
  captions?: ShadoTvCaptionTrack[]
  resumeAt?: number
  onPlaybackEvent?: (event: ShadoTvPlaybackEvent) => void
}

type BunnyTimeUpdate = { seconds?: number; duration?: number }
type BunnyPlayer = {
  play?: () => void
  pause?: () => void
  setCurrentTime?: (seconds: number) => void
  getCurrentTime?: (callback: (seconds: number) => void) => void
  getDuration?: (callback: (seconds: number) => void) => void
  on?: (eventName: string, callback: (payload?: BunnyTimeUpdate) => void) => void
  off?: (eventName?: string) => void
}
type BunnyPlayerWindow = Window & {
  playerjs?: { Player?: new (iframe: HTMLIFrameElement) => BunnyPlayer }
}

let bunnyPlayerJsPromise: Promise<void> | null = null

function isDirectVideoUrl(value: string) {
  return /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(value)
}

function isBunnyEmbed(value: string) {
  try {
    return new URL(value).hostname.endsWith('mediadelivery.net')
  } catch {
    return false
  }
}

function loadBunnyPlayerJs() {
  if ((window as BunnyPlayerWindow).playerjs?.Player) return Promise.resolve()
  if (bunnyPlayerJsPromise) return bunnyPlayerJsPromise

  bunnyPlayerJsPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src*="/playerjs/"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Unable to load Bunny playback controls.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = 'https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js'
    script.async = true
    script.dataset.shadoTvBunnyPlayerjs = 'true'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load Bunny playback controls.'))
    document.head.appendChild(script)
  })
  return bunnyPlayerJsPromise
}

function buildEmbedUrl(src: string, video?: ShadoTvVideo, captions: ShadoTvCaptionTrack[] = []) {
  if (!isBunnyEmbed(src)) return src
  try {
    const url = new URL(src)
    const premiereOffset = video ? getShadoTvPremiereOffset(video) : null
    if (premiereOffset != null) {
      url.searchParams.set('t', String(premiereOffset))
      url.searchParams.set('autoplay', 'true')
      url.searchParams.set('preload', 'true')
      url.searchParams.set('showSpeed', 'false')
    }
    const defaultCaption = captions.find(track => track.isDefault)
    if (defaultCaption) url.searchParams.set('captions', defaultCaption.languageCode.toLowerCase())
    return url.toString()
  } catch {
    return src
  }
}

export function ShadoTvStreamFrame({
  src,
  title,
  video,
  captions = [],
  resumeAt = 0,
  onPlaybackEvent,
}: ShadoTvStreamFrameProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastProgressRef = useRef(0)
  const premiereJoinedRef = useRef(false)
  const [playing, setPlaying] = useState(false)
  const premiereOffset = video ? getShadoTvPremiereOffset(video) : null
  const premiereMode = premiereOffset != null
  const embedUrl = useMemo(() => buildEmbedUrl(src, video, captions), [captions, src, video])

  const emit = useCallback((
    type: ShadoTvWatchEventType,
    positionSeconds: number,
    durationSeconds?: number | null
  ) => {
    onPlaybackEvent?.({
      type,
      positionSeconds: Math.max(0, positionSeconds),
      durationSeconds: durationSeconds == null ? null : Math.max(0, durationSeconds),
    })
  }, [onPlaybackEvent])

  const emitPlay = useCallback((position: number, duration?: number | null) => {
    if (premiereMode && !premiereJoinedRef.current) {
      premiereJoinedRef.current = true
      emit('premiere_join', position, duration)
    }
    emit('play', position, duration)
  }, [emit, premiereMode])

  useEffect(() => {
    const element = videoRef.current
    if (!element || !premiereMode || !video) return

    const sync = () => {
      const expected = getShadoTvPremiereOffset(video)
      if (expected != null && shouldCorrectShadoTvPremierePosition(element.currentTime, expected)) {
        element.currentTime = expected
      }
    }
    sync()
    const timer = window.setInterval(sync, 5000)
    return () => window.clearInterval(timer)
  }, [premiereMode, video])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !isBunnyEmbed(src)) return
    let cancelled = false
    let player: BunnyPlayer | null = null

    void loadBunnyPlayerJs().then(() => {
      if (cancelled) return
      const Player = (window as BunnyPlayerWindow).playerjs?.Player
      if (!Player) return
      player = new Player(iframe)

      const readPosition = (callback: (position: number, duration: number | null) => void) => {
        player?.getCurrentTime?.(position => {
          player?.getDuration?.(duration => callback(Number(position || 0), Number(duration || 0) || null))
        })
      }
      const syncPremiere = () => {
        if (!video) return
        const expected = getShadoTvPremiereOffset(video)
        if (expected == null) return
        player?.getCurrentTime?.(actual => {
          if (shouldCorrectShadoTvPremierePosition(Number(actual || 0), expected)) {
            player?.setCurrentTime?.(expected)
          }
        })
      }
      const onReady = () => {
        const expected = video ? getShadoTvPremiereOffset(video) : null
        if (expected != null) player?.setCurrentTime?.(expected)
        else if (resumeAt > 0) player?.setCurrentTime?.(resumeAt)
      }
      const onPlay = () => {
        setPlaying(true)
        readPosition(emitPlay)
      }
      const onPause = () => {
        setPlaying(false)
        readPosition((position, duration) => emit('pause', position, duration))
      }
      const onEnded = () => {
        setPlaying(false)
        readPosition((position, duration) => emit('complete', position, duration))
      }
      const onTimeUpdate = (payload?: BunnyTimeUpdate) => {
        const position = Number(payload?.seconds ?? 0)
        const duration = Number(payload?.duration ?? 0) || null
        if (video && getShadoTvPremiereOffset(video) != null) syncPremiere()
        if (shouldRecordShadoTvProgress(lastProgressRef.current, position)) {
          lastProgressRef.current = position
          emit('progress', position, duration)
        }
      }

      player.on?.('ready', onReady)
      player.on?.('play', onPlay)
      player.on?.('pause', onPause)
      player.on?.('ended', onEnded)
      player.on?.('timeupdate', onTimeUpdate)
      player.on?.('seeked', syncPremiere)
    }).catch(() => undefined)

    return () => {
      cancelled = true
      player?.off?.()
    }
  }, [emit, emitPlay, resumeAt, src, video])

  if (!isDirectVideoUrl(src)) {
    return (
      <>
        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={title}
          className="absolute inset-0 h-full w-full border-0 bg-black"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
        {premiereMode && (
          <span className="pointer-events-none absolute left-3 top-3 rounded-full border border-red-300/35 bg-black/72 px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.14em] text-red-100">
            Live synchronized premiere
          </span>
        )}
      </>
    )
  }

  const syncDirectPremiere = (element: HTMLVideoElement) => {
    if (!video) return
    const expected = getShadoTvPremiereOffset(video)
    if (expected != null && shouldCorrectShadoTvPremierePosition(element.currentTime, expected)) {
      element.currentTime = expected
    }
  }

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        title={title}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls={!premiereMode}
        playsInline
        preload="metadata"
        onLoadedMetadata={event => {
          const element = event.currentTarget
          if (premiereMode) syncDirectPremiere(element)
          else if (resumeAt > 0 && resumeAt < element.duration * 0.9) element.currentTime = resumeAt
        }}
        onPlay={event => {
          setPlaying(true)
          emitPlay(event.currentTarget.currentTime, event.currentTarget.duration)
        }}
        onPause={event => {
          setPlaying(false)
          if (!event.currentTarget.ended) emit('pause', event.currentTarget.currentTime, event.currentTarget.duration)
        }}
        onEnded={event => emit('complete', event.currentTarget.currentTime, event.currentTarget.duration)}
        onSeeking={event => {
          if (premiereMode) syncDirectPremiere(event.currentTarget)
        }}
        onTimeUpdate={event => {
          const element = event.currentTarget
          if (premiereMode) syncDirectPremiere(element)
          if (shouldRecordShadoTvProgress(lastProgressRef.current, element.currentTime)) {
            lastProgressRef.current = element.currentTime
            emit('progress', element.currentTime, element.duration)
          }
        }}
      >
        {captions.map(track => (
          <track
            key={track.id}
            kind={track.kind}
            src={track.sourceUrl}
            srcLang={track.languageCode}
            label={track.label}
            default={track.isDefault}
          />
        ))}
      </video>

      {premiereMode && (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-full border border-[#9a6a43]/40 bg-black/80 p-1.5 pl-3 shadow-lg">
          <span className="text-[0.62rem] font-black uppercase tracking-[0.14em] text-red-100">
            Live - seeking locked
          </span>
          <button
            type="button"
            onClick={() => {
              const element = videoRef.current
              if (!element) return
              if (element.paused) void element.play()
              else element.pause()
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#a64022] text-white"
            aria-label={playing ? 'Pause live premiere' : 'Play live premiere'}
          >
            {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
          </button>
        </div>
      )}
    </>
  )
}

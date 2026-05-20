import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ExternalLink, Lock, Newspaper, Play, Radio, Users, Video } from 'lucide-react'
import { motion } from 'framer-motion'
import { SHADO_TV_ASSETS } from './assets/manifest'
import {
  SHADO_TV_FALLBACK_CATALOG,
  fetchShadoTvCatalog,
  fetchShadoTvWatchProgress,
  saveShadoTvWatchProgress,
} from './api'
import {
  type ShadoTvContentItem,
  type ShadoTvVideo,
  type ShadoTvWatchProgress,
} from './data'

interface ShadoTvScreenProps {
  onExit: () => void
}

type ShadoTvView =
  | { type: 'home' }
  | { type: 'episode'; videoId: string }
  | { type: 'trailers' }
  | { type: 'cast' }
  | { type: 'updates' }

type HubStatus = 'coming-soon' | 'airing-now' | 'now-streaming'

const SHOW_TITLE = 'The Crimp & Shrimp Show'

function parseDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDateTime(value?: string | null) {
  const date = parseDate(value)
  if (!date) return 'Date not set'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return 'Runtime pending'
  const minutes = Math.round(seconds / 60)
  return `${minutes} min`
}

function formatClock(seconds: number) {
  const safe = Math.max(0, seconds)
  const days = Math.floor(safe / 86400)
  const hours = Math.floor((safe % 86400) / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const remaining = safe % 60

  return [
    { label: 'Days', value: days },
    { label: 'Hrs', value: hours },
    { label: 'Mins', value: minutes },
    { label: 'Secs', value: remaining },
  ]
}

function getEpisodeSortTime(video: ShadoTvVideo) {
  return parseDate(video.premiereAt)?.getTime()
    ?? parseDate(video.releasedAt)?.getTime()
    ?? 0
}

function getHubStatus(video?: ShadoTvVideo | null, now = Date.now()): HubStatus {
  if (!video) return 'coming-soon'
  const premiereAt = parseDate(video.premiereAt)?.getTime()
  const releasedAt = parseDate(video.releasedAt)?.getTime()
  const premiereEnd = premiereAt && video.durationSeconds
    ? premiereAt + video.durationSeconds * 1000
    : null

  if (premiereAt && premiereEnd && now >= premiereAt && now < premiereEnd) {
    return 'airing-now'
  }

  if ((releasedAt && now >= releasedAt) || (video.status === 'released' && !releasedAt)) {
    return 'now-streaming'
  }

  return 'coming-soon'
}

function getCountdownTarget(video?: ShadoTvVideo | null, now = Date.now()) {
  if (!video) return null
  const premiereAt = parseDate(video.premiereAt)
  const releasedAt = parseDate(video.releasedAt)

  if (premiereAt && premiereAt.getTime() > now) {
    return {
      label: 'Premiere starts in',
      date: premiereAt,
    }
  }

  if (releasedAt && releasedAt.getTime() > now) {
    return {
      label: 'Now streaming in',
      date: releasedAt,
    }
  }

  return null
}

function isTrailerReleased(video: ShadoTvVideo, now = Date.now()) {
  if (!video.trailerAssetUrl) return false
  const releaseAt = parseDate(video.trailerReleaseAt)
  return !releaseAt || releaseAt.getTime() <= now
}

function getTrailerLabel(video: ShadoTvVideo) {
  if (isTrailerReleased(video)) return 'Available now'
  if (video.trailerAssetUrl || video.trailerReleaseAt || video.trailerAvailable) {
    return `Unlocks ${formatDateTime(video.trailerReleaseAt)}`
  }
  return 'Pending'
}

function isDirectVideoUrl(value?: string | null) {
  return /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(value ?? '')
}

function StreamFrame({ src, title }: { src: string; title: string }) {
  if (isDirectVideoUrl(src)) {
    return (
      <video
        src={src}
        title={title}
        className="absolute inset-0 h-full w-full bg-black object-contain"
        controls
        playsInline
        preload="metadata"
      />
    )
  }

  return (
    <iframe
      src={src}
      title={title}
      className="absolute inset-0 h-full w-full border-0 bg-black"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
    />
  )
}

function getPrimaryEpisode(videos: ShadoTvVideo[]) {
  return videos.find(video => video.prime)
    ?? [...videos].sort((a, b) => getEpisodeSortTime(a) - getEpisodeSortTime(b))[0]
    ?? SHADO_TV_FALLBACK_CATALOG.videos[0]
}

function getContentItems(contentItems: ShadoTvContentItem[], channelId: string, section: ShadoTvContentItem['section']) {
  return contentItems
    .filter(item => item.section === section && item.channelId === channelId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
}

function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d2b58a]/20 bg-black/20 text-[#e7c489] transition hover:border-[#e3b061]/50 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#a64022]/50"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  )
}

function ShadoTvHeader({ onBack, onExit, title }: { onBack?: () => void; onExit: () => void; title?: string }) {
  return (
    <header className="relative z-20 flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end border-b border-[#9a6a43]/30 bg-[#070806]/92 px-3 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_12px_34px_rgba(0,0,0,0.55)]">
      <img
        src={SHADO_TV_ASSETS.headerBanner}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-[0.72]"
        width={2400}
        height={240}
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,6,4,0.88),rgba(5,6,4,0.48)_48%,rgba(5,6,4,0.88)),linear-gradient(180deg,rgba(0,0,0,0.08),rgba(0,0,0,0.46))]" />
      <div className="relative flex w-full items-center justify-between gap-3">
        <BackButton onClick={onBack ?? onExit} label={onBack ? 'Back within Shado TV' : 'Back to Entertainment'} />
        <div className="min-w-0 text-center">
          <p className="text-[0.62rem] font-black uppercase tracking-[0.22em] text-[#c89561]">Shado TV</p>
          <p className="truncate text-sm font-black uppercase tracking-[0.12em] text-[#f1dbc0]">{title ?? SHOW_TITLE}</p>
        </div>
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d2b58a]/20 bg-black/20 text-[#c89561]">
          <Radio className="h-5 w-5" />
        </span>
      </div>
    </header>
  )
}

function StatusCard({ episode }: { episode?: ShadoTvVideo | null }) {
  const [now, setNow] = useState(() => Date.now())
  const status = getHubStatus(episode, now)
  const target = getCountdownTarget(episode, now)
  const seconds = target ? Math.max(0, Math.floor((target.date.getTime() - now) / 1000)) : 0
  const clock = formatClock(seconds)
  const statusCopy = {
    'coming-soon': 'Coming Soon',
    'airing-now': 'Airing Now',
    'now-streaming': 'Now Streaming',
  } satisfies Record<HubStatus, string>

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="relative isolate overflow-visible px-4 py-2 text-center">
      <img
        src={SHADO_TV_ASSETS.crimpShrimp.countdownParchment}
        alt=""
        className="pointer-events-none absolute -inset-x-3 -inset-y-2 z-0 h-[calc(100%+1rem)] w-[calc(100%+1.5rem)] object-fill"
        width={703}
        height={230}
        loading="eager"
        decoding="async"
      />
      <div className="relative z-10">
        <p className="text-[0.5rem] font-black uppercase tracking-[0.2em] text-[#6f291b]">{target?.label ?? statusCopy[status]}</p>
        {target ? (
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {clock.map(item => (
              <div key={item.label} className="border-r border-[#5c2b1d]/28 last:border-r-0">
                <span className="block text-lg font-black tabular-nums leading-none text-[#8b321f]">{String(item.value).padStart(2, '0')}</span>
                <span className="mt-0.5 block text-[0.46rem] font-black uppercase tracking-[0.1em] text-[#31180f]/80">{item.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-lg font-black uppercase tracking-[0.08em] text-[#8b321f]">{statusCopy[status]}</p>
        )}
      </div>
    </div>
  )
}

function EpisodeCard({
  video,
  progress,
  onOpen,
}: {
  video: ShadoTvVideo
  progress?: ShadoTvWatchProgress
  onOpen: () => void
}) {
  const status = getHubStatus(video)
  const progressPercent = progress?.durationSeconds
    ? Math.min(100, Math.round((progress.positionSeconds / progress.durationSeconds) * 100))
    : 0

  return (
    <button
      type="button"
      onClick={onOpen}
      data-shado-tv-video-card="true"
      aria-label={`Open ${video.title}`}
      className="group relative w-full overflow-hidden rounded-lg border border-[#b88452]/34 bg-black/24 p-2.5 text-left shadow-[0_16px_34px_rgba(0,0,0,0.34)] transition hover:border-[#d8b06f]/58 hover:bg-black/30 focus:outline-none focus:ring-2 focus:ring-[#a64022]/60"
    >
      <img
        src={SHADO_TV_ASSETS.crimpShrimp.featuredEpisodeBackdrop}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover opacity-[0.78] blur-[1px] saturate-[1.02]"
        loading="lazy"
        decoding="async"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_24%,rgba(207,142,83,0.14),transparent_34%),linear-gradient(90deg,rgba(5,7,5,0.52),rgba(5,7,5,0.28)_42%,rgba(5,7,5,0.66))]" />
      <div aria-hidden="true" className="relative z-10 mb-1.5 flex justify-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#d8b06f]/76" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#d8b06f]/42" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#d8b06f]/42" />
      </div>
      <div className="relative z-10 grid min-h-[9.4rem] grid-cols-[5.6rem_1fr] gap-3 min-[420px]:grid-cols-[6.5rem_1fr]">
        <div className="relative min-h-[8.3rem] overflow-visible">
          <img
            src={video.posterAsset}
            alt=""
            className="absolute inset-0 h-full w-full object-contain object-center brightness-[1.16] contrast-[1.08] saturate-[1.08] drop-shadow-[0_16px_22px_rgba(0,0,0,0.58)]"
            width={640}
            height={960}
            loading="eager"
            decoding="async"
          />
        </div>
        <div className="flex min-w-0 flex-col justify-between py-1">
          <div>
            <span className="inline-flex rounded-full border border-[#d8b06f]/30 bg-black/42 px-2 py-0.5 text-[0.56rem] font-black uppercase tracking-[0.14em] text-[#e5c28f]">
              {status === 'airing-now' ? 'Airing Now' : status === 'now-streaming' ? 'Now Streaming' : 'Announced'}
            </span>
            <p className="mt-2 text-[0.62rem] font-black uppercase tracking-[0.16em] text-[#c89561]">{video.subtitle || 'Episode'}</p>
            <h2 className="mt-0.5 text-xl font-black uppercase leading-6 text-[#b94728] min-[420px]:text-2xl">{video.title}</h2>
            <p className="mt-1 line-clamp-1 text-xs font-semibold leading-5 text-[#dac5a3]/82">{video.description}</p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#d9c79f]/70">{formatDuration(video.durationSeconds)}</span>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8b06f]/55 bg-[#a64022]/20 text-[#f1dbc0]">
              {status === 'coming-soon' ? <Lock className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
            </span>
          </div>
        </div>
      </div>
      {progressPercent > 0 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/12">
          <div className="h-full bg-[#b94728]" style={{ width: `${progressPercent}%` }} />
        </div>
      )}
    </button>
  )
}

function ModuleCard({
  icon: Icon,
  title,
  subtitle,
  asset,
  onOpen,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
  asset: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative aspect-[0.82/1] min-w-0 overflow-hidden rounded-lg border border-[#b88452]/24 bg-[#0b0c09] p-2.5 text-left shadow-[0_16px_36px_rgba(0,0,0,0.34)] transition hover:-translate-y-0.5 hover:border-[#d8b06f]/65 focus:outline-none focus:ring-2 focus:ring-[#a64022]/55"
    >
      <img src={asset} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.06),rgba(0,0,0,0.24)_42%,rgba(0,0,0,0.78))]" />
      <div className="relative flex h-full flex-col justify-between">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d8b06f]/32 bg-black/38 text-[#c89561]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div>
          <h3 className="text-[0.78rem] font-black uppercase tracking-[0.06em] text-[#f1dbc0]">{title}</h3>
          <p className="mt-0.5 line-clamp-2 text-[0.56rem] font-semibold leading-3 text-[#dac5a3]/78">{subtitle}</p>
        </div>
      </div>
    </button>
  )
}

function HomeView({
  videos,
  watchProgress,
  onOpenEpisode,
  onOpenTrailers,
  onOpenCast,
  onOpenUpdates,
}: {
  videos: ShadoTvVideo[]
  watchProgress: Map<string, ShadoTvWatchProgress>
  onOpenEpisode: (videoId: string) => void
  onOpenTrailers: () => void
  onOpenCast: () => void
  onOpenUpdates: () => void
}) {
  const episodes = videos
  const primaryEpisode = getPrimaryEpisode(episodes)

  return (
    <main className="mx-auto min-h-0 w-full max-w-[30rem] flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)] pt-3">
      <section className="relative h-[19.75rem] overflow-visible min-[430px]:h-[21rem]">
        <img
          src={SHADO_TV_ASSETS.crimpShrimp.seriesTitleHero}
          alt=""
          className="absolute inset-0 h-full w-full object-cover drop-shadow-[0_28px_54px_rgba(0,0,0,0.62)]"
          width={1200}
          height={1200}
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-x-7 bottom-12">
          <StatusCard episode={primaryEpisode} />
        </div>
      </section>

      <section className="mt-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.22em] text-[#f1dbc0]">Episodes</h2>
          <span className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#c89561]">{episodes.length || 0} listed</span>
        </div>
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
          {episodes.map(video => (
            <div key={video.id} className="min-w-[min(22rem,88vw)] snap-start">
              <EpisodeCard
                video={video}
                progress={watchProgress.get(video.id)}
                onOpen={() => onOpenEpisode(video.id)}
              />
            </div>
          ))}
          {episodes.length === 0 && (
            <div className="min-w-[min(22rem,88vw)] rounded-lg border border-[#b88452]/28 bg-black/42 p-4 text-sm font-semibold leading-5 text-[#dac5a3]/78">
              No public episodes are visible yet. Add or announce an episode from Shado TV Studio.
            </div>
          )}
        </div>
      </section>

      <section className="mt-3 grid grid-cols-3 gap-2">
        <ModuleCard icon={Video} title="Trailers" subtitle="Show trailers and episode previews." asset={SHADO_TV_ASSETS.crimpShrimp.moduleTrailers} onOpen={onOpenTrailers} />
        <ModuleCard icon={Users} title="Cast" subtitle="Global cast and production credits." asset={SHADO_TV_ASSETS.crimpShrimp.moduleCast} onOpen={onOpenCast} />
        <ModuleCard icon={Newspaper} title="Updates" subtitle="Newest production notes and older posts." asset={SHADO_TV_ASSETS.crimpShrimp.moduleUpdates} onOpen={onOpenUpdates} />
      </section>
    </main>
  )
}

function EpisodeView({
  video,
  castItems,
  progress,
  onProgressSaved,
}: {
  video: ShadoTvVideo
  castItems: ShadoTvContentItem[]
  progress?: ShadoTvWatchProgress
  onProgressSaved: () => Promise<void>
}) {
  const [message, setMessage] = useState<string | null>(null)
  const status = getHubStatus(video)
  const target = getCountdownTarget(video)
  const canPlayVideo = (status === 'airing-now' || status === 'now-streaming') && Boolean(video.embedUrl)
  const trailerReady = isTrailerReleased(video)

  const saveProgress = async () => {
    if (status !== 'now-streaming') return
    try {
      await saveShadoTvWatchProgress(video.id, Math.max(1, progress?.positionSeconds ?? 0), video.durationSeconds ?? null)
      await onProgressSaved()
      setMessage('Resume point saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save resume point.')
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)] pt-4">
      <section className="overflow-hidden rounded-lg border border-[#b88452]/34 bg-[#080806] shadow-[0_24px_62px_rgba(0,0,0,0.52)]">
        <div className="relative aspect-video bg-black">
          {canPlayVideo && video.embedUrl ? (
            <StreamFrame src={video.embedUrl} title={video.title} />
          ) : (
            <>
              <img
                src={status === 'coming-soon' ? video.posterAsset : video.thumbnailAsset}
                alt=""
                className="h-full w-full object-cover object-top opacity-[0.86]"
                width={1280}
                height={720}
                loading="eager"
                decoding="async"
              />
              <div className="absolute inset-0 bg-black/30" />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#d8b06f]/65 bg-black/48 text-[#f1dbc0] shadow-[0_0_34px_rgba(166,64,34,0.3)]">
                  {status === 'coming-soon' ? <Lock className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7 fill-current" />}
                </span>
                <p className="mt-3 text-sm font-black uppercase tracking-[0.18em] text-[#f1dbc0]">
                  {status === 'airing-now' ? 'Premiere stream ready' : status === 'now-streaming' ? 'Stream upload pending' : 'Locked until premiere'}
                </p>
                {target && <p className="mt-1 text-xs font-semibold text-[#dac5a3]/78">{target.label} {formatDateTime(target.date.toISOString())}</p>}
              </div>
            </>
          )}
        </div>
        <div className="border-t border-[#b88452]/22 bg-black/34 p-4">
          <div className="flex flex-wrap gap-2">
            {canPlayVideo ? (
              <button
                type="button"
                onClick={() => void saveProgress()}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-[#b88452]/40 px-4 text-xs font-black uppercase tracking-[0.14em] text-[#f1dbc0] transition hover:border-[#d8b06f]/70"
              >
                <Play className="h-4 w-4 fill-current" />
                {progress?.positionSeconds ? 'Resume' : 'Start'}
              </button>
            ) : (
              <span className="inline-flex min-h-10 items-center rounded-full border border-[#b88452]/28 bg-black/24 px-4 text-xs font-black uppercase tracking-[0.14em] text-[#dac5a3]/82">
                {status === 'airing-now' ? 'Premiere mode ready' : status === 'now-streaming' ? 'Upload stream from Studio' : 'Countdown active'}
              </span>
            )}
            {video.externalUrl && (
              <a
                href={video.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/12 px-4 text-xs font-black uppercase tracking-[0.14em] text-[#dac5a3] transition hover:border-[#dac5a3]/50"
              >
                <ExternalLink className="h-4 w-4" />
                Open
              </a>
            )}
          </div>
          {message && <p className="mt-2 text-xs font-semibold text-[#dac5a3]/70">{message}</p>}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-[#b88452]/28 bg-black/38 p-4">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#c89561]">{video.subtitle}</p>
        <h1 className="mt-2 text-3xl font-black uppercase leading-8 text-[#b94728]">{video.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[#f1dbc0]/82">{video.description}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#dac5a3]/82">
          <InfoCell label="Runtime" value={formatDuration(video.durationSeconds)} />
          <InfoCell label="Premiere" value={formatDateTime(video.premiereAt)} />
          <InfoCell label="Streaming" value={formatDateTime(video.releasedAt)} />
          <InfoCell label="Trailer" value={getTrailerLabel(video)} />
        </div>
      </section>

      {(video.trailerAssetUrl || video.trailerReleaseAt || video.trailerAvailable) && (
        <section className="mt-4 overflow-hidden rounded-lg border border-[#b88452]/28 bg-black/38">
          <div className="border-b border-[#b88452]/18 p-4">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#c89561]">Trailer</p>
            <h2 className="mt-1 text-xl font-black uppercase text-[#f1dbc0]">{trailerReady ? 'Watch the preview' : 'Preview locked'}</h2>
          </div>
          <div className="relative aspect-video bg-black">
            {trailerReady && video.trailerAssetUrl ? (
              <StreamFrame src={video.trailerAssetUrl} title={`${video.title} trailer`} />
            ) : (
              <>
                <img src={SHADO_TV_ASSETS.crimpShrimp.statusComingSoon} alt="" className="h-full w-full object-cover opacity-90" loading="lazy" decoding="async" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/34 p-5 text-center">
                  <p className="text-sm font-black uppercase tracking-[0.16em] text-[#f1dbc0]">{getTrailerLabel(video)}</p>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <section className="mt-4 rounded-lg border border-[#b88452]/28 bg-black/38 p-4">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#f1dbc0]">Cast</h2>
        <div className="mt-3 grid gap-2">
          {castItems.slice(0, 2).map(member => (
            <div key={member.id} className="rounded-md border border-white/10 bg-white/[0.035] p-3">
              <p className="text-sm font-black text-[#f1dbc0]">{member.title}</p>
              {member.subtitle && <p className="text-xs font-semibold text-[#c89561]">{member.subtitle}</p>}
            </div>
          ))}
          {castItems.length === 0 && (
            <div className="rounded-md border border-white/10 bg-white/[0.035] p-3 text-sm font-semibold text-[#dac5a3]/78">
              Cast notes are being prepared.
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-3">
      <span className="block text-[0.62rem] font-black uppercase tracking-[0.18em] text-[#c89561]">{label}</span>
      <span className="mt-1 block font-semibold">{value}</span>
    </div>
  )
}

function TrailersView({ videos, onOpenEpisode }: { videos: ShadoTvVideo[]; onOpenEpisode: (videoId: string) => void }) {
  const trailerVideos = videos.filter(video => video.trailerAvailable || video.trailerReleaseAt || video.trailerAssetUrl)

  return (
    <PageScaffold eyebrow="Trailers" title="Preview the trouble">
      <div className="grid gap-3">
        {(trailerVideos.length ? trailerVideos : videos).map(video => (
          <article key={video.id} className="overflow-hidden rounded-lg border border-[#b88452]/28 bg-black/38">
            <button
              type="button"
              onClick={() => onOpenEpisode(video.id)}
              className="w-full p-4 text-left transition hover:bg-white/[0.03]"
            >
              <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#c89561]">Trailer</p>
              <h2 className="mt-1 text-xl font-black uppercase text-[#f1dbc0]">{video.title}</h2>
              <p className="mt-2 text-sm leading-5 text-[#dac5a3]/72">{getTrailerLabel(video)}</p>
            </button>
            {isTrailerReleased(video) && video.trailerAssetUrl ? (
              <div className="relative aspect-video border-t border-[#b88452]/18 bg-black">
                <StreamFrame src={video.trailerAssetUrl} title={`${video.title} trailer`} />
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </PageScaffold>
  )
}

function CastView({ items }: { items: ShadoTvContentItem[] }) {
  return (
    <PageScaffold eyebrow="Cast" title="The crew">
      <div className="grid gap-3">
        {items.map(member => (
          <article key={member.id} className="rounded-lg border border-[#b88452]/28 bg-black/38 p-4">
            <p className="text-lg font-black text-[#f1dbc0]">{member.title}</p>
            {member.subtitle && <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-[#c89561]">{member.subtitle}</p>}
            {member.body && <p className="mt-3 text-sm leading-6 text-[#dac5a3]/78">{member.body}</p>}
          </article>
        ))}
        {items.length === 0 && (
          <article className="rounded-lg border border-[#b88452]/28 bg-black/38 p-4 text-sm font-semibold leading-6 text-[#dac5a3]/78">
            Cast notes are being prepared.
          </article>
        )}
      </div>
    </PageScaffold>
  )
}

function UpdatesView({ items }: { items: ShadoTvContentItem[] }) {
  return (
    <PageScaffold eyebrow="Updates" title="Production notes">
      <div className="grid gap-3">
        {items.map(update => (
          <article key={update.id} className="rounded-lg border border-[#b88452]/28 bg-[#0c0b08]/84 p-4">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#c89561]">{update.dateLabel || update.subtitle || 'Studio note'}</p>
            <h2 className="mt-1 text-xl font-black uppercase text-[#f1dbc0]">{update.title}</h2>
            {update.body && <p className="mt-3 text-sm leading-6 text-[#dac5a3]/78">{update.body}</p>}
          </article>
        ))}
        {items.length === 0 && (
          <article className="rounded-lg border border-[#b88452]/28 bg-[#0c0b08]/84 p-4 text-sm font-semibold leading-6 text-[#dac5a3]/78">
            Production notes are being prepared.
          </article>
        )}
      </div>
    </PageScaffold>
  )
}

function PageScaffold({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)] pt-4">
      <section className="mb-4 rounded-lg border border-[#b88452]/28 bg-black/42 p-4">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#c89561]">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black uppercase leading-8 text-[#b94728]">{title}</h1>
      </section>
      {children}
    </main>
  )
}

export function ShadoTvScreen({ onExit }: ShadoTvScreenProps) {
  const [view, setView] = useState<ShadoTvView>({ type: 'home' })
  const [catalog, setCatalog] = useState(SHADO_TV_FALLBACK_CATALOG)
  const [watchProgress, setWatchProgress] = useState<Map<string, ShadoTvWatchProgress>>(new Map())
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const videos = catalog.videos
  const channels = catalog.channels
  const series = channels[0] ?? SHADO_TV_FALLBACK_CATALOG.channels[0]
  const contentItems = catalog.contentItems
  const castItems = getContentItems(contentItems, series.id, 'cast')
  const updateItems = getContentItems(contentItems, series.id, 'updates')
  const currentVideo = view.type === 'episode' ? videos.find(video => video.id === view.videoId) : undefined
  const headerTitle = view.type === 'home'
    ? SHOW_TITLE
    : view.type === 'episode'
      ? currentVideo?.title
      : view.type === 'trailers'
        ? 'Trailers'
        : view.type === 'cast'
          ? 'Cast'
          : 'Updates'

  const loadCatalog = useCallback(async () => {
    try {
      const nextCatalog = await fetchShadoTvCatalog()
      setCatalog(nextCatalog)
      setCatalogError(null)
    } catch (error) {
      setCatalog(SHADO_TV_FALLBACK_CATALOG)
      setCatalogError(error instanceof Error ? error.message : 'Unable to load Shado TV catalog.')
    }
  }, [])

  const loadWatchProgress = useCallback(async (catalogVideos = videos) => {
    try {
      const progress = await fetchShadoTvWatchProgress(catalogVideos.map(video => video.id))
      setWatchProgress(progress)
    } catch {
      setWatchProgress(new Map())
    }
  }, [videos])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  useEffect(() => {
    void loadWatchProgress(videos)
  }, [loadWatchProgress, videos])

  const goBack = () => {
    if (view.type === 'home') {
      onExit()
      return
    }
    setView({ type: 'home' })
  }

  const renderedView = useMemo(() => {
    if (view.type === 'home') {
      return (
        <HomeView
          videos={videos}
          watchProgress={watchProgress}
          onOpenEpisode={videoId => setView({ type: 'episode', videoId })}
          onOpenTrailers={() => setView({ type: 'trailers' })}
          onOpenCast={() => setView({ type: 'cast' })}
          onOpenUpdates={() => setView({ type: 'updates' })}
        />
      )
    }

    if (view.type === 'episode' && currentVideo) {
      return (
        <EpisodeView
          video={currentVideo}
          castItems={castItems}
          progress={watchProgress.get(currentVideo.id)}
          onProgressSaved={() => loadWatchProgress(videos)}
        />
      )
    }

    if (view.type === 'trailers') {
      return <TrailersView videos={videos} onOpenEpisode={videoId => setView({ type: 'episode', videoId })} />
    }

    if (view.type === 'cast') {
      return <CastView items={castItems} />
    }

    if (view.type === 'updates') {
      return <UpdatesView items={updateItems} />
    }

    return (
      <PageScaffold eyebrow="Unavailable" title="Episode hidden">
        <p className="rounded-lg border border-[#b88452]/28 bg-black/38 p-4 text-sm text-[#dac5a3]/78">
          This episode is not visible in the viewer catalog.
        </p>
      </PageScaffold>
    )
  }, [castItems, currentVideo, loadWatchProgress, updateItems, videos, view, watchProgress])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#050604] text-white"
    >
      <img
        src={SHADO_TV_ASSETS.crimpShrimp.seriesHubHero}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-[0.18]"
        width={1792}
        height={1024}
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(166,64,34,0.14),transparent_34%),linear-gradient(180deg,rgba(8,7,5,0.9),rgba(0,0,0,0.96))]" />
      <ShadoTvHeader
        onBack={view.type === 'home' ? undefined : goBack}
        onExit={onExit}
        title={headerTitle}
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {catalogError && (
          <div className="mx-4 mt-3 rounded-lg border border-[#b88452]/24 bg-black/52 p-3 text-xs font-semibold text-[#dac5a3]/78">
            Using test catalog: {catalogError}
          </div>
        )}
        {renderedView}
      </div>
    </motion.div>
  )
}

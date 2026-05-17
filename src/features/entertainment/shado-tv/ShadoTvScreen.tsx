import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarClock, Clapperboard, Film, Lock, Play, RotateCcw, Settings, Sparkles, Upload } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../../../hooks/useAuth'
import { SHADO_TV_ASSETS } from './assets/manifest'
import {
  SHADO_TV_FALLBACK_CATALOG,
  createShadoTvChannel,
  createShadoTvVideo,
  fetchShadoTvAdminCatalog,
  fetchShadoTvCatalog,
  restoreShadoTvChannel,
  restoreShadoTvVideo,
  softDeleteShadoTvChannel,
  softDeleteShadoTvVideo,
  updateShadoTvChannelVisibility,
  updateShadoTvVideoVisibility,
} from './api'
import {
  type ShadoTvChannel,
  type ShadoTvVideo,
} from './data'

interface ShadoTvScreenProps {
  onExit: () => void
}

type ShadoTvView =
  | { type: 'home' }
  | { type: 'channel'; channelId: string }
  | { type: 'video'; videoId: string; fromChannelId?: string }
  | { type: 'admin' }

const statusCopy: Record<ShadoTvVideo['status'], string> = {
  released: 'Watch now',
  premiere: 'Premiere',
  locked: 'Locked',
  processing: 'Processing',
}

function getChannelById(channels: ShadoTvChannel[], channelId?: string) {
  return channels.find(channel => channel.id === channelId) ?? channels[0] ?? SHADO_TV_FALLBACK_CATALOG.channels[0]
}

function getVideosForChannel(videos: ShadoTvVideo[], channelId: string) {
  return videos.filter(video => video.channelId === channelId)
}

function BackButton({ onClick, label = 'Back' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[#f6e0a2] transition hover:text-white focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
    >
      <ArrowLeft className="h-6 w-6" />
    </button>
  )
}

function ShadoTvHeader({
  title,
  onBack,
  onExit,
  canManage,
  onAdmin,
}: {
  title?: string
  onBack?: () => void
  onExit: () => void
  canManage: boolean
  onAdmin: () => void
}) {
  return (
    <header className="relative z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-end border-b border-[#d7aa46]/22 bg-black/72 px-2 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_10px_32px_rgba(0,0,0,0.55)] backdrop-blur-xl">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <BackButton onClick={onBack ?? onExit} label={onBack ? 'Back within Shado TV' : 'Back to Entertainment'} />
        <div className="min-w-0">
          <img
            src={SHADO_TV_ASSETS.logoMarquee}
            alt="Shado TV"
            className="h-8 w-auto max-w-[9.5rem] object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.75)] min-[390px]:max-w-[11.25rem]"
            width={1400}
            height={560}
            loading="eager"
            decoding="async"
          />
          {title && <p className="truncate text-[10px] font-semibold uppercase tracking-[0.28em] text-[#d9c79f]/76">{title}</p>}
        </div>
      </div>
      {canManage && (
        <button
          type="button"
          onClick={onAdmin}
          aria-label="Open Shado TV management"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#d7aa46]/45 bg-black/36 text-[#f6e0a2] shadow-[0_0_24px_rgba(215,170,70,0.16)] transition hover:border-[#f0d381] hover:text-white focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
        >
          <Settings className="h-5 w-5" />
        </button>
      )}
    </header>
  )
}

function StatusBadge({ video }: { video: ShadoTvVideo }) {
  const icon = video.status === 'released' ? Play : video.status === 'premiere' ? CalendarClock : video.status === 'processing' ? RotateCcw : Lock
  const Icon = icon
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#f0d381]/30 bg-black/58 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#f6e0a2] shadow-[0_8px_18px_rgba(0,0,0,0.28)]">
      <Icon className="h-3.5 w-3.5" />
      {statusCopy[video.status]}
    </span>
  )
}

function ChannelTicket({ channel, index, onOpen }: { channel: ShadoTvChannel; index: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${channel.name}`}
      className="group relative h-[9.4rem] w-[6.2rem] shrink-0 overflow-hidden rounded-[0.9rem] text-center transition-transform duration-300 hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/60"
    >
      <img
        src={channel.ticketAsset}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        width={512}
        height={768}
        loading={index < 3 ? 'eager' : 'lazy'}
        decoding="async"
      />
      <div className="relative flex h-full flex-col items-center justify-center px-3 pt-4 text-[#100b04]">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] opacity-75">Channel</span>
        <span className="mt-1 text-3xl font-black leading-none tabular-nums">{String(index + 1).padStart(2, '0')}</span>
        <span className="mt-2 text-[0.72rem] font-black uppercase leading-[0.92rem] tracking-[0.08em]">{channel.name}</span>
      </div>
    </button>
  )
}

function PosterCard({ video, onOpen, priority = false }: { video: ShadoTvVideo; onOpen: () => void; priority?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open ${video.title}`}
      className="group relative min-h-[13rem] w-[8.75rem] shrink-0 overflow-hidden rounded-[0.85rem] border border-[#d7aa46]/32 bg-black text-left shadow-[0_16px_32px_rgba(0,0,0,0.38)] transition duration-300 hover:-translate-y-1 hover:border-[#f0d381]/70 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
    >
      <img
        src={video.posterAsset}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
        width={640}
        height={960}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/18 to-transparent" />
      <div className="absolute inset-x-2 top-2">
        <StatusBadge video={video} />
      </div>
      <div className="absolute inset-x-3 bottom-3">
        <h3 className="text-lg font-black uppercase leading-5 tracking-[0.04em] text-[#f6e0a2]">{video.title}</h3>
        <p className="mt-0.5 text-xs font-semibold text-[#d9c79f]/86">{video.subtitle}</p>
      </div>
    </button>
  )
}

function HomeView({
  channels,
  videos,
  onOpenChannel,
  onOpenVideo,
}: {
  channels: ShadoTvChannel[]
  videos: ShadoTvVideo[]
  onOpenChannel: (channelId: string) => void
  onOpenVideo: (videoId: string) => void
}) {
  const prime = videos.find(video => video.prime) ?? videos[0] ?? SHADO_TV_FALLBACK_CATALOG.videos[0]
  const primeChannel = getChannelById(channels, prime.channelId)
  const featuredVideos = videos.filter(video => video.featured)
  const visibleFeaturedVideos = featuredVideos.length > 0 ? featuredVideos : videos.slice(0, 4)

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)] pt-4">
      <section className="relative overflow-hidden rounded-[1.4rem] border border-[#d7aa46]/34 bg-black/72 shadow-[0_24px_68px_rgba(0,0,0,0.52)]">
        <img
          src={SHADO_TV_ASSETS.marqueeFrame}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          width={1440}
          height={768}
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_16%,rgba(240,211,129,0.2),transparent_30%),linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.5))]" />
        <div className="relative flex min-h-[15.5rem] flex-col justify-between p-4">
          <div>
            <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#f0d381]">Now Playing</p>
            <h1 className="mt-2 max-w-[13rem] text-3xl font-black uppercase leading-8 text-[#f6e0a2]">{prime.title}</h1>
            <p className="mt-1 text-sm font-semibold text-[#d9c79f]/86">{primeChannel.name}</p>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <StatusBadge video={prime} />
              <p className="mt-2 text-xs text-[#d9c79f]/76">{prime.durationLabel} / {prime.releaseLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => onOpenVideo(prime.id)}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#f0d381]/65 bg-[#d7aa46]/18 text-[#f6e0a2] shadow-[0_0_32px_rgba(215,170,70,0.28)] transition hover:bg-[#d7aa46]/28 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/60"
              aria-label={`Play ${prime.title}`}
            >
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.22em] text-[#f6e0a2]">Channels</h2>
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[#d9c79f]/58">Newest first</span>
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2" data-mobile-horizontal-scroll="true">
          {channels.map((channel, index) => (
            <ChannelTicket
              key={channel.id}
              channel={channel}
              index={index}
              onOpen={() => onOpenChannel(channel.id)}
            />
          ))}
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-[0.22em] text-[#f6e0a2]">Featured</h2>
          <Sparkles className="h-4 w-4 text-[#f0d381]" />
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2" data-mobile-horizontal-scroll="true">
          {visibleFeaturedVideos.map((video, index) => (
            <PosterCard key={video.id} video={video} onOpen={() => onOpenVideo(video.id)} priority={index < 2} />
          ))}
        </div>
      </section>
    </main>
  )
}

function ChannelView({
  channel,
  videos,
  onOpenVideo,
}: {
  channel: ShadoTvChannel
  videos: ShadoTvVideo[]
  onOpenVideo: (videoId: string) => void
}) {
  const channelVideos = getVideosForChannel(videos, channel.id)

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)] pt-4">
      <section className="relative min-h-[12.5rem] overflow-hidden rounded-[1.35rem] border border-[#d7aa46]/34 bg-black/70 p-4 shadow-[0_24px_62px_rgba(0,0,0,0.5)]">
        <img src={channel.heroAsset} alt="" className="absolute inset-0 h-full w-full object-cover opacity-78" width={1440} height={720} loading="eager" decoding="async" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/92 via-black/58 to-black/20" />
        <div className="relative flex min-h-[10.5rem] max-w-[18rem] flex-col justify-end">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#f0d381]">{channel.updatedAtLabel}</p>
          <h1 className="mt-2 text-3xl font-black uppercase leading-8 text-[#f6e0a2]">{channel.name}</h1>
          <p className="mt-2 text-sm leading-5 text-[#d9c79f]/82">{channel.tagline}</p>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[#f6e0a2]">Newest</h2>
        <div className="grid grid-cols-2 gap-3 min-[430px]:grid-cols-3">
          {channelVideos.map(video => (
            <button
              key={video.id}
              type="button"
              aria-label={`Open ${video.title}`}
              onClick={() => onOpenVideo(video.id)}
              className="overflow-hidden rounded-[0.9rem] border border-[#d7aa46]/26 bg-black/56 text-left shadow-[0_16px_28px_rgba(0,0,0,0.35)] transition hover:-translate-y-0.5 hover:border-[#f0d381]/55 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
            >
              <div className="relative aspect-[2/3] overflow-hidden bg-black">
                <img src={video.posterAsset} alt="" className="h-full w-full object-cover" width={640} height={960} loading="lazy" decoding="async" />
                <div className="absolute left-2 top-2"><StatusBadge video={video} /></div>
              </div>
              <div className="p-2.5">
                <h3 className="line-clamp-2 text-sm font-black uppercase leading-4 text-[#f6e0a2]">{video.title}</h3>
                <p className="mt-1 truncate text-xs text-[#d9c79f]/70">{video.durationLabel}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}

function VideoView({ video, channel }: { video: ShadoTvVideo; channel: ShadoTvChannel }) {
  const isVertical = video.orientation === 'vertical'
  const canPlay = video.status === 'released'
  const image = video.status === 'processing'
    ? SHADO_TV_ASSETS.placeholders.processing
    : video.status === 'locked' || video.status === 'premiere'
      ? SHADO_TV_ASSETS.placeholders.lockedPremiere
      : video.thumbnailAsset

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)] pt-4">
      <section className="overflow-hidden rounded-[1.25rem] border border-[#d7aa46]/34 bg-black/78 shadow-[0_24px_62px_rgba(0,0,0,0.55)]">
        <div className={`relative mx-auto bg-black ${isVertical ? 'aspect-[9/16] max-h-[62vh] max-w-[18rem]' : 'aspect-video w-full'}`}>
          <img src={image} alt="" className="h-full w-full object-cover" width={isVertical ? 720 : 1280} height={isVertical ? 1280 : 720} loading="eager" decoding="async" />
          <div className="absolute inset-0 bg-black/18" />
          <div className="absolute left-3 top-3"><StatusBadge video={video} /></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              disabled={!canPlay}
              className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#f0d381]/70 bg-black/56 text-[#f6e0a2] shadow-[0_0_42px_rgba(215,170,70,0.3)] backdrop-blur-md transition enabled:hover:bg-[#d7aa46]/20 disabled:opacity-70"
              aria-label={canPlay ? `Play ${video.title}` : `${video.title} is not available yet`}
            >
              {canPlay ? <Play className="ml-1 h-7 w-7 fill-current" /> : <Lock className="h-7 w-7" />}
            </button>
          </div>
        </div>
        <div className="p-4">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#f0d381]">{channel.name}</p>
          <h1 className="mt-2 text-3xl font-black uppercase leading-8 text-[#f6e0a2]">{video.title}</h1>
          <p className="mt-2 text-sm leading-5 text-[#d9c79f]/82">{video.description}</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-[#d9c79f]/78">
            <div className="rounded-[0.75rem] border border-white/10 bg-white/[0.04] p-3">
              <span className="block text-[0.62rem] font-black uppercase tracking-[0.18em] text-[#f0d381]/80">Runtime</span>
              <span className="mt-1 block font-semibold">{video.durationLabel}</span>
            </div>
            <div className="rounded-[0.75rem] border border-white/10 bg-white/[0.04] p-3">
              <span className="block text-[0.62rem] font-black uppercase tracking-[0.18em] text-[#f0d381]/80">Release</span>
              <span className="mt-1 block font-semibold">{video.releaseLabel}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

function AdminView({
  channels,
  videos,
  loadedFromSupabase,
  catalogError,
  onRefresh,
}: {
  channels: ShadoTvChannel[]
  videos: ShadoTvVideo[]
  loadedFromSupabase: boolean
  catalogError: string | null
  onRefresh: () => Promise<void>
}) {
  const [channelTitle, setChannelTitle] = useState('')
  const [channelTagline, setChannelTagline] = useState('')
  const [channelStatus, setChannelStatus] = useState<'draft' | 'published' | 'hidden'>('hidden')
  const [videoChannelId, setVideoChannelId] = useState(channels[0]?.id ?? '')
  const [videoTitle, setVideoTitle] = useState('')
  const [videoSubtitle, setVideoSubtitle] = useState('')
  const [videoStatus, setVideoStatus] = useState<ShadoTvVideo['status']>('locked')
  const [videoOrientation, setVideoOrientation] = useState<ShadoTvVideo['orientation']>('horizontal')
  const [videoSourceType, setVideoSourceType] = useState<NonNullable<ShadoTvVideo['sourceType']>>('placeholder')
  const [videoDuration, setVideoDuration] = useState('')
  const [videoReleaseLabel, setVideoReleaseLabel] = useState('')
  const [videoExternalUrl, setVideoExternalUrl] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [studioMessage, setStudioMessage] = useState<string | null>(null)
  const processingCount = videos.filter(video => video.status === 'processing').length
  const premiereCount = videos.filter(video => video.status === 'premiere').length
  const activeChannels = channels.filter(channel => !channel.deletedAt)
  const deletedChannels = channels.filter(channel => channel.deletedAt)
  const deletedVideos = videos.filter(video => video.deletedAt)
  const activeVideos = videos.filter(video => !video.deletedAt)

  useEffect(() => {
    if (!videoChannelId && channels[0]?.id) {
      setVideoChannelId(channels[0].id)
    }
  }, [channels, videoChannelId])

  const runStudioAction = async (key: string, action: () => Promise<void>, success: string) => {
    setSaving(key)
    setStudioMessage(null)
    try {
      await action()
      await onRefresh()
      setStudioMessage(success)
    } catch (error) {
      setStudioMessage(error instanceof Error ? error.message : 'Shado TV studio action failed.')
    } finally {
      setSaving(null)
    }
  }

  const handleCreateChannel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runStudioAction(
      'create-channel',
      async () => {
        await createShadoTvChannel({
          title: channelTitle,
          tagline: channelTagline,
          description: '',
          visibilityStatus: channelStatus,
        })
        setChannelTitle('')
        setChannelTagline('')
        setChannelStatus('hidden')
      },
      'Channel created.'
    )
  }

  const handleCreateVideo = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void runStudioAction(
      'create-video',
      async () => {
        await createShadoTvVideo({
          channelId: videoChannelId,
          title: videoTitle,
          subtitle: videoSubtitle,
          description: '',
          sourceType: videoSourceType,
          releaseStatus: videoStatus,
          orientation: videoOrientation,
          durationMinutes: videoDuration,
          releaseLabel: videoReleaseLabel,
          externalUrl: videoExternalUrl,
          embedUrl: videoExternalUrl,
          visibilityStatus: 'hidden',
        })
        setVideoTitle('')
        setVideoSubtitle('')
        setVideoDuration('')
        setVideoReleaseLabel('')
        setVideoExternalUrl('')
        setVideoSourceType('placeholder')
        setVideoStatus('locked')
      },
      'Video created.'
    )
  }

  const actionButtonClass = 'rounded-full border border-[#d7aa46]/34 px-3 py-1.5 text-[0.68rem] font-black uppercase tracking-[0.14em] text-[#f6e0a2] transition hover:border-[#f0d381]/70 disabled:cursor-not-allowed disabled:opacity-45'

  return (
    <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)_+_1.25rem)] pt-4">
      <section className="rounded-[1.25rem] border border-[#d7aa46]/30 bg-black/68 p-4 shadow-[0_20px_52px_rgba(0,0,0,0.45)]">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.22em] text-[#f0d381]">Studio</p>
        <h1 className="mt-2 text-3xl font-black uppercase leading-8 text-[#f6e0a2]">Shado TV Management</h1>
        <p className="mt-2 text-sm leading-5 text-[#d9c79f]/78">Channels, videos, artwork, processing jobs, and premiere schedules live here.</p>
      </section>

      <div className="mt-4 grid gap-3">
        {[
          { label: 'Channels', value: channels.length, icon: Film },
          { label: 'Videos', value: videos.length, icon: Clapperboard },
          { label: 'Premieres', value: premiereCount, icon: CalendarClock },
          { label: 'Processing', value: processingCount, icon: Upload },
        ].map(item => {
          const Icon = item.icon
          return (
            <article key={item.label} className="flex items-center justify-between rounded-[1rem] border border-[#d7aa46]/24 bg-white/[0.04] p-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#d7aa46]/35 bg-black/42 text-[#f0d381]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-black uppercase tracking-[0.16em] text-[#f6e0a2]">{item.label}</span>
              </div>
              <span className="text-2xl font-black text-[#f6e0a2]">{item.value}</span>
            </article>
          )
        })}
      </div>
      <section className="mt-4 rounded-[1rem] border border-[#d7aa46]/22 bg-white/[0.04] p-4">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.18em] text-[#f0d381]/80">Catalog source</p>
        <p className="mt-1 text-sm font-semibold text-[#f6e0a2]">
          {loadedFromSupabase ? 'Supabase Shado TV domain' : 'Approved static fallback'}
        </p>
        {catalogError && (
          <p className="mt-2 text-xs leading-5 text-[#d9c79f]/72">{catalogError}</p>
        )}
      </section>

      {studioMessage && (
        <section className="mt-4 rounded-[1rem] border border-[#d7aa46]/22 bg-[#d7aa46]/10 p-3 text-sm font-semibold text-[#f6e0a2]">
          {studioMessage}
        </section>
      )}

      <section className="mt-4 rounded-[1rem] border border-[#d7aa46]/24 bg-black/46 p-4">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#f6e0a2]">Create Channel</h2>
        <form className="mt-3 grid gap-3" onSubmit={handleCreateChannel}>
          <input
            value={channelTitle}
            onChange={event => setChannelTitle(event.target.value)}
            placeholder="Channel title"
            className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none placeholder:text-[#d9c79f]/46 focus:border-[#f0d381]/70"
          />
          <input
            value={channelTagline}
            onChange={event => setChannelTagline(event.target.value)}
            placeholder="Short tagline"
            className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none placeholder:text-[#d9c79f]/46 focus:border-[#f0d381]/70"
          />
          <div className="flex gap-2">
            <select
              value={channelStatus}
              onChange={event => setChannelStatus(event.target.value as 'draft' | 'published' | 'hidden')}
              className="h-11 flex-1 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none focus:border-[#f0d381]/70"
            >
              <option value="hidden">Hidden</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            <button type="submit" disabled={saving !== null || !loadedFromSupabase} className={actionButtonClass}>
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="mt-4 rounded-[1rem] border border-[#d7aa46]/24 bg-black/46 p-4">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#f6e0a2]">Create Video</h2>
        <form className="mt-3 grid gap-3" onSubmit={handleCreateVideo}>
          <select
            value={videoChannelId}
            onChange={event => setVideoChannelId(event.target.value)}
            className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none focus:border-[#f0d381]/70"
          >
            {activeChannels.map(channel => (
              <option key={channel.id} value={channel.id}>{channel.name}</option>
            ))}
          </select>
          <input
            value={videoTitle}
            onChange={event => setVideoTitle(event.target.value)}
            placeholder="Video title"
            className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none placeholder:text-[#d9c79f]/46 focus:border-[#f0d381]/70"
          />
          <input
            value={videoSubtitle}
            onChange={event => setVideoSubtitle(event.target.value)}
            placeholder="Subtitle"
            className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none placeholder:text-[#d9c79f]/46 focus:border-[#f0d381]/70"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={videoSourceType}
              onChange={event => setVideoSourceType(event.target.value as NonNullable<ShadoTvVideo['sourceType']>)}
              className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none focus:border-[#f0d381]/70"
            >
              <option value="placeholder">Placeholder</option>
              <option value="external_embed">External</option>
              <option value="native_upload">Native</option>
            </select>
            <select
              value={videoStatus}
              onChange={event => setVideoStatus(event.target.value as ShadoTvVideo['status'])}
              className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none focus:border-[#f0d381]/70"
            >
              <option value="locked">Locked</option>
              <option value="released">Released</option>
              <option value="premiere">Premiere</option>
              <option value="processing">Processing</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={videoOrientation}
              onChange={event => setVideoOrientation(event.target.value as ShadoTvVideo['orientation'])}
              className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none focus:border-[#f0d381]/70"
            >
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical</option>
            </select>
            <input
              value={videoDuration}
              onChange={event => setVideoDuration(event.target.value)}
              inputMode="decimal"
              placeholder="Minutes"
              className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none placeholder:text-[#d9c79f]/46 focus:border-[#f0d381]/70"
            />
          </div>
          <input
            value={videoReleaseLabel}
            onChange={event => setVideoReleaseLabel(event.target.value)}
            placeholder="Release label"
            className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none placeholder:text-[#d9c79f]/46 focus:border-[#f0d381]/70"
          />
          {videoSourceType === 'external_embed' && (
            <input
              value={videoExternalUrl}
              onChange={event => setVideoExternalUrl(event.target.value)}
              placeholder="External video URL"
              className="h-11 rounded-[0.8rem] border border-[#d7aa46]/24 bg-black/48 px-3 text-sm text-[#f6e0a2] outline-none placeholder:text-[#d9c79f]/46 focus:border-[#f0d381]/70"
            />
          )}
          <button type="submit" disabled={saving !== null || !loadedFromSupabase || !videoChannelId} className={`${actionButtonClass} h-11`}>
            Add Video
          </button>
        </form>
      </section>

      <section className="mt-4 rounded-[1rem] border border-[#d7aa46]/24 bg-black/46 p-4">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#f6e0a2]">Channels</h2>
        <div className="mt-3 grid gap-2">
          {[...activeChannels, ...deletedChannels].map(channel => (
            <article key={channel.id} className="rounded-[0.9rem] border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-[#f6e0a2]">{channel.name}</h3>
                  <p className="mt-1 truncate text-xs text-[#d9c79f]/70">{channel.deletedAt ? 'Deleted' : channel.visibilityStatus}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {channel.deletedAt ? (
                    <button type="button" disabled={saving !== null || !loadedFromSupabase} className={actionButtonClass} onClick={() => void runStudioAction(`restore-channel-${channel.id}`, () => restoreShadoTvChannel(channel.id), 'Channel restored as hidden.')}>
                      Restore
                    </button>
                  ) : (
                    <>
                      <button type="button" disabled={saving !== null || !loadedFromSupabase} className={actionButtonClass} onClick={() => void runStudioAction(`toggle-channel-${channel.id}`, () => updateShadoTvChannelVisibility(channel.id, channel.visibilityStatus === 'published' ? 'hidden' : 'published'), 'Channel visibility updated.')}>
                        {channel.visibilityStatus === 'published' ? 'Hide' : 'Publish'}
                      </button>
                      <button type="button" disabled={saving !== null || !loadedFromSupabase} className={actionButtonClass} onClick={() => void runStudioAction(`delete-channel-${channel.id}`, () => softDeleteShadoTvChannel(channel.id), 'Channel deleted.')}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-[1rem] border border-[#d7aa46]/24 bg-black/46 p-4">
        <h2 className="text-sm font-black uppercase tracking-[0.18em] text-[#f6e0a2]">Videos</h2>
        <div className="mt-3 grid gap-2">
          {[...activeVideos, ...deletedVideos].map(video => (
            <article key={video.id} className="rounded-[0.9rem] border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black text-[#f6e0a2]">{video.title}</h3>
                  <p className="mt-1 truncate text-xs text-[#d9c79f]/70">
                    {video.deletedAt ? 'Deleted' : `${video.visibilityStatus} / ${video.status}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {video.deletedAt ? (
                    <button type="button" disabled={saving !== null || !loadedFromSupabase} className={actionButtonClass} onClick={() => void runStudioAction(`restore-video-${video.id}`, () => restoreShadoTvVideo(video.id), 'Video restored as hidden.')}>
                      Restore
                    </button>
                  ) : (
                    <>
                      <button type="button" disabled={saving !== null || !loadedFromSupabase} className={actionButtonClass} onClick={() => void runStudioAction(`toggle-video-${video.id}`, () => updateShadoTvVideoVisibility(video.id, video.visibilityStatus === 'published' ? 'hidden' : 'published'), 'Video visibility updated.')}>
                        {video.visibilityStatus === 'published' ? 'Hide' : 'Publish'}
                      </button>
                      <button type="button" disabled={saving !== null || !loadedFromSupabase} className={actionButtonClass} onClick={() => void runStudioAction(`delete-video-${video.id}`, () => softDeleteShadoTvVideo(video.id), 'Video deleted.')}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export function ShadoTvScreen({ onExit }: ShadoTvScreenProps) {
  const { user } = useAuth()
  const [view, setView] = useState<ShadoTvView>({ type: 'home' })
  const [catalog, setCatalog] = useState(SHADO_TV_FALLBACK_CATALOG)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const canManage = user?.admin_role === 'admin' || user?.admin_role === 'sub_admin'
  const channels = catalog.channels
  const videos = catalog.videos
  const currentVideo = view.type === 'video' ? videos.find(video => video.id === view.videoId) : undefined
  const currentChannel = view.type === 'channel'
    ? getChannelById(channels, view.channelId)
    : currentVideo
      ? getChannelById(channels, currentVideo.channelId)
      : undefined

  const loadCatalog = useCallback(async (admin = false) => {
    try {
      const nextCatalog = admin ? await fetchShadoTvAdminCatalog() : await fetchShadoTvCatalog()
      setCatalog(nextCatalog)
      setCatalogError(null)
    } catch (error) {
      setCatalog(SHADO_TV_FALLBACK_CATALOG)
      setCatalogError(error instanceof Error ? error.message : 'Unable to load Shado TV catalog.')
    }
  }, [])

  useEffect(() => {
    void loadCatalog(false)
  }, [loadCatalog])

  const title = useMemo(() => {
    if (view.type === 'home') return 'Home'
    if (view.type === 'admin') return 'Studio'
    if (currentChannel && view.type === 'channel') return currentChannel.name
    if (currentVideo) return currentVideo.title
    return undefined
  }, [currentChannel, currentVideo, view.type])

  const goBack = () => {
    if (view.type === 'home') {
      onExit()
      return
    }
    if (view.type === 'video' && view.fromChannelId) {
      setView({ type: 'channel', channelId: view.fromChannelId })
      return
    }
    setView({ type: 'home' })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black text-white"
    >
      <img
        src={SHADO_TV_ASSETS.homeBackdrop}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-42"
        width={900}
        height={1600}
        loading="eager"
        decoding="async"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(215,170,70,0.18),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.28),rgba(0,0,0,0.94))]" />
      <ShadoTvHeader
        title={title}
        onBack={view.type === 'home' ? undefined : goBack}
        onExit={onExit}
        canManage={canManage}
        onAdmin={() => {
          setView({ type: 'admin' })
          void loadCatalog(true)
        }}
      />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {view.type === 'home' && (
          <HomeView
            channels={channels}
            videos={videos}
            onOpenChannel={channelId => setView({ type: 'channel', channelId })}
            onOpenVideo={videoId => setView({ type: 'video', videoId })}
          />
        )}
        {view.type === 'channel' && currentChannel && (
          <ChannelView
            channel={currentChannel}
            videos={videos}
            onOpenVideo={videoId => setView({ type: 'video', videoId, fromChannelId: currentChannel.id })}
          />
        )}
        {view.type === 'video' && currentVideo && currentChannel && <VideoView video={currentVideo} channel={currentChannel} />}
        {view.type === 'admin' && (
          <AdminView
            channels={channels}
            videos={videos}
            loadedFromSupabase={catalog.loadedFromSupabase}
            catalogError={catalogError}
            onRefresh={() => loadCatalog(true)}
          />
        )}
      </div>
    </motion.div>
  )
}

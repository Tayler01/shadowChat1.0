import { SHADO_TV_ASSETS } from './assets/manifest'

const EPISODE_ONE_PREMIERE_AT = '2026-07-07T19:00:00-04:00'
const EPISODE_ONE_TRAILER_RELEASED_AT = '2026-05-20T00:00:00-04:00'

export type ShadoTvVideoStatus = 'released' | 'premiere' | 'locked' | 'processing'
export type ShadoTvOrientation = 'horizontal' | 'vertical'
export type ShadoTvUploadStatus = 'none' | 'uploaded' | 'queued' | 'processing' | 'ready' | 'failed'
export type ShadoTvContentSection = 'cast' | 'updates'

export interface ShadoTvChannel {
  id: string
  slug?: string
  name: string
  tagline: string
  description?: string | null
  ticketAsset: string
  ticketAssetPath?: string | null
  heroAsset: string
  heroAssetPath?: string | null
  accent: string
  updatedAtLabel: string
  visibilityStatus?: 'draft' | 'published' | 'hidden'
  hidden?: boolean
  deletedAt?: string | null
}

export interface ShadoTvVideo {
  id: string
  slug?: string
  channelId: string
  title: string
  subtitle: string
  description: string
  posterAsset: string
  posterAssetPath?: string | null
  thumbnailAsset: string
  thumbnailAssetPath?: string | null
  status: ShadoTvVideoStatus
  orientation: ShadoTvOrientation
  durationSeconds?: number | null
  durationLabel: string
  releaseLabel: string
  visibilityStatus?: 'draft' | 'published' | 'hidden'
  sourceType?: 'native_upload' | 'external_embed' | 'placeholder'
  externalUrl?: string | null
  embedUrl?: string | null
  provider?: string | null
  providerAssetId?: string | null
  providerPlaybackId?: string | null
  uploadStatus?: ShadoTvUploadStatus
  uploadError?: string | null
  trailerAssetUrl?: string | null
  trailerReleaseAt?: string | null
  premiereAt?: string | null
  releasedAt?: string | null
  deletedAt?: string | null
  featured?: boolean
  prime?: boolean
  trailerAvailable?: boolean
}

export interface ShadoTvWatchProgress {
  videoId: string
  positionSeconds: number
  durationSeconds?: number | null
  completedAt?: string | null
  updatedAt: string
}

export interface ShadoTvContentItem {
  id: string
  channelId: string
  section: ShadoTvContentSection
  slug?: string
  title: string
  subtitle?: string | null
  body?: string | null
  dateLabel?: string | null
  visibilityStatus?: 'draft' | 'published' | 'hidden'
  sortOrder: number
  deletedAt?: string | null
}

export const SHADO_TV_CHANNELS: ShadoTvChannel[] = [
  {
    id: 'crimp-shrimp',
    slug: 'crimp-shrimp',
    name: 'The Crimp & Shrimp Show',
    tagline: 'Two little troublemakers, one stolen chicken, and a whole lot of small-town mischief.',
    description: 'A rustic family comedy series from Polder Films about two tiny thieves who keep turning simple plans into bigger trouble.',
    ticketAsset: SHADO_TV_ASSETS.crimpShrimp.episodeOneCover,
    heroAsset: SHADO_TV_ASSETS.crimpShrimp.seriesHubHero,
    accent: '#a64022',
    updatedAtLabel: 'Premiere loading',
    visibilityStatus: 'published',
  },
]

export const SHADO_TV_VIDEOS: ShadoTvVideo[] = [
  {
    id: 'the-chicken-snatchers',
    slug: 'the-chicken-snatchers',
    channelId: 'crimp-shrimp',
    title: 'The Chicken Snatchers',
    subtitle: 'Episode 1',
    description: 'The first Crimp & Shrimp caper sends the two small-time troublemakers into the woods with a bad plan, a nervous chicken, and more trouble than they bargained for.',
    posterAsset: SHADO_TV_ASSETS.crimpShrimp.episodeOneCover,
    thumbnailAsset: SHADO_TV_ASSETS.crimpShrimp.featuredEpisodeFrame,
    status: 'premiere',
    orientation: 'horizontal',
    durationSeconds: 30 * 60,
    durationLabel: '30:00',
    releaseLabel: 'Premiere coming soon',
    visibilityStatus: 'published',
    sourceType: 'native_upload',
    provider: 'placeholder',
    uploadStatus: 'none',
    trailerAssetUrl: SHADO_TV_ASSETS.crimpShrimp.testTrailer,
    trailerReleaseAt: EPISODE_ONE_TRAILER_RELEASED_AT,
    premiereAt: EPISODE_ONE_PREMIERE_AT,
    releasedAt: EPISODE_ONE_PREMIERE_AT,
    prime: true,
    featured: true,
    trailerAvailable: true,
  },
]

export const SHADO_TV_CONTENT_ITEMS: ShadoTvContentItem[] = [
  {
    id: 'cast-alyssa-polder',
    channelId: 'crimp-shrimp',
    section: 'cast',
    slug: 'alyssa-polder',
    title: 'Alyssa Polder',
    subtitle: 'The Crimp',
    body: 'The older schemer with a straight face and a talent for choosing the wrong shortcut.',
    sortOrder: 10,
    visibilityStatus: 'published',
  },
  {
    id: 'cast-lindyann-polder',
    channelId: 'crimp-shrimp',
    section: 'cast',
    slug: 'lindyann-polder',
    title: 'Lindyann Polder',
    subtitle: 'The Shrimp',
    body: 'The lookout, sidekick, and accidental conscience of the operation.',
    sortOrder: 20,
    visibilityStatus: 'published',
  },
  {
    id: 'cast-amelia-polder',
    channelId: 'crimp-shrimp',
    section: 'cast',
    slug: 'amelia-polder',
    title: 'Amelia Polder',
    subtitle: 'Director',
    body: 'Guiding the woods, wagon tracks, and small-town comedy timing.',
    sortOrder: 30,
    visibilityStatus: 'published',
  },
  {
    id: 'cast-elisha-polder',
    channelId: 'crimp-shrimp',
    section: 'cast',
    slug: 'elisha-polder',
    title: 'Elisha Polder',
    subtitle: 'Writer',
    body: 'Building the caper, the family-comedy rhythm, and the trouble that keeps getting bigger.',
    sortOrder: 40,
    visibilityStatus: 'published',
  },
  {
    id: 'update-coming-soon-page-live',
    channelId: 'crimp-shrimp',
    section: 'updates',
    slug: 'coming-soon-page-live',
    title: 'Coming Soon page is live',
    subtitle: 'Launch prep',
    body: 'The Crimp & Shrimp show hub is ready for the Episode 1 cover, countdown, trailers, cast, and updates.',
    dateLabel: 'May 20, 2026',
    sortOrder: 10,
    visibilityStatus: 'published',
  },
  {
    id: 'update-trailer-window',
    channelId: 'crimp-shrimp',
    section: 'updates',
    slug: 'trailer-window',
    title: 'Trailer window scheduled',
    subtitle: 'Trailer release',
    body: 'The trailer can be uploaded and published ahead of the full premiere from Shado TV Studio.',
    dateLabel: 'Coming soon',
    sortOrder: 20,
    visibilityStatus: 'published',
  },
  {
    id: 'update-episode-one-premiere',
    channelId: 'crimp-shrimp',
    section: 'updates',
    slug: 'episode-one-premiere',
    title: 'Episode 1 premiere countdown',
    subtitle: 'The Chicken Snatchers',
    body: 'The main upload stays locked with a live countdown until premiere time, then moves into the streaming window.',
    dateLabel: 'Premiere week',
    sortOrder: 30,
    visibilityStatus: 'published',
  },
]

export function getShadoTvChannel(channelId: string) {
  return SHADO_TV_CHANNELS.find(channel => channel.id === channelId) ?? SHADO_TV_CHANNELS[0]
}

export function getShadoTvVideosForChannel(channelId: string) {
  return SHADO_TV_VIDEOS.filter(video => video.channelId === channelId)
}

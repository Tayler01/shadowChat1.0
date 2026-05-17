import { SHADO_TV_ASSETS } from './assets/manifest'

export type ShadoTvVideoStatus = 'released' | 'premiere' | 'locked' | 'processing'
export type ShadoTvOrientation = 'horizontal' | 'vertical'

export interface ShadoTvChannel {
  id: string
  slug?: string
  name: string
  tagline: string
  description?: string | null
  ticketAsset: string
  heroAsset: string
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
  thumbnailAsset: string
  status: ShadoTvVideoStatus
  orientation: ShadoTvOrientation
  durationSeconds?: number | null
  durationLabel: string
  releaseLabel: string
  visibilityStatus?: 'draft' | 'published' | 'hidden'
  sourceType?: 'native_upload' | 'external_embed' | 'placeholder'
  deletedAt?: string | null
  featured?: boolean
  prime?: boolean
  trailerAvailable?: boolean
}

export const SHADO_TV_CHANNELS: ShadoTvChannel[] = [
  {
    id: 'classic-cinema',
    name: 'Classic Cinema',
    tagline: 'Silver-screen legends and midnight restorations.',
    ticketAsset: SHADO_TV_ASSETS.tickets.classic,
    heroAsset: SHADO_TV_ASSETS.channelHeroFallback,
    accent: '#f0d381',
    updatedAtLabel: 'Updated tonight',
  },
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    tagline: 'After-hours premieres with electric city glow.',
    ticketAsset: SHADO_TV_ASSETS.tickets.neon,
    heroAsset: SHADO_TV_ASSETS.channelHeroFallback,
    accent: '#ff6f8f',
    updatedAtLabel: 'Premiere queued',
  },
  {
    id: 'retro-rewind',
    name: 'Retro Rewind',
    tagline: 'Drive-in energy, analog grain, and lost-tape charm.',
    ticketAsset: SHADO_TV_ASSETS.tickets.rewind,
    heroAsset: SHADO_TV_ASSETS.channelHeroFallback,
    accent: '#6eb6ba',
    updatedAtLabel: 'Updated yesterday',
  },
  {
    id: 'late-shift',
    name: 'Late Shift',
    tagline: 'Projection-booth oddities after the lobby lights dim.',
    ticketAsset: SHADO_TV_ASSETS.tickets.late,
    heroAsset: SHADO_TV_ASSETS.channelHeroFallback,
    accent: '#a7ba84',
    updatedAtLabel: 'Trailer live',
  },
  {
    id: 'pixel-planet',
    name: 'Pixel Planet',
    tagline: 'Arcade sci-fi dispatches from the velvet void.',
    ticketAsset: SHADO_TV_ASSETS.tickets.pixel,
    heroAsset: SHADO_TV_ASSETS.channelHeroFallback,
    accent: '#b98ad8',
    updatedAtLabel: 'New poster drop',
  },
]

export const SHADO_TV_VIDEOS: ShadoTvVideo[] = [
  {
    id: 'silver-screen',
    channelId: 'classic-cinema',
    title: 'Silver Screen',
    subtitle: 'Legends',
    description: 'A restored noir placeholder for the first Shado TV marquee slot.',
    posterAsset: SHADO_TV_ASSETS.posters.classicCinema,
    thumbnailAsset: SHADO_TV_ASSETS.placeholders.videoHorizontal,
    status: 'released',
    orientation: 'horizontal',
    durationLabel: '24:18',
    releaseLabel: 'Available now',
    prime: true,
    featured: true,
  },
  {
    id: 'neon-run',
    channelId: 'neon-nights',
    title: 'Neon Run',
    subtitle: 'Premiere',
    description: 'A scheduled premiere placeholder with trailer-first release behavior.',
    posterAsset: SHADO_TV_ASSETS.posters.neonNights,
    thumbnailAsset: SHADO_TV_ASSETS.placeholders.lockedPremiere,
    status: 'premiere',
    orientation: 'horizontal',
    durationLabel: '28:44',
    releaseLabel: 'Premieres Friday 9:00 PM',
    featured: true,
    trailerAvailable: true,
  },
  {
    id: 'drive-in-rewind',
    channelId: 'retro-rewind',
    title: 'Drive-In Rewind',
    subtitle: 'Double Feature',
    description: 'A dusk-drive placeholder for rewind channels and featured rows.',
    posterAsset: SHADO_TV_ASSETS.posters.retroRewind,
    thumbnailAsset: SHADO_TV_ASSETS.placeholders.videoHorizontal,
    status: 'released',
    orientation: 'horizontal',
    durationLabel: '18:02',
    releaseLabel: 'Available now',
    featured: true,
  },
  {
    id: 'midnight-booth',
    channelId: 'late-shift',
    title: 'Midnight Booth',
    subtitle: 'Trailer',
    description: 'A late-night projection-room placeholder with trailer availability.',
    posterAsset: SHADO_TV_ASSETS.posters.lateShift,
    thumbnailAsset: SHADO_TV_ASSETS.placeholders.videoVertical,
    status: 'locked',
    orientation: 'vertical',
    durationLabel: '11:40',
    releaseLabel: 'Trailer available',
    featured: true,
    trailerAvailable: true,
  },
  {
    id: 'pixel-orbit',
    channelId: 'pixel-planet',
    title: 'Pixel Orbit',
    subtitle: 'Signal Test',
    description: 'A retro sci-fi placeholder ready for the processing pipeline.',
    posterAsset: SHADO_TV_ASSETS.posters.pixelPlanet,
    thumbnailAsset: SHADO_TV_ASSETS.placeholders.processing,
    status: 'processing',
    orientation: 'vertical',
    durationLabel: 'Processing',
    releaseLabel: 'Preparing stream',
    featured: false,
  },
]

export function getShadoTvChannel(channelId: string) {
  return SHADO_TV_CHANNELS.find(channel => channel.id === channelId) ?? SHADO_TV_CHANNELS[0]
}

export function getShadoTvVideosForChannel(channelId: string) {
  return SHADO_TV_VIDEOS.filter(video => video.channelId === channelId)
}

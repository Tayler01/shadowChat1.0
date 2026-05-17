import { getWorkingClient } from '../../../lib/supabase'
import { SHADO_TV_ASSETS } from './assets/manifest'
import {
  SHADO_TV_CHANNELS,
  SHADO_TV_VIDEOS,
  type ShadoTvChannel,
  type ShadoTvOrientation,
  type ShadoTvVideo,
  type ShadoTvVideoStatus,
} from './data'

type ChannelVisibility = 'draft' | 'published' | 'hidden'
type VideoSourceType = 'native_upload' | 'external_embed' | 'placeholder'

interface ShadoTvChannelRow {
  id: string
  slug: string
  title: string
  tagline?: string | null
  description?: string | null
  ticket_asset_url?: string | null
  hero_asset_url?: string | null
  accent_color?: string | null
  visibility_status: ChannelVisibility
  latest_visible_video_at?: string | null
  deleted_at?: string | null
  updated_at: string
  created_at: string
}

interface ShadoTvVideoRow {
  id: string
  channel_id?: string | null
  slug: string
  title: string
  subtitle?: string | null
  description?: string | null
  source_type: VideoSourceType
  visibility_status: ChannelVisibility
  release_status: ShadoTvVideoStatus
  orientation: ShadoTvOrientation | 'unknown'
  duration_seconds?: number | null
  release_label?: string | null
  poster_asset_url?: string | null
  thumbnail_asset_url?: string | null
  trailer_asset_url?: string | null
  deleted_at?: string | null
  updated_at: string
  created_at: string
}

interface ShadoTvFeatureRow {
  video_id: string
  feature_type: 'prime' | 'featured'
  sort_order: number
}

export interface ShadoTvCatalog {
  channels: ShadoTvChannel[]
  videos: ShadoTvVideo[]
  loadedFromSupabase: boolean
}

export interface ShadoTvChannelFormValues {
  title: string
  tagline: string
  description: string
  visibilityStatus: ChannelVisibility
}

export interface ShadoTvVideoFormValues {
  channelId: string
  title: string
  subtitle: string
  description: string
  sourceType: VideoSourceType
  releaseStatus: ShadoTvVideoStatus
  orientation: ShadoTvOrientation
  durationMinutes: string
  releaseLabel: string
  externalUrl: string
  embedUrl: string
  visibilityStatus: ChannelVisibility
}

const fallbackCatalog: ShadoTvCatalog = {
  channels: SHADO_TV_CHANNELS,
  videos: SHADO_TV_VIDEOS,
  loadedFromSupabase: false,
}

function formatDuration(seconds?: number | null) {
  if (seconds == null) return 'Processing'
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)

  return slug || `shado-tv-${Date.now()}`
}

function normalizeText(value: string, maxLength: number, label: string, required = false) {
  const text = value.trim()
  if (required && !text) {
    throw new Error(`${label} is required.`)
  }
  if (text.length > maxLength) {
    throw new Error(`${label} is too long.`)
  }
  return text
}

async function getCurrentUserId(label: string) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error(`Sign in to ${label}.`)
  return { client, userId: user.id }
}

function formatUpdatedLabel(value?: string | null) {
  if (!value) return 'Ready for reels'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Ready for reels'

  const today = new Date()
  const ageMs = today.getTime() - date.getTime()
  const dayMs = 24 * 60 * 60 * 1000

  if (ageMs < dayMs) return 'Updated today'
  if (ageMs < dayMs * 2) return 'Updated yesterday'
  return `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function normalizeStatus(status: string): ShadoTvVideoStatus {
  if (status === 'released' || status === 'premiere' || status === 'locked' || status === 'processing') {
    return status
  }
  return 'locked'
}

function normalizeOrientation(orientation: string): ShadoTvOrientation {
  return orientation === 'vertical' ? 'vertical' : 'horizontal'
}

function mapChannel(row: ShadoTvChannelRow): ShadoTvChannel {
  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    tagline: row.tagline || 'A Shado TV channel.',
    description: row.description,
    ticketAsset: row.ticket_asset_url || SHADO_TV_ASSETS.tickets.classic,
    heroAsset: row.hero_asset_url || SHADO_TV_ASSETS.channelHeroFallback,
    accent: row.accent_color || '#f0d381',
    updatedAtLabel: formatUpdatedLabel(row.latest_visible_video_at || row.updated_at || row.created_at),
    visibilityStatus: row.visibility_status,
    hidden: row.visibility_status !== 'published',
    deletedAt: row.deleted_at ?? null,
  }
}

function mapVideo(row: ShadoTvVideoRow, featuresByVideo: Map<string, Set<'prime' | 'featured'>>): ShadoTvVideo {
  const features = featuresByVideo.get(row.id)
  const status = normalizeStatus(row.release_status)

  return {
    id: row.id,
    slug: row.slug,
    channelId: row.channel_id || '',
    title: row.title,
    subtitle: row.subtitle || (status === 'premiere' ? 'Premiere' : status === 'released' ? 'Feature' : 'Preview'),
    description: row.description || 'A Shado TV feature.',
    posterAsset: row.poster_asset_url || SHADO_TV_ASSETS.posters.classicCinema,
    thumbnailAsset: row.thumbnail_asset_url || SHADO_TV_ASSETS.placeholders.videoHorizontal,
    status,
    orientation: normalizeOrientation(row.orientation),
    durationSeconds: row.duration_seconds,
    durationLabel: formatDuration(row.duration_seconds),
    releaseLabel: row.release_label || (status === 'released' ? 'Available now' : 'Coming soon'),
    visibilityStatus: row.visibility_status,
    sourceType: row.source_type,
    deletedAt: row.deleted_at ?? null,
    featured: features?.has('featured') ?? false,
    prime: features?.has('prime') ?? false,
    trailerAvailable: Boolean(row.trailer_asset_url),
  }
}

async function fetchCatalogRows(admin = false) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null

  let channelQuery = client
    .from('shado_tv_channels')
    .select('id, slug, title, tagline, description, ticket_asset_url, hero_asset_url, accent_color, visibility_status, latest_visible_video_at, deleted_at, updated_at, created_at')
    .order('latest_visible_video_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })

  let videoQuery = client
    .from('shado_tv_videos')
    .select('id, channel_id, slug, title, subtitle, description, source_type, visibility_status, release_status, orientation, duration_seconds, release_label, poster_asset_url, thumbnail_asset_url, trailer_asset_url, deleted_at, updated_at, created_at')
    .order('updated_at', { ascending: false })

  if (!admin) {
    channelQuery = channelQuery.is('deleted_at', null).eq('visibility_status', 'published')
    videoQuery = videoQuery.is('deleted_at', null).eq('visibility_status', 'published')
  }

  const { data: channelRows, error: channelError } = await channelQuery
  if (channelError) throw channelError

  const { data: videoRows, error: videoError } = await videoQuery
  if (videoError) throw videoError

  const { data: featureRows, error: featureError } = await client
    .from('shado_tv_home_features')
    .select('video_id, feature_type, sort_order')
    .is('deleted_at', null)
    .order('feature_type', { ascending: false })
    .order('sort_order', { ascending: true })

  if (featureError) throw featureError

  return {
    channelRows: (channelRows ?? []) as ShadoTvChannelRow[],
    videoRows: (videoRows ?? []) as ShadoTvVideoRow[],
    featureRows: (featureRows ?? []) as ShadoTvFeatureRow[],
  }
}

export async function fetchShadoTvCatalog(): Promise<ShadoTvCatalog> {
  const rows = await fetchCatalogRows(false)
  if (!rows) return fallbackCatalog

  const channels = rows.channelRows.map(mapChannel)
  const featuresByVideo = new Map<string, Set<'prime' | 'featured'>>()
  rows.featureRows.forEach(feature => {
    const existing = featuresByVideo.get(feature.video_id) ?? new Set<'prime' | 'featured'>()
    existing.add(feature.feature_type)
    featuresByVideo.set(feature.video_id, existing)
  })

  const videos = rows.videoRows
    .map(row => mapVideo(row, featuresByVideo))
    .filter(video => channels.some(channel => channel.id === video.channelId))

  if (channels.length === 0 || videos.length === 0) {
    return fallbackCatalog
  }

  return {
    channels,
    videos,
    loadedFromSupabase: true,
  }
}

export async function fetchShadoTvAdminCatalog(): Promise<ShadoTvCatalog> {
  const rows = await fetchCatalogRows(true)
  if (!rows) return fallbackCatalog

  const channels = rows.channelRows.map(mapChannel)
  const featuresByVideo = new Map<string, Set<'prime' | 'featured'>>()
  rows.featureRows.forEach(feature => {
    const existing = featuresByVideo.get(feature.video_id) ?? new Set<'prime' | 'featured'>()
    existing.add(feature.feature_type)
    featuresByVideo.set(feature.video_id, existing)
  })
  const videos = rows.videoRows.map(row => mapVideo(row, featuresByVideo))

  return {
    channels,
    videos,
    loadedFromSupabase: true,
  }
}

export async function createShadoTvChannel(values: ShadoTvChannelFormValues) {
  const title = normalizeText(values.title, 80, 'Channel title', true)
  const tagline = normalizeText(values.tagline, 180, 'Tagline')
  const description = normalizeText(values.description, 800, 'Description')
  const { client, userId } = await getCurrentUserId('create Shado TV channels')

  const { error } = await client
    .from('shado_tv_channels')
    .insert({
      slug: slugify(title),
      title,
      tagline: tagline || null,
      description: description || null,
      ticket_asset_url: SHADO_TV_ASSETS.tickets.classic,
      hero_asset_url: SHADO_TV_ASSETS.channelHeroFallback,
      accent_color: '#f0d381',
      visibility_status: values.visibilityStatus,
      created_by: userId,
      updated_by: userId,
    })

  if (error) throw error
}

export async function updateShadoTvChannelVisibility(channelId: string, visibilityStatus: ChannelVisibility) {
  const { client, userId } = await getCurrentUserId('update Shado TV channels')
  const { error } = await client
    .from('shado_tv_channels')
    .update({
      visibility_status: visibilityStatus,
      updated_by: userId,
    })
    .eq('id', channelId)

  if (error) throw error
}

export async function softDeleteShadoTvChannel(channelId: string) {
  const { client, userId } = await getCurrentUserId('delete Shado TV channels')
  const { error } = await client
    .from('shado_tv_channels')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      updated_by: userId,
    })
    .eq('id', channelId)

  if (error) throw error
}

export async function restoreShadoTvChannel(channelId: string) {
  const { client, userId } = await getCurrentUserId('restore Shado TV channels')
  const { error } = await client
    .from('shado_tv_channels')
    .update({
      deleted_at: null,
      deleted_by: null,
      visibility_status: 'hidden',
      updated_by: userId,
    })
    .eq('id', channelId)

  if (error) throw error
}

export async function createShadoTvVideo(values: ShadoTvVideoFormValues) {
  const title = normalizeText(values.title, 120, 'Video title', true)
  const subtitle = normalizeText(values.subtitle, 120, 'Subtitle')
  const description = normalizeText(values.description, 2000, 'Description')
  const releaseLabel = normalizeText(values.releaseLabel, 120, 'Release label')
  const durationMinutes = Number.parseFloat(values.durationMinutes)
  const durationSeconds = Number.isFinite(durationMinutes) && durationMinutes > 0
    ? Math.round(durationMinutes * 60)
    : null
  const { client, userId } = await getCurrentUserId('create Shado TV videos')

  const { error } = await client
    .from('shado_tv_videos')
    .insert({
      channel_id: values.channelId,
      slug: slugify(title),
      title,
      subtitle: subtitle || null,
      description: description || null,
      source_type: values.sourceType,
      visibility_status: values.visibilityStatus,
      release_status: values.releaseStatus,
      orientation: values.orientation,
      duration_seconds: durationSeconds,
      release_label: releaseLabel || null,
      poster_asset_url: SHADO_TV_ASSETS.posters.classicCinema,
      thumbnail_asset_url: values.orientation === 'vertical'
        ? SHADO_TV_ASSETS.placeholders.videoVertical
        : SHADO_TV_ASSETS.placeholders.videoHorizontal,
      external_url: values.externalUrl.trim() || null,
      embed_url: values.embedUrl.trim() || null,
      provider: values.sourceType === 'external_embed' ? 'external' : 'placeholder',
      upload_status: values.releaseStatus === 'processing' ? 'processing' : 'ready',
      created_by: userId,
      updated_by: userId,
    })

  if (error) throw error
}

export async function updateShadoTvVideoVisibility(videoId: string, visibilityStatus: ChannelVisibility) {
  const { client, userId } = await getCurrentUserId('update Shado TV videos')
  const { error } = await client
    .from('shado_tv_videos')
    .update({
      visibility_status: visibilityStatus,
      updated_by: userId,
    })
    .eq('id', videoId)

  if (error) throw error
}

export async function softDeleteShadoTvVideo(videoId: string) {
  const { client, userId } = await getCurrentUserId('delete Shado TV videos')
  const { error } = await client
    .from('shado_tv_videos')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      updated_by: userId,
    })
    .eq('id', videoId)

  if (error) throw error
}

export async function restoreShadoTvVideo(videoId: string) {
  const { client, userId } = await getCurrentUserId('restore Shado TV videos')
  const { error } = await client
    .from('shado_tv_videos')
    .update({
      deleted_at: null,
      deleted_by: null,
      visibility_status: 'hidden',
      updated_by: userId,
    })
    .eq('id', videoId)

  if (error) throw error
}

export { fallbackCatalog as SHADO_TV_FALLBACK_CATALOG }

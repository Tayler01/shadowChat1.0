import { getMediaThumbnailConfig, type MediaThumbnailProfile } from '../../../lib/mediaAssets'
import {
  SHADO_TV_BUCKET,
  getWorkingClient,
  uploadShadoTvArtwork,
  type ShadoTvArtworkTarget,
} from '../../../lib/supabase'
import { SHADO_TV_ASSETS } from './assets/manifest'
import {
  SHADO_TV_CHANNELS,
  SHADO_TV_CONTENT_ITEMS,
  SHADO_TV_VIDEOS,
  type ShadoTvChannel,
  type ShadoTvContentItem,
  type ShadoTvContentSection,
  type ShadoTvOrientation,
  type ShadoTvUploadStatus,
  type ShadoTvVideo,
  type ShadoTvVideoStatus,
  type ShadoTvWatchProgress,
} from './data'
import * as tus from 'tus-js-client'

type ChannelVisibility = 'draft' | 'published' | 'hidden'
type VideoSourceType = 'native_upload' | 'external_embed' | 'placeholder'

interface ShadoTvChannelRow {
  id: string
  slug: string
  title: string
  tagline?: string | null
  description?: string | null
  ticket_asset_url?: string | null
  ticket_asset_path?: string | null
  hero_asset_url?: string | null
  hero_asset_path?: string | null
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
  poster_asset_path?: string | null
  thumbnail_asset_url?: string | null
  thumbnail_asset_path?: string | null
  trailer_asset_url?: string | null
  external_url?: string | null
  embed_url?: string | null
  provider?: string | null
  provider_asset_id?: string | null
  provider_playback_id?: string | null
  provider_payload?: Record<string, unknown> | null
  upload_status?: ShadoTvUploadStatus
  upload_error?: string | null
  trailer_release_at?: string | null
  premiere_at?: string | null
  released_at?: string | null
  deleted_at?: string | null
  updated_at: string
  created_at: string
}

interface ShadoTvFeatureRow {
  video_id: string
  feature_type: 'prime' | 'featured'
  sort_order: number
}

interface ShadoTvContentBlockRow {
  id: string
  channel_id?: string | null
  section: ShadoTvContentSection
  slug: string
  title: string
  subtitle?: string | null
  body?: string | null
  date_label?: string | null
  visibility_status: ChannelVisibility
  sort_order: number
  deleted_at?: string | null
  updated_at: string
  created_at: string
}

interface ShadoTvWatchProgressRow {
  video_id: string
  position_seconds: number
  duration_seconds?: number | null
  completed_at?: string | null
  updated_at: string
}

export interface ShadoTvCatalog {
  channels: ShadoTvChannel[]
  videos: ShadoTvVideo[]
  contentItems: ShadoTvContentItem[]
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

export interface ShadoTvVideoUpdateValues {
  title: string
  subtitle: string
  description: string
  releaseStatus: ShadoTvVideoStatus
  orientation: ShadoTvOrientation
  durationMinutes: string
  releaseLabel: string
  trailerReleaseAt: string
  premiereAt: string
  releasedAt: string
}

export interface ShadoTvContentItemFormValues {
  section: ShadoTvContentSection
  channelId: string
  title: string
  subtitle: string
  body: string
  dateLabel: string
  sortOrder: string
  visibilityStatus: ChannelVisibility
}

export interface ShadoTvContentItemUpdateValues {
  title: string
  subtitle: string
  body: string
  dateLabel: string
  sortOrder: string
}

export type ShadoTvChannelArtworkKind = 'ticket' | 'hero'
export type ShadoTvVideoArtworkKind = 'poster' | 'thumbnail'
export type ShadoTvBunnyUploadKind = 'episode' | 'trailer'

type ShadoTvBunnyUploadSession = {
  ok: boolean
  action: 'create-upload'
  appVideoId: string
  uploadKind: ShadoTvBunnyUploadKind
  bunnyVideoId: string
  libraryId: string
  endpoint: string
  authorizationSignature: string
  authorizationExpire: number
  embedUrl: string
}

type ShadoTvBunnyCompleteResponse = {
  ok: boolean
  action: 'complete-upload'
}

const fallbackCatalog: ShadoTvCatalog = {
  channels: SHADO_TV_CHANNELS,
  videos: SHADO_TV_VIDEOS,
  contentItems: SHADO_TV_CONTENT_ITEMS,
  loadedFromSupabase: false,
}

const SIGNED_ARTWORK_TTL_SECONDS = 6 * 60 * 60
const UNSAFE_SIGNED_TRANSFORM_EXTENSIONS = /\.(gif|svg)(?:$|[?#])/i

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

function normalizeExternalVideoUrl(value: string) {
  const raw = value.trim()
  if (!raw) return { externalUrl: '', embedUrl: '' }

  try {
    const url = new URL(raw)
    const hostname = url.hostname.replace(/^www\./, '')

    if (hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return {
        externalUrl: raw,
        embedUrl: id ? `https://www.youtube.com/embed/${id}` : raw,
      }
    }

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com') {
      const id = url.searchParams.get('v')
      return {
        externalUrl: raw,
        embedUrl: id ? `https://www.youtube.com/embed/${id}` : raw,
      }
    }

    if (hostname === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean)[0]
      return {
        externalUrl: raw,
        embedUrl: id ? `https://player.vimeo.com/video/${id}` : raw,
      }
    }
  } catch {
    return { externalUrl: raw, embedUrl: raw }
  }

  return { externalUrl: raw, embedUrl: raw }
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

function normalizeUploadStatus(status: string | null | undefined): ShadoTvUploadStatus {
  if (status === 'uploaded' || status === 'queued' || status === 'processing' || status === 'ready' || status === 'failed') {
    return status
  }
  return 'none'
}

type WorkingClient = Awaited<ReturnType<typeof getWorkingClient>>

async function createSignedArtworkUrl(
  client: WorkingClient,
  path: string | null | undefined,
  profile: MediaThumbnailProfile
) {
  if (!path) return null

  try {
    const storage = client.storage.from(SHADO_TV_BUCKET)
    const options = UNSAFE_SIGNED_TRANSFORM_EXTENSIONS.test(path)
      ? undefined
      : { transform: getMediaThumbnailConfig(profile) }
    const { data, error } = await storage.createSignedUrl(path, SIGNED_ARTWORK_TTL_SECONDS, options)
    if (error) return null
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}

async function hydrateArtworkAssets(
  client: WorkingClient,
  channels: ShadoTvChannel[],
  videos: ShadoTvVideo[]
) {
  const hydratedChannels = await Promise.all(channels.map(async channel => {
    const [ticketAsset, heroAsset] = await Promise.all([
      createSignedArtworkUrl(client, channel.ticketAssetPath, 'shado-tv-ticket'),
      createSignedArtworkUrl(client, channel.heroAssetPath, 'shado-tv-hero'),
    ])

    return {
      ...channel,
      ticketAsset: ticketAsset || channel.ticketAsset,
      heroAsset: heroAsset || channel.heroAsset,
    }
  }))

  const hydratedVideos = await Promise.all(videos.map(async video => {
    const [posterAsset, thumbnailAsset] = await Promise.all([
      createSignedArtworkUrl(client, video.posterAssetPath, 'shado-tv-poster'),
      createSignedArtworkUrl(client, video.thumbnailAssetPath, 'shado-tv-thumbnail'),
    ])

    return {
      ...video,
      posterAsset: posterAsset || video.posterAsset,
      thumbnailAsset: thumbnailAsset || video.thumbnailAsset,
    }
  }))

  return { channels: hydratedChannels, videos: hydratedVideos }
}

function mapChannel(row: ShadoTvChannelRow): ShadoTvChannel {
  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    tagline: row.tagline || 'A Shado TV channel.',
    description: row.description,
    ticketAsset: row.ticket_asset_url || SHADO_TV_ASSETS.tickets.classic,
    ticketAssetPath: row.ticket_asset_path ?? null,
    heroAsset: row.hero_asset_url || SHADO_TV_ASSETS.channelHeroFallback,
    heroAssetPath: row.hero_asset_path ?? null,
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
    posterAssetPath: row.poster_asset_path ?? null,
    thumbnailAsset: row.thumbnail_asset_url || SHADO_TV_ASSETS.placeholders.videoHorizontal,
    thumbnailAssetPath: row.thumbnail_asset_path ?? null,
    status,
    orientation: normalizeOrientation(row.orientation),
    durationSeconds: row.duration_seconds,
    durationLabel: formatDuration(row.duration_seconds),
    releaseLabel: row.release_label || (status === 'released' ? 'Available now' : 'Coming soon'),
    visibilityStatus: row.visibility_status,
    sourceType: row.source_type,
    externalUrl: row.external_url ?? null,
    embedUrl: row.embed_url ?? null,
    provider: row.provider ?? null,
    providerAssetId: row.provider_asset_id ?? null,
    providerPlaybackId: row.provider_playback_id ?? null,
    uploadStatus: normalizeUploadStatus(row.upload_status),
    uploadError: row.upload_error ?? null,
    trailerAssetUrl: row.trailer_asset_url ?? null,
    trailerReleaseAt: row.trailer_release_at ?? null,
    premiereAt: row.premiere_at ?? null,
    releasedAt: row.released_at ?? null,
    deletedAt: row.deleted_at ?? null,
    featured: features?.has('featured') ?? false,
    prime: features?.has('prime') ?? false,
    trailerAvailable: Boolean(row.trailer_asset_url),
  }
}

function mapContentItem(row: ShadoTvContentBlockRow): ShadoTvContentItem {
  return {
    id: row.id,
    channelId: row.channel_id || '',
    section: row.section,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? null,
    body: row.body ?? null,
    dateLabel: row.date_label ?? null,
    visibilityStatus: row.visibility_status,
    sortOrder: row.sort_order,
    deletedAt: row.deleted_at ?? null,
  }
}

async function fetchCatalogRows(admin = false) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null

  let channelQuery = client
    .from('shado_tv_channels')
    .select('id, slug, title, tagline, description, ticket_asset_url, ticket_asset_path, hero_asset_url, hero_asset_path, accent_color, visibility_status, latest_visible_video_at, deleted_at, updated_at, created_at')
    .order('latest_visible_video_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })

  let videoQuery = client
    .from('shado_tv_videos')
    .select('id, channel_id, slug, title, subtitle, description, source_type, visibility_status, release_status, orientation, duration_seconds, release_label, poster_asset_url, poster_asset_path, thumbnail_asset_url, thumbnail_asset_path, trailer_asset_url, external_url, embed_url, provider, provider_asset_id, provider_playback_id, provider_payload, upload_status, upload_error, trailer_release_at, premiere_at, released_at, deleted_at, updated_at, created_at')
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

  let contentQuery = client
    .from('shado_tv_content_blocks')
    .select('id, channel_id, section, slug, title, subtitle, body, date_label, visibility_status, sort_order, deleted_at, updated_at, created_at')
    .order('section', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })

  if (!admin) {
    contentQuery = contentQuery.is('deleted_at', null).eq('visibility_status', 'published')
  }

  const { data: contentRows, error: contentError } = await contentQuery
  if (contentError) throw contentError

  return {
    client,
    channelRows: (channelRows ?? []) as ShadoTvChannelRow[],
    videoRows: (videoRows ?? []) as ShadoTvVideoRow[],
    featureRows: (featureRows ?? []) as ShadoTvFeatureRow[],
    contentRows: (contentRows ?? []) as ShadoTvContentBlockRow[],
  }
}

export async function fetchShadoTvCatalog(): Promise<ShadoTvCatalog> {
  const rows = await fetchCatalogRows(false)
  if (!rows) return fallbackCatalog

  const mappedChannels = rows.channelRows.map(mapChannel)
  const featuresByVideo = new Map<string, Set<'prime' | 'featured'>>()
  rows.featureRows.forEach(feature => {
    const existing = featuresByVideo.get(feature.video_id) ?? new Set<'prime' | 'featured'>()
    existing.add(feature.feature_type)
    featuresByVideo.set(feature.video_id, existing)
  })

  const mappedVideos = rows.videoRows
    .map(row => mapVideo(row, featuresByVideo))
    .filter(video => mappedChannels.some(channel => channel.id === video.channelId))
  const mappedContentItems = rows.contentRows
    .map(mapContentItem)
    .filter(item => mappedChannels.some(channel => channel.id === item.channelId))

  const { channels, videos } = await hydrateArtworkAssets(rows.client, mappedChannels, mappedVideos)

  return {
    channels,
    videos,
    contentItems: mappedContentItems,
    loadedFromSupabase: true,
  }
}

export async function fetchShadoTvAdminCatalog(): Promise<ShadoTvCatalog> {
  const rows = await fetchCatalogRows(true)
  if (!rows) return fallbackCatalog

  const mappedChannels = rows.channelRows.map(mapChannel)
  const featuresByVideo = new Map<string, Set<'prime' | 'featured'>>()
  rows.featureRows.forEach(feature => {
    const existing = featuresByVideo.get(feature.video_id) ?? new Set<'prime' | 'featured'>()
    existing.add(feature.feature_type)
    featuresByVideo.set(feature.video_id, existing)
  })
  const mappedVideos = rows.videoRows.map(row => mapVideo(row, featuresByVideo))
  const mappedContentItems = rows.contentRows.map(mapContentItem)
  const { channels, videos } = await hydrateArtworkAssets(rows.client, mappedChannels, mappedVideos)

  return {
    channels,
    videos,
    contentItems: mappedContentItems,
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

export async function updateShadoTvChannelArtwork(
  channelId: string,
  kind: ShadoTvChannelArtworkKind,
  file: File
) {
  const target: ShadoTvArtworkTarget = kind === 'ticket' ? 'channel-ticket' : 'channel-hero'
  const { client, userId } = await getCurrentUserId('update Shado TV channel artwork')
  const asset = await uploadShadoTvArtwork(file, target, channelId)
  const updates: Record<string, string | null> = {
    updated_by: userId,
    ...(kind === 'ticket'
      ? { ticket_asset_path: asset.path, ticket_asset_url: null }
      : { hero_asset_path: asset.path, hero_asset_url: null }),
  }

  const { error } = await client
    .from('shado_tv_channels')
    .update(updates)
    .eq('id', channelId)

  if (error) {
    await client.storage.from(SHADO_TV_BUCKET).remove([asset.path]).catch(() => undefined)
    throw error
  }
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
  const external = normalizeExternalVideoUrl(values.externalUrl)
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
      external_url: external.externalUrl || null,
      embed_url: values.embedUrl.trim() || external.embedUrl || null,
      provider: values.sourceType === 'external_embed' ? 'external' : 'placeholder',
      upload_status: values.sourceType === 'external_embed' ? 'ready' : 'none',
      created_by: userId,
      updated_by: userId,
    })

  if (error) throw error
}

export async function updateShadoTvVideoDetails(videoId: string, values: ShadoTvVideoUpdateValues) {
  const title = normalizeText(values.title, 120, 'Video title', true)
  const subtitle = normalizeText(values.subtitle, 120, 'Subtitle')
  const description = normalizeText(values.description, 2000, 'Description')
  const releaseLabel = normalizeText(values.releaseLabel, 120, 'Release label')
  const durationMinutes = Number.parseFloat(values.durationMinutes)
  const durationSeconds = Number.isFinite(durationMinutes) && durationMinutes > 0
    ? Math.round(durationMinutes * 60)
    : null
  const { client, userId } = await getCurrentUserId('update Shado TV videos')

  const toIsoOrNull = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return null
    const date = new Date(trimmed)
    if (Number.isNaN(date.getTime())) {
      throw new Error('Release dates must be valid date/time values.')
    }
    return date.toISOString()
  }

  const { error } = await client
    .from('shado_tv_videos')
    .update({
      title,
      subtitle: subtitle || null,
      description: description || null,
      release_status: values.releaseStatus,
      orientation: values.orientation,
      duration_seconds: durationSeconds,
      release_label: releaseLabel || null,
      trailer_release_at: toIsoOrNull(values.trailerReleaseAt),
      premiere_at: toIsoOrNull(values.premiereAt),
      released_at: toIsoOrNull(values.releasedAt),
      updated_by: userId,
    })
    .eq('id', videoId)

  if (error) throw error
}

export async function updateShadoTvVideoArtwork(
  videoId: string,
  kind: ShadoTvVideoArtworkKind,
  file: File
) {
  const target: ShadoTvArtworkTarget = kind === 'poster' ? 'video-poster' : 'video-thumbnail'
  const { client, userId } = await getCurrentUserId('update Shado TV video artwork')
  const asset = await uploadShadoTvArtwork(file, target, videoId)
  const updates: Record<string, string | null> = {
    updated_by: userId,
    ...(kind === 'poster'
      ? { poster_asset_path: asset.path, poster_asset_url: null }
      : { thumbnail_asset_path: asset.path, thumbnail_asset_url: null }),
  }

  const { error } = await client
    .from('shado_tv_videos')
    .update(updates)
    .eq('id', videoId)

  if (error) {
    await client.storage.from(SHADO_TV_BUCKET).remove([asset.path]).catch(() => undefined)
    throw error
  }
}

async function createBunnyUploadSession(
  videoId: string,
  uploadKind: ShadoTvBunnyUploadKind,
  file: File
) {
  const client = await getWorkingClient()
  const { data, error } = await client.functions.invoke('shado-tv-bunny-upload', {
    body: {
      action: 'create-upload',
      videoId,
      uploadKind,
      fileName: file.name,
      fileType: file.type || 'video/mp4',
      fileSize: file.size,
    },
  })

  if (error) throw error
  return data as ShadoTvBunnyUploadSession
}

async function completeBunnyUpload(
  videoId: string,
  uploadKind: ShadoTvBunnyUploadKind,
  bunnyVideoId: string
) {
  const client = await getWorkingClient()
  const { data, error } = await client.functions.invoke('shado-tv-bunny-upload', {
    body: {
      action: 'complete-upload',
      videoId,
      uploadKind,
      bunnyVideoId,
    },
  })

  if (error) throw error
  return data as ShadoTvBunnyCompleteResponse
}

export async function uploadShadoTvVideoToBunny(
  videoId: string,
  uploadKind: ShadoTvBunnyUploadKind,
  file: File,
  onProgress?: (progress: { bytesUploaded: number; bytesTotal: number; percentage: number }) => void
) {
  if (!file.type.startsWith('video/')) {
    throw new Error('Choose a video file.')
  }

  const session = await createBunnyUploadSession(videoId, uploadKind, file)
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: session.endpoint,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      metadata: {
        filetype: file.type || 'video/mp4',
        title: file.name,
      },
      headers: {
        AuthorizationSignature: session.authorizationSignature,
        AuthorizationExpire: String(session.authorizationExpire),
        VideoId: session.bunnyVideoId,
        LibraryId: session.libraryId,
      },
      onError: reject,
      onProgress(bytesUploaded, bytesTotal) {
        onProgress?.({
          bytesUploaded,
          bytesTotal,
          percentage: bytesTotal > 0 ? Math.round((bytesUploaded / bytesTotal) * 100) : 0,
        })
      },
      onSuccess() {
        resolve()
      },
    })

    upload.findPreviousUploads().then(previousUploads => {
      if (previousUploads.length > 0) {
        upload.resumeFromPreviousUpload(previousUploads[0])
      }
      upload.start()
    }).catch(reject)
  })

  await completeBunnyUpload(videoId, uploadKind, session.bunnyVideoId)
  return session
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

function normalizeSortOrder(value: string) {
  const sortOrder = Number.parseInt(value, 10)
  return Number.isFinite(sortOrder) ? sortOrder : 0
}

export async function createShadoTvContentItem(values: ShadoTvContentItemFormValues) {
  const title = normalizeText(values.title, 160, 'Content title', true)
  const subtitle = normalizeText(values.subtitle, 200, 'Content subtitle')
  const body = normalizeText(values.body, 2400, 'Content body')
  const dateLabel = normalizeText(values.dateLabel, 80, 'Date label')
  const { client, userId } = await getCurrentUserId('create Shado TV content')

  const { error } = await client
    .from('shado_tv_content_blocks')
    .insert({
      channel_id: values.channelId,
      section: values.section,
      slug: slugify(title),
      title,
      subtitle: subtitle || null,
      body: body || null,
      date_label: dateLabel || null,
      visibility_status: values.visibilityStatus,
      sort_order: normalizeSortOrder(values.sortOrder),
      created_by: userId,
      updated_by: userId,
    })

  if (error) throw error
}

export async function updateShadoTvContentItemDetails(
  itemId: string,
  values: ShadoTvContentItemUpdateValues
) {
  const title = normalizeText(values.title, 160, 'Content title', true)
  const subtitle = normalizeText(values.subtitle, 200, 'Content subtitle')
  const body = normalizeText(values.body, 2400, 'Content body')
  const dateLabel = normalizeText(values.dateLabel, 80, 'Date label')
  const { client, userId } = await getCurrentUserId('update Shado TV content')

  const { error } = await client
    .from('shado_tv_content_blocks')
    .update({
      title,
      subtitle: subtitle || null,
      body: body || null,
      date_label: dateLabel || null,
      sort_order: normalizeSortOrder(values.sortOrder),
      updated_by: userId,
    })
    .eq('id', itemId)

  if (error) throw error
}

export async function updateShadoTvContentItemVisibility(itemId: string, visibilityStatus: ChannelVisibility) {
  const { client, userId } = await getCurrentUserId('update Shado TV content')
  const { error } = await client
    .from('shado_tv_content_blocks')
    .update({
      visibility_status: visibilityStatus,
      updated_by: userId,
    })
    .eq('id', itemId)

  if (error) throw error
}

export async function softDeleteShadoTvContentItem(itemId: string) {
  const { client, userId } = await getCurrentUserId('delete Shado TV content')
  const { error } = await client
    .from('shado_tv_content_blocks')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      updated_by: userId,
    })
    .eq('id', itemId)

  if (error) throw error
}

export async function restoreShadoTvContentItem(itemId: string) {
  const { client, userId } = await getCurrentUserId('restore Shado TV content')
  const { error } = await client
    .from('shado_tv_content_blocks')
    .update({
      deleted_at: null,
      deleted_by: null,
      visibility_status: 'hidden',
      updated_by: userId,
    })
    .eq('id', itemId)

  if (error) throw error
}

export async function fetchShadoTvWatchProgress(videoIds: string[]) {
  if (videoIds.length === 0) return new Map<string, ShadoTvWatchProgress>()

  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return new Map<string, ShadoTvWatchProgress>()

  const { data, error } = await client
    .from('shado_tv_watch_progress')
    .select('video_id, position_seconds, duration_seconds, completed_at, updated_at')
    .eq('user_id', user.id)
    .in('video_id', videoIds)

  if (error) throw error

  const progressMap = new Map<string, ShadoTvWatchProgress>()
  ;((data ?? []) as ShadoTvWatchProgressRow[]).forEach(progress => {
    progressMap.set(progress.video_id, {
      videoId: progress.video_id,
      positionSeconds: Number(progress.position_seconds ?? 0),
      durationSeconds: progress.duration_seconds ?? null,
      completedAt: progress.completed_at ?? null,
      updatedAt: progress.updated_at,
    })
  })

  return progressMap
}

export async function saveShadoTvWatchProgress(
  videoId: string,
  positionSeconds: number,
  durationSeconds?: number | null
) {
  const { client, userId } = await getCurrentUserId('save Shado TV watch progress')
  const safePosition = Math.max(0, Math.floor(positionSeconds))
  const safeDuration = durationSeconds == null ? null : Math.max(0, Math.floor(durationSeconds))
  const completedAt = safeDuration && safeDuration > 0 && safePosition >= safeDuration * 0.9
    ? new Date().toISOString()
    : null

  const { error } = await client
    .from('shado_tv_watch_progress')
    .upsert({
      user_id: userId,
      video_id: videoId,
      position_seconds: safePosition,
      duration_seconds: safeDuration,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,video_id' })

  if (error) throw error
}

export { fallbackCatalog as SHADO_TV_FALLBACK_CATALOG }

import { getSupabaseImageTransformUrl } from './storageImageTransforms'

export type MediaThumbnailProfile =
  | 'avatar'
  | 'banner'
  | 'chat'
  | 'weather'
  | 'art-board'
  | 'shado-tv-ticket'
  | 'shado-tv-hero'
  | 'shado-tv-poster'
  | 'shado-tv-thumbnail'

export type MediaThumbnailConfig = {
  width: number
  height: number
  quality: number
  resize: 'cover' | 'contain' | 'fill'
}

export const MEDIA_THUMBNAIL_CONFIGS: Record<MediaThumbnailProfile, MediaThumbnailConfig> = {
  avatar: { width: 240, height: 240, resize: 'cover', quality: 82 },
  banner: { width: 960, height: 540, resize: 'cover', quality: 78 },
  chat: { width: 720, height: 720, resize: 'contain', quality: 76 },
  weather: { width: 720, height: 1100, resize: 'contain', quality: 76 },
  'art-board': { width: 720, height: 720, resize: 'cover', quality: 76 },
  'shado-tv-ticket': { width: 512, height: 768, resize: 'cover', quality: 78 },
  'shado-tv-hero': { width: 1440, height: 720, resize: 'cover', quality: 78 },
  'shado-tv-poster': { width: 640, height: 960, resize: 'cover', quality: 78 },
  'shado-tv-thumbnail': { width: 1280, height: 720, resize: 'cover', quality: 76 },
}

export type StoredImageAsset = {
  path: string
  publicUrl: string
  thumbnailUrl: string
  thumbnailPath: string | null
}

export function getMediaThumbnailUrl(
  publicUrl: string,
  profile: MediaThumbnailProfile
) {
  return getSupabaseImageTransformUrl(publicUrl, MEDIA_THUMBNAIL_CONFIGS[profile])
}

export function getMediaThumbnailConfig(profile: MediaThumbnailProfile): MediaThumbnailConfig {
  return MEDIA_THUMBNAIL_CONFIGS[profile]
}

export function createStoredImageAsset(
  path: string,
  publicUrl: string,
  profile: MediaThumbnailProfile
): StoredImageAsset {
  return {
    path,
    publicUrl,
    thumbnailUrl: getMediaThumbnailUrl(publicUrl, profile),
    thumbnailPath: null,
  }
}

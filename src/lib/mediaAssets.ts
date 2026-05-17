import { getSupabaseImageTransformUrl } from './storageImageTransforms'

export type MediaThumbnailProfile =
  | 'avatar'
  | 'banner'
  | 'chat'
  | 'weather'
  | 'art-board'

type MediaThumbnailConfig = {
  width: number
  height: number
  quality: number
  resize: 'cover' | 'contain' | 'fill'
}

const THUMBNAIL_CONFIGS: Record<MediaThumbnailProfile, MediaThumbnailConfig> = {
  avatar: { width: 240, height: 240, resize: 'cover', quality: 82 },
  banner: { width: 960, height: 540, resize: 'cover', quality: 78 },
  chat: { width: 720, height: 720, resize: 'contain', quality: 76 },
  weather: { width: 720, height: 1100, resize: 'contain', quality: 76 },
  'art-board': { width: 720, height: 720, resize: 'cover', quality: 76 },
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
  return getSupabaseImageTransformUrl(publicUrl, THUMBNAIL_CONFIGS[profile])
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


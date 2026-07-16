import type { User } from '../../lib/supabase'

export type ShadowPinSourceMode = 'file' | 'url'
export type ShadowPinProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type ShadowPinMediaType = 'image' | 'video' | 'external_video'
export type ShadowPinProvider =
  | 'shadow_pin_storage'
  | 'bunny_stream'
  | 'youtube'
  | 'x'
  | 'pinterest'
  | 'instagram'
  | 'external'
export type ShadowPinPinSourceType = 'file_upload' | 'url_import' | 'external_embed'
export type ShadowPinFeedMode = 'discover' | 'connections'

export interface ShadowPinFeedPreference {
  mode: ShadowPinFeedMode
  revision: number
  updatedAt: string | null
}

export interface ShadowPinFeedCursor {
  createdAt: string
  id: string
}

export interface ShadowPinFeedPage {
  images: ShadowPinImage[]
  hasMore: boolean
  nextCursor: ShadowPinFeedCursor | null
}

export interface ShadowPinCategory {
  id: string
  creator_id?: string | null
  title: string
  description?: string | null
  image_url: string
  image_path: string
  image_content_type?: string | null
  image_size_bytes?: number | null
  thumbnail_url?: string | null
  thumbnail_path?: string | null
  medium_url?: string | null
  medium_path?: string | null
  image_width?: number | null
  image_height?: number | null
  processing_status?: ShadowPinProcessingStatus | null
  processing_error?: string | null
  processed_at?: string | null
  latest_image_created_at?: string | null
  heart_count: number
  is_starter?: boolean
  deleted_at?: string | null
  created_at: string
  updated_at: string
  creator?: User | null
  viewer_has_hearted?: boolean
}

export interface ShadowPinImage {
  id: string
  category_id?: string | null
  creator_id?: string | null
  title: string
  description?: string | null
  image_url: string
  image_path?: string
  image_content_type?: string | null
  image_size_bytes?: number | null
  thumbnail_url?: string | null
  thumbnail_path?: string | null
  medium_url?: string | null
  medium_path?: string | null
  image_width?: number | null
  image_height?: number | null
  processing_status?: ShadowPinProcessingStatus | null
  processing_error?: string | null
  processed_at?: string | null
  media_type?: ShadowPinMediaType | null
  source_type?: ShadowPinPinSourceType | null
  source_url?: string | null
  provider?: ShadowPinProvider | null
  provider_asset_id?: string | null
  provider_playback_id?: string | null
  provider_payload?: Record<string, unknown> | null
  video_preview_url?: string | null
  video_playback_url?: string | null
  video_hls_url?: string | null
  video_embed_url?: string | null
  duration_seconds?: number | null
  video_size_bytes?: number | null
  heart_count: number
  comment_count?: number
  tags?: string[]
  deleted_at?: string | null
  created_at: string
  updated_at: string
  creator?: User | null
  category?: Pick<ShadowPinCategory, 'id' | 'title'> | null
  viewer_has_hearted?: boolean
}

export interface ShadowPinComment {
  id: string
  image_id: string
  author_id: string
  parent_comment_id?: string | null
  body: string
  created_at: string
  updated_at: string
  author?: User | null
  reactions?: ShadowPinCommentReactionSummary
}

export type ShadowPinCommentReactionSummary = Record<string, {
  count: number
  users: string[]
}>

export interface ShadowPinNotificationPreferences {
  shadow_pin_new_post_enabled: boolean
  shadow_pin_comment_enabled: boolean
  shadow_pin_reply_enabled: boolean
}

export interface ShadowPinCategoryFormValues {
  title: string
  description: string
  file?: File | null
  url?: string
}

export interface ShadowPinImageFormValues {
  title: string
  description: string
  file?: File | null
  url?: string
  tags?: string[]
}

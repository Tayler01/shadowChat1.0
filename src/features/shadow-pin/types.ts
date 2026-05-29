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
  deleted_at?: string | null
  created_at: string
  updated_at: string
  creator?: User | null
  viewer_has_hearted?: boolean
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
}

import type { User } from '../../lib/supabase'

export type ShadowPinSourceMode = 'file' | 'url'

export interface ShadowPinCategory {
  id: string
  creator_id?: string | null
  title: string
  description?: string | null
  image_url: string
  image_path: string
  image_content_type?: string | null
  image_size_bytes?: number | null
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

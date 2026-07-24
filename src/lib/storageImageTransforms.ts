import { VITE_SUPABASE_IMAGE_TRANSFORMS_ENABLED } from './env'

type SupabaseImageResizeMode = 'cover' | 'contain' | 'fill'

export type SupabaseImageTransformOptions = {
  width?: number
  height?: number
  quality?: number
  resize?: SupabaseImageResizeMode
}

const OBJECT_PUBLIC_MARKER = '/storage/v1/object/public/'
const RENDER_PUBLIC_MARKER = '/storage/v1/render/image/public/'
const UNSAFE_TRANSFORM_EXTENSIONS = /\.(gif|svg)(?:$|[?#])/i
const IMAGE_TRANSFORMS_ENABLED =
  String(VITE_SUPABASE_IMAGE_TRANSFORMS_ENABLED || '').toLowerCase() === 'true'

const clampInteger = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

/**
 * Converts a persisted Supabase render URL back to its durable public-object
 * URL. Public-object delivery does not depend on the optional Image
 * Transformations add-on and remains valid when that service is unavailable.
 */
export function getSupabasePublicObjectUrl(publicUrl?: string | null) {
  if (!publicUrl) return ''

  try {
    const url = new URL(publicUrl)
    if (!url.pathname.includes(RENDER_PUBLIC_MARKER)) return publicUrl

    url.pathname = url.pathname.replace(RENDER_PUBLIC_MARKER, OBJECT_PUBLIC_MARKER)
    url.search = ''
    return url.toString()
  } catch {
    return publicUrl
  }
}

export function getSupabaseImageTransformUrl(
  publicUrl?: string | null,
  options: SupabaseImageTransformOptions = {}
) {
  if (!publicUrl) return ''

  const durablePublicUrl = getSupabasePublicObjectUrl(publicUrl)
  if (!IMAGE_TRANSFORMS_ENABLED) return durablePublicUrl

  try {
    const url = new URL(durablePublicUrl)
    if (!url.pathname.includes(OBJECT_PUBLIC_MARKER) || UNSAFE_TRANSFORM_EXTENSIONS.test(url.pathname)) {
      return durablePublicUrl
    }

    url.pathname = url.pathname.replace(OBJECT_PUBLIC_MARKER, RENDER_PUBLIC_MARKER)
    url.search = ''

    const params = new URLSearchParams()
    if (options.width) params.set('width', String(clampInteger(options.width, 1, 2500)))
    if (options.height) params.set('height', String(clampInteger(options.height, 1, 2500)))
    if (options.quality) params.set('quality', String(clampInteger(options.quality, 20, 100)))
    if (options.resize) params.set('resize', options.resize)
    url.search = params.toString()

    return url.toString()
  } catch {
    return durablePublicUrl
  }
}

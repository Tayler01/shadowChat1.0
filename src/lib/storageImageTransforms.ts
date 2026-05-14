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

const clampInteger = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

export function getSupabaseImageTransformUrl(
  publicUrl?: string | null,
  options: SupabaseImageTransformOptions = {}
) {
  if (!publicUrl) return ''

  try {
    const url = new URL(publicUrl)
    const marker = url.pathname.includes(RENDER_PUBLIC_MARKER)
      ? RENDER_PUBLIC_MARKER
      : OBJECT_PUBLIC_MARKER

    if (!url.pathname.includes(marker) || UNSAFE_TRANSFORM_EXTENSIONS.test(url.pathname)) {
      return publicUrl
    }

    url.pathname = url.pathname.replace(marker, RENDER_PUBLIC_MARKER)
    url.search = ''

    const params = new URLSearchParams()
    if (options.width) params.set('width', String(clampInteger(options.width, 1, 2500)))
    if (options.height) params.set('height', String(clampInteger(options.height, 1, 2500)))
    if (options.quality) params.set('quality', String(clampInteger(options.quality, 20, 100)))
    if (options.resize) params.set('resize', options.resize)
    url.search = params.toString()

    return url.toString()
  } catch {
    return publicUrl
  }
}

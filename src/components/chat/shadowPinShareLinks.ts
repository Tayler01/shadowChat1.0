const SHADOW_PIN_PUBLIC_IMAGE_PATH = '/storage/v1/object/public/shadow-pin/'
const SHADOW_PIN_IMAGE_EXTENSION_PATTERN = /\.(?:avif|gif|jpe?g|png|webp)(?:$|[?#])/i

export const isShadowPinImageShareUrl = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed || /\s/.test(trimmed)) return false

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false
    const pathname = decodeURIComponent(url.pathname)
    return pathname.includes(SHADOW_PIN_PUBLIC_IMAGE_PATH) && SHADOW_PIN_IMAGE_EXTENSION_PATTERN.test(pathname)
  } catch {
    return false
  }
}

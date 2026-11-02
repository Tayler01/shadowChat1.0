/** First-release provider scope is fixed by the edition build, never by a member preference. */
export const KLIPY_GIFS_ENABLED = !(
  typeof __SHADOWCHAT_STREAMLINED_EDITION__ !== 'undefined' && __SHADOWCHAT_STREAMLINED_EDITION__ === true
)

export const KLIPY_UNAVAILABLE_LABEL = 'GIF unavailable in this edition'

export function isKlipyUrl(value?: string | null): boolean {
  if (!value) return false
  try {
    const host = new URL(value, 'https://shadowchat.invalid').hostname.toLowerCase()
    return host === 'klipy.com' || host.endsWith('.klipy.com') || host === 'klipy.co' || host.endsWith('.klipy.co')
  } catch {
    return false
  }
}

export const isUnavailableKlipyUrl = (value?: string | null) => !KLIPY_GIFS_ENABLED && isKlipyUrl(value)

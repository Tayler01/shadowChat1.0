import { getLocationStateFromUrl } from '../lib/appRouting'
import type { AppView } from '../types/navigation'

export const STREAMLINED_VIEWS: readonly AppView[] = ['chat', 'dms', 'pins', 'settings', 'active-users', 'discover']
const routeKeys = ['conversation', 'message', 'thread', 'pin', 'comment', 'panel', 'feed', 'circle', 'section', 'settingsSection', 'experience', 'item']

export function normalizeStreamlinedUrl(input: URL): URL {
  const url = new URL(input)
  const requestedView = url.searchParams.get('view')
  if (requestedView && !STREAMLINED_VIEWS.includes(requestedView as AppView)) {
    url.searchParams.set('view', 'chat')
    routeKeys.forEach(key => url.searchParams.delete(key))
  }
  // Preserve auth callbacks and message/thread/pin deep links; unrelated game
  // destinations never cause the full application to load in this edition.
  url.searchParams.delete('experience')
  url.searchParams.delete('item')
  return url
}

export const readStreamlinedLocation = (url: URL) => getLocationStateFromUrl(normalizeStreamlinedUrl(url))

export function streamlinedViewUrl(input: URL, view: AppView): URL {
  const url = new URL(input)
  routeKeys.forEach(key => url.searchParams.delete(key))
  url.searchParams.set('view', STREAMLINED_VIEWS.includes(view) ? view : 'chat')
  return url
}

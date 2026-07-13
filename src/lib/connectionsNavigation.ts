export const CONNECTIONS_PANEL_ROUTE = '/?view=dms&panel=connections'

export function openConnectionsHub() {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  url.searchParams.set('view', 'dms')
  url.searchParams.set('panel', 'connections')
  url.searchParams.delete('conversation')
  url.searchParams.delete('message')
  url.searchParams.delete('thread')
  url.searchParams.delete('pin')
  url.searchParams.delete('comment')
  url.searchParams.delete('experience')
  url.searchParams.delete('item')

  window.history.pushState(
    { ...(window.history.state ?? {}), shadowchatLayer: 'dm-panel' },
    '',
    url
  )
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}

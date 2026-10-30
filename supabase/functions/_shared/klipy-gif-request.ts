/** Server-only request construction; never return this key-bearing URL to clients. */
export function buildKlipyGifUrl(
  payload: { query: string; page: number; limit: number },
  apiKey: string,
  configuredBaseUrl?: string,
): URL {
  const baseUrl = (configuredBaseUrl || 'https://api.klipy.com').replace(/\/+$/, '')
  const endpoint = payload.query ? 'search' : 'trending'
  const url = new URL(`${baseUrl}/api/v1/${encodeURIComponent(apiKey)}/gifs/${endpoint}`)
  if (payload.query) url.searchParams.set('q', payload.query)
  url.searchParams.set('per_page', String(payload.limit))
  url.searchParams.set('page', String(payload.page))
  // Official v1 schema: content_filter; official ratings table: high = G only.
  // https://docs.klipy.com/content-filtering.md
  url.searchParams.set('content_filter', 'high')
  url.searchParams.set('locale', 'en-US')
  return url
}

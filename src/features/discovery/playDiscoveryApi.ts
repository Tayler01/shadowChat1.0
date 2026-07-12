import { getWorkingClient } from '../../lib/supabase'
import type { PlayDiscoveryEntry } from './discoveryModel'
import {
  PLAY_DISCOVERY_CATALOG,
  rankPlayDiscoveryItems,
} from './playDiscoveryCatalog'

type PublishedPlaySearchRow = {
  target_kind: 'shado_tv_video' | 'shadow_mystery_story'
  target_id: string
  parent_id?: string | null
  target_slug: string
  parent_slug?: string | null
  title: string
  subtitle?: string | null
  description?: string | null
  thumbnail_url?: string | null
  thumbnail_path?: string | null
  search_rank?: number | string | null
}

const mapPublishedPlayRow = (row: PublishedPlaySearchRow): PlayDiscoveryEntry => {
  const isVideo = row.target_kind === 'shado_tv_video'
  return {
    id: `${isVideo ? 'video' : 'story'}:${row.target_id}`,
    kind: isVideo ? 'video' : 'story',
    title: row.title,
    subtitle: row.subtitle || (isVideo ? 'Shado TV' : 'Shadow Mystery'),
    keywords: [
      row.target_slug,
      row.parent_slug ?? '',
      row.description ?? '',
      isVideo ? 'shado tv episode' : 'shadow mystery story',
    ],
    experience: isVideo ? 'shado-tv' : 'shadow-mystery',
    item: row.target_slug,
    targetKind: row.target_kind,
    targetId: row.target_id,
    parentId: row.parent_id ?? null,
    parentSlug: row.parent_slug ?? null,
    description: row.description ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    thumbnailPath: row.thumbnail_path ?? null,
  }
}

export async function searchPlayDiscovery(
  query: string,
  limit: number,
  signal?: AbortSignal
) {
  const client = await getWorkingClient()
  let request = client.rpc('search_published_play_content', {
    search_query: query,
    result_limit: limit,
  })
  if (signal && typeof request.abortSignal === 'function') {
    request = request.abortSignal(signal)
  }
  const { data, error } = await request
  if (error) throw error

  const liveEntries = ((data ?? []) as PublishedPlaySearchRow[]).map(mapPublishedPlayRow)
  return rankPlayDiscoveryItems(
    [...PLAY_DISCOVERY_CATALOG, ...liveEntries],
    query,
    limit
  )
}

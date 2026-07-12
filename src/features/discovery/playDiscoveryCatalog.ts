import type { PlayDiscoveryEntry } from './discoveryModel'

/**
 * Search-only metadata. Keep this file free of entertainment screens, manifests,
 * and artwork imports so opening Discover does not pull Play media into its chunk.
 */
export const PLAY_DISCOVERY_CATALOG: readonly PlayDiscoveryEntry[] = [
  {
    id: 'destination:will-kirk',
    kind: 'destination',
    title: 'Will & Kirk',
    subtitle: 'Coming soon in Entertainment',
    keywords: ['will and kirk', 'film', 'show', 'coming soon'],
    experience: 'will-kirk',
  },
  {
    id: 'destination:shadow-runner',
    kind: 'destination',
    title: 'Shadow Runner',
    subtitle: 'Arcade adventure',
    keywords: ['game', 'runner', 'arcade', 'knight'],
    experience: 'shadow-runner',
  },
  {
    id: 'destination:shado-tv',
    kind: 'destination',
    title: 'Shado TV',
    subtitle: 'Shows and premieres',
    keywords: ['shadow tv', 'television', 'video', 'episodes', 'shows'],
    experience: 'shado-tv',
  },
  {
    id: 'destination:shadow-mystery',
    kind: 'destination',
    title: 'Shadow Mystery',
    subtitle: 'Stories from the strange archive',
    keywords: ['stories', 'mysteries', 'case files', 'novellas', 'archive'],
    experience: 'shadow-mystery',
  },
  {
    id: 'destination:shadow-war',
    kind: 'destination',
    title: 'Shadow War',
    subtitle: 'Strategic battle game',
    keywords: ['game', 'war', 'battle', 'strategy'],
    experience: 'shadow-war',
  },
  {
    id: 'destination:shadow-checkers',
    kind: 'destination',
    title: 'Shadow Checkers',
    subtitle: 'Classic board battle',
    keywords: ['game', 'checkers', 'board game'],
    experience: 'shadow-checkers',
  },
] as const

const normalizeSearchText = (value: string) => (
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
)

const getMatchScore = (entry: PlayDiscoveryEntry, normalizedQuery: string) => {
  const title = normalizeSearchText(entry.title)
  const subtitle = normalizeSearchText(entry.subtitle)
  const keywords = entry.keywords.map(normalizeSearchText)

  if (title === normalizedQuery) return 400
  if (title.startsWith(normalizedQuery)) return 300
  if (title.includes(normalizedQuery)) return 220
  if (subtitle.includes(normalizedQuery)) return 140
  if (keywords.some(keyword => keyword === normalizedQuery)) return 120
  if (keywords.some(keyword => keyword.includes(normalizedQuery))) return 100
  return 0
}

export const rankPlayDiscoveryItems = (
  entries: readonly PlayDiscoveryEntry[],
  query: string,
  limit: number
) => {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  return entries
    .map((entry, catalogIndex) => ({
      entry,
      catalogIndex,
      score: getMatchScore(entry, normalizedQuery),
    }))
    .filter(result => result.score > 0)
    .sort((first, second) => second.score - first.score || first.catalogIndex - second.catalogIndex)
    .slice(0, limit)
    .map(result => result.entry)
}

export const searchPlayDiscoveryCatalog = (query: string, limit: number) => (
  rankPlayDiscoveryItems(PLAY_DISCOVERY_CATALOG, query, limit)
)

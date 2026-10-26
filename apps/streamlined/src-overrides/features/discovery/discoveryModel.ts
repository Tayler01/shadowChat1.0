import { STREAMLINED_EDITION } from '../../config/featureFlags'
import type { MessageLibraryItem, SavedDiscoveryItem } from '../../../../../src/lib/messageLibrary'
import type { BasicUser, User } from '../../lib/supabase'
import type { ShadowPinImage } from '../../../../../src/features/shadow-pin/types'

export const DISCOVERY_MIN_QUERY_LENGTH = 2
export const DISCOVERY_DEFAULT_SOURCE_LIMIT = 8
export const DISCOVERY_MAX_SOURCE_LIMIT = 20

export type DiscoveryScope = 'all' | 'messages' | 'people' | 'pins' | 'play' | 'library'
export type DiscoveryProvider = 'messages' | 'people' | 'pins' | 'play'

export const DISCOVERY_SCOPES: readonly DiscoveryScope[] = STREAMLINED_EDITION
  ? ['all', 'messages', 'people', 'pins', 'library']
  : ['all', 'messages', 'people', 'pins', 'play', 'library']

const DISCOVERY_PROVIDER_ORDER: readonly DiscoveryProvider[] = STREAMLINED_EDITION
  ? ['messages', 'people', 'pins']
  : ['messages', 'people', 'pins', 'play']

export const getDiscoveryProvidersForScope = (scope: DiscoveryScope): readonly DiscoveryProvider[] => {
  if (scope === 'all') return DISCOVERY_PROVIDER_ORDER
  if (scope === 'library' || (STREAMLINED_EDITION && scope === 'play')) return []
  return [scope]
}

export const filterSavedDiscoveryItemsForEdition = (items: SavedDiscoveryItem[]): SavedDiscoveryItem[] => (
  STREAMLINED_EDITION ? items.filter(item => item.targetKind === 'shadow_pin') : items
)

export type PlayExperience =
  | 'will-kirk'
  | 'shadow-runner'
  | 'shado-tv'
  | 'shadow-mystery'
  | 'shadow-war'
  | 'shadow-checkers'

export type PlayDiscoveryEntryKind = 'destination' | 'video' | 'story'

export interface PlayDiscoveryItem {
  id: string
  kind: PlayDiscoveryEntryKind
  title: string
  subtitle: string
  keywords: readonly string[]
  experience: PlayExperience
  item?: string
  targetKind?: 'shado_tv_video' | 'shadow_mystery_story'
  targetId?: string
  parentId?: string | null
  parentSlug?: string | null
  description?: string | null
  thumbnailUrl?: string | null
  thumbnailPath?: string | null
}

export type PlayDiscoveryEntry = PlayDiscoveryItem

export interface DiscoveryGroups {
  messages: MessageLibraryItem[]
  people: BasicUser[]
  pins: ShadowPinImage[]
  play: PlayDiscoveryItem[]
}

export interface DiscoveryProviderError {
  code: 'unavailable'
  message: string
}

export interface DiscoverySearchResponse {
  requestId: string | number
  query: string
  groups: DiscoveryGroups
  errors: Partial<Record<DiscoveryProvider, DiscoveryProviderError>>
}

export interface DiscoverySearchOptions {
  query: string
  scope?: DiscoveryScope
  limitPerSource?: number
  signal?: AbortSignal
  requestId?: string | number
}

export const createEmptyDiscoveryGroups = (): DiscoveryGroups => ({
  messages: [],
  people: [],
  pins: [],
  play: [],
})

export const normalizeDiscoveryQuery = (query: string) => query.trim().slice(0, 200)

export const isDiscoveryQueryReady = (query: string) => (
  normalizeDiscoveryQuery(query).length >= DISCOVERY_MIN_QUERY_LENGTH
)

export const clampDiscoverySourceLimit = (limit = DISCOVERY_DEFAULT_SOURCE_LIMIT) => {
  const finiteLimit = Number.isFinite(limit) ? Math.trunc(limit) : DISCOVERY_DEFAULT_SOURCE_LIMIT
  return Math.min(Math.max(finiteLimit, 1), DISCOVERY_MAX_SOURCE_LIMIT)
}

/**
 * The people RPC intentionally exposes a smaller projection than a full profile.
 * This adapter supplies neutral values for public fields that are not returned so
 * existing profile presentation can consume discovery results without a cast or
 * any private identity lookup.
 */
export const toDiscoveryProfileUser = (user: BasicUser): User => ({
  ...user,
  status_message: '',
  last_active: '',
  created_at: '',
  updated_at: '',
})

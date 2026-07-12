import { searchUniversalDiscovery } from '../src/features/discovery/discoveryApi'
import {
  DISCOVERY_MAX_SOURCE_LIMIT,
  toDiscoveryProfileUser,
} from '../src/features/discovery/discoveryModel'
import { searchPlayDiscovery } from '../src/features/discovery/playDiscoveryApi'
import { searchPlayDiscoveryCatalog } from '../src/features/discovery/playDiscoveryCatalog'
import { searchMessageLibrary } from '../src/lib/messageLibrary'
import type { MessageLibraryItem } from '../src/lib/messageLibrary'
import { searchUsersStrict, type BasicUser } from '../src/lib/supabase'
import { searchShadowPinImages } from '../src/features/shadow-pin/api/shadowPinApi'
import type { ShadowPinImage } from '../src/features/shadow-pin/types'

jest.mock('../src/lib/messageLibrary', () => ({
  searchMessageLibrary: jest.fn(),
}))

jest.mock('../src/lib/supabase', () => ({
  searchUsersStrict: jest.fn(),
}))

jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({
  searchShadowPinImages: jest.fn(),
}))

jest.mock('../src/features/discovery/playDiscoveryApi', () => ({
  searchPlayDiscovery: jest.fn(),
}))

const messageSearch = searchMessageLibrary as jest.MockedFunction<typeof searchMessageLibrary>
const peopleSearch = searchUsersStrict as jest.MockedFunction<typeof searchUsersStrict>
const pinSearch = searchShadowPinImages as jest.MockedFunction<typeof searchShadowPinImages>
const playSearch = searchPlayDiscovery as jest.MockedFunction<typeof searchPlayDiscovery>

const message = {
  source: 'general' as const,
  messageId: 'message-1',
  content: 'Camelot notes',
  messageType: 'text',
  messageCreatedAt: '2026-07-12T12:00:00.000Z',
  author: { id: 'author-1', username: 'author', display_name: 'Author' },
  isSaved: false,
} as MessageLibraryItem

const person: BasicUser = {
  id: 'person-1',
  username: 'camelot',
  display_name: 'Camelot',
  avatar_url: undefined,
  avatar_thumbnail_url: null,
  color: '#d7aa46',
  status: 'online' as const,
}

const pin = {
  id: 'pin-1',
  title: 'Camelot at dusk',
  image_url: 'https://example.test/pin.webp',
  heart_count: 2,
  created_at: '2026-07-12T12:00:00.000Z',
  updated_at: '2026-07-12T12:00:00.000Z',
} as ShadowPinImage

beforeEach(() => {
  jest.resetAllMocks()
  messageSearch.mockResolvedValue([message])
  peopleSearch.mockResolvedValue([person])
  pinSearch.mockResolvedValue([pin])
  playSearch.mockImplementation(async query => query.toLocaleLowerCase().includes('runner')
    ? [{
        id: 'destination:shadow-runner',
        kind: 'destination',
        title: 'Shadow Runner',
        subtitle: 'Arcade adventure',
        keywords: ['runner'],
        experience: 'shadow-runner',
      }]
    : [{
        id: 'story:live-camelot-id',
        kind: 'story',
        title: 'The Last Tee Time At Camelot',
        subtitle: 'A live published story',
        keywords: ['camelot'],
        experience: 'shadow-mystery',
        item: 'camelot-golf-course',
        targetKind: 'shadow_mystery_story',
        targetId: 'live-camelot-id',
      }])
})

test('does not call providers until the normalized query has two characters', async () => {
  const result = await searchUniversalDiscovery({ query: ' a ', requestId: 'short-query' })

  expect(result).toEqual({
    requestId: 'short-query',
    query: 'a',
    groups: { messages: [], people: [], pins: [], play: [] },
    errors: {},
  })
  expect(messageSearch).not.toHaveBeenCalled()
  expect(peopleSearch).not.toHaveBeenCalled()
  expect(pinSearch).not.toHaveBeenCalled()
  expect(playSearch).not.toHaveBeenCalled()
})

test('runs bounded providers in parallel and keeps successful groups when one fails', async () => {
  peopleSearch.mockRejectedValue(new Error('private backend detail'))

  const result = await searchUniversalDiscovery({
    query: ' Camelot ',
    limitPerSource: 999,
    requestId: 'all-providers',
  })

  expect(messageSearch).toHaveBeenCalledWith('Camelot', { limit: DISCOVERY_MAX_SOURCE_LIMIT })
  expect(peopleSearch).toHaveBeenCalledWith('Camelot', { signal: undefined })
  expect(pinSearch).toHaveBeenCalledWith('Camelot', DISCOVERY_MAX_SOURCE_LIMIT)
  expect(result.groups.messages).toEqual([message])
  expect(result.groups.people).toEqual([])
  expect(result.groups.pins).toEqual([pin])
  expect(playSearch).toHaveBeenCalledWith('Camelot', DISCOVERY_MAX_SOURCE_LIMIT, undefined)
  expect(result.groups.play.map(entry => entry.id)).toEqual(['story:live-camelot-id'])
  expect(result.errors.people).toEqual({
    code: 'unavailable',
    message: 'People search is temporarily unavailable.',
  })
  expect(JSON.stringify(result)).not.toContain('private backend detail')
})

test('surfaces a live Play catalog failure without discarding other provider results', async () => {
  playSearch.mockRejectedValue(new Error('live catalog failure'))

  const result = await searchUniversalDiscovery({
    query: 'shadow',
    requestId: 'play-failure',
  })

  expect(result.groups.messages).toEqual([message])
  expect(result.groups.people).toEqual([person])
  expect(result.groups.pins).toEqual([pin])
  expect(result.groups.play).toEqual([])
  expect(result.errors.play).toEqual({
    code: 'unavailable',
    message: 'Play search is temporarily unavailable.',
  })
  expect(JSON.stringify(result)).not.toContain('live catalog failure')
})

test('runs only the provider selected by a scoped search', async () => {
  const result = await searchUniversalDiscovery({
    query: 'runner',
    scope: 'play',
    limitPerSource: 2,
    requestId: 'play-only',
  })

  expect(result.groups.play.map(entry => entry.id)).toEqual(['destination:shadow-runner'])
  expect(messageSearch).not.toHaveBeenCalled()
  expect(peopleSearch).not.toHaveBeenCalled()
  expect(pinSearch).not.toHaveBeenCalled()
})

test('returns immediately with AbortError when an in-flight search is cancelled', async () => {
  messageSearch.mockImplementation(() => new Promise(() => undefined))
  const controller = new AbortController()
  const pending = searchUniversalDiscovery({
    query: 'shadow',
    signal: controller.signal,
    requestId: 'cancelled',
  })

  controller.abort()

  await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
})

test('keeps Play ordering stable and exposes explicit experience and item routes', () => {
  expect(searchPlayDiscoveryCatalog('shadow', 20).map(entry => entry.id)).toEqual([
    'destination:shadow-runner',
    'destination:shadow-mystery',
    'destination:shadow-war',
    'destination:shadow-checkers',
    'destination:shado-tv',
  ])
  expect(searchPlayDiscoveryCatalog('chicken', 5)).toEqual([])
})

test('adapts a safe people result for the existing profile dialog without private fields', () => {
  expect(toDiscoveryProfileUser(person)).toEqual(expect.objectContaining({
    ...person,
    status_message: '',
    created_at: '',
  }))
  expect(toDiscoveryProfileUser(person)).not.toHaveProperty('email')
})

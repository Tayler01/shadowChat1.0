import { searchUniversalDiscovery } from '../apps/streamlined/src-overrides/features/discovery/discoveryApi'
import {
  DISCOVERY_SCOPES,
  filterSavedDiscoveryItemsForEdition,
} from '../apps/streamlined/src-overrides/features/discovery/discoveryModel'
import { searchPlayDiscovery } from '../src/features/discovery/playDiscoveryApi'
import { searchMessageLibrary, type SavedDiscoveryItem } from '../src/lib/messageLibrary'
import { searchUsersStrict } from '../apps/streamlined/src-overrides/lib/supabase'
import { searchShadowPinImages } from '../src/features/shadow-pin/api/shadowPinApi'

jest.mock('../apps/streamlined/src-overrides/config/featureFlags', () => ({ STREAMLINED_EDITION: true }))
jest.mock('../src/lib/messageLibrary', () => ({ searchMessageLibrary: jest.fn() }))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ searchUsersStrict: jest.fn() }))
jest.mock('../src/features/shadow-pin/api/shadowPinApi', () => ({ searchShadowPinImages: jest.fn() }))
jest.mock('../src/features/discovery/playDiscoveryApi', () => ({ searchPlayDiscovery: jest.fn() }))

const messageSearch = jest.mocked(searchMessageLibrary)
const peopleSearch = jest.mocked(searchUsersStrict)
const pinSearch = jest.mocked(searchShadowPinImages)
const playSearch = jest.mocked(searchPlayDiscovery)

beforeEach(() => {
  jest.resetAllMocks()
  messageSearch.mockResolvedValue([])
  peopleSearch.mockResolvedValue([])
  pinSearch.mockResolvedValue([])
  playSearch.mockResolvedValue([])
})

test('searches retained features without making a Play catalog request', async () => {
  const result = await searchUniversalDiscovery({ query: 'member', requestId: 'streamlined-all' })

  expect(DISCOVERY_SCOPES).toEqual(['all', 'messages', 'people', 'pins', 'library'])
  expect(messageSearch).toHaveBeenCalledTimes(1)
  expect(peopleSearch).toHaveBeenCalledTimes(1)
  expect(pinSearch).toHaveBeenCalledTimes(1)
  expect(playSearch).not.toHaveBeenCalled()
  expect(result.groups.play).toEqual([])
  expect(result.errors).toEqual({})
})

test('does not query Play when an older or manually supplied scope requests it', async () => {
  const result = await searchUniversalDiscovery({ query: 'runner', scope: 'play' })

  expect(result.groups).toEqual({ messages: [], people: [], pins: [], play: [] })
  expect(messageSearch).not.toHaveBeenCalled()
  expect(peopleSearch).not.toHaveBeenCalled()
  expect(pinSearch).not.toHaveBeenCalled()
  expect(playSearch).not.toHaveBeenCalled()
})

test('keeps scoped message search available and avoids unrelated provider calls', async () => {
  await searchUniversalDiscovery({ query: 'message', scope: 'messages', limitPerSource: 4 })

  expect(messageSearch).toHaveBeenCalledWith('message', { limit: 4 })
  expect(peopleSearch).not.toHaveBeenCalled()
  expect(pinSearch).not.toHaveBeenCalled()
  expect(playSearch).not.toHaveBeenCalled()
})

test('omits saved Play items from this edition without changing the shared saved records', () => {
  const savedItems: SavedDiscoveryItem[] = [
    { savedId: 'saved-pin', targetKind: 'shadow_pin', targetId: 'pin-1', title: 'Pin', savedAt: '2026-10-22' },
    { savedId: 'saved-video', targetKind: 'shado_tv_video', targetId: 'video-1', title: 'Video', savedAt: '2026-10-22' },
    { savedId: 'saved-story', targetKind: 'shadow_mystery_story', targetId: 'story-1', title: 'Story', savedAt: '2026-10-22' },
  ]

  expect(filterSavedDiscoveryItemsForEdition(savedItems)).toEqual([savedItems[0]])
  expect(savedItems.map(item => item.savedId)).toEqual(['saved-pin', 'saved-video', 'saved-story'])
})

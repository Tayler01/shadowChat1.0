import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GlobalSearchButton } from '../src/components/search/GlobalSearchButton'
import { UniversalDiscoveryView } from '../src/features/discovery/UniversalDiscoveryDialog'
import {
  createMessageCollection,
  listMessageCollections,
  listSavedMessages,
  removeMessageFromLibrary,
  saveMessageToLibrary,
  searchMessageLibrary,
} from '../src/lib/messageLibrary'
import { searchUsersStrict } from '../src/lib/supabase'
import { searchShadowPinImages } from '../src/features/shadow-pin/api/shadowPinApi'
import { searchPlayDiscovery } from '../src/features/discovery/playDiscoveryApi'

jest.mock('../src/lib/messageLibrary', () => ({
  createMessageCollection: jest.fn(),
  deleteMessageCollection: jest.fn(),
  listMessageCollections: jest.fn(),
  listSavedDiscoveryItems: jest.fn(),
  listSavedMessages: jest.fn(),
  moveDiscoveryItemToCollection: jest.fn(),
  removeDiscoveryItemFromLibrary: jest.fn(),
  removeMessageFromLibrary: jest.fn(),
  saveDiscoveryItemToLibrary: jest.fn(),
  saveMessageToLibrary: jest.fn(),
  searchMessageLibrary: jest.fn(),
}))

jest.mock('../src/components/profile/PublicProfileDialog', () => ({
  PublicProfileDialog: () => null,
}))

jest.mock('../src/components/ui/Avatar', () => ({
  Avatar: ({ alt }: { alt: string }) => <span>{alt}</span>,
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

const searchItem = {
  source: 'general' as const,
  messageId: 'message-1',
  conversationId: null,
  content: 'The hidden archive clue',
  messageType: 'text',
  messageCreatedAt: '2026-07-10T00:00:00.000Z',
  author: { display_name: 'Alice', username: 'alice' },
  isSaved: false,
  collectionId: null,
}

const renderDiscovery = (route = 'http://localhost/?view=discover') => {
  window.history.replaceState({}, '', route)
  return render(
    <UniversalDiscoveryView
      currentView="discover"
      onViewChange={jest.fn()}
    />
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(listMessageCollections as jest.Mock).mockResolvedValue([
    {
      id: 'collection-1',
      name: 'Research',
      sortOrder: 0,
      createdAt: '2026-07-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
    },
  ])
  ;(listSavedMessages as jest.Mock).mockResolvedValue([])
  ;(jest.requireMock('../src/lib/messageLibrary').listSavedDiscoveryItems as jest.Mock).mockResolvedValue([])
  ;(searchMessageLibrary as jest.Mock).mockResolvedValue([searchItem])
  ;(saveMessageToLibrary as jest.Mock).mockResolvedValue('saved-1')
  ;(removeMessageFromLibrary as jest.Mock).mockResolvedValue(undefined)
  ;(createMessageCollection as jest.Mock).mockResolvedValue({ id: 'collection-2', name: 'New' })
  ;(searchUsersStrict as jest.Mock).mockResolvedValue([])
  ;(searchShadowPinImages as jest.Mock).mockResolvedValue([])
  ;(searchPlayDiscovery as jest.Mock).mockResolvedValue([])
})

test('searches visible messages and saves a result to the private Library', async () => {
  renderDiscovery()

  await waitFor(() => expect(listMessageCollections).toHaveBeenCalled())
  fireEvent.change(screen.getByPlaceholderText('Search General Chat and your DMs'), {
    target: { value: 'archive clue' },
  })

  expect(await screen.findByText('The hidden archive clue')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(saveMessageToLibrary).toHaveBeenCalledWith({
    source: 'general',
    messageId: 'message-1',
    collectionId: null,
  }))
  expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
})

test('opens saved messages through the existing URL deep-link contract', async () => {
  ;(listSavedMessages as jest.Mock).mockResolvedValue([{ ...searchItem, isSaved: true, savedId: 'saved-1' }])

  renderDiscovery()
  await waitFor(() => expect(listMessageCollections).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('tab', { name: 'Library' }))
  fireEvent.click(await screen.findByText('The hidden archive clue'))

  expect(new URL(window.location.href).searchParams.get('view')).toBe('chat')
  expect(new URL(window.location.href).searchParams.get('message')).toBe('message-1')
})

test('keeps successful result groups usable when other discovery providers fail', async () => {
  ;(searchUsersStrict as jest.Mock).mockRejectedValue(new Error('people unavailable'))
  ;(searchShadowPinImages as jest.Mock).mockResolvedValue([{
    id: 'pin-1',
    title: 'Archive map',
    image_url: 'https://example.com/map.jpg',
    heart_count: 0,
    created_at: '2026-07-12T00:00:00.000Z',
    updated_at: '2026-07-12T00:00:00.000Z',
  }])
  ;(searchPlayDiscovery as jest.Mock).mockRejectedValue(new Error('play unavailable'))

  renderDiscovery()
  fireEvent.change(screen.getByPlaceholderText('Search General Chat and your DMs'), { target: { value: 'archive' } })

  expect(await screen.findByText('Archive map')).toBeInTheDocument()
  expect(screen.getByText('People is temporarily unavailable. Other results are still current.')).toBeInTheDocument()
  expect(screen.getByText('Play is temporarily unavailable. Other results are still current.')).toBeInTheDocument()
  expect(screen.getByText('The hidden archive clue')).toBeInTheDocument()
})

test('saves and opens a Pin while preserving the routed Discover state for Browser Back', async () => {
  const saveDiscoveryItemToLibrary = jest.requireMock('../src/lib/messageLibrary').saveDiscoveryItemToLibrary as jest.Mock
  saveDiscoveryItemToLibrary.mockResolvedValue('saved-pin-1')
  ;(searchShadowPinImages as jest.Mock).mockResolvedValue([{
    id: 'pin-1',
    title: 'Archive map',
    image_url: 'https://example.com/map.jpg',
    heart_count: 0,
    created_at: '2026-07-12T00:00:00.000Z',
    updated_at: '2026-07-12T00:00:00.000Z',
  }])

  const view = renderDiscovery()
  fireEvent.click(screen.getByRole('tab', { name: 'pins' }))
  fireEvent.change(screen.getByPlaceholderText('Search General Chat and your DMs'), { target: { value: 'archive' } })

  expect(await screen.findByText('Archive map')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(saveDiscoveryItemToLibrary).toHaveBeenCalledWith({
    targetKind: 'shadow_pin',
    targetId: 'pin-1',
  }))

  await waitFor(() => {
    const route = new URL(window.location.href)
    expect(route.searchParams.get('view')).toBe('discover')
    expect(route.searchParams.get('scope')).toBe('pins')
    expect(route.searchParams.get('q')).toBe('archive')
  })
  const discoveryRoute = window.location.href

  fireEvent.click(screen.getByText('Archive map'))
  expect(new URL(window.location.href).searchParams.get('pin')).toBe('pin-1')

  view.unmount()
  renderDiscovery(discoveryRoute)
  expect(screen.getByDisplayValue('archive')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'pins' })).toHaveAttribute('aria-selected', 'true')
})

test('opens Discover as an active routed navigation control', () => {
  const onOpen = jest.fn()
  render(<GlobalSearchButton variant="nav" active onOpen={onOpen} />)

  const button = screen.getByRole('button', { name: 'Open search and saved messages' })
  expect(button).toHaveAttribute('aria-current', 'page')
  fireEvent.click(button)
  expect(onOpen).toHaveBeenCalledTimes(1)
})

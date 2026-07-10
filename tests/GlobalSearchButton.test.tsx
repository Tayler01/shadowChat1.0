import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GlobalSearchButton } from '../src/components/search/GlobalSearchButton'
import {
  createMessageCollection,
  listMessageCollections,
  listSavedMessages,
  removeMessageFromLibrary,
  saveMessageToLibrary,
  searchMessageLibrary,
} from '../src/lib/messageLibrary'

jest.mock('../src/lib/messageLibrary', () => ({
  createMessageCollection: jest.fn(),
  deleteMessageCollection: jest.fn(),
  listMessageCollections: jest.fn(),
  listSavedMessages: jest.fn(),
  removeMessageFromLibrary: jest.fn(),
  saveMessageToLibrary: jest.fn(),
  searchMessageLibrary: jest.fn(),
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
  ;(searchMessageLibrary as jest.Mock).mockResolvedValue([searchItem])
  ;(saveMessageToLibrary as jest.Mock).mockResolvedValue('saved-1')
  ;(removeMessageFromLibrary as jest.Mock).mockResolvedValue(undefined)
  ;(createMessageCollection as jest.Mock).mockResolvedValue({ id: 'collection-2', name: 'New' })
})

test('searches visible messages and saves a result into a collection', async () => {
  render(<GlobalSearchButton />)
  fireEvent.click(screen.getByRole('button', { name: 'Open search and saved messages' }))

  await waitFor(() => expect(listMessageCollections).toHaveBeenCalled())
  fireEvent.change(screen.getByPlaceholderText('Search General Chat and your DMs'), {
    target: { value: 'archive clue' },
  })

  expect(await screen.findByText('The hidden archive clue')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Preferred save collection'), {
    target: { value: 'collection-1' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))

  await waitFor(() => expect(saveMessageToLibrary).toHaveBeenCalledWith({
    source: 'general',
    messageId: 'message-1',
    collectionId: 'collection-1',
  }))
  expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument()
})

test('opens saved messages through the existing URL deep-link contract', async () => {
  window.history.replaceState({}, '', 'http://localhost/')
  ;(listSavedMessages as jest.Mock).mockResolvedValue([{ ...searchItem, isSaved: true, savedId: 'saved-1' }])

  render(<GlobalSearchButton />)
  fireEvent.click(screen.getByRole('button', { name: 'Open search and saved messages' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Saved' }))
  fireEvent.click(await screen.findByText('The hidden archive clue'))

  expect(new URL(window.location.href).searchParams.get('view')).toBe('chat')
  expect(new URL(window.location.href).searchParams.get('message')).toBe('message-1')
})

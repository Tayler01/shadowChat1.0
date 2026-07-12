import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  listDMSharedContent,
  searchDMConversationMessages,
  type DMRetrievedMessage,
  type DMSharedContentItem,
} from '../src/lib/dmConversationRetrieval'
import { DMHubConversationContentSheet } from '../src/components/dms/hub/DMHubConversationContentSheet'

jest.mock('../src/lib/dmConversationRetrieval', () => ({
  searchDMConversationMessages: jest.fn(),
  listDMSharedContent: jest.fn(),
}))

const searchMessagesMock = searchDMConversationMessages as jest.MockedFunction<typeof searchDMConversationMessages>
const sharedContentMock = listDMSharedContent as jest.MockedFunction<typeof listDMSharedContent>

const conversationId = '11111111-1111-4111-8111-111111111111'

const message = (overrides: Partial<DMRetrievedMessage> = {}): DMRetrievedMessage => ({
  id: '22222222-2222-4222-8222-222222222222',
  conversationId,
  senderId: '33333333-3333-4333-8333-333333333333',
  content: 'Ghost lights near the river',
  messageType: 'text',
  fileUrl: null,
  thumbnailUrl: null,
  thumbnailPath: null,
  audioUrl: null,
  audioDuration: null,
  clientMessageId: null,
  replyTo: null,
  reactions: {},
  readAt: null,
  readBy: [],
  editedAt: null,
  mediaProcessedAt: null,
  createdAt: '2026-07-11T20:00:00.000Z',
  updatedAt: '2026-07-11T20:00:00.000Z',
  mediaWidth: null,
  mediaHeight: null,
  sender: {
    id: '33333333-3333-4333-8333-333333333333',
    username: 'francis',
    display_name: 'Francis',
  } as DMRetrievedMessage['sender'],
  ...overrides,
})

const sharedItem = (overrides: Partial<DMSharedContentItem> = {}): DMSharedContentItem => ({
  ...message({
    id: '44444444-4444-4444-8444-444444444444',
    content: '',
    messageType: 'image',
    fileUrl: 'https://example.com/full.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
  }),
  contentKind: 'media',
  ...overrides,
})

beforeEach(() => {
  jest.clearAllMocks()
  searchMessagesMock.mockResolvedValue({ items: [], nextCursor: null, hasMore: false })
  sharedContentMock.mockResolvedValue({ items: [], nextCursor: null, hasMore: false })
})

describe('DMHubConversationContentSheet', () => {
  test('searches after the labelled query changes and selects an exact result', async () => {
    const result = message()
    const onClose = jest.fn()
    const onSelectMessage = jest.fn()
    searchMessagesMock.mockResolvedValue({ items: [result], nextCursor: null, hasMore: false })

    render(
      <DMHubConversationContentSheet
        open
        panel="search"
        conversationId={conversationId}
        conversationLabel="Francis"
        onClose={onClose}
        onSelectMessage={onSelectMessage}
        debounceMs={0}
      />
    )

    const search = screen.getByRole('searchbox', { name: 'Search messages in this conversation' })
    expect(search).toHaveClass('h-12')
    await waitFor(() => expect(search).toHaveFocus())
    fireEvent.change(search, { target: { value: 'ghost lights' } })

    await waitFor(() => expect(searchMessagesMock).toHaveBeenCalledWith(
      conversationId,
      'ghost lights',
      { limit: 30 }
    ))

    const resultButton = await screen.findByRole('button', { name: /Francis, Message.*Ghost lights near the river/i })
    expect(resultButton).toHaveClass('min-h-12')
    fireEvent.click(resultButton)

    expect(onClose).not.toHaveBeenCalled()
    expect(onSelectMessage).toHaveBeenCalledWith(result.id)
  })

  test('search supports keyset load-more and recovers from a retryable error', async () => {
    const first = message()
    const second = message({
      id: '55555555-5555-4555-8555-555555555555',
      content: 'Older ghost light report',
      createdAt: '2026-07-10T18:00:00.000Z',
      updatedAt: '2026-07-10T18:00:00.000Z',
    })
    const cursor = { createdAt: first.createdAt, id: first.id }
    searchMessagesMock
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockResolvedValueOnce({ items: [first], nextCursor: cursor, hasMore: true })
      .mockResolvedValueOnce({ items: [second], nextCursor: null, hasMore: false })

    render(
      <DMHubConversationContentSheet
        open
        panel="search"
        conversationId={conversationId}
        conversationLabel="Francis"
        onClose={jest.fn()}
        onSelectMessage={jest.fn()}
        debounceMs={0}
      />
    )

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search messages in this conversation' }), {
      target: { value: 'ghost' },
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted')

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Ghost lights near the river')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(searchMessagesMock).toHaveBeenLastCalledWith(
      conversationId,
      'ghost',
      { limit: 30, cursor }
    ))
    expect(await screen.findByText('Older ghost light report')).toBeInTheDocument()
  })

  test('shared content provides filters, a bounded grid, keyset loading, and exact selection', async () => {
    const first = sharedItem()
    const second = sharedItem({
      id: '66666666-6666-4666-8666-666666666666',
      contentKind: 'links',
      messageType: 'text',
      content: 'https://example.com/story',
      fileUrl: null,
      thumbnailUrl: null,
      createdAt: '2026-07-10T17:00:00.000Z',
      updatedAt: '2026-07-10T17:00:00.000Z',
    })
    const cursor = { createdAt: first.createdAt, id: first.id }
    const onClose = jest.fn()
    const onSelectMessage = jest.fn()
    sharedContentMock
      .mockResolvedValueOnce({ items: [first], nextCursor: cursor, hasMore: true })
      .mockResolvedValueOnce({ items: [second], nextCursor: null, hasMore: false })
      .mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })

    render(
      <DMHubConversationContentSheet
        open
        panel="shared"
        conversationId={conversationId}
        conversationLabel="Francis"
        onClose={onClose}
        onSelectMessage={onSelectMessage}
      />
    )

    expect(await screen.findByRole('button', { name: /Photo, shared by Francis/i })).toHaveClass('min-h-12')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Media' })).toHaveClass('min-h-12')

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(sharedContentMock).toHaveBeenNthCalledWith(2, conversationId, {
      filter: 'all',
      limit: 30,
      cursor,
    }))
    const link = await screen.findByRole('button', { name: /https:\/\/example.com\/story, shared by Francis/i })
    fireEvent.click(link)
    expect(onClose).not.toHaveBeenCalled()
    expect(onSelectMessage).toHaveBeenCalledWith(second.id)

    fireEvent.click(screen.getByRole('button', { name: 'Files' }))
    await waitFor(() => expect(sharedContentMock).toHaveBeenLastCalledWith(conversationId, {
      filter: 'files',
      limit: 30,
    }))
    expect(await screen.findByText('Nothing shared here yet')).toBeInTheDocument()
  })

  test('shared content exposes errors and retries the active filter', async () => {
    sharedContentMock
      .mockRejectedValueOnce(new Error('Shared content unavailable'))
      .mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })

    render(
      <DMHubConversationContentSheet
        open
        panel="shared"
        conversationId={conversationId}
        conversationLabel="Francis"
        onClose={jest.fn()}
        onSelectMessage={jest.fn()}
      />
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('Shared content unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Nothing shared here yet')).toBeInTheDocument()
    expect(sharedContentMock).toHaveBeenCalledTimes(2)
  })
})

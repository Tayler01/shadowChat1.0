import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { BoardsView } from '../src/components/boards/BoardsView'

const mockMarkFeedSeen = jest.fn()

jest.mock('../src/hooks/useBoardBadges', () => ({
  useBoardBadges: () => ({
    count: 0,
    navCount: 0,
    countsByBoard: { 'news-feed': 2, 'news-chat': 3 },
    refresh: jest.fn(),
    markFeedSeen: mockMarkFeedSeen,
  }),
}))

jest.mock('../src/components/boards/BoardBubbleMap', () => ({
  BoardBubbleMap: ({ onSelect }: { onSelect: (board: any) => void }) => (
    <div>
      <button
        type="button"
        onClick={() => onSelect({
          slug: 'news-feed',
          title: 'News Feed',
          kind: 'feed',
          description: 'Tracked source feed',
          navUnread: false,
          accent: '#d7aa46',
          defaultPosition: { x: 0, y: 0, radius: 80 },
        })}
      >
        News Feed
      </button>
      <button
        type="button"
        onClick={() => onSelect({
          slug: 'news-chat',
          title: 'News Chat',
          kind: 'chat',
          description: 'Links and live discussion',
          navUnread: true,
          moderationScope: 'board_news_chat',
          accent: '#d7aa46',
          defaultPosition: { x: 0, y: 0, radius: 80 },
        })}
      >
        News Chat
      </button>
    </div>
  ),
}))

jest.mock('../src/components/news/NewsFeed', () => ({
  NewsFeed: () => <div>feed board</div>,
}))

jest.mock('../src/components/boards/BoardChat', () => ({
  BoardChat: () => <div>chat board</div>,
}))

beforeEach(() => {
  mockMarkFeedSeen.mockResolvedValue(undefined)
})

afterEach(() => {
  mockMarkFeedSeen.mockReset()
})

test('boards view opens feed boards and marks feed unread as seen immediately', async () => {
  render(<BoardsView />)

  expect(screen.getByRole('heading', { name: 'Boards' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'News Feed' }))
  expect(screen.getByText('feed board')).toBeInTheDocument()

  await waitFor(() => {
    expect(mockMarkFeedSeen).toHaveBeenCalled()
  })
})

test('boards view opens chat boards without clearing feed unread', () => {
  const onMobileChatActiveChange = jest.fn()
  render(<BoardsView onMobileChatActiveChange={onMobileChatActiveChange} />)

  fireEvent.click(screen.getByRole('button', { name: 'News Chat' }))

  expect(screen.getByText('chat board')).toBeInTheDocument()
  expect(mockMarkFeedSeen).not.toHaveBeenCalled()
  expect(onMobileChatActiveChange).toHaveBeenLastCalledWith(true)
})

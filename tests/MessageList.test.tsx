import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MessageList } from '../src/components/chat/MessageList'
import type { Message } from '../src/lib/supabase'

const mockUseMessages = jest.fn()
const mockUseTyping = jest.fn()
const mockUseAuth = jest.fn()
const mockUseReadCursor = jest.fn()
const mockScrollToBottom = jest.fn()
const mockHandleUnreadScroll = jest.fn()
const mockUnreadState = {
  autoScroll: true,
}

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}))

jest.mock('../src/hooks/useMessages', () => ({
  useMessages: () => mockUseMessages(),
}))

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => mockUseTyping(),
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

jest.mock('../src/hooks/useReadCursor', () => ({
  useReadCursor: () => mockUseReadCursor(),
}))

jest.mock('../src/hooks/useUnreadScroll', () => ({
  useUnreadScroll: () => ({
    autoScroll: mockUnreadState.autoScroll,
    firstUnreadMessageId: null,
    setAutoScroll: jest.fn(),
    setFirstUnreadMessageId: jest.fn(),
    handleUnreadScroll: mockHandleUnreadScroll,
    scrollToBottom: mockScrollToBottom,
    markLatestRead: jest.fn(),
  }),
}))

jest.mock('../src/components/chat/MessageItem', () => ({
  MessageItem: ({ message }: { message: Message }) => (
    <div id={`message-${message.id}`} data-testid={`message-${message.id}`}>
      {message.content}
    </div>
  ),
}))

jest.mock('../src/components/chat/FailedMessageItem', () => ({
  FailedMessageItem: () => <div data-testid="failed-message" />,
}))

jest.mock('../src/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <span data-testid="loading-spinner" />,
}))

jest.mock('../src/components/ui/UserRoleBadge', () => ({
  UserRoleBadge: () => null,
}))

jest.mock('../src/components/ui/UserPresenceBadge', () => ({
  UserPresenceBadge: () => null,
}))

const message = {
  id: 'm1',
  user_id: 'u1',
  content: 'A tiny group chat thread',
  message_type: 'text',
  reactions: {},
  pinned: false,
  created_at: '2026-05-03T12:00:00.000Z',
  updated_at: '2026-05-03T12:00:00.000Z',
  user: {
    id: 'u1',
    email: 'alice@example.com',
    username: 'alice',
    display_name: 'Alice',
    status: 'online',
    status_message: '',
    color: '#d7aa46',
    last_active: '2026-05-03T12:00:00.000Z',
    created_at: '2026-05-03T12:00:00.000Z',
    updated_at: '2026-05-03T12:00:00.000Z',
  },
} as unknown as Message

const makeMessage = (index: number) => ({
  ...message,
  id: `m${index}`,
  content: `Message ${index}`,
  created_at: new Date(Date.UTC(2026, 4, 3, 12, 0, index)).toISOString(),
  updated_at: new Date(Date.UTC(2026, 4, 3, 12, 0, index)).toISOString(),
}) as unknown as Message

describe('MessageList mobile keyboard layout', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame
  const originalVisualViewport = window.visualViewport

  beforeEach(() => {
    mockUnreadState.autoScroll = true
    mockScrollToBottom.mockClear()
    mockHandleUnreadScroll.mockClear()
    mockUseMessages.mockReturnValue({
      messages: [message],
      loading: false,
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      togglePin: jest.fn(),
      toggleReaction: jest.fn(),
      loadOlderMessages: jest.fn(),
      loadingMore: false,
      hasMore: false,
    })
    mockUseTyping.mockReturnValue({ typingUsers: [] })
    mockUseAuth.mockReturnValue({ profile: { id: 'u1' } })
    mockUseReadCursor.mockReturnValue({
      cursor: null,
      loading: false,
      markRead: jest.fn(),
    })
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = jest.fn()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
    jest.clearAllMocks()
  })

  it('anchors sparse group chat content above the measured mobile footer', () => {
    render(<MessageList />)

    expect(screen.getByTestId('message-scroll')).toHaveClass(
      'pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-mobile-scroll-keyboard-inset,0px)_+_0.75rem)]'
    )
    expect(screen.getByTestId('message-stack')).toHaveClass(
      'flex',
      'min-h-full',
      'flex-col',
      'justify-end'
    )
    expect(screen.getByText('A tiny group chat thread')).toBeInTheDocument()
  })

  it('delegates scroll state to the unread-scroll hook without loading history from raw scroll math', () => {
    render(<MessageList />)

    fireEvent.scroll(screen.getByTestId('message-scroll'))

    expect(mockHandleUnreadScroll).toHaveBeenCalled()
    expect(mockUseMessages().loadOlderMessages).not.toHaveBeenCalled()
  })

  it('keeps only the latest group chat window mounted while preserving loaded count metadata', async () => {
    const manyMessages = Array.from({ length: 110 }, (_, index) => makeMessage(index))
    mockUseMessages.mockReturnValue({
      messages: manyMessages,
      loading: false,
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      togglePin: jest.fn(),
      toggleReaction: jest.fn(),
      loadOlderMessages: jest.fn(),
      loadingMore: false,
      hasMore: false,
    })

    render(<MessageList />)

    await waitFor(() => {
      expect(screen.queryByText('Message 0')).not.toBeInTheDocument()
    })
    expect(screen.getByText('Message 109')).toBeInTheDocument()
    expect(screen.getByTestId('message-scroll')).toHaveAttribute('data-loaded-count', '110')
    expect(screen.getByTestId('message-scroll')).toHaveAttribute('data-rendered-count', '90')
  })

  it('throttles top-of-history requests when the loader remains visible', async () => {
    const loadOlderMessages = jest.fn().mockResolvedValue(undefined)
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000)
    const originalIntersectionObserver = window.IntersectionObserver
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: undefined,
    })
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(0), 0)
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = ((id: number) => {
      window.clearTimeout(id)
    }) as typeof window.cancelAnimationFrame
    mockUseMessages.mockReturnValue({
      messages: [message],
      loading: false,
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      togglePin: jest.fn(),
      toggleReaction: jest.fn(),
      loadOlderMessages,
      loadingMore: false,
      hasMore: true,
    })

    try {
      render(<MessageList />)
      const scrollContainer = screen.getByTestId('message-scroll')
      Object.defineProperties(scrollContainer, {
        scrollTop: { configurable: true, value: 0, writable: true },
        scrollHeight: { configurable: true, value: 1200 },
        clientHeight: { configurable: true, value: 600 },
      })

      fireEvent.scroll(scrollContainer)
      await waitFor(() => expect(loadOlderMessages).toHaveBeenCalledTimes(1))
      await Promise.resolve()
      await Promise.resolve()

      fireEvent.scroll(scrollContainer)
      await new Promise(resolve => window.setTimeout(resolve, 0))
      expect(loadOlderMessages).toHaveBeenCalledTimes(1)

      nowSpy.mockReturnValue(3_000)
      fireEvent.scroll(scrollContainer)
      await waitFor(() => expect(loadOlderMessages).toHaveBeenCalledTimes(2))
    } finally {
      nowSpy.mockRestore()
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: originalIntersectionObserver,
      })
    }
  })
})

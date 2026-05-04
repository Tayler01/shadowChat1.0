import { act, render, screen } from '@testing-library/react'
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

jest.mock('../src/components/chat/ThreadReplyLink', () => ({
  ThreadReplyLink: ({ message }: { message: Message }) => (
    <div data-testid={`reply-link-${message.id}`}>{message.content}</div>
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
      'pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-keyboard-inset,0px)_+_0.75rem)]'
    )
    expect(screen.getByTestId('message-stack')).toHaveClass(
      'flex',
      'min-h-full',
      'flex-col',
      'justify-end'
    )
    expect(screen.getByText('A tiny group chat thread')).toBeInTheDocument()
  })

  it('keeps the latest group chat message visible while the mobile viewport changes', () => {
    const listeners: Record<string, EventListener[]> = {}
    const visualViewport = {
      addEventListener: jest.fn((type: string, listener: EventListener) => {
        listeners[type] = [...(listeners[type] || []), listener]
      }),
      removeEventListener: jest.fn(),
      height: 520,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    } as unknown as VisualViewport

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    })

    render(<MessageList />)
    mockScrollToBottom.mockClear()

    act(() => {
      listeners.resize?.forEach(listener => listener(new Event('resize')))
    })

    expect(mockScrollToBottom).toHaveBeenCalledWith('auto')

    mockScrollToBottom.mockClear()

    act(() => {
      window.dispatchEvent(new Event('focusin'))
    })

    expect(mockScrollToBottom).toHaveBeenCalledWith('auto')
  })
})

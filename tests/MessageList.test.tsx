import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MessageList } from '../src/components/chat/MessageList'
import type { Message } from '../src/lib/supabase'

const mockUseMessages = jest.fn()
const mockUseTyping = jest.fn()
const mockUseAuth = jest.fn()
const mockUseReadCursor = jest.fn()
const mockUseUnreadScroll = jest.fn()
const mockScrollToBottom = jest.fn()
const mockHandleUnreadScroll = jest.fn()
const mockMarkLatestRead = jest.fn()
const mockUnreadState = {
  autoScroll: true,
  firstUnreadMessageId: null as string | null,
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
  useUnreadScroll: (options: unknown) => mockUseUnreadScroll(options),
}))

mockUseUnreadScroll.mockImplementation(() => ({
  autoScroll: mockUnreadState.autoScroll,
  firstUnreadMessageId: mockUnreadState.firstUnreadMessageId,
  feedState: mockUnreadState.autoScroll ? 'bottomPinned' : 'userScrolledUp',
  targetMessageId: mockUnreadState.firstUnreadMessageId,
  lastObservedMessageId: mockUnreadState.firstUnreadMessageId,
  lastFlushedMessageId: null,
  setAutoScroll: jest.fn(),
  setFirstUnreadMessageId: jest.fn(),
  handleUnreadScroll: mockHandleUnreadScroll,
  scrollToBottom: mockScrollToBottom,
  markLatestRead: mockMarkLatestRead,
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
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

  beforeEach(() => {
    mockUnreadState.autoScroll = true
    mockUnreadState.firstUnreadMessageId = null
    mockUseUnreadScroll.mockClear()
    mockScrollToBottom.mockClear()
    mockHandleUnreadScroll.mockClear()
    mockMarkLatestRead.mockClear()
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
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    })
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: originalScrollIntoView,
      })
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
    }
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

  it('keeps cached messages mounted inside the scroll container while a refresh is loading', () => {
    mockUseMessages.mockReturnValue({
      messages: [message],
      loading: true,
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      togglePin: jest.fn(),
      toggleReaction: jest.fn(),
      loadOlderMessages: jest.fn(),
      loadingMore: false,
      hasMore: false,
    })

    render(<MessageList />)

    expect(screen.getByTestId('message-scroll')).toBeInTheDocument()
    expect(screen.getByText('A tiny group chat thread')).toBeInTheDocument()
    expect(screen.queryByText('Loading the conversation...')).not.toBeInTheDocument()
  })

  it('delegates scroll state to the unread-scroll hook without loading history from raw scroll math', () => {
    render(<MessageList />)

    fireEvent.scroll(screen.getByTestId('message-scroll'))

    expect(mockHandleUnreadScroll).toHaveBeenCalled()
    expect(mockUseMessages().loadOlderMessages).not.toHaveBeenCalled()
  })

  it('loads older history from the top scroll position even when the observer misses it', async () => {
    const loadOlderMessages = jest.fn().mockResolvedValue(undefined)
    const originalIntersectionObserver = window.IntersectionObserver
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: class MockIntersectionObserver {
        observe = jest.fn()
        disconnect = jest.fn()
      },
    })
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
    } finally {
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: originalIntersectionObserver,
      })
    }
  })

  it('does not load older history while a first-unread target is active near the top', async () => {
    const loadOlderMessages = jest.fn().mockResolvedValue(undefined)
    mockUnreadState.autoScroll = false
    mockUnreadState.firstUnreadMessageId = 'm0'
    const originalIntersectionObserver = window.IntersectionObserver
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: class MockIntersectionObserver {
        observe = jest.fn()
        disconnect = jest.fn()
      },
    })
    mockUseMessages.mockReturnValue({
      messages: [makeMessage(0), makeMessage(1)],
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
      await act(async () => {
        await Promise.resolve()
      })

      expect(loadOlderMessages).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: originalIntersectionObserver,
      })
    }
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

  it('initializes the mounted window to latest messages while unread targeting is still unresolved', async () => {
    mockUnreadState.autoScroll = false
    mockUnreadState.firstUnreadMessageId = null
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
    expect(screen.getByTestId('message-scroll')).toHaveAttribute('data-rendered-count', '90')
  })

  it('does not mark the latest loaded message read when opening an old deep link', async () => {
    const manyMessages = Array.from({ length: 120 }, (_, index) => makeMessage(index))
    mockUseMessages.mockReturnValue({
      messages: manyMessages,
      loading: false,
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      togglePin: jest.fn(),
      toggleReaction: jest.fn(),
      loadOlderMessages: jest.fn(),
      loadingMore: false,
      hasMore: true,
    })

    render(<MessageList initialMessageId="m10" />)

    await act(async () => {
      await Promise.resolve()
    })

    expect(mockMarkLatestRead).not.toHaveBeenCalled()
  })

  it('does not request a stale cursor-anchored window when the stored cursor predates the latest page', async () => {
    const ensureMessageWindow = jest.fn().mockResolvedValue(null)
    mockUseMessages.mockReturnValue({
      messages: [makeMessage(10), makeMessage(11)],
      loading: false,
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      togglePin: jest.fn(),
      toggleReaction: jest.fn(),
      loadOlderMessages: jest.fn(),
      ensureMessageWindow,
      loadingMore: false,
      hasMore: true,
      windowMode: 'latest',
      anchorStatus: 'latest',
    })
    mockUseReadCursor.mockReturnValue({
      cursor: {
        user_id: 'u1',
        surface: 'general_chat',
        scope_id: 'main',
        last_read_message_id: 'm1',
        last_read_at: makeMessage(1).created_at,
        updated_at: makeMessage(1).created_at,
      },
      loading: false,
      markRead: jest.fn(),
    })

    render(<MessageList />)

    await act(async () => {
      await Promise.resolve()
    })
    expect(ensureMessageWindow).not.toHaveBeenCalled()
    expect(mockUseUnreadScroll).toHaveBeenLastCalledWith(expect.objectContaining({
      loading: false,
      cursor: expect.objectContaining({
        last_read_message_id: 'm1',
      }),
    }))
  })

  it('keeps unread targeting active instead of waiting on a stale cursor window', async () => {
    const ensureMessageWindow = jest.fn(() => new Promise(() => undefined))
    mockUseMessages.mockReturnValue({
      messages: [makeMessage(10), makeMessage(11)],
      loading: false,
      editMessage: jest.fn(),
      deleteMessage: jest.fn(),
      togglePin: jest.fn(),
      toggleReaction: jest.fn(),
      loadOlderMessages: jest.fn(),
      ensureMessageWindow,
      loadingMore: false,
      hasMore: true,
      windowMode: 'latest',
      anchorStatus: 'latest',
    })
    mockUseReadCursor.mockReturnValue({
      cursor: {
        user_id: 'u1',
        surface: 'general_chat',
        scope_id: 'main',
        last_read_message_id: 'm1',
        last_read_at: makeMessage(1).created_at,
        updated_at: makeMessage(1).created_at,
      },
      loading: false,
      markRead: jest.fn(),
    })

    render(<MessageList />)

    expect(mockUseUnreadScroll).toHaveBeenLastCalledWith(expect.objectContaining({
      loading: false,
      cursor: expect.objectContaining({
        last_read_message_id: 'm1',
      }),
    }))

    await act(async () => {
      await Promise.resolve()
    })
    expect(ensureMessageWindow).not.toHaveBeenCalled()
  })

  it('orders same-timestamp messages by id before rendering and unread targeting', () => {
    const timestamp = '2026-05-03T12:00:00.000Z'
    const laterIdMessage = {
      ...makeMessage(2),
      id: '00000000-0000-0000-0000-0000000000b2',
      content: 'Same timestamp B',
      created_at: timestamp,
      updated_at: timestamp,
    } as unknown as Message
    const earlierIdMessage = {
      ...makeMessage(1),
      id: '00000000-0000-0000-0000-0000000000a1',
      content: 'Same timestamp A',
      created_at: timestamp,
      updated_at: timestamp,
    } as unknown as Message
    mockUseMessages.mockReturnValue({
      messages: [laterIdMessage, earlierIdMessage],
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

    expect(screen.getByTestId('message-stack').textContent?.indexOf('Same timestamp A'))
      .toBeLessThan(screen.getByTestId('message-stack').textContent?.indexOf('Same timestamp B') ?? -1)
    expect(mockUseUnreadScroll).toHaveBeenLastCalledWith(expect.objectContaining({
      messages: [earlierIdMessage, laterIdMessage],
    }))
  })

  it('throttles top-of-history requests when the loader remains visible', async () => {
    jest.useFakeTimers()
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

      nowSpy.mockReturnValue(1_200)
      fireEvent.scroll(scrollContainer)
      await act(async () => {
        jest.advanceTimersByTime(1)
        await Promise.resolve()
      })
      expect(loadOlderMessages).toHaveBeenCalledTimes(1)

      nowSpy.mockReturnValue(3_000)
      await act(async () => {
        jest.advanceTimersByTime(1_800)
        await Promise.resolve()
      })
      await waitFor(() => expect(loadOlderMessages).toHaveBeenCalledTimes(2))
    } finally {
      nowSpy.mockRestore()
      jest.useRealTimers()
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: originalIntersectionObserver,
      })
    }
  })

  it('keeps the visible message anchored when older history is prepended', async () => {
    const loadOlderMessages = jest.fn().mockResolvedValue(undefined)
    let currentMessages = [makeMessage(10), makeMessage(11)]
    let phase: 'before' | 'after' = 'before'
    const rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      const element = this as HTMLElement
      if (element.dataset.testid === 'message-scroll') {
        return { top: 0, bottom: 600, left: 0, right: 390, width: 390, height: 600, x: 0, y: 0, toJSON: () => {} }
      }

      if (element.dataset.messageId === 'm10') {
        const top = phase === 'before' ? 24 : 224
        return { top, bottom: top + 64, left: 0, right: 390, width: 390, height: 64, x: 0, y: top, toJSON: () => {} }
      }

      return { top: 700, bottom: 760, left: 0, right: 390, width: 390, height: 60, x: 0, y: 700, toJSON: () => {} }
    })
    const originalIntersectionObserver = window.IntersectionObserver
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: undefined,
    })
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = jest.fn()

    const setMessagesMock = () => {
      mockUseMessages.mockReturnValue({
        messages: currentMessages,
        loading: false,
        editMessage: jest.fn(),
        deleteMessage: jest.fn(),
        togglePin: jest.fn(),
        toggleReaction: jest.fn(),
        loadOlderMessages,
        loadingMore: false,
        hasMore: true,
      })
    }

    try {
      setMessagesMock()
      const { rerender } = render(<MessageList />)
      const scrollContainer = screen.getByTestId('message-scroll')
      Object.defineProperties(scrollContainer, {
        scrollTop: { configurable: true, value: 0, writable: true },
        scrollHeight: { configurable: true, value: 900 },
        clientHeight: { configurable: true, value: 600 },
      })

      fireEvent.scroll(scrollContainer)
      expect(loadOlderMessages).toHaveBeenCalledTimes(1)

      phase = 'after'
      currentMessages = [makeMessage(8), makeMessage(9), ...currentMessages]
      setMessagesMock()
      rerender(<MessageList />)

      expect(scrollContainer.scrollTop).toBe(200)
    } finally {
      rectSpy.mockRestore()
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: originalIntersectionObserver,
      })
    }
  })

  it('falls back to scroll-height anchoring when the measured row position is unchanged', async () => {
    const loadOlderMessages = jest.fn().mockResolvedValue(undefined)
    let currentMessages = [makeMessage(10), makeMessage(11)]
    let currentScrollHeight = 900
    const rectSpy = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      const element = this as HTMLElement
      if (element.dataset.testid === 'message-scroll') {
        return { top: 0, bottom: 600, left: 0, right: 390, width: 390, height: 600, x: 0, y: 0, toJSON: () => {} }
      }

      if (element.dataset.messageId === 'm10') {
        return { top: 24, bottom: 88, left: 0, right: 390, width: 390, height: 64, x: 0, y: 24, toJSON: () => {} }
      }

      return { top: 700, bottom: 760, left: 0, right: 390, width: 390, height: 60, x: 0, y: 700, toJSON: () => {} }
    })
    const originalIntersectionObserver = window.IntersectionObserver
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: undefined,
    })
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = jest.fn()

    const setMessagesMock = () => {
      mockUseMessages.mockReturnValue({
        messages: currentMessages,
        loading: false,
        editMessage: jest.fn(),
        deleteMessage: jest.fn(),
        togglePin: jest.fn(),
        toggleReaction: jest.fn(),
        loadOlderMessages,
        loadingMore: false,
        hasMore: true,
      })
    }

    try {
      setMessagesMock()
      const { rerender } = render(<MessageList />)
      const scrollContainer = screen.getByTestId('message-scroll')
      Object.defineProperties(scrollContainer, {
        scrollTop: { configurable: true, value: 0, writable: true },
        scrollHeight: { configurable: true, get: () => currentScrollHeight },
        clientHeight: { configurable: true, value: 600 },
      })

      fireEvent.scroll(scrollContainer)
      expect(loadOlderMessages).toHaveBeenCalledTimes(1)

      currentScrollHeight = 1_450
      currentMessages = [makeMessage(8), makeMessage(9), ...currentMessages]
      setMessagesMock()
      rerender(<MessageList />)

      expect(scrollContainer.scrollTop).toBe(550)
    } finally {
      rectSpy.mockRestore()
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: originalIntersectionObserver,
      })
    }
  })
})

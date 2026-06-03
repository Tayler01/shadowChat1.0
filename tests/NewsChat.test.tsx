import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { NewsChat } from '../src/components/news/NewsChat'

const mockSendMessage = jest.fn()
const mockEditMessage = jest.fn()
const mockDeleteMessage = jest.fn()
const mockToggleReaction = jest.fn()
const mockTogglePin = jest.fn()
const mockMarkRead = jest.fn()
const mockLoadOlderMessages = jest.fn()
const mockRetryFailedMessage = jest.fn()
const mockDiscardFailedMessage = jest.fn()
let mockProfile = {
  id: 'user-1',
  username: 'reporter',
  display_name: 'Reporter',
  admin_role: null as 'admin' | 'sub_admin' | null,
}

const baseMessage = {
  id: 'message-1',
  user_id: 'user-1',
  content: 'Breaking link https://example.com/story',
  message_type: 'text',
  reactions: { '\u{1F525}': { count: 2, users: ['user-2'] } },
  pinned: false,
  pinned_by: null,
  pinned_at: null,
  reply_to: null,
  created_at: '2026-04-30T00:00:00.000Z',
  updated_at: '2026-04-30T00:00:00.000Z',
  edited_at: null,
  deleted_at: null,
  user: {
    id: 'user-1',
    username: 'reporter',
    display_name: 'Reporter',
    avatar_url: null,
    color: '#d7aa46',
    admin_role: null as 'admin' | 'sub_admin' | null,
  },
}

const buildNewsChatState = (messages = [baseMessage]) => ({
  messages,
  loading: false,
  loadingMore: false,
  hasOlder: true,
  hasNewer: false,
  hasMore: true,
  windowMode: 'latest',
  targetStatus: 'not_requested',
  anchorStatus: 'not_requested',
  sending: false,
  error: null,
  refresh: jest.fn(),
  loadLatestMessages: jest.fn(),
  loadOlderMessages: mockLoadOlderMessages,
  loadNewerMessages: jest.fn(),
  ensureMessageWindow: jest.fn(),
  compactToLatestMessages: jest.fn(),
  sendMessage: mockSendMessage,
  editMessage: mockEditMessage,
  deleteMessage: mockDeleteMessage,
  toggleReaction: mockToggleReaction,
  togglePin: mockTogglePin,
  retryFailedMessage: mockRetryFailedMessage,
  discardFailedMessage: mockDiscardFailedMessage,
})
const mockUseNewsChat = jest.fn(() => buildNewsChatState())

jest.mock('../src/hooks/useBoardChat', () => ({
  useBoardChat: () => mockUseNewsChat(),
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    profile: mockProfile,
  }),
}))

jest.mock('../src/hooks/useReadCursor', () => ({
  useReadCursor: () => ({
    cursor: null,
    loading: false,
    refresh: jest.fn(),
    markRead: mockMarkRead,
  }),
}))

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({
    typingUsers: [],
    startTyping: jest.fn(),
    stopTyping: jest.fn(),
  }),
}))

jest.mock('../src/hooks/useDirectMessages', () => ({
  useDirectMessages: () => ({ conversations: [] }),
}))

jest.mock('../src/hooks/useBoardBadges', () => ({
  useBoardBadges: () => ({ count: 0, refresh: jest.fn(), markFeedSeen: jest.fn(), countsByBoard: {} }),
}))

jest.mock('../src/lib/linkPreview', () => ({
  extractFirstMessageUrl: () => null,
  fetchLinkPreview: jest.fn(),
  tokenizeMessageText: (content: string) => [{ type: 'text', text: content }],
}))

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn() as any
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

beforeEach(() => {
  mockUseNewsChat.mockReset()
  mockUseNewsChat.mockImplementation(() => buildNewsChatState())
  mockProfile = {
    id: 'user-1',
    username: 'reporter',
    display_name: 'Reporter',
    admin_role: null,
  }
  mockSendMessage.mockResolvedValue(null)
  mockEditMessage.mockResolvedValue(undefined)
  mockDeleteMessage.mockResolvedValue(undefined)
  mockToggleReaction.mockResolvedValue(undefined)
  mockTogglePin.mockResolvedValue(undefined)
  mockMarkRead.mockResolvedValue(null)
  mockLoadOlderMessages.mockResolvedValue(undefined)
  mockRetryFailedMessage.mockResolvedValue(null)
})

afterEach(() => {
  jest.clearAllMocks()
})

const setScrollerMetrics = (element: HTMLElement, scrollHeight: number, clientHeight = 400) => {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  })
}

test('news chat renders messages and sends text links', async () => {
  render(<NewsChat />)

  expect(screen.getByText('Reporter')).toBeInTheDocument()
  expect(screen.getByText('Breaking link https://example.com/story')).toBeInTheDocument()

  fireEvent.change(screen.getAllByPlaceholderText(/message news chat/i)[0], {
    target: { value: 'new story https://example.com/new' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: /^send message$/i })[0])

  await waitFor(() => {
    expect(mockSendMessage).toHaveBeenCalledWith(
      'new story https://example.com/new',
      'text',
      undefined,
      undefined,
      undefined
    )
  })
})

test('news chat reserves mobile footer and keyboard space in the message scroller', () => {
  render(<NewsChat />)

  expect(screen.getByTestId('board-chat-message-scroll')).toHaveClass(
    'pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-mobile-scroll-keyboard-inset,0px)_+_0.75rem)]'
  )
  expect(document.querySelector('[data-mobile-chat-footer="true"]')).toHaveAttribute(
    'data-android-keyboard-lift',
    'disabled'
  )
  expect(screen.getAllByPlaceholderText(/message news chat/i)[0]).toHaveClass('text-base', 'md:text-sm')
})

test('news chat does not snap back to latest after the user scrolls up', async () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame
  const originalVisualViewport = window.visualViewport
  const originalResizeObserver = global.ResizeObserver
  const visualViewportListeners: Partial<Record<string, EventListener[]>> = {}

  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0)
    return 1
  }) as typeof window.requestAnimationFrame
  window.cancelAnimationFrame = jest.fn()
  global.ResizeObserver = class {
    observe = jest.fn()
    unobserve = jest.fn()
    disconnect = jest.fn()
  } as unknown as typeof ResizeObserver

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: {
      addEventListener: jest.fn((type: string, listener: EventListener) => {
        visualViewportListeners[type] = [...(visualViewportListeners[type] ?? []), listener]
      }),
      removeEventListener: jest.fn(),
      height: 520,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    } as unknown as VisualViewport,
  })

  try {
    render(<NewsChat />)

    const scroller = screen.getByTestId('board-chat-message-scroll')
    setScrollerMetrics(scroller, 1000)
    scroller.scrollTop = 600

    const scrollTo = jest.fn((options?: ScrollToOptions | number) => {
      const top = typeof options === 'number' ? options : options?.top
      scroller.scrollTop = Number(top)
    })
    Object.defineProperty(scroller, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    scroller.scrollTop = 450
    fireEvent.scroll(scroller)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /jump to latest/i })).toBeInTheDocument()
    })

    act(() => {
      visualViewportListeners.scroll?.forEach(listener => listener(new Event('scroll')))
      visualViewportListeners.resize?.forEach(listener => listener(new Event('resize')))
      window.dispatchEvent(new Event('focusin'))
    })

    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 180))
    })

    expect(scroller.scrollTop).toBe(450)
    expect(scrollTo).not.toHaveBeenCalled()
  } finally {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    global.ResizeObserver = originalResizeObserver
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  }
})

test('news chat loads older messages when the user reaches the top', async () => {
  const observers: Array<{
    callback: IntersectionObserverCallback
    rootMargin: string
  }> = []
  const originalIntersectionObserver = window.IntersectionObserver
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame

  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    callback(0)
    return 1
  }) as typeof window.requestAnimationFrame
  window.cancelAnimationFrame = jest.fn()

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: class MockIntersectionObserver {
      root: Element | Document | null
      rootMargin: string

      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        observers.push({
          callback,
          rootMargin: options?.rootMargin ?? '',
        })
        this.root = options?.root ?? null
        this.rootMargin = options?.rootMargin ?? ''
      }

      observe = jest.fn()
      unobserve = jest.fn()
      disconnect = jest.fn()
      takeRecords = jest.fn(() => [])
      thresholds = [0]
    } as unknown as typeof IntersectionObserver,
  })

  try {
    render(<NewsChat />)

    const scroller = screen.getByTestId('board-chat-message-scroll')
    setScrollerMetrics(scroller, 1000)

    await waitFor(() => {
      expect(observers.some(observer => observer.rootMargin === '180px 0px 0px 0px')).toBe(true)
    })

    scroller.scrollTop = 0
    fireEvent.scroll(scroller)

    await waitFor(() => {
      expect(mockLoadOlderMessages).toHaveBeenCalledTimes(1)
    })
  } finally {
    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      value: originalIntersectionObserver,
    })
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
  }
})

test('news chat supports owner edits, deletes, and reactions', async () => {
  render(<NewsChat />)

  fireEvent.click(screen.getByRole('button', { name: /message actions/i }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^edit$/i }))
  fireEvent.change(screen.getByDisplayValue('Breaking link https://example.com/story'), {
    target: { value: 'updated news note' },
  })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  await waitFor(() => {
    expect(mockEditMessage).toHaveBeenCalledWith('message-1', 'updated news note')
  })
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /message actions/i })).toBeInTheDocument()
  })

  fireEvent.click(screen.getByRole('button', { name: /message actions/i }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))
  expect(mockDeleteMessage).toHaveBeenCalledWith('message-1')

  fireEvent.click(screen.getByRole('button', { name: /reaction \u{1F525} count 2/iu }))
  expect(mockToggleReaction).toHaveBeenCalledWith('message-1', '\u{1F525}')
})

test('news chat lets operators delete normal user messages', async () => {
  mockProfile = {
    id: 'admin-1',
    username: 'mod',
    display_name: 'Mod',
    admin_role: 'sub_admin',
  }
  mockUseNewsChat.mockReturnValue(buildNewsChatState([{
    ...baseMessage,
    user_id: 'user-2',
    user: {
      ...baseMessage.user,
      id: 'user-2',
      admin_role: null,
    },
  }]))

  render(<NewsChat />)

  fireEvent.click(screen.getByRole('button', { name: /message actions/i }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))

  expect(mockDeleteMessage).toHaveBeenCalledWith('message-1')
})

test('news chat hides operator delete for another operator message', () => {
  mockProfile = {
    id: 'admin-1',
    username: 'mod',
    display_name: 'Mod',
    admin_role: 'sub_admin',
  }
  mockUseNewsChat.mockReturnValue(buildNewsChatState([{
    ...baseMessage,
    user_id: 'user-2',
    user: {
      ...baseMessage.user,
      id: 'user-2',
      admin_role: 'admin',
    },
  }]))

  render(<NewsChat />)

  fireEvent.click(screen.getByRole('button', { name: /message actions/i }))

  expect(screen.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument()
})

test('news chat leaves long comments readable and keeps reaction menu in its own column', () => {
  const longComment = `Long comment ${'shadowchat'.repeat(32)} https://example.com/${'story'.repeat(24)}`
  mockUseNewsChat.mockReturnValue(buildNewsChatState([{ ...baseMessage, content: longComment }]))

  render(<NewsChat />)

  expect(screen.getByText(longComment)).toBeInTheDocument()
  expect(screen.getByTestId('message-bubble-shell')).toHaveClass('max-w-[calc(100%-3rem)]')
  expect(screen.getByRole('button', { name: /message actions/i })).toBeInTheDocument()
})

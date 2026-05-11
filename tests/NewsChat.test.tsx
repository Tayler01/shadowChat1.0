import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { NewsChat } from '../src/components/news/NewsChat'

const mockSendMessage = jest.fn()
const mockEditMessage = jest.fn()
const mockDeleteMessage = jest.fn()
const mockToggleReaction = jest.fn()
const mockMarkRead = jest.fn()
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
  reactions: { '\u{1F525}': { count: 2, users: ['user-2'] } },
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
  sending: false,
  error: null,
  refresh: jest.fn(),
  sendMessage: mockSendMessage,
  editMessage: mockEditMessage,
  deleteMessage: mockDeleteMessage,
  toggleReaction: mockToggleReaction,
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
  mockMarkRead.mockResolvedValue(null)
})

afterEach(() => {
  jest.clearAllMocks()
})

test('news chat renders messages and sends text links', async () => {
  render(<NewsChat />)

  expect(screen.getByText('Reporter')).toBeInTheDocument()
  expect(screen.getByText('Breaking link https://example.com/story')).toBeInTheDocument()

  fireEvent.change(screen.getAllByPlaceholderText(/drop a link or note in news chat/i)[0], {
    target: { value: 'new story https://example.com/new' },
  })
  fireEvent.click(screen.getAllByRole('button', { name: /send news chat message/i })[0])

  await waitFor(() => {
    expect(mockSendMessage).toHaveBeenCalledWith('new story https://example.com/new')
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
  expect(screen.getAllByPlaceholderText(/drop a link or note in news chat/i)[0]).toHaveClass('text-base', 'md:text-sm')
})

test('news chat supports owner edits, deletes, and reactions', async () => {
  render(<NewsChat />)

  fireEvent.click(screen.getByRole('button', { name: /news chat message actions/i }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^edit$/i }))
  fireEvent.change(screen.getByDisplayValue('Breaking link https://example.com/story'), {
    target: { value: 'updated news note' },
  })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  await waitFor(() => {
    expect(mockEditMessage).toHaveBeenCalledWith('message-1', 'updated news note')
  })

  fireEvent.click(screen.getByRole('button', { name: /news chat message actions/i }))
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
  mockUseNewsChat.mockReturnValueOnce(buildNewsChatState([{
    ...baseMessage,
    user_id: 'user-2',
    user: {
      ...baseMessage.user,
      id: 'user-2',
      admin_role: null,
    },
  }]))

  render(<NewsChat />)

  fireEvent.click(screen.getByRole('button', { name: /news chat message actions/i }))
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
  mockUseNewsChat.mockReturnValueOnce(buildNewsChatState([{
    ...baseMessage,
    user_id: 'user-2',
    user: {
      ...baseMessage.user,
      id: 'user-2',
      admin_role: 'admin',
    },
  }]))

  render(<NewsChat />)

  fireEvent.click(screen.getByRole('button', { name: /news chat message actions/i }))

  expect(screen.queryByRole('menuitem', { name: /^delete$/i })).not.toBeInTheDocument()
})

test('news chat leaves long comments readable and keeps reaction menu in its own column', () => {
  const longComment = `Long comment ${'shadowchat'.repeat(32)} https://example.com/${'story'.repeat(24)}`
  mockUseNewsChat.mockReturnValueOnce(buildNewsChatState([{ ...baseMessage, content: longComment }]))

  render(<NewsChat />)

  expect(screen.getByText(longComment)).toBeInTheDocument()
  expect(screen.getByTestId('board-chat-message-bubble')).toHaveClass('min-w-0')
  expect(screen.getByTestId('board-chat-message-bubble')).toHaveClass('max-w-full')
  expect(screen.getByRole('button', { name: /news chat message actions/i }).parentElement).toHaveClass('shrink-0')
})

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { NewsChat } from '../src/components/news/NewsChat'

const mockSendMessage = jest.fn()
const mockEditMessage = jest.fn()
const mockDeleteMessage = jest.fn()
const mockToggleReaction = jest.fn()
const mockUseNewsChat = jest.fn(() => ({
  messages: [
    {
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
      },
    },
  ],
  loading: false,
  sending: false,
  error: null,
  refresh: jest.fn(),
  sendMessage: mockSendMessage,
  editMessage: mockEditMessage,
  deleteMessage: mockDeleteMessage,
  toggleReaction: mockToggleReaction,
  markSeen: jest.fn(),
}))

jest.mock('../src/hooks/useNewsChat', () => ({
  useNewsChat: () => mockUseNewsChat(),
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    profile: {
      id: 'user-1',
      username: 'reporter',
      display_name: 'Reporter',
    },
  }),
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
  mockSendMessage.mockResolvedValue(null)
  mockEditMessage.mockResolvedValue(undefined)
  mockDeleteMessage.mockResolvedValue(undefined)
  mockToggleReaction.mockResolvedValue(undefined)
})

afterEach(() => {
  jest.clearAllMocks()
})

test('news chat renders messages and sends text links', async () => {
  render(<NewsChat />)

  expect(screen.getByText('Reporter')).toBeInTheDocument()
  expect(screen.getByText('Breaking link https://example.com/story')).toBeInTheDocument()

  fireEvent.change(screen.getByPlaceholderText(/drop a link/i), {
    target: { value: 'new story https://example.com/new' },
  })
  fireEvent.click(screen.getByRole('button', { name: /send news chat message/i }))

  await waitFor(() => {
    expect(mockSendMessage).toHaveBeenCalledWith('new story https://example.com/new')
  })
})

test('news chat supports owner edits, deletes, and reactions', async () => {
  render(<NewsChat />)

  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
  fireEvent.change(screen.getByDisplayValue('Breaking link https://example.com/story'), {
    target: { value: 'updated news note' },
  })
  fireEvent.click(screen.getByRole('button', { name: /save/i }))

  await waitFor(() => {
    expect(mockEditMessage).toHaveBeenCalledWith('message-1', 'updated news note')
  })

  fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
  expect(mockDeleteMessage).toHaveBeenCalledWith('message-1')

  fireEvent.click(screen.getByRole('button', { name: /reaction 🔥 count 2/i }))
  expect(mockToggleReaction).toHaveBeenCalledWith('message-1', '\u{1F525}')
})

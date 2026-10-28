import { act, fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { ChatView } from '../src/components/chat/ChatView'
import { normalizeContentPolicyError } from '../src/lib/contentPolicy'
import { getBlockedActionMessage } from '../src/lib/moderation'
import { showActionErrorToast } from '../src/lib/toastNotifications'

const createMessagesState = () => ({
  messages: [
    {
      id: 'pinned-1',
      user_id: 'u1',
      content: 'pinned text',
      message_type: 'text',
      pinned: true,
      reactions: {},
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      user: { display_name: 'Alice' },
    },
  ],
  sendMessage: jest.fn(),
  sending: false,
  togglePin: jest.fn(),
  toggleReaction: jest.fn(),
  retryFailedMessage: jest.fn(),
  discardFailedMessage: jest.fn(),
})

let mockMessagesState = createMessagesState()
let mockComposerSend: ((content: string) => Promise<unknown>) | undefined

jest.mock('../src/lib/moderation', () => ({ getBlockedActionMessage: jest.fn() }))
jest.mock('../src/lib/toastNotifications', () => ({ showActionErrorToast: jest.fn() }))

jest.mock('../src/hooks/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }))

jest.mock('../src/hooks/useMessages', () => ({
  useMessages: () => mockMessagesState,
}))

jest.mock('../src/hooks/useBlockedUsers', () => ({
  useBlockedUsers: () => ({
    entries: [],
    blockedUserIds: new Set(),
    loading: false,
    savingUserIds: new Set(),
    isBlockedByMe: () => false,
    blockUser: jest.fn(),
    unblockUser: jest.fn(),
    refresh: jest.fn(),
  }),
}))

jest.mock('../src/hooks/MessagesContext', () => ({
  useOptionalMessages: () => ({
    messages: [
      {
        id: 'pinned-1',
        user_id: 'u1',
        content: 'pinned text',
        message_type: 'text',
        pinned: true,
        reactions: {},
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        user: { display_name: 'Alice' },
      },
    ],
    togglePin: jest.fn(),
    toggleReaction: jest.fn(),
  }),
}))

jest.mock('../src/components/chat/MessageList', () => ({
  MessageList: () => <div data-testid="message-list" />,
}))

jest.mock('../src/components/search/GlobalSearchButton', () => ({
  GlobalSearchButton: () => <button type="button" aria-label="Open search and saved messages" />,
}))

jest.mock('../src/components/chat/MessageInput', () => ({
  MessageInput: ({ disabled, className, onSendMessage }: { disabled?: boolean; className?: string; onSendMessage: (content: string) => Promise<unknown> }) => {
    mockComposerSend = onSendMessage
    return (
    <div
      data-testid="message-input"
      data-disabled={String(Boolean(disabled))}
      data-class-name={className || ''}
    />
    )
  },
}))

jest.mock('../src/components/hype/HypeBellButton', () => ({
  HypeBellButton: () => <button type="button" data-testid="hype-bell-button" />,
}))

jest.mock('../src/components/chat/PinnedMessagesButton', () => ({
  PinnedMessagesButton: ({ messages }: { messages: unknown[] }) => (
    <button type="button" data-testid="pinned-messages-button">
      {messages.length}
    </button>
  ),
}))

jest.mock('../src/components/chat/ActiveUsersButton', () => ({
  ActiveUsersButton: () => <button type="button" data-testid="active-users-button">Active</button>,
}))

jest.mock('../src/components/chat/WeatherWidget', () => ({
  WeatherWidget: () => <div data-testid="weather-widget" />,
}))

jest.mock('../src/components/layout/MobileChatFooter', () => ({
  MobileChatFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mobile-chat-footer">{children}</div>
  ),
}))

jest.mock('../src/features/general-chat-threads', () => ({
  GeneralChatThreadSheet: ({ currentView }: { currentView: string }) => (
    <div data-testid="mock-thread-sheet" data-current-view={currentView} />
  ),
}))

jest.mock('../src/hooks/useFailedMessages', () => ({
  useFailedMessages: () => ({
    failedMessages: [],
    addFailedMessage: jest.fn(),
    removeFailedMessage: jest.fn(),
  }),
}))

jest.mock('../src/hooks/ClientResetContext', () => ({
  useClientReset: () => ({ status: 'ok' }),
  useOptionalClientReset: () => ({ status: 'ok' }),
}))

jest.mock('../src/lib/appBadge', () => ({
  clearGroupNotifications: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../src/lib/sessionRecovery', () => ({
  SESSION_RECOVERY_EVENT: 'shadowchat:session-recovery',
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockMessagesState = createMessagesState()
  mockComposerSend = undefined
})

test('passes the exact policy rejection back to the composer for draft restoration without a generic ban toast', async () => {
  const rejection = normalizeContentPolicyError({ code: 'PT422', message: 'CONTENT_POLICY_REJECTED' })
  mockMessagesState.sendMessage.mockRejectedValue(rejection)
  await act(async () => { render(<ChatView currentView="chat" onViewChange={() => {}} />) })
  await expect(mockComposerSend?.('Rejected draft')).rejects.toBe(rejection)
  expect(getBlockedActionMessage).not.toHaveBeenCalled()
  expect(showActionErrorToast).not.toHaveBeenCalled()
})

test('retains existing ban handling for unrelated send failures', async () => {
  const failure = new Error('ordinary failure')
  mockMessagesState.sendMessage.mockRejectedValue(failure)
  ;(getBlockedActionMessage as jest.Mock).mockResolvedValue('Existing channel ban message')
  await act(async () => { render(<ChatView currentView="chat" onViewChange={() => {}} />) })
  await expect(mockComposerSend?.('Draft')).resolves.toBeNull()
  expect(getBlockedActionMessage).toHaveBeenCalledWith('general_chat', failure, 'Failed to send message')
  expect(showActionErrorToast).toHaveBeenCalledWith('Existing channel ban message')
})

test('expands room-specific controls inline in the header without a selector popup', async () => {
  await act(async () => {
    render(<ChatView currentView="chat" onViewChange={() => {}} />)
  })

  expect(screen.queryByTestId('pinned-messages-button')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Expand General Chat tools' }))

  const tools = screen.getByRole('group', { name: 'General Chat tools' })
  expect(within(tools).getByTestId('pinned-messages-button')).toHaveTextContent('1')
  expect(within(tools).getByTestId('weather-widget')).toBeInTheDocument()
  expect(within(tools).getByTestId('active-users-button')).toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'General Chat room tools' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Collapse General Chat tools' })).toHaveAttribute('aria-expanded', 'true')

  fireEvent.click(screen.getByRole('button', { name: 'Collapse General Chat tools' }))
  expect(screen.queryByRole('group', { name: 'General Chat tools' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Expand General Chat tools' })).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByTestId('message-list')).toBeInTheDocument()
})

test('keeps the mobile composer enabled while a send is pending so iOS preserves keyboard focus', async () => {
  mockMessagesState = {
    ...createMessagesState(),
    sending: true,
  }

  await act(async () => {
    render(<ChatView currentView="chat" onViewChange={() => {}} />)
  })

  const composers = screen.getAllByTestId('message-input')
  const desktopComposer = composers.find(composer => composer.getAttribute('data-class-name') === '')
  const mobileComposer = composers.find(composer =>
    composer.getAttribute('data-class-name')?.includes('border-t')
  )

  expect(desktopComposer).toHaveAttribute('data-disabled', 'false')
  expect(mobileComposer).toHaveAttribute('data-disabled', 'false')
})

test('unmounts the Lounge footer while the routed thread owns the mobile composer and navigation', async () => {
  await act(async () => {
    render(
      <ChatView
        currentView="chat"
        onViewChange={() => {}}
        initialThreadId="pinned-1"
      />
    )
  })

  expect(await screen.findByTestId('mock-thread-sheet')).toHaveAttribute('data-current-view', 'chat')
  expect(screen.queryByTestId('mobile-chat-footer')).not.toBeInTheDocument()
})

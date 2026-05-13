import { render, screen } from '@testing-library/react'
import React from 'react'
import { ChatView } from '../src/components/chat/ChatView'

jest.mock('../src/hooks/useMessages', () => ({
  useMessages: () => ({
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
  }),
}))

jest.mock('../src/components/chat/MessageList', () => ({
  MessageList: () => <div data-testid="message-list" />,
}))

jest.mock('../src/components/chat/MessageInput', () => ({
  MessageInput: () => <div data-testid="message-input" />,
}))

jest.mock('../src/components/chat/PinnedMessagesButton', () => ({
  PinnedMessagesButton: ({ messages }: { messages: unknown[] }) => (
    <button type="button" data-testid="pinned-messages-button">
      {messages.length}
    </button>
  ),
}))

jest.mock('../src/components/chat/WeatherWidget', () => ({
  WeatherWidget: () => <div data-testid="weather-widget" />,
}))

jest.mock('../src/components/layout/MobileChatFooter', () => ({
  MobileChatFooter: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="mobile-chat-footer">{children}</div>
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
}))

jest.mock('../src/lib/appBadge', () => ({
  clearGroupNotifications: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../src/lib/sessionRecovery', () => ({
  SESSION_RECOVERY_EVENT: 'shadowchat:session-recovery',
}))

test('renders pinned messages as a header button instead of a feed bar', () => {
  render(<ChatView currentView="chat" onViewChange={() => {}} />)

  expect(screen.getByTestId('pinned-messages-button')).toHaveTextContent('1')
  expect(screen.getByTestId('message-list')).toBeInTheDocument()
})

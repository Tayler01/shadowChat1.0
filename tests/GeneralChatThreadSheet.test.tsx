import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { GeneralChatThreadSheet } from '../src/features/general-chat-threads/GeneralChatThreadSheet'

let mockDesktop = false

const mockRootMessage = {
  id: 'root-1',
  user_id: 'user-1',
  content: 'Thread root',
  message_type: 'text',
  created_at: '2026-07-13T12:00:00.000Z',
  updated_at: '2026-07-13T12:00:00.000Z',
  reactions: {},
  user: { id: 'user-1', display_name: 'Root author' },
}

const mockReplyMessage = {
  ...mockRootMessage,
  id: 'reply-1',
  user_id: 'user-2',
  content: 'Thread reply',
  reply_to: mockRootMessage.id,
  created_at: '2026-07-13T12:01:00.000Z',
  updated_at: '2026-07-13T12:01:00.000Z',
  user: { id: 'user-2', display_name: 'Reply author' },
}

jest.mock('../src/hooks/useIsDesktop', () => ({
  useIsDesktop: () => mockDesktop,
}))

jest.mock('../src/hooks/useComfortPreferences', () => ({
  useComfortPreferences: () => ({ isReducedMotion: true }),
}))

jest.mock('../src/hooks/useDialogAccessibility', () => ({
  useDialogAccessibility: () => ({ current: null }),
}))

jest.mock('../src/hooks/useReadCursor', () => ({
  useReadCursor: () => ({ markRead: jest.fn().mockResolvedValue(undefined) }),
}))

jest.mock('../src/hooks/MessagesContext', () => ({
  useOptionalMessages: () => null,
}))

jest.mock('../src/features/general-chat-threads/useGeneralChatThread', () => ({
  useGeneralChatThread: () => ({
    rootMessage: mockRootMessage,
    replies: [mockReplyMessage],
    loading: false,
    error: null,
    hasOlder: false,
    loadingOlder: false,
    pendingReplyCount: 0,
    loadOlder: jest.fn(),
    refresh: jest.fn().mockResolvedValue(undefined),
    setFollowingLatest: jest.fn(),
  }),
}))

jest.mock('../src/components/chat/MessageItem', () => ({
  MessageItem: ({ message, messageActionsPortalClassName }: {
    message: { id: string }
    messageActionsPortalClassName?: string
  }) => (
    <div
      data-testid={`thread-message-${message.id}`}
      data-actions-layer={messageActionsPortalClassName || ''}
    />
  ),
}))

jest.mock('../src/components/chat/MessageInput', () => ({
  MessageInput: ({ disabled }: { disabled?: boolean }) => (
    <textarea aria-label="Thread composer" disabled={disabled} />
  ),
}))

jest.mock('../src/components/layout/MobileChatFooter', () => ({
  MobileChatFooter: ({ children }: { children: ReactNode }) => (
    <div data-testid="thread-mobile-footer">
      {children}
      <nav aria-label="Thread bottom navigation" />
    </div>
  ),
}))

const messagesApi = {
  sending: true,
  editMessage: jest.fn().mockResolvedValue(undefined),
  deleteMessage: jest.fn().mockResolvedValue(undefined),
  togglePin: jest.fn().mockResolvedValue(undefined),
  toggleReaction: jest.fn().mockResolvedValue(undefined),
  retryFailedMessage: jest.fn().mockResolvedValue(null),
  discardFailedMessage: jest.fn(),
  sendMessage: jest.fn().mockResolvedValue(mockReplyMessage),
}

describe('GeneralChatThreadSheet mobile shell', () => {
  beforeEach(() => {
    mockDesktop = false
  })

  test('uses the shared mobile footer, keeps pending-send focus enabled, and layers actions above the sheet', () => {
    render(
      <GeneralChatThreadSheet
        open
        threadId={mockRootMessage.id}
        currentView="chat"
        onViewChange={jest.fn()}
        onClose={jest.fn()}
        messagesApi={messagesApi as never}
      />
    )

    expect(screen.getByTestId('thread-mobile-footer')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Thread bottom navigation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Thread composer')).toBeEnabled()
    expect(screen.getByTestId('thread-message-root-1')).toHaveAttribute('data-actions-layer', '!z-[150]')
    expect(screen.getByTestId('thread-message-reply-1')).toHaveAttribute('data-actions-layer', '!z-[150]')
    expect(screen.getByTestId('general-chat-thread-scroll')).toHaveClass(
      'pb-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-mobile-scroll-keyboard-inset,0px)_+_0.75rem)]'
    )
  })

  test('keeps the composer inline on desktop without mounting a second mobile footer', () => {
    mockDesktop = true
    render(
      <GeneralChatThreadSheet
        open
        threadId={mockRootMessage.id}
        currentView="chat"
        onViewChange={jest.fn()}
        onClose={jest.fn()}
        messagesApi={messagesApi as never}
      />
    )

    expect(screen.queryByTestId('thread-mobile-footer')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Thread composer')).toBeEnabled()
  })
})

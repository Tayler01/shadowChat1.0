import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ChatView } from '../apps/streamlined/src-overrides/components/chat/ChatView'
import { MobileNav } from '../src/streamlined/components/StreamlinedMobileNav'

const mockTogglePin = jest.fn()
const mockToggleReaction = jest.fn()
const mockPinned = { id: 'pin-1', pinned: true, content: 'Saved message' }
let mockDesktop = false

jest.mock('../apps/streamlined/src-overrides/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'member-1' }, profile: { id: 'member-1' } }) }))
jest.mock('../apps/streamlined/src-overrides/hooks/useMessages', () => ({ useMessages: () => ({ messages: [mockPinned], sendMessage: jest.fn(), sending: false }) }))
jest.mock('../apps/streamlined/src-overrides/hooks/MessagesContext', () => ({ useOptionalMessages: () => ({ messages: [mockPinned], togglePin: mockTogglePin, toggleReaction: mockToggleReaction }) }))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ resolveGeneralChatThreadId: jest.fn() }))
jest.mock('../src/hooks/useIsDesktop', () => ({ useIsDesktop: () => mockDesktop }))
jest.mock('../src/lib/moderation', () => ({ getBlockedActionMessage: jest.fn() }))
jest.mock('../src/lib/toastNotifications', () => ({ showActionErrorToast: jest.fn() }))
jest.mock('../apps/streamlined/src-overrides/components/chat/MessageInput', () => ({ MessageInput: () => <textarea aria-label="Message" /> }))
jest.mock('../apps/streamlined/src-overrides/components/layout/MobileChatFooter', () => ({ MobileChatFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
jest.mock('../src/components/chat/MessageList', () => ({ MessageList: () => <div data-testid="message-scroll">Chat messages</div> }))
jest.mock('../src/components/chat/PinnedMessagesButton', () => ({
  PinnedMessagesButton: ({ messages, onUnpin, onToggleReaction }: { messages: { id: string }[]; onUnpin: (id: string) => void; onToggleReaction: (id: string, emoji: string) => void }) => <div><button onClick={() => onUnpin(messages[0].id)}>Unpin saved message</button><button onClick={() => onToggleReaction(messages[0].id, 'heart')}>React to saved message</button></div>,
}))
jest.mock('../src/hooks/useAppBadgeState', () => ({ useAppBadgeState: () => ({ group: 2, dm: 1, shadow_pin: 0 }) }))
jest.mock('../apps/streamlined/src-overrides/hooks/useDirectMessages', () => ({ useDirectMessages: () => ({ conversations: [{ unread_count: 3 }] }) }))
jest.mock('../src/hooks/ClientResetContext', () => ({ useOptionalClientReset: () => ({ status: 'idle' }) }))
jest.mock('../src/hooks/usePresence', () => ({ useActiveUsers: () => [{ id: 'member-1' }, { id: 'member-2' }] }))
jest.mock('../src/components/ui/ClientResetIndicator', () => ({ ClientResetIndicator: () => <span data-testid="connection-indicator" /> }))

beforeEach(() => { jest.clearAllMocks(); mockDesktop = false })

test('phone chat starts without a header and reveals existing search on upward scroll, preserving pins', () => {
  const onSearch = jest.fn()
  const { container } = render(<ChatView currentView="chat" onViewChange={jest.fn()} onSearch={onSearch} />)
  expect(container.querySelector('header')).toBeNull()
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  const scroll = screen.getByTestId('message-scroll')
  fireEvent.scroll(scroll, { target: { scrollTop: 200 } })
  fireEvent.scroll(scroll, { target: { scrollTop: 160 } })
  expect(screen.getByRole('search', { name: 'Group chat search' })).toBeVisible()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'harbor' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search messages' }))
  expect(onSearch).toHaveBeenLastCalledWith('harbor', 'messages')
  fireEvent.click(screen.getByRole('button', { name: 'Full search & saved' }))
  expect(onSearch).toHaveBeenLastCalledWith('harbor', 'all')
  fireEvent.click(screen.getByRole('button', { name: 'Unpin saved message' }))
  fireEvent.click(screen.getByRole('button', { name: 'React to saved message' }))
  expect(mockTogglePin).toHaveBeenCalledWith('pin-1')
  expect(mockToggleReaction).toHaveBeenCalledWith('pin-1', 'heart')
  fireEvent.scroll(scroll, { target: { scrollTop: 200 } })
  expect(screen.getByRole('search')).toBeVisible()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  fireEvent.scroll(scroll, { target: { scrollTop: 230 } })
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
})

test('downward finger gesture reveals search even when all messages fit on screen and keeps focused search visible', () => {
  render(<ChatView currentView="chat" onViewChange={jest.fn()} onSearch={jest.fn()} />)
  const scroll = screen.getByTestId('message-scroll')
  fireEvent.touchStart(scroll, { touches: [{ clientY: 100 }] })
  fireEvent.touchMove(scroll, { touches: [{ clientY: 125 }] })
  expect(screen.getByRole('search')).toBeVisible()
  screen.getByRole('searchbox').focus()
  fireEvent.scroll(scroll, { target: { scrollTop: 20 } })
  fireEvent.scroll(scroll, { target: { scrollTop: 80 } })
  expect(screen.getByRole('search')).toBeVisible()
})

test('phone navigation has five equally sized destinations with one connection indicator and working active route', () => {
  const onViewChange = jest.fn()
  render(<MobileNav currentView="active-users" onViewChange={onViewChange} />)
  const nav = screen.getByRole('navigation', { name: 'Primary navigation' })
  expect(within(nav).getAllByRole('button')).toHaveLength(5)
  expect(within(nav).getByRole('list')).toHaveClass('grid-cols-5')
  const active = within(nav).getByRole('button', { name: '2 active users' })
  expect(active).toHaveAttribute('aria-current', 'page')
  expect(within(active).getAllByTestId('connection-indicator')).toHaveLength(1)
  expect(within(nav).getByRole('button', { name: 'DMs, 3 unread' })).toBeInTheDocument()
  fireEvent.click(active)
  expect(onViewChange).toHaveBeenCalledWith('active-users')
  fireEvent.click(within(nav).getByRole('button', { name: 'Chat, 2 unread' }))
  expect(onViewChange).toHaveBeenLastCalledWith('chat')
})

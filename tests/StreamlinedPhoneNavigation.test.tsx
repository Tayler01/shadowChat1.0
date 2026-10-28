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
jest.mock('../src/components/chat/MessageList', () => ({ MessageList: () => <div data-testid="message-scroll">Chat messages<div data-testid="nested-message-scroll" style={{ overflowY: 'auto' }}>Scrollable attachment</div></div> }))
jest.mock('../src/components/chat/PinnedMessagesButton', () => ({
  PinnedMessagesButton: ({ messages, onUnpin, onToggleReaction }: { messages: { id: string }[]; onUnpin: (id: string) => void; onToggleReaction: (id: string, emoji: string) => void }) => <div><button onClick={() => onUnpin(messages[0].id)}>Unpin saved message</button><button onClick={() => onToggleReaction(messages[0].id, 'heart')}>React to saved message</button></div>,
}))
jest.mock('../src/hooks/useAppBadgeState', () => ({ useAppBadgeState: () => ({ group: 2, dm: 1, shadow_pin: 0 }) }))
jest.mock('../apps/streamlined/src-overrides/hooks/useDirectMessages', () => ({ useDirectMessages: () => ({ conversations: [{ unread_count: 3 }] }) }))
jest.mock('../src/hooks/ClientResetContext', () => ({ useOptionalClientReset: () => ({ status: 'idle' }) }))
jest.mock('../src/hooks/usePresence', () => ({ useActiveUsers: () => [{ id: 'member-1' }, { id: 'member-2' }] }))
jest.mock('../src/components/ui/ClientResetIndicator', () => ({ ClientResetIndicator: () => <span data-testid="connection-indicator" /> }))

beforeEach(() => { jest.clearAllMocks(); mockDesktop = false })

const touch = (clientY: number, clientX = 0, identifier = 1) => ({ clientY, clientX, identifier })
const drag = (target: HTMLElement, startY: number, endY: number) => {
  fireEvent.touchStart(target, { touches: [touch(startY)] })
  fireEvent.touchMove(target, { touches: [touch(endY)] })
  fireEvent.touchEnd(target, { touches: [] })
}

test('phone chat starts without a header and reveals existing search on an intentional upward scroll gesture, preserving pins', () => {
  const onSearch = jest.fn()
  const { container } = render(<ChatView currentView="chat" onViewChange={jest.fn()} onSearch={onSearch} />)
  expect(container.querySelector('header')).toBeNull()
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  const scroll = screen.getByTestId('message-scroll')
  drag(scroll, 100, 128)
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
  drag(scroll, 128, 96)
  expect(screen.getByRole('search')).toBeVisible()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } })
  drag(scroll, 128, 96)
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
})

test('downward finger gesture reveals search even when all messages fit on screen and keeps focused search visible', () => {
  render(<ChatView currentView="chat" onViewChange={jest.fn()} onSearch={jest.fn()} />)
  const scroll = screen.getByTestId('message-scroll')
  drag(scroll, 100, 125)
  expect(screen.getByRole('search')).toBeVisible()
  screen.getByRole('searchbox').focus()
  drag(scroll, 125, 80)
  expect(screen.getByRole('search')).toBeVisible()
})

test('iPhone bounce, inertia at rest, and programmatic anchor restoration cannot reveal hidden search', () => {
  render(<ChatView currentView="chat" onViewChange={jest.fn()} onSearch={jest.fn()} />)
  const scroll = screen.getByTestId('message-scroll')
  drag(scroll, 100, 130)
  drag(scroll, 130, 90)
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  // Includes bottom rebound, top overscroll, and a restored older-message anchor.
  for (const scrollTop of [220, 250, 230, 220, 0, -30, 0, 400, 180, 160]) {
    fireEvent.scroll(scroll, { target: { scrollTop } })
  }
  fireEvent.touchMove(scroll, { touches: [touch(150)] })
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
})

test('a deliberate reversal within one touch controls visibility without reopening from its original start position', () => {
  render(<ChatView currentView="chat" onViewChange={jest.fn()} onSearch={jest.fn()} />)
  const scroll = screen.getByTestId('message-scroll')
  fireEvent.touchStart(scroll, { touches: [touch(100)] })
  fireEvent.touchMove(scroll, { touches: [touch(150)] })
  expect(screen.getByRole('search')).toBeVisible()
  fireEvent.touchMove(scroll, { touches: [touch(138)] })
  expect(screen.getByRole('search')).toBeVisible()
  fireEvent.touchMove(scroll, { touches: [touch(120)] })
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  fireEvent.touchMove(scroll, { touches: [touch(124)] })
  fireEvent.touchMove(scroll, { touches: [touch(127)] })
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  fireEvent.touchMove(scroll, { touches: [touch(145)] })
  expect(screen.getByRole('search')).toBeVisible()
})

test('cancelled, horizontal, and multiple-finger gestures leave search hidden', () => {
  render(<ChatView currentView="chat" onViewChange={jest.fn()} onSearch={jest.fn()} />)
  const scroll = screen.getByTestId('message-scroll')
  fireEvent.touchStart(scroll, { touches: [touch(100)] })
  fireEvent.touchCancel(scroll)
  fireEvent.touchMove(scroll, { touches: [touch(150)] })
  fireEvent.touchStart(scroll, { touches: [touch(100)] })
  fireEvent.touchMove(scroll, { touches: [touch(110, 40)] })
  fireEvent.touchMove(scroll, { touches: [touch(150, 60)] })
  fireEvent.touchStart(scroll, { touches: [touch(100)] })
  fireEvent.touchMove(scroll, { touches: [touch(150), touch(160, 0, 2)] })
  fireEvent.touchMove(scroll, { touches: [touch(180)] })
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  drag(scroll, 100, 130)
  expect(screen.getByRole('search')).toBeVisible()
})

test('scrolling a nested message attachment leaves the parent chat search hidden', () => {
  render(<ChatView currentView="chat" onViewChange={jest.fn()} onSearch={jest.fn()} />)
  const nested = screen.getByTestId('nested-message-scroll')
  Object.defineProperties(nested, { scrollHeight: { value: 500 }, clientHeight: { value: 100 } })
  drag(nested, 100, 150)
  fireEvent.wheel(nested, { deltaY: -50 })
  fireEvent.scroll(nested, { target: { scrollTop: 40 } })
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  drag(screen.getByTestId('message-scroll'), 100, 130)
  expect(screen.getByRole('search')).toBeVisible()
})

test('wheel gestures need directional travel, ignore small reversal noise and zoom, and retain explicit accessible/desktop access', () => {
  const props = { currentView: 'chat' as const, onViewChange: jest.fn(), onSearch: jest.fn() }
  const { unmount } = render(<ChatView {...props} />)
  const scroll = screen.getByTestId('message-scroll')
  fireEvent.wheel(scroll, { deltaY: -3 })
  fireEvent.wheel(scroll, { deltaY: -4 })
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  fireEvent.wheel(scroll, { deltaY: -20 })
  expect(screen.getByRole('search')).toBeVisible()
  fireEvent.wheel(scroll, { deltaY: 30 })
  fireEvent.wheel(scroll, { deltaY: -3 })
  fireEvent.wheel(scroll, { deltaY: -40, ctrlKey: true })
  expect(screen.queryByRole('search')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Search group chat' }))
  expect(screen.getByRole('search')).toBeVisible()
  unmount()
  mockDesktop = true
  render(<ChatView {...props} />)
  expect(screen.getByRole('search')).toBeVisible()
  drag(screen.getByTestId('message-scroll'), 130, 80)
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

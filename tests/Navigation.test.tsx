import { fireEvent, render, screen } from '@testing-library/react'
import { MobileNav } from '../src/components/layout/MobileNav'
import { Sidebar } from '../src/components/layout/Sidebar'
import { MobileAppHeader } from '../src/components/layout/MobileAppHeader'

jest.mock('../src/hooks/useDirectMessages', () => ({
  useDirectMessages: () => ({ conversations: [] }),
}))

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      display_name: 'Smoke User',
      username: 'smoke',
      status: 'online',
      color: '#d7aa46',
    },
  }),
}))

test('mobile navigation omits paused boards by default', () => {
  const onViewChange = jest.fn()
  render(<MobileNav currentView="chat" onViewChange={onViewChange} />)

  expect(screen.queryByText('Boards')).not.toBeInTheDocument()
  expect(screen.getByText('Entertainment')).toBeInTheDocument()
  expect(screen.queryByText('Profile')).toBeNull()

  fireEvent.click(screen.getByText('Entertainment'))
  expect(onViewChange).toHaveBeenCalledWith('games')
})

test('mobile navigation exposes only the active destination as the current page', () => {
  render(<MobileNav currentView="dms" onViewChange={jest.fn()} />)

  expect(screen.getByRole('button', { name: 'DMs' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'Chat' })).not.toHaveAttribute('aria-current')
  expect(screen.getAllByRole('button').filter(button => button.hasAttribute('aria-current'))).toHaveLength(1)
})

test('mobile navigation can restore boards with an explicit feature flag', () => {
  const onViewChange = jest.fn()
  render(
    <MobileNav
      currentView="chat"
      onViewChange={onViewChange}
      boardsEnabled
      boardsBadgeCount={4}
    />
  )

  fireEvent.click(screen.getByText('Boards'))
  expect(onViewChange).toHaveBeenCalledWith('boards')
  expect(screen.getByText('4')).toBeInTheDocument()
})

test('sidebar navigation omits paused boards by default', () => {
  const onViewChange = jest.fn()
  render(
    <Sidebar
      currentView="chat"
      onViewChange={onViewChange}
      isDarkMode
      onToggleDarkMode={jest.fn()}
      isOpen
      onClose={jest.fn()}
    />
  )

  expect(screen.queryByText('Boards')).not.toBeInTheDocument()
  expect(screen.getByText('Entertainment')).toBeInTheDocument()
  expect(screen.queryByText('Profile')).toBeNull()

  fireEvent.click(screen.getByText('Entertainment'))
  expect(onViewChange).toHaveBeenCalledWith('games')
})

test('sidebar exposes only the active destination as the current page', () => {
  render(
    <Sidebar
      currentView="settings"
      onViewChange={jest.fn()}
      isDarkMode
      onToggleDarkMode={jest.fn()}
      isOpen
      onClose={jest.fn()}
    />
  )

  expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'Chat' })).not.toHaveAttribute('aria-current')
  expect(screen.getAllByRole('button').filter(button => button.hasAttribute('aria-current'))).toHaveLength(1)
})

test('sidebar can restore boards with an explicit feature flag', () => {
  const onViewChange = jest.fn()
  render(
    <Sidebar
      currentView="chat"
      onViewChange={onViewChange}
      isDarkMode
      onToggleDarkMode={jest.fn()}
      isOpen
      onClose={jest.fn()}
      boardsEnabled
      boardsBadgeCount={4}
    />
  )

  fireEvent.click(screen.getByText('Boards'))
  expect(onViewChange).toHaveBeenCalledWith('boards')
  expect(screen.getByText('4')).toBeInTheDocument()
})

test('mobile headers expose only contextual actions and an accessible settings target', () => {
  const onViewChange = jest.fn()
  render(
    <MobileAppHeader
      currentView="dms"
      onViewChange={onViewChange}
      title="Direct messages"
      actions={<button type="button">DM action</button>}
    />
  )

  expect(screen.getByRole('button', { name: 'DM action' })).toBeInTheDocument()
  expect(screen.queryByLabelText(/active users/i)).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/weather/i)).not.toBeInTheDocument()

  const settings = screen.getByRole('button', { name: 'Open app preferences' })
  expect(settings).toHaveClass('h-11', 'w-11')
  fireEvent.click(settings)
  expect(onViewChange).toHaveBeenCalledWith('settings')
})

test('settings header identifies the current destination and can hide duplicate settings actions', () => {
  const { rerender } = render(
    <MobileAppHeader
      currentView="settings"
      onViewChange={jest.fn()}
      title="Settings"
    />
  )

  expect(screen.getByRole('button', { name: 'Open app preferences' })).toHaveAttribute('aria-current', 'page')

  rerender(
    <MobileAppHeader
      currentView="settings"
      onViewChange={jest.fn()}
      title="Settings"
      showSettings={false}
    />
  )
  expect(screen.queryByRole('button', { name: 'Open app preferences' })).not.toBeInTheDocument()
})

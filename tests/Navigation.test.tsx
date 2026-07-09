import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { MobileNav } from '../src/components/layout/MobileNav'
import { Sidebar } from '../src/components/layout/Sidebar'

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

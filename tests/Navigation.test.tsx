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

test('mobile navigation replaces profile with news', () => {
  const onViewChange = jest.fn()
  render(<MobileNav currentView="chat" onViewChange={onViewChange} />)

  expect(screen.getByText('News')).toBeInTheDocument()
  expect(screen.queryByText('Profile')).toBeNull()

  fireEvent.click(screen.getByText('News'))
  expect(onViewChange).toHaveBeenCalledWith('news')
})

test('sidebar navigation replaces profile with news', () => {
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

  expect(screen.getByText('News')).toBeInTheDocument()
  expect(screen.queryByText('Profile')).toBeNull()

  fireEvent.click(screen.getByText('News'))
  expect(onViewChange).toHaveBeenCalledWith('news')
})

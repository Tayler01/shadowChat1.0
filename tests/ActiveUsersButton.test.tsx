import { fireEvent, render, screen } from '@testing-library/react'
import { ActiveUsersButton } from '../src/components/chat/ActiveUsersButton'

jest.mock('../src/hooks/usePresence', () => ({
  useActiveUsers: () => [
    { user_id: 'user-1' },
    { user_id: 'user-2' },
  ],
}))

jest.mock('../src/components/ui/ClientResetIndicator', () => ({
  ClientResetIndicator: () => null,
}))

test('routes to the active users page without opening a popup', () => {
  const onOpen = jest.fn()
  render(<ActiveUsersButton resetStatus={{ phase: 'idle' } as any} onOpen={onOpen} variant="nav" active />)

  const button = screen.getByRole('button', { name: '2 active users' })
  expect(button).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

  fireEvent.click(button)
  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

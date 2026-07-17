import { render, screen } from '@testing-library/react'
import { GamesHome } from '../src/features/games/GamesHome'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

jest.mock('../src/hooks/useAppBadgeState', () => ({
  useAppBadgeState: () => ({
    total: 3,
    dm: 0,
    group: 0,
    interactions: 0,
    connections: 0,
    shadow_pin: 0,
    games: 3,
    shadowPinDestinations: [],
    gameDestinations: [{
      experience: 'shadow-checkers',
      itemId: 'match-1',
      unreadCount: 1,
      eventIds: ['turn-1'],
    }, {
      experience: 'shado-live',
      itemId: 'room-1',
      unreadCount: 2,
      eventIds: ['live-1', 'live-2'],
    }],
  }),
}))

jest.mock('../src/config/featureFlags', () => ({
  SHADO_LIVE_PROTOTYPE_ENABLED: false,
  SHADO_LIVE_REAL_ENABLED: true,
}))

jest.mock('../src/components/layout/MobileAppHeader', () => ({
  MobileAppHeader: () => null,
}))

test('shows which Play experiences own the bottom navigation unread count', () => {
  render(<GamesHome currentView="games" onViewChange={jest.fn()} />)

  expect(screen.getByTestId('play-unread-Shado Live')).toHaveTextContent('2')
  expect(screen.getByLabelText('2 unread Shado Live updates')).toBeInTheDocument()
  expect(screen.getByTestId('play-unread-Shadow Checkers')).toHaveTextContent('1')
  expect(screen.getByLabelText('1 unread Shadow Checkers update')).toBeInTheDocument()
  expect(screen.queryByTestId('play-unread-Shadow War')).not.toBeInTheDocument()
})

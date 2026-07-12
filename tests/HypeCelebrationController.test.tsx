import { fireEvent, render, screen } from '@testing-library/react'
import { HypeCelebrationController } from '../src/components/hype/HypeCelebrationController'
import { useHype } from '../src/hooks/useHype'

jest.mock('../src/hooks/useHype', () => ({
  useHype: jest.fn(),
}))

jest.mock('../src/hooks/useComfortPreferences', () => ({
  useComfortPreferences: () => ({
    isReducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  }),
}))

const mockedUseHype = useHype as jest.Mock
const dismissCelebration = jest.fn()
const originalMatchMedia = window.matchMedia

const makeCelebration = (mode: 'live' | 'catchup', intensity: number, eventCount = 1) => {
  const latestEvent = {
    id: 'hype-event-latest',
    actor_id: 'actor-1',
    event_type: 'bell' as const,
    message_id: null,
    message_author_id: null,
    metadata: { actor_display_name: 'Alice' },
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }

  return {
    key: 1,
    mode,
    intensity,
    events: Array.from({ length: eventCount }, (_, index) => ({
      ...latestEvent,
      id: `hype-event-${index}`,
    })),
    latestEvent,
  }
}

const mockMedia = ({ phone = false, reducedMotion = false } = {}) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion') ? reducedMotion : phone,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockMedia()
})

afterAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

test('renders catch-up and low-tier live Hype as compact nonblocking notices', () => {
  mockedUseHype.mockReturnValue({
    activeCelebration: makeCelebration('catchup', 8, 4),
    dismissCelebration,
  })

  const { rerender } = render(<HypeCelebrationController />)
  const catchup = screen.getByTestId('hype-celebration-overlay')
  expect(catchup).toHaveAttribute('data-hype-presentation', 'compact')
  expect(catchup).toHaveClass('hype-celebration--compact')
  expect(catchup.querySelectorAll('.hype-celebration__particle')).toHaveLength(0)
  expect(screen.getByText('4 Hypes')).toBeInTheDocument()

  mockedUseHype.mockReturnValue({
    activeCelebration: makeCelebration('live', 2),
    dismissCelebration,
  })
  rerender(<HypeCelebrationController />)

  expect(screen.getByTestId('hype-celebration-overlay')).toHaveAttribute('data-hype-presentation', 'compact')
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss Hype celebration' }))
  expect(dismissCelebration).toHaveBeenCalledTimes(1)
})

test('uses fullscreen effects only for live high-tier Hype', () => {
  mockedUseHype.mockReturnValue({
    activeCelebration: makeCelebration('live', 3),
    dismissCelebration,
  })

  render(<HypeCelebrationController />)

  const overlay = screen.getByTestId('hype-celebration-overlay')
  expect(overlay).toHaveAttribute('data-hype-presentation', 'fullscreen')
  expect(overlay).toHaveClass('hype-celebration--fullscreen')
  expect(overlay.querySelector('.hype-celebration__wash')).toBeInTheDocument()
  expect(overlay.querySelectorAll('.hype-celebration__particle').length).toBeGreaterThan(0)
})

test('forces high-tier Hype onto the compact reduced-motion path', () => {
  mockMedia({ phone: true, reducedMotion: true })
  mockedUseHype.mockReturnValue({
    activeCelebration: makeCelebration('live', 8),
    dismissCelebration,
  })

  render(<HypeCelebrationController />)

  const overlay = screen.getByTestId('hype-celebration-overlay')
  expect(overlay).toHaveAttribute('data-hype-presentation', 'compact')
  expect(overlay).toHaveAttribute('data-reduced-motion', 'true')
  expect(overlay).toHaveStyle({ '--hype-display-duration': '2000ms' })
  expect(overlay.querySelectorAll('.hype-celebration__particle')).toHaveLength(0)
})

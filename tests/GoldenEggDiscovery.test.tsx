import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { GoldenEggDiscoveryController } from '../src/components/easter-egg/GoldenEggDiscovery'
import { GoldenEggDiscoveryLogo } from '../src/components/easter-egg/GoldenEggDiscoveryLogo'
import { claimGoldEasterEgg } from '../src/lib/supabase'

const mockRefreshProfile = jest.fn()
let mockProfile: any
let mockHapticsEnabled = true

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    profile: mockProfile,
    refreshProfile: mockRefreshProfile,
  }),
}))

jest.mock('../src/hooks/useComfortPreferences', () => ({
  useComfortPreferences: () => ({
    preferences: { haptics: mockHapticsEnabled },
  }),
}))

jest.mock('../src/lib/supabase', () => ({
  claimGoldEasterEgg: jest.fn(),
}))

const fireTouchPointerDown = (element: Element) => {
  const event = createEvent.pointerDown(element, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
  })
  Object.defineProperty(event, 'pointerType', {
    configurable: true,
    value: 'touch',
  })
  fireEvent(element, event)
}

describe('GoldenEggDiscoveryLogo', () => {
  const originalMatchMedia = window.matchMedia
  const originalVibrate = navigator.vibrate

  beforeEach(() => {
    mockHapticsEnabled = true
    jest.useFakeTimers()
    mockProfile = {
      id: 'user-1',
      username: 'alice',
      display_name: 'Alice',
      gold_easter_egg: false,
    }
    mockRefreshProfile.mockResolvedValue({
      ...mockProfile,
      gold_easter_egg: true,
    })
    ;(claimGoldEasterEgg as jest.Mock).mockResolvedValue(true)
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query.includes('max-width: 767px'),
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    })
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: jest.fn(),
    })
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.clearAllMocks()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    })
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: originalVibrate,
    })
  })

  test('claims the egg and shows the award animation after a mobile hold', async () => {
    render(
      <>
        <GoldenEggDiscoveryController />
        <GoldenEggDiscoveryLogo />
      </>
    )

    fireTouchPointerDown(screen.getByRole('button', { name: 'SHADO' }))

    await act(async () => {
      jest.advanceTimersByTime(1300)
    })

    await waitFor(() => {
      expect(claimGoldEasterEgg).toHaveBeenCalledTimes(1)
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1)
    })

    expect(screen.getByTestId('gold-egg-discovery-overlay')).toBeInTheDocument()
    expect(screen.getByText('Golden Egg Found')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByLabelText('Golden egg found')).toBeInTheDocument()
    expect(navigator.vibrate).toHaveBeenCalledWith([18, 32, 28])
  })

  test('does not vibrate when the device comfort policy disables haptics', async () => {
    mockHapticsEnabled = false
    render(
      <>
        <GoldenEggDiscoveryController />
        <GoldenEggDiscoveryLogo />
      </>
    )

    fireTouchPointerDown(screen.getByRole('button', { name: 'SHADO' }))
    await act(async () => {
      jest.advanceTimersByTime(1300)
    })
    await waitFor(() => expect(claimGoldEasterEgg).toHaveBeenCalledTimes(1))
    expect(navigator.vibrate).not.toHaveBeenCalled()
  })

  test('does not claim the egg from a desktop pointer', () => {
    render(
      <>
        <GoldenEggDiscoveryController />
        <GoldenEggDiscoveryLogo />
      </>
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: 'SHADO' }), {
      pointerType: 'mouse',
      pointerId: 1,
    })
    act(() => {
      jest.advanceTimersByTime(1300)
    })

    expect(claimGoldEasterEgg).not.toHaveBeenCalled()
  })
})

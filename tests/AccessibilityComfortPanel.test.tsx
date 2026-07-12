import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AccessibilityComfortPanel } from '../src/components/settings/AccessibilityComfortPanel'
import { ComfortPreferencesProvider } from '../src/hooks/useComfortPreferences'
import { COMFORT_STORAGE_KEY } from '../src/lib/comfortPreferences'

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
})

afterAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

const renderPanel = () => render(
  <ComfortPreferencesProvider>
    <AccessibilityComfortPanel />
  </ComfortPreferencesProvider>
)

test('offers named profiles and applies Calm as a complete runtime policy', async () => {
  renderPanel()

  expect(screen.getByRole('heading', { name: 'Comfort Profiles' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /follow device/i })).toHaveAttribute('aria-pressed', 'true')

  fireEvent.click(screen.getByRole('button', { name: /^calm/i }))

  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-comfort-preset', 'calm'))
  expect(document.documentElement).toHaveAttribute('data-comfort-motion', 'none')
  expect(document.documentElement).toHaveAttribute('data-comfort-transparency', 'solid')
  expect(document.documentElement).toHaveAttribute('data-comfort-autoplay', 'never')
  expect(document.documentElement).toHaveAttribute('data-comfort-haptics', 'off')
  expect(screen.getAllByText('Play on request')).not.toHaveLength(0)
})

test('fine tuning marks the profile custom and persists accessible controls', async () => {
  renderPanel()

  fireEvent.change(screen.getByLabelText('Text size'), { target: { value: '130' } })
  fireEvent.change(screen.getByLabelText('Control size'), { target: { value: 'large' } })
  fireEvent.change(screen.getByLabelText('Media playback'), { target: { value: 'never' } })
  fireEvent.click(screen.getByRole('switch', { name: /haptics/i }))

  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-comfort-text-scale', '130'))
  expect(document.documentElement).toHaveAttribute('data-comfort-touch-target', 'large')
  expect(document.documentElement).toHaveAttribute('data-comfort-autoplay', 'never')
  expect(screen.getByRole('switch', { name: /haptics/i })).toHaveAttribute('aria-checked', 'false')
  expect(JSON.parse(localStorage.getItem(COMFORT_STORAGE_KEY) ?? '{}')).toMatchObject({
    preset: 'custom',
    textScale: 130,
    touchTarget: 'large',
    autoplay: 'never',
    haptics: false,
  })
})

test('Reset restores the live device-following profile', async () => {
  renderPanel()
  const profiles = screen.getByRole('group', { name: 'Comfort profile presets' })

  fireEvent.click(within(profiles).getByRole('button', { name: /high visibility/i }))
  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-comfort-contrast', 'high'))

  fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

  await waitFor(() => expect(document.documentElement).toHaveAttribute('data-comfort-preset', 'follow-device'))
  expect(document.documentElement).toHaveAttribute('data-comfort-motion', 'reduced')
  expect(document.documentElement).toHaveAttribute('data-comfort-text-scale', '100')
  expect(within(profiles).getByRole('button', { name: /follow device/i })).toHaveAttribute('aria-pressed', 'true')
})

import { fireEvent, render, screen } from '@testing-library/react'
import { WeatherWidget } from '../src/components/chat/WeatherWidget'

const mockUseWeatherForecast = jest.fn()

jest.mock('../src/hooks/useWeatherForecast', () => ({
  useWeatherForecast: () => mockUseWeatherForecast(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockUseWeatherForecast.mockReturnValue({
    preference: { location_name: 'Nashville, Tennessee, US' },
    forecast: {
      current: {
        temperature: 72.4,
        condition: { kind: 'partly-cloudy', label: 'Partly cloudy' },
        isDay: true,
      },
    },
    loading: false,
  })
})

test('compact weather control navigates instead of opening a popup', () => {
  const onOpen = jest.fn()
  render(<WeatherWidget onOpen={onOpen} />)

  fireEvent.click(screen.getByRole('button', { name: /open weather for nashville/i }))

  expect(onOpen).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('bottom navigation weather control exposes its active route', () => {
  render(<WeatherWidget onOpen={jest.fn()} active variant="nav" />)

  const button = screen.getByRole('button', { name: /open weather for nashville/i })
  expect(button).toHaveAttribute('aria-current', 'page')
  expect(screen.getByText('Weather')).toBeInTheDocument()
})

test('weather control still opens the full page before a location is chosen', () => {
  const onOpen = jest.fn()
  mockUseWeatherForecast.mockReturnValue({ preference: null, forecast: null, loading: false })
  render(<WeatherWidget onOpen={onOpen} />)

  fireEvent.click(screen.getByRole('button', { name: 'Open weather' }))
  expect(onOpen).toHaveBeenCalledTimes(1)
})

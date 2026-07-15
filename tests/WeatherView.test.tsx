import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { WeatherView } from '../src/features/weather/WeatherView'

const mockSave = jest.fn()
const mockRefresh = jest.fn()
const mockFetchSaved = jest.fn()
const mockFetchAlerts = jest.fn()
const mockFetchDetailed = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

jest.mock('../src/hooks/MessagesContext', () => ({
  useOptionalMessages: () => ({ sendMessage: jest.fn() }),
}))

const preference = {
  user_id: 'user-1',
  location_name: 'Nashville, Tennessee, US',
  latitude: 36.17,
  longitude: -86.78,
  timezone: 'America/Chicago',
  country_code: 'US',
  admin1: 'Tennessee',
  temperature_unit: 'fahrenheit' as const,
}

const daily = Array.from({ length: 10 }, (_, index) => ({
  date: `2026-07-${String(15 + index).padStart(2, '0')}`,
  weatherCode: 2,
  condition: { kind: 'partly-cloudy' as const, label: 'Partly cloudy' },
  temperatureMax: 84 - index,
  temperatureMin: 64,
  precipitationProbabilityMax: 20,
  precipitationSum: 0.02,
  rainSum: 0.02,
  snowfallSum: 0,
  windSpeedMax: 12,
  windGustsMax: 18,
  sunrise: '2026-07-15T05:45',
  sunset: '2026-07-15T20:04',
  uvIndexMax: 7,
}))

const forecast = {
  timezone: 'America/Chicago',
  temperatureUnit: 'fahrenheit' as const,
  windSpeedUnit: 'mph' as const,
  precipitationUnit: 'in' as const,
  visibilityUnit: 'mi' as const,
  current: {
    time: '2026-07-15T12:00',
    temperature: 79,
    apparentTemperature: 81,
    relativeHumidity: 64,
    precipitation: 0,
    weatherCode: 2,
    isDay: true,
    windSpeed: 7,
    windGusts: 12,
    dewPoint: 66,
    visibility: 10,
    pressure: 1008,
    uvIndex: 6.1,
    condition: { kind: 'partly-cloudy' as const, label: 'Partly cloudy' },
  },
  hourly: [{
    time: '2026-07-15T12:00',
    temperature: 79,
    apparentTemperature: 81,
    precipitationProbability: 20,
    precipitation: 0,
    weatherCode: 2,
    windSpeed: 7,
    windGusts: 12,
    relativeHumidity: 64,
    condition: { kind: 'partly-cloudy' as const, label: 'Partly cloudy' },
  }],
  daily,
}

jest.mock('../src/hooks/useWeatherForecast', () => ({
  useWeatherForecast: () => ({ preference, forecast, loading: false, error: null, refresh: mockRefresh }),
}))

jest.mock('../src/hooks/useWeatherPreference', () => ({
  useWeatherPreference: () => ({ save: mockSave, saving: false }),
}))

jest.mock('../src/lib/weather', () => {
  const actual = jest.requireActual('../src/lib/weather')
  return {
    ...actual,
    fetchSavedWeatherLocations: (...args: unknown[]) => mockFetchSaved(...args),
    fetchWeatherAlerts: (...args: unknown[]) => mockFetchAlerts(...args),
    fetchDetailedWeatherForecast: (...args: unknown[]) => mockFetchDetailed(...args),
    saveWeatherLocation: jest.fn(),
    deleteSavedWeatherLocation: jest.fn(),
  }
})

jest.mock('../src/features/weather/RadarMap', () => ({
  RadarMap: () => <div data-testid="radar-map">Interactive radar map</div>,
}))

jest.mock('../src/lib/supabase', () => ({
  uploadChatImageAsset: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchSaved.mockResolvedValue([])
  mockFetchAlerts.mockResolvedValue([])
  mockFetchDetailed.mockResolvedValue(forecast)
  mockRefresh.mockResolvedValue(undefined)
  mockSave.mockImplementation(async () => preference)
})

test('renders the mobile-first current, hourly, alert, and ten-day weather surfaces', async () => {
  render(<WeatherView currentView="weather" onViewChange={jest.fn()} />)

  expect(screen.getByTestId('weather-view')).toBeInTheDocument()
  expect(screen.getAllByText('Nashville, Tennessee, US').length).toBeGreaterThan(0)
  expect(await screen.findByText('Right now')).toBeInTheDocument()
  expect(screen.getByText('Next 24 hours')).toBeInTheDocument()
  expect(screen.getByText('10-day forecast')).toBeInTheDocument()
  expect(screen.getByText('Severe weather alerts')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh weather' })).toBeInTheDocument()
  await waitFor(() => expect(mockFetchAlerts).toHaveBeenCalledWith(preference))
})

test('uses device location only after the explicit button is pressed', async () => {
  const getCurrentPosition = jest.fn((success: PositionCallback) => success({
    coords: { latitude: 35.1, longitude: -86.2 },
  } as GeolocationPosition))
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })

  render(<WeatherView currentView="weather" onViewChange={jest.fn()} />)
  await screen.findByText('Right now')
  expect(getCurrentPosition).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: /use current location/i }))

  expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(mockSave).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Current location', latitude: 35.1, longitude: -86.2 }),
    'fahrenheit'
  ))
})

test('loads the interactive radar chunk on demand', async () => {
  render(<WeatherView currentView="weather" onViewChange={jest.fn()} />)

  await screen.findByText('Right now')
  expect(screen.queryByTestId('radar-map')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /show radar/i }))
  expect(await screen.findByTestId('radar-map')).toBeInTheDocument()
})

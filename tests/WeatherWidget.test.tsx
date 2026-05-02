import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { WeatherWidget } from '../src/components/chat/WeatherWidget'

const mockRefresh = jest.fn()
const mockUseWeatherForecast = jest.fn()

jest.mock('../src/hooks/useWeatherForecast', () => ({
  useWeatherForecast: () => mockUseWeatherForecast(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  window.sessionStorage.clear()
  mockUseWeatherForecast.mockReturnValue({
    preference: {
      user_id: 'user-1',
      location_name: 'Nashville, Tennessee, US',
      latitude: 36.17,
      longitude: -86.78,
      timezone: 'America/Chicago',
      country_code: 'US',
      admin1: 'Tennessee',
      temperature_unit: 'fahrenheit',
    },
    forecast: {
      timezone: 'America/Chicago',
      temperatureUnit: 'fahrenheit',
      current: {
        time: '2026-05-02T10:00',
        temperature: 72.4,
        apparentTemperature: 74,
        relativeHumidity: 63,
        precipitation: 0.01,
        weatherCode: 2,
        isDay: true,
        windSpeed: 8,
        windGusts: 14,
        condition: { kind: 'partly-cloudy', label: 'Partly cloudy' },
      },
      daily: [
        {
          date: '2026-05-02',
          weatherCode: 2,
          condition: { kind: 'partly-cloudy', label: 'Partly cloudy' },
          temperatureMax: 77,
          temperatureMin: 60,
          precipitationProbabilityMax: 20,
          precipitationSum: 0.02,
        },
      ],
    },
    loading: false,
    error: null,
    refresh: mockRefresh,
  })
})

test('shows compact weather and opens detailed forecast popup', () => {
  render(<WeatherWidget />)

  expect(screen.getByRole('button', { name: /72\u00b0 and partly cloudy/i })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /72\u00b0 and partly cloudy/i }))

  const dialog = screen.getByRole('dialog', { name: /weather forecast/i })
  expect(within(dialog).getByText('Nashville, Tennessee, US')).toBeInTheDocument()
  expect(within(dialog).getAllByText('Partly cloudy').length).toBeGreaterThan(0)
  expect(within(dialog).getByText('Feels')).toBeInTheDocument()
  expect(within(dialog).getByText('77\u00b0 / 60\u00b0')).toBeInTheDocument()
})

test('prompts for settings when no weather location is selected', () => {
  const openSettings = jest.fn()
  mockUseWeatherForecast.mockReturnValue({
    preference: null,
    forecast: null,
    loading: false,
    error: null,
    refresh: mockRefresh,
  })

  render(<WeatherWidget onOpenSettings={openSettings} />)

  fireEvent.click(screen.getByRole('button', { name: /weather settings/i }))
  fireEvent.click(screen.getByRole('button', { name: /open weather settings/i }))

  expect(openSettings).toHaveBeenCalledTimes(1)
  expect(window.sessionStorage.getItem('shadowchat:settings-section')).toBe('account-profile')
})

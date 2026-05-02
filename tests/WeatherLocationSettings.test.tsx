import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { WeatherLocationSettings } from '../src/components/settings/WeatherLocationSettings'
import { searchWeatherLocations } from '../src/lib/weather'

const mockSave = jest.fn()
const mockClear = jest.fn()
const mockUseWeatherPreference = jest.fn()

jest.mock('../src/hooks/useWeatherPreference', () => ({
  useWeatherPreference: () => mockUseWeatherPreference(),
}))

jest.mock('../src/lib/weather', () => {
  const actual = jest.requireActual('../src/lib/weather')
  return {
    ...actual,
    searchWeatherLocations: jest.fn(),
  }
})

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn() as any
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockUseWeatherPreference.mockReturnValue({
    preference: null,
    loading: false,
    saving: false,
    error: null,
    save: mockSave,
    clear: mockClear,
  })
  ;(searchWeatherLocations as jest.Mock).mockResolvedValue([
    {
      id: 4644585,
      name: 'Nashville',
      latitude: 36.17,
      longitude: -86.78,
      timezone: 'America/Chicago',
      country: 'United States',
      country_code: 'US',
      admin1: 'Tennessee',
    },
  ])
  mockSave.mockResolvedValue({
    location_name: 'Nashville, Tennessee, United States',
  })
})

test('searches and saves a selected weather location', async () => {
  render(<WeatherLocationSettings />)

  fireEvent.change(screen.getByLabelText(/search city or postal code/i), {
    target: { value: 'Nashville' },
  })

  await waitFor(() => {
    expect(screen.getByText('Nashville, Tennessee, United States')).toBeInTheDocument()
  })

  fireEvent.click(screen.getByRole('button', { name: /nashville, tennessee/i }))

  await waitFor(() => {
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Nashville',
      latitude: 36.17,
      longitude: -86.78,
    }))
  })
})

test('clears an existing weather location', async () => {
  mockUseWeatherPreference.mockReturnValue({
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
    loading: false,
    saving: false,
    error: null,
    save: mockSave,
    clear: mockClear,
  })

  render(<WeatherLocationSettings />)

  fireEvent.click(screen.getByRole('button', { name: /clear/i }))

  await waitFor(() => {
    expect(mockClear).toHaveBeenCalledTimes(1)
  })
})

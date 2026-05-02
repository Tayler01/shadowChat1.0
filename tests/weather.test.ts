import {
  fetchWeatherForecast,
  formatTemperature,
  getWeatherCondition,
  getWeatherLocationLabel,
  type WeatherPreference,
} from '../src/lib/weather'

const originalFetch = global.fetch
const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  global.fetch = fetchMock as unknown as typeof fetch
})

afterAll(() => {
  global.fetch = originalFetch
})

test('formats weather labels and temperatures', () => {
  expect(formatTemperature(72.5)).toBe('73\u00b0')
  expect(formatTemperature(Number.NaN)).toBe('--')
  expect(getWeatherCondition(95).kind).toBe('thunderstorm')
  expect(getWeatherLocationLabel({
    name: 'Nashville',
    admin1: 'Tennessee',
    country: 'United States',
    country_code: 'US',
  })).toBe('Nashville, Tennessee, United States')
})

test('maps Open-Meteo forecast responses into app weather data', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      timezone: 'America/Chicago',
      current: {
        time: '2026-05-02T12:00',
        temperature_2m: 71.6,
        apparent_temperature: 73.1,
        relative_humidity_2m: 60,
        precipitation: 0.03,
        weather_code: 61,
        is_day: 1,
        wind_speed_10m: 8.2,
        wind_gusts_10m: 12.4,
      },
      daily: {
        time: ['2026-05-02'],
        weather_code: [95],
        temperature_2m_max: [78],
        temperature_2m_min: [59],
        precipitation_probability_max: [55],
        precipitation_sum: [0.12],
      },
    }),
  })

  const preference: WeatherPreference = {
    user_id: 'user-1',
    location_name: 'Nashville, Tennessee, US',
    latitude: 36.17,
    longitude: -86.78,
    timezone: 'America/Chicago',
    country_code: 'US',
    admin1: 'Tennessee',
    temperature_unit: 'fahrenheit',
  }

  const forecast = await fetchWeatherForecast(preference)

  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('latitude=36.17'))
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('temperature_unit=fahrenheit'))
  expect(forecast.current.temperature).toBe(71.6)
  expect(forecast.current.condition.kind).toBe('rain')
  expect(forecast.daily[0]).toMatchObject({
    condition: { kind: 'thunderstorm', label: 'Thunderstorms' },
    temperatureMax: 78,
    precipitationProbabilityMax: 55,
  })
})

import {
  fetchWeatherForecast,
  fetchDetailedWeatherForecast,
  fetchWeatherAlerts,
  fetchWeatherRadarManifest,
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
        dew_point_2m: 55,
        visibility: 16093.44,
        surface_pressure: 1008,
      },
      hourly: {
        time: ['2026-05-02T12:00', '2026-05-02T13:00'],
        temperature_2m: [71.6, 73],
        apparent_temperature: [73.1, 74],
        precipitation_probability: [40, 35],
        precipitation: [0.03, 0],
        weather_code: [61, 2],
        wind_speed_10m: [8.2, 9],
        wind_gusts_10m: [12.4, 14],
        relative_humidity_2m: [60, 57],
        uv_index: [4.3, 5],
      },
      daily: {
        time: ['2026-05-02'],
        weather_code: [95],
        temperature_2m_max: [78],
        temperature_2m_min: [59],
        precipitation_probability_max: [55],
        precipitation_sum: [0.12],
        rain_sum: [0.12],
        snowfall_sum: [0],
        wind_speed_10m_max: [18],
        wind_gusts_10m_max: [25],
        sunrise: ['2026-05-02T05:52'],
        sunset: ['2026-05-02T19:37'],
        uv_index_max: [7.1],
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

  const forecast = await fetchDetailedWeatherForecast(preference)

  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('latitude=36.17'))
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('temperature_unit=fahrenheit'))
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('forecast_days=10'))
  expect(forecast.current.temperature).toBe(71.6)
  expect(forecast.current.condition.kind).toBe('rain')
  expect(forecast.daily[0]).toMatchObject({
    condition: { kind: 'thunderstorm', label: 'Thunderstorms' },
    temperatureMax: 78,
    precipitationProbabilityMax: 55,
  })
  expect(forecast.hourly).toHaveLength(2)
  expect(forecast.current).toMatchObject({
    dewPoint: 55,
    visibility: 10,
    pressure: 1008,
    uvIndex: 4.3,
  })
  expect(forecast.daily[0].sunrise).toBe('2026-05-02T05:52')
})

test('keeps the compact navigation forecast small until the full page is opened', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      timezone: 'America/Chicago',
      current: {
        time: '2026-05-02T12:00',
        temperature_2m: 72,
        apparent_temperature: 73,
        relative_humidity_2m: 60,
        precipitation: 0,
        weather_code: 2,
        is_day: 1,
        wind_speed_10m: 8,
        wind_gusts_10m: 12,
      },
      daily: {
        time: ['2026-05-02'],
        weather_code: [2],
        temperature_2m_max: [78],
        temperature_2m_min: [59],
        precipitation_probability_max: [20],
        precipitation_sum: [0],
      },
    }),
  })

  await fetchWeatherForecast({
    user_id: 'user-1',
    location_name: 'Nashville',
    latitude: 36.17,
    longitude: -86.78,
    temperature_unit: 'fahrenheit',
  })

  const requestUrl = String(fetchMock.mock.calls[0][0])
  expect(requestUrl).toContain('forecast_days=5')
  expect(requestUrl).not.toContain('hourly=')
})

test('maps National Weather Service alerts and treats unavailable coverage as empty', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      features: [{
        id: 'alert-1',
        properties: {
          headline: 'Severe Thunderstorm Warning',
          event: 'Severe Thunderstorm Warning',
          severity: 'Severe',
          urgency: 'Immediate',
          description: 'Take shelter.',
          instruction: 'Move indoors.',
        },
      }],
    }),
  })

  const preference: WeatherPreference = {
    user_id: 'user-1',
    location_name: 'Nashville',
    latitude: 36.17,
    longitude: -86.78,
    temperature_unit: 'fahrenheit',
  }

  await expect(fetchWeatherAlerts(preference)).resolves.toEqual([
    expect.objectContaining({ id: 'alert-1', severity: 'Severe' }),
  ])
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('api.weather.gov/alerts/active'),
    expect.anything()
  )

  fetchMock.mockResolvedValueOnce({ ok: false })
  await expect(fetchWeatherAlerts(preference)).resolves.toEqual([])
})

test('combines observed and forecast RainViewer frames', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      generated: 1_783_000_000,
      host: 'https://tilecache.rainviewer.com',
      radar: {
        past: [{ time: 100, path: '/past' }],
        nowcast: [{ time: 200, path: '/future' }],
      },
    }),
  })

  await expect(fetchWeatherRadarManifest()).resolves.toMatchObject({
    frames: [
      { time: 100, path: '/past', forecast: false },
      { time: 200, path: '/future', forecast: true },
    ],
  })
})

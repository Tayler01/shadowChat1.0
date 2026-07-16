import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import L from 'leaflet'
import { RadarMap } from '../src/features/weather/RadarMap'
import { fetchWeatherRadarManifest } from '../src/lib/weather'

jest.mock('../src/hooks/useComfortPreferences', () => ({
  useComfortPreferences: () => ({ isReducedMotion: false }),
}))

jest.mock('../src/lib/weather', () => ({
  fetchWeatherRadarManifest: jest.fn(),
}))

jest.mock('leaflet', () => {
  class MockTileLayer {
    handlers = new Map<string, Set<() => void>>()
    opacity = 0
    onMap = false
    container = document.createElement('div')
    addTo = jest.fn((map: MockMap) => {
      this.onMap = true
      map.layers.add(this)
      return this
    })
    once = jest.fn((event: string, handler: () => void) => {
      const handlers = this.handlers.get(event) ?? new Set()
      handlers.add(handler)
      this.handlers.set(event, handlers)
      return this
    })
    off = jest.fn((event: string, handler: () => void) => {
      this.handlers.get(event)?.delete(handler)
      return this
    })
    setOpacity = jest.fn((opacity: number) => {
      this.opacity = opacity
      return this
    })
    getContainer = jest.fn(() => this.container)
    emit(event: string) {
      const handlers = [...(this.handlers.get(event) ?? [])]
      this.handlers.delete(event)
      handlers.forEach(handler => handler())
    }
  }

  class MockMap {
    layers = new Set<MockTileLayer>()
    setView = jest.fn(() => this)
    getZoom = jest.fn(() => 7)
    invalidateSize = jest.fn()
    hasLayer = jest.fn((layer: MockTileLayer) => this.layers.has(layer))
    removeLayer = jest.fn((layer: MockTileLayer) => {
      layer.onMap = false
      this.layers.delete(layer)
      return this
    })
    remove = jest.fn()
  }

  const map = new MockMap()
  const layers: MockTileLayer[] = []
  const tileLayer = jest.fn(() => {
    const layer = new MockTileLayer()
    layers.push(layer)
    return layer
  })
  const circleMarker = jest.fn(() => ({
    bindTooltip: jest.fn().mockReturnThis(),
    addTo: jest.fn().mockReturnThis(),
  }))

  return {
    __esModule: true,
    default: {
      map: jest.fn(() => map),
      tileLayer,
      circleMarker,
      __map: map,
      __layers: layers,
    },
  }
})

type MockLeaflet = {
  __map: {
    removeLayer: jest.Mock
    layers: Set<unknown>
  }
  __layers: Array<{
    emit: (event: string) => void
    setOpacity: jest.Mock
  }>
}

const mockManifest = fetchWeatherRadarManifest as jest.MockedFunction<typeof fetchWeatherRadarManifest>
const leaflet = L as unknown as MockLeaflet

beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  leaflet.__layers.splice(0)
  leaflet.__map.layers.clear()
  mockManifest.mockResolvedValue({
    host: 'https://radar.example.test',
    generatedAt: 1_721_000_000,
    frames: [
      { time: 1_721_000_000, path: '/frame-one', forecast: false },
      { time: 1_721_000_600, path: '/frame-two', forecast: false },
    ],
  })
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

test('keeps the current radar frame visible until the next frame is loaded and faded in', async () => {
  render(<RadarMap latitude={36.17} longitude={-86.78} locationName="Nashville" />)

  await waitFor(() => expect(leaflet.__layers).toHaveLength(2))
  const firstRadarLayer = leaflet.__layers[1]
  act(() => {
    firstRadarLayer.emit('load')
    jest.advanceTimersByTime(220)
  })
  expect(firstRadarLayer.setOpacity).toHaveBeenCalledWith(0.68)

  fireEvent.change(screen.getByRole('slider', { name: 'Radar frame' }), { target: { value: '0' } })
  await waitFor(() => expect(leaflet.__layers).toHaveLength(3))
  const nextRadarLayer = leaflet.__layers[2]

  expect(leaflet.__map.layers.has(firstRadarLayer)).toBe(true)
  expect(leaflet.__map.removeLayer).not.toHaveBeenCalledWith(firstRadarLayer)

  act(() => {
    nextRadarLayer.emit('load')
    jest.advanceTimersByTime(220)
  })

  expect(nextRadarLayer.setOpacity).toHaveBeenCalledWith(0.68)
  expect(leaflet.__map.removeLayer).toHaveBeenCalledWith(firstRadarLayer)
  expect(leaflet.__map.layers.has(nextRadarLayer)).toBe(true)
})

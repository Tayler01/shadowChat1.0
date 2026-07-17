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
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
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
    jest.advanceTimersByTime(100)
  })
  expect(firstRadarLayer.setOpacity).toHaveBeenCalledWith(0.68)

  fireEvent.change(screen.getByRole('slider', { name: 'Radar frame' }), { target: { value: '0' } })
  await waitFor(() => expect(leaflet.__layers).toHaveLength(3))
  const nextRadarLayer = leaflet.__layers[2]

  expect(leaflet.__map.layers.has(firstRadarLayer)).toBe(true)
  expect(leaflet.__map.removeLayer).not.toHaveBeenCalledWith(firstRadarLayer)

  act(() => {
    nextRadarLayer.emit('load')
    jest.advanceTimersByTime(100)
  })

  expect(nextRadarLayer.setOpacity).toHaveBeenCalledWith(0.68)
  expect(leaflet.__map.removeLayer).toHaveBeenCalledWith(firstRadarLayer)
  expect(leaflet.__map.layers.has(nextRadarLayer)).toBe(true)
})

test('preloads the next frame, advances at least twice as fast, and keeps radar layers bounded', async () => {
  render(<RadarMap latitude={36.17} longitude={-86.78} locationName="Nashville" />)

  await waitFor(() => expect(leaflet.__layers).toHaveLength(2))
  const firstRadarLayer = leaflet.__layers[1]
  act(() => {
    firstRadarLayer.emit('load')
    jest.advanceTimersByTime(100)
  })

  fireEvent.click(screen.getByRole('button', { name: 'Play radar animation' }))
  await waitFor(() => expect(leaflet.__layers).toHaveLength(3))
  const preloadedLayer = leaflet.__layers[2]

  act(() => {
    preloadedLayer.emit('load')
    jest.advanceTimersByTime(499)
  })
  expect(preloadedLayer.setOpacity).not.toHaveBeenCalledWith(0.68)
  expect(leaflet.__map.layers.has(firstRadarLayer)).toBe(true)

  act(() => {
    jest.advanceTimersByTime(2)
  })
  expect(preloadedLayer.setOpacity).toHaveBeenCalledWith(0.68)

  act(() => {
    jest.advanceTimersByTime(100)
  })
  expect(leaflet.__map.removeLayer).toHaveBeenCalledWith(firstRadarLayer)
  await waitFor(() => expect(leaflet.__layers.length).toBeGreaterThanOrEqual(4))
  expect(leaflet.__map.layers.size).toBeLessThanOrEqual(3)
})

test('pauses frame work while the page is hidden and resumes preloading when visible', async () => {
  render(<RadarMap latitude={36.17} longitude={-86.78} locationName="Nashville" />)

  await waitFor(() => expect(leaflet.__layers).toHaveLength(2))
  act(() => {
    leaflet.__layers[1].emit('load')
    jest.advanceTimersByTime(100)
  })

  fireEvent.click(screen.getByRole('button', { name: 'Play radar animation' }))
  await waitFor(() => expect(leaflet.__layers).toHaveLength(3))
  const hiddenPendingLayer = leaflet.__layers[2]
  const layerCountBeforeHiding = leaflet.__layers.length

  act(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    jest.advanceTimersByTime(2_000)
  })

  expect(leaflet.__map.removeLayer).toHaveBeenCalledWith(hiddenPendingLayer)
  expect(leaflet.__layers).toHaveLength(layerCountBeforeHiding)

  act(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await waitFor(() => expect(leaflet.__layers).toHaveLength(layerCountBeforeHiding + 1))
})

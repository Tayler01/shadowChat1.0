import { act, render } from '@testing-library/react'
import React from 'react'
import { VideoAttachment } from '../src/components/chat/VideoAttachment'

const originalIntersectionObserver = globalThis.IntersectionObserver

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly callback: IntersectionObserverCallback
  readonly root = null
  readonly rootMargin = ''
  readonly thresholds = [0, 0.6, 1]
  observedElement: Element | null = null
  observe = jest.fn((element: Element) => {
    this.observedElement = element
  })
  unobserve = jest.fn()
  disconnect = jest.fn()
  takeRecords = jest.fn(() => [])

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    MockIntersectionObserver.instances.push(this)
  }

  trigger(entry: Partial<IntersectionObserverEntry>) {
    this.callback(
      [
        {
          boundingClientRect: {} as DOMRectReadOnly,
          intersectionRatio: 0,
          intersectionRect: {} as DOMRectReadOnly,
          isIntersecting: false,
          rootBounds: null,
          target: this.observedElement || document.createElement('video'),
          time: 0,
          ...entry,
        },
      ],
      this as unknown as IntersectionObserver
    )
  }
}

beforeEach(() => {
  MockIntersectionObserver.instances = []
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver as unknown as typeof IntersectionObserver,
  })
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  })
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: originalIntersectionObserver,
  })
  jest.restoreAllMocks()
})

test('autoplays muted when the video is mostly visible and pauses when it leaves focus', async () => {
  const play = jest.spyOn(HTMLMediaElement.prototype, 'play')
  const pause = jest.spyOn(HTMLMediaElement.prototype, 'pause')
  const { container, unmount } = render(<VideoAttachment url="https://example.com/clip.mp4" />)
  const video = container.querySelector('video') as HTMLVideoElement

  expect(video).toHaveProperty('muted', true)
  expect(video).toHaveAttribute('controls')
  expect(video).toHaveAttribute('playsinline')
  expect(video).toHaveAttribute('preload', 'metadata')
  expect(MockIntersectionObserver.instances).toHaveLength(1)

  await act(async () => {
    MockIntersectionObserver.instances[0].trigger({
      isIntersecting: true,
      intersectionRatio: 0.75,
      target: video,
    })
  })

  expect(play).toHaveBeenCalledTimes(1)
  expect(video).toHaveProperty('muted', true)

  act(() => {
    MockIntersectionObserver.instances[0].trigger({
      isIntersecting: false,
      intersectionRatio: 0.2,
      target: video,
    })
  })

  expect(pause).toHaveBeenCalled()

  unmount()
  expect(MockIntersectionObserver.instances[0].disconnect).toHaveBeenCalled()
})

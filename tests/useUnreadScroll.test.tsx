import { act, renderHook, waitFor } from '@testing-library/react'
import { useUnreadScroll } from '../src/hooks/useUnreadScroll'

type TestMessage = {
  id: string
  created_at: string
}

const makeMessage = (id: string, minute: number): TestMessage => ({
  id,
  created_at: `2026-05-03T12:${String(minute).padStart(2, '0')}:00.000Z`,
})

const setScrollMetrics = (element: HTMLElement, scrollHeight: number, clientHeight = 400) => {
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: clientHeight,
  })
}

describe('useUnreadScroll', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame
  const originalCancelAnimationFrame = window.cancelAnimationFrame
  const originalResizeObserver = global.ResizeObserver

  beforeEach(() => {
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof window.requestAnimationFrame
    window.cancelAnimationFrame = jest.fn()
  })

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame
    window.cancelAnimationFrame = originalCancelAnimationFrame
    global.ResizeObserver = originalResizeObserver
    jest.restoreAllMocks()
  })

  it('keeps a live chat pinned to the newest message when messages append', async () => {
    const container = document.createElement('div')
    const content = document.createElement('div')
    container.appendChild(content)
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)

    const scrollTo = jest.fn((options?: ScrollToOptions | number) => {
      const top = typeof options === 'number' ? options : options?.top
      container.scrollTop = Number(top)
    })
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    const props = {
      messages: [makeMessage('m1', 1)],
    }

    const { rerender } = renderHook(
      ({ messages }: { messages: TestMessage[] }) =>
        useUnreadScroll<TestMessage>({
          containerRef: { current: container },
          messages,
          loading: false,
          cursor: null,
          cursorLoading: false,
          enabled: true,
          surfaceKey: 'general_chat:main',
          getMessageId: message => message.id,
          getMessageCreatedAt: message => message.created_at,
          getElementId: id => `message-${id}`,
          onMarkReadToLatest: jest.fn(),
        }),
      { initialProps: props }
    )

    await waitFor(() => expect(container.scrollTop).toBe(600))

    setScrollMetrics(container, 1120)
    rerender({ messages: [makeMessage('m1', 1), makeMessage('m2', 2)] })

    expect(container.scrollTop).toBe(720)

    document.body.removeChild(container)
  })

  it('follows late content height changes while auto-scroll is active', async () => {
    let resizeCallback: ResizeObserverCallback | null = null
    global.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }

      observe = jest.fn()
      unobserve = jest.fn()
      disconnect = jest.fn()
    } as unknown as typeof ResizeObserver

    const container = document.createElement('div')
    const content = document.createElement('div')
    container.appendChild(content)
    document.body.appendChild(container)
    setScrollMetrics(container, 900)

    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: jest.fn((options?: ScrollToOptions | number) => {
        const top = typeof options === 'number' ? options : options?.top
        container.scrollTop = Number(top)
      }),
    })

    renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages: [makeMessage('m1', 1)],
        loading: false,
        cursor: null,
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onMarkReadToLatest: jest.fn(),
      })
    )

    await waitFor(() => expect(container.scrollTop).toBe(500))

    setScrollMetrics(container, 980)
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })

    expect(container.scrollTop).toBe(580)

    document.body.removeChild(container)
  })

  it('keeps the latest message visible while the mobile visual viewport changes', async () => {
    const listeners: Record<string, EventListener[]> = {}
    const originalVisualViewport = window.visualViewport
    global.ResizeObserver = class {
      observe = jest.fn()
      unobserve = jest.fn()
      disconnect = jest.fn()
    } as unknown as typeof ResizeObserver
    const visualViewport = {
      addEventListener: jest.fn((type: string, listener: EventListener) => {
        listeners[type] = [...(listeners[type] || []), listener]
      }),
      removeEventListener: jest.fn(),
      height: 520,
      width: 390,
      offsetTop: 0,
      offsetLeft: 0,
      pageTop: 0,
      pageLeft: 0,
      scale: 1,
    } as unknown as VisualViewport

    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: visualViewport,
    })

    const container = document.createElement('div')
    const content = document.createElement('div')
    container.appendChild(content)
    document.body.appendChild(container)
    setScrollMetrics(container, 900)

    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: jest.fn((options?: ScrollToOptions | number) => {
        const top = typeof options === 'number' ? options : options?.top
        container.scrollTop = Number(top)
      }),
    })

    renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages: [makeMessage('m1', 1)],
        loading: false,
        cursor: null,
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onMarkReadToLatest: jest.fn(),
      })
    )

    await waitFor(() => expect(container.scrollTop).toBe(500))

    setScrollMetrics(container, 960)
    act(() => {
      listeners.resize?.forEach(listener => listener(new Event('resize')))
    })
    expect(container.scrollTop).toBe(560)

    setScrollMetrics(container, 990)
    act(() => {
      window.dispatchEvent(new Event('focusin'))
    })
    expect(container.scrollTop).toBe(590)

    document.body.removeChild(container)
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  })
})

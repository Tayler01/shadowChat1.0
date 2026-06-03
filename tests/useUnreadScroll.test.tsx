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

const makeCursor = (messageId: string | null, minute: number) => ({
  user_id: 'u1',
  surface: 'general_chat',
  scope_id: 'main',
  last_read_message_id: messageId,
  last_read_at: `2026-05-03T12:${String(minute).padStart(2, '0')}:00.000Z`,
  updated_at: `2026-05-03T12:${String(minute).padStart(2, '0')}:01.000Z`,
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

const setRect = (element: HTMLElement, top: number, bottom: number) => {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: jest.fn(() => ({
      top,
      bottom,
      left: 0,
      right: 390,
      width: 390,
      height: bottom - top,
      x: 0,
      y: top,
      toJSON: () => {},
    })),
  })
}

const useFakeTimersWithImmediateRaf = () => {
  jest.useFakeTimers()
  const immediateRequestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
    callback(0)
    return 1
  }) as typeof window.requestAnimationFrame
  const cancelAnimationFrame = jest.fn()
  window.requestAnimationFrame = immediateRequestAnimationFrame
  window.cancelAnimationFrame = cancelAnimationFrame
  global.requestAnimationFrame = immediateRequestAnimationFrame
  global.cancelAnimationFrame = cancelAnimationFrame
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
    jest.useRealTimers()
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

  it('coalesces late content height changes while auto-scroll is active', async () => {
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

    const scrollTo = jest.fn((options?: ScrollToOptions | number) => {
      const top = typeof options === 'number' ? options : options?.top
      container.scrollTop = Number(top)
    })
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
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

    expect(container.scrollTop).toBe(500)
    const callsAfterInitialPin = scrollTo.mock.calls.length

    setScrollMetrics(container, 940)
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })
    setScrollMetrics(container, 980)
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })

    expect(container.scrollTop).toBe(500)

    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 170))
    })

    expect(container.scrollTop).toBe(580)
    expect(scrollTo).toHaveBeenCalledTimes(callsAfterInitialPin + 1)

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

    expect(container.scrollTop).toBe(500)

    setScrollMetrics(container, 960)
    act(() => {
      listeners.resize?.forEach(listener => listener(new Event('resize')))
    })
    expect(container.scrollTop).toBe(500)
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 170))
    })
    expect(container.scrollTop).toBe(560)

    setScrollMetrics(container, 990)
    act(() => {
      window.dispatchEvent(new Event('focusin'))
    })
    expect(container.scrollTop).toBe(560)
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 170))
    })
    expect(container.scrollTop).toBe(590)

    document.body.removeChild(container)
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  })

  it('uses a non-null cursor to expose the true first unread without marking the latest early', async () => {
    useFakeTimersWithImmediateRaf()
    const originalVisibilityState = document.visibilityState
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1600)
    setRect(container, 0, 400)

    const firstUnreadEl = document.createElement('div')
    firstUnreadEl.id = 'message-m3'
    firstUnreadEl.scrollIntoView = jest.fn()
    setRect(firstUnreadEl, 80, 160)
    container.appendChild(firstUnreadEl)

    const latestEl = document.createElement('div')
    latestEl.id = 'message-m5'
    setRect(latestEl, 920, 1000)
    container.appendChild(latestEl)

    const messages = [
      makeMessage('m1', 1),
      makeMessage('m2', 2),
      makeMessage('m3', 3),
      makeMessage('m4', 4),
      makeMessage('m5', 5),
    ]
    const onBeforeInitialJump = jest.fn()
    const onMarkReadToLatest = jest.fn()

    const { result } = renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages,
        loading: false,
        cursor: makeCursor('m2', 2),
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onBeforeInitialJump,
        onMarkReadToLatest,
      })
    )

    expect(window.requestAnimationFrame).toHaveBeenCalled()
    expect(result.current.firstUnreadMessageId).toBe('m3')
    expect(onBeforeInitialJump).toHaveBeenCalledWith(messages[2])
    await act(async () => {
      jest.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(onMarkReadToLatest).not.toHaveBeenCalled()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(onMarkReadToLatest).not.toHaveBeenCalled()

    document.body.removeChild(container)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: originalVisibilityState,
    })
  })

  it('does not mark the latest row read when the first unread DOM row is missing', async () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1200)
    setRect(container, 0, 400)

    const messages = [
      makeMessage('m1', 1),
      makeMessage('m2', 2),
      makeMessage('m3', 3),
    ]
    const onMarkReadToLatest = jest.fn()

    const { result } = renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages,
        loading: false,
        cursor: makeCursor('m1', 1),
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onMarkReadToLatest,
      })
    )

    expect(window.requestAnimationFrame).toHaveBeenCalled()
    expect(result.current.firstUnreadMessageId).toBe('m2')
    await act(async () => {
      jest.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(onMarkReadToLatest).not.toHaveBeenCalled()

    document.body.removeChild(container)
  })

  it('uses the oldest loaded unread row when the stored cursor predates the loaded window', async () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1800)
    setRect(container, 0, 400)

    const firstUnreadEl = document.createElement('div')
    firstUnreadEl.id = 'message-m22'
    firstUnreadEl.scrollIntoView = jest.fn()
    setRect(firstUnreadEl, 80, 160)
    container.appendChild(firstUnreadEl)

    const latestEl = document.createElement('div')
    latestEl.id = 'message-m23'
    setRect(latestEl, 920, 1000)
    container.appendChild(latestEl)

    const onBeforeInitialJump = jest.fn()

    const { result } = renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages: [makeMessage('m22', 22), makeMessage('m23', 23)],
        loading: false,
        cursor: makeCursor('m14', 14),
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onBeforeInitialJump,
        onMarkReadToLatest: jest.fn(),
      })
    )

    await waitFor(() => {
      expect(result.current.firstUnreadMessageId).toBe('m22')
    })
    expect(onBeforeInitialJump).toHaveBeenCalledWith(makeMessage('m22', 22))
    expect(firstUnreadEl.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })

    document.body.removeChild(container)
  })

  it('retries the first-unread jump when the target row mounts a frame late', () => {
    jest.useFakeTimers()
    const rafCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameMock = jest.fn((callback: FrameRequestCallback) => {
      rafCallbacks.push(callback)
      return rafCallbacks.length
    }) as typeof window.requestAnimationFrame
    window.requestAnimationFrame = requestAnimationFrameMock
    window.cancelAnimationFrame = jest.fn()
    global.requestAnimationFrame = requestAnimationFrameMock
    global.cancelAnimationFrame = window.cancelAnimationFrame

    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1600)
    setRect(container, 0, 400)

    const messages = [
      makeMessage('m1', 1),
      makeMessage('m2', 2),
      makeMessage('m3', 3),
      makeMessage('m4', 4),
      makeMessage('m5', 5),
    ]

    renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages,
        loading: false,
        cursor: makeCursor('m2', 2),
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onMarkReadToLatest: jest.fn(),
      })
    )

    act(() => {
      const initialAttempts = rafCallbacks.splice(0)
      expect(initialAttempts.length).toBeGreaterThan(0)
      initialAttempts.forEach(callback => callback(0))
    })
    expect(rafCallbacks.length).toBeGreaterThan(0)

    const firstUnreadEl = document.createElement('div')
    firstUnreadEl.id = 'message-m3'
    firstUnreadEl.scrollIntoView = jest.fn()
    setRect(firstUnreadEl, 80, 160)
    container.appendChild(firstUnreadEl)

    const latestEl = document.createElement('div')
    latestEl.id = 'message-m5'
    setRect(latestEl, 920, 1000)
    container.appendChild(latestEl)

    act(() => {
      const retryAttempts = rafCallbacks.splice(0)
      retryAttempts.forEach(callback => callback(16))
    })

    expect(firstUnreadEl.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' })

    document.body.removeChild(container)
  })

  it('uses mounted message rows for visible-read scans instead of querying every loaded message id', async () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1400)
    setRect(container, 0, 400)
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      value: 180,
      writable: true,
    })

    const visibleRow = document.createElement('div')
    visibleRow.dataset.messageId = 'm90'
    setRect(visibleRow, 120, 220)
    container.appendChild(visibleRow)

    const messages = Array.from({ length: 100 }, (_, index) => makeMessage(`m${index}`, index % 60))
    const getElementId = jest.fn((id: string) => `message-${id}`)

    const { result } = renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages,
        loading: true,
        cursor: null,
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId,
        onMarkReadToLatest: jest.fn(),
      })
    )

    act(() => {
      result.current.handleUnreadScroll()
    })

    await waitFor(() => {
      expect(result.current.lastObservedMessageId).toBe('m90')
    })
    expect(getElementId).not.toHaveBeenCalled()

    document.body.removeChild(container)
  })

  it('does not flush visible rows while the initial unread cursor is still loading', async () => {
    useFakeTimersWithImmediateRaf()
    const originalVisibilityState = document.visibilityState
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1400)
    setRect(container, 0, 400)
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      value: 1000,
      writable: true,
    })

    const messages = [
      makeMessage('m1', 1),
      makeMessage('m2', 2),
      makeMessage('m3', 3),
    ]

    messages.forEach((message, index) => {
      const row = document.createElement('div')
      row.id = `message-${message.id}`
      setRect(row, index === 2 ? 120 : 520, index === 2 ? 220 : 620)
      container.appendChild(row)
    })

    const onMarkReadToLatest = jest.fn()

    const { result } = renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages,
        loading: false,
        cursor: null,
        cursorLoading: true,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onMarkReadToLatest,
      })
    )

    act(() => {
      result.current.handleUnreadScroll()
    })

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      jest.runOnlyPendingTimers()
      await Promise.resolve()
    })

    expect(onMarkReadToLatest).not.toHaveBeenCalled()

    document.body.removeChild(container)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: originalVisibilityState,
    })
  })

  it('flushes page visibility changes to the last visible message candidate only after initial position resolves', async () => {
    const originalVisibilityState = document.visibilityState
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })

    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1400)
    setRect(container, 0, 400)
    Object.defineProperty(container, 'scrollTop', {
      configurable: true,
      value: 180,
      writable: true,
    })

    const messages = [
      makeMessage('m1', 1),
      makeMessage('m2', 2),
      makeMessage('m3', 3),
    ]

    messages.forEach((message, index) => {
      const row = document.createElement('div')
      row.id = `message-${message.id}`
      setRect(row, index === 0 ? -80 : index === 1 ? 120 : 520, index === 0 ? 20 : index === 1 ? 220 : 620)
      container.appendChild(row)
    })

    const onMarkReadToLatest = jest.fn()

    const { result } = renderHook(() =>
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
        onMarkReadToLatest,
      })
    )

    act(() => {
      result.current.handleUnreadScroll()
    })

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()
    })

    expect(onMarkReadToLatest).toHaveBeenCalledWith(messages[1])

    document.body.removeChild(container)
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: originalVisibilityState,
    })
  })
})

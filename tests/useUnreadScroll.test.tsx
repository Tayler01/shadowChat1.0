import { act, renderHook, waitFor } from '@testing-library/react'
import { useUnreadScroll } from '../src/hooks/useUnreadScroll'
import { MOBILE_VIEWPORT_UPDATED_EVENT } from '../src/lib/mobileViewport'
import { getSavedMessageScrollAnchor, saveMessageScrollAnchor } from '../src/lib/messageScrollAnchor'

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

  it('bottom-pins cached messages during reconnect after cursor state is known', async () => {
    const container = document.createElement('div')
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

    const onMarkReadToLatest = jest.fn()

    renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages: [makeMessage('m1', 1)],
        loading: true,
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

    await waitFor(() => expect(container.scrollTop).toBe(600))
    expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'auto' })
    expect(onMarkReadToLatest).not.toHaveBeenCalled()

    document.body.removeChild(container)
  })

  it('waits to bottom-pin cached messages while the initial cursor is still loading', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)

    const scrollTo = jest.fn()
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages: [makeMessage('m1', 1)],
        loading: true,
        cursor: null,
        cursorLoading: true,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onMarkReadToLatest: jest.fn(),
      })
    )

    expect(scrollTo).not.toHaveBeenCalled()

    document.body.removeChild(container)
  })

  it('does not bottom-pin cached reconnect content when a first unread target exists', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)

    const scrollTo = jest.fn()
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })

    renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages: [makeMessage('m1', 1), makeMessage('m2', 2)],
        loading: true,
        cursor: makeCursor('m1', 1),
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'general_chat:main',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        onMarkReadToLatest: jest.fn(),
      })
    )

    expect(scrollTo).not.toHaveBeenCalled()

    document.body.removeChild(container)
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
    expect(container.scrollTop).toBe(540)

    setScrollMetrics(container, 980)
    act(() => {
      resizeCallback?.([], {} as ResizeObserver)
    })

    expect(container.scrollTop).toBe(580)

    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 170))
    })

    expect(container.scrollTop).toBe(580)
    expect(scrollTo).toHaveBeenCalledTimes(callsAfterInitialPin + 2)

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
    expect(container.scrollTop).toBe(560)
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 170))
    })
    expect(container.scrollTop).toBe(560)

    setScrollMetrics(container, 990)
    act(() => {
      window.dispatchEvent(new Event('focusin'))
    })
    expect(container.scrollTop).toBe(590)
    await act(async () => {
      await new Promise(resolve => window.setTimeout(resolve, 170))
    })
    expect(container.scrollTop).toBe(590)

    setScrollMetrics(container, 1020)
    act(() => {
      window.dispatchEvent(new Event(MOBILE_VIEWPORT_UPDATED_EVENT))
    })
    expect(container.scrollTop).toBe(620)

    document.body.removeChild(container)
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: originalVisualViewport,
    })
  })

  it.each(['general_chat:main', 'dm:conversation', 'pin:image'])('hands %s to the first swipe before near-bottom events and delayed layout corrections', (surfaceKey) => {
    useFakeTimersWithImmediateRaf()
    let resizeCallback: ResizeObserverCallback | undefined
    global.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback }
      observe = jest.fn()
      disconnect = jest.fn()
    } as unknown as typeof ResizeObserver
    const container = document.createElement('div')
    const row = document.createElement('div')
    row.dataset.messageId = 'm1'
    row.id = 'message-m1'
    container.appendChild(row)
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)
    setRect(container, 0, 400)
    let rowTop = 700
    row.getBoundingClientRect = () => ({ top: rowTop - container.scrollTop, bottom: rowTop + 60 - container.scrollTop, height: 60 } as DOMRect)
    const scrollTo = jest.fn((options: ScrollToOptions) => { container.scrollTop = options.top ?? 0 })
    container.scrollTo = scrollTo as typeof container.scrollTo
    const onFollowingChange = jest.fn()
    const { result, rerender, unmount } = renderHook(({ messages }) => useUnreadScroll<TestMessage>({
      containerRef: { current: container }, messages, cursor: null, surfaceKey, readerId: `gesture-${surfaceKey}`,
      getMessageId: message => message.id, getMessageCreatedAt: message => message.created_at,
      getElementId: id => `message-${id}`, onMarkReadToLatest: jest.fn(),
      onFollowingChange,
    }), { initialProps: { messages: [makeMessage('m1', 1)] } })
    expect(container.scrollTop).toBe(600)
    act(() => resizeCallback?.([], {} as ResizeObserver)) // Arm a pending follow correction.
    scrollTo.mockClear()
    const touch = (type: string, y: number) => {
      const event = new Event(type)
      Object.defineProperty(event, 'touches', { value: [{ clientX: 120, clientY: y }] })
      container.dispatchEvent(event)
    }
    act(() => {
      touch('touchstart', 120)
      expect(onFollowingChange).toHaveBeenLastCalledWith(false)
      resizeCallback?.([], {} as ResizeObserver)
      result.current.handleUnreadScroll() // Browser reports the old bottom first.
    })
    expect(result.current.autoScroll).toBe(false)
    act(() => {
      touch('touchmove', 130)
      container.scrollTop = 596 // The first four pixels previously re-armed follow.
      result.current.handleUnreadScroll()
      rowTop += 30
      setScrollMetrics(container, 1030)
      resizeCallback?.([], {} as ResizeObserver)
      window.dispatchEvent(new Event(MOBILE_VIEWPORT_UPDATED_EVENT))
      window.dispatchEvent(new Event('focusin'))
      jest.advanceTimersByTime(800)
    })
    expect(container.scrollTop).toBe(596)
    expect(result.current.autoScroll).toBe(false)
    expect(scrollTo).not.toHaveBeenCalled()
    act(() => {
      touch('touchend', 130)
      container.scrollTop = 560 // Native momentum remains the owner after lift.
      result.current.handleUnreadScroll()
      resizeCallback?.([], {} as ResizeObserver)
    })
    expect(container.scrollTop).toBe(560)
    act(() => jest.advanceTimersByTime(180))
    act(() => {
      rowTop += 20
      setScrollMetrics(container, 1050)
      resizeCallback?.([], {} as ResizeObserver)
    })
    expect(container.scrollTop).toBe(580) // Stable reading anchor resumes after momentum.
    expect(getSavedMessageScrollAnchor(`gesture-${surfaceKey}`, surfaceKey)?.id).toBe('m1')
    act(() => { container.scrollTop = 649; result.current.handleUnreadScroll() })
    expect(result.current.autoScroll).toBe(true)
    expect(getSavedMessageScrollAnchor(`gesture-${surfaceKey}`, surfaceKey)).toBeNull()
    act(() => {
      setScrollMetrics(container, 1120)
      rerender({ messages: [makeMessage('m1', 1), makeMessage('m2', 2)] })
    })
    expect(container.scrollTop).toBe(720)
    unmount()
    container.remove()
  })

  it.each(['general_chat:main', 'dm:conversation', 'pin:image', 'general_chat_thread:root'])('leaves %s elastic bottom rebound to the browser without follow writes', (surfaceKey) => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)
    setRect(container, 0, 400)
    const scrollTo = jest.fn((options: ScrollToOptions) => { container.scrollTop = options.top ?? 0 })
    container.scrollTo = scrollTo as typeof container.scrollTo
    const containerRef = { current: container }
    const { result, rerender, unmount } = renderHook(({messages}) => useUnreadScroll<TestMessage>({
      containerRef, messages, cursor: null, surfaceKey,
      getMessageId: message => message.id, getMessageCreatedAt: message => message.created_at,
      getElementId: id => `message-${id}`, onMarkReadToLatest: jest.fn(),
    }), {initialProps: {messages: [makeMessage('m1', 1)]}})
    scrollTo.mockClear()
    // Safari can report an elastic position even when no touch events reached
    // the inner scrollport (for example an ancestor WebView rebound).
    act(() => {
      container.scrollTop = 640
      window.dispatchEvent(new Event(MOBILE_VIEWPORT_UPDATED_EVENT))
      jest.advanceTimersByTime(800)
    })
    expect(scrollTo).not.toHaveBeenCalled()
    expect(container.scrollTop).toBe(640)
    container.scrollTop = 600
    const touch = (type: string, y: number) => {
      const event = new Event(type)
      Object.defineProperty(event, 'touches', {value: type === 'touchend' ? [] : [{clientX: 120, clientY: y}]})
      container.dispatchEvent(event)
    }
    act(() => {
      touch('touchstart', 160)
      touch('touchmove', 144) // Pull toward the end while already at latest.
      container.scrollTop = 640
      result.current.handleUnreadScroll()
      window.dispatchEvent(new Event('resize'))
      window.dispatchEvent(new Event(MOBILE_VIEWPORT_UPDATED_EVENT))
      jest.advanceTimersByTime(800)
      touch('touchend', 144)
      jest.advanceTimersByTime(800) // Rebound can outlive the ordinary idle timer.
    })
    expect(scrollTo).not.toHaveBeenCalled()
    expect(container.scrollTop).toBe(640)
    expect(result.current.autoScroll).toBe(false)
    act(() => {
      container.scrollTop = 600 // The browser finishes its own rebound.
      result.current.handleUnreadScroll()
      jest.advanceTimersByTime(180)
    })
    expect(result.current.autoScroll).toBe(true)
    act(() => {
      setScrollMetrics(container, 1100)
      rerender({messages: [makeMessage('m1', 1), makeMessage('m2', 2)]})
    })
    expect(container.scrollTop).toBe(700)
    unmount()
    container.remove()
  })

  it('persists the visible anchor after upstream media changes during a swipe and restores it on return', () => {
    useFakeTimersWithImmediateRaf()
    let resizeCallback: ResizeObserverCallback | undefined
    global.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) { resizeCallback = callback }
      observe = jest.fn()
      disconnect = jest.fn()
    } as unknown as typeof ResizeObserver
    const container = document.createElement('div')
    const row = document.createElement('div')
    row.dataset.messageId = 'm1'
    row.id = 'message-m1'
    container.appendChild(row)
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)
    setRect(container, 0, 400)
    let rowTop = 700
    row.getBoundingClientRect = () => ({ top: rowTop - container.scrollTop, bottom: rowTop + 60 - container.scrollTop, height: 60 } as DOMRect)
    container.scrollTo = jest.fn((options: ScrollToOptions) => { container.scrollTop = options.top ?? 0 }) as typeof container.scrollTo
    const options = {
      containerRef: { current: container }, messages: [makeMessage('m1', 1)], cursor: null,
      surfaceKey: 'general_chat:media-return', readerId: 'media-return-reader',
      getMessageId: (message: TestMessage) => message.id, getMessageCreatedAt: (message: TestMessage) => message.created_at,
      getElementId: (id: string) => `message-${id}`, onMarkReadToLatest: jest.fn(),
    }
    const first = renderHook(() => useUnreadScroll<TestMessage>(options))
    const touch = (type: string, y: number) => {
      const event = new Event(type)
      Object.defineProperty(event, 'touches', { value: [{ clientX: 120, clientY: y }] })
      container.dispatchEvent(event)
    }
    act(() => {
      touch('touchstart', 120)
      touch('touchmove', 130)
      container.scrollTop = 595
      first.result.current.handleUnreadScroll()
      rowTop += 188
      setScrollMetrics(container, 1188)
      resizeCallback?.([], {} as ResizeObserver)
      touch('touchend', 130)
      jest.advanceTimersByTime(180)
    })
    expect(container.scrollTop).toBe(595)
    expect(getSavedMessageScrollAnchor(options.readerId, options.surfaceKey)?.offset).toBe(293)
    first.unmount()
    container.scrollTop = 0
    const reopened = renderHook(() => useUnreadScroll<TestMessage>(options))
    act(() => jest.advanceTimersByTime(180))
    expect(container.scrollTop).toBe(595)
    expect(row.getBoundingClientRect().top).toBe(293)
    reopened.unmount()
    saveMessageScrollAnchor(options.readerId, options.surfaceKey, null)
    container.remove()
  })

  it('binds user intent when a DM scrollport mounts after the enabled hook with a stable ref', () => {
    useFakeTimersWithImmediateRaf()
    const containerRef = { current: null as HTMLElement | null }
    const onFollowingChange = jest.fn()
    const options = {
      containerRef, messages: [makeMessage('m1', 1)], cursor: null, surfaceKey: 'dm:late-mount',
      getMessageId: (message: TestMessage) => message.id, getMessageCreatedAt: (message: TestMessage) => message.created_at,
      getElementId: (id: string) => `message-${id}`, onMarkReadToLatest: jest.fn(), onFollowingChange,
    }
    const { result, rerender, unmount } = renderHook(({element}) => useUnreadScroll<TestMessage>({...options, renderSignal: element}), {
      initialProps: {element: null as HTMLElement | null},
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)
    container.scrollTo = jest.fn((value: ScrollToOptions) => { container.scrollTop = value.top ?? 0 }) as typeof container.scrollTo
    act(() => {
      containerRef.current = container
      rerender({element: container})
    })
    act(() => result.current.scrollToBottom('auto'))
    act(() => container.dispatchEvent(new TouchEvent('touchstart')))
    expect(onFollowingChange).toHaveBeenLastCalledWith(false)
    act(() => {
      container.scrollTop = 595
      result.current.handleUnreadScroll()
      setScrollMetrics(container, 1095)
      window.dispatchEvent(new Event('focusin'))
      jest.advanceTimersByTime(800)
    })
    expect(result.current.autoScroll).toBe(false)
    expect(container.scrollTop).toBe(595)
    unmount()
    container.remove()
  })

  it('pauses wheel following immediately, preserves own-send jumps, and resumes after a tap', () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)
    container.scrollTo = jest.fn((options: ScrollToOptions) => { container.scrollTop = options.top ?? 0 }) as typeof container.scrollTo
    const { result, unmount } = renderHook(() => useUnreadScroll<TestMessage>({
      containerRef: { current: container }, messages: [makeMessage('m1', 1)], cursor: null, surfaceKey: 'surface',
      getMessageId: message => message.id, getMessageCreatedAt: message => message.created_at,
      getElementId: id => `message-${id}`, onMarkReadToLatest: jest.fn(),
    }))
    act(() => container.dispatchEvent(new WheelEvent('wheel', { deltaY: 20 })))
    expect(result.current.autoScroll).toBe(true)
    act(() => {
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: -4 }))
      container.scrollTop = 596
      result.current.handleUnreadScroll()
      result.current.scrollToBottomIfFollowing()
      jest.advanceTimersByTime(800)
    })
    expect(container.scrollTop).toBe(596)
    expect(result.current.autoScroll).toBe(false)
    act(() => result.current.scrollToBottom('auto'))
    expect(container.scrollTop).toBe(600)
    expect(result.current.autoScroll).toBe(true)
    act(() => {
      container.dispatchEvent(new TouchEvent('touchstart'))
      container.scrollTop = 620 // Safari may report rubber-band values beyond max.
      result.current.handleUnreadScroll()
    })
    expect(result.current.autoScroll).toBe(false)
    act(() => {
      container.scrollTop = 600
      container.dispatchEvent(new TouchEvent('touchend'))
    })
    expect(result.current.autoScroll).toBe(true)
    act(() => {
      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
      container.scrollTop = 596
      result.current.handleUnreadScroll()
      result.current.scrollToBottomIfFollowing()
    })
    expect(result.current.autoScroll).toBe(false)
    expect(container.scrollTop).toBe(596)
    unmount()
    container.remove()
  })

  it('presents a resolved empty conversation without acknowledging a nonexistent message', () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    const containerRef = {current: container}
    const markRead = jest.fn()
    const {result, rerender, unmount} = renderHook(({loading}) => useUnreadScroll<TestMessage>({
      containerRef, messages: [], loading, cursor: null, surfaceKey: 'dm:empty-ready',
      getMessageId: message => message.id, getMessageCreatedAt: message => message.created_at,
      getElementId: id => `message-${id}`, onMarkReadToLatest: markRead,
    }), {initialProps: {loading: true}})
    expect(result.current.initialPositionReady).toBe(false)
    rerender({loading: false})
    expect(result.current.initialPositionReady).toBe(true)
    expect(result.current.feedState).toBe('bottomPinned')
    act(() => jest.advanceTimersByTime(800))
    expect(markRead).not.toHaveBeenCalled()
    unmount()
  })

  it('resumes following the next append after a tap with no native scroll event', () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1000)
    container.scrollTo = jest.fn((options: ScrollToOptions) => { container.scrollTop = options.top ?? 0 }) as typeof container.scrollTo
    const containerRef = {current: container}
    const {result, rerender, unmount} = renderHook(({messages}) => useUnreadScroll<TestMessage>({
      containerRef, messages, cursor: null, surfaceKey: 'dm:tap-append',
      getMessageId: message => message.id, getMessageCreatedAt: message => message.created_at,
      getElementId: id => `message-${id}`, onMarkReadToLatest: jest.fn(),
    }), {initialProps: {messages: [makeMessage('m1', 1)]}})
    act(() => container.dispatchEvent(new TouchEvent('touchstart')))
    expect(result.current.autoScroll).toBe(false)
    act(() => container.dispatchEvent(new TouchEvent('touchend')))
    expect(result.current.autoScroll).toBe(true)
    act(() => {
      setScrollMetrics(container, 1100)
      rerender({messages: [makeMessage('m1', 1), makeMessage('m2', 2)]})
    })
    expect(container.scrollTop).toBe(700)
    unmount()
    container.remove()
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

  it('ignores stale explicit unread flags at or before the authoritative read cursor', async () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.appendChild(container)
    setScrollMetrics(container, 1200)
    setRect(container, 0, 400)

    const firstUnreadEl = document.createElement('div')
    firstUnreadEl.id = 'message-m3'
    firstUnreadEl.scrollIntoView = jest.fn()
    setRect(firstUnreadEl, 80, 160)
    container.appendChild(firstUnreadEl)

    const messages = [makeMessage('m1', 1), makeMessage('m2', 2), makeMessage('m3', 3)]
    const { result } = renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages,
        loading: false,
        cursor: makeCursor('m2', 2),
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'dm:conversation-1',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        getUnreadMessages: () => [messages[0], messages[2]],
        onMarkReadToLatest: jest.fn(),
      })
    )

    expect(result.current.firstUnreadMessageId).toBe('m3')
    expect(firstUnreadEl.scrollIntoView).not.toHaveBeenCalled()
    expect(result.current.feedState).toBe('layoutSettling')
    document.body.removeChild(container)
  })

  it('does not reopen old DM history when authoritative unread state is empty', async () => {
    const container = document.createElement('div')
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

    const { result } = renderHook(() =>
      useUnreadScroll<TestMessage>({
        containerRef: { current: container },
        messages: [makeMessage('m1', 1), makeMessage('m2', 2)],
        loading: false,
        cursor: makeCursor('m1', 1),
        cursorLoading: false,
        enabled: true,
        surfaceKey: 'dm:conversation-1',
        getMessageId: message => message.id,
        getMessageCreatedAt: message => message.created_at,
        getElementId: id => `message-${id}`,
        getUnreadMessages: () => [],
        onMarkReadToLatest: jest.fn(),
      })
    )

    await waitFor(() => expect(container.scrollTop).toBe(600))
    expect(result.current.firstUnreadMessageId).toBeNull()
    expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'auto' })
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
    expect(firstUnreadEl.scrollIntoView).not.toHaveBeenCalled()
    expect(result.current.feedState).toBe('layoutSettling')

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

    expect(firstUnreadEl.scrollIntoView).not.toHaveBeenCalled()

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

  it('does not read rows partly or fully hidden by the owning mobile composer', async () => {
    const surface = document.createElement('div')
    const container = document.createElement('div')
    const footer = document.createElement('div')
    footer.dataset.mobileChatFooter = 'true'
    surface.append(container, footer)
    document.body.append(surface)
    setScrollMetrics(container, 900)
    setRect(container, 0, 400)
    setRect(footer, 200, 400)
    const messages = [makeMessage('readable', 1), makeMessage('partial', 2), makeMessage('covered', 3)]
    const bounds = [[120, 180], [180, 280], [220, 320]]
    messages.forEach((message, index) => {
      const row = document.createElement('div')
      row.id = `message-${message.id}`
      row.dataset.messageId = message.id
      setRect(row, bounds[index][0], bounds[index][1])
      container.append(row)
    })
    const onMarkReadToLatest = jest.fn()
    const { result } = renderHook(() => useUnreadScroll<TestMessage>({
      containerRef: { current: container }, messages, cursor: null, surfaceKey: 'composer-occlusion',
      getMessageId: message => message.id, getMessageCreatedAt: message => message.created_at,
      getElementId: id => `message-${id}`, onMarkReadToLatest,
    }))

    await act(async () => { await result.current.markLatestRead(true) })
    expect(onMarkReadToLatest).toHaveBeenCalledWith(messages[0])
    expect(result.current.lastObservedMessageId).toBe('readable')

    setRect(footer, 100, 400)
    await act(async () => { await result.current.markLatestRead(true) })
    expect(onMarkReadToLatest).toHaveBeenCalledTimes(1)
    expect(result.current.lastObservedMessageId).toBeNull()
    surface.remove()
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
  it('regression: does not flush visible rows before an exact target and cursor resolve', async () => {
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
        initialMessageId: 'm1',
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
  it('resets on an account change and ignores the previous account read completion', async () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.append(container)
    setScrollMetrics(container, 1000, 200)
    setRect(container, 0, 200)
    const items = Array.from({ length: 6 }, (_, index) => makeMessage(`account-m${index}`, index))
    items.forEach((message, index) => {
      const row = document.createElement('div')
      row.id = `message-${message.id}`
      row.dataset.messageId = message.id
      row.getBoundingClientRect = () => ({ top: index * 100 - container.scrollTop, bottom: index * 100 + 100 - container.scrollTop, height: 100 }) as DOMRect
      container.append(row)
    })
    let resolveRead!: () => void
    const onRead = jest.fn(() => new Promise<void>(resolve => { resolveRead = resolve }))
    const { result, rerender } = renderHook(({ reader }) => useUnreadScroll<TestMessage>({
      containerRef: { current: container }, messages: items, cursor: makeCursor(reader === 'a' ? 'account-m0' : 'account-m3', reader === 'a' ? 0 : 3), readerId: reader,
      surfaceKey: 'account-reset', getMessageId: message => message.id, getMessageCreatedAt: message => message.created_at, getElementId: id => `message-${id}`, onMarkReadToLatest: onRead,
    }), { initialProps: { reader: 'a' } })
    act(() => jest.advanceTimersByTime(180))
    let reading!: Promise<void>
    act(() => { reading = result.current.markLatestRead(true) })
    expect(onRead).toHaveBeenCalledTimes(1)
    rerender({ reader: 'b' })
    act(() => jest.advanceTimersByTime(180))
    expect(result.current.firstUnreadMessageId).toBe('account-m4')
    await act(async () => { resolveRead(); await reading })
    expect(result.current.lastFlushedMessageId).toBeNull()
    expect(result.current.firstUnreadMessageId).toBe('account-m4')
    container.remove()
  })

  it('retries the same visible candidate after a failed cursor write', async () => {
    useFakeTimersWithImmediateRaf()
    const container = document.createElement('div')
    document.body.append(container)
    setScrollMetrics(container, 1000, 200)
    setRect(container, 0, 200)
    const message = makeMessage('retry-visible', 2)
    const row = document.createElement('div')
    row.id = 'message-retry-visible'
    row.dataset.messageId = message.id
    setRect(row, 0, 100)
    container.append(row)
    const onRead = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useUnreadScroll<TestMessage>({ containerRef: { current: container }, messages: [message], cursor: makeCursor('previous', 1), surfaceKey: 'retry-write', getMessageId: item => item.id, getMessageCreatedAt: item => item.created_at, getElementId: id => `message-${id}`, onMarkReadToLatest: onRead }))
    act(() => jest.advanceTimersByTime(180))
    await act(async () => { await expect(result.current.markLatestRead(true)).rejects.toThrow('offline') })
    await act(async () => { await result.current.markLatestRead(true) })
    expect(onRead).toHaveBeenCalledTimes(2)
    expect(result.current.lastFlushedMessageId).toBe(message.id)
    container.remove()
  })

})

import { computeMobileViewportState } from '../src/lib/mobileViewport'

describe('computeMobileViewportState', () => {
  it('keeps the iOS app frame stable while reserving the keyboard inset', () => {
    const state = computeMobileViewportState({
      layoutHeight: 852,
      visualViewportHeight: 512,
      visualViewportOffsetTop: 0,
      isIOS: true,
      editableFocused: true,
      previousStableAppHeight: 852,
    })

    expect(state.appHeight).toBe(852)
    expect(state.keyboardInset).toBe(340)
    expect(state.scrollKeyboardInset).toBe(340)
    expect(state.keyboardOpen).toBe(true)
  })

  it('lets non-iOS layouts follow the resized visual viewport', () => {
    const state = computeMobileViewportState({
      layoutHeight: 520,
      visualViewportHeight: 520,
      visualViewportOffsetTop: 0,
      isIOS: false,
      editableFocused: true,
      previousStableAppHeight: 852,
    })

    expect(state.appHeight).toBe(520)
    expect(state.keyboardInset).toBe(0)
    expect(state.scrollKeyboardInset).toBe(0)
    expect(state.keyboardOpen).toBe(false)
  })

  it('does not add Android keyboard height to chat scroller padding', () => {
    const state = computeMobileViewportState({
      layoutHeight: 852,
      visualViewportHeight: 512,
      visualViewportOffsetTop: 0,
      isIOS: false,
      editableFocused: true,
      previousStableAppHeight: 852,
    })

    expect(state.appHeight).toBe(512)
    expect(state.keyboardInset).toBe(340)
    expect(state.scrollKeyboardInset).toBe(0)
    expect(state.keyboardOpen).toBe(true)
  })

  it('keeps the iOS frame stable when innerHeight also shrinks with the keyboard', () => {
    const state = computeMobileViewportState({
      layoutHeight: 512,
      visualViewportHeight: 512,
      visualViewportOffsetTop: 0,
      isIOS: true,
      editableFocused: true,
      previousStableAppHeight: 852,
    })

    expect(state.appHeight).toBe(852)
    expect(state.keyboardInset).toBe(340)
    expect(state.scrollKeyboardInset).toBe(340)
    expect(state.keyboardOpen).toBe(true)
  })

  it('does not keep the footer lifted when the keyboard is no longer focused', () => {
    const state = computeMobileViewportState({
      layoutHeight: 852,
      visualViewportHeight: 512,
      visualViewportOffsetTop: 0,
      isIOS: true,
      editableFocused: false,
      previousStableAppHeight: 852,
    })

    expect(state.appHeight).toBe(852)
    expect(state.keyboardInset).toBe(0)
    expect(state.scrollKeyboardInset).toBe(0)
    expect(state.keyboardOpen).toBe(false)
  })

  it('keeps the app shell height stable during closed-keyboard iOS viewport jitter', () => {
    const state = computeMobileViewportState({
      layoutHeight: 852,
      visualViewportHeight: 790,
      visualViewportOffsetTop: 0,
      isIOS: true,
      editableFocused: false,
      previousStableAppHeight: 852,
    })

    expect(state.appHeight).toBe(852)
    expect(state.keyboardInset).toBe(0)
    expect(state.scrollKeyboardInset).toBe(0)
    expect(state.keyboardOpen).toBe(false)
  })

  it('keeps the app shell height stable during closed-keyboard Android viewport jitter', () => {
    const state = computeMobileViewportState({
      layoutHeight: 852,
      visualViewportHeight: 790,
      visualViewportOffsetTop: 0,
      isIOS: false,
      editableFocused: false,
      previousStableAppHeight: 852,
    })

    expect(state.appHeight).toBe(852)
    expect(state.keyboardInset).toBe(0)
    expect(state.scrollKeyboardInset).toBe(0)
    expect(state.keyboardOpen).toBe(false)
  })
})

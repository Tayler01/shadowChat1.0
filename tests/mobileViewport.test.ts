import { applyMobileViewportState, computeMobileViewportState, MOBILE_VIEWPORT_UPDATED_EVENT } from '../src/lib/mobileViewport'

describe('computeMobileViewportState', () => {
  it('publishes real keyboard transitions once while ignoring repeated settle measurements', () => {
    const root = document.createElement('div')
    const listener = jest.fn()
    window.addEventListener(MOBILE_VIEWPORT_UPDATED_EVENT, listener)
    const snapshot = {
      layoutHeight: 852, visualViewportHeight: 512, visualViewportOffsetTop: 0,
      isIOS: true, editableFocused: true, previousStableAppHeight: 852,
    }
    const state = computeMobileViewportState(snapshot)
    expect(applyMobileViewportState(root, state, 0)).toBe(true)
    expect(applyMobileViewportState(root, state, 0)).toBe(false)
    expect(applyMobileViewportState(root, state, 0)).toBe(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(applyMobileViewportState(root, computeMobileViewportState({ ...snapshot, editableFocused: false }), 0)).toBe(true)
    expect(root.dataset.shadowchatKeyboard).toBe('closed')
    expect(root.style.getPropertyValue('--shadowchat-keyboard-inset')).toBe('0px')
    expect(listener).toHaveBeenCalledTimes(2)
    window.removeEventListener(MOBILE_VIEWPORT_UPDATED_EVENT, listener)
  })
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

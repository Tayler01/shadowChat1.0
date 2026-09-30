const KEYBOARD_VIEWPORT_THRESHOLD_PX = 60
export const MOBILE_VIEWPORT_UPDATED_EVENT = 'shadowchat:mobile-viewport-updated'

interface MobileViewportSnapshot {
  layoutHeight: number
  visualViewportHeight: number
  visualViewportOffsetTop: number
  isIOS: boolean
  editableFocused: boolean
  previousStableAppHeight: number | null
}

export interface MobileViewportState {
  appHeight: number
  stableAppHeight: number
  visualViewportHeight: number
  keyboardInset: number
  scrollKeyboardInset: number
  keyboardOpen: boolean
  toastTopRem: number
  toastTopSpacePx: number
}

/** Publish measured changes only: settle timers must not restart scroll/layout work. */
export function applyMobileViewportState(root: HTMLElement, state: MobileViewportState, offsetTop: number): boolean {
  const properties: Record<string, string> = {
    '--shadowchat-app-height': `${state.appHeight}px`,
    '--shadowchat-visual-viewport-height': `${state.visualViewportHeight}px`,
    '--shadowchat-keyboard-inset': `${state.keyboardInset}px`,
    '--shadowchat-mobile-scroll-keyboard-inset': `${state.scrollKeyboardInset}px`,
    '--shadowchat-toast-top': `calc(${offsetTop}px + env(safe-area-inset-top) + ${state.toastTopRem}rem)`,
    '--shadowchat-toast-top-space': `${state.toastTopSpacePx}px`,
  }
  let changed = false
  for (const [name, value] of Object.entries(properties)) {
    if (root.style.getPropertyValue(name) === value) continue
    root.style.setProperty(name, value)
    changed = true
  }
  const keyboard = state.keyboardOpen ? 'open' : 'closed'
  if (root.dataset.shadowchatKeyboard !== keyboard) {
    root.dataset.shadowchatKeyboard = keyboard
    changed = true
  }
  if (changed) window.dispatchEvent(new Event(MOBILE_VIEWPORT_UPDATED_EVENT))
  return changed
}

export function computeMobileViewportState({
  layoutHeight,
  visualViewportHeight,
  visualViewportOffsetTop,
  isIOS,
  editableFocused,
  previousStableAppHeight,
}: MobileViewportSnapshot): MobileViewportState {
  const stableBaselineHeight = previousStableAppHeight ?? layoutHeight
  const viewportInsetFromLayout = Math.max(
    0,
    layoutHeight - visualViewportHeight - visualViewportOffsetTop
  )
  const viewportInsetFromStableFrame = Math.max(
    0,
    stableBaselineHeight - visualViewportHeight - visualViewportOffsetTop
  )
  const rawKeyboardInset = isIOS
    ? Math.max(viewportInsetFromLayout, viewportInsetFromStableFrame)
    : viewportInsetFromLayout
  const viewportCompressed =
    rawKeyboardInset > KEYBOARD_VIEWPORT_THRESHOLD_PX ||
    visualViewportHeight < (
      isIOS ? stableBaselineHeight : layoutHeight
    ) - KEYBOARD_VIEWPORT_THRESHOLD_PX
  const keyboardOpen = editableFocused && viewportCompressed
  const keyboardInset = keyboardOpen ? rawKeyboardInset : 0
  const scrollKeyboardInset = isIOS ? keyboardInset : 0
  const stableAppHeight = !previousStableAppHeight || !isIOS || !viewportCompressed
    ? layoutHeight
    : previousStableAppHeight
  const appHeight = keyboardOpen && !isIOS ? visualViewportHeight : stableAppHeight
  const toastTopRem = keyboardOpen ? 0.75 : 4.5

  return {
    appHeight,
    stableAppHeight,
    visualViewportHeight,
    keyboardInset,
    scrollKeyboardInset,
    keyboardOpen,
    toastTopRem,
    toastTopSpacePx: visualViewportOffsetTop + toastTopRem * 16,
  }
}

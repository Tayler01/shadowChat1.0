const KEYBOARD_VIEWPORT_THRESHOLD_PX = 60

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
  keyboardOpen: boolean
  toastTopRem: number
  toastTopSpacePx: number
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

  if (!isIOS) {
    const viewportCompressed =
      viewportInsetFromLayout > KEYBOARD_VIEWPORT_THRESHOLD_PX ||
      visualViewportHeight < layoutHeight - KEYBOARD_VIEWPORT_THRESHOLD_PX
    const keyboardOpen = editableFocused && viewportCompressed
    const toastTopRem = keyboardOpen ? 0.75 : 4.5

    return {
      appHeight: visualViewportHeight,
      stableAppHeight: layoutHeight,
      visualViewportHeight,
      keyboardInset: 0,
      keyboardOpen,
      toastTopRem,
      toastTopSpacePx: visualViewportOffsetTop + toastTopRem * 16,
    }
  }

  const rawKeyboardInset = Math.max(viewportInsetFromLayout, viewportInsetFromStableFrame)
  const viewportCompressed =
    rawKeyboardInset > KEYBOARD_VIEWPORT_THRESHOLD_PX ||
    visualViewportHeight < stableBaselineHeight - KEYBOARD_VIEWPORT_THRESHOLD_PX
  const keyboardOpen = editableFocused && viewportCompressed
  const keyboardInset = keyboardOpen ? rawKeyboardInset : 0
  const stableAppHeight = !previousStableAppHeight || !viewportCompressed
    ? layoutHeight
    : previousStableAppHeight
  const appHeight = isIOS && viewportCompressed ? stableAppHeight : visualViewportHeight
  const toastTopRem = keyboardOpen ? 0.75 : 4.5

  return {
    appHeight,
    stableAppHeight,
    visualViewportHeight,
    keyboardInset,
    keyboardOpen,
    toastTopRem,
    toastTopSpacePx: visualViewportOffsetTop + toastTopRem * 16,
  }
}

import { useLayoutEffect, useRef } from 'react'
import { computeMobileViewportState, MOBILE_VIEWPORT_UPDATED_EVENT } from '../lib/mobileViewport'

// Keep the existing full-app viewport contract for shared chat/footer components.
export function useStreamlinedViewport(isDesktop: boolean) {
  const mobileAppHeightRef = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || isDesktop) return

    const root = document.documentElement
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const isIOS =
      /iPad|iPhone|iPod/.test(nav.userAgent) ||
      (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
    let frameId: number | null = null
    let settleTimerIds: number[] = []
    root.dataset.shadowchatMobilePlatform = isIOS ? 'ios' : 'android'

    const isEditableFocused = () => {
      const activeElement = document.activeElement
      return (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      )
    }

    const updateMobileViewport = () => {
      const viewport = window.visualViewport
      const layoutHeight = window.innerHeight
      const viewportHeight = viewport?.height ?? window.innerHeight
      const viewportOffsetTop = viewport?.offsetTop ?? 0
      const viewportState = computeMobileViewportState({
        layoutHeight,
        visualViewportHeight: viewportHeight,
        visualViewportOffsetTop: viewportOffsetTop,
        isIOS,
        editableFocused: isEditableFocused(),
        previousStableAppHeight: mobileAppHeightRef.current,
      })
      mobileAppHeightRef.current = viewportState.stableAppHeight

      root.style.setProperty('--shadowchat-app-height', `${viewportState.appHeight}px`)
      root.style.setProperty('--shadowchat-visual-viewport-height', `${viewportState.visualViewportHeight}px`)
      root.style.setProperty('--shadowchat-keyboard-inset', `${viewportState.keyboardInset}px`)
      root.style.setProperty('--shadowchat-mobile-scroll-keyboard-inset', `${viewportState.scrollKeyboardInset}px`)
      root.style.setProperty('--shadowchat-toast-top', `calc(${viewportOffsetTop}px + env(safe-area-inset-top) + ${viewportState.toastTopRem}rem)`)
      root.style.setProperty('--shadowchat-toast-top-space', `${viewportState.toastTopSpacePx}px`)
      root.dataset.shadowchatKeyboard = viewportState.keyboardOpen ? 'open' : 'closed'
      window.dispatchEvent(new Event(MOBILE_VIEWPORT_UPDATED_EVENT))
    }

    const scheduleMobileViewportUpdate = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      settleTimerIds.forEach(timerId => window.clearTimeout(timerId))
      settleTimerIds = []

      frameId = requestAnimationFrame(() => {
        frameId = null
        updateMobileViewport()
        settleTimerIds = [80, 180, 320].map(delay =>
          window.setTimeout(updateMobileViewport, delay)
        )
      })
    }

    scheduleMobileViewportUpdate()
    const handleOrientationChange = () => {
      mobileAppHeightRef.current = null
      scheduleMobileViewportUpdate()
    }

    window.visualViewport?.addEventListener('resize', scheduleMobileViewportUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleMobileViewportUpdate)
    window.addEventListener('resize', scheduleMobileViewportUpdate)
    window.addEventListener('orientationchange', handleOrientationChange)
    window.addEventListener('focusin', scheduleMobileViewportUpdate)
    window.addEventListener('focusout', scheduleMobileViewportUpdate)
    window.addEventListener('pageshow', scheduleMobileViewportUpdate)

    return () => {
      window.visualViewport?.removeEventListener('resize', scheduleMobileViewportUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleMobileViewportUpdate)
      window.removeEventListener('resize', scheduleMobileViewportUpdate)
      window.removeEventListener('orientationchange', handleOrientationChange)
      window.removeEventListener('focusin', scheduleMobileViewportUpdate)
      window.removeEventListener('focusout', scheduleMobileViewportUpdate)
      window.removeEventListener('pageshow', scheduleMobileViewportUpdate)
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      settleTimerIds.forEach(timerId => window.clearTimeout(timerId))
      root.style.removeProperty('--shadowchat-visual-viewport-height')
      root.style.removeProperty('--shadowchat-app-height')
      root.style.removeProperty('--shadowchat-keyboard-inset')
      root.style.removeProperty('--shadowchat-mobile-scroll-keyboard-inset')
      root.style.removeProperty('--shadowchat-toast-top')
      root.style.removeProperty('--shadowchat-toast-top-space')
      delete root.dataset.shadowchatKeyboard
      delete root.dataset.shadowchatMobilePlatform
    }
  }, [isDesktop])
}

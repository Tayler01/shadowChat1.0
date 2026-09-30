import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { useIsDesktop } from './useIsDesktop'

/** Explicit dismissal also fences late send completions from reopening input. */
export function useComposerKeyboardDismiss(fieldRef: RefObject<HTMLTextAreaElement | null>) {
  const isDesktop = useIsDesktop()
  const [focused, setFocused] = useState(false)
  const focusIntentRef = useRef(0)
  const gestureRef = useRef<{ id: number; x: number; y: number; moved: boolean; dismissed: boolean } | null>(null)
  const removeTouchListenersRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const handleFocus = (event: FocusEvent) => {
      if (event.target === fieldRef.current) setFocused(true)
    }
    const handleBlur = (event: FocusEvent) => {
      if (event.target !== fieldRef.current) return
      focusIntentRef.current += 1
      setFocused(false)
    }
    document.addEventListener('focusin', handleFocus)
    document.addEventListener('focusout', handleBlur)
    return () => {
      document.removeEventListener('focusin', handleFocus)
      document.removeEventListener('focusout', handleBlur)
    }
  }, [fieldRef])

  const dismissKeyboard = useCallback(() => {
    focusIntentRef.current += 1
    fieldRef.current?.blur()
    setFocused(false)
  }, [fieldRef])

  const beginGesture = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    gestureRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, dismissed: false }
    // Capture prevents leaving the small handle from turning a swipe into a tap.
    // It does not stop Safari's native pan; the handle's touch listener below does.
    event.stopPropagation()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic events or detached buttons. */ }
  }, [])

  const updateGesture = useCallback((gesture: NonNullable<typeof gestureRef.current>, x: number, y: number) => {
    const dx = x - gesture.x
    const dy = y - gesture.y
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) gesture.moved = true
    if (!gesture.dismissed && dy >= 28 && dy > Math.abs(dx) * 1.2) {
      gesture.dismissed = true
      dismissKeyboard()
    }
    return gesture.moved
  }, [dismissKeyboard])

  const moveGesture = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.id !== event.pointerId) return false
    event.preventDefault()
    event.stopPropagation()
    return updateGesture(gesture, event.clientX, event.clientY)
  }, [updateGesture])

  // React delegates touch listeners passively. preventDefault on a React
  // onTouchStart cannot reliably claim this gesture in iOS Safari/WKWebView.
  // Fence native moves on this bounded handle only, including after blur moves
  // the footer. Text selection and scrolling everywhere else keep their defaults.
  const gestureHandleRef = useCallback((handle: HTMLButtonElement | null) => {
    removeTouchListenersRef.current?.()
    removeTouchListenersRef.current = null
    if (!handle || isDesktop) return
    let touchGesture: { identifier: number; gesture: NonNullable<typeof gestureRef.current> } | null = null
    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) return
      const touch = event.touches[0]
      const gesture = gestureRef.current ?? { id: -1, x: touch.clientX, y: touch.clientY, moved: false, dismissed: false }
      gestureRef.current = gesture
      touchGesture = { identifier: touch.identifier, gesture }
      event.stopPropagation()
    }
    const move = (event: TouchEvent) => {
      if (!touchGesture) return
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
      if (event.touches.length !== 1) {
        touchGesture.gesture.moved = true
        return
      }
      const touch = Array.from(event.touches).find(item => item.identifier === touchGesture?.identifier)
      if (touch) updateGesture(touchGesture.gesture, touch.clientX, touch.clientY)
    }
    const end = (event: TouchEvent) => {
      if (!touchGesture) return
      if (touchGesture.gesture.moved && event.cancelable) event.preventDefault()
      event.stopPropagation()
      // pointerup owns send/Hype. A touch-only cancellation must never send.
      if (gestureRef.current === touchGesture.gesture && touchGesture.gesture.id === -1) gestureRef.current = null
      touchGesture = null
    }
    handle.addEventListener('touchstart', start, { passive: true })
    handle.addEventListener('touchmove', move, { passive: false })
    handle.addEventListener('touchend', end, { passive: false })
    handle.addEventListener('touchcancel', end, { passive: false })
    removeTouchListenersRef.current = () => {
      handle.removeEventListener('touchstart', start)
      handle.removeEventListener('touchmove', move)
      handle.removeEventListener('touchend', end)
      handle.removeEventListener('touchcancel', end)
    }
  }, [isDesktop, updateGesture])

  const endGesture = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    gestureRef.current = null
    event.stopPropagation()
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* No active capture. */ }
    return Boolean(gesture && gesture.id === event.pointerId && gesture.moved)
  }, [])

  const cancelGesture = useCallback(() => { gestureRef.current = null }, [])

  return { keyboardVisible: focused && !isDesktop, dismissKeyboard, focusIntentRef, gestureHandleRef, beginGesture, moveGesture, endGesture, cancelGesture }
}

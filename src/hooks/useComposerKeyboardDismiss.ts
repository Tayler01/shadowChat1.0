import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { useIsDesktop } from './useIsDesktop'

/** Explicit dismissal also fences late send completions from reopening input. */
export function useComposerKeyboardDismiss(fieldRef: RefObject<HTMLTextAreaElement | null>) {
  const isDesktop = useIsDesktop()
  const [focused, setFocused] = useState(false)
  const focusIntentRef = useRef(0)
  const gestureRef = useRef<{ id: number; x: number; y: number; moved: boolean; dismissed: boolean } | null>(null)

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
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic events or detached buttons. */ }
  }, [])

  const moveGesture = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.id !== event.pointerId) return false
    const dx = event.clientX - gesture.x
    const dy = event.clientY - gesture.y
    if (Math.abs(dx) > 12 || Math.abs(dy) > 12) gesture.moved = true
    if (!gesture.dismissed && dy >= 28 && dy > Math.abs(dx) * 1.2) {
      gesture.dismissed = true
      dismissKeyboard()
    }
    return gesture.moved
  }, [dismissKeyboard])

  const endGesture = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current
    gestureRef.current = null
    try { event.currentTarget.releasePointerCapture(event.pointerId) } catch { /* No active capture. */ }
    return Boolean(gesture && gesture.id === event.pointerId && gesture.moved)
  }, [])

  const cancelGesture = useCallback(() => { gestureRef.current = null }, [])

  return { keyboardVisible: focused && !isDesktop, dismissKeyboard, focusIntentRef, beginGesture, moveGesture, endGesture, cancelGesture }
}

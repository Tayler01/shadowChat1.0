import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

let bodyScrollLockDepth = 0
let bodyOverflowBeforeLock = ''

const lockBodyScroll = () => {
  if (bodyScrollLockDepth === 0) {
    bodyOverflowBeforeLock = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  bodyScrollLockDepth += 1
}

const unlockBodyScroll = () => {
  bodyScrollLockDepth = Math.max(0, bodyScrollLockDepth - 1)
  if (bodyScrollLockDepth === 0) {
    document.body.style.overflow = bodyOverflowBeforeLock
    bodyOverflowBeforeLock = ''
  }
}

const getFocusableElements = (root: HTMLElement) => Array.from(
  root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
).filter(element => (
  !element.hidden &&
  element.getAttribute('aria-hidden') !== 'true' &&
  element.getAttribute('tabindex') !== '-1'
))

type DialogAccessibilityOptions<TElement extends HTMLElement> = {
  open: boolean
  onClose: () => void
  dismissible?: boolean
  initialFocusRef?: RefObject<HTMLElement>
  dialogRef?: RefObject<TElement>
  lockScroll?: boolean
  restoreFocus?: boolean
}

export function useDialogAccessibility<TElement extends HTMLElement = HTMLDivElement>({
  open,
  onClose,
  dismissible = true,
  initialFocusRef,
  dialogRef: providedDialogRef,
  lockScroll = true,
  restoreFocus = true,
}: DialogAccessibilityOptions<TElement>) {
  const internalDialogRef = useRef<TElement>(null)
  const dialogRef = providedDialogRef ?? internalDialogRef
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  const initialFocusRefRef = useRef(initialFocusRef)
  const restoreFocusRef = useRef(restoreFocus)

  onCloseRef.current = onClose
  dismissibleRef.current = dismissible
  initialFocusRefRef.current = initialFocusRef
  restoreFocusRef.current = restoreFocus

  useEffect(() => {
    if (!open || typeof document === 'undefined') return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    if (lockScroll) {
      lockBodyScroll()
    }

    const focusFrame = window.requestAnimationFrame(() => {
      const root = dialogRef.current
      if (!root) return
      const target = initialFocusRefRef.current?.current ?? getFocusableElements(root)[0] ?? root
      if (target === root && root.tabIndex < 0) {
        root.tabIndex = -1
      }
      target.focus({ preventScroll: true })
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      const root = dialogRef.current
      if (!root) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (dismissibleRef.current) {
          onCloseRef.current()
        }
        return
      }

      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(root)
      if (focusable.length === 0) {
        event.preventDefault()
        root.focus({ preventScroll: true })
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (!root.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus({ preventScroll: true })
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown, true)
      if (lockScroll) {
        unlockBodyScroll()
      }
      if (restoreFocusRef.current && previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [dialogRef, lockScroll, open, restoreFocus])

  return dialogRef
}

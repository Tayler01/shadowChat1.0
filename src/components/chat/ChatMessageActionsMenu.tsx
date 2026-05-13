import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'

export type ChatMessageAction = {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  onSelect: () => void | Promise<void>
  tone?: 'default' | 'danger'
  hidden?: boolean
}

type ChatMessageActionsMenuProps = {
  actions: ChatMessageAction[]
  containerRef?: React.RefObject<HTMLElement>
  className?: string
  buttonClassName?: string
  menuLabel?: string
  buttonLabel?: string
  onOpenChange?: (open: boolean) => void
}

type MenuPlacement = {
  top: number
  left: number
  maxHeight: number
}

const getRootPixelValue = (name: string) => {
  if (typeof window === 'undefined') return 0
  const value = Number.parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue(name)
  )
  return Number.isFinite(value) ? value : 0
}

const getVisibleSurfaceTop = (selector: string) => {
  if (typeof document === 'undefined') return undefined

  const tops = Array.from(document.querySelectorAll<HTMLElement>(selector))
    .map(element => element.getBoundingClientRect())
    .filter(rect =>
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight
    )
    .map(rect => rect.top)

  return tops.length ? Math.min(...tops) : undefined
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max))

const toDocumentRect = (rect: DOMRect, viewport: VisualViewport | null) => {
  const offsetTop = viewport?.offsetTop ?? 0
  const offsetLeft = viewport?.offsetLeft ?? 0

  return {
    top: rect.top + offsetTop,
    bottom: rect.bottom + offsetTop,
    left: rect.left + offsetLeft,
    right: rect.right + offsetLeft,
    width: rect.width,
    height: rect.height,
  }
}

export function ChatMessageActionsMenu({
  actions,
  containerRef,
  className,
  buttonClassName,
  menuLabel = 'Message options',
  buttonLabel = 'Message actions',
  onOpenChange,
}: ChatMessageActionsMenuProps) {
  const visibleActions = actions.filter(action => !action.hidden)
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<MenuPlacement | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const setMenuOpen = useCallback((nextOpen: boolean | ((current: boolean) => boolean)) => {
    setOpen(current => {
      const resolved = typeof nextOpen === 'function' ? nextOpen(current) : nextOpen
      onOpenChange?.(resolved)
      return resolved
    })
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return

    const handleClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        if (!menuRef.current || !menuRef.current.contains(event.target as Node)) {
          setMenuOpen(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, setMenuOpen])

  const updatePlacement = useCallback(() => {
    if (!open) return

    const btnRect = rootRef.current?.getBoundingClientRect()
    const containerRect = containerRef?.current?.getBoundingClientRect()

    if (!btnRect || !menuRef.current || typeof window === 'undefined') return

    const viewport = window.visualViewport ?? null
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
    const viewportLeft = viewport?.offsetLeft ?? 0
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth)
    const buttonBox = toDocumentRect(btnRect, viewport)
    const containerBox = containerRect ? toDocumentRect(containerRect, viewport) : undefined
    const mobileFooterRect = window.innerWidth < 768
      ? document.querySelector('[data-mobile-chat-footer="true"]')?.getBoundingClientRect()
      : undefined
    const mobileFooterTop = mobileFooterRect
      ? toDocumentRect(mobileFooterRect, viewport).top
      : undefined
    const composerTop = window.innerWidth < 768
      ? getVisibleSurfaceTop('[data-message-composer-surface="true"]')
      : undefined
    const keyboardAwareFooterTop = (() => {
      if (window.innerWidth >= 768) return undefined
      const keyboardInset = getRootPixelValue('--shadowchat-keyboard-inset')
      const footerHeight = getRootPixelValue('--shadowchat-mobile-chat-footer-height')
      if (keyboardInset <= 0 || footerHeight <= 0) return undefined
      return window.innerHeight - keyboardInset - footerHeight
    })()
    const safeGap = 12
    const visibleTop = Math.max(viewportTop, containerBox?.top ?? viewportTop)
    const visibleBottom = Math.min(
      viewportBottom,
      containerBox?.bottom ?? viewportBottom,
      mobileFooterTop ?? viewportBottom,
      composerTop ?? viewportBottom,
      keyboardAwareFooterTop ?? viewportBottom
    )
    const menuHeight = menuRef.current.scrollHeight || Math.max(96, visibleActions.length * 42 + 16)
    const menuWidth = menuRef.current.offsetWidth || 180
    const availableViewportHeight = Math.max(96, visibleBottom - visibleTop - safeGap * 2)

    const spaceBelow = Math.max(0, visibleBottom - buttonBox.bottom - safeGap)
    const spaceAbove = Math.max(0, buttonBox.top - visibleTop - safeGap)
    const wouldOverlapBottomBoundary = buttonBox.bottom + menuHeight + safeGap > visibleBottom
    const shouldOpenUp =
      (spaceBelow < menuHeight || wouldOverlapBottomBoundary) &&
      spaceAbove >= Math.min(menuHeight, 96)
    const maxHeight = Math.floor(Math.min(360, Math.max(96, shouldOpenUp ? spaceAbove : spaceBelow, availableViewportHeight)))
    const desiredTop = shouldOpenUp
      ? buttonBox.top - menuHeight - safeGap
      : buttonBox.bottom + safeGap
    const top = clamp(
      desiredTop,
      visibleTop + safeGap,
      Math.max(visibleTop + safeGap, visibleBottom - Math.min(menuHeight, maxHeight) - safeGap)
    )

    const left = clamp(
      buttonBox.right - menuWidth,
      viewportLeft + safeGap,
      Math.max(viewportLeft + safeGap, viewportRight - menuWidth - safeGap)
    )

    setPlacement({ top, left, maxHeight })
  }, [containerRef, open, visibleActions.length])

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }

    updatePlacement()
  }, [open, updatePlacement])

  useEffect(() => {
    if (!open) return

    let frameId: number | null = null
    const schedulePlacement = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      frameId = requestAnimationFrame(updatePlacement)
    }

    const settleTimers = [80, 180, 320].map(delay => window.setTimeout(schedulePlacement, delay))
    const scrollContainer = containerRef?.current

    window.addEventListener('resize', schedulePlacement)
    window.addEventListener('scroll', schedulePlacement, true)
    window.addEventListener('focusin', schedulePlacement)
    window.visualViewport?.addEventListener?.('resize', schedulePlacement)
    window.visualViewport?.addEventListener?.('scroll', schedulePlacement)
    scrollContainer?.addEventListener('scroll', schedulePlacement)

    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      settleTimers.forEach(timer => window.clearTimeout(timer))
      window.removeEventListener('resize', schedulePlacement)
      window.removeEventListener('scroll', schedulePlacement, true)
      window.removeEventListener('focusin', schedulePlacement)
      window.visualViewport?.removeEventListener?.('resize', schedulePlacement)
      window.visualViewport?.removeEventListener?.('scroll', schedulePlacement)
      scrollContainer?.removeEventListener('scroll', schedulePlacement)
    }
  }, [containerRef, open, updatePlacement])

  if (!visibleActions.length) return null

  return (
    <div className={cn('relative inline-flex', className)} ref={rootRef}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setMenuOpen(current => !current)}
        onPointerDown={event => event.preventDefault()}
        onMouseDown={event => event.preventDefault()}
        className={cn(
          'h-8 w-8 p-0 opacity-70 transition-opacity hover:opacity-100 hover:text-[var(--text-gold)]',
          buttonClassName
        )}
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        type="button"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <div
              className={cn(
                'fixed z-[90] p-2',
                !placement && 'pointer-events-none invisible'
              )}
              ref={menuRef}
              role="menu"
              aria-label={menuLabel}
              data-testid="message-actions-menu"
              style={{
                top: placement?.top ?? 0,
                left: placement?.left ?? 0,
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="glass-panel-strong z-50 min-w-[160px] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] py-1"
                style={{ maxHeight: placement?.maxHeight }}
              >
                {visibleActions.map(action => {
                  const Icon = action.icon
                  return (
                    <button
                      key={action.id}
                      onClick={() => {
                        void action.onSelect()
                        setMenuOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center space-x-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgba(255,255,255,0.05)]',
                        action.tone === 'danger'
                          ? 'text-red-300 hover:text-red-100'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      )}
                      type="button"
                      role="menuitem"
                    >
                      <Icon className="h-4 w-4" />
                      <span>{action.label}</span>
                    </button>
                  )
                })}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  )
}

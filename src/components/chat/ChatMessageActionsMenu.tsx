import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const [openAbove, setOpenAbove] = useState(false)
  const [openRight, setOpenRight] = useState(false)
  const [placementReady, setPlacementReady] = useState(false)
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | undefined>(undefined)
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
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, setMenuOpen])

  useLayoutEffect(() => {
    if (!open) {
      setPlacementReady(false)
      return
    }

    const btnRect = rootRef.current?.getBoundingClientRect()
    const containerRect = containerRef?.current?.getBoundingClientRect()

    if (!btnRect || !menuRef.current) return

    const viewport = window.visualViewport
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight)
    const viewportLeft = viewport?.offsetLeft ?? 0
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth)
    const mobileFooterRect = window.innerWidth < 768
      ? document.querySelector('[data-mobile-chat-footer="true"]')?.getBoundingClientRect()
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
    const visibleTop = Math.max(viewportTop, containerRect?.top ?? viewportTop)
    const visibleBottom = Math.min(
      viewportBottom,
      containerRect?.bottom ?? viewportBottom,
      mobileFooterRect?.top ?? viewportBottom,
      composerTop ?? viewportBottom,
      keyboardAwareFooterTop ?? viewportBottom
    )
    const menuHeight = menuRef.current.scrollHeight
    const menuWidth = menuRef.current.offsetWidth

    const spaceBelow = Math.max(0, visibleBottom - btnRect.bottom - safeGap)
    const spaceAbove = Math.max(0, btnRect.top - visibleTop - safeGap)
    const wouldOverlapComposer =
      composerTop !== undefined &&
      btnRect.bottom + menuHeight + safeGap > composerTop
    const shouldOpenUp =
      (spaceBelow < menuHeight || wouldOverlapComposer) &&
      spaceAbove >= Math.min(menuHeight, 96)
    const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow

    setOpenAbove(shouldOpenUp)
    setMenuMaxHeight(Math.floor(Math.min(360, Math.max(96, availableSpace))))

    const desktopSidebarWidth = window.innerWidth >= 768 ? 256 : 0
    const safeLeft = Math.max(viewportLeft + safeGap, desktopSidebarWidth)
    const rightAlignedLeft = btnRect.right - menuWidth
    const canOpenRight = btnRect.right + menuWidth + safeGap <= viewportRight

    setOpenRight(rightAlignedLeft < safeLeft && canOpenRight)
    setPlacementReady(true)
  }, [containerRef, open])

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

      <AnimatePresence>
        {open && (
          <div
            className={cn(
              'absolute z-50 -m-2 p-2',
              openAbove ? 'bottom-full mb-1' : 'top-full mt-1',
              openRight ? 'left-full ml-2' : 'right-0',
              !placementReady && 'invisible pointer-events-none'
            )}
            ref={menuRef}
            role="menu"
            aria-label={menuLabel}
            data-testid="message-actions-menu"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel-strong z-50 min-w-[160px] overflow-y-auto overscroll-contain rounded-[var(--radius-md)] py-1"
              style={{ maxHeight: menuMaxHeight }}
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
      </AnimatePresence>
    </div>
  )
}

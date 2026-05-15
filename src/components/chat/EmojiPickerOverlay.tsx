import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { EmojiClickData } from '../../types'
import { useEmojiPicker } from '../../hooks/useEmojiPicker'
import { Button } from '../ui/Button'

type EmojiPickerOverlayProps = {
  open: boolean
  title: string
  ariaLabel: string
  onClose: () => void
  onEmojiClick: (emojiData: EmojiClickData) => void
  desktopClassName: string
  width?: number
  height?: number
  autoFocusSearch?: boolean
}

const isPhoneViewport = () =>
  typeof window !== 'undefined' && window.innerWidth < 768

const usePhoneViewport = () => {
  const [phoneViewport, setPhoneViewport] = useState(isPhoneViewport)

  useEffect(() => {
    const update = () => setPhoneViewport(isPhoneViewport())

    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener?.('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener?.('resize', update)
    }
  }, [])

  return phoneViewport
}

const getEmojiPickerTheme = () =>
  typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light'

const focusEmojiSearch = (root: HTMLElement | null) => {
  if (!root) return

  const input = Array.from(root.querySelectorAll('input')).find(candidate => {
    const label = `${candidate.getAttribute('aria-label') || ''} ${candidate.placeholder || ''} ${candidate.type || ''}`
    return /search/i.test(label)
  })

  input?.focus({ preventScroll: true })
}

export function EmojiPickerOverlay({
  open,
  title,
  ariaLabel,
  onClose,
  onEmojiClick,
  desktopClassName,
  width = 300,
  height = 360,
  autoFocusSearch = true,
}: EmojiPickerOverlayProps) {
  const EmojiPicker = useEmojiPicker(open)
  const phoneViewport = usePhoneViewport()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!phoneViewport && rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [onClose, open, phoneViewport])

  useEffect(() => {
    if (!open || !autoFocusSearch) return

    const retryDelays = phoneViewport ? [80, 240, 520] : [80]
    const timeoutIds: number[] = []
    const frame = window.requestAnimationFrame(() => {
      focusEmojiSearch(rootRef.current)
      retryDelays.forEach(delay => {
        timeoutIds.push(window.setTimeout(() => focusEmojiSearch(rootRef.current), delay))
      })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      timeoutIds.forEach(timeoutId => window.clearTimeout(timeoutId))
    }
  }, [autoFocusSearch, open, phoneViewport])

  if (!open || !EmojiPicker) return null

  if (phoneViewport && typeof document !== 'undefined') {
    return createPortal(
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        data-emoji-picker-overlay="true"
        className="fixed inset-0 z-[120] flex flex-col bg-[linear-gradient(180deg,rgb(18,19,20),rgb(5,6,8))] pt-[calc(env(safe-area-inset-top)_+_0.65rem)] text-[var(--text-primary)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-panel)] px-3 pb-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">Search and pick</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 rounded-[var(--radius-sm)] p-0"
            onClick={onClose}
            aria-label={`Close ${ariaLabel}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 px-2 pb-[calc(env(safe-area-inset-bottom)_+_0.75rem)] pt-2">
          <div className="h-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-panel)] bg-[var(--bg-panel)] shadow-[var(--shadow-panel-strong)]">
            <EmojiPicker
              onEmojiClick={onEmojiClick}
              width="100%"
              height="100%"
              theme={getEmojiPickerTheme()}
              autoFocusSearch={autoFocusSearch}
              lazyLoadEmojis
            />
          </div>
        </div>
      </div>,
      document.body
    )
  }

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={ariaLabel}
      data-emoji-picker-overlay="true"
      className={desktopClassName}
    >
      <EmojiPicker
        onEmojiClick={onEmojiClick}
        width={width}
        height={height}
        theme={getEmojiPickerTheme()}
        autoFocusSearch={autoFocusSearch}
        lazyLoadEmojis
      />
    </div>
  )
}

import { useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import { cn } from '../../../lib/utils'

interface InnerCircleSheetProps {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  initialFocusRef?: RefObject<HTMLElement>
  dismissible?: boolean
  className?: string
  testId: string
}
export function InnerCircleSheet({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  initialFocusRef,
  dismissible = true,
  className,
  testId,
}: InnerCircleSheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogAccessibility<HTMLDivElement>({
    open,
    onClose,
    dismissible,
    initialFocusRef: initialFocusRef ?? closeRef,
  })

  if (!open) return null

  const sheet = (
    <div
      role="presentation"
      data-testid={`${testId}-backdrop`}
      className="fixed inset-0 z-[160] flex items-end justify-center bg-[rgba(0,0,0,0.7)] px-0 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-4"
      onPointerDown={event => {
        if (dismissible && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-testid={testId}
        className={cn(
          'glass-panel-strong flex max-h-[calc(var(--shadowchat-visual-viewport-height,100dvh)-max(0.75rem,env(safe-area-inset-top)))] w-full min-w-0 flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-b-0 border-[var(--border-panel)] shadow-[var(--shadow-panel-strong)] sm:max-h-[min(92dvh,52rem)] sm:max-w-xl sm:rounded-[var(--radius-xl)] sm:border-b',
          className
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[rgba(255,255,255,0.18)] sm:hidden" aria-hidden="true" />
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border-panel)] px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="mb-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-gold)]">{eyebrow}</p>}
            <h2 id={titleId} className="break-words text-lg font-semibold text-[var(--text-primary)]">{title}</h2>
            {description && <p id={descriptionId} className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{description}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label={`Close ${title}`}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-accent-soft)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer && (
          <footer className="shrink-0 border-t border-[var(--border-panel)] bg-[var(--bg-elevated)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-5 sm:pb-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )

  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body)
}

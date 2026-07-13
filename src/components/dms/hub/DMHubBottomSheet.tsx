import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import { cn } from '../../../lib/utils'

type DMHubBottomSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  description?: string
  children: ReactNode
  className?: string
  testId?: string
  suspended?: boolean
}

export function DMHubBottomSheet({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  className,
  testId = 'dm-hub-bottom-sheet',
  suspended = false,
}: DMHubBottomSheetProps) {
  const titleId = useId()
  const descriptionId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogAccessibility<HTMLDivElement>({
    open: open && !suspended,
    onClose,
    initialFocusRef: closeRef,
    restoreFocus: !suspended,
  })

  if (!open) return null

  const sheet = (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-[rgba(0,0,0,0.66)] px-0 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:px-4"
      onPointerDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      data-testid={`${testId}-backdrop`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal={!suspended}
        aria-hidden={suspended || undefined}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'glass-panel-strong flex max-h-[min(92dvh,48rem)] w-full flex-col overflow-hidden rounded-t-[var(--radius-xl)] border border-b-0 border-[var(--border-panel)] shadow-[var(--shadow-panel-strong)] sm:max-w-xl sm:rounded-[var(--radius-xl)] sm:border-b',
          suspended && 'pointer-events-none',
          className
        )}
        data-testid={testId}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[rgba(255,255,255,0.18)] sm:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--border-panel)] px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="mb-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--text-gold)]">
                {eyebrow}
              </p>
            )}
            <h2 id={titleId} className="truncate text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-accent-soft)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)_+_1rem)] pt-3 sm:px-5 sm:pb-5">
          {children}
        </div>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? sheet : createPortal(sheet, document.body)
}

import { useRef } from 'react'
import { cn } from '../../../lib/utils'
import type { ShadowPinFeedMode } from '../types'

const MODES: Array<{ id: ShadowPinFeedMode; label: string }> = [
  { id: 'discover', label: 'Discover' },
  { id: 'connections', label: 'Connections' },
]

export function ShadowPinFeedModeTabs({
  mode,
  onChange,
  disabled = false,
}: {
  mode: ShadowPinFeedMode
  onChange: (mode: ShadowPinFeedMode) => void
  disabled?: boolean
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const selectIndex = (index: number) => {
    const nextIndex = (index + MODES.length) % MODES.length
    const nextMode = MODES[nextIndex].id
    onChange(nextMode)
    window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus())
  }

  return (
    <div
      role="tablist"
      aria-label="ShadowPin feed mode"
      className="grid min-h-12 grid-cols-2 gap-1 rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.72)] p-1 shadow-[var(--shadow-panel)] backdrop-blur-md"
      data-testid="shadow-pin-feed-mode-tabs"
    >
      {MODES.map((candidate, index) => {
        const selected = candidate.id === mode
        return (
          <button
            key={candidate.id}
            ref={node => { tabRefs.current[index] = node }}
            type="button"
            role="tab"
            id={`shadow-pin-feed-mode-${candidate.id}`}
            aria-selected={selected}
            aria-controls={selected ? `shadow-pin-feed-panel-${candidate.id}` : undefined}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            data-testid={`shadow-pin-feed-mode-${candidate.id}`}
            onClick={() => onChange(candidate.id)}
            onKeyDown={event => {
              if (event.key === 'ArrowRight') {
                event.preventDefault()
                selectIndex(index + 1)
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault()
                selectIndex(index - 1)
              } else if (event.key === 'Home') {
                event.preventDefault()
                selectIndex(0)
              } else if (event.key === 'End') {
                event.preventDefault()
                selectIndex(MODES.length - 1)
              }
            }}
            className={cn(
              'min-h-11 rounded-[calc(var(--radius-lg)-0.25rem)] border px-3 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-border)] disabled:opacity-60',
              selected
                ? 'border-[var(--theme-accent-border)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)] shadow-[inset_0_0_0_1px_var(--theme-accent-border-soft)]'
                : 'border-transparent text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.055)] hover:text-[var(--text-primary)]'
            )}
          >
            {candidate.label}
          </button>
        )
      })}
    </div>
  )
}

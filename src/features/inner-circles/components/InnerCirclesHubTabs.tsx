import { useRef } from 'react'
import { cn } from '../../../lib/utils'
import type { InnerCirclesHubTab } from './types'

const TABS: Array<{ id: InnerCirclesHubTab; label: string }> = [
  { id: 'people', label: 'People' },
  { id: 'circles', label: 'Circles' },
]

export function InnerCirclesHubTabs({
  selected,
  onChange,
  peopleCount,
  circleCount,
  disabled = false,
}: {
  selected: InnerCirclesHubTab
  onChange: (tab: InnerCirclesHubTab) => void
  peopleCount?: number
  circleCount?: number
  disabled?: boolean
}) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const counts: Record<InnerCirclesHubTab, number | undefined> = {
    people: peopleCount,
    circles: circleCount,
  }

  const selectIndex = (index: number) => {
    const nextIndex = (index + TABS.length) % TABS.length
    onChange(TABS[nextIndex].id)
    window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus())
  }

  return (
    <div
      role="tablist"
      aria-label="Connections hub sections"
      className="grid min-h-12 grid-cols-2 gap-1 rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.72)] p-1 shadow-[var(--shadow-panel)]"
      data-testid="inner-circles-hub-tabs"
    >
      {TABS.map((tab, index) => {
        const isSelected = selected === tab.id
        const count = counts[tab.id]
        return (
          <button
            key={tab.id}
            ref={node => { tabRefs.current[index] = node }}
            type="button"
            role="tab"
            id={`connections-hub-tab-${tab.id}`}
            aria-selected={isSelected}
            aria-controls={isSelected ? `connections-hub-panel-${tab.id}` : undefined}
            tabIndex={isSelected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
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
                selectIndex(TABS.length - 1)
              }
            }}
            className={cn(
              'inline-flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-[calc(var(--radius-lg)-0.25rem)] border px-2 text-sm font-semibold transition-[background-color,border-color,color,box-shadow] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] disabled:opacity-60',
              isSelected
                ? 'border-[var(--theme-accent-border)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)] shadow-[inset_0_0_0_1px_var(--theme-accent-border-soft)]'
                : 'border-transparent text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.055)] hover:text-[var(--text-primary)]'
            )}
          >
            <span className="truncate">{tab.label}</span>
            {typeof count === 'number' && (
              <span aria-label={`${count} ${tab.label.toLowerCase()}`} className="min-w-5 rounded-full bg-[rgba(255,255,255,0.07)] px-1 text-center text-[0.65rem] leading-5">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

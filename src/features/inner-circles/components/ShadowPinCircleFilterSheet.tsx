import { useRef, type KeyboardEvent } from 'react'
import { Check, CircleUserRound, UsersRound } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../lib/utils'
import { InnerCircleSheet } from './InnerCircleSheet'
import type { InnerCircleSummary } from './types'

export function ShadowPinCircleFilterSheet({
  open,
  circles,
  selectedCircleId,
  onSelect,
  onClose,
}: {
  open: boolean
  circles: InnerCircleSummary[]
  selectedCircleId: string | null
  onSelect: (circleId: string | null) => void
  onClose: () => void
}) {
  const options: Array<{ id: string | null; name: string; memberCount?: number }> = [
    { id: null, name: 'All Connections' },
    ...circles.map(circle => ({ id: circle.id, name: circle.name, memberCount: circle.memberCount })),
  ]
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = Math.max(0, options.findIndex(option => option.id === selectedCircleId))

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % options.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + options.length) % options.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = options.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    onSelect(options[nextIndex].id)
    optionRefs.current[nextIndex]?.focus()
  }

  return (
    <InnerCircleSheet
      open={open}
      onClose={onClose}
      title="Filter Connections"
      eyebrow="ShadowPin"
      description="Temporarily narrow this feed to one of your private Inner Circles."
      testId="shadow-pin-circle-filter"
      footer={<Button type="button" className="w-full" onClick={onClose}>Done</Button>}
    >
      <div role="radiogroup" aria-label="ShadowPin Connection filter" className="space-y-2">
        {options.map((option, index) => {
          const selected = option.id === selectedCircleId
          return (
            <button
              key={option.id ?? 'all'}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={index === selectedIndex ? 0 : -1}
              ref={element => { optionRefs.current[index] = element }}
              onClick={() => onSelect(option.id)}
              onKeyDown={event => handleOptionKeyDown(event, index)}
              className={cn(
                'flex min-h-14 w-full min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-[background-color,border-color,color] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]',
                selected ? 'border-[var(--theme-accent-border)] bg-[var(--theme-accent-soft)]' : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] hover:border-[var(--border-glow)]'
              )}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--theme-accent-border-soft)] bg-[rgba(255,255,255,0.025)] text-[var(--theme-accent-readable)]">
                {option.id === null ? <UsersRound className="h-5 w-5" /> : <CircleUserRound className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1"><span className="block break-words font-semibold text-[var(--text-primary)]">{option.name}</span>{typeof option.memberCount === 'number' && <span className="block text-xs text-[var(--text-muted)]">{option.memberCount} {option.memberCount === 1 ? 'member' : 'members'}</span>}</span>
              <span aria-hidden="true" className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-full border', selected ? 'border-[var(--theme-accent-border)] bg-[var(--theme-accent)] text-[var(--theme-accent-text)]' : 'border-[var(--border-subtle)] text-transparent')}><Check className="h-4 w-4" /></span>
            </button>
          )
        })}
      </div>
      {circles.length === 0 && <p className="mt-3 text-center text-sm text-[var(--text-muted)]">Create an Inner Circle from Connections to add another filter.</p>}
    </InnerCircleSheet>
  )
}

import { Egg } from 'lucide-react'
import { cn } from '../../lib/utils'

interface GoldEasterEggBadgeProps {
  active?: boolean | null
  className?: string
}

export function GoldEasterEggBadge({ active, className }: GoldEasterEggBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle text-[#f8d86c] drop-shadow-[0_0_9px_rgba(248,216,108,0.58)]',
        className
      )}
      title="Golden egg found"
      aria-label="Golden egg found"
    >
      <Egg className="h-3.5 w-3.5 fill-[#f2c64f] stroke-[2.45]" />
    </span>
  )
}

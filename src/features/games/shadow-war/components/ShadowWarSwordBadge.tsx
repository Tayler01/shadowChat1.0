import { SHADOW_WAR_SWORD_BADGE } from '../assets/manifest'
import { cn } from '../../../../lib/utils'

interface ShadowWarSwordBadgeProps {
  active?: boolean | null
  className?: string
}

export function ShadowWarSwordBadge({ active, className }: ShadowWarSwordBadgeProps) {
  if (!active) return null

  return (
    <span
      className={cn('inline-flex h-4 w-4 shrink-0 items-center justify-center align-middle', className)}
      title="Shadow War champion"
      aria-label="Shadow War champion"
    >
      <img src={SHADOW_WAR_SWORD_BADGE} alt="" className="h-full w-full" />
    </span>
  )
}

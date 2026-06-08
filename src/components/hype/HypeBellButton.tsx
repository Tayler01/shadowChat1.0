import React from 'react'
import { BellRing } from 'lucide-react'
import { Button } from '../ui/Button'
import { useOptionalHype } from '../../hooks/useHype'
import { getBlockedActionMessage } from '../../lib/moderation'
import { showActionErrorToast } from '../../lib/toastNotifications'
import { cn } from '../../lib/utils'

type HypeBellButtonProps = {
  compact?: boolean
  className?: string
}

export function HypeBellButton({ compact = false, className }: HypeBellButtonProps) {
  const hype = useOptionalHype()
  if (!hype) return null

  const { status, loadingStatus, ringing, ringBell } = hype
  const remaining = status?.remaining ?? 0
  const disabled = loadingStatus || ringing || remaining <= 0
  const label = remaining > 0 ? `Hype ${remaining}/${status?.limit_per_day ?? 2}` : 'Hype 0/2'

  const handleClick = async () => {
    try {
      await ringBell()
    } catch (error) {
      const message = await getBlockedActionMessage('general_chat', error, 'Failed to ring Hype')
      showActionErrorToast(message)
    }
  }

  return (
    <Button
      type="button"
      variant={remaining > 0 ? 'secondary' : 'ghost'}
      size="sm"
      disabled={disabled}
      loading={ringing}
      onClick={handleClick}
      className={cn(
        'shrink-0 border-[rgba(var(--theme-accent-strong-rgb),0.28)] bg-[rgba(var(--theme-accent-rgb),0.08)] text-[var(--theme-accent-readable)] hover:border-[rgba(var(--theme-accent-strong-rgb),0.48)]',
        compact ? 'h-10 w-10 px-0 py-0' : 'h-10 gap-2 px-3',
        className
      )}
      aria-label={label}
      title={label}
    >
      <BellRing className="h-4 w-4" />
      {!compact && <span className="ml-2 whitespace-nowrap">{label}</span>}
    </Button>
  )
}

import React from 'react'
import { Ghost } from 'lucide-react'
import { usePresenceForUser } from '../../hooks/usePresence'
import type { PresenceVisibility } from '../../types'

interface UserPresenceBadgeProps {
  userId?: string | null
  presenceVisibility?: PresenceVisibility | null
  className?: string
}

export function UserPresenceBadge({
  userId,
  presenceVisibility,
  className = '',
}: UserPresenceBadgeProps) {
  const presence = usePresenceForUser(userId)
  const isInvisible =
    presence?.presence_state === 'invisible' || presenceVisibility === 'invisible'

  if (!isInvisible) {
    return null
  }

  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] text-[rgb(213,220,232)] ${className}`}
      title="Invisible"
      aria-label="Invisible"
    >
      <Ghost className="h-2.5 w-2.5" />
    </span>
  )
}

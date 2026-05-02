import React from 'react'
import { ShieldCheck } from 'lucide-react'
import type { AdminRole } from '../../lib/supabase'

interface UserRoleBadgeProps {
  role?: AdminRole | null
  className?: string
}

export function UserRoleBadge({ role, className = '' }: UserRoleBadgeProps) {
  if (!role) return null

  const isAdmin = role === 'admin'
  const label = isAdmin ? 'Admin' : 'Sub-admin'

  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 align-middle ${isAdmin ? 'text-[var(--text-gold)]' : 'text-zinc-300'} ${className}`}
    >
      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
    </span>
  )
}

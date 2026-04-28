import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, Palette, UserRound, X } from 'lucide-react'
import type { User } from '../../lib/supabase'
import { getPresenceOption } from '../../lib/presence'
import { Avatar } from '../ui/Avatar'

interface PublicProfileDialogProps {
  user: User | null
  open: boolean
  onClose: () => void
}

const formatJoinDate = (value?: string) => {
  if (!value) return 'Unknown'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export const PublicProfileDialog: React.FC<PublicProfileDialogProps> = ({
  user,
  open,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const presence = getPresenceOption(user?.status)

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== 'Tab' || !dialogRef.current) {
        return
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      )

      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!user) return null

  const statusMessage = user.status_message?.trim()

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
          <motion.button
            type="button"
            aria-label="Dismiss profile"
            className="absolute inset-0 cursor-default bg-[rgba(0,0,0,0.68)] backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="public-profile-title"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="popup-surface relative max-h-[min(86vh,760px)] w-full max-w-lg overflow-hidden rounded-[var(--radius-xl)]"
          >
            <div className="relative h-36 overflow-hidden border-b border-[var(--border-panel)]">
              {user.banner_url ? (
                <img
                  src={user.banner_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(255,240,184,0.24),transparent_26%),linear-gradient(135deg,#17191c,#0f1112_58%,#34250c)]" />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.12),rgba(8,9,9,0.72))]" />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className="absolute right-3 top-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.42)] p-0 text-[var(--text-primary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)] focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.32)]"
                aria-label="Close profile"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="-mt-12 flex items-end gap-4">
                <Avatar
                  src={user.avatar_url}
                  alt={user.display_name || user.username || 'User'}
                  size="xl"
                  color={user.color}
                  status={user.status}
                  showStatus
                  className="rounded-full border-4 border-[var(--bg-panel-strong)] shadow-[var(--shadow-panel-strong)]"
                />
                <div className="min-w-0 pb-2">
                  <h2 id="public-profile-title" className="truncate text-2xl font-bold text-[var(--text-primary)]">
                    {user.display_name || user.username || 'Unknown User'}
                  </h2>
                  <p className="truncate text-sm text-[var(--text-muted)]">@{user.username || 'unknown'}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                  <span className={`h-2.5 w-2.5 rounded-full ${presence.dotClass}`} />
                  {presence.label}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                  <Palette className="h-3.5 w-3.5 text-[var(--text-gold)]" />
                  Chat color
                  <span
                    className="h-3 w-3 rounded-full border border-white/15"
                    style={{ backgroundColor: user.color || '#d7aa46' }}
                  />
                </span>
              </div>

              <div className="mt-5 space-y-3">
                <section className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    <UserRound className="h-3.5 w-3.5" />
                    Bio
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                    {statusMessage || 'No bio or status message shared yet.'}
                  </p>
                </section>

                <section className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Public Info
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-[var(--text-muted)]">Member since</dt>
                      <dd className="mt-1 text-[var(--text-primary)]">{formatJoinDate(user.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-[var(--text-muted)]">Username</dt>
                      <dd className="mt-1 truncate text-[var(--text-primary)]">@{user.username || 'unknown'}</dd>
                    </div>
                  </dl>
                </section>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

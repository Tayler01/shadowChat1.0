import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { CalendarDays, Clock3, Ghost, LockKeyhole, MessageCircle, Palette, ShieldAlert, ShieldCheck, UserRound, X } from 'lucide-react'
import type { User } from '../../lib/supabase'
import { getOrCreateDMConversation, setSubAdminStatus } from '../../lib/supabase'
import {
  CHANNEL_BAN_DURATIONS,
  CHANNEL_BAN_OPTIONS,
  describeChannelBanScopes,
  formatChannelBanExpiry,
  getChannelBanLabel,
  notifyChannelBansChanged,
  setUserChannelBans,
  type ChannelBanDuration,
  type ChannelBanScope,
  type PublicUserChannelBan,
  type UserChannelBan,
} from '../../lib/moderation'
import { useAuth } from '../../hooks/useAuth'
import { getPresenceStateLabel, usePresenceForUser } from '../../hooks/usePresence'
import { useUserChannelBans } from '../../hooks/useUserChannelBans'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'

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

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

export const PublicProfileDialog: React.FC<PublicProfileDialogProps> = ({
  user,
  open,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const { profile: currentProfile } = useAuth()
  const targetUserId = user?.id ?? null
  const targetUserAdminRole = user?.admin_role ?? null
  const livePresence = usePresenceForUser(user?.id)
  const {
    bans: publicBans,
    loading: publicBansLoading,
    refresh: refreshPublicBans,
  } = useUserChannelBans(open ? user?.id : null)
  const [banMenuOpen, setBanMenuOpen] = useState(false)
  const [banSaving, setBanSaving] = useState(false)
  const [banError, setBanError] = useState<string | null>(null)
  const [activeBans, setActiveBans] = useState<Array<PublicUserChannelBan | UserChannelBan>>([])
  const [selectedBanScopes, setSelectedBanScopes] = useState<ChannelBanScope[]>([])
  const [banDuration, setBanDuration] = useState<ChannelBanDuration>('1440')
  const [banReason, setBanReason] = useState('')
  const [localAdminRole, setLocalAdminRole] = useState(user?.admin_role ?? null)
  const [adminRoleSaving, setAdminRoleSaving] = useState(false)
  const [dmStarting, setDmStarting] = useState(false)

  const canStartDM = Boolean(
    open &&
    user &&
    currentProfile &&
    currentProfile.id !== user.id
  )

  const canModerate = Boolean(
    open &&
    user &&
    currentProfile &&
    currentProfile.id !== user.id &&
    localAdminRole !== 'admin' &&
    (
      currentProfile.admin_role === 'admin' ||
      (currentProfile.admin_role === 'sub_admin' && localAdminRole !== 'sub_admin')
    )
  )

  const canManageAdminRole = Boolean(
    open &&
    user &&
    currentProfile?.admin_role === 'admin' &&
    currentProfile.id !== user.id &&
    localAdminRole !== 'admin'
  )

  const selectedScopeSet = useMemo(
    () => new Set(selectedBanScopes),
    [selectedBanScopes]
  )

  const activeBanSummary = useMemo(() => {
    if (activeBans.length === 0) return 'No active channel bans'
    return activeBans
      .map(ban => `${getChannelBanLabel(ban.scope)} ${formatChannelBanExpiry(ban.expires_at).toLowerCase()}`)
      .join(', ')
  }, [activeBans])

  const activeBanReasons = useMemo(() => (
    Array.from(new Set(activeBans.map(ban => ban.reason?.trim()).filter(Boolean) as string[]))
  ), [activeBans])

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

  useEffect(() => {
    setLocalAdminRole(open && targetUserId ? targetUserAdminRole : null)
  }, [open, targetUserAdminRole, targetUserId])

  useEffect(() => {
    if (!open || !user) {
      setBanMenuOpen(false)
      setBanError(null)
      setActiveBans([])
      setSelectedBanScopes([])
      setBanReason('')
      return
    }

    setBanError(null)
    setActiveBans(publicBans)

    if (canModerate) {
      setSelectedBanScopes(publicBans.map(ban => ban.scope))
      const firstTimedBan = publicBans.find(ban => ban.expires_at)
      setBanDuration(publicBans.length > 0 && !firstTimedBan ? 'permanent' : '1440')
      setBanReason(publicBans[0]?.reason?.trim() || '')
    } else {
      setSelectedBanScopes([])
      setBanReason('')
    }
  }, [canModerate, open, publicBans, user])

  const toggleBanScope = (scope: ChannelBanScope) => {
    setSelectedBanScopes(prev => (
      prev.includes(scope)
        ? prev.filter(item => item !== scope)
        : [...prev, scope]
    ))
  }

  const saveChannelBans = async () => {
    if (!user || !canModerate) return

    const trimmedReason = banReason.trim()
    if ((selectedBanScopes.length > 0 || activeBans.length > 0) && !trimmedReason) {
      const message = 'A public reason is required for channel ban changes'
      setBanError(message)
      toast.error(message)
      return
    }

    setBanSaving(true)
    setBanError(null)

    try {
      const durationMinutes =
        banDuration === 'permanent' ? null : Number.parseInt(banDuration, 10)
      const nextBans = await setUserChannelBans(user.id, selectedBanScopes, durationMinutes, trimmedReason)
      setActiveBans(nextBans)
      setSelectedBanScopes(nextBans.map(ban => ban.scope))
      notifyChannelBansChanged(user.id)
      void refreshPublicBans(true)
      setBanMenuOpen(false)
      toast.success(nextBans.length > 0 ? 'Channel bans updated' : 'Channel bans cleared')
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to update channel bans')
      setBanError(message)
      toast.error(message)
    } finally {
      setBanSaving(false)
    }
  }

  const toggleSubAdminAccess = async () => {
    if (!user || !canManageAdminRole) return

    const enable = localAdminRole !== 'sub_admin'
    setAdminRoleSaving(true)

    try {
      await setSubAdminStatus(user.id, enable)
      setLocalAdminRole(enable ? 'sub_admin' : null)
      toast.success(enable ? 'Sub-admin access granted' : 'Sub-admin access removed')
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to update admin access'))
    } finally {
      setAdminRoleSaving(false)
    }
  }

  const startDirectMessage = async () => {
    if (!user || !canStartDM || dmStarting) return
    if (typeof window === 'undefined') return

    setDmStarting(true)

    try {
      const conversationId = await getOrCreateDMConversation(user.id)

      if (!conversationId) {
        throw new Error('Unable to start conversation')
      }

      const url = new URL(window.location.href)
      url.searchParams.set('view', 'dms')
      url.searchParams.set('conversation', conversationId)
      url.searchParams.delete('message')
      window.history.replaceState({}, '', url)
      window.dispatchEvent(new PopStateEvent('popstate'))

      onClose()
    } catch (error) {
      toast.error(getErrorMessage(error, 'Unable to start conversation'))
    } finally {
      setDmStarting(false)
    }
  }

  if (!user) return null

  const statusMessage = user.status_message?.trim()
  const presenceState =
    livePresence?.presence_state ||
    (user.presence_visibility === 'invisible' ? 'invisible' : 'offline')
  const presenceLabel = getPresenceStateLabel(presenceState)

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
            className="popup-surface relative max-h-[min(86vh,760px)] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-[var(--radius-xl)]"
          >
            <div className="relative h-36 shrink-0 overflow-hidden border-b border-[var(--border-panel)]">
              {user.banner_thumbnail_url || user.banner_url ? (
                <img
                  src={user.banner_thumbnail_url || user.banner_url}
                  alt=""
                  loading="eager"
                  decoding="async"
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
                  src={user.avatar_thumbnail_url || user.avatar_url}
                  alt={user.display_name || user.username || 'User'}
                  size="xl"
                  color={user.color}
                  userId={user.id}
                  presenceVisibility={user.presence_visibility}
                  showStatus
                  className="rounded-full border-4 border-[var(--bg-panel-strong)] shadow-[var(--shadow-panel-strong)]"
                />
                <div className="min-w-0 pb-2">
                  <h2 id="public-profile-title" className="flex min-w-0 items-center gap-2 text-2xl font-bold text-[var(--text-primary)]">
                    <span className="truncate">{user.display_name || user.username || 'Unknown User'}</span>
                    <UserRoleBadge role={localAdminRole} className="mt-1" />
                    <UserPresenceBadge userId={user.id} presenceVisibility={user.presence_visibility} />
                  </h2>
                  <p className="truncate text-sm text-[var(--text-muted)]">@{user.username || 'unknown'}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
                  {presenceState === 'invisible' ? (
                    <Ghost className="h-3.5 w-3.5 text-[rgb(213,220,232)]" />
                  ) : (
                    <span className={`h-2.5 w-2.5 rounded-full ${presenceState === 'online' ? 'bg-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.55)]' : 'bg-[#64748b] shadow-[0_0_10px_rgba(100,116,139,0.36)]'}`} />
                  )}
                  {presenceLabel}
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

              {canStartDM && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={dmStarting}
                    onClick={() => void startDirectMessage()}
                    className="w-full sm:w-auto"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Message
                  </Button>
                </div>
              )}

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

                {activeBans.length > 0 && (
                  <section className="rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.06)] p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                      <LockKeyhole className="h-3.5 w-3.5 text-[var(--text-gold)]" />
                      Channel Ban
                    </div>
                    <p className="text-sm leading-6 text-[var(--text-primary)]">
                      Banned from {describeChannelBanScopes(activeBans)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {activeBans.map(ban => (
                        <span
                          key={`${ban.target_user_id}-${ban.scope}`}
                          className="inline-flex rounded-full border border-[rgba(215,170,70,0.2)] bg-[rgba(10,11,12,0.44)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                        >
                          {getChannelBanLabel(ban.scope)} - {formatChannelBanExpiry(ban.expires_at)}
                        </span>
                      ))}
                    </div>
                    {activeBanReasons.length > 0 && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                        Reason: {activeBanReasons.join('; ')}
                      </p>
                    )}
                  </section>
                )}

                {canManageAdminRole && (
                  <section className="rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.055)] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          <ShieldCheck className="h-3.5 w-3.5 text-[var(--text-gold)]" />
                          Admin Access
                        </div>
                        <p className="text-sm leading-6 text-[var(--text-secondary)]">
                          {localAdminRole === 'sub_admin'
                            ? 'This user has sub-admin access.'
                            : 'Grant this user sub-admin access.'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={localAdminRole === 'sub_admin' ? 'danger' : 'secondary'}
                        size="sm"
                        loading={adminRoleSaving}
                        onClick={() => void toggleSubAdminAccess()}
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {localAdminRole === 'sub_admin' ? 'Remove sub-admin' : 'Make sub-admin'}
                      </Button>
                    </div>
                  </section>
                )}

                {canModerate && (
                  <section className="rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.055)] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          <ShieldAlert className="h-3.5 w-3.5 text-[var(--text-gold)]" />
                          Admin Moderation
                        </div>
                        <p className="text-sm leading-6 text-[var(--text-secondary)]">
                          {publicBansLoading ? 'Loading channel bans...' : activeBanSummary}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={activeBans.length > 0 ? 'danger' : 'secondary'}
                        size="sm"
                        onClick={() => setBanMenuOpen(value => !value)}
                        disabled={publicBansLoading || banSaving}
                        aria-expanded={banMenuOpen}
                      >
                        <ShieldAlert className="mr-2 h-4 w-4" />
                        Channel bans
                      </Button>
                    </div>

                    {banMenuOpen && (
                      <div
                        role="menu"
                        aria-label="Channel ban options"
                        className="mt-4 rounded-[var(--radius-md)] border border-[var(--border-panel)] bg-[rgba(10,10,10,0.82)] p-3 shadow-[var(--shadow-panel-strong)]"
                      >
                        <div className="space-y-2">
                          {CHANNEL_BAN_OPTIONS.map(option => (
                            <label
                              key={option.scope}
                              className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-sm)] border border-transparent p-2 transition-colors hover:border-[rgba(215,170,70,0.18)] hover:bg-[rgba(255,255,255,0.04)]"
                            >
                              <input
                                type="checkbox"
                                checked={selectedScopeSet.has(option.scope)}
                                onChange={() => toggleBanScope(option.scope)}
                                className="mt-1 h-4 w-4 accent-[var(--text-gold)]"
                              />
                              <span>
                                <span className="block text-sm font-semibold text-[var(--text-primary)]">
                                  {option.label}
                                </span>
                                <span className="block text-xs leading-5 text-[var(--text-muted)]">
                                  {option.description}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>

                        <label className="mt-3 block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          <span className="mb-2 flex items-center gap-2">
                            <Clock3 className="h-3.5 w-3.5" />
                            Ban length
                          </span>
                          <select
                            value={banDuration}
                            onChange={event => setBanDuration(event.target.value as ChannelBanDuration)}
                            disabled={selectedBanScopes.length === 0}
                            className="w-full rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.06)] px-3 py-2 text-sm normal-case tracking-normal text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--border-glow)] disabled:opacity-50"
                          >
                            {CHANNEL_BAN_DURATIONS.map(duration => (
                              <option key={duration.value} value={duration.value}>
                                {duration.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="mt-3 block text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">
                          Public reason
                          <textarea
                            value={banReason}
                            onChange={event => setBanReason(event.target.value)}
                            rows={3}
                            className="mt-2 w-full resize-none rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.06)] px-3 py-2 text-sm normal-case leading-5 tracking-normal text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-glow)]"
                            placeholder="Required for bans and removals"
                          />
                        </label>

                        {banError && (
                          <p className="mt-3 rounded-[var(--radius-sm)] border border-[rgba(190,52,85,0.4)] bg-[rgba(190,52,85,0.12)] px-3 py-2 text-xs text-[rgb(255,190,204)]">
                            {banError}
                          </p>
                        )}

                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedBanScopes([])
                              setBanDuration('permanent')
                            }}
                            disabled={banSaving || selectedBanScopes.length === 0}
                          >
                            Clear selections
                          </Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            loading={banSaving}
                            onClick={saveChannelBans}
                          >
                            Save bans
                          </Button>
                        </div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

import { lazy, Suspense, useRef, useState } from 'react'
import { Loader2, RefreshCw, UserRound, Users } from 'lucide-react'
import { MobileAppHeader } from '../layout/MobileAppHeader'
import { Avatar } from '../ui/Avatar'
import { useAuth } from '../../hooks/useAuth'
import { usePresence } from '../../hooks/usePresence'
import { getUserProfile } from '../../lib/auth'
import type { User } from '../../lib/supabase'
import type { AppView } from '../../types/navigation'
import { ConnectionControl } from '../../features/connections/ConnectionControl'

const PublicProfileDialog = lazy(() =>
  import('../profile/PublicProfileDialog').then(module => ({
    default: module.PublicProfileDialog,
  }))
)

interface ActiveUsersViewProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
}

export function ActiveUsersView({ currentView, onViewChange }: ActiveUsersViewProps) {
  const { user, profile } = useAuth()
  const currentUserId = profile?.id ?? user?.id ?? null
  const { activeUsers, refresh } = usePresence()
  const [refreshing, setRefreshing] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [selectedProfile, setSelectedProfile] = useState<User | null>(null)
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const profileCacheRef = useRef(new Map<string, User>())
  const profileRequestRef = useRef(0)

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setAnnouncement('Refreshing active users.')
    await refresh()
    setRefreshing(false)
    setAnnouncement('Active users are current.')
  }

  const openProfile = async (userId: string) => {
    const cached = profileCacheRef.current.get(userId)
    if (cached) {
      setProfileError(null)
      setSelectedProfile(cached)
      return
    }

    const requestId = profileRequestRef.current + 1
    profileRequestRef.current = requestId
    setLoadingProfileId(userId)
    setProfileError(null)

    try {
      const nextProfile = await getUserProfile(userId)
      if (requestId !== profileRequestRef.current) return
      if (!nextProfile) throw new Error('This profile is no longer available.')
      profileCacheRef.current.set(userId, nextProfile)
      setSelectedProfile(nextProfile)
    } catch (error) {
      if (requestId !== profileRequestRef.current) return
      setProfileError(error instanceof Error ? error.message : 'Unable to open this profile.')
    } finally {
      if (requestId === profileRequestRef.current) setLoadingProfileId(null)
    }
  }

  return (
    <div className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)+4.2rem)] text-sm md:pb-0" data-testid="active-users-view">
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="Active Users"
        eyebrow={`${activeUsers.length} active now`}
        showSearch={false}
        className="hidden md:flex"
      />

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pt-6">
        <div className="mx-auto w-full max-w-3xl">
          <header className="border-b border-[var(--border-subtle)] px-1 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-2 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[#9aefb5]">
                  <span className="h-2 w-2 rounded-full bg-[#22c55e] shadow-[0_0_10px_rgba(34,197,94,0.8)]" aria-hidden="true" />
                  Live presence
                </span>
                <h1 className="mt-0.5 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
                  Active now
                </h1>
                <p className="mt-1 max-w-xl text-sm leading-5 text-[var(--text-muted)]">
                  <span className="font-semibold text-[var(--text-secondary)]">{activeUsers.length}</span> {activeUsers.length === 1 ? 'person is' : 'people are'} active. Open a profile or connect from the list.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                aria-label="Refresh active users"
                aria-busy={refreshing}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] text-[var(--theme-accent-readable)] transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-55"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            </div>
          </header>

          <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

          {profileError && (
            <div role="alert" className="mt-4 rounded-[var(--radius-lg)] border border-red-300/20 bg-red-950/15 px-4 py-3 text-sm text-red-100">
              {profileError}
            </div>
          )}

          <section className="mt-4" aria-labelledby="active-users-list-title">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <h2 id="active-users-list-title" className="text-lg font-bold text-[var(--text-primary)]">People online</h2>
              <span className="text-xs text-[var(--text-muted)]">Updates live</span>
            </div>

            {activeUsers.length === 0 ? (
              <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] p-8 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]">
                  <Users className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">It is quiet right now</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[var(--text-muted)]">
                  Tracked users will appear here as soon as they become active.
                </p>
              </div>
            ) : (
              <div className="space-y-2" role="list" aria-label="Active users">
                {activeUsers.map(activeUser => {
                  const label = activeUser.display_name || activeUser.username || 'ShadowChat member'
                  const isCurrentUser = activeUser.user_id === currentUserId
                  const loadingProfile = loadingProfileId === activeUser.user_id
                  const connectionUser = {
                    id: activeUser.user_id,
                    username: activeUser.username || '',
                    display_name: label,
                  }

                  return (
                    <article
                      key={activeUser.user_id}
                      role="listitem"
                      className="flex min-w-0 flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.026)] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.14)] transition-[border-color,background-color] hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.04)]"
                    >
                      <button
                        type="button"
                        onClick={() => void openProfile(activeUser.user_id)}
                        disabled={loadingProfile}
                        className="flex min-h-12 min-w-[11rem] flex-1 items-center gap-3 rounded-[var(--radius-md)] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-70"
                        aria-label={`Open ${label}'s profile`}
                      >
                        <Avatar
                          src={activeUser.avatar_url || undefined}
                          alt={label}
                          size="md"
                          color={activeUser.color || undefined}
                          userId={activeUser.user_id}
                          presenceState="online"
                          showStatus
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-semibold text-[var(--text-primary)]">{label}</span>
                            {isCurrentUser && (
                              <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">You</span>
                            )}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                            {activeUser.username ? `@${activeUser.username} / Active now` : 'Active now'}
                          </span>
                        </span>
                        {loadingProfile ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--theme-accent-readable)]" aria-hidden="true" />
                        ) : (
                          <UserRound className="h-4 w-4 shrink-0 text-[var(--theme-accent-readable)]" aria-hidden="true" />
                        )}
                      </button>

                      {!isCurrentUser && (
                        <div className="ml-auto max-w-full">
                          <ConnectionControl user={connectionUser} compact />
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedProfile && (
        <Suspense fallback={null}>
          <PublicProfileDialog
            user={selectedProfile}
            open
            onClose={() => setSelectedProfile(null)}
          />
        </Suspense>
      )}
    </div>
  )
}

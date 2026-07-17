import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowUpRight, Check, Inbox, Loader2, MessageCircle, RefreshCw, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { useAuth } from '../../hooks/useAuth'
import { getUserProfile } from '../../lib/auth'
import { requestAppBadgeRefresh } from '../../lib/appBadge'
import type { User } from '../../lib/supabase'
import type { AppView } from '../../types/navigation'
import { clearNotificationEventFromSystemTray } from '../notifications/notificationApi'
import {
  acknowledgeCatchUpEvents,
  acknowledgeNotificationInboxEvent,
  fetchCatchUpSnapshot,
  fetchNotificationInbox,
} from './catchUpApi'
import {
  CATCH_UP_SECTION_ORDER,
  formatCatchUpTime,
  readCatchUpCache,
  writeCatchUpCache,
  type CatchUpItem,
  type CatchUpSnapshot,
} from './catchUpModel'

const PublicProfileDialog = lazy(() =>
  import('../../components/profile/PublicProfileDialog').then(module => ({
    default: module.PublicProfileDialog,
  }))
)

type CatchUpViewProps = {
  currentView: AppView
  onViewChange: (view: AppView) => void
  onOpenSource: (item: CatchUpItem) => void
}

const CACHE_TTL_MS = 30_000

const getInitials = (item: CatchUpItem) => {
  const label = item.actor?.display_name || item.actor?.username || item.title
  return label.split(/\s+/u).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'S'
}

const removeOpenedActivityItem = (snapshot: CatchUpSnapshot, item: CatchUpItem): CatchUpSnapshot => {
  if (item.activityEventIds.length === 0) return snapshot
  const eventIds = new Set(item.activityEventIds)
  const sections = Object.fromEntries(CATCH_UP_SECTION_ORDER.map(sectionId => {
    const section = snapshot.sections[sectionId]
    const items = section.items.filter(candidate => !candidate.activityEventIds.some(id => eventIds.has(id)))
    const removed = section.items.length - items.length
    return [sectionId, {
      ...section,
      items,
      shownCount: items.length,
      totalCount: Math.max(0, section.totalCount - removed),
      hasMore: Math.max(0, section.totalCount - removed) > items.length,
    }]
  })) as CatchUpSnapshot['sections']
  return { ...snapshot, sections }
}

function CatchUpCard({
  item,
  onOpen,
  onOpenProfile,
  profileLoading,
}: {
  item: CatchUpItem
  onOpen: () => void
  onOpenProfile: (userId: string) => void
  profileLoading: boolean
}) {
  const domId = useId()
  const titleId = `${domId}-title`
  const detailsId = `${domId}-details`
  const actorLabel = item.actor?.display_name || item.actor?.username || 'ShadowChat member'
  return (
    <article className="group flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.026)] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.14)] transition-[border-color,background-color] hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.04)]">
      {item.actor ? (
        <button
          type="button"
          onClick={() => onOpenProfile(item.actor!.id)}
          disabled={profileLoading}
          className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)] disabled:opacity-65"
          aria-label={`Open ${actorLabel}'s profile`}
          aria-busy={profileLoading}
        >
          <Avatar
            src={item.actor.avatar_thumbnail_url || item.actor.avatar_url || undefined}
            alt={actorLabel}
            fallback={getInitials(item)}
            size="lg"
            color={item.actor.color || undefined}
            userId={item.actor.id}
          />
        </button>
      ) : (
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-sm font-bold text-[var(--theme-accent-readable)]" aria-hidden="true">
          {getInitials(item)}
        </span>
      )}
      <button type="button" onClick={onOpen} data-catch-up-item-id={item.id} className="flex min-h-16 min-w-0 flex-1 items-center rounded-[var(--radius-md)] text-left focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" aria-labelledby={titleId} aria-describedby={detailsId}>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span id={titleId} className="truncate font-semibold text-[var(--text-primary)]">{item.title}</span>
            <span className="shrink-0 text-xs text-[var(--text-muted)]">{formatCatchUpTime(item.occurredAt)}</span>
          </span>
          <span id={detailsId} className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">{item.preview}</span>
          <span aria-hidden="true" className="mt-2 flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--theme-accent-readable)]">
            {item.unreadCount > 1 ? `${item.unreadCount} unread` : item.manuallyUnread ? 'Marked unread' : 'Open source'}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </span>
      </button>
    </article>
  )
}

export function CatchUpView({ currentView, onViewChange, onOpenSource }: CatchUpViewProps) {
  const { user } = useAuth()
  const userId = user?.id ?? ''
  const [cached] = useState(() => readCatchUpCache(userId))
  const [snapshot, setSnapshot] = useState<CatchUpSnapshot | null>(cached.snapshot)
  const [notificationInbox, setNotificationInbox] = useState<CatchUpItem[]>([])
  const [notificationInboxLoading, setNotificationInboxLoading] = useState(true)
  const [notificationInboxError, setNotificationInboxError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!cached.snapshot)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<User | null>(null)
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const snapshotRef = useRef(snapshot)
  const fetchedAtRef = useRef(cached.fetchedAt)
  const mountedRef = useRef(true)
  const profileCacheRef = useRef(new Map<string, User>())
  const profileRequestRef = useRef(0)

  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    setAnnouncement(refresh ? 'Refreshing Catch-Up.' : 'Loading Catch-Up.')
    try {
      const next = await fetchCatchUpSnapshot()
      if (!mountedRef.current) return
      const fetchedAt = Date.now()
      fetchedAtRef.current = fetchedAt
      setSnapshot(next)
      writeCatchUpCache(userId, next, {
        fetchedAt,
        scrollTop: refresh ? scrollRef.current?.scrollTop ?? 0 : 0,
      })
      setAnnouncement('Catch-Up is current.')
    } catch {
      if (!mountedRef.current) return
      setError('Catch-Up is temporarily unavailable.')
      setAnnouncement('Catch-Up refresh failed.')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [userId])

  const loadNotificationInbox = useCallback(async () => {
    setNotificationInboxLoading(true)
    setNotificationInboxError(null)
    try {
      const items = await fetchNotificationInbox()
      if (mountedRef.current) setNotificationInbox(items)
    } catch {
      if (mountedRef.current) setNotificationInboxError('Notification inbox could not refresh.')
    } finally {
      if (mountedRef.current) setNotificationInboxLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!cached.snapshot) void load()
    else if (Date.now() - cached.fetchedAt >= CACHE_TTL_MS) void load(true)
    void loadNotificationInbox()
    const frame = requestAnimationFrame(() => {
      if (scrollRef.current && cached.scrollTop > 0) scrollRef.current.scrollTop = cached.scrollTop
      if (cached.focusItemId && typeof CSS !== 'undefined') {
        const selector = `[data-catch-up-item-id="${CSS.escape(cached.focusItemId)}"]`
        scrollRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true })
        writeCatchUpCache(userId, snapshotRef.current, { focusItemId: null })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [cached, load, loadNotificationInbox, userId])

  useEffect(() => {
    mountedRef.current = true
    const scrollElement = scrollRef.current
    return () => {
      mountedRef.current = false
      if (scrollElement) {
        writeCatchUpCache(userId, snapshotRef.current, {
          scrollTop: scrollElement.scrollTop,
          fetchedAt: fetchedAtRef.current,
        })
      }
    }
  }, [userId])

  const sections = useMemo(
    () => snapshot ? CATCH_UP_SECTION_ORDER.map(id => snapshot.sections[id]) : [],
    [snapshot]
  )
  const totalCount = sections.reduce((sum, section) => sum + section.totalCount, 0)
  const hasOlderUnread = sections.some(section => section.olderUnreadExists)
  const hasNotificationInboxItems = notificationInbox.length > 0

  const openProfile = async (profileId: string) => {
    const cachedProfile = profileCacheRef.current.get(profileId)
    if (cachedProfile) {
      setProfileError(null)
      setSelectedProfile(cachedProfile)
      return
    }

    const requestId = profileRequestRef.current + 1
    profileRequestRef.current = requestId
    setLoadingProfileId(profileId)
    setProfileError(null)

    try {
      const profile = await getUserProfile(profileId)
      if (requestId !== profileRequestRef.current) return
      if (!profile) throw new Error('This profile is no longer available.')
      profileCacheRef.current.set(profileId, profile)
      setSelectedProfile(profile)
    } catch (caught) {
      if (requestId !== profileRequestRef.current) return
      setProfileError(caught instanceof Error ? caught.message : 'Unable to open this profile.')
    } finally {
      if (requestId === profileRequestRef.current) setLoadingProfileId(null)
    }
  }

  const openItem = (item: CatchUpItem) => {
    if (snapshot) {
      const scrollTop = scrollRef.current?.scrollTop ?? 0
      writeCatchUpCache(userId, snapshot, {
        scrollTop,
        fetchedAt: fetchedAtRef.current,
        focusItemId: item.id,
      })
      onOpenSource(item)
      if (item.activityEventIds.length === 0) return

      const next = removeOpenedActivityItem(snapshot, item)
      void acknowledgeCatchUpEvents(item.activityEventIds).then(() => {
        writeCatchUpCache(userId, next, {
          scrollTop,
          fetchedAt: fetchedAtRef.current,
          focusItemId: item.id,
        })
        if (mountedRef.current) setSnapshot(next)
      }).catch(() => {
        if (mountedRef.current) setError('The source opened, but its Catch-Up status could not be updated. Refresh to try again.')
      })
      return
    }
    onOpenSource(item)
  }

  const openNotificationItem = (item: CatchUpItem) => {
    const eventId = item.notificationEventIds?.[0]
    onOpenSource(item)
    if (!eventId) return

    setNotificationInbox(current => current.filter(candidate => candidate.id !== item.id))
    void acknowledgeNotificationInboxEvent(eventId).then(() => {
      void clearNotificationEventFromSystemTray({
        notificationType: item.kind,
        eventId,
      })
      requestAppBadgeRefresh()
    }).catch(() => {
      if (!mountedRef.current) return
      setNotificationInboxError('The source opened, but this notification could not be cleared. Refresh to try again.')
      void loadNotificationInbox()
    })
  }

  const refreshAll = () => {
    void Promise.all([load(true), loadNotificationInbox()])
  }

  return (
    <div className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)+4.2rem)] text-sm md:pb-0" data-testid="catch-up-view">
      <MobileAppHeader currentView={currentView} onViewChange={onViewChange} title="Catch-Up" logo className="hidden md:flex" />

      <div ref={scrollRef} role="region" aria-label="Catch-Up content" className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:pt-6">
        <div className="mx-auto w-full max-w-4xl">
          <header className="border-b border-[var(--border-subtle)] px-1 pb-4" data-testid="catch-up-compact-header">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent-readable)]">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Source-linked / No AI
                </span>
                <h1 className="mt-0.5 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">Your Catch-Up</h1>
                <p className="mt-1 max-w-xl text-sm leading-5 text-[var(--text-muted)]">Your notification inbox, unread conversations, new Chat roots, and ShadowPin posts - each linked to its exact source.</p>
                {snapshot && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                    <Check className="h-3.5 w-3.5 text-[var(--theme-accent-readable)]" aria-hidden="true" />
                    Through {new Date(snapshot.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} / {snapshot.lookbackHours / 24}-day activity window
                  </p>
                )}
              </div>
              <button type="button" onClick={refreshAll} disabled={loading || refreshing} aria-label="Refresh Catch-Up" aria-busy={refreshing || notificationInboxLoading} className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] text-[var(--theme-accent-readable)] transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-accent-soft)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-focus-ring)]">
                <RefreshCw className={`h-4 w-4 ${refreshing || notificationInboxLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            </div>
          </header>

          {loading && !snapshot ? (
            <div className="grid min-h-72 place-items-center" role="status"><span className="flex items-center gap-3 text-[var(--text-muted)]"><Loader2 className="h-5 w-5 animate-spin" />Building your source snapshot...</span></div>
          ) : error && !snapshot ? (
            <div className="mt-5 rounded-[var(--radius-xl)] border border-red-300/20 bg-red-950/10 p-6 text-center" role="alert">
              <AlertCircle className="mx-auto h-8 w-8 text-red-200" aria-hidden="true" />
              <h2 className="mt-3 font-semibold text-[var(--text-primary)]">Catch-Up could not load</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{error}</p>
              <Button type="button" variant="secondary" className="mt-4" onClick={() => void load()}>Try again</Button>
            </div>
          ) : snapshot && totalCount === 0 && !hasOlderUnread && !hasNotificationInboxItems && !notificationInboxLoading && !notificationInboxError ? (
            <div className="mt-5 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-8 text-center">
              <Sparkles className="mx-auto h-9 w-9 text-[var(--theme-accent-readable)]" aria-hidden="true" />
              <h2 className="mt-4 text-xl font-bold text-[var(--text-primary)]">You are caught up</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">No current source-linked updates are waiting in this seven-day window.</p>
            </div>
          ) : snapshot ? (
            <div className="mt-5 space-y-6">
              {profileError && (
                <p role="alert" className="rounded-[var(--radius-md)] border border-red-300/20 bg-red-950/15 px-4 py-3 text-sm text-red-100">
                  {profileError}
                </p>
              )}
              {hasNotificationInboxItems && (
                <section aria-labelledby="catch-up-notification-inbox">
                  <div className="mb-3 flex items-end justify-between gap-3 px-1">
                    <div>
                      <h2 id="catch-up-notification-inbox" className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
                        <Inbox className="h-5 w-5 text-[var(--theme-accent-readable)]" />
                        Notification inbox
                      </h2>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">Every unread app-icon count has a source you can open and clear here.</p>
                    </div>
                    <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">{notificationInbox.length}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {notificationInbox.map(item => (
                      <CatchUpCard
                        key={item.id}
                        item={item}
                        onOpen={() => openNotificationItem(item)}
                        onOpenProfile={profileId => void openProfile(profileId)}
                        profileLoading={loadingProfileId === item.actor?.id}
                      />
                    ))}
                  </div>
                </section>
              )}
              {sections.filter(section => section.totalCount > 0).map(section => (
                <section key={section.id} aria-labelledby={`catch-up-${section.id}`}>
                  <div className="mb-3 flex items-end justify-between gap-3 px-1">
                    <div>
                      <h2 id={`catch-up-${section.id}`} className="flex items-center gap-2 text-lg font-bold text-[var(--text-primary)]">
                        {section.id === 'direct_messages' ? <Users className="h-5 w-5 text-[var(--theme-accent-readable)]" /> : section.id === 'general_chat' ? <MessageCircle className="h-5 w-5 text-[var(--theme-accent-readable)]" /> : <Inbox className="h-5 w-5 text-[var(--theme-accent-readable)]" />}
                        {section.title}
                      </h2>
                      {(section.hasMore || section.olderUnreadExists) && <p className="mt-1 text-xs text-[var(--text-muted)]">Showing {section.shownCount} of {section.totalCount}{section.olderUnreadExists ? ' / older unread sources also exist' : ''}</p>}
                    </div>
                    <span className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">{section.totalCount}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {section.items.map(item => (
                      <CatchUpCard
                        key={item.id}
                        item={item}
                        onOpen={() => openItem(item)}
                        onOpenProfile={profileId => void openProfile(profileId)}
                        profileLoading={loadingProfileId === item.actor?.id}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {totalCount === 0 && hasOlderUnread && (
                <section className="rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-6 text-center" aria-labelledby="catch-up-older-title">
                  <Inbox className="mx-auto h-8 w-8 text-[var(--theme-accent-readable)]" aria-hidden="true" />
                  <h2 id="catch-up-older-title" className="mt-3 text-lg font-bold text-[var(--text-primary)]">Older unread sources are waiting</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-muted)]">Nothing new is inside this seven-day activity snapshot. Open the original surface to review older unread items.</p>
                </section>
              )}
            </div>
          ) : null}

          {error && snapshot && <p className="mt-4 text-center text-xs text-red-200" role="status">Refresh failed; the last source snapshot is still shown.</p>}
          {notificationInboxError && <p className="mt-4 text-center text-xs text-red-200" role="status">{notificationInboxError}</p>}
          <p className="sr-only" aria-live="polite">{announcement}</p>
        </div>
      </div>

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

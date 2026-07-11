import {
  AtSign,
  Bell,
  CheckCheck,
  Heart,
  Images,
  MessageCircle,
  RefreshCw,
  Reply,
  Sparkles,
  WifiOff,
} from 'lucide-react'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import type { AppView } from '../../types/navigation'
import { useActivity } from './ActivityContext'
import {
  formatActivityTime,
  getActivityActionLabel,
  getActivityGroup,
  getActivityTarget,
  type ActivityEvent,
  type ActivityGroup,
  type ActivityTarget,
} from './activityModel'

type ActivityViewProps = {
  currentView: AppView
  onViewChange: (view: AppView) => void
  onOpenActivity: (target: ActivityTarget) => void
}

const groupOrder: ActivityGroup[] = ['Today', 'Yesterday', 'Earlier']

const ActivityTypeIcon = ({ item }: { item: ActivityEvent }) => {
  const className = 'h-4 w-4'
  switch (item.type) {
    case 'dm_message': return <MessageCircle className={className} aria-hidden="true" />
    case 'mention': return <AtSign className={className} aria-hidden="true" />
    case 'reply': return <Reply className={className} aria-hidden="true" />
    case 'reaction': return <Heart className={className} aria-hidden="true" />
    case 'hype_event': return <Sparkles className={className} aria-hidden="true" />
    case 'shadow_pin_post':
    case 'shadow_pin_comment':
    case 'shadow_pin_reply':
      return <Images className={className} aria-hidden="true" />
  }
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {[0, 1, 2, 3].map(index => (
        <div key={index} className="glass-panel flex animate-pulse items-center gap-3 rounded-[var(--radius-lg)] p-3.5">
          <div className="h-11 w-11 rounded-full bg-[rgba(255,255,255,0.07)]" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded-full bg-[rgba(255,255,255,0.08)]" />
            <div className="h-3 w-4/5 rounded-full bg-[rgba(255,255,255,0.05)]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ActivityView({ currentView, onViewChange, onOpenActivity }: ActivityViewProps) {
  const {
    items,
    filter,
    loading,
    loadingMore,
    error,
    unreadCount,
    hasMore,
    announcement,
    realtimeStatus,
    setFilter,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  } = useActivity()

  const grouped = new Map<ActivityGroup, ActivityEvent[]>()
  items.forEach(item => {
    const group = getActivityGroup(item.occurred_at)
    grouped.set(group, [...(grouped.get(group) ?? []), item])
  })

  const openItem = (item: ActivityEvent) => {
    void markRead(item.id)
    const target = getActivityTarget(item)
    if (target) onOpenActivity(target)
  }

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine
  const emptyTitle = filter === 'unread' ? 'You’re all caught up' : 'Your Activity starts here'
  const emptyCopy = filter === 'unread'
    ? 'New mentions, replies, reactions, DMs, Hype, and ShadowPin updates will appear here.'
    : 'When people connect with you across ShadowChat, you’ll find the full trail here.'

  return (
    <div className="theme-app-surface flex h-full min-h-0 flex-col">
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="Activity"
        eyebrow={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        showSearch={false}
      />

      <main
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)_+_6rem)] pt-3 md:px-6 md:pb-8 md:pt-5"
        aria-busy={loading}
        data-activity-realtime={realtimeStatus}
      >
        <div className="mx-auto w-full max-w-3xl">
          <div className="glass-panel sticky top-0 z-20 mb-4 flex items-center justify-between gap-2 rounded-[var(--radius-lg)] p-1.5 shadow-[var(--shadow-panel)] backdrop-blur-xl">
            <div className="grid min-w-0 flex-1 grid-cols-2 rounded-[var(--radius-md)] bg-[rgba(0,0,0,0.18)] p-1" aria-label="Activity filter">
              {(['all', 'unread'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={filter === option}
                  className={`min-h-11 rounded-[var(--radius-sm)] px-3 text-sm font-semibold capitalize transition-[background-color,color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] ${
                    filter === option
                      ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              disabled={unreadCount === 0}
              aria-label="Mark all read"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-xs font-semibold text-[var(--theme-accent-readable)] transition-colors hover:bg-[var(--theme-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] disabled:cursor-default disabled:opacity-45"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              <span className="hidden min-[370px]:inline">Mark all read</span>
              <span className="min-[370px]:hidden">Read all</span>
            </button>
          </div>

          <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

          {loading && items.length === 0 ? (
            <ActivitySkeleton />
          ) : error && items.length === 0 ? (
            <div role="alert" className="glass-panel mx-auto mt-10 max-w-md rounded-[var(--radius-xl)] p-6 text-center">
              {isOffline ? <WifiOff className="mx-auto h-8 w-8 text-[var(--text-gold)]" /> : <Bell className="mx-auto h-8 w-8 text-[var(--text-gold)]" />}
              <h2 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{isOffline ? 'Activity is offline' : 'Activity couldn’t load'}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{isOffline ? 'Reconnect and try again. Your Activity will reconcile automatically.' : error}</p>
              <Button variant="secondary" className="mt-4" onClick={() => void refresh()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div className="glass-panel mx-auto mt-10 max-w-md rounded-[var(--radius-xl)] p-7 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]">
                <Bell className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">{emptyTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{emptyCopy}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupOrder.map(group => {
                const groupItems = grouped.get(group)
                if (!groupItems?.length) return null
                return (
                  <section key={group} aria-labelledby={`activity-${group.toLowerCase()}`}>
                    <h2 id={`activity-${group.toLowerCase()}`} className="mb-2 px-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{group}</h2>
                    <div className="space-y-2" role="list">
                      {groupItems.map(item => {
                        const target = getActivityTarget(item)
                        const actorLabel = item.actor?.display_name || item.actor?.username || 'ShadowChat member'
                        return (
                          <div key={item.id} role="listitem">
                            <button
                              type="button"
                              onClick={() => openItem(item)}
                              className={`group relative flex min-h-[4.75rem] w-full items-start gap-3 rounded-[var(--radius-lg)] border p-3.5 text-left transition-[background-color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] ${
                                item.read_at
                                  ? 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] hover:bg-[rgba(255,255,255,0.045)]'
                                  : 'border-[var(--theme-accent-border-soft)] bg-[linear-gradient(135deg,var(--theme-accent-soft),rgba(255,255,255,0.025))] shadow-[var(--shadow-accent-soft)]'
                              }`}
                              aria-label={`${getActivityActionLabel(item)}${item.read_at ? '' : ', unread'}${target ? '' : ', item no longer available'}`}
                            >
                              <span className="relative shrink-0">
                                <Avatar
                                  src={item.actor?.avatar_thumbnail_url || item.actor?.avatar_url || undefined}
                                  alt={actorLabel}
                                  size="md"
                                  color={item.actor?.color || undefined}
                                  userId={item.actor?.id}
                                />
                                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-[var(--bg-panel-strong)] bg-[var(--bg-panel)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-panel)]">
                                  <ActivityTypeIcon item={item} />
                                </span>
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-3">
                                  <span className={`text-sm leading-5 ${item.read_at ? 'font-medium text-[var(--text-secondary)]' : 'font-semibold text-[var(--text-primary)]'}`}>
                                    {getActivityActionLabel(item)}
                                  </span>
                                  <time className="shrink-0 pt-0.5 text-[0.68rem] text-[var(--text-muted)]" dateTime={item.occurred_at}>
                                    {formatActivityTime(item.occurred_at)}
                                  </time>
                                </span>
                                <span className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--text-muted)]">
                                  {target ? item.body_preview || 'Open this update' : 'This item is no longer available.'}
                                </span>
                              </span>
                              {!item.read_at && <span className="absolute bottom-3 right-3 h-2 w-2 rounded-full bg-[var(--theme-accent)] shadow-[0_0_10px_var(--theme-accent)]" aria-hidden="true" />}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )
              })}

              {error && (
                <div role="alert" className="rounded-[var(--radius-md)] border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              {hasMore ? (
                <div className="flex justify-center pb-2">
                  <Button variant="secondary" loading={loadingMore} onClick={() => void loadMore()}>Load earlier activity</Button>
                </div>
              ) : (
                <p className="pb-2 text-center text-xs text-[var(--text-muted)]">You’ve reached the beginning of your Activity.</p>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

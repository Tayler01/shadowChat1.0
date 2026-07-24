import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import { Bell, ChevronLeft, ChevronRight, Gamepad2, Images, ListChecks, MessageSquare, Newspaper, Settings, Users } from 'lucide-react'
import { useOptionalClientReset } from '../../hooks/ClientResetContext'
import { useAppBadgeState } from '../../hooks/useAppBadgeState'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { useOptionalActivity } from '../../features/activity/ActivityContext'
import { ACTIVITY_FEATURE_ENABLED, CATCH_UP_FEATURE_ENABLED } from '../../config/featureFlags'
import { openSettingsMain } from '../../lib/settingsNavigation'
import type { AppView } from '../../types/navigation'

const LazyActiveUsersButton = lazy(() => import('../chat/ActiveUsersButton').then(module => ({
  default: module.ActiveUsersButton,
})))
const LazyWeatherWidget = lazy(() => import('../chat/WeatherWidget').then(module => ({
  default: module.WeatherWidget,
})))

const LazyGlobalSearchButton = lazy(() => import('../search/GlobalSearchButton').then(module => ({
  default: module.GlobalSearchButton,
})))

interface MobileNavProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  className?: string
  embedded?: boolean
  boardsEnabled?: boolean
  boardsBadgeCount?: number
}

const formatBadge = (count: number) => count > 99 ? '99+' : String(count)

export function MobileNav({
  currentView,
  onViewChange,
  className,
  embedded = false,
  boardsEnabled = false,
  boardsBadgeCount = 0,
}: MobileNavProps) {
  const { conversations } = useDirectMessages()
  const badgeState = useAppBadgeState()
  const activity = useOptionalActivity()
  const { status: resetStatus } = useOptionalClientReset()
  const [page, setPage] = useState<0 | 1>(() => currentView === 'games' || currentView === 'weather' || currentView === 'discover' ? 1 : 0)
  const [toolsMounted, setToolsMounted] = useState(() => currentView === 'games' || currentView === 'weather' || currentView === 'discover')
  const primaryPageRef = useRef<HTMLUListElement>(null)
  const toolsPageRef = useRef<HTMLUListElement>(null)
  const totalUnread = conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0)
  const catchUpUnread = badgeState.interactions + badgeState.connections
  const moreUnread = badgeState.games

  const primaryItems = useMemo(() => [
    { id: 'chat' as const, icon: MessageSquare, label: 'Chat', badge: badgeState.group || null },
    { id: 'dms' as const, icon: Users, label: 'DMs', badge: Math.max(totalUnread, badgeState.dm) || null },
    ...(CATCH_UP_FEATURE_ENABLED ? [{ id: 'catchup' as const, icon: ListChecks, label: 'Catch-Up', badge: catchUpUnread || null }] : []),
    ...(ACTIVITY_FEATURE_ENABLED ? [{ id: 'activity' as const, icon: Bell, label: 'Activity', badge: activity?.unreadCount || null }] : []),
    ...(boardsEnabled ? [{ id: 'boards' as const, icon: Newspaper, label: 'Boards', badge: boardsBadgeCount || null }] : []),
    { id: 'pins' as const, icon: Images, label: 'Pins', badge: badgeState.shadow_pin || null },
    { id: 'active-users' as const, icon: Users, label: 'Active', badge: null },
  ], [
    activity?.unreadCount,
    badgeState.dm,
    badgeState.group,
    badgeState.shadow_pin,
    boardsBadgeCount,
    boardsEnabled,
    catchUpUnread,
    totalUnread,
  ])

  useEffect(() => {
    const resetForKeyboard = () => {
      if (document.documentElement.dataset.shadowchatKeyboard === 'open') setPage(0)
    }
    const observer = new MutationObserver(resetForKeyboard)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-shadowchat-keyboard'],
    })
    resetForKeyboard()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (currentView !== 'games' && currentView !== 'weather' && currentView !== 'discover') return
    setToolsMounted(true)
    setPage(1)
  }, [currentView])

  useEffect(() => {
    if (primaryPageRef.current) primaryPageRef.current.inert = page === 1
    if (toolsPageRef.current) toolsPageRef.current.inert = page === 0
  }, [page])

  const changeView = (view: AppView) => {
    setPage(0)
    onViewChange(view)
  }

  const transferPageFocus = (
    event: ReactMouseEvent<HTMLButtonElement>,
    pageRef: RefObject<HTMLUListElement | null>
  ) => {
    if (event.detail !== 0) {
      event.currentTarget.blur()
      return
    }

    window.requestAnimationFrame(() => {
      pageRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true })
    })
  }

  const showMore = (event: ReactMouseEvent<HTMLButtonElement>) => {
    setToolsMounted(true)
    setPage(1)
    transferPageFocus(event, toolsPageRef)
  }

  const showPrimary = (event: ReactMouseEvent<HTMLButtonElement>) => {
    setPage(0)
    transferPageFocus(event, primaryPageRef)
  }

  const openActiveUsers = () => {
    setPage(0)
    onViewChange('active-users')
  }

  const openGames = () => {
    setToolsMounted(true)
    setPage(1)
    onViewChange('games')
  }

  const openWeather = () => {
    setToolsMounted(true)
    setPage(1)
    onViewChange('weather')
  }

  const openDiscover = () => {
    setToolsMounted(true)
    setPage(1)
    onViewChange('discover')
  }

  const navSurface = embedded
    ? 'shadowchat-mobile-nav shadowchat-mobile-nav--embedded border-t border-[var(--border-panel)] bg-transparent'
    : 'shadowchat-mobile-nav shadowchat-mobile-nav--standalone glass-panel-strong border-t border-[var(--border-panel)]'

  const pageButtonClass = 'shadowchat-mobile-nav-button flex h-full min-h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1.5 text-[0.625rem] text-[var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-accent)]'

  return (
    <nav
      className={`${navSurface} overflow-hidden md:hidden ${className || 'fixed bottom-0 inset-x-0 z-50'}`}
      aria-label="Primary and utility navigation"
    >
      <div
        className={`flex w-[200%] transition-transform duration-300 ease-out motion-reduce:transition-none ${page === 1 ? '-translate-x-1/2' : 'translate-x-0'}`}
        data-testid="mobile-nav-pages"
      >
        <ul
          ref={primaryPageRef}
          className="grid h-[var(--shadowchat-mobile-nav-row-height)] w-1/2 shrink-0 px-1"
          style={{ gridTemplateColumns: `repeat(${primaryItems.length + 1}, minmax(0, 1fr))` }}
          aria-label="Main navigation"
          aria-hidden={page === 1}
        >
          {primaryItems.map(item => (
            <li key={item.id} className="relative min-w-0">
              {item.id === 'active-users' ? (
                <Suspense fallback={<span className="block h-full w-full" aria-hidden="true" />}>
                  <LazyActiveUsersButton
                    resetStatus={resetStatus}
                    variant="nav"
                    onOpen={openActiveUsers}
                    active={currentView === 'active-users'}
                  />
                </Suspense>
              ) : (
                <button
                  type="button"
                  onClick={() => changeView(item.id)}
                  aria-label={`${item.label}${item.badge ? `, ${item.badge} unread` : ''}`}
                  aria-current={currentView === item.id ? 'page' : undefined}
                  className={`${pageButtonClass} ${currentView === item.id ? 'bg-[var(--nav-active-bg)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]' : ''}`}
                >
                  <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]">
                    <item.icon className="h-[1.15rem] w-[1.15rem]" />
                    {item.badge ? (
                      <span aria-hidden="true" className="theme-unread-badge absolute -right-1 -top-1 rounded-full px-1 text-[0.625rem] leading-none">
                        {formatBadge(item.badge)}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.label}</span>
                </button>
              )}
            </li>
          ))}
          <li className="min-w-0">
            <button
              type="button"
              onClick={showMore}
              className={pageButtonClass}
              aria-label={`Show more navigation${moreUnread ? `, ${moreUnread} unread` : ''}`}
            >
              <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]">
                <ChevronRight className="h-[1.15rem] w-[1.15rem]" />
                {moreUnread ? (
                  <span aria-hidden="true" className="theme-unread-badge absolute -right-1 -top-1 rounded-full px-1 text-[0.625rem] leading-none">
                    {formatBadge(moreUnread)}
                  </span>
                ) : null}
              </span>
              <span>More</span>
            </button>
          </li>
        </ul>

        <ul
          ref={toolsPageRef}
          className="grid h-[var(--shadowchat-mobile-nav-row-height)] w-1/2 shrink-0 grid-cols-5 px-1"
          aria-label="More navigation"
          aria-hidden={page === 0}
        >
          <li className="min-w-0">
            {toolsMounted ? (
              <Suspense fallback={<span className="block h-full w-full" aria-hidden="true" />}>
                <LazyWeatherWidget
                  variant="nav"
                  onOpen={openWeather}
                  active={currentView === 'weather'}
                />
              </Suspense>
            ) : null}
          </li>
          <li className="min-w-0">
            <button type="button" onClick={openGames} className={`${pageButtonClass} ${currentView === 'games' ? 'bg-[var(--nav-active-bg)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]' : ''}`} aria-label={`Open Play${badgeState.games ? `, ${badgeState.games} unread` : ''}`} aria-current={currentView === 'games' ? 'page' : undefined}>
              <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]">
                <Gamepad2 className="h-[1.15rem] w-[1.15rem]" />
                {badgeState.games ? (
                  <span aria-hidden="true" className="theme-unread-badge absolute -right-1 -top-1 rounded-full px-1 text-[0.625rem] leading-none">
                    {formatBadge(badgeState.games)}
                  </span>
                ) : null}
              </span>
              <span>Play</span>
            </button>
          </li>
          <li className="min-w-0">
            {toolsMounted ? (
              <Suspense fallback={<span className="block h-full w-full" aria-hidden="true" />}>
                <LazyGlobalSearchButton
                  variant="nav"
                  active={currentView === 'discover'}
                  onOpen={openDiscover}
                />
              </Suspense>
            ) : null}
          </li>
          <li className="min-w-0">
            <button type="button" onClick={() => openSettingsMain(changeView)} className={pageButtonClass} aria-label="Open app preferences" aria-current={currentView === 'settings' ? 'page' : undefined}>
              <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]"><Settings className="h-[1.15rem] w-[1.15rem]" /></span>
              <span>Settings</span>
            </button>
          </li>
          <li className="min-w-0">
            <button type="button" onClick={showPrimary} className={pageButtonClass} aria-label="Return to main navigation">
              <span className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]"><ChevronLeft className="h-[1.15rem] w-[1.15rem]" /></span>
              <span>Back</span>
            </button>
          </li>
        </ul>
      </div>
      <div className="shadowchat-mobile-nav-home-spacer" aria-hidden="true" />
    </nav>
  )
}

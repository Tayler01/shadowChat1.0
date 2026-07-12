import { Bell, Gamepad2, Images, MessageSquare, Newspaper, Users } from 'lucide-react'
import { useOptionalActivity } from '../../features/activity/ActivityContext'
import { formatActivityBadge } from '../../features/activity/activityModel'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import type { AppView } from '../../types/navigation'

interface MobileNavProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  className?: string
  embedded?: boolean
  boardsEnabled?: boolean
  boardsBadgeCount?: number
}

export function MobileNav({
  currentView,
  onViewChange,
  className,
  embedded = false,
  boardsEnabled = false,
  boardsBadgeCount = 0,
}: MobileNavProps) {
  const { conversations } = useDirectMessages()
  const activity = useOptionalActivity()
  const totalUnread = conversations.reduce(
    (sum, c) => sum + (c.unread_count || 0),
    0
  )

  const navItems = [
    { id: 'chat' as const, icon: MessageSquare, label: 'Chat', badge: null },
    {
      id: 'dms' as const,
      icon: Users,
      label: 'DMs',
      badge: totalUnread > 0 ? totalUnread : null,
    },
    {
      id: 'activity' as const,
      icon: Bell,
      label: 'Activity',
      badge: activity?.unreadCount ? activity.unreadCount : null,
    },
    ...(boardsEnabled ? [{
      id: 'boards' as const,
      icon: Newspaper,
      label: 'Boards',
      badge: boardsBadgeCount > 0 ? boardsBadgeCount : null,
    }] : []),
    { id: 'pins' as const, icon: Images, label: 'Pins', badge: null },
    { id: 'games' as const, icon: Gamepad2, label: 'Play', badge: null },
  ]

  const navSurface = embedded
    ? 'shadowchat-mobile-nav shadowchat-mobile-nav--embedded border-t border-[var(--border-panel)] bg-transparent'
    : 'shadowchat-mobile-nav shadowchat-mobile-nav--standalone glass-panel-strong border-t border-[var(--border-panel)]'

  return (
    <nav
      className={`${navSurface} md:hidden ${className || 'fixed bottom-0 inset-x-0 z-50'}`}
    >
      <ul className="flex h-[var(--shadowchat-mobile-nav-row-height)] justify-around px-1">
        {navItems.map(item => (
          <li key={item.id} className="relative flex-1">
            <button
              onClick={() => onViewChange(item.id)}
              aria-label={`${item.label}${item.badge ? `, ${item.badge} unread` : ''}`}
              aria-current={currentView === item.id ? 'page' : undefined}
              className={`flex h-full min-h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1.5 text-[0.625rem] transition-[background-color,box-shadow,color] duration-[var(--dur-med)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-accent)] ${
                currentView === item.id
                  ? 'bg-[var(--nav-active-bg)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]">
                <item.icon className="w-[1.15rem] h-[1.15rem]" />
                {item.badge && (
                  <span aria-hidden="true" className="theme-unread-badge absolute -right-1 -top-1 rounded-full px-1 text-[0.625rem] leading-none">
                    {formatActivityBadge(item.badge)}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="shadowchat-mobile-nav-home-spacer" aria-hidden="true" />
    </nav>
  )
}

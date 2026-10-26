import { Images, MessageSquare, Settings, Users } from 'lucide-react'
import { useAppBadgeState } from '../../hooks/useAppBadgeState'
import { useDirectMessages } from '../../../apps/streamlined/src-overrides/hooks/useDirectMessages'
import { cn } from '../../lib/utils'
import { openSettingsMain } from '../../lib/settingsNavigation'
import type { AppView } from '../../types/navigation'

interface MobileNavProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  className?: string
  embedded?: boolean
  boardsEnabled?: boolean
  boardsBadgeCount?: number
}

const formatBadge = (count: number) => count > 99 ? '99+' : String(count)

/** The streamlined build substitutes this chrome while retaining the shared footer. */
export function MobileNav({
  currentView,
  onViewChange,
  className,
  embedded = false,
}: MobileNavProps) {
  const { conversations } = useDirectMessages()
  const badgeState = useAppBadgeState()
  const dmUnread = conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0)
  const items = [
    { id: 'chat' as const, icon: MessageSquare, label: 'Chat', badge: badgeState.group },
    { id: 'dms' as const, icon: Users, label: 'DMs', badge: Math.max(dmUnread, badgeState.dm) },
    { id: 'pins' as const, icon: Images, label: 'ShadowPin', badge: badgeState.shadow_pin },
    { id: 'settings' as const, icon: Settings, label: 'Settings', badge: 0 },
  ]

  const changeView = (view: AppView) => {
    if (view === 'settings') {
      openSettingsMain(onViewChange)
      return
    }
    onViewChange(view)
  }

  return (
    <nav
      className={cn(
        'shadowchat-mobile-nav overflow-hidden border-t border-[var(--border-panel)] md:hidden',
        embedded
          ? 'shadowchat-mobile-nav--embedded bg-transparent'
          : 'shadowchat-mobile-nav--standalone glass-panel-strong',
        className || 'fixed inset-x-0 bottom-0 z-50'
      )}
      aria-label="Primary navigation"
      data-streamlined-navigation="true"
    >
      <ul className="grid h-[var(--shadowchat-mobile-nav-row-height)] grid-cols-4 px-1" aria-label="Main navigation">
        {items.map(item => (
          <li key={item.id} className="relative min-w-0">
            <button
              type="button"
              onClick={() => changeView(item.id)}
              aria-label={`${item.label}${item.badge ? `, ${item.badge} unread` : ''}`}
              aria-current={currentView === item.id ? 'page' : undefined}
              className={cn(
                'shadowchat-mobile-nav-button flex h-full min-h-11 w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1.5 text-[0.625rem] text-[var(--text-muted)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--theme-accent)]',
                currentView === item.id && 'bg-[var(--nav-active-bg)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]'
              )}
            >
              <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]">
                <item.icon className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
                {item.badge > 0 && (
                  <span aria-hidden="true" className="theme-unread-badge absolute -right-1 -top-1 rounded-full px-1 text-[0.625rem] leading-none">
                    {formatBadge(item.badge)}
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

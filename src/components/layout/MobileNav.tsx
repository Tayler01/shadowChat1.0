import React from 'react'
import { Gamepad2, MessageSquare, Newspaper, Settings, Users } from 'lucide-react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { useBoardBadges } from '../../hooks/useBoardBadges'
import type { AppView } from '../../types/navigation'

interface MobileNavProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  className?: string
  embedded?: boolean
}

export function MobileNav({ currentView, onViewChange, className, embedded = false }: MobileNavProps) {
  const { conversations } = useDirectMessages()
  const { count: boardsBadgeCount } = useBoardBadges()
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
      id: 'boards' as const,
      icon: Newspaper,
      label: 'Boards',
      badge: boardsBadgeCount > 0 ? boardsBadgeCount : null,
    },
    { id: 'games' as const, icon: Gamepad2, label: 'Games', badge: null },
    { id: 'settings' as const, icon: Settings, label: 'Settings', badge: null },
  ]

  return (
    <nav
      className={`${embedded ? 'h-[4.15rem] border-t border-[var(--border-panel)] bg-transparent' : 'glass-panel-strong h-[4.15rem] border-t border-[var(--border-panel)]'} md:hidden ${
        className || 'fixed bottom-0 inset-x-0 z-50'
      }`}
    >
      <ul className="flex h-full justify-around px-1">
        {navItems.map(item => (
          <li key={item.id} className="relative flex-1">
            <button
              onClick={() => onViewChange(item.id)}
              className={`flex h-full w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-0.5 py-1.5 text-[10px] transition-[background-color,box-shadow,color] duration-[var(--dur-med)] focus:outline-none ${
                currentView === item.id
                  ? 'bg-[var(--nav-active-bg)] text-[var(--theme-accent-readable)] shadow-[var(--shadow-accent-soft)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--nav-icon-bg)]">
                <item.icon className="w-[1.15rem] h-[1.15rem]" />
                {item.badge && (
                  <span className="theme-unread-badge absolute -right-1 -top-1 rounded-full px-1 text-[10px] leading-none">
                    {item.badge}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

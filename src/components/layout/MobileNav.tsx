import React from 'react'
import { MessageSquare, Newspaper, Settings, Users } from 'lucide-react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { useNewsBadges } from '../../hooks/useNewsBadges'

interface MobileNavProps {
  currentView: 'chat' | 'dms' | 'news' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'news' | 'settings') => void
  className?: string
}

export function MobileNav({ currentView, onViewChange, className }: MobileNavProps) {
  const { conversations } = useDirectMessages()
  const { count: newsBadgeCount } = useNewsBadges()
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
      id: 'news' as const,
      icon: Newspaper,
      label: 'News',
      badge: newsBadgeCount > 0 ? newsBadgeCount : null,
    },
    { id: 'settings' as const, icon: Settings, label: 'Settings', badge: null },
  ]

  return (
    <nav
      className={`glass-panel-strong h-[4.15rem] border-t border-[var(--border-panel)] backdrop-blur-xl md:hidden ${
        className || 'fixed bottom-0 inset-x-0 z-50'
      }`}
    >
      <ul className="flex h-full justify-around px-1.5">
        {navItems.map(item => (
          <li key={item.id} className="relative flex-1">
            <button
              onClick={() => onViewChange(item.id)}
              className={`flex h-full w-full flex-col items-center justify-center rounded-[var(--radius-md)] px-1 py-1.5 text-[10px] focus:outline-none transition-all ${
                currentView === item.id
                  ? 'bg-[rgba(255,255,255,0.04)] text-[var(--text-gold)] shadow-[var(--shadow-gold-soft)]'
                  : 'text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="relative mb-1 flex h-8 w-8 items-center justify-center rounded-full">
                <item.icon className="w-[1.15rem] h-[1.15rem]" />
                {item.badge && (
                  <span className="absolute -right-1 -top-1 rounded-full border border-[rgba(215,170,70,0.3)] bg-[rgba(215,170,70,0.14)] px-1 text-[10px] leading-none text-[var(--text-gold)]">
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

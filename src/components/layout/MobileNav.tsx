import React from 'react'
import { MessageSquare, Users, User, Settings } from 'lucide-react'
import { useDirectMessages } from '../../hooks/useDirectMessages'

interface MobileNavProps {
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
  className?: string
}

export function MobileNav({ currentView, onViewChange, className }: MobileNavProps) {
  const { conversations } = useDirectMessages()
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
    { id: 'profile' as const, icon: User, label: 'Profile', badge: null },
    { id: 'settings' as const, icon: Settings, label: 'Settings', badge: null },
  ]

  return (
    <nav
      className={`md:hidden bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 h-16 ${
        className || 'fixed bottom-0 inset-x-0 z-50'
      }`}
    >
      <ul className="flex justify-around">
        {navItems.map(item => (
          <li key={item.id} className="relative">
            <button
              onClick={() => onViewChange(item.id)}
              className={`flex flex-col items-center py-2 text-xs focus:outline-none w-full ${
                currentView === item.id
                  ? 'text-[var(--color-accent)]'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <span className="relative">
                <item.icon className="w-5 h-5" />
                {item.badge && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] leading-none px-1 rounded-full">
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

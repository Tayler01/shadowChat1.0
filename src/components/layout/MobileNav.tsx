import React from 'react'
import { MessageSquare, Users, User, Settings } from 'lucide-react'

interface MobileNavProps {
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
}

export function MobileNav({ currentView, onViewChange }: MobileNavProps) {
  const navItems = [
    { id: 'chat' as const, icon: MessageSquare, label: 'Chat' },
    { id: 'dms' as const, icon: Users, label: 'DMs' },
    { id: 'profile' as const, icon: User, label: 'Profile' },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
  ]

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 z-50">
      <ul className="flex justify-around">
        {navItems.map(item => (
          <li key={item.id}>
            <button
              onClick={() => onViewChange(item.id)}
              className={`flex flex-col items-center py-2 text-xs focus:outline-none w-full ${
                currentView === item.id
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

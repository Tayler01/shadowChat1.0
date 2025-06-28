import React from 'react'
import { MobileNav } from './MobileNav'

interface MobileChatFooterProps {
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
  children: React.ReactNode
}

export function MobileChatFooter({ currentView, onViewChange, children }: MobileChatFooterProps) {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-800 z-50 flex flex-col">
      {children}
      <div className="border-t border-gray-200 dark:border-gray-700" />
      <MobileNav
        currentView={currentView}
        onViewChange={onViewChange}
        className="static"
      />
    </div>
  )
}

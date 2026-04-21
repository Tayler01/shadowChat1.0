import React from 'react'
import { MobileNav } from './MobileNav'

interface MobileChatFooterProps {
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
  children: React.ReactNode
}

export function MobileChatFooter({ currentView, onViewChange, children }: MobileChatFooterProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 flex flex-col border-t border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(18,20,21,0.88),rgba(9,10,11,0.98))] shadow-[0_-14px_36px_rgba(0,0,0,0.32)] backdrop-blur-xl md:hidden">
      {children}
      <MobileNav
        currentView={currentView}
        onViewChange={onViewChange}
        className="static"
      />
    </div>
  )
}

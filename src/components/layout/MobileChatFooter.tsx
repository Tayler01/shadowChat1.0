import React from 'react'
import { MobileNav } from './MobileNav'

export interface MobileChatFooterProps {
  currentView: 'chat' | 'dms' | 'profile' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'profile' | 'settings') => void
  children: React.ReactNode
}

export const MobileChatFooter = React.forwardRef<HTMLDivElement, MobileChatFooterProps>(
  ({ currentView, onViewChange, children }, ref) => {
    return (
      <div
        ref={ref}
        className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-800 z-50 flex flex-col"
      >
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
)

MobileChatFooter.displayName = 'MobileChatFooter'

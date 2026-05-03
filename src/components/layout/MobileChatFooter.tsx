import React, { useEffect, useRef } from 'react'
import { MobileNav } from './MobileNav'

interface MobileChatFooterProps {
  currentView: 'chat' | 'dms' | 'boards' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'boards' | 'settings') => void
  children: React.ReactNode
}

export function MobileChatFooter({ currentView, onViewChange, children }: MobileChatFooterProps) {
  const footerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = document.documentElement

    const updateFooterHeight = () => {
      const height = footerRef.current?.getBoundingClientRect().height ?? 0
      root.style.setProperty('--shadowchat-mobile-chat-footer-height', `${height}px`)
    }

    updateFooterHeight()

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateFooterHeight)
        : null

    if (footerRef.current) {
      observer?.observe(footerRef.current)
    }

    window.addEventListener('resize', updateFooterHeight)
    window.visualViewport?.addEventListener('resize', updateFooterHeight)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateFooterHeight)
      window.visualViewport?.removeEventListener('resize', updateFooterHeight)
      root.style.removeProperty('--shadowchat-mobile-chat-footer-height')
    }
  }, [])

  return (
    <div
      ref={footerRef}
      className="absolute inset-x-0 bottom-0 z-50 flex flex-col border-t border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(18,20,21,0.88),rgba(9,10,11,0.98))] pb-[env(safe-area-inset-bottom)] shadow-[0_-14px_36px_rgba(0,0,0,0.32)] backdrop-blur-xl md:hidden"
      data-mobile-chat-footer="true"
    >
      {children}
      <MobileNav
        currentView={currentView}
        onViewChange={onViewChange}
        className="static"
      />
    </div>
  )
}

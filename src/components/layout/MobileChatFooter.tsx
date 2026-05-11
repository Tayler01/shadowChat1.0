import React, { useEffect, useRef } from 'react'
import { MobileNav } from './MobileNav'

interface MobileChatFooterProps {
  currentView: 'chat' | 'dms' | 'boards' | 'settings'
  onViewChange: (view: 'chat' | 'dms' | 'boards' | 'settings') => void
  children: React.ReactNode
  avoidAndroidKeyboardLift?: boolean
}

function isIOSLikeNavigator() {
  if (typeof window === 'undefined') return false

  const nav = window.navigator as Navigator & { standalone?: boolean }
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  )
}

export function MobileChatFooter({
  currentView,
  onViewChange,
  children,
  avoidAndroidKeyboardLift = false,
}: MobileChatFooterProps) {
  const footerRef = useRef<HTMLDivElement>(null)
  const disableAndroidKeyboardLift = avoidAndroidKeyboardLift && !isIOSLikeNavigator()
  const footerStyle = {
    '--shadowchat-mobile-chat-footer-bottom': disableAndroidKeyboardLift
      ? '0px'
      : 'var(--shadowchat-keyboard-inset,0px)',
  } as React.CSSProperties

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
      className="fixed inset-x-0 bottom-[var(--shadowchat-mobile-chat-footer-bottom)] z-50 flex flex-col border-t border-[var(--border-panel)] [background:var(--mobile-footer-bg)] pb-[env(safe-area-inset-bottom)] shadow-[var(--mobile-footer-shadow)] md:hidden"
      data-mobile-chat-footer="true"
      data-android-keyboard-lift={disableAndroidKeyboardLift ? 'disabled' : 'enabled'}
      style={footerStyle}
    >
      {children}
      <MobileNav
        currentView={currentView}
        onViewChange={onViewChange}
        className="static"
        embedded
      />
    </div>
  )
}

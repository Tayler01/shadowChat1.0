import React, { useLayoutEffect, useRef } from 'react'
import { MobileNav } from './MobileNav'
import type { AppView } from '../../types/navigation'

interface MobileChatFooterProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  children: React.ReactNode
  avoidAndroidKeyboardLift?: boolean
  collapseNavOnKeyboard?: boolean
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
  collapseNavOnKeyboard = true,
}: MobileChatFooterProps) {
  const footerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const measuredHeightsRef = useRef<{ compact: number | null; expanded: number | null }>({
    compact: null,
    expanded: null,
  })
  const disableAndroidKeyboardLift = avoidAndroidKeyboardLift && !isIOSLikeNavigator()
  const footerStyle = {
    '--shadowchat-mobile-chat-footer-bottom': disableAndroidKeyboardLift
      ? '0px'
      : 'var(--shadowchat-keyboard-inset,0px)',
  } as React.CSSProperties

  useLayoutEffect(() => {
    const root = document.documentElement

    const readElementHeight = (element: HTMLElement | null, includeScrollHeight = false) => {
      if (!element) return 0

      const rectHeight = element.getBoundingClientRect().height
      const scrollHeight = includeScrollHeight ? element.scrollHeight : 0
      return Math.round(Math.max(rectHeight, scrollHeight, 0))
    }

    const readFooterVerticalExtras = () => {
      if (!footerRef.current) return 0
      const style = window.getComputedStyle(footerRef.current)
      const values = [
        style.borderTopWidth,
        style.borderBottomWidth,
        style.paddingTop,
        style.paddingBottom,
      ]

      return Math.round(values.reduce((sum, value) => {
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) ? sum + parsed : sum
      }, 0))
    }

    const updateFooterHeight = () => {
      const contentHeight = readElementHeight(contentRef.current)
      if (contentHeight <= 0) {
        return
      }

      const navHeight = collapseNavOnKeyboard
        ? readElementHeight(navRef.current, true)
        : 0
      const footerExtras = readFooterVerticalExtras()
      const compactHeight = contentHeight + footerExtras
      const expandedHeight = compactHeight + navHeight

      if (measuredHeightsRef.current.compact !== compactHeight) {
        measuredHeightsRef.current.compact = compactHeight
        root.style.setProperty('--shadowchat-mobile-chat-footer-compact-height', `${compactHeight}px`)
      }

      if (measuredHeightsRef.current.expanded !== expandedHeight) {
        measuredHeightsRef.current.expanded = expandedHeight
        root.style.setProperty('--shadowchat-mobile-chat-footer-expanded-height', `${expandedHeight}px`)
      }
    }

    updateFooterHeight()

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(updateFooterHeight)
        : null

    if (footerRef.current) {
      observer?.observe(footerRef.current)
    }
    if (contentRef.current) {
      observer?.observe(contentRef.current)
    }
    if (navRef.current) {
      observer?.observe(navRef.current)
    }

    window.addEventListener('resize', updateFooterHeight)
    window.visualViewport?.addEventListener('resize', updateFooterHeight)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', updateFooterHeight)
      window.visualViewport?.removeEventListener('resize', updateFooterHeight)
      root.style.removeProperty('--shadowchat-mobile-chat-footer-compact-height')
      root.style.removeProperty('--shadowchat-mobile-chat-footer-expanded-height')
    }
  }, [collapseNavOnKeyboard])

  return (
    <div
      ref={footerRef}
      className="fixed inset-x-0 bottom-[var(--shadowchat-mobile-chat-footer-bottom)] z-50 flex flex-col border-t border-[var(--border-panel)] [background:var(--mobile-footer-bg)] shadow-[var(--mobile-footer-shadow)] md:hidden"
      data-mobile-chat-footer="true"
      data-android-keyboard-lift={disableAndroidKeyboardLift ? 'disabled' : 'enabled'}
      style={footerStyle}
    >
      <div ref={contentRef} data-mobile-chat-footer-content="true">
        {children}
      </div>
      <div ref={navRef} className={collapseNavOnKeyboard ? 'mobile-keyboard-nav' : undefined} data-mobile-chat-footer-nav="true">
        <MobileNav
          currentView={currentView}
          onViewChange={onViewChange}
          className="static"
          embedded
        />
      </div>
    </div>
  )
}

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthGuard } from './components/auth/AuthGuard'
import { Sidebar } from './components/layout/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { MessagesProvider } from './hooks/useMessages'
import { DirectMessagesProvider } from './hooks/useDirectMessages'
import { MobileNav } from './components/layout/MobileNav'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useMessageNotifications } from './hooks/useMessageNotifications'
import { ClientResetProvider } from './hooks/ClientResetContext'
import { SoundEffectsProvider } from './hooks/useSoundEffects'
import { LoadingSpinner } from './components/ui/LoadingSpinner'
import { AppBadgeSync } from './components/notifications/AppBadgeSync'
import { PhoneInstallOnboarding } from './components/onboarding/PhoneInstallOnboarding'
import { useSessionResumeRecovery } from './hooks/useSessionResumeRecovery'
import { useAdminRoleNotifications } from './hooks/useAdminRoleNotifications'
import { useChannelBanExpirySweep } from './hooks/useChannelBanExpirySweep'
import { useArtBoardReactionNotifications } from './hooks/useArtBoardReactionNotifications'
import { useTheme } from './hooks/useTheme'
import { computeMobileViewportState } from './lib/mobileViewport'

const DirectMessagesView = lazy(() =>
  import('./components/dms/DirectMessagesView').then(module => ({
    default: module.DirectMessagesView,
  }))
)

const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then(module => ({
    default: module.SettingsView,
  }))
)

const BoardsView = lazy(() =>
  import('./components/boards/BoardsView').then(module => ({
    default: module.BoardsView,
  }))
)

type View = 'chat' | 'dms' | 'boards' | 'settings'
type LocationState = {
  view: View
  conversation: string | null
  message: string | null
}

const isView = (value: string | null): value is View => (
  value === 'chat' || value === 'dms' || value === 'boards' || value === 'settings'
)

const normalizeViewParam = (value: string | null): View | null => {
  if (value === 'news') return 'boards'
  if (isView(value)) return value
  return null
}

const getLocationStateFromUrl = (url: URL): LocationState => {
  const params = new URLSearchParams(url.search)
  const nextView = params.get('view')
  const view = nextView === 'profile'
    ? 'settings'
    : normalizeViewParam(nextView) ?? ('chat' as View)

  return {
    view,
    conversation: view === 'dms' ? params.get('conversation') : null,
    message: view === 'dms' || view === 'chat' ? params.get('message') : null,
  }
}

const getInitialLocationState = (): LocationState => {
  if (typeof window === 'undefined') {
    return { view: 'chat', conversation: null, message: null }
  }

  return getLocationStateFromUrl(new URL(window.location.href))
}

function ViewLoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,var(--bg-app-radial),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))]">
      <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-7 text-center text-[var(--text-muted)]">
        <div className="mb-3 flex justify-center">
          <LoadingSpinner size="lg" className="text-[var(--text-gold)]" />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">Loading Shado...</p>
      </div>
    </div>
  )
}

function App() {
  useSessionResumeRecovery()
  useAdminRoleNotifications()
  useChannelBanExpirySweep()
  useArtBoardReactionNotifications()
  const { scheme, setScheme, mode } = useTheme()
  const [currentView, setCurrentView] = useState<View>(() => getInitialLocationState().view)
  const [boardsResetKey, setBoardsResetKey] = useState(0)
  const [boardsChatFooterActive, setBoardsChatFooterActive] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const mobileAppHeightRef = useRef<number | null>(null)
  const [dmTarget, setDmTarget] = useState<string | null>(() => getInitialLocationState().conversation)
  const [messageTarget, setMessageTarget] = useState<string | null>(() => getInitialLocationState().message)
  const isDarkMode = mode === 'dark'

  useEffect(() => {
    if (typeof window === 'undefined' || isDesktop) return

    const root = document.documentElement
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const isIOS =
      /iPad|iPhone|iPod/.test(nav.userAgent) ||
      (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
    let frameId: number | null = null
    let settleTimerIds: number[] = []

    const isEditableFocused = () => {
      const activeElement = document.activeElement
      return (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      )
    }

    const updateMobileViewport = () => {
      const viewport = window.visualViewport
      const layoutHeight = window.innerHeight
      const viewportHeight = viewport?.height ?? window.innerHeight
      const viewportOffsetTop = viewport?.offsetTop ?? 0
      const viewportState = computeMobileViewportState({
        layoutHeight,
        visualViewportHeight: viewportHeight,
        visualViewportOffsetTop: viewportOffsetTop,
        isIOS,
        editableFocused: isEditableFocused(),
        previousStableAppHeight: mobileAppHeightRef.current,
      })
      mobileAppHeightRef.current = viewportState.stableAppHeight

      root.style.setProperty('--shadowchat-app-height', `${viewportState.appHeight}px`)
      root.style.setProperty('--shadowchat-visual-viewport-height', `${viewportState.visualViewportHeight}px`)
      root.style.setProperty('--shadowchat-keyboard-inset', `${viewportState.keyboardInset}px`)
      root.style.setProperty('--shadowchat-mobile-scroll-keyboard-inset', `${viewportState.scrollKeyboardInset}px`)
      root.style.setProperty('--shadowchat-toast-top', `calc(${viewportOffsetTop}px + env(safe-area-inset-top) + ${viewportState.toastTopRem}rem)`)
      root.style.setProperty('--shadowchat-toast-top-space', `${viewportState.toastTopSpacePx}px`)
    }

    const scheduleMobileViewportUpdate = () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      settleTimerIds.forEach(timerId => window.clearTimeout(timerId))
      settleTimerIds = []

      frameId = requestAnimationFrame(() => {
        frameId = null
        updateMobileViewport()
        settleTimerIds = [80, 180, 320].map(delay =>
          window.setTimeout(updateMobileViewport, delay)
        )
      })
    }

    scheduleMobileViewportUpdate()
    const handleOrientationChange = () => {
      mobileAppHeightRef.current = null
      scheduleMobileViewportUpdate()
    }

    window.visualViewport?.addEventListener('resize', scheduleMobileViewportUpdate)
    window.visualViewport?.addEventListener('scroll', scheduleMobileViewportUpdate)
    window.addEventListener('resize', scheduleMobileViewportUpdate)
    window.addEventListener('orientationchange', handleOrientationChange)
    window.addEventListener('focusin', scheduleMobileViewportUpdate)
    window.addEventListener('focusout', scheduleMobileViewportUpdate)
    window.addEventListener('pageshow', scheduleMobileViewportUpdate)

    return () => {
      window.visualViewport?.removeEventListener('resize', scheduleMobileViewportUpdate)
      window.visualViewport?.removeEventListener('scroll', scheduleMobileViewportUpdate)
      window.removeEventListener('resize', scheduleMobileViewportUpdate)
      window.removeEventListener('orientationchange', handleOrientationChange)
      window.removeEventListener('focusin', scheduleMobileViewportUpdate)
      window.removeEventListener('focusout', scheduleMobileViewportUpdate)
      window.removeEventListener('pageshow', scheduleMobileViewportUpdate)
      if (frameId !== null) {
        cancelAnimationFrame(frameId)
      }
      settleTimerIds.forEach(timerId => window.clearTimeout(timerId))
      root.style.removeProperty('--shadowchat-visual-viewport-height')
      root.style.removeProperty('--shadowchat-app-height')
      root.style.removeProperty('--shadowchat-keyboard-inset')
      root.style.removeProperty('--shadowchat-mobile-scroll-keyboard-inset')
      root.style.removeProperty('--shadowchat-toast-top')
      root.style.removeProperty('--shadowchat-toast-top-space')
    }
  }, [isDesktop])


  const toggleDarkMode = () => {
    setScheme(scheme === 'moonstone-light' ? 'obsidian-gold' : 'moonstone-light')
  }

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev)
  }

  const applyLocationState = useCallback((locationState: LocationState) => {
    setCurrentView(locationState.view)
    setDmTarget(locationState.conversation)
    setMessageTarget(locationState.message)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const applyUrlState = () => {
      applyLocationState(getLocationStateFromUrl(new URL(window.location.href)))
    }

    const applyServiceWorkerNotificationClick = (event: MessageEvent) => {
      if (event.data?.type !== 'SHADOWCHAT_NOTIFICATION_CLICK') {
        return
      }

      const route = event.data.targetHref || event.data.targetUrl || event.data.data?.route || event.data.data?.url
      if (typeof route !== 'string') {
        return
      }

      const nextUrl = new URL(route, window.location.origin)
      if (nextUrl.origin !== window.location.origin) {
        return
      }

      window.history.replaceState({}, '', nextUrl)
      applyLocationState(getLocationStateFromUrl(nextUrl))
    }

    window.addEventListener('popstate', applyUrlState)
    window.addEventListener('pageshow', applyUrlState)
    navigator.serviceWorker?.addEventListener('message', applyServiceWorkerNotificationClick)

    return () => {
      window.removeEventListener('popstate', applyUrlState)
      window.removeEventListener('pageshow', applyUrlState)
      navigator.serviceWorker?.removeEventListener('message', applyServiceWorkerNotificationClick)
    }
  }, [applyLocationState])

  useMessageNotifications((conversationId) => {
    setDmTarget(conversationId)
    setMessageTarget(null)
    setCurrentView('dms')
  })

  const closeSidebar = () => setSidebarOpen(false)

  const handleViewChange = (view: View) => {
    if (view === 'boards') {
      setBoardsResetKey(value => value + 1)
    }
    setCurrentView(view)
    if (view !== 'dms') {
      setDmTarget(null)
    }
    if (view !== currentView) {
      setMessageTarget(null)
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)

    if (currentView === 'chat') {
      if (messageTarget) {
        url.searchParams.set('view', 'chat')
        url.searchParams.set('message', messageTarget)
      } else {
        url.searchParams.delete('view')
        url.searchParams.delete('message')
      }
      url.searchParams.delete('conversation')
    } else {
      url.searchParams.set('view', currentView)
      if (currentView === 'dms' && dmTarget) {
        url.searchParams.set('conversation', dmTarget)
      } else {
        url.searchParams.delete('conversation')
      }
      if (messageTarget) {
        url.searchParams.set('message', messageTarget)
      } else {
        url.searchParams.delete('message')
      }
    }

    window.history.replaceState({}, '', url)
  }, [currentView, dmTarget, messageTarget])

  useEffect(() => {
    if (currentView !== 'boards') {
      setBoardsChatFooterActive(false)
    }
  }, [currentView])

  const renderCurrentView = () => {
    switch (currentView) {
      case 'chat':
        return (
          <ChatView
            currentView={currentView}
            onViewChange={handleViewChange}
            initialMessageId={messageTarget || undefined}
          />
        )
      case 'dms':
        return (
          <DirectMessagesView
            onToggleSidebar={toggleSidebar}
            currentView={currentView}
            onViewChange={handleViewChange}
            initialConversation={dmTarget || undefined}
            initialMessageId={messageTarget || undefined}
          />
        )
      case 'boards':
        return (
          <BoardsView
            resetKey={boardsResetKey}
            currentView={currentView}
            onViewChange={handleViewChange}
            onMobileChatActiveChange={setBoardsChatFooterActive}
          />
        )
      case 'settings':
        return <SettingsView onToggleSidebar={toggleSidebar} />
      default:
        return (
          <ChatView
            currentView={currentView}
            onViewChange={handleViewChange}
            initialMessageId={messageTarget || undefined}
          />
        )
    }
  }

  return (
    <>
    <AuthGuard>
      <ClientResetProvider>
        <SoundEffectsProvider>
        <MessagesProvider>
          <DirectMessagesProvider>
          <AppBadgeSync />
          <PhoneInstallOnboarding />
          <div className="app-viewport flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top,var(--bg-app-radial),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] md:flex-row">
          {isDesktop && (
            <Sidebar
              currentView={currentView}
              onViewChange={handleViewChange}
              isDarkMode={isDarkMode}
              onToggleDarkMode={toggleDarkMode}
              isOpen={sidebarOpen}
              onClose={closeSidebar}
            />
          )}

          {isDesktop && sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/40 md:hidden"
              onClick={closeSidebar}
            />
          )}

          <main className="flex-1 flex min-h-0 flex-col min-w-0 overflow-hidden">
            <Suspense fallback={<ViewLoadingState />}>
              {renderCurrentView()}
            </Suspense>
          </main>

          {/* Mobile bottom navigation */}
          {currentView !== 'chat' && currentView !== 'dms' && !(currentView === 'boards' && boardsChatFooterActive) && (
            <MobileNav currentView={currentView} onViewChange={handleViewChange} />
          )}

        </div>
        </DirectMessagesProvider>
      </MessagesProvider>
      </SoundEffectsProvider>
      </ClientResetProvider>
    </AuthGuard>
    <Toaster
      position={isDesktop ? 'top-right' : 'top-center'}
      containerStyle={
        isDesktop
          ? undefined
          : {
              top: 'var(--shadowchat-toast-top, calc(env(safe-area-inset-top) + 4.5rem))',
              left: '1rem',
              right: '1rem',
              maxHeight: 'calc(var(--shadowchat-visual-viewport-height, 100vh) - var(--shadowchat-toast-top-space, 5rem) - 1rem)',
            }
      }
      toastOptions={{
        duration: 4000,
        style: {
          background: isDarkMode ? 'rgba(18, 20, 22, 0.96)' : '#ffffff',
          color: isDarkMode ? '#f6f2e8' : '#111827',
          border: isDarkMode ? '1px solid rgba(255,240,184,0.12)' : '1px solid #e5e7eb',
          boxShadow: isDarkMode ? '0 20px 56px rgba(0,0,0,0.44), 0 0 0 1px rgba(255,240,184,0.03)' : undefined,
          backdropFilter: isDarkMode ? 'blur(18px)' : undefined,
          borderRadius: '18px',
        },
        success: {
          iconTheme: {
            primary: 'var(--state-success)',
            secondary: 'var(--bg-shell)',
          },
          style: {
            border: '1px solid rgba(215,170,70,0.18)',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--state-danger)',
            secondary: 'var(--bg-shell)',
          },
          style: {
            border: '1px solid rgba(180,90,99,0.18)',
          },
        },
        loading: {
          iconTheme: {
            primary: 'var(--gold-accent)',
            secondary: 'var(--bg-shell)',
          },
        },
        blank: {
          iconTheme: {
            primary: 'var(--gold-accent)',
            secondary: 'var(--bg-shell)',
          },
        },
      }}
    />
    </>
  )
}

export default App

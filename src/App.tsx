import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
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
import { ConnectivityBanner } from './components/ui/ConnectivityBanner'
import { LoadingSpinner } from './components/ui/LoadingSpinner'
import { AppBadgeSync } from './components/notifications/AppBadgeSync'
import { PhoneInstallOnboarding } from './components/onboarding/PhoneInstallOnboarding'
import { useSessionResumeRecovery } from './hooks/useSessionResumeRecovery'

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

type View = 'chat' | 'dms' | 'news' | 'settings'
type LocationState = {
  view: View
  conversation: string | null
  message: string | null
}

const isView = (value: string | null): value is View => (
  value === 'chat' || value === 'dms' || value === 'news' || value === 'settings'
)

const getLocationStateFromUrl = (url: URL): LocationState => {
  const params = new URLSearchParams(url.search)
  const nextView = params.get('view')
  const view = nextView === 'profile'
    ? 'settings'
    : isView(nextView) ? nextView : ('chat' as View)

  return {
    view,
    conversation: view === 'dms' ? params.get('conversation') : null,
    message: view === 'dms' || view === 'chat' ? params.get('message') : null,
  }
}

function NewsView() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_26%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] px-4 py-6 pb-[calc(env(safe-area-inset-bottom)_+_6rem)] md:px-8"
    >
      <div className="mx-auto flex h-full w-full max-w-5xl items-center justify-center">
        <div className="glass-panel-strong w-full max-w-xl rounded-[var(--radius-xl)] px-6 py-8 text-center shadow-[var(--shadow-panel-strong)] sm:px-10">
          <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
            ShadowChat News
          </p>
          <h1 className="text-3xl font-semibold text-[var(--text-primary)]">
            Coming Soon
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
            Product updates, release notes, and community announcements will live here.
          </p>
        </div>
      </div>
    </motion.div>
  )
}

const getInitialLocationState = (): LocationState => {
  if (typeof window === 'undefined') {
    return { view: 'chat', conversation: null, message: null }
  }

  return getLocationStateFromUrl(new URL(window.location.href))
}

function ViewLoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.06),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))]">
      <div className="glass-panel rounded-[var(--radius-xl)] px-8 py-7 text-center text-[var(--text-muted)]">
        <div className="mb-3 flex justify-center">
          <LoadingSpinner size="lg" />
        </div>
        <p className="text-sm text-[var(--text-secondary)]">Loading view...</p>
      </div>
    </div>
  )
}

function App() {
  useSessionResumeRecovery()
  const [currentView, setCurrentView] = useState<View>(() => getInitialLocationState().view)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const [dmTarget, setDmTarget] = useState<string | null>(() => getInitialLocationState().conversation)
  const [messageTarget, setMessageTarget] = useState<string | null>(() => getInitialLocationState().message)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('darkMode')
      if (stored) {
        return stored === 'true'
      }
      return true
    }
    return true
  })

  // Apply dark mode class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', isDarkMode.toString())
  }, [isDarkMode])


  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
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
      case 'news':
        return <NewsView />
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
    <AuthGuard>
      <ClientResetProvider>
        <SoundEffectsProvider>
        <MessagesProvider>
          <DirectMessagesProvider>
          <AppBadgeSync />
          <PhoneInstallOnboarding />
          <div className="app-viewport flex flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] md:flex-row">
          <ConnectivityBanner />
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
          {currentView !== 'chat' && currentView !== 'dms' && (
            <MobileNav currentView={currentView} onViewChange={handleViewChange} />
          )}

          <Toaster
            position={isDesktop ? 'top-right' : 'top-center'}
            containerStyle={
              isDesktop
                ? undefined
                : {
                    top: 'calc(env(safe-area-inset-top) + 4.5rem)',
                    left: '1rem',
                    right: '1rem',
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
        </div>
        </DirectMessagesProvider>
      </MessagesProvider>
      </SoundEffectsProvider>
      </ClientResetProvider>
    </AuthGuard>
  )
}

export default App

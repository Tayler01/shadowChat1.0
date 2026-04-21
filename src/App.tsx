import React, { Suspense, lazy, useEffect, useState } from 'react'
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

const DirectMessagesView = lazy(() =>
  import('./components/dms/DirectMessagesView').then(module => ({
    default: module.DirectMessagesView,
  }))
)

const ProfileView = lazy(() =>
  import('./components/profile/ProfileView').then(module => ({
    default: module.ProfileView,
  }))
)

const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then(module => ({
    default: module.SettingsView,
  }))
)

type View = 'chat' | 'dms' | 'profile' | 'settings'

const isView = (value: string | null): value is View => (
  value === 'chat' || value === 'dms' || value === 'profile' || value === 'settings'
)

const getInitialLocationState = () => {
  if (typeof window === 'undefined') {
    return { view: 'chat' as View, conversation: null as string | null }
  }

  const params = new URLSearchParams(window.location.search)
  const nextView = params.get('view')

  return {
    view: isView(nextView) ? nextView : ('chat' as View),
    conversation: nextView === 'dms' ? params.get('conversation') : null,
  }
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
  const [currentView, setCurrentView] = useState<View>(() => getInitialLocationState().view)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const [dmTarget, setDmTarget] = useState<string | null>(() => getInitialLocationState().conversation)
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

  useEffect(() => {
    if (typeof window === 'undefined') return

    const applyUrlState = () => {
      const params = new URLSearchParams(window.location.search)
      const nextView = params.get('view')
      const nextConversation = params.get('conversation')

      if (isView(nextView)) {
        setCurrentView(nextView)
      }

      if (nextView === 'dms' && nextConversation) {
        setDmTarget(nextConversation)
      } else if (nextView !== 'dms') {
        setDmTarget(null)
      }
    }

    window.addEventListener('popstate', applyUrlState)

    return () => {
      window.removeEventListener('popstate', applyUrlState)
    }
  }, [])

  useMessageNotifications((conversationId) => {
    setDmTarget(conversationId)
    setCurrentView('dms')
  })

  const closeSidebar = () => setSidebarOpen(false)

  useEffect(() => {
    if (currentView === 'dms' && dmTarget) {
      setDmTarget(null)
    }
  }, [currentView, dmTarget])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const url = new URL(window.location.href)

    if (currentView === 'chat') {
      url.searchParams.delete('view')
      url.searchParams.delete('conversation')
    } else {
      url.searchParams.set('view', currentView)
      if (currentView === 'dms' && dmTarget) {
        url.searchParams.set('conversation', dmTarget)
      } else {
        url.searchParams.delete('conversation')
      }
    }

    window.history.replaceState({}, '', url)
  }, [currentView, dmTarget])

  const renderCurrentView = () => {
    switch (currentView) {
      case 'chat':
        return (
          <ChatView
            currentView={currentView}
            onViewChange={setCurrentView}
          />
        )
      case 'dms':
        return (
          <DirectMessagesView
            onToggleSidebar={toggleSidebar}
            currentView={currentView}
            onViewChange={setCurrentView}
            initialConversation={dmTarget || undefined}
          />
        )
      case 'profile':
        return <ProfileView onToggleSidebar={toggleSidebar} />
      case 'settings':
        return <SettingsView onToggleSidebar={toggleSidebar} />
      default:
        return (
          <ChatView
            currentView={currentView}
            onViewChange={setCurrentView}
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
          <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_28%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] md:flex-row">
          <ConnectivityBanner />
          {isDesktop && (
            <Sidebar
              currentView={currentView}
              onViewChange={setCurrentView}
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

          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <Suspense fallback={<ViewLoadingState />}>
              {renderCurrentView()}
            </Suspense>
          </main>

          {/* Mobile bottom navigation */}
          {currentView !== 'chat' && currentView !== 'dms' && (
            <MobileNav currentView={currentView} onViewChange={setCurrentView} />
          )}

          <Toaster
            position={isDesktop ? 'top-right' : 'bottom-center'}
            containerStyle={
              isDesktop
                ? undefined
                : {
                    bottom: 'calc(env(safe-area-inset-bottom) + 9rem)',
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

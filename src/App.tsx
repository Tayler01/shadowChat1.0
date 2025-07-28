import React, { useState, useEffect, Suspense } from 'react'
import { AuthGuard } from './components/auth/AuthGuard'
import { Sidebar } from './components/layout/Sidebar'
import { MessagesProvider } from './hooks/useMessages'
import { DirectMessagesProvider } from './hooks/useDirectMessages'
import { MobileNav } from './components/layout/MobileNav'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useMessageNotifications } from './hooks/useMessageNotifications'
import { ClientResetProvider } from './hooks/ClientResetContext'
import { SoundEffectsProvider } from './hooks/useSoundEffects'
import { ConnectivityBanner } from './components/ui/ConnectivityBanner'
import { Toaster } from 'react-hot-toast'

// Lazy-load the heavy view modules so they are only fetched when needed.
const ChatView = React.lazy(() => import('./components/chat/ChatView'))
const DirectMessagesView = React.lazy(() => import('./components/dms/DirectMessagesView'))
const ProfileView = React.lazy(() => import('./components/profile/ProfileView'))
const SettingsView = React.lazy(() => import('./components/settings/SettingsView'))

type View = 'chat' | 'dms' | 'profile' | 'settings'

function App() {
  const [currentView, setCurrentView] = useState<View>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const [dmTarget, setDmTarget] = useState<string | null>(null)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' ||
        (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
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
          <div className="h-screen overflow-hidden flex flex-col md:flex-row bg-gray-100 dark:bg-gray-900">
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
            {/* Defer loading of the selected view until it is requested */}
            <Suspense fallback={<div className="flex-1 flex items-center justify-center">Loading…</div>}>
              {renderCurrentView()}
            </Suspense>
          </main>

          {/* Mobile bottom navigation */}
          {currentView !== 'chat' && currentView !== 'dms' && (
            <MobileNav currentView={currentView} onViewChange={setCurrentView} />
          )}

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: isDarkMode ? '#374151' : '#ffffff',
                color: isDarkMode ? '#f3f4f6' : '#111827',
                border: isDarkMode ? '1px solid #4b5563' : '1px solid #e5e7eb',
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

import React, { useState, useEffect, Suspense, lazy } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthGuard } from './components/auth/AuthGuard'
import { Sidebar } from './components/layout/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { MobileNav } from './components/layout/MobileNav'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useMessageNotifications } from './hooks/useMessageNotifications'
import { ClientResetProvider } from './hooks/ClientResetContext'
import { SoundEffectsProvider } from './hooks/useSoundEffects'
import { ConnectivityBanner } from './components/ui/ConnectivityBanner'
import { MessagesProvider } from './hooks/useMessages'
import { DirectMessagesProvider } from './hooks/useDirectMessages'
import { LoadingSpinner } from './components/ui/LoadingSpinner'

// Lazy load heavy components
const DirectMessagesView = lazy(() => import('./components/dms/DirectMessagesView').then(module => ({ default: module.DirectMessagesView })))
const ProfileView = lazy(() => import('./components/profile/ProfileView').then(module => ({ default: module.ProfileView })))
const SettingsView = lazy(() => import('./components/settings/SettingsView').then(module => ({ default: module.SettingsView })))

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
          <Suspense fallback={<div className="flex items-center justify-center h-full"><LoadingSpinner /></div>}>
            <DirectMessagesView
              onToggleSidebar={toggleSidebar}
              currentView={currentView}
              onViewChange={setCurrentView}
              initialConversation={dmTarget || undefined}
            />
          </Suspense>
        )
      case 'profile':
        return (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><LoadingSpinner /></div>}>
            <ProfileView onToggleSidebar={toggleSidebar} />
          </Suspense>
        )
      case 'settings':
        return (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><LoadingSpinner /></div>}>
            <SettingsView onToggleSidebar={toggleSidebar} />
          </Suspense>
        )
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
            {renderCurrentView()}
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

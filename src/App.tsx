import React, { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthGuard } from './components/auth/AuthGuard'
import { Sidebar } from './components/layout/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { DirectMessagesView } from './components/dms/DirectMessagesView'
import { ProfileView } from './components/profile/ProfileView'
import { SettingsView } from './components/settings/SettingsView'
import { MessagesProvider } from './hooks/useMessages'
import { MobileNav } from './components/layout/MobileNav'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useMessageNotifications } from './hooks/useMessageNotifications'

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
            onToggleSidebar={toggleSidebar}
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
            onToggleSidebar={toggleSidebar}
            currentView={currentView}
            onViewChange={setCurrentView}
          />
        )
    }
  }

  return (
    <AuthGuard>
      <MessagesProvider>
        <div className="h-screen overflow-hidden flex flex-col md:flex-row bg-gray-100 dark:bg-gray-900">
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
      </MessagesProvider>
    </AuthGuard>
  )
}

export default App

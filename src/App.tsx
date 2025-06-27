import React, { useState, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthGuard } from './components/auth/AuthGuard'
import { Sidebar } from './components/layout/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { DirectMessagesView } from './components/dms/DirectMessagesView'
import { ProfileView } from './components/profile/ProfileView'
import { SettingsView } from './components/settings/SettingsView'
import { useAuth } from './hooks/useAuth'
import { MessagesProvider } from './hooks/useMessages'
import { updateUserPresence } from './lib/supabase'
import { MobileNav } from './components/layout/MobileNav'

type View = 'chat' | 'dms' | 'profile' | 'settings'

function App() {
  const { user } = useAuth()
  const [currentView, setCurrentView] = useState<View>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)
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

  // Update user presence periodically
  useEffect(() => {
    if (!user) return

    // Update presence immediately
    updateUserPresence()

    // Set up periodic presence updates
    const interval = setInterval(() => {
      updateUserPresence()
    }, parseInt(import.meta.env.VITE_PRESENCE_INTERVAL_MS || '30000'))

    return () => clearInterval(interval)
  }, [user])

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
  }

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev)
  }

  const closeSidebar = () => setSidebarOpen(false)

  const renderCurrentView = () => {
    switch (currentView) {
      case 'chat':
        return <ChatView onToggleSidebar={toggleSidebar} />
      case 'dms':
        return <DirectMessagesView onToggleSidebar={toggleSidebar} />
      case 'profile':
        return <ProfileView onToggleSidebar={toggleSidebar} />
      case 'settings':
        return <SettingsView onToggleSidebar={toggleSidebar} />
      default:
        return <ChatView onToggleSidebar={toggleSidebar} />
    }
  }

  return (
    <AuthGuard>
      <MessagesProvider>
        <div className="h-screen flex flex-col md:flex-row bg-gray-100 dark:bg-gray-900">
          <Sidebar
            currentView={currentView}
            onViewChange={setCurrentView}
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleDarkMode}
            isOpen={sidebarOpen}
            onClose={closeSidebar}
          />

          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/40 md:hidden"
              onClick={closeSidebar}
            />
          )}

          <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
            {renderCurrentView()}
          </main>

          {/* Mobile bottom navigation */}
          <MobileNav currentView={currentView} onViewChange={setCurrentView} />

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

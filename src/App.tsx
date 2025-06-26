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

type View = 'chat' | 'dms' | 'profile' | 'settings'

function App() {
  const { user } = useAuth()
  const [currentView, setCurrentView] = useState<View>('chat')
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

  const renderCurrentView = () => {
    switch (currentView) {
      case 'chat':
        return <ChatView />
      case 'dms':
        return <DirectMessagesView />
      case 'profile':
        return <ProfileView />
      case 'settings':
        return <SettingsView />
      default:
        return <ChatView />
    }
  }

  return (
    <AuthGuard>
      <MessagesProvider>
        <div className="h-screen flex bg-gray-100 dark:bg-gray-900">
          <Sidebar
            currentView={currentView}
            onViewChange={setCurrentView}
            isDarkMode={isDarkMode}
            onToggleDarkMode={toggleDarkMode}
          />

          <main className="flex-1 flex flex-col min-w-0">
            {renderCurrentView()}
          </main>

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

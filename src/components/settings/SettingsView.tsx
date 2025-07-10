import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Palette,
  Shield,
  Database,
  Download,
  Trash2,
  AlertTriangle,
  Menu,
  Brain
} from 'lucide-react'
import { Button } from '../ui/Button'
import { useAuth } from '../../hooks/useAuth'
import toast from 'react-hot-toast'
import { useTheme, colorSchemes, ColorScheme } from '../../hooks/useTheme'
import { usePushNotifications } from '../../hooks/usePushNotifications'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useSuggestionsEnabled } from '../../hooks/useSuggestedReplies'
import { useToneAnalysisEnabled } from '../../hooks/useToneAnalysisEnabled'

interface SettingsViewProps {
  onToggleSidebar: () => void
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onToggleSidebar }) => {
  const { enabled: notifications, setEnabled: setNotifications } =
    usePushNotifications()
  const [sounds, setSounds] = useState(true)
  const [showDangerZone, setShowDangerZone] = useState(false)
  const { scheme, setScheme } = useTheme()
  const isDesktop = useIsDesktop()
  const { signOut } = useAuth()
  const { enabled: suggestionsEnabled, setEnabled: setSuggestionsEnabled } = useSuggestionsEnabled()
  const { enabled: toneEnabled, setEnabled: setToneEnabled } = useToneAnalysisEnabled()

  const handleExportData = () => {
    toast.success('Data export started - you will receive an email when ready')
  }

  const handleDeleteAccount = () => {
    toast.error('Account deletion is not implemented in this demo')
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      toast.success('Signed out successfully')
    } catch {
      toast.error('Failed to sign out')
    }
  }

  const settingSections = [
    {
      title: 'Notifications',
      icon: Bell,
      settings: [
        {
          label: 'Push Notifications',
          description: 'Receive notifications for new messages',
          enabled: notifications,
          onChange: setNotifications
        }
      ]
    },
    {
      title: 'Audio',
      icon: Volume2,
      settings: [
        {
          label: 'Sound Effects',
          description: 'Play sounds for message notifications',
          enabled: sounds,
          onChange: setSounds
        }
      ]
    },
    {
      title: 'AI',
      icon: Brain,
      settings: [
        {
          label: 'Suggested Replies',
          description: 'Show AI generated reply suggestions',
          enabled: suggestionsEnabled,
          onChange: setSuggestionsEnabled
        },
        {
          label: 'Tone Indicators',
          description: 'Show emoji tone of each message',
          enabled: toneEnabled,
          onChange: setToneEnabled
        }
      ]
    }
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 pb-[calc(env(safe-area-inset-bottom)_+_8rem)] md:pb-[calc(env(safe-area-inset-bottom)_+_4rem)]"
    >
      <div className="max-w-2xl mx-auto p-6">
        {isDesktop && (
          <button
            onClick={onToggleSidebar}
            className="p-2 -ml-2 mb-2"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Settings
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage your account preferences and app settings
          </p>
        </div>

        {/* Settings Sections */}
        <div className="space-y-6">
          {settingSections.map((section) => (
            <div
              key={section.title}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6"
            >
              <div className="flex items-center space-x-3 mb-4">
                <section.icon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {section.title}
                </h2>
              </div>

              <div className="space-y-4">
                {section.settings.map((setting) => (
                  <div key={setting.label} className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">
                        {setting.label}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {setting.description}
                      </p>
                    </div>
                    
                    <button
                      onClick={() => setting.onChange(!setting.enabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        setting.enabled
                          ? 'bg-[var(--color-accent)]'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                      aria-label={`Toggle ${setting.label}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          setting.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Appearance */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Palette className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Color Scheme
              </h2>
            </div>
            <div className="flex space-x-4">
              {(Object.keys(colorSchemes) as ColorScheme[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setScheme(key)}
                  className={`w-8 h-8 rounded-full border-2 ${scheme === key ? 'border-[var(--color-accent)]' : 'border-transparent'}`}
                  style={{ background: `linear-gradient(to right, ${colorSchemes[key].start}, ${colorSchemes[key].end})` }}
                  aria-label={`Select ${key} color scheme`}
                />
              ))}
            </div>
          </div>

          {/* Data & Privacy */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Database className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Data & Privacy
              </h2>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleExportData}
                variant="secondary"
                className="w-full justify-start"
              >
                <Download className="w-4 h-4 mr-3" />
                Export My Data
              </Button>
            </div>
          </div>

          {/* Account */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center space-x-3 mb-4">
              <Shield className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Account
              </h2>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleSignOut}
                variant="secondary"
                className="w-full justify-start"
              >
                Sign Out
              </Button>

              <Button
                onClick={() => setShowDangerZone(!showDangerZone)}
                variant="ghost"
                className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
              >
                <AlertTriangle className="w-4 h-4 mr-3" />
                Danger Zone
              </Button>

              {showDangerZone && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="border border-red-200 dark:border-red-800 rounded-lg p-4 bg-red-50 dark:bg-red-900/20"
                >
                  <h3 className="font-medium text-red-800 dark:text-red-200 mb-2">
                    Delete Account
                  </h3>
                  <p className="text-sm text-red-600 dark:text-red-300 mb-4">
                    This action cannot be undone. All your messages and data will be permanently deleted.
                  </p>
                  <Button
                    onClick={handleDeleteAccount}
                    variant="danger"
                    size="sm"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Account
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

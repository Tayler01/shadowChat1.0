import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Camera, Edit3, Save, X, Upload, Menu } from 'lucide-react'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useAuth } from '../../hooks/useAuth'
import { fetchUserStats } from '../../lib/supabase'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import toast from 'react-hot-toast'
import type { UserStatus } from '../../types'

const statusOptions: { value: UserStatus; label: string; color: string }[] = [
  { value: 'online', label: 'Online', color: 'bg-green-500' },
  { value: 'away', label: 'Away', color: 'bg-yellow-500' },
  { value: 'busy', label: 'Busy', color: 'bg-red-500' },
  { value: 'offline', label: 'Offline', color: 'bg-gray-500' }
]

const colorOptions = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1'
]

interface ProfileViewProps {
  onToggleSidebar: () => void
}

interface ProfileFormData {
  display_name: string
  status_message: string
  status: UserStatus
  color: string
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onToggleSidebar }) => {
  const { profile, updateProfile, uploadAvatar, uploadBanner } = useAuth()
  const isDesktop = useIsDesktop()
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [stats, setStats] = useState({ messages: 0, reactions: 0, friends: 0 })
  const avatarInputRef = React.useRef<HTMLInputElement>(null)
  const bannerInputRef = React.useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState<ProfileFormData>({
    display_name: profile?.display_name || '',
    status_message: profile?.status_message || '',
    status: profile?.status || 'online',
    color: profile?.color || '#3B82F6'
  })

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!profile) return
      try {
        const counts = await fetchUserStats(profile.id)
        if (active) setStats(counts)
      } catch {
        // ignore
      }
    }
    load()
    return () => { active = false }
  }, [profile])

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      await uploadAvatar(file)
      toast.success('Avatar updated!')
    } catch {
      toast.error('Failed to upload avatar')
    } finally {
      setUploadingAvatar(false)
      e.target.value = ''
    }
  }

  const handleBannerChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingBanner(true)
    try {
      await uploadBanner(file)
      toast.success('Banner updated!')
    } catch {
      toast.error('Failed to upload banner')
    } finally {
      setUploadingBanner(false)
      e.target.value = ''
    }
  }

  const handleSave = async () => {
    if (!profile) return

    setLoading(true)
    try {
      await updateProfile(formData)
      setIsEditing(false)
      toast.success('Profile updated successfully!')
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      display_name: profile?.display_name || '',
      status_message: profile?.status_message || '',
      status: profile?.status || 'online',
      color: profile?.color || '#3B82F6'
    })
    setIsEditing(false)
  }

  if (!profile) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 pb-16"
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
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Banner */}
          <div className="h-32 relative">
            {profile.banner_url ? (
              <img src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-blue-500 to-purple-600" />
            )}
            <button
              className="absolute top-4 right-4 p-2 bg-black bg-opacity-20 rounded-lg text-white hover:bg-opacity-30 transition-colors"
              aria-label="Change banner image"
              onClick={() => bannerInputRef.current?.click()}
            >
              {uploadingBanner ? <LoadingSpinner size="sm" /> : <Camera className="w-4 h-4" />}
            </button>
            <input
              type="file"
              accept="image/*"
              ref={bannerInputRef}
              onChange={handleBannerChange}
              className="hidden"
            />
          </div>

          {/* Profile Info */}
          <div className="relative px-6 pb-6">
            <div className="flex items-end justify-between -mt-16 mb-4">
              <div className="relative">
                <Avatar
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  size="xl"
                  color={profile.color}
                  className="border-4 border-white dark:border-gray-800"
                />
                <button
                  className="absolute bottom-0 right-0 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
                  aria-label="Change avatar"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  {uploadingAvatar ? <LoadingSpinner size="sm" /> : <Camera className="w-3 h-3" />}
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={avatarInputRef}
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>

              <Button
                onClick={() => setIsEditing(!isEditing)}
                variant={isEditing ? 'ghost' : 'secondary'}
                size="sm"
              >
                {isEditing ? (
                  <>
                    <X className="w-4 h-4 mr-2" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Edit3 className="w-4 h-4 mr-2" />
                    Edit Profile
                  </>
                )}
              </Button>
            </div>

            {/* Profile Details */}
            <div className="space-y-4">
              {isEditing ? (
                <div className="space-y-4">
                  <Input
                    label="Display Name"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    placeholder="Enter your display name"
                  />

                  <Input
                    label="Status Message"
                    value={formData.status_message}
                    onChange={(e) => setFormData(prev => ({ ...prev, status_message: e.target.value }))}
                    placeholder="What's on your mind?"
                  />

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Status
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {statusOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setFormData(prev => ({ ...prev, status: option.value }))}
                          className={`p-3 rounded-lg border-2 transition-colors ${
                            formData.status === option.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full ${option.color}`} />
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {option.label}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Chat Color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color}
                          onClick={() => setFormData(prev => ({ ...prev, color }))}
                          className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                            formData.color === color
                              ? 'border-gray-900 dark:border-gray-100 scale-110'
                              : 'border-gray-300 dark:border-gray-600'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <Button
                      onClick={handleSave}
                      loading={loading}
                      className="flex-1"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                    <Button
                      onClick={handleCancel}
                      variant="ghost"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {profile.display_name}
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">
                      @{profile.username}
                    </p>
                  </div>

                  {profile.status_message && (
                    <div className="p-4 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <p className="text-gray-700 dark:text-gray-300">
                        {profile.status_message}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        statusOptions.find(s => s.value === profile.status)?.color || 'bg-gray-500'
                      }`} />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {statusOptions.find(s => s.value === profile.status)?.label || 'Unknown'}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: profile.color }}
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Chat Color
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Member since {new Date(profile.created_at).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.messages}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Messages</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.reactions}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Reactions</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center border border-gray-200 dark:border-gray-700">
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.friends}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Friends</div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

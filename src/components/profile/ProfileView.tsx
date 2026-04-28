import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Camera, Edit3, Save, X, Menu } from 'lucide-react'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useAuth } from '../../hooks/useAuth'
import { fetchUserStats } from '../../lib/supabase'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import toast from 'react-hot-toast'
import type { UserStatus } from '../../types'
import { getPresenceOption, presenceOptions } from '../../lib/presence'

const colorOptions = [
  '#d7aa46', '#c99642', '#b88646', '#9f7340', '#8f6a37',
  '#c8b08a', '#b59f7f', '#a47b58', '#7b694b', '#5d4a38'
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
    color: profile?.color || '#d7aa46'
  })

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!profile) return
      try {
        const counts = await fetchUserStats(profile.id)
        if (active) setStats(counts)
      } catch (err) {
        console.error(err)
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
    } catch (err) {
      console.error(err)
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
    } catch (err) {
      console.error(err)
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
    } catch (err) {
      console.error(err)
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
      color: profile?.color || '#d7aa46'
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
      className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_26%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
    >
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        {isDesktop && (
          <button
            onClick={onToggleSidebar}
            className="mb-2 -ml-2 rounded-[var(--radius-sm)] p-2 text-[var(--text-secondary)] transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        {/* Header */}
        <div className="glass-panel-strong overflow-hidden rounded-[var(--radius-xl)]">
          {/* Banner */}
          <div className="h-32 relative">
            {profile.banner_url ? (
              <img src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(255,240,184,0.18),transparent_26%),linear-gradient(135deg,#17191c,#0f1112_58%,#34250c)]" />
            )}
            <button
              className="absolute right-4 top-4 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.35)] p-2 text-[var(--text-primary)] transition-colors hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
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
          <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
            <div className="-mt-16 mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="relative">
                <Avatar
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  size="xl"
                  color={profile.color}
                  className="border-4 border-[var(--bg-panel-strong)]"
                />
                <button
                  className="absolute bottom-0 right-0 rounded-full border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(255,240,184,0.18),rgba(215,170,70,0.12)_36%,rgba(122,89,24,0.5)_100%)] p-1.5 text-[var(--text-gold)] shadow-[var(--shadow-gold-soft)] transition-transform hover:-translate-y-0.5"
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
                className="w-full sm:w-auto"
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
                    <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                      Status
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {presenceOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => setFormData(prev => ({ ...prev, status: option.value }))}
                          className={`rounded-[var(--radius-md)] border p-3 transition-colors ${
                            formData.status === option.value
                              ? option.selectedClass
                              : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-panel)] hover:bg-[rgba(255,255,255,0.05)]'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 rounded-full ${option.dotClass}`} />
                            <span className="text-sm font-medium text-[var(--text-primary)]">
                              {option.label}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                      Chat Color
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {colorOptions.map((color) => (
                        <button
                          key={color}
                          onClick={() => setFormData(prev => ({ ...prev, color }))}
                          className={`h-8 w-8 rounded-full border-2 transition-transform hover:scale-110 ${
                            formData.color === color
                              ? 'scale-110 border-[var(--gold-5)]'
                              : 'border-[var(--border-panel)]'
                          }`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col space-y-3 pt-4 sm:flex-row sm:space-x-3 sm:space-y-0">
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
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                      {profile.display_name}
                    </h1>
                    <p className="text-[var(--text-muted)]">
                      @{profile.username}
                    </p>
                  </div>

                  {profile.status_message && (
                    <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-4">
                      <p className="text-[var(--text-secondary)]">
                        {profile.status_message}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${getPresenceOption(profile.status).dotClass}`} />
                      <span className="text-sm text-[var(--text-secondary)]">
                        {getPresenceOption(profile.status).label}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-4 h-4 rounded-full border"
                        style={{ backgroundColor: profile.color }}
                      />
                      <span className="text-sm text-[var(--text-secondary)]">
                        Chat Color
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-[var(--text-muted)]">
                    Member since {new Date(profile.created_at).toLocaleDateString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="glass-panel rounded-[var(--radius-lg)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.messages}</div>
            <div className="text-sm text-[var(--text-muted)]">Messages</div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              {stats.messages > 0 ? 'Your chat history is building momentum.' : 'Send a few messages to bring this card to life.'}
            </div>
          </div>
          <div className="glass-panel rounded-[var(--radius-lg)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.reactions}</div>
            <div className="text-sm text-[var(--text-muted)]">Reactions</div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              {stats.reactions > 0 ? 'People are already engaging with your posts.' : 'Reactions will show up here once people engage with you.'}
            </div>
          </div>
          <div className="glass-panel rounded-[var(--radius-lg)] p-4 text-center">
            <div className="text-2xl font-bold text-[var(--text-primary)]">{stats.friends}</div>
            <div className="text-sm text-[var(--text-muted)]">Friends</div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              {stats.friends > 0 ? 'Your network is growing.' : 'Start a few DMs to build your private circle.'}
            </div>
          </div>
        </div>

        {!isEditing && (
          <div className="mt-6 grid gap-4 md:grid-cols-[1.4fr_1fr]">
            <div className="glass-panel rounded-[var(--radius-lg)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Identity</h2>
                  <p className="text-sm text-[var(--text-muted)]">The details people see when they open your profile.</p>
                </div>
                <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                  Public card
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Display name</div>
                  <div className="mt-2 text-base font-medium text-[var(--text-primary)]">{profile.display_name}</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Username</div>
                  <div className="mt-2 text-base font-medium text-[var(--text-primary)]">@{profile.username}</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 sm:col-span-2">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Status message</div>
                  <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    {profile.status_message?.trim() || 'No custom status message set yet.'}
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-[var(--radius-lg)] p-5">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Presence & Style</h2>
                <p className="text-sm text-[var(--text-muted)]">How your profile appears around the app.</p>
              </div>

              <div className="space-y-3">
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Current status</div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <div className={`h-3 w-3 rounded-full ${getPresenceOption(profile.status).dotClass}`} />
                    <span>{getPresenceOption(profile.status).label}</span>
                  </div>
                </div>

                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Chat color</div>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      className="h-8 w-8 rounded-full border border-white/10 shadow-[var(--shadow-panel)]"
                      style={{ backgroundColor: profile.color }}
                    />
                    <span className="text-sm text-[var(--text-secondary)]">Used for your presence accents and profile avatar.</span>
                  </div>
                </div>

                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Member since</div>
                  <div className="mt-2 text-sm text-[var(--text-primary)]">
                    {new Date(profile.created_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

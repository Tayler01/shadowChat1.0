import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Camera, Edit3, Eye, Ghost, Save, X, Menu } from 'lucide-react'
import { useIsDesktop } from '../../hooks/useIsDesktop'
import { useAuth } from '../../hooks/useAuth'
import { fetchUserStats } from '../../lib/supabase'
import { getPresenceStateLabel, usePresenceForUser } from '../../hooks/usePresence'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { UserRoleBadge } from '../ui/UserRoleBadge'
import { UserPresenceBadge } from '../ui/UserPresenceBadge'
import toast from 'react-hot-toast'
import type { PresenceVisibility } from '../../types'

const colorOptions = [
  '#d7aa46', '#c99642', '#b88646', '#9f7340', '#8f6a37',
  '#c8b08a', '#b59f7f', '#a47b58', '#7b694b', '#5d4a38'
]

interface ProfileViewProps {
  onToggleSidebar: () => void
  embedded?: boolean
}

interface ProfileFormData {
  display_name: string
  status_message: string
  presence_visibility: PresenceVisibility
  color: string
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onToggleSidebar, embedded = false }) => {
  const { profile, updateProfile, uploadAvatar, uploadBanner } = useAuth()
  const myPresence = usePresenceForUser(profile?.id)
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
    presence_visibility: profile?.presence_visibility || 'tracked',
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

  useEffect(() => {
    if (!profile || isEditing) return

    setFormData({
      display_name: profile.display_name || '',
      status_message: profile.status_message || '',
      presence_visibility: profile.presence_visibility || 'tracked',
      color: profile.color || '#d7aa46',
    })
  }, [isEditing, profile])

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
      presence_visibility: profile?.presence_visibility || 'tracked',
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

  const presenceState =
    myPresence?.presence_state ||
    (profile.presence_visibility === 'invisible' ? 'invisible' : 'offline')
  const presenceLabel = getPresenceStateLabel(presenceState)

  const content = (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      {isDesktop && !embedded && (
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
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[rgba(255,240,184,0.46)] bg-[linear-gradient(180deg,rgba(255,240,184,0.24),rgba(215,170,70,0.18)_42%,rgba(43,30,8,0.78)_100%)] p-0 text-[var(--text-gold)] shadow-[0_10px_24px_rgba(0,0,0,0.38),0_0_0_1px_rgba(215,170,70,0.1)] transition-all hover:-translate-y-0.5 hover:border-[rgba(255,240,184,0.72)] hover:text-[rgb(255,240,184)]"
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
            <div className="relative inline-flex h-20 w-20 items-center justify-center">
              <Avatar
                src={profile.avatar_url}
                alt={profile.display_name}
                size="xl"
                color={profile.color}
                userId={profile.id}
                presenceVisibility={profile.presence_visibility}
                showStatus
                className="border-4 border-[var(--bg-panel-strong)] shadow-[0_12px_28px_rgba(0,0,0,0.34)]"
              />
              <button
                className="absolute -bottom-2 right-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,240,184,0.58)] bg-[linear-gradient(180deg,rgba(255,240,184,0.28),rgba(215,170,70,0.2)_42%,rgba(80,55,13,0.88)_100%)] p-0 text-[rgb(255,240,184)] shadow-[0_10px_22px_rgba(0,0,0,0.42),var(--shadow-gold-soft)] transition-all hover:-translate-y-0.5 hover:border-[rgba(255,248,220,0.82)]"
                aria-label="Change avatar"
                onClick={() => avatarInputRef.current?.click()}
              >
                {uploadingAvatar ? <LoadingSpinner size="sm" /> : <Camera className="h-4 w-4" />}
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

                <label className="block space-y-1">
                  <span className="block text-sm font-medium text-[var(--text-secondary)]">
                    Bio
                  </span>
                  <textarea
                    value={formData.status_message}
                    onChange={(e) => setFormData(prev => ({ ...prev, status_message: e.target.value }))}
                    maxLength={280}
                    rows={4}
                    placeholder="Tell people who you are, what you are working on, or what you want them to know."
                    className="obsidian-input min-h-[7rem] w-full resize-y rounded-[var(--radius-sm)] px-3.5 py-2.5 leading-6 placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                  <span className="block text-right text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {formData.status_message.length}/280
                  </span>
                </label>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">
                    Presence
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, presence_visibility: 'tracked' }))}
                      className={`rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                        formData.presence_visibility === 'tracked'
                          ? 'border-[#22c55e]/70 bg-[#22c55e]/10 shadow-[0_0_0_1px_rgba(34,197,94,0.22),0_8px_24px_rgba(34,197,94,0.14)]'
                          : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-panel)] hover:bg-[rgba(255,255,255,0.05)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="h-3 w-3 rounded-full bg-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.55)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          Track active
                        </span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, presence_visibility: 'invisible' }))}
                      className={`rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                        formData.presence_visibility === 'invisible'
                          ? 'border-[rgba(213,220,232,0.58)] bg-[rgba(255,255,255,0.08)] shadow-[0_0_0_1px_rgba(213,220,232,0.18),0_8px_24px_rgba(255,255,255,0.08)]'
                          : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-panel)] hover:bg-[rgba(255,255,255,0.05)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Ghost className="h-3.5 w-3.5 text-[rgb(213,220,232)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          Invisible
                        </span>
                      </div>
                    </button>
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
                  <h1 className="flex min-w-0 items-center gap-2 text-2xl font-bold text-[var(--text-primary)]">
                    <span className="truncate">{profile.display_name}</span>
                    <UserRoleBadge role={profile.admin_role} className="mt-1" />
                    <UserPresenceBadge userId={profile.id} presenceVisibility={profile.presence_visibility} />
                  </h1>
                  <p className="text-[var(--text-muted)]">
                    @{profile.username}
                  </p>
                </div>

                {profile.status_message && (
                  <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-4">
                    <p className="whitespace-pre-wrap text-[var(--text-secondary)]">
                      {profile.status_message}
                    </p>
                  </div>
                )}

                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    {presenceState === 'invisible' ? (
                      <Ghost className="h-3.5 w-3.5 text-[rgb(213,220,232)]" />
                    ) : (
                      <div className={`h-3 w-3 rounded-full ${presenceState === 'online' ? 'bg-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.55)]' : 'bg-[#64748b] shadow-[0_0_10px_rgba(100,116,139,0.36)]'}`} />
                    )}
                    <span className="text-sm text-[var(--text-secondary)]">
                      {presenceLabel}
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
                <div className="mt-2 flex items-center gap-1.5 text-base font-medium text-[var(--text-primary)]">
                  <span className="truncate">{profile.display_name}</span>
                  <UserRoleBadge role={profile.admin_role} />
                  <UserPresenceBadge userId={profile.id} presenceVisibility={profile.presence_visibility} />
                </div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Username</div>
                <div className="mt-2 text-base font-medium text-[var(--text-primary)]">@{profile.username}</div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 sm:col-span-2">
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Bio</div>
                <div className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                  {profile.status_message?.trim() || 'No bio set yet.'}
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
                <div className="text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">Current presence</div>
                <div className="mt-2 flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  {presenceState === 'invisible' ? (
                    <Ghost className="h-3.5 w-3.5 text-[rgb(213,220,232)]" />
                  ) : presenceState === 'online' ? (
                    <div className="h-3 w-3 rounded-full bg-[#22c55e] shadow-[0_0_12px_rgba(34,197,94,0.55)]" />
                  ) : (
                    <Eye className="h-3.5 w-3.5 text-[var(--text-muted)]" />
                  )}
                  <span>{presenceLabel}</span>
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
  )

  if (embedded) {
    return content
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.08),transparent_26%),linear-gradient(180deg,var(--bg-shell),var(--bg-app))] pb-[calc(env(safe-area-inset-bottom)_+_6rem)]"
    >
      {content}
    </motion.div>
  )
}

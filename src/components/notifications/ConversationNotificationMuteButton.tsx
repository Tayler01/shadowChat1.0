import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../hooks/useAuth'
import {
  fetchConversationNotificationMute,
  setConversationNotificationMute,
} from '../../lib/push'
import { cn } from '../../lib/utils'

type ConversationNotificationMuteButtonProps = {
  conversationId: string
  conversationLabel: string
}

export function ConversationNotificationMuteButton({
  conversationId,
  conversationLabel,
}: ConversationNotificationMuteButtonProps) {
  const { user } = useAuth()
  const userId = user?.id
  const [muted, setMuted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)

    if (!userId) {
      setMuted(false)
      setLoading(false)
      return () => {
        active = false
      }
    }

    void fetchConversationNotificationMute(userId, conversationId)
      .then(nextMuted => {
        if (active) setMuted(nextMuted)
      })
      .catch(() => {
        if (active) setMuted(false)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [conversationId, userId])

  const toggleMute = async () => {
    if (!userId || saving || loading) return

    const nextMuted = !muted
    setMuted(nextMuted)
    setSaving(true)
    try {
      await setConversationNotificationMute(userId, conversationId, nextMuted)
      toast.success(nextMuted
        ? `Notifications muted for ${conversationLabel}`
        : `Notifications resumed for ${conversationLabel}`)
    } catch (error) {
      setMuted(!nextMuted)
      toast.error(error instanceof Error ? error.message : 'Failed to update conversation notifications')
    } finally {
      setSaving(false)
    }
  }

  const label = muted
    ? `Resume notifications for ${conversationLabel}`
    : `Mute notifications for ${conversationLabel}`

  return (
    <button
      type="button"
      onClick={() => void toggleMute()}
      disabled={!userId || loading || saving}
      aria-label={label}
      aria-pressed={muted}
      aria-busy={loading || saving}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-wait disabled:opacity-60',
        muted
          ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]'
          : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)]'
      )}
    >
      {muted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
    </button>
  )
}

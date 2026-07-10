import { useEffect, useMemo, useRef, useState } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useOptionalClientReset } from '../../hooks/ClientResetContext'
import { useOptionalMessages } from '../../hooks/MessagesContext'
import { uploadChatImageAsset } from '../../lib/supabase'
import type { AppView } from '../../types/navigation'
import { ActiveUsersButton } from './ActiveUsersButton'
import { PinnedMessagesButton } from './PinnedMessagesButton'
import { WeatherWidget } from './WeatherWidget'

const ROOM_TOOLS_ID = 'general-chat-room-tools'

interface GeneralChatRoomToolsProps {
  onViewChange: (view: AppView) => void
}

export function GeneralChatRoomTools({ onViewChange }: GeneralChatRoomToolsProps) {
  const messagesContext = useOptionalMessages()
  const { status: resetStatus } = useOptionalClientReset()
  const [open, setOpen] = useState(false)
  const [sharingWeather, setSharingWeather] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const pinnedMessages = useMemo(
    () => (messagesContext?.messages || []).filter(message => message.pinned),
    [messagesContext?.messages]
  )

  useEffect(() => {
    if (!open) return

    const frame = window.requestAnimationFrame(() => closeRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const closeTools = () => {
    setOpen(false)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleShareWeather = async (file: File) => {
    setSharingWeather(true)
    try {
      if (!messagesContext) {
        throw new Error('General Chat is still loading.')
      }

      const asset = await uploadChatImageAsset(file, 'weather')
      const sent = await messagesContext.sendMessage(
        'Weather share',
        'image',
        asset.publicUrl,
        undefined,
        asset.thumbnailUrl
      )
      if (sent) toast.success('Weather shared')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to share weather')
    } finally {
      setSharingWeather(false)
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(value => !value)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)]"
        aria-label="Open General Chat room tools"
        aria-controls={ROOM_TOOLS_ID}
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <section
          id={ROOM_TOOLS_ID}
          aria-label="General Chat room tools"
          className="popup-surface absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-[min(19rem,calc(100vw-1rem))] rounded-[var(--radius-lg)] border border-[var(--border-panel)] p-3 shadow-[var(--shadow-panel-strong)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                Room tools
              </p>
              <p className="mt-0.5 text-sm text-[var(--text-primary)]">General Chat controls</p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={closeTools}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)]"
              aria-label="Close General Chat room tools"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 flex min-h-11 flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
            <WeatherWidget
              onOpenSettings={() => onViewChange('settings')}
              onShareWeather={sharingWeather ? undefined : handleShareWeather}
            />
            <ActiveUsersButton resetStatus={resetStatus} />
            <PinnedMessagesButton
              messages={pinnedMessages}
              onUnpin={messagesContext?.togglePin ?? (async () => {})}
              onToggleReaction={messagesContext?.toggleReaction ?? (async () => {})}
            />
          </div>
        </section>
      )}
    </div>
  )
}

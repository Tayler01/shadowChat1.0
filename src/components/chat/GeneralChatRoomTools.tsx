import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
  const [expanded, setExpanded] = useState(false)
  const [sharingWeather, setSharingWeather] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const pinnedMessages = useMemo(
    () => (messagesContext?.messages || []).filter(message => message.pinned),
    [messagesContext?.messages]
  )

  useEffect(() => {
    if (!expanded) return

    const collapseForKeyboard = () => {
      if (document.documentElement.dataset.shadowchatKeyboard === 'open') {
        setExpanded(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setExpanded(false)
      window.requestAnimationFrame(() => toggleRef.current?.focus())
    }
    const keyboardObserver = new MutationObserver(collapseForKeyboard)

    document.addEventListener('keydown', handleKeyDown)
    keyboardObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-shadowchat-keyboard'],
    })
    collapseForKeyboard()

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      keyboardObserver.disconnect()
    }
  }, [expanded])

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
    <div className="relative isolate flex h-11 shrink-0 items-center">
      {expanded ? (
        <div
          id={ROOM_TOOLS_ID}
          role="group"
          aria-label="General Chat tools"
          className="room-tools-inline-rail absolute right-[calc(100%+0.2rem)] top-1/2 z-20 flex h-11 w-max max-w-[calc(100vw-9.5rem)] -translate-y-1/2 items-center gap-1 overflow-hidden rounded-l-full bg-[var(--bg-panel-strong)] pl-2 pr-1 shadow-[-12px_0_18px_rgba(0,0,0,0.18)] backdrop-blur-xl"
        >
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
      ) : null}

      <button
        ref={toggleRef}
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="room-tools-control inline-flex h-11 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-[background-color,color,transform] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)] active:scale-95"
        aria-label={expanded ? 'Collapse General Chat tools' : 'Expand General Chat tools'}
        aria-controls={ROOM_TOOLS_ID}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>
    </div>
  )
}

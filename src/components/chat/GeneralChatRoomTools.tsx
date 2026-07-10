import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
const ROOM_TOOLS_WIDTH = 304
const ROOM_TOOLS_EDGE_PADDING = 8
const ROOM_TOOLS_GAP = 8

interface RoomToolsPosition {
  left: number
  top: number
  width: number
}

const getRoomToolsPosition = (
  trigger: HTMLButtonElement,
  panel: HTMLElement | null,
): RoomToolsPosition => {
  const visualViewport = window.visualViewport
  const viewportLeft = visualViewport?.offsetLeft ?? 0
  const viewportTop = visualViewport?.offsetTop ?? 0
  const viewportWidth = visualViewport?.width ?? document.documentElement.clientWidth
  const viewportHeight = visualViewport?.height ?? document.documentElement.clientHeight
  const width = Math.min(ROOM_TOOLS_WIDTH, viewportWidth - (ROOM_TOOLS_EDGE_PADDING * 2))
  const triggerRect = trigger.getBoundingClientRect()
  const panelHeight = panel?.getBoundingClientRect().height ?? 0
  const left = Math.min(
    Math.max(triggerRect.right - width, viewportLeft + ROOM_TOOLS_EDGE_PADDING),
    viewportLeft + viewportWidth - width - ROOM_TOOLS_EDGE_PADDING,
  )
  const preferredTop = triggerRect.bottom + ROOM_TOOLS_GAP
  const top = panelHeight > 0
    ? Math.max(
        viewportTop + ROOM_TOOLS_EDGE_PADDING,
        Math.min(preferredTop, viewportTop + viewportHeight - panelHeight - ROOM_TOOLS_EDGE_PADDING),
      )
    : preferredTop

  return { left, top, width }
}

interface GeneralChatRoomToolsProps {
  onViewChange: (view: AppView) => void
}

export function GeneralChatRoomTools({ onViewChange }: GeneralChatRoomToolsProps) {
  const messagesContext = useOptionalMessages()
  const { status: resetStatus } = useOptionalClientReset()
  const [open, setOpen] = useState(false)
  const [sharingWeather, setSharingWeather] = useState(false)
  const [panelPosition, setPanelPosition] = useState<RoomToolsPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
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
        setPanelPosition(null)
        window.requestAnimationFrame(() => triggerRef.current?.focus())
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    const updatePosition = () => {
      if (document.documentElement.dataset.shadowchatKeyboard === 'open') {
        setOpen(false)
        setPanelPosition(null)
        return
      }
      if (!triggerRef.current) return
      setPanelPosition(getRoomToolsPosition(triggerRef.current, panelRef.current))
    }
    const frame = window.requestAnimationFrame(updatePosition)
    const keyboardObserver = new MutationObserver(updatePosition)

    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.visualViewport?.addEventListener('resize', updatePosition)
    window.visualViewport?.addEventListener('scroll', updatePosition)
    keyboardObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-shadowchat-keyboard'],
    })

    return () => {
      window.cancelAnimationFrame(frame)
      keyboardObserver.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.visualViewport?.removeEventListener('resize', updatePosition)
      window.visualViewport?.removeEventListener('scroll', updatePosition)
    }
  }, [open])

  const closeTools = () => {
    setOpen(false)
    setPanelPosition(null)
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const toggleTools = () => {
    if (open) {
      closeTools()
      return
    }

    if (triggerRef.current) {
      setPanelPosition(getRoomToolsPosition(triggerRef.current, null))
    }
    setOpen(true)
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
        onClick={toggleTools}
        className="room-tools-control inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)]"
        aria-label="Open General Chat room tools"
        aria-controls={ROOM_TOOLS_ID}
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4" />
      </button>

      {open && panelPosition && createPortal(
        <section
          ref={panelRef}
          id={ROOM_TOOLS_ID}
          aria-label="General Chat room tools"
          className="popup-surface fixed z-[100] max-h-[calc(100dvh-1rem)] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--border-panel)] p-3 shadow-[var(--shadow-panel-strong)]"
          style={panelPosition}
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
              className="room-tools-control inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)]"
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
        </section>,
        document.body,
      )}
    </div>
  )
}

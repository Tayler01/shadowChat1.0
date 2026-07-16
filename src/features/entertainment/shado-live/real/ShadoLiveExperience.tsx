import { useEffect, useRef } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '../../../../hooks/useAuth'
import { ShadoLiveLobby } from './ShadoLiveLobby'
import { ShadoLiveStage } from './ShadoLiveStage'
import { ShadoLiveTerminalDialog } from './ShadoLiveTerminalDialog'
import {
  useShadoLiveRoom,
  type ShadoLiveRoomRouteAction,
} from './useShadoLiveRoom'

export interface ShadoLiveExperienceProps {
  onExit: () => void
  initialRoomId?: string
  onRoomRoute?: (action: ShadoLiveRoomRouteAction, roomId?: string) => void
}

export function ShadoLiveExperience({
  onExit,
  initialRoomId,
  onRoomRoute,
}: ShadoLiveExperienceProps) {
  const { user } = useAuth()
  const controller = useShadoLiveRoom({ initialRoomId, onRoomRoute })
  const leaveButtonRef = useRef<HTMLButtonElement>(null)
  const createButtonRef = useRef<HTMLButtonElement>(null)
  const lastLobbyFocusRef = useRef<HTMLElement | null>(null)
  const hadRoomRef = useRef(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (controller.room) {
        hadRoomRef.current = true
        if (controller.media.state === 'connected') leaveButtonRef.current?.focus({ preventScroll: true })
      } else if (hadRoomRef.current) {
        lastLobbyFocusRef.current?.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [controller.media.state, controller.room])

  const rememberLobbyFocus = () => {
    if (document.activeElement instanceof HTMLElement) lastLobbyFocusRef.current = document.activeElement
  }

  const createRoom = async (title: string) => {
    rememberLobbyFocus()
    await controller.createRoom(title)
  }

  const joinRoom = async (roomId: string) => {
    rememberLobbyFocus()
    await controller.joinRoom(roomId)
  }

  return (
    <div className="theme-app-surface flex h-[var(--shadowchat-app-height,var(--shadowchat-visual-viewport-height,100dvh))] min-h-0 flex-col overflow-hidden bg-[#050505] text-sm">
      {!controller.room && (
        <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-end gap-3 border-b border-white/10 px-3 pb-2 pt-[env(safe-area-inset-top)] shadow-[0_12px_34px_rgba(0,0,0,0.48)] sm:px-5">
          <button type="button" onClick={onExit} aria-label="Back to Entertainment" className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[var(--text-secondary)] hover:bg-white/5 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#d7aa46]">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" /> <span>Play</span>
          </button>
          <div className="h-5 w-px bg-white/10" />
          <p className="pb-2.5 font-semibold text-white">Shado Live</p>
        </header>
      )}

      {!controller.room && controller.error && (
        <div className="shrink-0 border-b border-[#a74135]/35 bg-[#4b1714]/45 px-4 py-2 text-xs leading-5 text-[#ffd0c7]" role="alert">
          <div className="mx-auto flex max-w-6xl items-start justify-between gap-3"><span>{controller.error}</span><button type="button" onClick={controller.clearError} className="shrink-0 underline underline-offset-2">Dismiss</button></div>
        </div>
      )}

      {controller.room ? (
        <ShadoLiveStage
          controller={controller}
          currentUserId={user?.id ?? ''}
          leaveButtonRef={leaveButtonRef}
        />
      ) : (
        <ShadoLiveLobby
          rooms={controller.rooms}
          backendState={controller.backendState}
          initialRoomId={initialRoomId}
          createButtonRef={createButtonRef}
          onCreate={createRoom}
          onJoin={joinRoom}
          onRefresh={controller.refreshRooms}
        />
      )}

      {!controller.room && controller.backendState === 'authorizing' && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/72 p-5 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="inline-flex items-center gap-3 rounded-2xl border border-[#d7aa46]/30 bg-[#0d0c0a] px-5 py-4 font-semibold text-white shadow-[0_24px_70px_rgba(0,0,0,0.55)]"><Loader2 className="h-5 w-5 animate-spin text-[#d7aa46]" aria-hidden="true" /> Authorizing room access…</div>
        </div>
      )}

      {controller.terminal && (
        <ShadoLiveTerminalDialog
          reason={controller.terminal.reason}
          message={controller.terminal.message}
          onReturn={() => void controller.returnToLobby()}
        />
      )}
    </div>
  )
}

export default ShadoLiveExperience

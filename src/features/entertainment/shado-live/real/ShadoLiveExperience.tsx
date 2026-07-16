import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '../../../../hooks/useAuth'
import { getUserProfile } from '../../../../lib/auth'
import type { User } from '../../../../lib/supabase'
import { ShadoLiveLobby } from './ShadoLiveLobby'
import { ShadoLiveStage } from './ShadoLiveStage'
import { ShadoLiveTerminalDialog } from './ShadoLiveTerminalDialog'
import {
  useShadoLiveRoom,
  type ShadoLiveRoomRouteAction,
} from './useShadoLiveRoom'

const PublicProfileDialog = lazy(() =>
  import('../../../../components/profile/PublicProfileDialog').then(module => ({
    default: module.PublicProfileDialog,
  }))
)

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
  const profileCacheRef = useRef(new Map<string, User>())
  const profileRequestRef = useRef(0)
  const [selectedProfile, setSelectedProfile] = useState<User | null>(null)

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

  const openProfile = async (userId: string) => {
    const cached = profileCacheRef.current.get(userId)
    if (cached) {
      setSelectedProfile(cached)
      return
    }

    const requestId = profileRequestRef.current + 1
    profileRequestRef.current = requestId
    try {
      const profile = await getUserProfile(userId)
      if (profileRequestRef.current !== requestId) return
      if (!profile) throw new Error('This profile is no longer available.')
      profileCacheRef.current.set(userId, profile)
      setSelectedProfile(profile)
    } catch (error) {
      if (profileRequestRef.current === requestId) {
        toast.error(error instanceof Error ? error.message : 'Unable to open this profile.')
      }
    }
  }

  return (
    <div className="theme-app-surface flex h-[var(--shadowchat-app-height,var(--shadowchat-visual-viewport-height,100dvh))] min-h-0 flex-col overflow-hidden bg-[var(--bg-app)] text-sm">
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
          onOpenProfile={openProfile}
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
          onOpenProfile={openProfile}
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

      {selectedProfile && (
        <Suspense fallback={null}>
          <PublicProfileDialog
            user={selectedProfile}
            open
            onClose={() => setSelectedProfile(null)}
          />
        </Suspense>
      )}
    </div>
  )
}

export default ShadoLiveExperience

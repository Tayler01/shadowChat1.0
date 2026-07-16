import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../../hooks/useAuth'
import { getWorkingClient } from '../../../../lib/supabase'
import { createRealtimeChannelName } from '../../../../lib/realtimeChannelName'
import {
  getMyShadoLiveRoom,
  isShadoLiveRoomUnavailableError,
  leaveShadoLiveSession,
  listMyShadoLiveRooms,
  openShadoLiveSession,
  reconcileShadoLive,
  sendShadoLiveCommand,
  toggleMyShadoLiveMessageReaction,
  type ShadoLiveCommandAction,
} from './shadoLiveApi'
import { createLiveKitMediaSession, type ShadoLiveMediaSessionController } from './liveKitMediaSession'
import {
  EMPTY_SHADO_LIVE_MEDIA_SNAPSHOT,
  canPublishShadoLiveMicrophone,
  getShadoLiveErrorMessage,
  isShadoLiveTerminalStatus,
  type ShadoLiveBackendState,
  type ShadoLiveMediaSnapshot,
  type ShadoLiveRoom,
  type ShadoLiveSyncState,
  type ShadoLiveTerminalReason,
} from './shadoLiveModel'
import {
  createShadoLiveReconcileRunner,
  SHADO_LIVE_RECONCILE_INTERVAL_MS,
} from './shadoLiveReconcileHeartbeat'

export type ShadoLiveRoomRouteAction = 'open' | 'close'

export interface UseShadoLiveRoomOptions {
  initialRoomId?: string
  onRoomRoute?: (action: ShadoLiveRoomRouteAction, roomId?: string) => void
}

interface TerminalState {
  reason: ShadoLiveTerminalReason
  message: string
}

export interface ShadoLiveRoomController {
  rooms: ShadoLiveRoom[]
  room: ShadoLiveRoom | null
  backendState: ShadoLiveBackendState
  media: ShadoLiveMediaSnapshot
  syncState: ShadoLiveSyncState
  terminal: TerminalState | null
  error: string | null
  notice: string | null
  commandBusy: ShadoLiveCommandAction | 'leave' | null
  controlsEnabled: boolean
  startEnabled: boolean
  refreshRooms: () => Promise<void>
  refreshRoom: () => Promise<ShadoLiveRoom | null>
  createRoom: (title: string) => Promise<void>
  joinRoom: (roomId: string) => Promise<void>
  resumeRoom: (roomId: string) => Promise<void>
  reconnectMedia: () => Promise<void>
  leaveRoom: () => Promise<void>
  returnToLobby: () => Promise<void>
  startAudio: () => Promise<void>
  toggleMicrophone: () => Promise<void>
  toggleHand: () => Promise<void>
  sendMessage: (body: string) => Promise<void>
  toggleMessageReaction: (messageId: string, emoji: string) => Promise<void>
  startRoom: () => Promise<void>
  promote: (userId: string) => Promise<void>
  demote: (userId: string) => Promise<void>
  mute: (userId: string) => Promise<void>
  remove: (userId: string) => Promise<void>
  endRoom: () => Promise<void>
  bindAudioContainer: (container: HTMLDivElement | null) => void
  clearError: () => void
}

const initialMediaSnapshot = (): ShadoLiveMediaSnapshot => ({
  ...EMPTY_SHADO_LIVE_MEDIA_SNAPSHOT,
  participants: [],
})

export function useShadoLiveRoom({
  initialRoomId,
  onRoomRoute,
}: UseShadoLiveRoomOptions = {}): ShadoLiveRoomController {
  const { user } = useAuth()
  const [rooms, setRooms] = useState<ShadoLiveRoom[]>([])
  const [room, setRoom] = useState<ShadoLiveRoom | null>(null)
  const [backendState, setBackendState] = useState<ShadoLiveBackendState>('idle')
  const [media, setMedia] = useState<ShadoLiveMediaSnapshot>(initialMediaSnapshot)
  const [syncState, setSyncState] = useState<ShadoLiveSyncState>('idle')
  const [terminal, setTerminal] = useState<TerminalState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [commandBusy, setCommandBusy] = useState<ShadoLiveCommandAction | 'leave' | null>(null)
  const mountedRef = useRef(true)
  const generationRef = useRef(0)
  const mediaSessionRef = useRef<ShadoLiveMediaSessionController | null>(null)
  const audioContainerRef = useRef<HTMLDivElement | null>(null)
  const roomRef = useRef<ShadoLiveRoom | null>(null)
  const mediaRef = useRef<ShadoLiveMediaSnapshot>(initialMediaSnapshot())
  const refreshInFlightRef = useRef<Promise<ShadoLiveRoom | null> | null>(null)
  const previousMediaStateRef = useRef(media.state)
  const initialRoomAttemptRef = useRef<string | null>(null)

  useEffect(() => {
    roomRef.current = room
  }, [room])

  useEffect(() => {
    mediaRef.current = media
  }, [media])

  const disconnectMedia = useCallback(async () => {
    const active = mediaSessionRef.current
    mediaSessionRef.current = null
    if (active) await active.disconnect()
    if (mountedRef.current) setMedia(initialMediaSnapshot())
  }, [])

  const applyRoomSnapshot = useCallback((nextRoom: ShadoLiveRoom) => {
    if (!mountedRef.current) return
    setRoom(nextRoom)
    setRooms(current => {
      const remaining = current.filter(candidate => candidate.id !== nextRoom.id)
      return [nextRoom, ...remaining]
    })
    if (!canPublishShadoLiveMicrophone(nextRoom.myRole) && mediaRef.current.microphoneEnabled) {
      void mediaSessionRef.current?.setMicrophoneEnabled(false).catch(() => undefined)
    }
    if (isShadoLiveTerminalStatus(nextRoom.status)) {
      setTerminal({ reason: 'ended', message: 'This Shado Live room has ended.' })
      void disconnectMedia()
    }
  }, [disconnectMedia])

  const refreshRooms = useCallback(async () => {
    if (!user?.id) return
    setBackendState(current => roomRef.current ? current : 'loading')
    try {
      const nextRooms = await listMyShadoLiveRooms()
      if (!mountedRef.current) return
      setRooms(nextRooms)
      setError(null)
      setBackendState(roomRef.current ? 'ready' : 'idle')
    } catch (caught) {
      if (!mountedRef.current) return
      setError(getShadoLiveErrorMessage(caught, 'Live rooms could not load.'))
      setBackendState('failed')
    }
  }, [user?.id])

  const refreshRoom = useCallback(async (): Promise<ShadoLiveRoom | null> => {
    const roomId = roomRef.current?.id
    if (!roomId) return null
    if (refreshInFlightRef.current) return refreshInFlightRef.current

    refreshInFlightRef.current = getMyShadoLiveRoom(roomId)
      .then(nextRoom => {
        applyRoomSnapshot(nextRoom)
        setError(null)
        setBackendState('ready')
        setSyncState('synced')
        return nextRoom
      })
      .catch(caught => {
        if (mountedRef.current) {
          setError(getShadoLiveErrorMessage(caught, 'Room state could not be verified. Controls remain locked.'))
          setBackendState('failed')
          setSyncState('stale')
        }
        return null
      })
      .finally(() => {
        refreshInFlightRef.current = null
      })
    return refreshInFlightRef.current
  }, [applyRoomSnapshot])

  const connectSession = useCallback(async (nextRoom: ShadoLiveRoom, mediaCredentials: Parameters<ShadoLiveMediaSessionController['connect']>[0] | null) => {
    const generation = ++generationRef.current
    await disconnectMedia()
    if (!mountedRef.current || generation !== generationRef.current) return

    setRoom(nextRoom)
    roomRef.current = nextRoom
    setRooms(current => [nextRoom, ...current.filter(candidate => candidate.id !== nextRoom.id)])
    setTerminal(null)
    setError(null)
    setNotice(null)
    setBackendState('ready')
    setSyncState('connecting')
    onRoomRoute?.('open', nextRoom.id)

    if (!mediaCredentials) {
      setMedia(initialMediaSnapshot())
      return
    }

    const mediaSession = createLiveKitMediaSession({
      onSnapshot: snapshot => {
        if (!mountedRef.current || generation !== generationRef.current) return
        setMedia(snapshot)
      },
      onTerminal: (reason, message) => {
        if (!mountedRef.current || generation !== generationRef.current) return
        setTerminal({ reason, message })
        setSyncState('stale')
      },
    })
    mediaSessionRef.current = mediaSession
    mediaSession.setAudioContainer(audioContainerRef.current)
    await mediaSession.connect(mediaCredentials, { allowAudioPlayback: false })
    if (mountedRef.current && generation === generationRef.current) setSyncState('synced')
  }, [disconnectMedia, onRoomRoute])

  const openSession = useCallback(async (
    action: 'create' | 'join' | 'resume',
    options: { roomId?: string; title?: string }
  ) => {
    if (!user?.id) throw new Error('Sign in before opening Shado Live.')
    setBackendState('authorizing')
    setError(null)
    setTerminal(null)
    try {
      const session = await openShadoLiveSession({ action, ...options })
      await connectSession(session.room, session.media)
    } catch (caught) {
      if (mountedRef.current) {
        setBackendState('failed')
        setError(getShadoLiveErrorMessage(caught, 'Shado Live could not open this room.'))
        setSyncState('stale')
      }
      await disconnectMedia()
      throw caught
    }
  }, [connectSession, disconnectMedia, user?.id])

  const createRoom = useCallback(async (title: string) => {
    try {
      await openSession('create', { title })
    } catch (caught) {
      await refreshRooms().catch(() => undefined)
      throw caught
    }
  }, [openSession, refreshRooms])
  const joinRoom = useCallback(async (roomId: string) => {
    try {
      await openSession('join', { roomId })
    } catch (caught) {
      await refreshRooms().catch(() => undefined)
      throw caught
    }
  }, [openSession, refreshRooms])
  const resumeRoom = useCallback((roomId: string) => openSession('resume', { roomId }), [openSession])
  const reconnectMedia = useCallback(async () => {
    const activeRoom = roomRef.current
    if (!activeRoom) throw new Error('Open a Shado Live room before reconnecting audio.')
    await openSession('resume', { roomId: activeRoom.id })
  }, [openSession])

  const leaveRoom = useCallback(async () => {
    const activeRoom = roomRef.current
    if (!activeRoom || commandBusy === 'leave') return
    setCommandBusy('leave')
    generationRef.current += 1
    await disconnectMedia()
    let serverConfirmed = false
    try {
      await leaveShadoLiveSession(activeRoom.id)
      serverConfirmed = true
    } catch (caught) {
      if (mountedRef.current) {
        setNotice(`You left locally, but the server did not confirm it yet: ${getShadoLiveErrorMessage(caught, 'unknown error')}`)
      }
    } finally {
      if (mountedRef.current) {
        setRoom(null)
        roomRef.current = null
        setTerminal(null)
        setSyncState('idle')
        setBackendState('idle')
        setCommandBusy(null)
        if (serverConfirmed) setNotice(null)
        onRoomRoute?.('close', activeRoom.id)
        void refreshRooms()
      }
    }
  }, [commandBusy, disconnectMedia, onRoomRoute, refreshRooms])

  const returnToLobby = useCallback(async () => {
    const activeRoom = roomRef.current
    generationRef.current += 1
    await disconnectMedia()
    setRoom(null)
    roomRef.current = null
    setTerminal(null)
    setError(null)
    setSyncState('idle')
    setBackendState('idle')
    if (activeRoom) onRoomRoute?.('close', activeRoom.id)
    await refreshRooms()
  }, [disconnectMedia, onRoomRoute, refreshRooms])

  const runCommand = useCallback(async (
    action: ShadoLiveCommandAction,
    options: { targetUserId?: string; body?: string } = {}
  ) => {
    let activeRoom = roomRef.current
    if (!activeRoom) throw new Error('Join a Shado Live room first.')
    if (mediaRef.current.state !== 'connected') {
      throw new Error('Room controls are locked until live audio reconnects.')
    }
    if (syncState !== 'synced') {
      activeRoom = await refreshRoom()
      if (!activeRoom) {
        throw new Error('Room controls are locked until the server verifies the latest room state.')
      }
    }
    setCommandBusy(action)
    setError(null)
    try {
      const nextRoom = await sendShadoLiveCommand({
        action,
        roomId: activeRoom.id,
        expectedVersion: activeRoom.version,
        ...options,
      })
      applyRoomSnapshot(nextRoom)
    } catch (caught) {
      if (mountedRef.current) setError(getShadoLiveErrorMessage(caught, 'The room command was not confirmed.'))
      throw caught
    } finally {
      if (mountedRef.current) setCommandBusy(null)
    }
  }, [applyRoomSnapshot, refreshRoom, syncState])

  const startAudio = useCallback(async () => {
    try {
      await mediaSessionRef.current?.startAudio()
    } catch (caught) {
      setError(getShadoLiveErrorMessage(caught, 'Room audio is still blocked.'))
      throw caught
    }
  }, [])

  const toggleMicrophone = useCallback(async () => {
    const activeRoom = roomRef.current
    const activeMedia = mediaRef.current
    if (!activeRoom || !canPublishShadoLiveMicrophone(activeRoom.myRole)) {
      throw new Error('The server has not authorized you to speak.')
    }
    if (activeMedia.state !== 'connected') {
      throw new Error('The microphone stays locked while live audio reconnects.')
    }
    if (!activeMedia.microphoneAllowed) {
      throw new Error('The live audio provider has not authorized your microphone yet.')
    }
    try {
      await mediaSessionRef.current?.setMicrophoneEnabled(!activeMedia.microphoneEnabled)
    } catch (caught) {
      setError(getShadoLiveErrorMessage(caught, 'The microphone could not change state.'))
      throw caught
    }
  }, [])

  const toggleHand = useCallback(() => {
    const action = roomRef.current?.myStageRequestStatus === 'raised' ? 'lower_hand' : 'raise_hand'
    return runCommand(action)
  }, [runCommand])

  const sendMessage = useCallback((body: string) => runCommand('send_message', { body }), [runCommand])
  const toggleMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    setError(null)
    try {
      await toggleMyShadoLiveMessageReaction(messageId, emoji)
      await refreshRoom()
    } catch (caught) {
      setError(getShadoLiveErrorMessage(caught, 'The message reaction could not be updated.'))
      throw caught
    }
  }, [refreshRoom])
  const startRoom = useCallback(() => runCommand('start'), [runCommand])
  const promote = useCallback((userId: string) => runCommand('promote', { targetUserId: userId }), [runCommand])
  const demote = useCallback((userId: string) => runCommand('demote', { targetUserId: userId }), [runCommand])
  const mute = useCallback((userId: string) => runCommand('mute', { targetUserId: userId }), [runCommand])
  const remove = useCallback((userId: string) => runCommand('remove', { targetUserId: userId }), [runCommand])
  const endRoom = useCallback(() => runCommand('end'), [runCommand])

  const bindAudioContainer = useCallback((container: HTMLDivElement | null) => {
    audioContainerRef.current = container
    mediaSessionRef.current?.setAudioContainer(container)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void refreshRooms()
    return () => {
      mountedRef.current = false
      generationRef.current += 1
      void mediaSessionRef.current?.disconnect()
      mediaSessionRef.current = null
    }
  }, [refreshRooms])

  useEffect(() => {
    if (!initialRoomId) {
      initialRoomAttemptRef.current = null
      return
    }
    if (
      rooms.some(candidate => candidate.id === initialRoomId)
      || initialRoomAttemptRef.current === initialRoomId
    ) return
    initialRoomAttemptRef.current = initialRoomId
    let cancelled = false
    void getMyShadoLiveRoom(initialRoomId)
      .then(target => {
        if (!cancelled && mountedRef.current) {
          setRooms(current => [target, ...current.filter(candidate => candidate.id !== target.id)])
        }
      })
      .catch(caught => {
        if (cancelled || !mountedRef.current) return
        if (isShadoLiveRoomUnavailableError(caught)) {
          setRooms(current => current.filter(candidate => candidate.id !== initialRoomId))
          setError(null)
          setNotice('That Shado Live room has ended or is no longer available.')
          onRoomRoute?.('close', initialRoomId)
          void refreshRooms()
          return
        }
        setError(getShadoLiveErrorMessage(caught, 'The linked live room is unavailable.'))
      })
    return () => { cancelled = true }
  }, [initialRoomId, onRoomRoute, refreshRooms, rooms])

  useEffect(() => {
    if (!user?.id || room?.id) return
    const refreshVisible = () => {
      if (document.visibilityState !== 'hidden' && navigator.onLine !== false) {
        void refreshRooms()
      }
    }
    window.addEventListener('focus', refreshVisible)
    window.addEventListener('online', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const interval = window.setInterval(refreshVisible, 15_000)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener('online', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [refreshRooms, room?.id, user?.id])

  useEffect(() => {
    const roomId = room?.id
    if (!roomId) return
    let cancelled = false
    let channel: ReturnType<Awaited<ReturnType<typeof getWorkingClient>>['channel']> | null = null
    let refreshTimer: number | null = null

    const scheduleRefresh = () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      refreshTimer = window.setTimeout(() => void refreshRoom(), 80)
    }

    setSyncState('connecting')
    void getWorkingClient().then(client => {
      if (cancelled) return
      channel = client
        .channel(createRealtimeChannelName(`shado_live_room:${roomId}`))
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'live_room_signals',
          filter: `room_id=eq.${roomId}`,
        }, scheduleRefresh)
        .subscribe((status: string) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            setSyncState('synced')
            void refreshRoom()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setSyncState('stale')
            void refreshRoom()
          }
        })
    }).catch(() => {
      if (!cancelled) setSyncState('stale')
    })

    const refreshVisible = () => {
      if (document.visibilityState !== 'hidden') void refreshRoom()
    }
    window.addEventListener('focus', refreshVisible)
    window.addEventListener('online', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    const fallbackInterval = window.setInterval(refreshVisible, 12_000)

    return () => {
      cancelled = true
      if (refreshTimer !== null) window.clearTimeout(refreshTimer)
      window.clearInterval(fallbackInterval)
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener('online', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
      if (channel) {
        void getWorkingClient().then(client => client.removeChannel(channel!)).catch(() => undefined)
      }
    }
  }, [refreshRoom, room?.id])

  useEffect(() => {
    const previous = previousMediaStateRef.current
    previousMediaStateRef.current = media.state
    if (previous === 'reconnecting' && media.state === 'connected') void refreshRoom()
  }, [media.state, refreshRoom])

  useEffect(() => {
    if (!room?.id || isShadoLiveTerminalStatus(room.status)) return
    let stopped = false
    const runner = createShadoLiveReconcileRunner({
      run: reconcileShadoLive,
      canRun: () => (
        !stopped
        && document.visibilityState === 'visible'
        && navigator.onLine !== false
      ),
    })
    const tick = () => void runner.tick()
    const resume = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) tick()
    }

    tick()
    const interval = window.setInterval(tick, SHADO_LIVE_RECONCILE_INTERVAL_MS)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    return () => {
      stopped = true
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
    }
  }, [room?.id, room?.status])

  useEffect(() => {
    if (!room || !canPublishShadoLiveMicrophone(room.myRole) || !media.microphoneEnabled) return
    const muteWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        void mediaSessionRef.current?.setMicrophoneEnabled(false)
          .then(() => setNotice('Your microphone was muted when Shado Live moved to the background.'))
          .catch(() => undefined)
      }
    }
    document.addEventListener('visibilitychange', muteWhenHidden)
    return () => document.removeEventListener('visibilitychange', muteWhenHidden)
  }, [media.microphoneEnabled, room])

  const controlsEnabled = useMemo(() => (
    room?.status === 'live'
    && media.state === 'connected'
    && backendState === 'ready'
    && commandBusy === null
    && terminal === null
  ), [backendState, commandBusy, media.state, room?.status, terminal])
  const startEnabled = useMemo(() => (
    room?.status === 'green_room'
    && room.myRole === 'host'
    && media.state === 'connected'
    && backendState === 'ready'
    && commandBusy === null
    && terminal === null
  ), [backendState, commandBusy, media.state, room?.myRole, room?.status, terminal])

  return {
    rooms,
    room,
    backendState,
    media,
    syncState,
    terminal,
    error,
    notice,
    commandBusy,
    controlsEnabled,
    startEnabled,
    refreshRooms,
    refreshRoom,
    createRoom,
    joinRoom,
    resumeRoom,
    reconnectMedia,
    leaveRoom,
    returnToLobby,
    startAudio,
    toggleMicrophone,
    toggleHand,
    sendMessage,
    toggleMessageReaction,
    startRoom,
    promote,
    demote,
    mute,
    remove,
    endRoom,
    bindAudioContainer,
    clearError: () => setError(null),
  }
}

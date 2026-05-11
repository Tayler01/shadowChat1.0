import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient, type GameSession } from '../../../../lib/supabase'
import { runRealtimeRecovery } from '../../../../lib/realtimeRecovery'
import { useAuth } from '../../../../hooks/useAuth'
import { useRealtimeRecovery } from '../../../../hooks/useRealtimeRecovery'
import {
  createShadowWarSession,
  fetchShadowWarMatch,
  fetchShadowWarMoves,
  fetchShadowWarPlayerState,
  fetchShadowWarQueue,
  fetchShadowWarSessions,
  joinShadowWarSession,
  leaveShadowWarQueue,
  queueShadowWarSession,
  rematchShadowWarSession,
  resolveShadowWarRound,
  startShadowWarNextChallenger,
  submitShadowWarPlacement,
  submitShadowWarSuddenWarCard,
  type ShadowWarSnapshot,
} from '../api/shadowWarApi'

const emptySnapshot: ShadowWarSnapshot = {
  sessions: [],
  activeSession: null,
  match: null,
  playerState: null,
  queue: [],
  moves: [],
}

const isUserInSession = (session: GameSession, userId?: string | null) =>
  Boolean(userId && (session.player_one_id === userId || session.player_two_id === userId))

export function useShadowWar() {
  const { user } = useAuth()
  const [snapshot, setSnapshot] = useState<ShadowWarSnapshot>(emptySnapshot)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const refreshInFlightRef = useRef<Promise<ShadowWarSnapshot> | null>(null)

  const refresh = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current

    refreshInFlightRef.current = (async () => {
      try {
        const sessions = await fetchShadowWarSessions()
        const selected = selectedSessionId
          ? sessions.find(session => session.id === selectedSessionId) ?? null
          : null
        const activeSession = selected
          ?? sessions.find(session => isUserInSession(session, user?.id) && session.status !== 'completed')
          ?? sessions.find(session => session.status === 'waiting')
          ?? sessions[0]
          ?? null

        const match = activeSession?.current_match_id
          ? await fetchShadowWarMatch(activeSession.current_match_id)
          : null
        const playerState = match ? await fetchShadowWarPlayerState(match.id) : null
        const queue = activeSession ? await fetchShadowWarQueue(activeSession.id) : []
        const moves = match ? await fetchShadowWarMoves(match.id, match.round_number) : []
        const next = { sessions, activeSession, match, playerState, queue, moves }
        setSnapshot(next)
        setError(null)
        return next
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load games'
        setError(message)
        throw err
      } finally {
        setLoading(false)
        refreshInFlightRef.current = null
      }
    })()

    return refreshInFlightRef.current
  }, [selectedSessionId, user?.id])

  useEffect(() => {
    void refresh().catch(() => {})
  }, [refresh])

  const resetChannel = useCallback(async () => {
    await refresh().catch(() => emptySnapshot)
    const activeChannel = channelRef.current
    const realtimeClient = getRealtimeClient()
    if (activeChannel && realtimeClient?.removeChannel) {
      realtimeClient.removeChannel(activeChannel)
    }
    channelRef.current = null
  }, [refresh])

  useRealtimeRecovery(() => {
    void resetChannel()
  })

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async () => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return

      const refreshSoon = () => {
        window.setTimeout(() => void refresh().catch(() => {}), 120)
      }

      channel = currentClient
        .channel('public:shadow-war-games')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_war_matches' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_war_moves' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_session_queue' }, refreshSoon)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'shadow_war_player_states', filter: `user_id=eq.${user.id}` },
          refreshSoon
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void runRealtimeRecovery('channel-error')
          }
        })

      channelRef.current = channel
    }

    void subscribe()

    return () => {
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [refresh, user])

  const runAction = useCallback(async <T,>(label: string, action: () => Promise<T>) => {
    setBusy(label)
    setError(null)
    try {
      const result = await action()
      await refresh().catch(() => emptySnapshot)
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Game action failed'
      setError(message)
      throw err
    } finally {
      setBusy(null)
    }
  }, [refresh])

  const actions = useMemo(() => ({
    create: () => runAction('create', async () => {
      const sessionId = await createShadowWarSession()
      setSelectedSessionId(sessionId)
      return sessionId
    }),
    join: (sessionId: string) => runAction('join', async () => {
      const joined = await joinShadowWarSession(sessionId)
      setSelectedSessionId(joined.sessionId)
      return joined
    }),
    queue: (sessionId: string) => runAction('queue', () => queueShadowWarSession(sessionId)),
    leaveQueue: (sessionId: string) => runAction('leaveQueue', () => leaveShadowWarQueue(sessionId)),
    submitPlacement: (matchId: string, placement: { left: string; center: string; right: string }) =>
      runAction('submitPlacement', () => submitShadowWarPlacement(matchId, placement)),
    submitSuddenWarCard: (matchId: string, cardId: string) =>
      runAction('submitSuddenWarCard', () => submitShadowWarSuddenWarCard(matchId, cardId)),
    resolveRound: (matchId: string) => runAction('resolveRound', () => resolveShadowWarRound(matchId)),
    rematch: (sessionId: string) => runAction('rematch', async () => {
      const next = await rematchShadowWarSession(sessionId)
      setSelectedSessionId(next.sessionId)
      return next
    }),
    nextChallenger: (sessionId: string) => runAction('nextChallenger', async () => {
      const next = await startShadowWarNextChallenger(sessionId)
      setSelectedSessionId(next.sessionId)
      return next
    }),
    selectSession: (sessionId: string) => setSelectedSessionId(sessionId),
  }), [runAction])

  return {
    ...snapshot,
    loading,
    busy,
    error,
    refresh,
    actions,
  }
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient } from '../../../../lib/supabase'
import { runRealtimeRecovery } from '../../../../lib/realtimeRecovery'
import { useAuth } from '../../../../hooks/useAuth'
import { useRealtimeRecovery } from '../../../../hooks/useRealtimeRecovery'
import {
  createShadowWarSession,
  cleanupShadowWarEmptySessions,
  fetchShadowWarMatch,
  fetchShadowWarMoves,
  fetchShadowWarPlayerState,
  fetchShadowWarQueue,
  fetchShadowWarSession,
  fetchShadowWarSessionPresence,
  fetchShadowWarSessions,
  joinShadowWarSession,
  leaveShadowWarQueue,
  leaveShadowWarSessionPresence,
  queueShadowWarSession,
  rematchShadowWarSession,
  resolveShadowWarRound,
  startShadowWarNextChallenger,
  submitShadowWarPlacement,
  submitShadowWarSuddenWarCard,
  touchShadowWarSessionPresence,
  type ShadowWarSnapshot,
} from '../api/shadowWarApi'

const emptySnapshot: ShadowWarSnapshot = {
  sessions: [],
  activeSession: null,
  match: null,
  playerState: null,
  queue: [],
  moves: [],
  presence: [],
}

export function useShadowWar() {
  const { user } = useAuth()
  const [snapshot, setSnapshot] = useState<ShadowWarSnapshot>(emptySnapshot)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const refresh = useCallback(async (nextSelectedSessionId = selectedSessionId) => {
    try {
      const sessions = await fetchShadowWarSessions()
      const selected = nextSelectedSessionId
        ? sessions.find(session => session.id === nextSelectedSessionId) ?? await fetchShadowWarSession(nextSelectedSessionId)
        : null
      const activeSession = selected

      const sessionIds = Array.from(new Set([
        ...sessions.map(session => session.id),
        ...(activeSession ? [activeSession.id] : []),
      ]))
      const match = activeSession?.current_match_id
        ? await fetchShadowWarMatch(activeSession.current_match_id)
        : null
      const playerState = match ? await fetchShadowWarPlayerState(match.id) : null
      const queue = activeSession ? await fetchShadowWarQueue(activeSession.id) : []
      const moves = match ? await fetchShadowWarMoves(match.id, match.round_number) : []
      const presence = await fetchShadowWarSessionPresence(sessionIds)
      const next = { sessions, activeSession, match, playerState, queue, moves, presence }
      setSnapshot(next)
      setError(null)
      return next
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load games'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [selectedSessionId])

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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_session_presence' }, refreshSoon)
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

  const presenceSessionId = snapshot.activeSession?.id ?? null
  const presenceSessionStatus = snapshot.activeSession?.status ?? null
  const presencePlayerOneId = snapshot.activeSession?.player_one_id ?? null
  const presencePlayerTwoId = snapshot.activeSession?.player_two_id ?? null

  useEffect(() => {
    if (!user || !presenceSessionId || !selectedSessionId) return
    const isPlayer = user.id === presencePlayerOneId || user.id === presencePlayerTwoId
    if (!isPlayer || !['waiting', 'active'].includes(presenceSessionStatus ?? '')) return

    let cancelled = false

    const touchPresence = () => {
      void touchShadowWarSessionPresence(presenceSessionId).catch(() => {})
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') touchPresence()
    }

    touchPresence()
    const intervalId = window.setInterval(() => {
      if (!cancelled && document.visibilityState === 'visible') touchPresence()
    }, 25_000)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void leaveShadowWarSessionPresence(presenceSessionId).catch(() => {})
    }
  }, [presencePlayerOneId, presencePlayerTwoId, presenceSessionId, presenceSessionStatus, selectedSessionId, user])

  useEffect(() => {
    if (!user) return

    let cancelled = false
    const runCleanup = async () => {
      const result = await cleanupShadowWarEmptySessions().catch(() => null)
      if (!cancelled && result?.cancelledCount) {
        await refresh().catch(() => emptySnapshot)
      }
    }

    void runCleanup()
    const intervalId = window.setInterval(() => void runCleanup(), 60_000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [refresh, user])

  const runAction = useCallback(async <T,>(
    label: string,
    action: () => Promise<T>,
    getSelectedSessionId?: (result: T) => string | null | undefined
  ) => {
    setBusy(label)
    setError(null)
    try {
      const result = await action()
      const nextSelectedSessionId = getSelectedSessionId?.(result)
      if (nextSelectedSessionId !== undefined) {
        setSelectedSessionId(nextSelectedSessionId)
      }
      await refresh(nextSelectedSessionId).catch(() => emptySnapshot)
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
    create: () => runAction('create', createShadowWarSession, sessionId => sessionId),
    join: (sessionId: string) => runAction('join', () => joinShadowWarSession(sessionId), joined => joined.sessionId),
    leaveQueue: (sessionId: string) => runAction('leaveQueue', () => leaveShadowWarQueue(sessionId)),
    submitPlacement: (matchId: string, placement: { left: string; center: string; right: string }) =>
      runAction('submitPlacement', async () => {
        const result = await submitShadowWarPlacement(matchId, placement)
        if (result.revealed) {
          await resolveShadowWarRound(matchId)
        }
        return result
      }),
    submitSuddenWarCard: (matchId: string, cardId: string) =>
      runAction('submitSuddenWarCard', async () => {
        const result = await submitShadowWarSuddenWarCard(matchId, cardId)
        if (result.revealed) {
          await resolveShadowWarRound(matchId)
        }
        return result
      }),
    resolveRound: (matchId: string) => runAction('resolveRound', () => resolveShadowWarRound(matchId)),
    rematch: (sessionId: string) => runAction('rematch', () => rematchShadowWarSession(sessionId), next => next.sessionId),
    nextChallenger: (sessionId: string) => runAction('nextChallenger', () => startShadowWarNextChallenger(sessionId), next => next.sessionId),
    queue: (sessionId: string) => runAction('queue', () => queueShadowWarSession(sessionId), () => sessionId),
    selectSession: (sessionId: string | null) => {
      setSelectedSessionId(sessionId)
      void refresh(sessionId).catch(() => {})
    },
    clearSession: () => {
      setSelectedSessionId(null)
      void refresh(null).catch(() => {})
    },
  }), [refresh, runAction])

  return {
    ...snapshot,
    selectedSessionId,
    loading,
    busy,
    error,
    refresh,
    actions,
  }
}

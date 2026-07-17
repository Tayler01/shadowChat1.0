import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getRealtimeClient, getWorkingClient } from '../../../../lib/supabase'
import { runRealtimeRecovery } from '../../../../lib/realtimeRecovery'
import { requestAppBadgeRefresh } from '../../../../lib/appBadge'
import { triggerShadowCheckersTurnPushNotification } from '../../../../lib/push'
import { useAuth } from '../../../../hooks/useAuth'
import { useRealtimeRecovery } from '../../../../hooks/useRealtimeRecovery'
import type { CheckersPosition } from '../engine/types'
import {
  cancelShadowCheckersMatch,
  createShadowCheckersMatch,
  fetchShadowCheckersChat,
  fetchShadowCheckersLeaderboard,
  fetchShadowCheckersMatch,
  fetchShadowCheckersMatches,
  fetchShadowCheckersMoves,
  fetchShadowCheckersQueue,
  fetchShadowCheckersSessions,
  joinShadowCheckersMatch,
  leaveShadowCheckersQueue,
  markShadowCheckersTurnRead,
  postShadowCheckersChatMessage,
  queueShadowCheckersMatch,
  rematchShadowCheckersMatch,
  resignShadowCheckersMatch,
  startShadowCheckersNextChallenger,
  submitShadowCheckersMove,
  type ShadowCheckersSnapshot,
} from '../api/shadowCheckersApi'

const emptySnapshot: ShadowCheckersSnapshot = {
  sessions: [],
  matches: [],
  activeMatch: null,
  queue: [],
  moves: [],
  chat: [],
  leaderboard: [],
}

function formatShadowCheckersHookError(label: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Game action failed'
  if (label === 'move' && /capture required|multi-jump|required jump|mandatory jump|move banned|not permitted|row-level security|violates row-level/i.test(message)) {
    return 'Mandatory jump available. You have to take the jump.'
  }
  return message
}

type AutoSelectRouteMode = 'push' | 'replace'

export function useShadowCheckers(
  initialMatchId?: string,
  onAutoSelectMatch?: (matchId: string, routeMode: AutoSelectRouteMode) => void,
) {
  const { user } = useAuth()
  const [snapshot, setSnapshot] = useState<ShadowCheckersSnapshot>(emptySnapshot)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(() => initialMatchId ?? null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const selectedMatchIdRef = useRef<string | null>(initialMatchId ?? null)

  const refresh = useCallback(async (nextSelectedMatchId = selectedMatchId) => {
    try {
      const [sessions, matches, leaderboard] = await Promise.all([
        fetchShadowCheckersSessions(),
        fetchShadowCheckersMatches(),
        fetchShadowCheckersLeaderboard(),
      ])
      const activeMatch = nextSelectedMatchId
        ? matches.find(match => match.id === nextSelectedMatchId) ?? await fetchShadowCheckersMatch(nextSelectedMatchId)
        : null
      const activeSessionId = activeMatch?.session_id ?? null
      const [queue, moves, chat] = activeMatch
        ? await Promise.all([
          activeSessionId ? fetchShadowCheckersQueue(activeSessionId) : Promise.resolve([]),
          fetchShadowCheckersMoves(activeMatch.id),
          fetchShadowCheckersChat(activeMatch.id),
        ])
        : [[], [], []]

      const next = { sessions, matches, activeMatch, queue, moves, chat, leaderboard }
      setSnapshot(next)
      setError(null)
      return next
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load Shadow Checkers'
      setError(message)
      throw err
    } finally {
      setLoading(false)
    }
  }, [selectedMatchId])

  useEffect(() => {
    void refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    const nextInitialMatchId = initialMatchId ?? null
    selectedMatchIdRef.current = nextInitialMatchId
    setSelectedMatchId(nextInitialMatchId)
  }, [initialMatchId])

  const activeMatchId = snapshot.activeMatch?.id
  const activeMatchStatus = snapshot.activeMatch?.status
  const activeMatchTurnUserId = snapshot.activeMatch?.current_turn_user_id
  const activeMatchMoveCount = snapshot.activeMatch?.move_count
  const currentUserId = user?.id

  useEffect(() => {
    if (
      !currentUserId
      || !selectedMatchId
      || activeMatchId !== selectedMatchId
      || activeMatchStatus !== 'active'
      || activeMatchTurnUserId !== currentUserId
    ) {
      return
    }

    let cancelled = false
    void markShadowCheckersTurnRead(selectedMatchId)
      .then(() => {
        if (!cancelled) requestAppBadgeRefresh()
      })
      .catch(() => {
        // Read-through is best-effort. A later route open or notification inbox action can retry it.
      })

    return () => {
      cancelled = true
    }
  }, [
    activeMatchId,
    activeMatchMoveCount,
    activeMatchStatus,
    activeMatchTurnUserId,
    currentUserId,
    selectedMatchId,
  ])

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
        if (refreshTimerRef.current !== null) {
          window.clearTimeout(refreshTimerRef.current)
        }
        refreshTimerRef.current = window.setTimeout(() => {
          refreshTimerRef.current = null
          void refresh().catch(() => {})
        }, 80)
      }

      channel = currentClient
        .channel('public:shadow-checkers')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_session_queue' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_checkers_matches' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_checkers_moves' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_checkers_chat_messages' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_checkers_stats' }, refreshSoon)
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
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
      channelRef.current = null
    }
  }, [refresh, user])

  const runAction = useCallback(async <T,>(
    label: string,
    action: () => Promise<T>,
    getSelectedMatchId?: (result: T) => string | null | undefined,
    autoSelectRouteMode?: AutoSelectRouteMode,
  ) => {
    setBusy(label)
    setError(null)
    try {
      const result = await action()
      const nextSelectedMatchId = getSelectedMatchId?.(result)
      const selectionChanged = Boolean(
        nextSelectedMatchId
        && nextSelectedMatchId !== selectedMatchIdRef.current
      )
      if (nextSelectedMatchId !== undefined) {
        selectedMatchIdRef.current = nextSelectedMatchId
        setSelectedMatchId(nextSelectedMatchId)
      }
      if (nextSelectedMatchId && selectionChanged && autoSelectRouteMode) {
        onAutoSelectMatch?.(nextSelectedMatchId, autoSelectRouteMode)
      }
      await refresh(nextSelectedMatchId).catch(() => emptySnapshot)
      return result
    } catch (err) {
      const message = formatShadowCheckersHookError(label, err)
      setError(message)
      throw err
    } finally {
      setBusy(null)
    }
  }, [onAutoSelectMatch, refresh])

  const actions = useMemo(() => ({
    create: (characterKey: string, boardSkin: 'classic' | 'cinematic' = 'classic') =>
      runAction('create', () => createShadowCheckersMatch(characterKey, boardSkin), result => result.matchId, 'push'),
    join: (sessionId: string, characterKey: string) =>
      runAction('join', async () => {
        const result = await joinShadowCheckersMatch(sessionId, characterKey)
        void triggerShadowCheckersTurnPushNotification(result.matchId).catch(() => undefined)
        return result
      }, result => result.matchId, 'push'),
    submitMove: (matchId: string, pieceId: string, path: CheckersPosition[]) =>
      runAction('move', async () => {
        const result = await submitShadowCheckersMove(matchId, pieceId, path)
        void triggerShadowCheckersTurnPushNotification(result.matchId).catch(() => undefined)
        return result
      }),
    resign: (matchId: string) =>
      runAction('resign', () => resignShadowCheckersMatch(matchId)),
    cancel: (matchId: string) =>
      runAction('cancel', () => cancelShadowCheckersMatch(matchId), () => null),
    queue: (sessionId: string, characterKey?: string) =>
      runAction('queue', () => queueShadowCheckersMatch(sessionId, characterKey)),
    leaveQueue: (sessionId: string) =>
      runAction('leaveQueue', () => leaveShadowCheckersQueue(sessionId)),
    rematch: (matchId: string) =>
      runAction('rematch', async () => {
        const result = await rematchShadowCheckersMatch(matchId)
        void triggerShadowCheckersTurnPushNotification(result.matchId).catch(() => undefined)
        return result
      }, result => result.matchId, 'replace'),
    nextChallenger: (matchId: string) =>
      runAction('nextChallenger', async () => {
        const result = await startShadowCheckersNextChallenger(matchId)
        void triggerShadowCheckersTurnPushNotification(result.matchId).catch(() => undefined)
        return result
      }, result => result.matchId, 'replace'),
    postChat: (matchId: string, body: string) =>
      runAction('chat', () => postShadowCheckersChatMessage(matchId, body)),
    selectMatch: (matchId: string | null) => {
      selectedMatchIdRef.current = matchId
      setSelectedMatchId(matchId)
      void refresh(matchId).catch(() => {})
    },
  }), [refresh, runAction])

  return {
    ...snapshot,
    selectedMatchId,
    loading,
    busy,
    error,
    refresh,
    actions,
  }
}

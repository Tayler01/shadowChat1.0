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
  fetchMyShadowCheckersQueuedSessions,
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
  myQueuedSessionIds: [],
  moves: [],
  chat: [],
  leaderboard: [],
}

function keepNewerMatch(previous: ShadowCheckersSnapshot, next: ShadowCheckersSnapshot): ShadowCheckersSnapshot {
  const prior = previous.activeMatch
  const incoming = next.activeMatch
  if (!prior || !incoming || prior.id !== incoming.id) return next
  const incomingIsOlder = prior.move_count > incoming.move_count
    || (prior.move_count === incoming.move_count
      && ['completed', 'cancelled'].includes(prior.status)
      && incoming.status === 'active')
  if (!incomingIsOlder) return next
  return {
    ...next,
    activeMatch: prior,
    matches: next.matches.map(match => match.id === prior.id ? prior : match),
    moves: previous.moves,
  }
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
  const [snapshotOwnerId, setSnapshotOwnerId] = useState<string | null>(null)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(() => initialMatchId ?? null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible')
  const channelRef = useRef<RealtimeChannel | null>(null)
  const refreshTimerRef = useRef<number | null>(null)
  const matchRefreshTimerRef = useRef<number | null>(null)
  const selectedMatchIdRef = useRef<string | null>(initialMatchId ?? null)
  const currentUserIdRef = useRef(user?.id ?? null)
  const snapshotOwnerIdRef = useRef<string | null>(null)
  const selectionGenerationRef = useRef(0)
  const refreshGenerationRef = useRef(0)
  const busyOperationRef = useRef(0)
  currentUserIdRef.current = user?.id ?? null

  const refresh = useCallback(async (nextSelectedMatchId = selectedMatchId) => {
    const requestUserId = user?.id ?? null
    const generation = ++refreshGenerationRef.current
    const selectionGeneration = selectionGenerationRef.current
    const isCurrent = () => generation === refreshGenerationRef.current
      && requestUserId === currentUserIdRef.current
      && selectionGeneration === selectionGenerationRef.current
      && nextSelectedMatchId === selectedMatchIdRef.current
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
      const [queue, moves, chat, myQueuedSessionIds] = await Promise.all([
        activeMatch && activeSessionId ? fetchShadowCheckersQueue(activeSessionId) : Promise.resolve([]),
        activeMatch ? fetchShadowCheckersMoves(activeMatch.id) : Promise.resolve([]),
        activeMatch ? fetchShadowCheckersChat(activeMatch.id) : Promise.resolve([]),
        requestUserId && !nextSelectedMatchId ? fetchMyShadowCheckersQueuedSessions(requestUserId) : Promise.resolve([]),
      ])

      const next = { sessions, matches, activeMatch, queue, myQueuedSessionIds, moves, chat, leaderboard }
      if (isCurrent()) {
        const previousOwnerId = snapshotOwnerIdRef.current
        setSnapshot(previous => isCurrent()
          ? keepNewerMatch(previousOwnerId === requestUserId ? previous : emptySnapshot, next)
          : previous)
        snapshotOwnerIdRef.current = requestUserId
        setSnapshotOwnerId(requestUserId)
        setError(null)
      }
      return next
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load Shadow Checkers'
      if (isCurrent()) setError(message)
      throw err
    } finally {
      if (isCurrent()) setLoading(false)
    }
  }, [selectedMatchId, user?.id])

  const refreshCurrentMatch = useCallback(async (matchId: string) => {
    const requestUserId = user?.id ?? null
    const selectionGeneration = selectionGenerationRef.current
    const isCurrent = () => requestUserId === currentUserIdRef.current
      && selectionGeneration === selectionGenerationRef.current
      && matchId === selectedMatchIdRef.current
    void fetchShadowCheckersMoves(matchId).then(moves => {
      if (!isCurrent()) return
      setSnapshot(previous => {
        if (!isCurrent() || snapshotOwnerIdRef.current !== requestUserId) return previous
        const priorMove = previous.moves[previous.moves.length - 1]?.move_number ?? 0
        const incomingMove = moves[moves.length - 1]?.move_number ?? 0
        return incomingMove >= priorMove ? { ...previous, moves } : previous
      })
    }).catch(() => {})
    const activeMatch = await fetchShadowCheckersMatch(matchId)
    if (isCurrent()) {
      const previousOwnerId = snapshotOwnerIdRef.current
      setSnapshot(previous => {
        if (!isCurrent()) return previous
        const base = previousOwnerId === requestUserId ? previous : emptySnapshot
        const next = {
          ...base,
          activeMatch,
          matches: activeMatch
            ? base.matches.map(match => match.id === matchId ? activeMatch : match)
            : base.matches,
        }
        return keepNewerMatch(base, next)
      })
      snapshotOwnerIdRef.current = requestUserId
      setSnapshotOwnerId(requestUserId)
      setError(null)
      setLoading(false)
    }
    return activeMatch
  }, [user?.id])

  useEffect(() => {
    void refresh().catch(() => {})
  }, [refresh])

  useEffect(() => {
    const nextInitialMatchId = initialMatchId ?? null
    if (selectedMatchIdRef.current !== nextInitialMatchId) selectionGenerationRef.current += 1
    selectedMatchIdRef.current = nextInitialMatchId
    setSelectedMatchId(nextInitialMatchId)
  }, [initialMatchId])

  const visibleSnapshot = snapshotOwnerId === (user?.id ?? null) ? snapshot : emptySnapshot
  const activeMatchId = visibleSnapshot.activeMatch?.id
  const activeMatchStatus = visibleSnapshot.activeMatch?.status
  const activeMatchTurnUserId = visibleSnapshot.activeMatch?.current_turn_user_id
  const activeMatchMoveCount = visibleSnapshot.activeMatch?.move_count
  const currentUserId = user?.id

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    if (
      !currentUserId
      || !pageVisible
      || !selectedMatchId
      || activeMatchId !== selectedMatchId
      || activeMatchStatus !== 'active'
      || activeMatchTurnUserId !== currentUserId
      || typeof activeMatchMoveCount !== 'number'
      || !Number.isInteger(activeMatchMoveCount)
    ) {
      return
    }

    let cancelled = false
    void markShadowCheckersTurnRead(
      selectedMatchId,
      activeMatchMoveCount,
      () => !cancelled && document.visibilityState === 'visible',
    )
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
    pageVisible,
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

      const refreshMatchSoon = () => {
        if (matchRefreshTimerRef.current !== null) window.clearTimeout(matchRefreshTimerRef.current)
        matchRefreshTimerRef.current = window.setTimeout(() => {
          matchRefreshTimerRef.current = null
          const matchId = selectedMatchIdRef.current
          if (matchId) void refreshCurrentMatch(matchId).catch(() => {})
        }, 40)
      }

      const changedId = (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }, key: string) =>
        payload.new?.[key] ?? payload.old?.[key]

      channel = currentClient
        .channel('public:shadow-checkers')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'game_session_queue' }, refreshSoon)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_checkers_matches' }, (payload: any) => {
          if (changedId(payload, 'id') === selectedMatchIdRef.current) refreshMatchSoon()
          else if (!selectedMatchIdRef.current) refreshSoon()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_checkers_moves' }, (payload: any) => {
          if (changedId(payload, 'match_id') === selectedMatchIdRef.current) refreshMatchSoon()
        })
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
      if (matchRefreshTimerRef.current !== null) {
        window.clearTimeout(matchRefreshTimerRef.current)
        matchRefreshTimerRef.current = null
      }
      channelRef.current = null
    }
  }, [refresh, refreshCurrentMatch, user])

  const runAction = useCallback(async <T,>(
    label: string,
    action: () => Promise<T>,
    getSelectedMatchId?: (result: T) => string | null | undefined,
    autoSelectRouteMode?: AutoSelectRouteMode,
  ) => {
    const operation = ++busyOperationRef.current
    const requestUserId = currentUserIdRef.current
    const selectionGeneration = selectionGenerationRef.current
    const isCurrent = () => requestUserId === currentUserIdRef.current
      && selectionGeneration === selectionGenerationRef.current
    setBusy(label)
    setError(null)
    try {
      const result = await action()
      if (!isCurrent()) throw new DOMException('Match selection changed', 'AbortError')
      const nextSelectedMatchId = getSelectedMatchId?.(result)
      const selectionChanged = Boolean(
        nextSelectedMatchId
        && nextSelectedMatchId !== selectedMatchIdRef.current
      )
      if (nextSelectedMatchId !== undefined) {
        if (nextSelectedMatchId !== selectedMatchIdRef.current) selectionGenerationRef.current += 1
        selectedMatchIdRef.current = nextSelectedMatchId
        setSelectedMatchId(nextSelectedMatchId)
      }
      if (nextSelectedMatchId && selectionChanged && autoSelectRouteMode) {
        onAutoSelectMatch?.(nextSelectedMatchId, autoSelectRouteMode)
      }
      await refresh(nextSelectedMatchId).catch(() => emptySnapshot)
      return result
    } catch (err) {
      if (operation === busyOperationRef.current
        && isCurrent()
        && !(err instanceof DOMException && err.name === 'AbortError')) {
        setError(formatShadowCheckersHookError(label, err))
      }
      throw err
    } finally {
      if (operation === busyOperationRef.current) setBusy(null)
    }
  }, [onAutoSelectMatch, refresh])

  const submitMoveAction = useCallback(async (matchId: string, pieceId: string, path: CheckersPosition[]) => {
    const operation = ++busyOperationRef.current
    const requestUserId = currentUserIdRef.current
    const selectionGeneration = selectionGenerationRef.current
    const isCurrent = () => requestUserId === currentUserIdRef.current
      && selectionGeneration === selectionGenerationRef.current
      && matchId === selectedMatchIdRef.current
    setBusy('move')
    setError(null)
    try {
      const result = await submitShadowCheckersMove(matchId, pieceId, path)
      if (!isCurrent()) throw new DOMException('Match selection changed', 'AbortError')
      void triggerShadowCheckersTurnPushNotification(result.matchId).catch(() => undefined)
      try {
        await refreshCurrentMatch(matchId)
      } catch {
        // The RPC already committed. Keep that success result and let the broad
        // refresh/realtime path retry the authoritative read without a false move error.
      }
      if (!isCurrent()) throw new DOMException('Match selection changed', 'AbortError')
      void refresh(matchId).catch(() => {})
      return result
    } catch (err) {
      if (operation === busyOperationRef.current
        && isCurrent()
        && !(err instanceof DOMException && err.name === 'AbortError')) {
        setError(formatShadowCheckersHookError('move', err))
      }
      throw err
    } finally {
      if (operation === busyOperationRef.current) setBusy(null)
    }
  }, [refresh, refreshCurrentMatch])

  const actions = useMemo(() => ({
    create: (characterKey: string, boardSkin: 'classic' | 'cinematic' = 'classic') =>
      runAction('create', () => createShadowCheckersMatch(characterKey, boardSkin), result => result.matchId, 'push'),
    join: (sessionId: string, characterKey: string) =>
      runAction('join', async () => {
        const result = await joinShadowCheckersMatch(sessionId, characterKey)
        void triggerShadowCheckersTurnPushNotification(result.matchId).catch(() => undefined)
        return result
      }, result => result.matchId, 'push'),
    submitMove: submitMoveAction,
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
      if (matchId !== selectedMatchIdRef.current) selectionGenerationRef.current += 1
      selectedMatchIdRef.current = matchId
      setSelectedMatchId(matchId)
      void refresh(matchId).catch(() => {})
    },
  }), [refresh, runAction, submitMoveAction])

  return {
    ...visibleSnapshot,
    selectedMatchId,
    loading: snapshotOwnerId === (user?.id ?? null) ? loading : true,
    busy,
    error,
    refresh,
    actions,
  }
}

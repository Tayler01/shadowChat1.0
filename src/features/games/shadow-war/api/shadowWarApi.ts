import {
  ensureSession,
  getWorkingClient,
  type GameSession,
  type GameSessionPresence,
  type GameSessionQueueEntry,
  type ShadowWarMatch,
  type ShadowWarMove,
  type ShadowWarPlayerStateRow,
  type ShadowWarStats,
} from '../../../../lib/supabase'

const USER_SELECT = 'id, username, display_name, avatar_url, color, status, admin_role, checkers_crown, war_sword, shadow_pin_gold_pin, gold_easter_egg, presence_visibility'

export interface ShadowWarSnapshot {
  sessions: GameSession[]
  activeSession: GameSession | null
  match: ShadowWarMatch | null
  playerState: ShadowWarPlayerStateRow | null
  queue: GameSessionQueueEntry[]
  moves: ShadowWarMove[]
  presence: GameSessionPresence[]
  leaderboard: ShadowWarStats[]
}

export const fetchShadowWarSessions = async () => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('game_sessions')
    .select(`
      *,
      player_one:users!game_sessions_player_one_id_fkey(${USER_SELECT}),
      player_two:users!game_sessions_player_two_id_fkey(${USER_SELECT}),
      winner:users!game_sessions_winner_id_fkey(${USER_SELECT})
    `)
    .eq('game_type', 'shadow_war')
    .in('status', ['waiting', 'active'])
    .order('updated_at', { ascending: false })
    .limit(12)

  if (error) throw error
  return (data ?? []) as unknown as GameSession[]
}

export const fetchShadowWarSession = async (sessionId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('game_sessions')
    .select(`
      *,
      player_one:users!game_sessions_player_one_id_fkey(${USER_SELECT}),
      player_two:users!game_sessions_player_two_id_fkey(${USER_SELECT}),
      winner:users!game_sessions_winner_id_fkey(${USER_SELECT})
    `)
    .eq('game_type', 'shadow_war')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as unknown as GameSession | null
}

export const fetchShadowWarQueue = async (sessionId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('game_session_queue')
    .select(`*, user:users!game_session_queue_user_id_fkey(${USER_SELECT})`)
    .eq('session_id', sessionId)
    .in('status', ['queued', 'invited'])
    .order('position', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as GameSessionQueueEntry[]
}

export const fetchShadowWarSessionPresence = async (sessionIds: string[]) => {
  if (sessionIds.length === 0) return [] as GameSessionPresence[]

  const workingClient = await getWorkingClient()
  const recentCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const { data, error } = await workingClient
    .from('game_session_presence')
    .select(`*, user:users!game_session_presence_user_id_fkey(${USER_SELECT})`)
    .in('session_id', sessionIds)
    .gt('last_seen_at', recentCutoff)
    .order('last_seen_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as GameSessionPresence[]
}

export const fetchShadowWarLeaderboard = async () => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('shadow_war_stats')
    .select(`*, user:users!user_id(${USER_SELECT})`)
    .gt('total_games', 0)
    .order('wins', { ascending: false })
    .order('losses', { ascending: true })
    .order('last_win_at', { ascending: false, nullsFirst: false })
    .limit(50)

  if (error) throw error
  return ((data ?? []) as unknown as ShadowWarStats[]).sort((a, b) => {
    const aRate = a.total_games > 0 ? a.wins / a.total_games : 0
    const bRate = b.total_games > 0 ? b.wins / b.total_games : 0
    return b.wins - a.wins
      || a.losses - b.losses
      || bRate - aRate
      || Date.parse(b.last_win_at ?? '0') - Date.parse(a.last_win_at ?? '0')
  })
}

export const fetchShadowWarMatch = async (matchId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('shadow_war_matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ShadowWarMatch | null
}

export const fetchShadowWarPlayerState = async (matchId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('shadow_war_player_states')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as ShadowWarPlayerStateRow | null
}

export const fetchShadowWarMoves = async (matchId: string, roundNumber?: number) => {
  const workingClient = await getWorkingClient()
  let query = workingClient
    .from('shadow_war_moves')
    .select('*')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true })

  if (roundNumber) {
    query = query.eq('round_number', roundNumber)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ShadowWarMove[]
}

export const createShadowWarSession = async () => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('create_shadow_war_session')
  if (error) throw error
  return data as string
}

export const joinShadowWarSession = async (sessionId: string) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('join_shadow_war_session', {
    target_session_id: sessionId,
  })
  if (error) throw error
  return data as { sessionId: string; matchId: string }
}

export const queueShadowWarSession = async (sessionId: string) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('queue_shadow_war_session', {
    target_session_id: sessionId,
  })
  if (error) throw error
  return data as GameSessionQueueEntry
}

export const leaveShadowWarQueue = async (sessionId: string) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { error } = await workingClient.rpc('leave_shadow_war_queue', {
    target_session_id: sessionId,
  })
  if (error) throw error
}

export const touchShadowWarSessionPresence = async (sessionId: string) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('touch_shadow_war_session_presence', {
    target_session_id: sessionId,
  })
  if (error) throw error
  return data as GameSessionPresence
}

export const leaveShadowWarSessionPresence = async (sessionId: string) => {
  if (!await ensureSession()) return
  const workingClient = await getWorkingClient()
  const { error } = await workingClient.rpc('leave_shadow_war_session_presence', {
    target_session_id: sessionId,
  })
  if (error) throw error
}

export const cleanupShadowWarEmptySessions = async () => {
  if (!await ensureSession()) return { cancelledCount: 0, cancelledSessionIds: [] as string[] }
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('cleanup_shadow_war_empty_sessions')
  if (error) throw error
  return data as { cancelledCount: number; cancelledSessionIds: string[] }
}

export const submitShadowWarPlacement = async (
  matchId: string,
  placement: { left: string; center: string; right: string }
) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('submit_shadow_war_placement', {
    target_match_id: matchId,
    left_card_id: placement.left,
    center_card_id: placement.center,
    right_card_id: placement.right,
  })
  if (error) throw error
  return data as { matchId: string; roundNumber: number; lockedCount: number; revealed: boolean }
}

export const submitShadowWarSuddenWarCard = async (matchId: string, cardId: string) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('submit_shadow_war_sudden_war_card', {
    target_match_id: matchId,
    card_instance_id: cardId,
  })
  if (error) throw error
  return data as { matchId: string; roundNumber: number; lockedCount: number; revealed: boolean }
}

export const resolveShadowWarRound = async (matchId: string) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('resolve_shadow_war_round', {
    target_match_id: matchId,
  })
  if (error) throw error
  return data
}

export const rematchShadowWarSession = async (sessionId: string) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('rematch_shadow_war_session', {
    target_session_id: sessionId,
  })
  if (error) throw error
  return data as { sessionId: string; matchId: string }
}

export const startShadowWarNextChallenger = async (sessionId: string) => {
  if (!await ensureSession()) throw new Error('Authentication session is invalid or expired.')
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('start_shadow_war_next_challenger', {
    target_session_id: sessionId,
  })
  if (error) throw error
  return data as { sessionId: string; matchId: string }
}

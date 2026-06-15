import {
  getWorkingClient,
  type GameSession,
  type GameSessionQueueEntry,
  type ShadowCheckersChatMessage,
  type ShadowCheckersMatch,
  type ShadowCheckersMove,
  type ShadowCheckersStats,
} from '../../../../lib/supabase'
import type { CheckersPosition } from '../engine/types'

const USER_SELECT = 'id, username, display_name, avatar_url, color, status, admin_role, checkers_crown, war_sword, shadow_pin_gold_pin, shadow_runner_sprint_medal, shadow_runner_knight_medal, shadow_runner_knight_level_id, gold_easter_egg, presence_visibility'

export interface ShadowCheckersSnapshot {
  sessions: GameSession[]
  matches: ShadowCheckersMatch[]
  activeMatch: ShadowCheckersMatch | null
  queue: GameSessionQueueEntry[]
  moves: ShadowCheckersMove[]
  chat: ShadowCheckersChatMessage[]
  leaderboard: ShadowCheckersStats[]
}

async function client() {
  return getWorkingClient()
}

export async function ensureShadowCheckersSession() {
  const workingClient = await client()
  const { data: { user }, error } = await workingClient.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not authenticated')
  return { workingClient, user }
}

export async function fetchShadowCheckersSessions(): Promise<GameSession[]> {
  const workingClient = await client()
  const { data, error } = await workingClient
    .from('game_sessions')
    .select(`
      *,
      player_one:users!player_one_id(${USER_SELECT}),
      player_two:users!player_two_id(${USER_SELECT}),
      winner:users!winner_id(${USER_SELECT})
    `)
    .eq('game_type', 'shadow_checkers')
    .in('status', ['waiting', 'active'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as GameSession[]
}

export async function fetchShadowCheckersMatches(): Promise<ShadowCheckersMatch[]> {
  const workingClient = await client()
  const { data, error } = await workingClient
    .from('shadow_checkers_matches')
    .select(`
      *,
      player_one:users!player_one_id(${USER_SELECT}),
      player_two:users!player_two_id(${USER_SELECT}),
      winner:users!winner_id(${USER_SELECT}),
      loser:users!loser_id(${USER_SELECT})
    `)
    .in('status', ['waiting', 'active'])
    .order('updated_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ShadowCheckersMatch[]
}

export async function fetchShadowCheckersMatch(matchId: string): Promise<ShadowCheckersMatch | null> {
  const workingClient = await client()
  const { data, error } = await workingClient
    .from('shadow_checkers_matches')
    .select(`
      *,
      player_one:users!player_one_id(${USER_SELECT}),
      player_two:users!player_two_id(${USER_SELECT}),
      winner:users!winner_id(${USER_SELECT}),
      loser:users!loser_id(${USER_SELECT})
    `)
    .eq('id', matchId)
    .maybeSingle()

  if (error) throw error
  return data as ShadowCheckersMatch | null
}

export async function fetchShadowCheckersQueue(sessionId: string): Promise<GameSessionQueueEntry[]> {
  const workingClient = await client()
  const { data, error } = await workingClient
    .from('game_session_queue')
    .select(`*, user:users!user_id(${USER_SELECT})`)
    .eq('session_id', sessionId)
    .in('status', ['queued', 'invited'])
    .order('position', { ascending: true })

  if (error) throw error
  return (data ?? []) as GameSessionQueueEntry[]
}

export async function fetchShadowCheckersMoves(matchId: string): Promise<ShadowCheckersMove[]> {
  const workingClient = await client()
  const { data, error } = await workingClient
    .from('shadow_checkers_moves')
    .select(`*, user:users!user_id(${USER_SELECT})`)
    .eq('match_id', matchId)
    .order('move_number', { ascending: false })
    .limit(5)

  if (error) throw error
  return ((data ?? []) as ShadowCheckersMove[]).reverse()
}

export async function fetchShadowCheckersChat(matchId: string): Promise<ShadowCheckersChatMessage[]> {
  const workingClient = await client()
  const { data, error } = await workingClient
    .from('shadow_checkers_chat_messages')
    .select(`*, user:users!user_id(${USER_SELECT})`)
    .eq('match_id', matchId)
    .order('created_at', { ascending: false })
    .limit(4)

  if (error) throw error
  return ((data ?? []) as ShadowCheckersChatMessage[]).reverse()
}

export async function fetchShadowCheckersLeaderboard(): Promise<ShadowCheckersStats[]> {
  const workingClient = await client()
  const { data, error } = await workingClient
    .from('shadow_checkers_stats')
    .select(`*, user:users!user_id(${USER_SELECT})`)
    .gt('total_games', 0)
    .order('wins', { ascending: false })
    .order('losses', { ascending: true })
    .order('last_win_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return (data ?? []) as ShadowCheckersStats[]
}

export async function createShadowCheckersMatch(characterKey: string, boardSkin: 'classic' | 'cinematic' = 'classic') {
  const { workingClient } = await ensureShadowCheckersSession()
  const { data, error } = await workingClient.rpc('create_shadow_checkers_match', {
    character_key: characterKey,
    selected_board_skin: boardSkin,
  })
  if (error) throw error
  return data as { sessionId: string; matchId: string }
}

export async function joinShadowCheckersMatch(sessionId: string, characterKey: string) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { data, error } = await workingClient.rpc('join_shadow_checkers_match', {
    target_session_id: sessionId,
    character_key: characterKey,
  })
  if (error) throw error
  return data as { sessionId: string; matchId: string }
}

export async function submitShadowCheckersMove(matchId: string, pieceId: string, path: CheckersPosition[]) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { data, error } = await workingClient.rpc('submit_shadow_checkers_move', {
    target_match_id: matchId,
    piece_id: pieceId,
    move_path: path,
  })
  if (error) throw error
  return data as { matchId: string; completed: boolean }
}

export async function resignShadowCheckersMatch(matchId: string) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { data, error } = await workingClient.rpc('resign_shadow_checkers_match', { target_match_id: matchId })
  if (error) throw error
  return data as { matchId: string; winnerId: string }
}

export async function cancelShadowCheckersMatch(matchId: string) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { error } = await workingClient.rpc('cancel_shadow_checkers_match', { target_match_id: matchId })
  if (error) throw error
}

export async function queueShadowCheckersMatch(sessionId: string, characterKey?: string) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { data, error } = await workingClient.rpc('queue_shadow_checkers_match', {
    target_session_id: sessionId,
    character_key: characterKey ?? null,
  })
  if (error) throw error
  return data as GameSessionQueueEntry
}

export async function rematchShadowCheckersMatch(matchId: string) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { data, error } = await workingClient.rpc('rematch_shadow_checkers_match', { target_match_id: matchId })
  if (error) throw error
  return data as { sessionId: string; matchId: string }
}

export async function startShadowCheckersNextChallenger(matchId: string) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { data, error } = await workingClient.rpc('start_shadow_checkers_next_challenger', { target_match_id: matchId })
  if (error) throw error
  return data as { sessionId: string; matchId: string }
}

export async function leaveShadowCheckersQueue(sessionId: string) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { error } = await workingClient.rpc('leave_shadow_checkers_queue', { target_session_id: sessionId })
  if (error) throw error
}

export async function postShadowCheckersChatMessage(matchId: string, body: string) {
  const { workingClient } = await ensureShadowCheckersSession()
  const { data, error } = await workingClient.rpc('post_shadow_checkers_chat_message', {
    target_match_id: matchId,
    body,
  })
  if (error) throw error
  return data as ShadowCheckersChatMessage
}

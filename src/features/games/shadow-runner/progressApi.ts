import { getSessionWithTimeout, getWorkingClient } from '../../../lib/supabase'
import { isShadowRunnerLevelId, type ShadowRunnerLedgerCompletion, type ShadowRunnerProgressApi } from './progress'

async function caller(ownerId: string, signal: AbortSignal) {
  const client = await getWorkingClient()
  if (signal.aborted) throw new Error('Progress request cancelled')
  const { data, error } = await getSessionWithTimeout(client)
  if (signal.aborted || error || data.session?.user.id !== ownerId || !data.session.access_token) {
    throw new Error('Progress account changed or session unavailable')
  }
  return { client, authorization: `Bearer ${data.session.access_token}` }
}

// Pin each request to the validated caller. A shared client's token can change at
// an await boundary; checking React's user id alone would not bind an RPC's owner.
export const shadowRunnerProgressApi: ShadowRunnerProgressApi = {
  async read(ownerId, signal) {
    const { client, authorization } = await caller(ownerId, signal)
    if (signal.aborted) throw new Error('Progress request cancelled')
    const { data, error } = await client.from('shadow_runner_level_completions')
      .select('user_id,level_id,score,coins_collected,total_coins,enemies_defeated,total_enemies,completed_at')
      .eq('user_id', ownerId)
      .setHeader('Authorization', authorization)
      .abortSignal(signal)
    if (error) throw error
    if (signal.aborted) throw new Error('Progress request cancelled')
    const rows: ShadowRunnerLedgerCompletion[] = []
    for (const row of data ?? []) {
      if (row.user_id !== ownerId || !isShadowRunnerLevelId(row.level_id)) continue
      rows.push({ ownerId, levelId: row.level_id, completedAt: row.completed_at, score: row.score, coinsCollected: row.coins_collected, totalCoins: row.total_coins, enemiesDefeated: row.enemies_defeated, totalEnemies: row.total_enemies })
    }
    return rows
  },
  async record(ownerId, levelId, completion, signal) {
    const { client, authorization } = await caller(ownerId, signal)
    if (signal.aborted) throw new Error('Progress request cancelled')
    const { data, error } = await client.rpc('record_shadow_runner_level_completion', {
      completed_level_id: levelId,
      completion_score: completion.score,
      completion_coins_collected: completion.coinsCollected,
      completion_total_coins: completion.totalCoins,
      completion_enemies_defeated: completion.enemiesDefeated,
      completion_total_enemies: completion.totalEnemies,
    }).setHeader('Authorization', authorization).abortSignal(signal)
    if (error) throw error
    if (signal.aborted || data !== true) throw new Error('Completion was not acknowledged')
  },
}

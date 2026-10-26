/**
 * Operator-only retention workflow. Defaults to a read-only dry-run.
 * Execute only a reviewed allowlist: --execute --case-id <uuid> [--case-id ...].
 * Before commit, a hold/reopen cancels preparation. Commit is irreversible:
 * exact claimed bytes may already be disappearing; unknown outcomes need retry.
 * No scheduling, automatic expiry of claims, or real evidence deletion in tests.
 */
import { createClient } from '@supabase/supabase-js'
import { runModerationRetention } from './moderation-retention-core.mjs'

const args = process.argv.slice(2)
const ids = []
let execute = false
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--execute' && !execute) execute = true
  else if (args[index] === '--case-id' && args[index + 1]) ids.push(args[++index])
  else throw new Error('Use only --execute and explicit --case-id <uuid> arguments')
}
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Operator Supabase environment is not configured')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const rpc = async (name, values) => {
  const { data, error } = await client.rpc(name, values)
  if (error) throw new Error(error.message)
  return data
}
const validateProvider = asset => {
  if (!process.env.BUNNY_STREAM_API_KEY || process.env.BUNNY_STREAM_LIBRARY_ID !== asset.library_id) {
    throw new Error('The retained video library is not configured')
  }
}
await runModerationRetention({
  rpc, caseIds: ids, execute, validateProvider,
  log: value => console.log(JSON.stringify(value)),
  removeStorage: async item => {
    const { error } = await client.storage.from(item.bucket).remove([item.path])
    if (error) throw new Error('Evidence file removal was not confirmed; retry the durable committed job')
  },
  removeBunny: async asset => {
    const response = await fetch('https://video.bunnycdn.com/library/' + asset.library_id + '/videos/' + asset.asset_id, {
      method: 'DELETE', headers: { AccessKey: process.env.BUNNY_STREAM_API_KEY },
      redirect: 'error', signal: AbortSignal.timeout(20_000),
    })
    await response.body?.cancel()
    if (!response.ok && response.status !== 404) throw new Error('Retained video removal was not confirmed; retry the durable committed job')
  },
})

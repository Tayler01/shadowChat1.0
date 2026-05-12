import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const repoRoot = process.cwd()
const envValues = await loadDotEnvFiles([
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.testing.local'),
])
const args = parseArgs(process.argv.slice(2))
const runName = `shadow-checkers-db-${new Date().toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14)}`
const artifactDir = path.join(repoRoot, 'output', 'shadow-checkers', runName)
const summaryPath = path.join(artifactDir, 'summary.json')

await mkdir(artifactDir, { recursive: true })

const summary = {
  startedAt: new Date().toISOString(),
  checks: [],
  warnings: [],
  status: 'running',
}

try {
  const supabaseUrl = getEnvValue(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const supabaseAnonKey = getEnvValue(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'])

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY')
  }

  const playerOne = await signInClient(supabaseUrl, supabaseAnonKey, readAccount(1))
  const playerTwo = await signInClient(supabaseUrl, supabaseAnonKey, readAccount(2))

  const created = await rpc(playerOne.client, 'create_shadow_checkers_match', { character_key: 'obsidian-sentinel' })
  assert(created?.sessionId && created?.matchId, 'create_shadow_checkers_match did not return ids')
  record('create public match', created)

  await expectRpcFailure(
    playerTwo.client,
    'join_shadow_checkers_match',
    { target_session_id: created.sessionId, character_key: 'obsidian-sentinel' },
    /Character already taken/i
  )
  record('duplicate character blocked')

  const joined = await rpc(playerTwo.client, 'join_shadow_checkers_match', {
    target_session_id: created.sessionId,
    character_key: 'amber-vow',
  })
  assert(joined?.matchId === created.matchId, 'join returned unexpected match id')
  record('second player joins with unique character')

  await expectRpcFailure(
    playerTwo.client,
    'submit_shadow_checkers_move',
    {
      target_match_id: created.matchId,
      piece_id: 'p2-2-1',
      move_path: [{ row: 2, col: 1 }, { row: 3, col: 0 }],
    },
    /Not your turn/i
  )
  record('non-current player move blocked')

  await rpc(playerOne.client, 'submit_shadow_checkers_move', {
    target_match_id: created.matchId,
    piece_id: 'p1-5-0',
    move_path: [{ row: 5, col: 0 }, { row: 4, col: 1 }],
  })
  record('player one legal move accepted')

  await rpc(playerTwo.client, 'submit_shadow_checkers_move', {
    target_match_id: created.matchId,
    piece_id: 'p2-2-1',
    move_path: [{ row: 2, col: 1 }, { row: 3, col: 0 }],
  })
  record('player two legal move accepted')

  await rpc(playerOne.client, 'post_shadow_checkers_chat_message', {
    target_match_id: created.matchId,
    body: 'Smoke test ready',
  })
  record('temporary match chat accepted')

  await rpc(playerTwo.client, 'resign_shadow_checkers_match', { target_match_id: created.matchId })
  const completed = await fetchMatch(playerOne.client, created.matchId)
  assert(completed.status === 'completed', 'resignation did not complete match')
  assert(completed.winner_id === playerOne.user.id, 'resignation did not award opponent win')
  record('resignation completes match and awards opponent win')

  const stats = await fetchStats(playerOne.client)
  assert(stats.some(row => row.user_id === playerOne.user.id && row.wins >= 1), 'winner stats did not update')
  record('leaderboard stats updated')

  if (!args.keepData) {
    const adminClient = await tryCreateAdminClient(supabaseUrl)
    if (adminClient) {
      await cleanupSmokeData(adminClient, {
        sessionId: created.sessionId,
        winnerId: playerOne.user.id,
        loserId: playerTwo.user.id,
      })
      record('smoke data cleaned up')
    } else {
      summary.warnings.push('Smoke data cleanup skipped because service-role access was unavailable. Use --keep-data to make this intentional.')
    }
  }

  summary.status = 'passed'
  summary.finishedAt = new Date().toISOString()
  await writeJson(summaryPath, summary)
  console.log(`Shadow Checkers DB smoke passed. Summary: ${summaryPath}`)
} catch (error) {
  summary.status = 'failed'
  summary.finishedAt = new Date().toISOString()
  summary.error = serializeError(error)
  await writeJson(summaryPath, summary)
  console.error(`Shadow Checkers DB smoke failed. Summary: ${summaryPath}`)
  console.error(summary.error.message)
  process.exitCode = 1
}

async function signInClient(supabaseUrl, supabaseAnonKey, account) {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  const { data, error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw error
  if (!data.user) throw new Error(`No user returned for ${account.label}`)
  return { ...account, client, user: data.user }
}

function parseArgs(argv) {
  return {
    keepData: argv.includes('--keep-data') || process.env.npm_config_keep_data === 'true',
  }
}

function readAccount(index) {
  const prefix = [`PLAYWRIGHT_ACCOUNT_${index}_`, `PLAYWRIGHT_ACCOUNT${index}_`]
  const email = getEnvValue(prefix.map(value => `${value}EMAIL`))
  const password = getEnvValue(prefix.map(value => `${value}PASSWORD`))
  if (!email || !password) {
    throw new Error(`Missing PLAYWRIGHT_ACCOUNT_${index}_EMAIL/PASSWORD in .env.testing.local or process env`)
  }
  return { label: `account-${index}`, email, password }
}

async function rpc(client, name, params = {}) {
  const { data, error } = await client.rpc(name, params)
  if (error) throw error
  return data
}

async function expectRpcFailure(client, name, params, expectedPattern) {
  const { error } = await client.rpc(name, params)
  if (!error) throw new Error(`${name} unexpectedly succeeded`)
  if (expectedPattern && !expectedPattern.test(error.message)) {
    throw new Error(`${name} failed with unexpected message: ${error.message}`)
  }
}

async function fetchMatch(client, matchId) {
  const { data, error } = await client
    .from('shadow_checkers_matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Match not found: ${matchId}`)
  return data
}

async function fetchStats(client) {
  const { data, error } = await client
    .from('shadow_checkers_stats')
    .select('*')
  if (error) throw error
  return data ?? []
}

async function tryCreateAdminClient(supabaseUrl) {
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0]
    const raw = execFileSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const serviceRole = JSON.parse(raw).find(key => key.name === 'service_role')?.api_key
    if (!serviceRole) return null
    return createClient(supabaseUrl, serviceRole, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  } catch {
    return null
  }
}

async function cleanupSmokeData(adminClient, { sessionId, winnerId, loserId }) {
  const deleteSession = await adminClient.from('game_sessions').delete().eq('id', sessionId)
  if (deleteSession.error) throw deleteSession.error

  await decrementStats(adminClient, winnerId, { wins: 1, losses: 0 })
  await decrementStats(adminClient, loserId, { wins: 0, losses: 1 })

  const deleteEmpty = await adminClient.from('shadow_checkers_stats').delete().eq('total_games', 0)
  if (deleteEmpty.error) throw deleteEmpty.error

  const clearCrowns = await adminClient.from('users').update({ checkers_crown: false }).eq('checkers_crown', true)
  if (clearCrowns.error) throw clearCrowns.error

  const { data: champion, error } = await adminClient
    .from('shadow_checkers_stats')
    .select('user_id,wins,losses,total_games,last_win_at')
    .gt('total_games', 0)
    .order('wins', { ascending: false })
    .order('losses', { ascending: true })
    .order('last_win_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error

  if (champion?.user_id) {
    const setCrown = await adminClient.from('users').update({ checkers_crown: true }).eq('id', champion.user_id)
    if (setCrown.error) throw setCrown.error
  }
}

async function decrementStats(adminClient, userId, delta) {
  const { data: row, error } = await adminClient
    .from('shadow_checkers_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!row) return

  const wins = Math.max(0, row.wins - delta.wins)
  const losses = Math.max(0, row.losses - delta.losses)
  const total_games = Math.max(0, row.total_games - 1)
  const update = await adminClient
    .from('shadow_checkers_stats')
    .update({
      wins,
      losses,
      total_games,
      last_win_at: wins > 0 ? row.last_win_at : null,
    })
    .eq('user_id', userId)
  if (update.error) throw update.error
}

function record(name, details = {}) {
  summary.checks.push({ name, status: 'passed', details, at: new Date().toISOString() })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {}
  const raw = await readFile(filePath, 'utf8')
  const values = {}
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const equalsIndex = trimmed.indexOf('=')
    if (equalsIndex <= 0) continue
    const key = trimmed.slice(0, equalsIndex).trim()
    let value = trimmed.slice(equalsIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

async function loadDotEnvFiles(filePaths) {
  const values = {}
  for (const filePath of filePaths) {
    Object.assign(values, await loadDotEnv(filePath))
  }
  return values
}

function getEnvValue(names) {
  for (const name of Array.isArray(names) ? names : [names]) {
    const candidate = process.env[name] ?? envValues[name]
    if (candidate) return candidate
  }
  return ''
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function serializeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

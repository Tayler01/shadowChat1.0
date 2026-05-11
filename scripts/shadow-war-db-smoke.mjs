import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const DEFAULT_TIMEOUT_MS = 20_000

const repoRoot = process.cwd()
const envValues = await loadDotEnvFiles([
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.testing.local'),
])
const args = parseArgs(process.argv.slice(2))
const runName = slugify(args.runName || `shadow-war-db-${timestampToken()}`)
const artifactDir = path.join(repoRoot, 'output', 'shadow-war', runName)
const summaryPath = path.join(artifactDir, 'summary.json')

await mkdir(artifactDir, { recursive: true })

const summary = {
  startedAt: new Date().toISOString(),
  artifactDir,
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

  const accountOne = readAccount(1)
  const accountTwo = readAccount(2)
  const accountThree = args.skipQueue ? null : readAccount(3)

  const playerOne = await signInClient(supabaseUrl, supabaseAnonKey, accountOne)
  const playerTwo = await signInClient(supabaseUrl, supabaseAnonKey, accountTwo)
  const queuedPlayer = accountThree ? await signInClient(supabaseUrl, supabaseAnonKey, accountThree) : null

  const sessionId = await rpc(playerOne.client, 'create_shadow_war_session')
  record('create session', { sessionId })

  const joined = await rpc(playerTwo.client, 'join_shadow_war_session', { target_session_id: sessionId })
  const matchId = joined.matchId
  assert(matchId, 'join_shadow_war_session did not return matchId')
  record('join session starts match', { sessionId, matchId })

  const adminClient = await tryCreateAdminClient(supabaseUrl)
  const suddenWarPlan = adminClient
    ? await prepareSuddenWarRound(adminClient, matchId, playerOne.user.id, playerTwo.user.id)
    : null

  if (suddenWarPlan) {
    record('deterministic sudden-war state prepared')
  } else {
    summary.warnings.push('Sudden-war deterministic setup skipped because Supabase admin access was unavailable.')
  }

  if (queuedPlayer) {
    await expectRpcFailure(
      queuedPlayer.client,
      'submit_shadow_war_placement',
      {
        target_match_id: matchId,
        left_card_id: 'not-a-card',
        center_card_id: 'still-not-a-card',
        right_card_id: 'also-not-a-card',
      },
      /Only active players|Formation contains/i
    )
    record('non-player submit blocked')

    const queueRow = await rpc(queuedPlayer.client, 'queue_shadow_war_session', { target_session_id: sessionId })
    assert(queueRow?.status === 'queued', 'queue_shadow_war_session did not return a queued row')
    record('third account can queue', { queueEntryId: queueRow.id, position: queueRow.position })

    const repeatedQueueRow = await rpc(queuedPlayer.client, 'queue_shadow_war_session', { target_session_id: sessionId })
    assert(repeatedQueueRow?.id === queueRow.id, 'queueing twice should update the active queue entry')
    record('duplicate queue request keeps one active entry', { queueEntryId: repeatedQueueRow.id })

    await rpc(queuedPlayer.client, 'leave_shadow_war_queue', { target_session_id: sessionId })
    record('queued account can leave queue')

    const requeueRow = await rpc(queuedPlayer.client, 'queue_shadow_war_session', { target_session_id: sessionId })
    assert(requeueRow?.status === 'queued', 'queued account could not requeue after leaving')
    assert(requeueRow?.id !== queueRow.id, 'requeue after leaving should create a new active entry')
    record('queued account can requeue after leaving', { queueEntryId: requeueRow.id, position: requeueRow.position })
  } else {
    summary.warnings.push('Queue checks skipped because --skip-queue was set.')
  }

  let completedSession = null
  let latestMatch = null

  for (let round = 1; round <= 12; round += 1) {
    latestMatch = await fetchMatch(playerOne.client, matchId)
    if (latestMatch.status === 'completed') {
      break
    }

    const p1State = await fetchPlayerState(playerOne.client, matchId, playerOne.user.id)
    const p2State = await fetchPlayerState(playerTwo.client, matchId, playerTwo.user.id)
    assert(p1State.state.hand.length >= 3, `player one has fewer than 3 cards in round ${round}`)
    assert(p2State.state.hand.length >= 3, `player two has fewer than 3 cards in round ${round}`)

    const p1Placement = suddenWarPlan && round === 1
      ? suddenWarPlan.playerOnePlacement
      : choosePlacement(p1State.state.hand, 'high')
    const p2Placement = suddenWarPlan && round === 1
      ? suddenWarPlan.playerTwoPlacement
      : choosePlacement(p2State.state.hand, 'low')

    const firstLock = await rpc(playerOne.client, 'submit_shadow_war_placement', {
      target_match_id: matchId,
      left_card_id: p1Placement.left,
      center_card_id: p1Placement.center,
      right_card_id: p1Placement.right,
    })
    assert(firstLock.lockedCount === 1 && firstLock.revealed === false, 'first lock should not reveal')

    await expectRpcFailure(
      playerOne.client,
      'submit_shadow_war_placement',
      {
        target_match_id: matchId,
        left_card_id: p1Placement.left,
        center_card_id: p1Placement.center,
        right_card_id: p1Placement.right,
      },
      /duplicate|unique|already|violates/i
    )

    const hiddenMovesForP2 = await fetchMoves(playerTwo.client, matchId, latestMatch.round_number)
    assert(hiddenMovesForP2.length === 0, 'opponent could read hidden move before reveal')

    const secondLock = await rpc(playerTwo.client, 'submit_shadow_war_placement', {
      target_match_id: matchId,
      left_card_id: p2Placement.left,
      center_card_id: p2Placement.center,
      right_card_id: p2Placement.right,
    })
    assert(secondLock.lockedCount === 2 && secondLock.revealed === true, 'second lock should reveal')

    const revealedMoves = await fetchMoves(playerOne.client, matchId, latestMatch.round_number)
    assert(revealedMoves.length === 2, 'players should see both moves after reveal')

    let result = await rpc(playerOne.client, 'resolve_shadow_war_round', { target_match_id: matchId })
    record('round resolved', {
      round: latestMatch.round_number,
      roundWinner: result.roundWinner,
      needsSuddenWar: Boolean(result.needsSuddenWar),
      laneWinners: result.laneResults?.map(lane => lane.winner),
    })

    if (result.needsSuddenWar) {
      const playerOneSuddenCard = suddenWarPlan && round === 1
        ? suddenWarPlan.playerOneSuddenCard
        : chooseSuddenWarCard(p1State.state.hand, p1Placement, 'high')
      const playerTwoSuddenCard = suddenWarPlan && round === 1
        ? suddenWarPlan.playerTwoSuddenCard
        : chooseSuddenWarCard(p2State.state.hand, p2Placement, 'low')

      latestMatch = await fetchMatch(playerOne.client, matchId)
      assert(latestMatch.current_phase === 'sudden_war', 'tied round did not enter sudden_war phase')

      const firstSuddenLock = await rpc(playerOne.client, 'submit_shadow_war_sudden_war_card', {
        target_match_id: matchId,
        card_instance_id: playerOneSuddenCard,
      })
      assert(firstSuddenLock.lockedCount === 1 && firstSuddenLock.revealed === false, 'first sudden-war lock should not reveal')

      await expectRpcFailure(
        playerOne.client,
        'submit_shadow_war_sudden_war_card',
        {
          target_match_id: matchId,
          card_instance_id: playerOneSuddenCard,
        },
        /duplicate|unique|already|violates/i
      )

      const hiddenSuddenForP2 = await fetchMoves(playerTwo.client, matchId, latestMatch.round_number)
      assert(
        hiddenSuddenForP2.every(move => move.move_type !== 'sudden_war' || move.user_id === playerTwo.user.id),
        'opponent could read hidden sudden-war card before reveal'
      )

      const secondSuddenLock = await rpc(playerTwo.client, 'submit_shadow_war_sudden_war_card', {
        target_match_id: matchId,
        card_instance_id: playerTwoSuddenCard,
      })
      assert(secondSuddenLock.lockedCount === 2 && secondSuddenLock.revealed === true, 'second sudden-war lock should reveal')

      const revealedSuddenMoves = await fetchMoves(playerOne.client, matchId, latestMatch.round_number)
      assert(
        revealedSuddenMoves.filter(move => move.move_type === 'sudden_war').length === 2,
        'players should see both sudden-war cards after reveal'
      )

      result = await rpc(playerOne.client, 'resolve_shadow_war_round', { target_match_id: matchId })
      if (suddenWarPlan && round === 1) {
        assert(result.suddenWar?.winner === 'player_one', 'deterministic sudden war should award the round to player one')
        assert(result.roundWinner === 'player_one', 'sudden war did not decide the round winner')
      } else {
        assert(result.needsSuddenWar === false, 'sudden war should finish the tiebreaker attempt')
      }
      record('sudden-war tiebreak resolved', {
        round: latestMatch.round_number,
        winner: result.suddenWar?.winner,
      })
    }

    latestMatch = await fetchMatch(playerOne.client, matchId)
    if (latestMatch.status === 'completed') {
      completedSession = await fetchSession(playerOne.client, sessionId)
      break
    }
  }

  completedSession = completedSession ?? await fetchSession(playerOne.client, sessionId)
  assert(completedSession.status === 'completed', 'match did not complete within 12 rounds')
  assert(completedSession.winner_id, 'completed session has no winner')
  record('match completed', {
    winnerId: completedSession.winner_id,
    loserId: completedSession.loser_id,
  })

  if (queuedPlayer) {
    const winnerClient = completedSession.winner_id === playerOne.user.id ? playerOne.client : playerTwo.client

    await expectRpcFailure(
      winnerClient,
      'rematch_shadow_war_session',
      { target_session_id: sessionId },
      /queued challenger|waiting/i
    )
    record('queued challenger blocks immediate rematch')

    const next = await rpc(winnerClient, 'start_shadow_war_next_challenger', { target_session_id: sessionId })
    assert(next?.sessionId && next?.matchId, 'next challenger flow did not create a new active match')
    const nextSession = await fetchSession(winnerClient, next.sessionId)
    assert(nextSession.status === 'active', 'next challenger session is not active')
    assert(
      [nextSession.player_one_id, nextSession.player_two_id].includes(queuedPlayer.user.id),
      'queued player was not seated in next challenger match'
    )
    record('next queued challenger starts active match', {
      sessionId: next.sessionId,
      matchId: next.matchId,
    })
  }

  summary.finishedAt = new Date().toISOString()
  summary.status = 'passed'
  await writeJson(summaryPath, summary)
  console.log(`Shadow War DB smoke passed. Summary: ${summaryPath}`)
} catch (error) {
  summary.finishedAt = new Date().toISOString()
  summary.status = 'failed'
  summary.error = serializeError(error)
  await writeJson(summaryPath, summary)
  console.error(`Shadow War DB smoke failed. Summary: ${summaryPath}`)
  console.error(summary.error.message)
  if (summary.error.details) {
    console.error(JSON.stringify(summary.error.details, null, 2))
  } else if (error instanceof Error && error.stack) {
    console.error(error.stack)
  }
  process.exitCode = 1
}

function parseArgs(argv) {
  const parsed = {
    runName: process.env.npm_config_run_name || null,
    skipQueue: process.env.npm_config_skip_queue === 'true' || process.env.npm_config_skip_queue === '1',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (current === '--skip-queue') {
      parsed.skipQueue = true
    } else if (current.startsWith('--run-name=')) {
      parsed.runName = current.slice('--run-name='.length)
    } else if (current === '--run-name' && argv[index + 1]) {
      parsed.runName = argv[++index]
    }
  }

  return parsed
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

async function tryCreateAdminClient(supabaseUrl) {
  try {
    const ref = new URL(supabaseUrl).hostname.split('.')[0]
    const raw = execFileSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const keys = JSON.parse(raw)
    const serviceRole = keys.find(key => key.name === 'service_role')?.api_key
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

async function prepareSuddenWarRound(adminClient, matchId, playerOneId, playerTwoId) {
  const p1Hand = [
    testCard('p1-left-6', 6),
    testCard('p1-center-1', 1),
    testCard('p1-right-5', 5),
    testCard('p1-sudden-10', 10),
    testCard('p1-reserve-3', 3),
  ]
  const p2Hand = [
    testCard('p2-left-1', 1),
    testCard('p2-center-6', 6),
    testCard('p2-right-5', 5),
    testCard('p2-sudden-2', 2),
    testCard('p2-reserve-3', 3),
  ]

  await updatePlayerState(adminClient, matchId, playerOneId, {
    userId: playerOneId,
    hand: p1Hand,
    deck: buildQaDeck('p1-deck'),
    discard: [],
    scoutBonusDraws: 0,
  })
  await updatePlayerState(adminClient, matchId, playerTwoId, {
    userId: playerTwoId,
    hand: p2Hand,
    deck: buildQaDeck('p2-deck'),
    discard: [],
    scoutBonusDraws: 0,
  })

  return {
    playerOnePlacement: {
      left: 'p1-left-6',
      center: 'p1-center-1',
      right: 'p1-right-5',
    },
    playerTwoPlacement: {
      left: 'p2-left-1',
      center: 'p2-center-6',
      right: 'p2-right-5',
    },
    playerOneSuddenCard: 'p1-sudden-10',
    playerTwoSuddenCard: 'p2-sudden-2',
  }
}

async function updatePlayerState(adminClient, matchId, userId, state) {
  const { error } = await adminClient
    .from('shadow_war_player_states')
    .update({ state })
    .eq('match_id', matchId)
    .eq('user_id', userId)
  if (error) throw error
}

function buildQaDeck(prefix) {
  return Array.from({ length: 16 }, (_, index) => testCard(`${prefix}-${index + 1}`, (index % 10) + 1))
}

function testCard(instanceId, rank) {
  return {
    instanceId,
    cardId: `qa-${rank}`,
    name: `QA ${rank}`,
    rank,
    archetype: 'QA',
    abilityKey: 'stable',
    description: 'Deterministic smoke-test card',
    imageUrl: `/games/shadow-war/cards/knight.webp`,
  }
}

function readAccount(index) {
  const prefix = [`PLAYWRIGHT_ACCOUNT_${index}_`, `PLAYWRIGHT_ACCOUNT${index}_`]
  const email = getEnvValue(prefix.map(value => `${value}EMAIL`))
  const password = getEnvValue(prefix.map(value => `${value}PASSWORD`))

  if (!email || !password) {
    throw new Error(`Missing PLAYWRIGHT_ACCOUNT_${index}_EMAIL/PASSWORD in .env.testing.local or process env`)
  }

  return {
    label: `account-${index}`,
    email,
    password,
  }
}

async function rpc(client, name, params = {}) {
  const { data, error } = await client.rpc(name, params)
  if (error) throw error
  return data
}

async function expectRpcFailure(client, name, params, expectedPattern) {
  const { error } = await client.rpc(name, params)
  if (!error) {
    throw new Error(`${name} unexpectedly succeeded`)
  }
  if (expectedPattern && !expectedPattern.test(error.message)) {
    throw new Error(`${name} failed with unexpected message: ${error.message}`)
  }
}

async function fetchSession(client, sessionId) {
  const { data, error } = await client
    .from('game_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Session not found: ${sessionId}`)
  return data
}

async function fetchMatch(client, matchId) {
  const { data, error } = await client
    .from('shadow_war_matches')
    .select('*')
    .eq('id', matchId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`Match not found: ${matchId}`)
  return data
}

async function fetchPlayerState(client, matchId, expectedUserId) {
  const { data, error } = await client
    .from('shadow_war_player_states')
    .select('*')
    .eq('match_id', matchId)
  if (error) throw error
  if (!data || data.length !== 1) {
    throw new Error(`Expected exactly one visible player state for ${expectedUserId}, got ${data?.length ?? 0}`)
  }
  if (data[0].user_id !== expectedUserId) {
    throw new Error('RLS returned another player state')
  }
  return data[0]
}

async function fetchMoves(client, matchId, roundNumber) {
  const { data, error } = await client
    .from('shadow_war_moves')
    .select('*')
    .eq('match_id', matchId)
    .eq('round_number', roundNumber)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

function choosePlacement(hand, strategy) {
  const cards = [...hand].sort((a, b) => {
    if (strategy === 'high') return b.rank - a.rank
    return a.rank - b.rank
  }).slice(0, 3)

  return {
    left: cards[0].instanceId,
    center: cards[1].instanceId,
    right: cards[2].instanceId,
  }
}

function chooseSuddenWarCard(hand, placement, strategy) {
  const used = new Set([placement.left, placement.center, placement.right])
  const card = [...hand]
    .filter(candidate => !used.has(candidate.instanceId))
    .sort((a, b) => {
      if (strategy === 'high') return b.rank - a.rank
      return a.rank - b.rank
    })[0]

  assert(card, 'no reserve card available for sudden war')
  return card.instanceId
}

function record(name, details = {}) {
  summary.checks.push({
    name,
    status: 'passed',
    details,
    at: new Date().toISOString(),
  })
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
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

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
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
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  if (error && typeof error === 'object') {
    return {
      message: error.message || JSON.stringify(error),
      details: error,
    }
  }

  return { message: String(error) }
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

function timestampToken() {
  return new Date().toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14)
}

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const repoRoot = process.cwd()
const npxCliPath = path.join(
  path.dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npx-cli.js',
)

const parseEnvFile = async filePath => {
  const source = await readFile(filePath, 'utf8').catch(() => '')
  return Object.fromEntries(source.split(/\r?\n/u).flatMap(line => {
    const normalized = line.trim()
    if (!normalized || normalized.startsWith('#')) return []
    const separator = normalized.indexOf('=')
    if (separator < 1) return []
    const key = normalized.slice(0, separator).trim()
    const value = normalized.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/u, '$2')
    return [[key, value]]
  }))
}

const env = {
  ...await parseEnvFile(path.join(repoRoot, '.env')),
  ...await parseEnvFile(path.join(repoRoot, '.env.testing.local')),
  ...process.env,
}

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}

must(
  process.argv.includes('--linked'),
  'Refusing to touch a hosted backend without the explicit --linked flag.',
)

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
const email = env.PLAYWRIGHT_ACCOUNT_1_EMAIL || env.PLAYWRIGHT_ACCOUNT1_EMAIL
const password = env.PLAYWRIGHT_ACCOUNT_1_PASSWORD || env.PLAYWRIGHT_ACCOUNT1_PASSWORD
must(supabaseUrl && supabaseAnonKey, 'Missing Supabase URL or browser-safe anon key.')
must(email && password, 'Missing controlled PLAYWRIGHT_ACCOUNT_1 credentials.')

const projectRef = new URL(supabaseUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/iu)?.[1]
must(projectRef, 'Catch-Up persistence verification requires a hosted Supabase project.')
const linkedProjectRef = (
  await readFile(path.join(repoRoot, 'supabase', '.temp', 'project-ref'), 'utf8')
    .catch(() => '')
).trim()
const expectedProjectRef = linkedProjectRef || env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF
must(
  expectedProjectRef === projectRef,
  `Refusing unexpected Supabase project ${projectRef}.`,
)

const resolveServiceRoleKey = () => {
  const configured = env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (configured) return configured
  const raw = execFileSync(
    process.execPath,
    [
      npxCliPath,
      'supabase',
      'projects',
      'api-keys',
      '--project-ref',
      projectRef,
      '--output',
      'json',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 60_000,
    },
  )
  const parsed = JSON.parse(raw)
  const keys = Array.isArray(parsed) ? parsed : parsed?.api_keys || []
  const serviceRole = keys.find(key => key.name === 'service_role' || key.type === 'service_role')
  must(serviceRole?.api_key, 'Supabase service-role fixture access is unavailable.')
  return serviceRole.api_key
}

const admin = createClient(supabaseUrl, resolveServiceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const userClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const eventId = randomUUID()
const entityId = randomUUID()
const dedupeKey = `qa:catch-up-read:${eventId}`
let userId = ''
let fixtureCreated = false
let cleanupVerified = false

try {
  const auth = await userClient.auth.signInWithPassword({ email, password })
  if (auth.error || !auth.data.user) throw auth.error || new Error('Controlled sign-in failed.')
  userId = auth.data.user.id

  const inserted = await admin
    .from('notification_events')
    .insert({
      id: eventId,
      user_id: userId,
      type: 'qa_catch_up_read',
      category: 'system',
      entity_id: entityId,
      route: '/?view=catchup',
      payload: {
        title: 'Catch-Up persistence proof',
        body: 'Controlled event created by verify-catch-up-read-persistence.mjs.',
      },
      dedupe_key: dedupeKey,
      presentation_expires_at: new Date(Date.now() + 90_000).toISOString(),
    })
    .select('id,read_at,presented_at')
    .single()
  if (inserted.error) throw inserted.error
  must(inserted.data?.id === eventId && inserted.data.read_at === null, 'Fixture was not created unread.')
  fixtureCreated = true

  const acknowledged = await userClient.rpc('mark_my_notification_event_read', {
    target_event_id: eventId,
  })
  if (acknowledged.error) throw acknowledged.error
  must(acknowledged.data === true, 'The exact read RPC did not confirm the controlled event.')

  const canonical = await userClient
    .from('notification_events')
    .select('id,read_at,presented_at')
    .eq('id', eventId)
    .single()
  if (canonical.error) throw canonical.error
  must(canonical.data.read_at && canonical.data.presented_at, 'Canonical read timestamps were not persisted.')

  const unread = await userClient
    .from('notification_events')
    .select('id', { count: 'exact', head: true })
    .eq('id', eventId)
    .is('read_at', null)
    .is('resolved_at', null)
  if (unread.error) throw unread.error
  must(unread.count === 0, 'The acknowledged event returned in a fresh unread query.')

  console.log(JSON.stringify({
    passed: true,
    projectRef,
    exactReadConfirmed: true,
    persistedAfterFreshQuery: true,
  }))
} finally {
  if (fixtureCreated && eventId && userId) {
    const deleted = await admin
      .from('notification_events')
      .delete()
      .eq('id', eventId)
      .eq('user_id', userId)
      .select('id')
    if (deleted.error) throw deleted.error
    must(deleted.data?.length === 1, 'The exact controlled notification fixture was not deleted.')
    const remaining = await admin
      .from('notification_events')
      .select('id', { count: 'exact', head: true })
      .eq('dedupe_key', dedupeKey)
    if (remaining.error) throw remaining.error
    cleanupVerified = remaining.count === 0
    must(cleanupVerified, 'Controlled notification residue remains.')
  }
  await userClient.auth.signOut()
  if (cleanupVerified) console.log(JSON.stringify({ cleanupVerified: true }))
}

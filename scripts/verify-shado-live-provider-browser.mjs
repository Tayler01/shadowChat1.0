import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices } from 'playwright'

const root = process.cwd()
const parseEnvFile = async filePath => Object.fromEntries(
  (await readFile(filePath, 'utf8').catch(() => '')).split(/\r?\n/u).flatMap(line => {
    const normalized = line.trim()
    if (!normalized || normalized.startsWith('#')) return []
    const separator = normalized.indexOf('=')
    if (separator < 1) return []
    return [[
      normalized.slice(0, separator).trim(),
      normalized.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/u, '$2'),
    ]]
  })
)

const env = {
  ...await parseEnvFile(path.join(root, '.env')),
  ...await parseEnvFile(path.join(root, '.env.testing.local')),
  ...process.env,
}
const linkedProjectRef = (await readFile(
  path.join(root, 'supabase', '.temp', 'project-ref'),
  'utf8'
).catch(() => '')).trim()
const baseUrl = String(process.argv.find(value => value.startsWith('--base-url='))?.slice(11) || '').replace(/\/$/u, '')
const localBaseUrl = baseUrl || 'http://127.0.0.1:4191'
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
const expectedProjectRef = env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF
  || env.SUPABASE_PROJECT_ID
  || linkedProjectRef
const liveKitProject = env.SHADO_LIVE_LIVEKIT_PROJECT || 'shadow'
const liveKitCli = env.LIVEKIT_CLI_PATH
  || 'C:\\Users\\tayle\\AppData\\Local\\Microsoft\\WinGet\\Packages\\LiveKit.LiveKitCLI_Microsoft.Winget.Source_8wekyb3d8bbwe\\lk.exe'
const credentials = [1, 2].map(index => ({
  email: env[`PLAYWRIGHT_ACCOUNT_${index}_EMAIL`] || env[`PLAYWRIGHT_ACCOUNT${index}_EMAIL`],
  password: env[`PLAYWRIGHT_ACCOUNT_${index}_PASSWORD`] || env[`PLAYWRIGHT_ACCOUNT${index}_PASSWORD`],
}))

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}
must(supabaseUrl && anonKey, 'Browser-safe Supabase credentials are required.')
must(credentials.every(item => item.email && item.password), 'Two controlled PLAYWRIGHT_ACCOUNT_* accounts are required.')
must(existsSync(liveKitCli), 'The LiveKit CLI is required for provider-side proof.')
const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
must(expectedProjectRef && projectRef === expectedProjectRef, `Refusing unexpected Supabase project ${projectRef}.`)
if (baseUrl) {
  const origin = new URL(baseUrl)
  must(origin.hostname === 'shadowchat-2-0-wave-one.netlify.app'
    || origin.hostname.endsWith('--shadowchat-2-0-wave-one.netlify.app')
    || ['127.0.0.1', 'localhost'].includes(origin.hostname), `Refusing non-trial frontend ${origin.origin}.`)
}

const clients = credentials.map(() => createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}))
const sessions = []
for (let index = 0; index < clients.length; index += 1) {
  const auth = await clients[index].auth.signInWithPassword(credentials[index])
  if (auth.error) throw auth.error
  must(auth.data.session, `Controlled account ${index + 1} did not return a session.`)
  sessions.push(auth.data.session)
}
const controlledConnectionId = crypto.randomUUID()
const connectionSetup = spawnSync('supabase', [
  'db', 'query', '--linked',
  `insert into public.user_connections (
    id, member_low_id, member_high_id, requested_by, status, accepted_at
  ) values (
    '${controlledConnectionId}'::uuid,
    least('${sessions[0].user.id}'::uuid, '${sessions[1].user.id}'::uuid),
    greatest('${sessions[0].user.id}'::uuid, '${sessions[1].user.id}'::uuid),
    '${sessions[0].user.id}'::uuid,
    'accepted',
    now()
  ) on conflict (member_low_id, member_high_id) do nothing;`,
], { cwd: root, encoding: 'utf8' })
must(connectionSetup.status === 0, `Controlled connection setup failed: ${connectionSetup.stderr.trim()}`)

const waitForUrl = async (url, timeout = 20_000) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { redirect: 'manual' })).status < 500) return
    } catch {
      // Preview startup is still in progress.
    }
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error(`Preview did not start at ${url}.`)
}

const startPreview = async () => {
  if (baseUrl) return null
  const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
  must(existsSync(vite), 'The repo-local Vite runtime is required.')
  const child = spawn(process.execPath, [
    vite, 'preview', '--host', '127.0.0.1', '--port', '4191', '--strictPort',
  ], { cwd: root, shell: false, stdio: 'ignore' })
  await waitForUrl(localBaseUrl)
  return child
}

const dismissTransientUi = async page => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    let changed = false
    for (const label of [/^Skip for Now$/iu, /^(Done|Got It|Later|Not now)$/iu, /^(Restart Now|Update Now)$/iu]) {
      const button = page.getByRole('button', { name: label }).first()
      if (await button.isVisible().catch(() => false)) {
        await button.click({ force: true })
        changed = true
        break
      }
    }
    if (!changed) return
    await page.waitForTimeout(150)
  }
}

const openLive = async page => {
  await page.goto(`${localBaseUrl}/?view=games`, { waitUntil: 'domcontentloaded' })
  await dismissTransientUi(page)
  await page.getByRole('button', { name: 'Open Shado Live', exact: true }).click()
  await page.getByRole('heading', { name: 'Shado Live', level: 1 }).waitFor({ timeout: 20_000 })
}

const cleanupRoom = async ({ roomId, roomName, hostId }) => {
  if (!roomId) return
  const leave = await clients[0].functions.invoke('shado-live-session', {
    body: { action: 'leave', room_id: roomId, request_id: crypto.randomUUID() },
  }).catch(() => null)
  await new Promise(resolve => setTimeout(resolve, 1_000))
  if (roomName) {
    spawnSync(liveKitCli, ['room', 'delete', '--project', liveKitProject, '--yes', roomName], {
      encoding: 'utf8',
    })
  }
  must(leave !== null, `Controlled room ${roomId} could not be closed for host ${hostId}.`)
}

const cleanupConnection = () => {
  const cleanup = spawnSync('supabase', [
    'db', 'query', '--linked',
    `delete from public.user_connections where id = '${controlledConnectionId}'::uuid;`,
  ], { cwd: root, encoding: 'utf8' })
  must(cleanup.status === 0, `Controlled connection cleanup failed: ${cleanup.stderr.trim()}`)
}

const preview = await startPreview()
let browser
let roomId = null
let roomName = null
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  })
  const makeContext = async session => {
    const context = await browser.newContext({
      ...devices['Pixel 7'],
      serviceWorkers: 'block',
      permissions: ['microphone'],
    })
    await context.addInitScript(({ storageKey, authSession }) => {
      localStorage.setItem(storageKey, JSON.stringify(authSession))
      localStorage.setItem(
        `shadowchat:phone-install-onboarding:seen:v2:${authSession.user.id}`,
        new Date().toISOString()
      )
    }, { storageKey: `sb-${projectRef}-auth-token`, authSession: session })
    return context
  }

  const hostContext = await makeContext(sessions[0])
  const listenerContext = await makeContext(sessions[1])
  const hostPage = await hostContext.newPage()
  const listenerPage = await listenerContext.newPage()
  const pageErrors = []
  hostPage.on('pageerror', error => pageErrors.push(`host: ${error.message}`))
  listenerPage.on('pageerror', error => pageErrors.push(`listener: ${error.message}`))

  await openLive(hostPage)
  const title = `Provider QA ${Date.now().toString().slice(-6)}`
  await hostPage.getByPlaceholder('The Midnight Room').fill(title)
  await hostPage.getByRole('button', { name: 'Create live room' }).click()
  await hostPage.getByText('You are in the green room').waitFor({ timeout: 25_000 })

  const listed = await clients[0].rpc('list_my_shado_live_rooms', { result_limit: 20 })
  if (listed.error) throw listed.error
  const ownedRoom = (listed.data || []).find(item => item.title === title)
  roomId = ownedRoom?.id || ownedRoom?.room_id || null
  must(roomId, 'The canonical room list did not return the provider QA room.')
  roomName = `shado-live-${roomId}`

  const hostMic = hostPage.getByRole('button', { name: 'Unmute microphone' })
  await hostMic.waitFor({ timeout: 20_000 })
  await hostPage.waitForFunction(
    element => !element.disabled,
    await hostMic.elementHandle(),
    { timeout: 25_000 }
  ).catch(async () => {
    const alert = await hostPage.getByRole('alert').textContent().catch(() => '')
    const status = await hostPage.locator('[aria-label="Room status"]').textContent().catch(() => '')
    throw new Error(`Host microphone remained disabled. Alert: ${alert || 'none'}. Status: ${status || 'unknown'}.`)
  })
  const hostAudio = hostPage.getByRole('button', { name: 'Start listening' })
  if (await hostAudio.isVisible().catch(() => false)) await hostAudio.click()
  await hostMic.click()
  await hostPage.getByRole('button', { name: 'Mute microphone' }).waitFor({ timeout: 20_000 })
  await hostPage.getByRole('button', { name: 'Start live' }).click()
  await hostPage.getByText('Live audio', { exact: true }).waitFor({ timeout: 20_000 })

  await openLive(listenerPage)
  const roomHeading = listenerPage.getByRole('heading', { name: title })
  if (!(await roomHeading.isVisible().catch(() => false))) {
    await listenerPage.getByRole('button', { name: 'Refresh Shado Live rooms' }).click()
  }
  await roomHeading.waitFor({ timeout: 20_000 })
  const roomCard = listenerPage.getByRole('article').filter({ hasText: title })
  await roomCard.getByRole('button', { name: 'Join as listener' }).click()
  await listenerPage.getByTestId('shado-live-real-stage').waitFor({ timeout: 25_000 })
  await listenerPage.getByRole('button', { name: 'Start listening' }).click()
  await listenerPage.getByText('Listening', { exact: true }).waitFor({ timeout: 20_000 })
  await listenerPage.waitForFunction(
    () => document.querySelectorAll('[data-testid="shado-live-audio-renderer"] audio').length > 0,
    null,
    { timeout: 20_000 }
  )

  const participants = spawnSync(liveKitCli, [
    'room', 'participants', 'list', '--project', liveKitProject, roomName,
  ], { encoding: 'utf8' })
  must(participants.status === 0, `LiveKit participant lookup failed: ${participants.stderr.trim()}`)
  must(
    participants.stdout.includes(sessions[0].user.id) && participants.stdout.includes(sessions[1].user.id),
    'LiveKit did not report both controlled participants.'
  )
  const host = spawnSync(liveKitCli, [
    'room', 'participants', 'get', '--project', liveKitProject,
    '--room', roomName, '--identity', sessions[0].user.id,
  ], { encoding: 'utf8' })
  must(host.status === 0, `LiveKit host lookup failed: ${host.stderr.trim()}`)
  must(/MICROPHONE|microphone|audio/iu.test(host.stdout), 'LiveKit did not report a host audio publication.')
  must(pageErrors.length === 0, `Browser page errors: ${JSON.stringify(pageErrors)}`)

  await hostPage.getByRole('tab', { name: 'Safety' }).click()
  await hostPage.getByRole('button', { name: 'End room for everyone' }).click()
  await hostPage.getByRole('dialog', { name: 'This room has ended' }).waitFor({ timeout: 20_000 })
  console.log('Live Shado Live provider proof passed: host mic published and listener audio attached.')
} finally {
  await cleanupRoom({ roomId, roomName, hostId: sessions[0].user.id })
  cleanupConnection()
  if (browser) await browser.close().catch(() => undefined)
  if (preview?.exitCode === null) preview.kill('SIGTERM')
}

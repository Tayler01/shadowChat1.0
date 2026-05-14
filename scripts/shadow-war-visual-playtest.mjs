import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4174
const DEFAULT_TIMEOUT_MS = 25_000
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const taskKillCommand = process.platform === 'win32' ? 'taskkill' : null
const windowsCommandShell = process.env.ComSpec || 'cmd.exe'

const repoRoot = process.cwd()
const args = parseArgs(process.argv.slice(2))
const envValues = await loadDotEnvFiles([
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.testing.local'),
])
const config = buildConfig(args, envValues)
const artifactDir = path.join(repoRoot, config.artifactDir)
const logsDir = path.join(artifactDir, 'logs')
const summaryPath = path.join(artifactDir, 'summary.json')
const runLogPath = path.join(logsDir, 'run.log')

await mkdir(logsDir, { recursive: true })

const summary = {
  startedAt: new Date().toISOString(),
  baseUrl: config.baseUrl,
  artifactDir,
  checks: [],
  screenshots: [],
  status: 'running',
}

let previewServer = null
let browser = null

try {
  logLine(`Artifacts: ${artifactDir}`)
  previewServer = await ensurePreviewServer()

  const accountOne = buildEnvAccount(1)
  const accountTwo = buildEnvAccount(2)
  await cleanupExistingShadowWarSessions(accountOne, accountTwo)

  browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  })

  const contextOne = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  })
  const contextTwo = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  })

  const pageOne = await contextOne.newPage()
  const pageTwo = await contextTwo.newPage()
  attachDiagnostics(pageOne, path.join(logsDir, 'player-one.log'), 'player-one')
  attachDiagnostics(pageTwo, path.join(logsDir, 'player-two.log'), 'player-two')

  await authenticateAccount(pageOne, accountOne)
  await authenticateAccount(pageTwo, accountTwo)
  record('both accounts authenticated')

  await openShadowWar(pageOne)
  await openShadowWar(pageTwo)
  await capture(pageOne, '01-selector-entered-player-one.png')

  await pageOne.getByRole('button', { name: 'Create Duel' }).click()
  await confirmShadowWarPersona(pageOne, 'Start Table')
  await waitForLobbyState(pageOne, ['Waiting for challenger', 'Your war table is open'])
  await capture(pageOne, '02-player-one-waiting-table.png')
  record('player one created duel')

  await pageTwo.reload({ waitUntil: 'domcontentloaded' })
  await openShadowWar(pageTwo)
  await pageTwo.getByRole('button', { name: 'Join Duel' }).first().click()
  await confirmShadowWarPersona(pageTwo, 'Join Duel')
  await waitForMatch(pageOne)
  await waitForMatch(pageTwo)
  await capture(pageOne, '03-player-one-match-start.png')
  await capture(pageTwo, '04-player-two-match-start.png')
  record('player two joined and match rendered')

  const audioReady = await pageOne.evaluate(() => {
    const audio = document.querySelector('audio')
    return Boolean(audio && audio.getAttribute('src')?.includes('chronicles-of-a-hero.mp3'))
  })
  assert(audioReady, 'Shadow War soundtrack audio element was not present')
  record('soundtrack asset mounted')

  for (let round = 1; round <= 12; round += 1) {
    if (await isMatchComplete(pageOne)) break

    await playPlacement(pageOne, 'high')
    await playPlacement(pageTwo, 'low')
    await waitForAutoResolveState(pageOne)
    await waitForAutoResolveState(pageTwo)

    if (await isSuddenWar(pageOne) || await isSuddenWar(pageTwo)) {
      await playSuddenWar(pageOne)
      await playSuddenWar(pageTwo)
      await waitForPostSuddenWarState(pageOne)
      await waitForPostSuddenWarState(pageTwo)
    }

    record('ui round completed', { round })
  }

  assert(await isMatchComplete(pageOne), 'UI playtest did not reach completed match state')
  await capture(pageOne, '05-player-one-match-complete.png')
  await capture(pageTwo, '06-player-two-match-complete.png')
  record('full match completed through UI')

  await contextOne.close()
  await contextTwo.close()

  summary.finishedAt = new Date().toISOString()
  summary.status = 'passed'
  await writeJson(summaryPath, summary)
  console.log(`Shadow War visual playtest passed. Summary: ${summaryPath}`)
} catch (error) {
  summary.finishedAt = new Date().toISOString()
  summary.status = 'failed'
  summary.error = serializeError(error)
  await writeJson(summaryPath, summary)
  console.error(`Shadow War visual playtest failed. Summary: ${summaryPath}`)
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
} finally {
  if (browser) {
    await browser.close().catch(() => {})
  }
  if (previewServer?.cleanup) {
    await previewServer.cleanup()
  }
}

async function authenticateAccount(page, account) {
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' })
  await waitForBootSurface(page)

  if (await page.getByText('Lounge Channel').first().isVisible().catch(() => false)) {
    return
  }

  if (!(await page.getByRole('button', { name: 'Sign In' }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Sign in/i }).click()
  }

  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.getByText('Lounge Channel').first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function cleanupExistingShadowWarSessions(...accounts) {
  const supabaseUrl = getEnvValue(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const supabaseAnonKey = getEnvValue(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'])
  if (!supabaseUrl || !supabaseAnonKey) {
    record('test session cleanup skipped', { reason: 'missing anon Supabase env' })
    return
  }

  const adminClient = await tryCreateAdminClient(supabaseUrl)
  if (!adminClient) {
    record('test session cleanup skipped', { reason: 'service role unavailable' })
    return
  }

  const userIds = []
  for (const account of accounts) {
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    })
    if (error) throw error
    if (data.user?.id) userIds.push(data.user.id)
  }

  if (userIds.length === 0) return

  const { data: sessions, error: fetchError } = await adminClient
    .from('game_sessions')
    .select('id,current_match_id')
    .eq('game_type', 'shadow_war')
    .in('status', ['waiting', 'active'])
    .or(
      userIds
        .flatMap(userId => [`player_one_id.eq.${userId}`, `player_two_id.eq.${userId}`])
        .join(',')
    )

  if (fetchError) throw fetchError

  const sessionIds = (sessions ?? []).map(session => session.id)
  const matchIds = (sessions ?? []).map(session => session.current_match_id).filter(Boolean)
  if (sessionIds.length === 0) {
    record('test session cleanup found no active sessions')
    return
  }

  if (matchIds.length > 0) {
    const { error: matchError } = await adminClient
      .from('shadow_war_matches')
      .update({ status: 'cancelled', current_phase: 'complete', completed_at: new Date().toISOString() })
      .in('id', matchIds)
    if (matchError) throw matchError
  }

  const { error: queueError } = await adminClient
    .from('game_session_queue')
    .update({ status: 'left' })
    .in('session_id', sessionIds)
    .in('status', ['queued', 'invited'])
  if (queueError) throw queueError

  const { error: sessionError } = await adminClient
    .from('game_sessions')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .in('id', sessionIds)
  if (sessionError) throw sessionError

  record('test session cleanup cancelled stale sessions', { count: sessionIds.length })
}

async function tryCreateAdminClient(supabaseUrl) {
  const directServiceRole = getEnvValue(['SUPABASE_SERVICE_ROLE_KEY'])
  if (directServiceRole) {
    return createClient(supabaseUrl, directServiceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

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
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } catch {
    return null
  }
}

async function openShadowWar(page) {
  await navigateByViewParam(page, 'games')
  await page.getByRole('heading', { name: 'Games' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.getByRole('button', { name: 'Open Shadow War' }).click()
  await page.getByText('Choose your table').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForMatch(page) {
  await page.getByTestId('shadow-war-lane').first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.getByTestId('shadow-war-lock').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function confirmShadowWarPersona(page, actionName) {
  const dialog = page.getByRole('dialog').filter({ hasText: 'Shadow War' })
  await dialog.waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await dialog.getByRole('button', { name: actionName }).click()
}

async function continueActiveDuel(page) {
  const currentDuel = page.getByRole('button', { name: 'Continue Current Duel' })
  if (await currentDuel.isVisible().catch(() => false)) {
    await currentDuel.click()
    await waitForMatch(page)
    return
  }

  const continueDuel = page.getByRole('button', { name: 'Continue Duel' }).first()
  if (await continueDuel.isVisible().catch(() => false)) {
    await continueDuel.click()
    await waitForMatch(page)
  }
}

async function waitForLobbyState(page, expectedTexts) {
  await page.waitForFunction(texts => {
    const bodyText = document.body?.innerText || ''
    return texts.some(text => bodyText.includes(text))
  }, expectedTexts, { timeout: DEFAULT_TIMEOUT_MS })
}

async function playPlacement(page, strengthMode = 'first') {
  await waitForPlayerDecision(page)
  if (await isMatchComplete(page)) return
  if (await isSuddenWar(page)) return

  const lock = page.getByTestId('shadow-war-lock')
  if (!(await lock.isVisible().catch(() => false)) || !(await lock.isEnabled().catch(() => false))) {
    const handCards = page.getByTestId('shadow-war-hand').locator('[data-testid="shadow-war-card"]:not([disabled])')
    await handCards.first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    const cards = await collectHandCards(page)
    const orderedCards = cards
      .sort((a, b) => strengthMode === 'low' ? a.rank - b.rank : b.rank - a.rank)
      .slice(0, 3)

    for (const [index, lane] of ['left', 'center', 'right'].entries()) {
      const card = orderedCards[index]
      const cardLocator = card
        ? page.getByTestId('shadow-war-hand').locator(`[data-shadow-war-card-id="${card.id}"]`)
        : page.getByTestId('shadow-war-hand').locator('[data-testid="shadow-war-card"]:not([disabled])').first()
      await cardLocator.click()
      await delay(120)
      await page.locator(`[data-shadow-war-lane="${lane}"]`).click()
      await delay(120)
    }
  }

  await page.waitForFunction(() => {
    const lockButton = document.querySelector('[data-testid="shadow-war-lock"]')
    return Boolean(lockButton && !lockButton.disabled)
  }, null, { timeout: DEFAULT_TIMEOUT_MS })
  await page.getByTestId('shadow-war-lock').click()
}

async function collectHandCards(page) {
  const cards = await page.getByTestId('shadow-war-hand').locator('[data-testid="shadow-war-card"]:not([disabled])').all()
  const results = []
  for (const card of cards) {
    const id = await card.getAttribute('data-shadow-war-card-id')
    const label = await card.getAttribute('aria-label')
    const rank = Number(label?.match(/strength (\d+)/)?.[1] ?? 0)
    if (id && rank > 0) results.push({ id, rank })
  }
  return results
}

async function playSuddenWar(page) {
  await waitForPlayerDecision(page)
  if (await isMatchComplete(page)) return
  await page.getByText('Sudden war').first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  const lock = page.getByTestId('shadow-war-lock')
  if (!(await lock.isEnabled().catch(() => false))) {
    await page.getByTestId('shadow-war-hand').locator('[data-testid="shadow-war-card"]:not([disabled])').first().click()
    await delay(120)
  }
  const enabled = await page.waitForFunction(() => {
    const lockButton = document.querySelector('[data-testid="shadow-war-lock"]')
    return Boolean(lockButton && !lockButton.disabled)
  }, null, { timeout: 5_000 }).then(() => true).catch(() => false)
  if (!enabled) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await openShadowWar(page)
    await continueActiveDuel(page)
    if (await isMatchComplete(page) || !(await isSuddenWar(page))) return
    await page.getByTestId('shadow-war-hand').locator('[data-testid="shadow-war-card"]:not([disabled])').first().click()
    await page.waitForFunction(() => {
      const lockButton = document.querySelector('[data-testid="shadow-war-lock"]')
      return Boolean(lockButton && !lockButton.disabled)
    }, null, { timeout: DEFAULT_TIMEOUT_MS })
  }
  await page.getByTestId('shadow-war-lock').click()
}

async function waitForPlayerDecision(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    if (text.includes('Duel complete') || text.includes('Victory held')) return true
    if (text.includes('Sudden war')) return true
    if (text.includes('Choose your formation')) return true
    const lock = document.querySelector('[data-testid="shadow-war-lock"]')
    return Boolean(lock && !lock.disabled)
  }, null, { timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForAutoResolveState(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    if (text.includes('Duel complete') || text.includes('Victory held')) return true
    if (text.includes('Sudden war')) return true
    if (text.includes('Waiting for opponent') || text.includes('Battle resolving')) return false
    if (document.querySelector('[data-testid="shadow-war-hand"] [data-testid="shadow-war-card"]:not([disabled])')) return true
    const lock = document.querySelector('[data-testid="shadow-war-lock"]')
    return Boolean(lock && !lock.disabled)
  }, null, { timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForPostSuddenWarState(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    if (text.includes('Duel complete') || text.includes('Victory held')) return true
    if (text.includes('Sudden war')) return false
    if (text.includes('Waiting for opponent') || text.includes('Battle resolving')) return false
    if (document.querySelector('[data-testid="shadow-war-hand"] [data-testid="shadow-war-card"]:not([disabled])')) return true
    const lock = document.querySelector('[data-testid="shadow-war-lock"]')
    return Boolean(lock && !lock.disabled)
  }, null, { timeout: DEFAULT_TIMEOUT_MS })
}

async function isSuddenWar(page) {
  return page.getByText('Sudden war').first().isVisible().catch(() => false)
}

async function isMatchComplete(page) {
  if (await page.getByText('Duel complete').first().isVisible().catch(() => false)) return true
  if (await page.getByText('Victory held').first().isVisible().catch(() => false)) return true
  return page.getByRole('button', { name: 'Rematch' }).first().isVisible().catch(() => false)
}

async function capture(page, name) {
  const screenshotPath = path.join(artifactDir, name)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  summary.screenshots.push(screenshotPath)
  return screenshotPath
}

async function waitForBootSurface(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    return (
      text.includes('Welcome Back') ||
      text.includes('Join the Chat') ||
      text.includes('General Chat') ||
      text.includes('Direct Messages') ||
      text.includes('Lounge Channel')
    )
  }, null, { timeout: DEFAULT_TIMEOUT_MS })
}

async function navigateByViewParam(page, view) {
  await page.evaluate(nextView => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', nextView)
    url.searchParams.delete('conversation')
    url.searchParams.delete('message')
    window.history.replaceState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, view)
}

async function ensurePreviewServer() {
  if (config.reuseServer && await waitForUrl(config.baseUrl, 1500)) {
    logLine(`Reusing preview server at ${config.baseUrl}`)
    return { cleanup: async () => {} }
  }

  if (!config.skipBuild) {
    await runLoggedCommand({
      command: npmCommand,
      args: ['run', 'build'],
      logPath: path.join(logsDir, 'build.log'),
    })
  }

  const previewLogPath = path.join(logsDir, 'preview.log')
  const child = spawnCli(npxCommand, [
    'vite',
    'preview',
    '--host',
    config.host,
    '--port',
    String(config.port),
  ], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', chunk => void appendFile(previewLogPath, chunk))
  child.stderr.on('data', chunk => void appendFile(previewLogPath, chunk))

  await waitForUrl(config.baseUrl, 20_000)
  logLine(`Started preview server at ${config.baseUrl}`)

  return {
    cleanup: async () => {
      await stopChildProcess(child)
    },
  }
}

async function runLoggedCommand({ command, args, logPath }) {
  await appendFile(logPath, `> ${command} ${args.join(' ')}\n`)

  await new Promise((resolve, reject) => {
    const child = spawnCli(command, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', chunk => void appendFile(logPath, chunk))
    child.stderr.on('data', chunk => void appendFile(logPath, chunk))
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {
      // keep polling
    }
    await delay(300)
  }
  return false
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) return

  if (process.platform === 'win32' && taskKillCommand && child.pid) {
    await new Promise(resolve => {
      const killer = spawn(taskKillCommand, ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      })
      killer.on('exit', resolve)
      killer.on('error', resolve)
    })
    return
  }

  child.kill('SIGTERM')
}

function attachDiagnostics(page, logPath, label) {
  page.on('console', async message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      await appendFile(logPath, `[console:${label}:${message.type()}] ${message.text()}\n`)
    }
  })

  page.on('pageerror', async error => {
    await appendFile(logPath, `[pageerror:${label}] ${error.message}\n`)
  })

  page.on('requestfailed', async request => {
    await appendFile(logPath, `[requestfailed:${label}] ${request.method()} ${request.url()} ${request.failure()?.errorText || 'unknown'}\n`)
  })
}

function spawnCli(command, args, options) {
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    return spawn(windowsCommandShell, ['/d', '/s', '/c', [command, ...args].map(quoteCmdArg).join(' ')], {
      ...options,
      shell: false,
    })
  }

  return spawn(command, args, options)
}

function quoteCmdArg(value) {
  const text = String(value)
  if (/^[A-Za-z0-9_./:=+-]+$/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function parseArgs(argv) {
  const parsed = {
    headed: process.env.npm_config_headed === 'true',
    slowMo: Number(process.env.npm_config_slow_mo || process.env.npm_config_slowMo || 0) || 0,
    baseUrl: process.env.npm_config_base_url || null,
    reuseServer: process.env.npm_config_reuse_server === 'false' ? false : true,
    skipBuild: process.env.npm_config_skip_build === 'true',
    runName: process.env.npm_config_run_name || null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (current === '--headed') parsed.headed = true
    else if (current === '--headless') parsed.headed = false
    else if (current === '--skip-build') parsed.skipBuild = true
    else if (current === '--no-reuse-server') parsed.reuseServer = false
    else if (current.startsWith('--base-url=')) parsed.baseUrl = current.slice('--base-url='.length)
    else if (current === '--base-url' && argv[index + 1]) parsed.baseUrl = argv[++index]
    else if (current.startsWith('--run-name=')) parsed.runName = current.slice('--run-name='.length)
    else if (current === '--run-name' && argv[index + 1]) parsed.runName = argv[++index]
    else if (current.startsWith('--slow-mo=')) parsed.slowMo = Number(current.slice('--slow-mo='.length)) || 0
    else if (current === '--slow-mo' && argv[index + 1]) parsed.slowMo = Number(argv[++index]) || 0
  }

  return parsed
}

function buildConfig(parsedArgs, values) {
  const baseUrl = parsedArgs.baseUrl || values.PLAYWRIGHT_BASE_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
  const base = new URL(baseUrl)

  return {
    baseUrl: base.toString().replace(/\/$/, ''),
    host: base.hostname,
    port: Number(base.port || DEFAULT_PORT),
    headless: !parsedArgs.headed,
    slowMo: parsedArgs.slowMo,
    reuseServer: parsedArgs.reuseServer,
    skipBuild: parsedArgs.skipBuild,
    artifactDir: path.join('output', 'playwright', slugify(parsedArgs.runName || `shadow-war-visual-${timestampToken()}`)),
    envValues: values,
  }
}

function buildEnvAccount(index) {
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
    const candidate = process.env[name] ?? config.envValues[name]
    if (candidate) return candidate
  }
  return ''
}

function record(name, details = {}) {
  const check = {
    name,
    status: 'passed',
    details,
    at: new Date().toISOString(),
  }
  summary.checks.push(check)
  void appendFile(runLogPath, `${JSON.stringify(check)}\n`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function timestampToken() {
  return new Date().toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14)
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80) || 'run'
}

function logLine(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  void appendFile(runLogPath, `${line}\n`)
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return { message: String(error) }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

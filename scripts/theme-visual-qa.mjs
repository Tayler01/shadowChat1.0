import { chromium, webkit, devices } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4174
const DEFAULT_TIMEOUT_MS = 20_000
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const taskKillCommand = process.platform === 'win32' ? 'taskkill' : null

const themes = [
  'obsidian-gold',
  'aurora-veil',
  'ember-slate',
  'neon-circuit',
  'moonstone-light',
]

const deviceProfiles = [
  {
    id: 'iphone-small-webkit',
    label: 'iPhone small WebKit',
    browserName: 'webkit',
    device: devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
  },
  {
    id: 'android-medium-chromium',
    label: 'Android medium Chromium',
    browserName: 'chromium',
    device: devices['Pixel 7'] ?? devices['Pixel 5'],
    viewport: { width: 412, height: 915 },
  },
]

const args = parseArgs(process.argv.slice(2))
const repoRoot = process.cwd()
const envValues = await loadDotEnvFiles([
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.testing.local'),
])
const config = buildConfig(args, envValues)
const artifactDir = path.join(repoRoot, config.artifactDir)
const logsDir = path.join(artifactDir, 'logs')
const resultPath = path.join(artifactDir, 'summary.json')
const runLogPath = path.join(logsDir, 'run.log')

await mkdir(logsDir, { recursive: true })

const summary = {
  startedAt: new Date().toISOString(),
  baseUrl: config.baseUrl,
  artifactDir,
  themes: config.themes,
  deviceProfiles: config.profiles.map(({ id, label, browserName, viewport }) => ({
    id,
    label,
    browserName,
    viewport,
  })),
  checks: [],
  notTested: [],
  status: 'running',
}

let previewServer = null
const openBrowsers = []

try {
  logLine(`Artifacts: ${artifactDir}`)
  previewServer = await ensurePreviewServer()

  const accountA = buildEnvAccount(1)
  const accountB = buildEnvAccount(2)

  for (const profile of config.profiles) {
    for (const theme of config.themes) {
      await runThemeProfile(profile, theme, accountA, accountB)
    }
  }

  summary.finishedAt = new Date().toISOString()
  summary.status = summary.checks.some(check => check.status === 'failed') ? 'failed' : 'passed'
  await writeJson(resultPath, summary)

  if (summary.status === 'failed') {
    throw new Error(`Theme visual QA found ${summary.checks.filter(check => check.status === 'failed').length} failing checks`)
  }

  console.log('')
  console.log(`Theme visual QA passed. Summary: ${resultPath}`)
} catch (error) {
  summary.finishedAt = new Date().toISOString()
  summary.status = 'failed'
  summary.error = serializeError(error)
  await writeJson(resultPath, summary)
  console.error('')
  console.error(`Theme visual QA failed. Summary: ${resultPath}`)
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
} finally {
  for (const browser of openBrowsers.reverse()) {
    await browser.close().catch(() => {})
  }
  if (previewServer?.cleanup) {
    await previewServer.cleanup()
  }
}

async function runThemeProfile(profile, theme, accountA, accountB) {
  logLine(`Starting ${profile.label} / ${theme}`)
  const browserType = profile.browserName === 'webkit' ? webkit : chromium
  const browser = await browserType.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  })
  openBrowsers.push(browser)

  const storageStatePath = path.join(artifactDir, 'storage', `${profile.id}-${accountA.label}.json`)
  await writeStorageState(browser, accountA, storageStatePath)

  const context = await browser.newContext({
    ...profile.device,
    viewport: profile.viewport,
    storageState: storageStatePath,
    serviceWorkers: 'block',
    ignoreHTTPSErrors: true,
  })
  await context.addInitScript(selectedTheme => {
    Object.defineProperty(navigator, 'standalone', {
      configurable: true,
      get: () => true,
    })
    window.localStorage.setItem('colorScheme', selectedTheme)
  }, theme)
  await installBrowserMocks(context)

  const page = await context.newPage()
  attachDiagnostics(page, path.join(logsDir, `${profile.id}-${theme}.log`), `${profile.id}-${theme}`)

  try {
    await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' })
    await waitForChatView(page)
    await expectTheme(page, theme)
    await auditPage(page, profile, theme, '01-chat', { composer: true })
    await focusAndAuditComposer(page, profile, theme, '02-chat-composer')

    await goToDirectMessages(page)
    await auditPage(page, profile, theme, '03-dm-list', { header: false })
    await openConversationWithUser(page, profile, theme, accountB)

    await goToBoards(page)
    await auditPage(page, profile, theme, '05-boards')
    await page.getByRole('button', { name: 'Open News Chat' }).click()
    await page.locator('textarea:visible').first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await auditPage(page, profile, theme, '06-board-chat', { composer: true })
    await focusAndAuditComposer(page, profile, theme, '07-board-chat-composer')

    await goToSettings(page)
    await auditPage(page, profile, theme, '08-settings', { header: false })
    await openSettingsSection(page, 'Color & Layout')
    await auditPage(page, profile, theme, '09-theme-picker', { header: false })

    logLine(`Passed ${profile.label} / ${theme}`)
  } finally {
    await context.close().catch(() => {})
  }
}

async function auditPage(page, profile, theme, flow, options = {}) {
  await page.waitForLoadState('domcontentloaded')
  await delay(150)

  const screenshotPath = path.join(artifactDir, `${profile.id}-${theme}-${flow}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: false })

  const metrics = await page.evaluate(({ expectComposer, expectHeader, selectedTheme }) => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const doc = document.documentElement
    const body = document.body
    const horizontalOverflow = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0) - doc.clientWidth
    const isVisible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      )
    }
    const rectFor = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
    const composer = Array.from(document.querySelectorAll('textarea')).filter(isVisible).at(-1) ?? null
    const footer = document.querySelector('[data-mobile-chat-footer="true"]')
    const header = Array.from(document.querySelectorAll('header, .glass-panel-strong'))
      .filter(isVisible)
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.top < Math.min(180, viewportHeight / 2) && rect.bottom > 0 && rect.height < 200)
      .sort((a, b) => a.rect.top - b.rect.top)[0]?.element ?? null
    const overflowOffenders = Array.from(document.querySelectorAll('body *'))
      .filter(isVisible)
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className.slice(0, 140) : '',
          text: (element.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }
      })
      .filter(item => item.right > viewportWidth + 2 || item.left < -2)
      .slice(0, 12)
    const css = getComputedStyle(doc)

    return {
      selectedTheme,
      actualTheme: doc.dataset.scheme,
      themeMode: doc.dataset.themeMode,
      viewportWidth,
      viewportHeight,
      horizontalOverflow,
      overflowOffenders,
      composer: rectFor(composer),
      footer: rectFor(footer),
      header: rectFor(header),
      expectComposer,
      expectHeader,
      cssVars: {
        accent: css.getPropertyValue('--theme-accent').trim(),
        accentReadable: css.getPropertyValue('--theme-accent-readable').trim(),
        backdrop: css.getPropertyValue('--theme-backdrop-image').trim(),
        texture: css.getPropertyValue('--theme-texture-image').trim(),
        appHeight: css.getPropertyValue('--shadowchat-app-height').trim(),
        keyboardInset: css.getPropertyValue('--shadowchat-keyboard-inset').trim(),
      },
    }
  }, { expectComposer: Boolean(options.composer), expectHeader: options.header !== false, selectedTheme: theme })

  const failures = []
  if (metrics.actualTheme !== theme) failures.push(`expected theme ${theme}, saw ${metrics.actualTheme}`)
  if (metrics.horizontalOverflow > 2) failures.push(`horizontal overflow ${metrics.horizontalOverflow}px`)
  if (options.header !== false && !metrics.header) failures.push('expected visible header near top of viewport')
  if (metrics.header && (metrics.header.top < -2 || metrics.header.bottom < 28 || metrics.header.right > metrics.viewportWidth + 2)) {
    failures.push(`header outside viewport ${JSON.stringify(metrics.header)}`)
  }
  if (options.composer && !metrics.composer) failures.push('expected visible composer textarea')
  if (metrics.composer && (metrics.composer.left < -1 || metrics.composer.right > metrics.viewportWidth + 1 || metrics.composer.bottom > metrics.viewportHeight + 1)) {
    failures.push(`composer outside viewport ${JSON.stringify(metrics.composer)}`)
  }
  if (metrics.footer && (metrics.footer.top < 0 || metrics.footer.bottom > metrics.viewportHeight + 2)) {
    failures.push(`mobile footer outside viewport ${JSON.stringify(metrics.footer)}`)
  }

  const check = {
    profile: profile.id,
    theme,
    flow,
    status: failures.length > 0 ? 'failed' : 'passed',
    screenshotPath,
    failures,
    metrics,
  }
  summary.checks.push(check)
  await appendFile(runLogPath, `${JSON.stringify(check)}\n`)

  if (failures.length > 0) {
    throw new Error(`${profile.id} ${theme} ${flow}: ${failures.join('; ')}`)
  }
}

async function focusAndAuditComposer(page, profile, theme, flow) {
  const original = profile.viewport
  const composer = page.locator('textarea:visible').last()
  await composer.click()
  await composer.fill(`Theme QA ${theme}`)
  await auditPage(page, profile, theme, `${flow}-focused`, { composer: true })

  const compressedHeight = Math.max(560, original.height - 280)
  await page.setViewportSize({ width: original.width, height: compressedHeight })
  await delay(250)
  await auditPage(page, { ...profile, viewport: { width: original.width, height: compressedHeight } }, theme, `${flow}-compressed`, { composer: true })

  await page.setViewportSize(original)
  await delay(250)
  await composer.fill('')
}

async function authenticateAccount(page, account) {
  await page.goto(config.baseUrl, { waitUntil: 'domcontentloaded' })
  await waitForBootSurface(page)

  if (await isChatVisible(page)) return

  if (!(await page.getByRole('button', { name: 'Sign In' }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Sign in/i }).click()
  }

  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await waitForChatView(page)
}

async function writeStorageState(browser, account, storageStatePath) {
  await mkdir(path.dirname(storageStatePath), { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    serviceWorkers: 'block',
    ignoreHTTPSErrors: true,
  })
  await installBrowserMocks(context)
  const page = await context.newPage()
  attachDiagnostics(page, path.join(logsDir, `${account.label}-storage.log`), `${account.label}-storage`)

  try {
    await authenticateAccount(page, account)
    await context.storageState({ path: storageStatePath })
  } finally {
    await context.close().catch(() => {})
  }
}

async function waitForBootSurface(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    return (
      text.includes('Welcome Back') ||
      text.includes('Join the Chat') ||
      text.includes('General Chat') ||
      text.includes('Direct Messages')
    )
  }, null, { timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForChatView(page) {
  await page.getByText(/Lounge Channel/i).first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.locator('textarea:visible').first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForDmView(page) {
  await page.getByRole('heading', { name: 'Direct Messages' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForSettingsView(page) {
  await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function goToDirectMessages(page) {
  await page.getByRole('button', { name: /Direct Messages|DMs/i }).click()
  await waitForDmView(page)
}

async function goToBoards(page) {
  if (await page.getByRole('button', { name: /^Boards$/ }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^Boards$/ }).click()
  } else {
    await navigateByViewParam(page, 'boards')
  }
  await page.getByRole('heading', { name: 'Boards' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function goToSettings(page) {
  if (await page.getByRole('button', { name: /^Settings$/ }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^Settings$/ }).click()
  } else {
    await navigateByViewParam(page, 'settings')
  }
  await waitForSettingsView(page)
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

async function openSettingsSection(page, sectionName) {
  await page.getByRole('button', { name: sectionName }).click()
  await page.getByRole('button', { name: 'Back to settings' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function openConversationWithUser(page, profile, theme, account) {
  const row = page.getByRole('button', { name: new RegExp(`@${escapeRegExp(account.username)}`, 'i') }).first()
  if (!(await row.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Start new conversation' }).click()
    await page.getByPlaceholder('Search by username').fill(account.username)
    const searchRow = page.getByRole('button', { name: new RegExp(`@${escapeRegExp(account.username)}`, 'i') }).first()
    const found = await searchRow.waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
    if (!found) {
      summary.notTested.push({ profile: profile.id, theme, flow: '04-dm-thread', reason: `Could not find @${account.username} for DM visual QA.` })
      await page.getByRole('button', { name: 'Close new conversation' }).click().catch(() => {})
      return
    }
    await searchRow.click()
  } else {
    await row.click()
  }

  await page.locator('textarea:visible').first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await auditPage(page, profile, theme, '04-dm-thread', { composer: true })
  await focusAndAuditComposer(page, profile, theme, '04-dm-composer')
}

async function expectTheme(page, theme) {
  await page.waitForFunction(expectedTheme => document.documentElement.dataset.scheme === expectedTheme, theme, { timeout: DEFAULT_TIMEOUT_MS })
}

async function isChatVisible(page) {
  return page.getByText(/Lounge Channel/i).first().isVisible().catch(() => false)
}

async function installBrowserMocks(context) {
  await context.addInitScript(() => {
    window.Notification = window.Notification || function Notification() {}
    Object.defineProperty(window.Notification, 'permission', {
      configurable: true,
      get: () => 'granted',
    })
    window.Notification.requestPermission = async () => 'granted'
    window.navigator.permissions = window.navigator.permissions || {}
    window.navigator.permissions.query = async () => ({ state: 'granted', onchange: null })
  })
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
  const child = spawn(npxCommand, [
    'vite',
    'preview',
    '--host',
    config.host,
    '--port',
    String(config.port),
    '--strictPort',
  ], {
    cwd: repoRoot,
    shell: process.platform === 'win32',
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
    const child = spawn(command, args, {
      cwd: repoRoot,
      shell: process.platform === 'win32',
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

function parseArgs(argv) {
  const parsed = {
    headed: false,
    slowMo: 0,
    baseUrl: null,
    reuseServer: true,
    skipBuild: false,
    runName: null,
    themes: null,
    profiles: null,
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
    else if (current.startsWith('--themes=')) parsed.themes = current.slice('--themes='.length)
    else if (current === '--themes' && argv[index + 1]) parsed.themes = argv[++index]
    else if (current.startsWith('--profiles=')) parsed.profiles = current.slice('--profiles='.length)
    else if (current === '--profiles' && argv[index + 1]) parsed.profiles = argv[++index]
    else if (current.startsWith('--slow-mo=')) parsed.slowMo = Number(current.slice('--slow-mo='.length)) || 0
    else if (current === '--slow-mo' && argv[index + 1]) parsed.slowMo = Number(argv[++index]) || 0
  }

  return parsed
}

function buildConfig(parsedArgs, values) {
  const baseUrl = parsedArgs.baseUrl || values.PLAYWRIGHT_BASE_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
  const base = new URL(baseUrl)
  const selectedThemes = selectByIds(themes, parsedArgs.themes)
  const selectedProfiles = selectProfiles(parsedArgs.profiles)

  return {
    baseUrl: base.toString().replace(/\/$/, ''),
    host: base.hostname,
    port: Number(base.port || DEFAULT_PORT),
    headless: !parsedArgs.headed,
    slowMo: parsedArgs.slowMo,
    reuseServer: parsedArgs.reuseServer,
    skipBuild: parsedArgs.skipBuild,
    themes: selectedThemes,
    profiles: selectedProfiles,
    artifactDir: path.join('output', 'playwright', slugify(parsedArgs.runName || `theme-visual-${timestampToken()}`)),
    envValues: values,
  }
}

function selectByIds(available, rawIds) {
  if (!rawIds || rawIds === 'all') return available
  const requested = rawIds.split(',').map(value => value.trim()).filter(Boolean)
  return requested.filter(value => available.includes(value))
}

function selectProfiles(rawIds) {
  if (!rawIds || rawIds === 'all') return deviceProfiles
  const requested = rawIds.split(',').map(value => value.trim()).filter(Boolean)
  return deviceProfiles.filter(profile => requested.includes(profile.id))
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

function getEnvValue(names, fallback = '') {
  for (const name of names) {
    const candidate = process.env[name] ?? config.envValues[name]
    if (candidate) return candidate
  }
  return fallback
}

function buildEnvAccount(index) {
  const prefix = [`PLAYWRIGHT_ACCOUNT_${index}_`, `PLAYWRIGHT_ACCOUNT${index}_`]
  const email = getEnvValue(prefix.map(value => `${value}EMAIL`))
  const password = getEnvValue(prefix.map(value => `${value}PASSWORD`))
  const username = getEnvValue(prefix.map(value => `${value}USERNAME`))

  if (!email || !password || !username) {
    throw new Error(`Missing PLAYWRIGHT_ACCOUNT_${index}_EMAIL/PASSWORD/USERNAME in .env.testing.local or process env`)
  }

  return {
    label: `account-${index}`,
    email,
    password,
    username,
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
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

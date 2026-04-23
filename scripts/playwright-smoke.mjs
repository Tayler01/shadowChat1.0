import { chromium, devices } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4174
const DEFAULT_SCENARIO = 'core'
const DEFAULT_TIMEOUT_MS = 20_000

const scenarioSets = {
  core: ['auth', 'dm', 'mobile-dm-back'],
  full: ['auth', 'group-chat', 'settings', 'dm', 'resume-send', 'profile-visual', 'mobile-dm-back', 'mobile-settings-visual'],
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const taskKillCommand = process.platform === 'win32' ? 'taskkill' : null

const args = parseArgs(process.argv.slice(2))
const repoRoot = process.cwd()
const envFileValues = await loadDotEnv(path.join(repoRoot, '.env'))
const config = buildConfig(args, envFileValues)
const artifactDir = path.join(repoRoot, config.artifactDir)
const logsDir = path.join(artifactDir, 'logs')
const fixturesDir = path.join(artifactDir, 'fixtures')
const runLogPath = path.join(logsDir, 'run.log')
const resultPath = path.join(artifactDir, 'summary.json')

await mkdir(logsDir, { recursive: true })
const fixtures = await createFixtures(fixturesDir)

const runState = {
  config,
  repoRoot,
  artifactDir,
  logsDir,
  fixturesDir,
  fixtures,
  runLogPath,
  summary: {
    startedAt: new Date().toISOString(),
    baseUrl: config.baseUrl,
    accountMode: config.accountMode,
    fixtures,
    scenarios: [],
  },
}

let previewServer = null
let browser = null
let desktopA = null
let desktopB = null
let mobileA = null

try {
  logLine(`Artifacts: ${artifactDir}`)
  logLine(`Scenarios: ${config.scenarios.join(', ')}`)

  previewServer = await ensurePreviewServer(runState)
  browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
  })

  const accounts = buildAccounts(config)
  desktopA = await createDesktopSession(browser, runState, accounts[0], 'account-1')
  desktopB = await createDesktopSession(browser, runState, accounts[1], 'account-2', { persistent: true })

  accounts[0] = desktopA.account
  accounts[1] = desktopB.account

  await writeJson(path.join(artifactDir, 'accounts.json'), {
    accountMode: config.accountMode,
    accounts,
  })

  for (const scenarioName of config.scenarios) {
    await runScenario(runState, scenarioName, async () => {
      if (scenarioName === 'auth') {
        await scenarioAuth(runState, desktopA, desktopB)
        return
      }

      if (scenarioName === 'dm') {
        await scenarioDM(runState, desktopA, desktopB)
        return
      }

      if (scenarioName === 'resume-send') {
        await scenarioResumeSend(runState, desktopA, desktopB)
        return
      }

      if (scenarioName === 'group-chat') {
        await scenarioGroupChat(runState, desktopA, desktopB)
        return
      }

      if (scenarioName === 'settings') {
        await scenarioSettings(runState, desktopA, desktopB)
        return
      }

      if (scenarioName === 'profile-visual') {
        await scenarioProfileVisual(runState, desktopA)
        return
      }

      if (scenarioName === 'mobile-dm-back') {
        mobileA = await refreshMobileSession(browser, runState, desktopA.account, mobileA)
        await scenarioMobileDmBack(runState, desktopA, desktopB, mobileA)
        return
      }

      if (scenarioName === 'mobile-settings-visual') {
        mobileA = await refreshMobileSession(browser, runState, desktopA.account, mobileA)
        await scenarioMobileSettingsVisual(runState, mobileA)
        return
      }

      throw new Error(`Unknown scenario: ${scenarioName}`)
    })
  }

  runState.summary.finishedAt = new Date().toISOString()
  runState.summary.status = 'passed'
  await writeJson(resultPath, runState.summary)

  console.log('')
  console.log(`Smoke run passed. Summary: ${resultPath}`)
} catch (error) {
  runState.summary.finishedAt = new Date().toISOString()
  runState.summary.status = 'failed'
  runState.summary.error = serializeError(error)
  await writeJson(resultPath, runState.summary)
  console.error('')
  console.error(`Smoke run failed. Summary: ${resultPath}`)
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
} finally {
  await closeSession(mobileA)
  await closeSession(desktopB)
  await closeSession(desktopA)
  if (browser) {
    await browser.close().catch(() => {})
  }
  if (previewServer?.cleanup) {
    await previewServer.cleanup()
  }
}

function parseArgs(argv) {
  const parsed = {
    headed: false,
    slowMo: 0,
    scenario: DEFAULT_SCENARIO,
    baseUrl: null,
    reuseServer: true,
    skipBuild: false,
    runName: null,
    accountMode: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--headed') {
      parsed.headed = true
      continue
    }

    if (current === '--headless') {
      parsed.headed = false
      continue
    }

    if (current === '--skip-build') {
      parsed.skipBuild = true
      continue
    }

    if (current === '--no-reuse-server') {
      parsed.reuseServer = false
      continue
    }

    if (current.startsWith('--scenario=')) {
      parsed.scenario = current.slice('--scenario='.length)
      continue
    }

    if (current === '--scenario' && argv[index + 1]) {
      parsed.scenario = argv[index + 1]
      index += 1
      continue
    }

    if (current.startsWith('--base-url=')) {
      parsed.baseUrl = current.slice('--base-url='.length)
      continue
    }

    if (current === '--base-url' && argv[index + 1]) {
      parsed.baseUrl = argv[index + 1]
      index += 1
      continue
    }

    if (current.startsWith('--slow-mo=')) {
      parsed.slowMo = Number(current.slice('--slow-mo='.length)) || 0
      continue
    }

    if (current === '--slow-mo' && argv[index + 1]) {
      parsed.slowMo = Number(argv[index + 1]) || 0
      index += 1
      continue
    }

    if (current.startsWith('--run-name=')) {
      parsed.runName = current.slice('--run-name='.length)
      continue
    }

    if (current === '--run-name' && argv[index + 1]) {
      parsed.runName = argv[index + 1]
      index += 1
      continue
    }

    if (current.startsWith('--account-mode=')) {
      parsed.accountMode = current.slice('--account-mode='.length)
      continue
    }

    if (current === '--account-mode' && argv[index + 1]) {
      parsed.accountMode = argv[index + 1]
      index += 1
      continue
    }
  }

  return parsed
}

function buildConfig(parsedArgs, envValues) {
  const baseUrl = parsedArgs.baseUrl || envValues.PLAYWRIGHT_BASE_URL || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
  const base = new URL(baseUrl)
  const runName = slugify(parsedArgs.runName || `smoke-${timestampToken()}`)
  const scenarios = resolveScenarios(parsedArgs.scenario)
  const accountMode = resolveAccountMode(parsedArgs.accountMode, envValues)

  return {
    baseUrl: base.toString().replace(/\/$/, ''),
    host: base.hostname,
    port: Number(base.port || DEFAULT_PORT),
    headless: !parsedArgs.headed,
    slowMo: parsedArgs.slowMo,
    reuseServer: parsedArgs.reuseServer,
    skipBuild: parsedArgs.skipBuild,
    scenarios,
    accountMode,
    artifactDir: path.join('output', 'playwright', runName),
    envValues,
  }
}

function resolveScenarios(rawScenario) {
  const chunks = rawScenario
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const resolved = []

  for (const chunk of chunks) {
    if (scenarioSets[chunk]) {
      resolved.push(...scenarioSets[chunk])
      continue
    }

    resolved.push(chunk)
  }

  return [...new Set(resolved)]
}

function resolveAccountMode(explicitMode, envValues) {
  if (explicitMode) {
    return explicitMode
  }

  const hasEnvAccounts = Boolean(
    getEnvValue(envValues, ['PLAYWRIGHT_ACCOUNT_1_EMAIL', 'PLAYWRIGHT_ACCOUNT1_EMAIL']) &&
    getEnvValue(envValues, ['PLAYWRIGHT_ACCOUNT_1_PASSWORD', 'PLAYWRIGHT_ACCOUNT1_PASSWORD']) &&
    getEnvValue(envValues, ['PLAYWRIGHT_ACCOUNT_2_EMAIL', 'PLAYWRIGHT_ACCOUNT2_EMAIL']) &&
    getEnvValue(envValues, ['PLAYWRIGHT_ACCOUNT_2_PASSWORD', 'PLAYWRIGHT_ACCOUNT2_PASSWORD'])
  )

  return hasEnvAccounts ? 'env' : 'disposable'
}

async function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return {}
  }

  const raw = await readFile(filePath, 'utf8')
  const values = {}

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const equalsIndex = trimmed.indexOf('=')
    if (equalsIndex <= 0) {
      continue
    }

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

function getEnvValue(envValues, names, fallback = '') {
  for (const name of names) {
    const candidate = process.env[name] ?? envValues[name]
    if (candidate) {
      return candidate
    }
  }

  return fallback
}

function buildAccounts(config) {
  if (config.accountMode === 'env') {
    return [
      buildEnvAccount(config.envValues, 1),
      buildEnvAccount(config.envValues, 2),
    ]
  }

  const seed = timestampToken()

  return [
    {
      label: 'account-1',
      strategy: 'signup',
      email: `shadowchat-smoke-${seed}-a@example.com`,
      password: 'ShadowChat!123456',
      username: `smokea${seed}`.slice(0, 24),
      displayName: 'Smoke User A',
    },
    {
      label: 'account-2',
      strategy: 'signup',
      email: `shadowchat-smoke-${seed}-b@example.com`,
      password: 'ShadowChat!123456',
      username: `smokeb${seed}`.slice(0, 24),
      displayName: 'Smoke User B',
    },
  ]
}

function buildEnvAccount(envValues, index) {
  const prefix = [`PLAYWRIGHT_ACCOUNT_${index}_`, `PLAYWRIGHT_ACCOUNT${index}_`]
  const email = getEnvValue(envValues, prefix.map(value => `${value}EMAIL`))
  const password = getEnvValue(envValues, prefix.map(value => `${value}PASSWORD`))

  if (!email || !password) {
    throw new Error(`Missing Playwright account ${index} credentials in .env or process env`)
  }

  return {
    label: `account-${index}`,
    strategy: 'signin',
    email,
    password,
    username: getEnvValue(envValues, prefix.map(value => `${value}USERNAME`)),
    displayName: getEnvValue(envValues, prefix.map(value => `${value}DISPLAY_NAME`)),
  }
}

async function ensurePreviewServer(state) {
  if (state.config.reuseServer && await waitForUrl(state.config.baseUrl, 1_500)) {
    logLine(`Reusing preview server at ${state.config.baseUrl}`)
    return {
      reused: true,
      cleanup: async () => {},
    }
  }

  if (!state.config.skipBuild) {
    await runLoggedCommand({
      command: npmCommand,
      args: ['run', 'build'],
      cwd: state.repoRoot,
      logPath: path.join(state.logsDir, 'build.log'),
      label: 'vite build',
    })
  }

  const previewLogPath = path.join(state.logsDir, 'preview.log')
  const child = spawn(npxCommand, [
    'vite',
    'preview',
    '--host',
    state.config.host,
    '--port',
    String(state.config.port),
    '--strictPort',
  ], {
    cwd: state.repoRoot,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', chunk => void appendFile(previewLogPath, chunk))
  child.stderr.on('data', chunk => void appendFile(previewLogPath, chunk))

  const ready = await waitForUrl(state.config.baseUrl, DEFAULT_TIMEOUT_MS)
  if (!ready) {
    await stopChildProcess(child)
    throw new Error(`Preview server did not start at ${state.config.baseUrl}`)
  }

  logLine(`Started preview server at ${state.config.baseUrl}`)

  return {
    reused: false,
    cleanup: async () => {
      await stopChildProcess(child)
    },
  }
}

async function createDesktopSession(browserInstance, state, account, folderName, options = {}) {
  let context

  if (options.persistent) {
    const profileDir = path.join(state.artifactDir, 'profiles', folderName)
    await mkdir(profileDir, { recursive: true })
    context = await chromium.launchPersistentContext(profileDir, {
      headless: state.config.headless,
      slowMo: state.config.slowMo,
      viewport: { width: 1440, height: 960 },
      ignoreHTTPSErrors: true,
    })
  } else {
    context = await browserInstance.newContext({
      viewport: { width: 1440, height: 960 },
      ignoreHTTPSErrors: true,
    })
  }

  await installBrowserMocks(context)
  const page = context.pages()[0] || await context.newPage()
  attachDiagnostics(page, path.join(state.logsDir, `${folderName}.log`), folderName)
  const hydratedAccount = await authenticateAccount(page, state, account, folderName)

  return {
    account: hydratedAccount,
    context,
    page,
    folderName,
    persistent: Boolean(options.persistent),
  }
}

async function refreshMobileSession(browserInstance, state, account, existingSession) {
  await closeSession(existingSession)

  const storageStateDir = path.join(state.artifactDir, 'storage')
  const storageStatePath = path.join(storageStateDir, `${account.label}.json`)
  await mkdir(storageStateDir, { recursive: true })
  await writeStorageState(browserInstance, state, account, storageStatePath)

  const context = await browserInstance.newContext({
    ...devices['iPhone 13'],
    storageState: storageStatePath,
    ignoreHTTPSErrors: true,
  })
  await installBrowserMocks(context)
  const page = await context.newPage()
  attachDiagnostics(page, path.join(state.logsDir, 'mobile-account-1.log'), 'mobile-account-1')
  await page.goto(state.config.baseUrl, { waitUntil: 'domcontentloaded' })
  await waitForChatView(page)

  return {
    account,
    context,
    page,
    folderName: 'mobile-account-1',
  }
}

async function writeStorageState(browserInstance, state, account, storageStatePath) {
  const scratchContext = await browserInstance.newContext({
    viewport: { width: 1440, height: 960 },
    ignoreHTTPSErrors: true,
  })
  await installBrowserMocks(scratchContext)
  const scratchPage = await scratchContext.newPage()
  attachDiagnostics(scratchPage, path.join(state.logsDir, `${account.label}-storage.log`), `${account.label}-storage`)

  try {
    await authenticateAccount(scratchPage, state, {
      ...account,
      strategy: 'signin',
    }, `${account.label}-storage`)
    await scratchContext.storageState({ path: storageStatePath })
  } finally {
    await scratchContext.close().catch(() => {})
  }
}

async function authenticateAccount(page, state, account, label) {
  await page.goto(state.config.baseUrl, { waitUntil: 'domcontentloaded' })
  await waitForBootSurface(page)

  if (await isChatVisible(page)) {
    const profile = await readVisibleProfile(page).catch(() => null)
    return {
      ...account,
      ...profile,
      strategy: 'signin',
    }
  }

  if (account.strategy === 'signup') {
    await ensureSignupView(page)
    await fillInput(page, 'Full Name', account.displayName)
    await fillInput(page, 'Username', account.username)
    await fillInput(page, 'Email', account.email)
    await fillInput(page, 'Password', account.password)
    await page.getByRole('button', { name: 'Create Account' }).click()

    const landedInChat = await waitForEither(
      [
        async () => isChatVisible(page),
        async () => page.getByText('Please check your email to confirm your account.').isVisible().catch(() => false),
      ],
      DEFAULT_TIMEOUT_MS
    )

    if (!landedInChat || !(await isChatVisible(page))) {
      throw new Error(`Signup for ${label} completed without an active session. Use PLAYWRIGHT_ACCOUNT_* env vars if email confirmation is required.`)
    }
  } else {
    await ensureSigninView(page)
    await fillInput(page, 'Email', account.email)
    await fillInput(page, 'Password', account.password)
    await page.getByRole('button', { name: 'Sign In' }).click()
    await waitForChatView(page)
  }

  const profile = await readVisibleProfile(page)
  await capture(page, state.artifactDir, `${label}-ready`)

  return {
    ...account,
    ...profile,
    strategy: 'signin',
  }
}

async function scenarioAuth(state, sessionA, sessionB) {
  await waitForChatView(sessionA.page)
  await waitForChatView(sessionB.page)

  await capture(sessionA.page, state.artifactDir, 'auth-account-1-chat')
  await capture(sessionB.page, state.artifactDir, 'auth-account-2-chat')
}

async function scenarioGroupChat(state, sessionA, sessionB) {
  await goToChat(sessionA.page)
  await goToChat(sessionB.page)

  const messageText = `Group smoke ${timestampToken()}`
  const audioCountBeforeB = await sessionB.page.locator('audio').count()
  const fileName = path.basename(state.fixtures.filePath)
  const imageName = path.basename(state.fixtures.imagePath)

  await sendVisibleMessage(sessionA.page, messageText)
  await expectVisibleText(sessionB.page, messageText, DEFAULT_TIMEOUT_MS)

  await reactToMessage(sessionB.page, messageText, '\u{1F44D}')
  await expectReactionOnMessage(sessionA.page, messageText, '\u{1F44D}', 1)
  await expectReactionOnMessage(sessionB.page, messageText, '\u{1F44D}', 1)

  await uploadImageAttachment(sessionA.page, state.fixtures.imagePath)
  await waitForLoadedImage(sessionA.page, imageName)
  await waitForLoadedImage(sessionB.page, imageName)

  await uploadFileAttachment(sessionA.page, state.fixtures.filePath)
  await expectVisibleText(sessionB.page, fileName, DEFAULT_TIMEOUT_MS)

  await recordVoiceMessage(sessionA.page)
  await waitForAudioCount(sessionB.page, audioCountBeforeB + 1)

  await capture(sessionA.page, state.artifactDir, 'group-chat-sender')
  await capture(sessionB.page, state.artifactDir, 'group-chat-recipient')
}

async function scenarioSettings(state, _sessionA, sessionB) {
  await sessionB.context.grantPermissions(['notifications'], { origin: state.config.baseUrl })
  await sessionB.page.reload({ waitUntil: 'domcontentloaded' })
  await waitForChatView(sessionB.page)
  await goToSettings(sessionB.page)

  await assertSwitchGeometry(sessionB.page, 'Toggle Push Notifications', 'Toggle Sound Effects')
  await capture(sessionB.page, state.artifactDir, 'settings-desktop-before-modal')

  await sessionB.page.getByRole('button', { name: 'Notification Setup' }).click()
  await sessionB.page.getByText('Setup Steps').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await capture(sessionB.page, state.artifactDir, 'settings-notification-modal')
  await sessionB.page.getByRole('button', { name: 'Close' }).click()
  await sessionB.page.getByText('Setup Steps').waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT_MS })

  await toggleSwitch(sessionB.page, 'Toggle Reactions')
  await expectSwitchState(sessionB.page, 'Toggle Reactions', true)
  await toggleSwitch(sessionB.page, 'Toggle Reactions')
  await expectSwitchState(sessionB.page, 'Toggle Reactions', false)

  const pushSwitchLabel = 'Toggle Push Notifications'
  if (!(await isSwitchChecked(sessionB.page, pushSwitchLabel))) {
    await toggleSwitch(sessionB.page, pushSwitchLabel)
  }
  const pushEnabled = await waitForEither(
    [
      async () => isSwitchChecked(sessionB.page, pushSwitchLabel),
      async () => sessionB.page.getByText('Enabled on this device').isVisible().catch(() => false),
    ],
    15_000
  )

  if (await sessionB.page.getByRole('button', { name: 'Close' }).isVisible().catch(() => false)) {
    await sessionB.page.getByRole('button', { name: 'Close' }).click()
    await sessionB.page.getByText('Setup Steps').waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT_MS }).catch(() => {})
  }

  if (pushEnabled) {
    await sessionB.page.getByRole('button', { name: 'Refresh Status' }).first().click()
    await expectVisibleText(sessionB.page, 'Enabled on this device', 30_000)
    await expectSwitchState(sessionB.page, pushSwitchLabel, true)
  } else {
    logLine('Push registration did not complete in this browser mode; settings UI and modal flow were still verified.')
  }
  await capture(sessionB.page, state.artifactDir, 'settings-desktop-final')
}

async function scenarioDM(state, sessionA, sessionB) {
  await ensureConversationIsReady(state, sessionA, sessionB)

  const messageText = `Smoke ping ${timestampToken()}`
  const sidebarUnreadBaseline = await readSidebarDmLabel(sessionB.page)

  await goToChat(sessionB.page)
  await goToDirectMessages(sessionA.page)
  await openConversationWithUser(sessionA.page, sessionB.account, state)
  await sendThreadMessage(sessionA.page, messageText)
  await capture(sessionA.page, state.artifactDir, 'dm-sender-thread')

  await waitForSidebarUnreadChange(sessionB.page, sidebarUnreadBaseline)
  await goToDirectMessages(sessionB.page)
  await openConversationWithUser(sessionB.page, sessionA.account, state)
  await expectVisibleText(sessionB.page, messageText, DEFAULT_TIMEOUT_MS)
  await expectVisibleText(sessionB.page, '0 unread', DEFAULT_TIMEOUT_MS)
  await sessionB.page.reload({ waitUntil: 'domcontentloaded' })
  await waitForDmView(sessionB.page)
  await expectVisibleText(sessionB.page, '0 unread', DEFAULT_TIMEOUT_MS)
  await capture(sessionB.page, state.artifactDir, 'dm-recipient-after-reload')
}

async function scenarioResumeSend(state, sessionA, sessionB) {
  await goToChat(sessionA.page)
  await goToChat(sessionB.page)

  await simulateVisibilityResume(sessionA.page)

  const chatMessage = `Resume chat ${timestampToken()}`
  await sendVisibleMessage(sessionA.page, chatMessage)
  await expectVisibleText(sessionB.page, chatMessage, DEFAULT_TIMEOUT_MS)
  await capture(sessionA.page, state.artifactDir, 'resume-chat-sender')
  await capture(sessionB.page, state.artifactDir, 'resume-chat-recipient')

  await ensureConversationIsReady(state, sessionA, sessionB)
  await goToDirectMessages(sessionA.page)
  await openConversationWithUser(sessionA.page, sessionB.account, state)

  await simulateVisibilityResume(sessionA.page)

  const dmMessage = `Resume dm ${timestampToken()}`
  await sendThreadMessage(sessionA.page, dmMessage)

  await goToDirectMessages(sessionB.page)
  await openConversationWithUser(sessionB.page, sessionA.account, state)
  await expectVisibleText(sessionB.page, dmMessage, DEFAULT_TIMEOUT_MS)
  await capture(sessionA.page, state.artifactDir, 'resume-dm-sender')
  await capture(sessionB.page, state.artifactDir, 'resume-dm-recipient')
}

async function scenarioProfileVisual(state, sessionA) {
  await goToProfile(sessionA.page)
  await capture(sessionA.page, state.artifactDir, 'profile-desktop')
}

async function scenarioMobileDmBack(state, sessionA, sessionB, mobileSession) {
  await ensureConversationIsReady(state, sessionA, sessionB)
  await waitForChatView(mobileSession.page)

  await mobileSession.page.getByRole('button', { name: /^DMs$/ }).click()
  await waitForDmView(mobileSession.page)
  await openConversationWithUser(mobileSession.page, sessionB.account, state)
  await mobileSession.page.getByRole('button', { name: 'Back' }).first().click()
  await expectVisibleText(mobileSession.page, 'Direct Messages', DEFAULT_TIMEOUT_MS)
  await mobileSession.page.getByRole('button', { name: 'Back' }).click()
  await waitForChatView(mobileSession.page)
  await capture(mobileSession.page, state.artifactDir, 'mobile-dm-back')
}

async function scenarioMobileSettingsVisual(state, mobileSession) {
  await waitForChatView(mobileSession.page)
  await goToSettings(mobileSession.page)
  await assertSwitchGeometry(mobileSession.page, 'Toggle Push Notifications', 'Toggle Sound Effects')
  await capture(mobileSession.page, state.artifactDir, 'settings-mobile')
}

async function ensureConversationIsReady(state, sessionA, sessionB) {
  await goToDirectMessages(sessionA.page)
  await openConversationWithUser(sessionA.page, sessionB.account, state)
  await goToDirectMessages(sessionB.page)
  await maybeOpenConversationFromList(sessionB.page, sessionA.account)
  await goToChat(sessionB.page)
}

async function goToDirectMessages(page) {
  await page.getByRole('button', { name: /Direct Messages|DMs/i }).click()
  await waitForDmView(page)
}

async function goToChat(page) {
  await page.getByRole('button', { name: /^Chat$/ }).click()
  await waitForChatView(page)
}

async function goToSettings(page) {
  await page.getByRole('button', { name: /^Settings$/ }).click()
  await waitForSettingsView(page)
}

async function goToProfile(page) {
  await page.getByRole('button', { name: /^Profile$/ }).click()
  await waitForProfileView(page)
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
  await page.getByRole('heading', { name: 'General Chat' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.locator('textarea:visible').first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForDmView(page) {
  await page.getByRole('heading', { name: 'Direct Messages' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForSettingsView(page) {
  await page.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.getByRole('button', { name: 'Notification Setup' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForProfileView(page) {
  await page.getByRole('button', { name: /Edit Profile|Cancel/i }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.getByText('Identity').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function isChatVisible(page) {
  return page.getByRole('heading', { name: 'General Chat' }).isVisible().catch(() => false)
}

async function ensureSignupView(page) {
  if (await page.getByLabel('Full Name').isVisible().catch(() => false)) {
    return
  }

  await page.getByRole('button', { name: /Sign up/i }).click()
  await page.getByLabel('Full Name').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function ensureSigninView(page) {
  if (await page.getByRole('button', { name: 'Sign In' }).isVisible().catch(() => false)) {
    return
  }

  await page.getByRole('button', { name: /Sign in/i }).click()
  await page.getByRole('button', { name: 'Sign In' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function fillInput(page, label, value) {
  const fieldNames = {
    'Full Name': 'full_name',
    Username: 'username',
    Email: 'email',
    Password: 'password',
  }

  const fieldName = fieldNames[label]
  const input = fieldName
    ? page.locator(`input[name="${fieldName}"]`).first()
    : page.getByLabel(label)
  await input.click()
  await input.fill(value)
}

async function readVisibleProfile(page) {
  const usernameText = await page.getByText(/^@/).first().innerText()

  return {
    username: usernameText.trim().replace(/^@/u, ''),
  }
}

async function openConversationWithUser(page, account, state) {
  const row = page.getByRole('button', { name: new RegExp(`@${escapeRegExp(account.username)}`, 'i') }).first()
  if (await row.isVisible().catch(() => false)) {
    await row.click()
    await waitForEitherThreadOrList(page, account)
    return
  }

  await page.getByRole('button', { name: 'Start new conversation' }).click()
  await page.getByPlaceholder('Search by username').fill(account.username)
  const searchRow = page.getByRole('button', { name: new RegExp(`@${escapeRegExp(account.username)}`, 'i') }).first()
  await searchRow.waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await searchRow.click()
  await waitForEitherThreadOrList(page, account)
  await capture(page, state.artifactDir, `open-thread-${account.username}`)
}

async function maybeOpenConversationFromList(page, account) {
  const row = page.getByRole('button', { name: new RegExp(`@${escapeRegExp(account.username)}`, 'i') }).first()
  if (await row.isVisible().catch(() => false)) {
    await row.click()
    await waitForEitherThreadOrList(page, account)
  }
}

async function waitForEitherThreadOrList(page, account) {
  await page.waitForFunction(expectedUsername => {
    const text = document.body?.innerText || ''
    return text.includes(`@${expectedUsername}`) || text.includes('Select a conversation')
  }, account.username, { timeout: DEFAULT_TIMEOUT_MS })
}

async function simulateVisibilityResume(page) {
  await page.evaluate(async () => {
    const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden')
    const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')

    let hidden = true

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    })

    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise(resolve => setTimeout(resolve, 250))

    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    await new Promise(resolve => setTimeout(resolve, 1200))

    if (originalHidden) {
      Object.defineProperty(document, 'hidden', originalHidden)
    } else {
      delete document.hidden
    }

    if (originalVisibilityState) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityState)
    } else {
      delete document.visibilityState
    }
  })
}

async function sendThreadMessage(page, messageText) {
  const composer = page.locator('textarea:visible').last()
  await composer.click()
  await composer.fill(messageText)
  await page.locator('button[aria-label="Send message"]:visible').last().click()
}

async function sendVisibleMessage(page, messageText) {
  const composer = page.locator('textarea:visible').last()
  await composer.click()
  await composer.fill(messageText)
  await page.locator('button[aria-label="Send message"]:visible').last().click()
}

async function reactToMessage(page, messageText, emoji) {
  const wrapper = getMessageWrapperByText(page, messageText)
  await wrapper.hover()
  await wrapper.getByRole('button', { name: 'Message actions' }).click()
  if (emoji === '\u{1F44D}') {
    await page.getByRole('button', { name: 'React with thumbs up' }).last().click()
    return
  }
  await page.getByRole('button', { name: `React with ${emoji}` }).last().click()
}

async function expectReactionOnMessage(page, messageText, emoji, count) {
  const wrapper = getMessageWrapperByText(page, messageText)
  await wrapper.getByRole('button', { name: `Reaction ${emoji} count ${count}` }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

function getMessageWrapperByText(page, messageText) {
  const messageNode = page.getByText(messageText, { exact: false }).last()
  return messageNode.locator('xpath=ancestor::div[contains(@class,"group/message")]').first()
}

async function uploadImageAttachment(page, filePath) {
  await page.locator('input[data-upload-kind="image"]').first().setInputFiles(filePath)
  await page.locator('img[alt="uploaded image"]').last().waitFor({ timeout: 30_000 })
}

async function uploadFileAttachment(page, filePath) {
  await page.locator('input[data-upload-kind="file"]').first().setInputFiles(filePath)
  await expectVisibleText(page, path.basename(filePath), 30_000)
}

async function recordVoiceMessage(page) {
  await page.getByRole('button', { name: 'Record audio' }).click()
  await expectVisibleText(page, 'Recording...', DEFAULT_TIMEOUT_MS)
  await page.getByRole('button', { name: 'Stop' }).click()
  await page.locator('audio').last().waitFor({ timeout: 30_000 })
}

async function waitForLoadedImage(page, fileName) {
  await page.waitForFunction(name => {
    return Array.from(document.querySelectorAll('img[alt="uploaded image"]')).some(image => {
      const img = image
      return img.currentSrc.includes(name) && img.naturalWidth > 0
    })
  }, fileName, { timeout: 30_000 })
}

async function waitForAudioCount(page, expectedCount) {
  await page.waitForFunction(count => {
    return document.querySelectorAll('audio').length >= count
  }, expectedCount, { timeout: 30_000 })
}

async function readSidebarDmLabel(page) {
  const label = await page.getByRole('button', { name: /Direct Messages/i }).first().innerText()
  return normalizeWhitespace(label)
}

async function toggleSwitch(page, label) {
  await page.getByRole('switch', { name: label }).click()
}

async function isSwitchChecked(page, label) {
  const value = await page.getByRole('switch', { name: label }).getAttribute('aria-checked')
  return value === 'true'
}

async function expectSwitchState(page, label, expected) {
  await page.waitForFunction(
    ({ switchLabel, expectedState }) => {
      const element = Array.from(document.querySelectorAll('[role="switch"]')).find(node =>
        (node.getAttribute('aria-label') || '') === switchLabel
      )
      return element?.getAttribute('aria-checked') === String(expectedState)
    },
    { switchLabel: label, expectedState: expected },
    { timeout: DEFAULT_TIMEOUT_MS }
  )
}

async function assertSwitchGeometry(page, primaryLabel, referenceLabel) {
  const primary = await page.getByRole('switch', { name: primaryLabel }).boundingBox()
  const reference = await page.getByRole('switch', { name: referenceLabel }).boundingBox()

  if (!primary || !reference) {
    throw new Error('Could not measure settings switches for layout verification')
  }

  const widthDelta = Math.abs(primary.width - reference.width)
  const heightDelta = Math.abs(primary.height - reference.height)

  if (widthDelta > 2 || heightDelta > 2) {
    throw new Error(`Switch geometry mismatch: ${primaryLabel} (${primary.width}x${primary.height}) vs ${referenceLabel} (${reference.width}x${reference.height})`)
  }
}

async function waitForSidebarUnreadChange(page, previousLabel) {
  await page.waitForFunction(expectedPrevious => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const match = buttons.find(button => button.innerText.includes('Direct Messages'))
    if (!match) {
      return false
    }

    const current = match.innerText.replace(/\s+/gu, ' ').trim()
    return current !== expectedPrevious && /\d+/u.test(current)
  }, previousLabel, { timeout: DEFAULT_TIMEOUT_MS })
}

async function expectVisibleText(page, text, timeoutMs) {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout: timeoutMs })
}

async function waitForEither(checks, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    for (const check of checks) {
      if (await check()) {
        return true
      }
    }

    await delay(250)
  }

  return false
}

async function capture(page, baseArtifactDir, label) {
  const filePath = path.join(baseArtifactDir, `${slugify(label)}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
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

async function runScenario(state, name, fn) {
  const startedAt = new Date().toISOString()
  logLine(`Starting scenario: ${name}`)

  try {
    await fn()
    state.summary.scenarios.push({
      name,
      status: 'passed',
      startedAt,
      finishedAt: new Date().toISOString(),
    })
    logLine(`Passed scenario: ${name}`)
  } catch (error) {
    state.summary.scenarios.push({
      name,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      error: serializeError(error),
    })
    throw error
  }
}

async function runLoggedCommand({ command, args, cwd, logPath, label }) {
  await appendFile(logPath, `\n> ${command} ${args.join(' ')}\n`)

  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', chunk => void appendFile(logPath, chunk))
    child.stderr.on('data', chunk => void appendFile(logPath, chunk))

    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${label} failed with exit code ${code}`))
    })
  })
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'GET' })
      if (response.ok) {
        return true
      }
    } catch {
      // Server not ready yet.
    }

    await delay(300)
  }

  return false
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) {
    return
  }

  if (process.platform === 'win32' && taskKillCommand) {
    await new Promise(resolve => {
      const killer = spawn(taskKillCommand, ['/pid', String(child.pid), '/t', '/f'], {
        shell: false,
        stdio: 'ignore',
      })
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
    })
    return
  }

  child.kill('SIGTERM')
  await new Promise(resolve => {
    child.on('exit', () => resolve())
    setTimeout(resolve, 2_000)
  })
}

async function closeSession(session) {
  if (!session?.context) {
    return
  }

  await session.context.close().catch(() => {})
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  return {
    message: String(error),
  }
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

async function createFixtures(targetDir) {
  await mkdir(targetDir, { recursive: true })
  const token = timestampToken()
  const imagePath = path.join(targetDir, `smoke-image-${token}.svg`)
  const filePath = path.join(targetDir, `smoke-note-${token}.txt`)

  await writeFile(
    imagePath,
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100" role="img" aria-label="ShadowChat smoke image">
  <defs>
    <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
      <stop offset="0%" stop-color="#f7d67a" />
      <stop offset="100%" stop-color="#8f6a37" />
    </linearGradient>
  </defs>
  <rect width="160" height="100" rx="18" fill="#111315" />
  <rect x="8" y="8" width="144" height="84" rx="14" fill="url(#bg)" opacity="0.9" />
  <circle cx="44" cy="38" r="14" fill="#1a1f23" opacity="0.85" />
  <path d="M24 76l28-22 18 14 28-30 38 38H24z" fill="#1a1f23" opacity="0.85" />
  <text x="18" y="92" fill="#111315" font-family="Arial, sans-serif" font-size="12" font-weight="700">ShadowChat</text>
</svg>`,
    'utf8'
  )
  await writeFile(
    filePath,
    `ShadowChat smoke attachment ${token}\nThis file verifies generic upload rendering.\n`,
    'utf8'
  )

  return { imagePath, filePath }
}

async function installBrowserMocks(context) {
  await context.addInitScript(() => {
    const fakeTrack = {
      enabled: true,
      kind: 'audio',
      readyState: 'live',
      stop() {},
    }

    const fakeStream = {
      getTracks() {
        return [fakeTrack]
      },
    }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => fakeStream,
      },
    })

    class MockMediaRecorder {
      constructor(stream) {
        this.stream = stream
        this.mimeType = 'audio/wav'
        this.state = 'inactive'
        this.ondataavailable = null
        this.onstop = null
      }

      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        const wavBytes = Uint8Array.from([
          82, 73, 70, 70, 44, 0, 0, 0, 87, 65, 86, 69, 102, 109, 116, 32,
          16, 0, 0, 0, 1, 0, 1, 0, 68, 172, 0, 0, 136, 88, 1, 0,
          2, 0, 16, 0, 100, 97, 116, 97, 8, 0, 0, 0, 0, 0, 0, 0,
          0, 0, 0, 0,
        ])
        const blob = new Blob([wavBytes], { type: this.mimeType })
        const event = { data: blob }
        setTimeout(() => {
          this.ondataavailable?.(event)
          this.onstop?.()
        }, 0)
      }
    }

    window.MediaRecorder = MockMediaRecorder
  })
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, ' ').trim()
}

function logLine(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`
  process.stdout.write(line)
  void appendFile(runLogPath, line)
}

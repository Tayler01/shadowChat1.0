import { createClient } from '@supabase/supabase-js'
import { chromium, devices, webkit } from 'playwright'
import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_BASE_URL = 'http://127.0.0.1:4174'
const DEFAULT_SCENARIO = 'metrics'
const DEFAULT_CYCLES = 10
const DEFAULT_SEED_COUNT = 72
const DEFAULT_TIMEOUT_MS = 20_000
const READ_CURSOR_SURFACE = 'general_chat'
const READ_CURSOR_SCOPE = 'main'
const KNOWN_PRODUCTION_SUPABASE_PROJECT = 'shsqqouecvdoifzufkqm'
const scenarioSets = {
  all: ['metrics', 'read-position', 'deep-link', 'same-timestamp', 'realtime-anchored', 'media'],
}
const seededScenarios = new Set(['read-position', 'deep-link', 'same-timestamp', 'realtime-anchored', 'media'])
const taskKillCommand = process.platform === 'win32' ? 'taskkill' : null
const platformCommand = name => process.platform === 'win32' ? `${name}.cmd` : name
const viteScriptPath = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js')
const hasLocalViteScript = existsSync(viteScriptPath)
const viteCommand = hasLocalViteScript ? process.execPath : platformCommand('vite')
const viteBaseArgs = hasLocalViteScript ? [viteScriptPath] : []

const args = parseArgs(process.argv.slice(2))
const repoRoot = process.cwd()
const envValues = await loadDotEnvFiles([
  path.join(repoRoot, '.env'),
  path.join(repoRoot, '.env.local'),
  path.join(repoRoot, '.env.production'),
  path.join(repoRoot, '.env.testing.local'),
])
const runName = slugify(args.runName || `chat-scroll-${timestampToken()}`)
const artifactDir = path.join(repoRoot, 'output', 'playwright', runName)
const logsDir = path.join(artifactDir, 'logs')
const resultPath = path.join(artifactDir, 'summary.json')
const baseUrl = args.baseUrl || envValues.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL
const cycles = Number(args.cycles || DEFAULT_CYCLES)
const seedCount = Math.max(56, Number(args.seedCount || DEFAULT_SEED_COUNT))
const scenarios = resolveScenarios(args.scenario)
const browserType = args.browserName === 'webkit' ? webkit : chromium
const summary = {
  startedAt: new Date().toISOString(),
  baseUrl,
  browserName: args.browserName,
  viewport: args.desktop ? 'desktop' : 'iPhone 13',
  scenarios: [],
}

await mkdir(logsDir, { recursive: true })

let previewServer = null
let browser = null
let seedContextPromise = null

try {
  previewServer = await ensurePreviewServer(baseUrl, artifactDir)
  browser = await browserType.launch({ headless: !args.headed, slowMo: args.slowMo })

  for (const scenarioName of scenarios) {
    await runScenario(scenarioName, async () => {
      if (scenarioName === 'metrics') {
        return scenarioMetrics(browser)
      }
      if (scenarioName === 'read-position') {
        return scenarioReadPosition(browser, await getSeedContext())
      }
      if (scenarioName === 'deep-link') {
        return scenarioDeepLink(browser, await getSeedContext())
      }
      if (scenarioName === 'same-timestamp') {
        return scenarioSameTimestamp(browser, await getSeedContext())
      }
      if (scenarioName === 'realtime-anchored') {
        return scenarioRealtimeAnchored(browser, await getSeedContext())
      }
      if (scenarioName === 'media') {
        return scenarioMedia(browser, await getSeedContext())
      }
      throw new Error(`Unknown chat scroll scenario: ${scenarioName}`)
    })
  }

  summary.finishedAt = new Date().toISOString()
  summary.status = 'passed'
  await writeJson(resultPath, summary)

  console.log(JSON.stringify({
    resultPath,
    status: summary.status,
    scenarios: summary.scenarios.map(({ name, status }) => ({ name, status })),
  }, null, 2))
} catch (error) {
  summary.finishedAt = new Date().toISOString()
  summary.status = 'failed'
  summary.error = serializeError(error)
  await writeJson(resultPath, summary)
  console.error(error instanceof Error ? error.stack || error.message : String(error))
  process.exitCode = 1
} finally {
  const seedContext = seedContextPromise ? await seedContextPromise.catch(() => null) : null
  if (seedContext) {
    await cleanupSeededData(seedContext).catch(async error => {
      summary.cleanup = {
        status: 'failed',
        error: serializeError(error),
        residualRisk: 'Seeded messages, cursor rows, or storage objects may require manual cleanup.',
      }
      await writeJson(resultPath, summary).catch(() => undefined)
    })
  }

  if (browser) {
    await browser.close().catch(() => undefined)
  }
  await previewServer?.cleanup?.()
  if (args.cleanArtifacts && existsSync(artifactDir)) {
    await rm(artifactDir, { recursive: true, force: true })
  }
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: null,
    browserName: 'chromium',
    scenario: DEFAULT_SCENARIO,
    runName: null,
    headed: false,
    slowMo: 0,
    desktop: false,
    skipBuild: false,
    reuseServer: true,
    cycles: DEFAULT_CYCLES,
    seedCount: DEFAULT_SEED_COUNT,
    cleanArtifacts: false,
    allowProductionSeed: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--headed') parsed.headed = true
    else if (current === '--desktop') parsed.desktop = true
    else if (current.startsWith('--browser=')) parsed.browserName = current.slice('--browser='.length)
    else if (current === '--browser' && argv[index + 1]) parsed.browserName = argv[++index]
    else if (current.startsWith('--scenario=')) parsed.scenario = current.slice('--scenario='.length)
    else if (current === '--scenario' && argv[index + 1]) parsed.scenario = argv[++index]
    else if (current === '--skip-build') parsed.skipBuild = true
    else if (current === '--no-reuse-server') parsed.reuseServer = false
    else if (current === '--clean-artifacts') parsed.cleanArtifacts = true
    else if (current === '--allow-production-seed') parsed.allowProductionSeed = true
    else if (current.startsWith('--base-url=')) parsed.baseUrl = current.slice('--base-url='.length)
    else if (current === '--base-url' && argv[index + 1]) parsed.baseUrl = argv[++index]
    else if (current.startsWith('--run-name=')) parsed.runName = current.slice('--run-name='.length)
    else if (current === '--run-name' && argv[index + 1]) parsed.runName = argv[++index]
    else if (current.startsWith('--cycles=')) parsed.cycles = Number(current.slice('--cycles='.length)) || DEFAULT_CYCLES
    else if (current === '--cycles' && argv[index + 1]) parsed.cycles = Number(argv[++index]) || DEFAULT_CYCLES
    else if (current.startsWith('--seed-count=')) parsed.seedCount = Number(current.slice('--seed-count='.length)) || DEFAULT_SEED_COUNT
    else if (current === '--seed-count' && argv[index + 1]) parsed.seedCount = Number(argv[++index]) || DEFAULT_SEED_COUNT
    else if (current.startsWith('--slow-mo=')) parsed.slowMo = Number(current.slice('--slow-mo='.length)) || 0
    else if (current === '--slow-mo' && argv[index + 1]) parsed.slowMo = Number(argv[++index]) || 0
  }

  return parsed
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

  const unknown = resolved.filter(name => name !== 'metrics' && !seededScenarios.has(name))
  if (unknown.length > 0) {
    throw new Error(`Unknown chat scroll scenario(s): ${unknown.join(', ')}`)
  }

  return [...new Set(resolved)]
}

async function runScenario(name, fn) {
  const startedAt = new Date().toISOString()

  try {
    const result = await fn()
    summary.scenarios.push({
      name,
      status: 'passed',
      startedAt,
      finishedAt: new Date().toISOString(),
      ...result,
    })
  } catch (error) {
    summary.scenarios.push({
      name,
      status: 'failed',
      startedAt,
      finishedAt: new Date().toISOString(),
      error: serializeError(error),
    })
    throw error
  } finally {
    await writeJson(resultPath, summary).catch(() => undefined)
  }
}

async function scenarioMetrics(browserInstance) {
  const session = await createAuthenticatedSession(browserInstance, {
    accountIndex: 1,
    label: 'metrics',
  })

  try {
    const { page } = session
    await page.locator('[data-testid="message-scroll"]').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await page.screenshot({ path: path.join(artifactDir, 'metrics-ready.png'), fullPage: false })
    const beforeSnapshot = await readScrollSnapshot(page)

    const metrics = await page.evaluate(async ({ cycles: scrollCycles }) => {
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))
      const scrollEl = document.querySelector('[data-testid="message-scroll"]')
      if (!scrollEl) {
        throw new Error('Message scroll container not found')
      }

      const longTasks = []
      let observer = null
      if ('PerformanceObserver' in window) {
        try {
          observer = new PerformanceObserver(entries => {
            for (const entry of entries.getEntries()) {
              longTasks.push(Math.round(entry.duration))
            }
          })
          observer.observe({ entryTypes: ['longtask'] })
        } catch {
          observer = null
        }
      }

      const frameDeltas = []
      let lastFrame = 0
      let rafId = requestAnimationFrame(function trackFrame(time) {
        if (lastFrame > 0) {
          frameDeltas.push(time - lastFrame)
        }
        lastFrame = time
        rafId = requestAnimationFrame(trackFrame)
      })

      const collectMetrics = () => ({
        scrollTop: Math.round(scrollEl.scrollTop),
        scrollHeight: Math.round(scrollEl.scrollHeight),
        clientHeight: Math.round(scrollEl.clientHeight),
        loadedCount: Number(scrollEl.getAttribute('data-loaded-count') || 0),
        renderedCount: Number(scrollEl.getAttribute('data-rendered-count') || 0),
        hiddenBeforeCount: Number(scrollEl.getAttribute('data-hidden-before-count') || 0),
        rowCount: document.querySelectorAll('[data-message-row="true"]').length,
        nodeCount: scrollEl.querySelectorAll('*').length,
      })

      scrollEl.scrollTop = scrollEl.scrollHeight
      await delay(350)

      const samples = []
      for (let index = 0; index < scrollCycles; index += 1) {
        const before = collectMetrics()
        scrollEl.scrollBy({ top: -Math.max(260, Math.floor(scrollEl.clientHeight * 0.82)), behavior: 'auto' })
        await delay(520)
        samples.push({
          index,
          before,
          after: collectMetrics(),
        })
      }

      for (let index = 0; index < 3; index += 1) {
        const before = collectMetrics()
        scrollEl.scrollTop = 0
        await delay(700)
        samples.push({
          index: scrollCycles + index,
          forcedTop: true,
          before,
          after: collectMetrics(),
        })
      }

      cancelAnimationFrame(rafId)
      observer?.disconnect?.()

      const maxFrameDelta = frameDeltas.length ? Math.max(...frameDeltas) : 0
      const overBudgetFrames = frameDeltas.filter(delta => delta > 50).length
      const maxLongTask = longTasks.length ? Math.max(...longTasks) : 0

      return {
        userAgent: navigator.userAgent,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        finalMetrics: collectMetrics(),
        samples,
        frameStats: {
          samples: frameDeltas.length,
          maxFrameDelta: Math.round(maxFrameDelta),
          overBudgetFrames,
        },
        longTaskStats: {
          count: longTasks.length,
          maxDuration: maxLongTask,
        },
      }
    }, { cycles })

    await page.screenshot({ path: path.join(artifactDir, 'metrics-after-scroll.png'), fullPage: false })
    const afterSnapshot = await readScrollSnapshot(page)

    return {
      seeded: false,
      beforeSnapshot,
      afterSnapshot,
      metrics,
    }
  } finally {
    await closeSession(session)
  }
}

async function scenarioReadPosition(browserInstance, seed) {
  const seededMessages = await seedMessages(seed, {
    label: 'read-position',
    count: seedCount,
    userId: seed.accounts[1].userId,
    baseOffsetMs: 60_000,
  })
  const cursorMessage = seededMessages[14]
  const latestMessage = seededMessages[seededMessages.length - 1]
  await setReadCursorDirect(seed, seed.accounts[0].userId, cursorMessage)

  const session = await createAuthenticatedSession(browserInstance, {
    accountIndex: 1,
    label: 'read-position',
  })

  try {
    const { page } = session
    await waitForScrollReady(page)
    const initialSnapshot = await readScrollSnapshot(page)
    const initialFirstUnreadId = await waitForFirstUnreadTargetId(page)
    await waitForVisibleMessage(page, initialFirstUnreadId, 'first unread target')

    const visibleSnapshot = await readScrollSnapshot(page)
    assertEqual(visibleSnapshot.qa.targetId, initialFirstUnreadId, 'message scroll targetId should be the first unread message')
    if (!['targetingFirstUnread', 'anchoredCatchup', 'layoutSettling'].includes(visibleSnapshot.qa.windowMode)) {
      throw new Error(
        `message scroll windowMode should show first-unread targeting or anchored catchup while positioned at first unread. `
        + `Received ${visibleSnapshot.qa.windowMode}. Snapshot: ${JSON.stringify(visibleSnapshot)}`
      )
    }

    const cursorBeforeLatest = await fetchReadCursor(seed, seed.accounts[0].userId)
    assertEqual(cursorBeforeLatest?.last_read_message_id, cursorMessage.id, 'read cursor advanced before latest was visible')
    await page.waitForTimeout(900)
    const stableCursor = await fetchReadCursor(seed, seed.accounts[0].userId)
    assertEqual(stableCursor?.last_read_message_id, cursorMessage.id, 'read cursor changed while anchored at first unread')

    await page.getByRole('button', { name: 'Jump to latest' }).click()
    await waitForScrollBottom(page)
    await waitForCursor(seed, seed.accounts[0].userId, latestMessage.id)

    return {
      seeded: true,
      seed: summarizeSeed(seededMessages),
      cursorBeforeLatest,
      stableCursor,
      initialSnapshot,
      visibleSnapshot,
      latestSnapshot: await readScrollSnapshot(page),
    }
  } finally {
    await closeSession(session)
  }
}

async function scenarioDeepLink(browserInstance, seed) {
  const seededMessages = await seedMessages(seed, {
    label: 'deep-link',
    count: seedCount,
    userId: seed.accounts[1].userId,
    baseOffsetMs: 180_000,
  })
  const targetMessage = seededMessages[10]

  const validSession = await createAuthenticatedSession(browserInstance, {
    accountIndex: 1,
    label: 'deep-link-valid',
    targetUrl: buildChatMessageUrl(targetMessage.id),
  })

  let validSnapshot
  try {
    const { page } = validSession
    await waitForScrollReady(page)
    await waitForVisibleMessage(page, targetMessage.id, 'deep-link target')
    await page.waitForFunction(() => {
      const scrollEl = document.querySelector('[data-testid="message-scroll"]')
      const status = scrollEl?.getAttribute('data-deep-link-status')
      return status === 'loaded' || status === 'settled'
    }, null, { timeout: DEFAULT_TIMEOUT_MS }).catch(() => undefined)
    validSnapshot = await readScrollSnapshot(page)
    assertEqual(validSnapshot.qa.targetId, targetMessage.id, 'message scroll targetId should be the deep-link target')
    assertIncluded(validSnapshot.qa.deepLinkStatus, ['loaded', 'settled'], 'deep-link status should be loaded for an existing target')
  } finally {
    await closeSession(validSession)
  }

  const deletedMessage = (await seedMessages(seed, {
    label: 'deep-link-deleted',
    count: 1,
    userId: seed.accounts[1].userId,
    baseOffsetMs: 300_000,
  }))[0]
  await deleteMessagesById(seed, [deletedMessage.id])

  const missingSession = await createAuthenticatedSession(browserInstance, {
    accountIndex: 1,
    label: 'deep-link-missing',
    targetUrl: buildChatMessageUrl(deletedMessage.id),
  })

  try {
    const { page } = missingSession
    await waitForScrollReady(page)
    await page.waitForFunction(() => {
      const scrollEl = document.querySelector('[data-testid="message-scroll"]')
      const status = scrollEl?.getAttribute('data-deep-link-status')
      return status === 'unavailable' || status === 'targetUnavailable'
    }, null, { timeout: DEFAULT_TIMEOUT_MS })
    const missingSnapshot = await readScrollSnapshot(page)
    assertEqual(missingSnapshot.qa.targetId, deletedMessage.id, 'message scroll targetId should retain the missing deep-link id')
    assertIncluded(missingSnapshot.qa.deepLinkStatus, ['unavailable', 'targetUnavailable'], 'deleted deep-link target should enter unavailable state')

    return {
      seeded: true,
      validTargetId: targetMessage.id,
      deletedTargetId: deletedMessage.id,
      validSnapshot,
      missingSnapshot,
    }
  } finally {
    await closeSession(missingSession)
  }
}

async function scenarioSameTimestamp(browserInstance, seed) {
  const seededMessages = await seedMessages(seed, {
    label: 'same-timestamp',
    count: seedCount,
    userId: seed.accounts[1].userId,
    baseOffsetMs: 420_000,
    sameTimestamp: true,
  })
  const newestSeededMessage = [...seededMessages].sort(compareSeedMessagesByStableKey).at(-1)
  if (newestSeededMessage) {
    await setReadCursorDirect(seed, seed.accounts[0].userId, newestSeededMessage)
  }

  const session = await createAuthenticatedSession(browserInstance, {
    accountIndex: 1,
    label: 'same-timestamp',
  })

  try {
    const { page } = session
    await waitForScrollReady(page)
    const seededIds = new Set(seededMessages.map(message => message.id))
    const observedSeedIds = new Set()
    const snapshots = []
    const collectSnapshot = async () => {
      const nextSnapshot = await readScrollSnapshot(page)
      snapshots.push(nextSnapshot)
      nextSnapshot.rowIds.forEach(id => {
        if (seededIds.has(id)) {
          observedSeedIds.add(id)
        }
      })
      return nextSnapshot
    }

    await collectSnapshot()
    for (let index = 0; index < 8 && observedSeedIds.size < seededIds.size; index += 1) {
      await page.evaluate(() => {
        const scrollEl = document.querySelector('[data-testid="message-scroll"]')
        if (scrollEl) {
          scrollEl.scrollTop = 0
          scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }))
        }
      })
      await page.waitForTimeout(2100)
      await collectSnapshot()
    }
    for (let index = 0; index < 12 && observedSeedIds.size < seededIds.size; index += 1) {
      await page.evaluate(() => {
        const scrollEl = document.querySelector('[data-testid="message-scroll"]')
        if (scrollEl) {
          scrollEl.scrollTop = scrollEl.scrollHeight
          scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }))
        }
      })
      await page.waitForTimeout(520)
      await collectSnapshot()
    }

    const snapshot = snapshots[snapshots.length - 1]
    const renderedSeedIds = Array.from(observedSeedIds)
    const duplicateIds = renderedSeedIds.filter((id, index) => renderedSeedIds.indexOf(id) !== index)
    const missingIds = seededMessages.map(message => message.id).filter(id => !observedSeedIds.has(id))

    assertCondition(duplicateIds.length === 0, `same-timestamp rendered duplicate rows: ${duplicateIds.join(', ')}. Snapshot: ${JSON.stringify(snapshot)}`)
    assertCondition(
      missingIds.length === 0,
      `same-timestamp pagination skipped ${missingIds.length} seeded rows. `
      + `Rendered ${renderedSeedIds.length}/${seededMessages.length}. `
      + `Missing: ${missingIds.join(', ')}. Snapshot: ${JSON.stringify(snapshot)}`
    )

    return {
      seeded: true,
      seed: summarizeSeed(seededMessages),
      renderedSeedCount: renderedSeedIds.length,
      duplicateIds,
      missingIds,
      snapshots,
      snapshot,
    }
  } finally {
    await closeSession(session)
  }
}

async function scenarioRealtimeAnchored(browserInstance, seed) {
  const seededMessages = await seedMessages(seed, {
    label: 'realtime-anchored',
    count: seedCount,
    userId: seed.accounts[1].userId,
    baseOffsetMs: 540_000,
  })
  const newestSeededMessage = [...seededMessages].sort(compareSeedMessagesByStableKey).at(-1)
  if (newestSeededMessage) {
    await setReadCursorDirect(seed, seed.accounts[0].userId, newestSeededMessage)
  }

  const session = await createAuthenticatedSession(browserInstance, {
    accountIndex: 1,
    label: 'realtime-anchored',
  })

  try {
    const { page } = session
    await waitForScrollReady(page)
    await moveToAnchoredPosition(page)
    const beforeSnapshot = await readScrollSnapshot(page)
    const anchorId = beforeSnapshot.qa.lastObservedVisibleId || beforeSnapshot.visibleRowIds[0]
    assertCondition(Boolean(anchorId), 'Could not identify a visible anchor before realtime insert')
    assertIncluded(beforeSnapshot.qa.windowMode, ['userScrolledUp', 'anchoredCatchup'], 'message scroll should be anchored before realtime insert')

    const realtimeMessage = (await seedMessages(seed, {
      label: 'realtime-incoming',
      count: 1,
      userId: seed.accounts[1].userId,
      baseOffsetMs: 660_000,
    }))[0]

    await page.waitForFunction(messageId => {
      return Array.from(document.querySelectorAll('[data-message-row="true"]'))
        .some(row => row.dataset.messageId === messageId)
    }, realtimeMessage.id, { timeout: DEFAULT_TIMEOUT_MS }).catch(async error => {
      const timeoutSnapshot = await readScrollSnapshot(page).catch(() => null)
      throw new Error(
        `realtime incoming message ${realtimeMessage.id} did not render while anchored. `
        + `Before: ${JSON.stringify(beforeSnapshot)}. `
        + `After timeout: ${JSON.stringify(timeoutSnapshot)}. Cause: ${error.message}`
      )
    })
    await page.waitForTimeout(800)
    const afterSnapshot = await readScrollSnapshot(page)
    const scrollDelta = Math.abs(afterSnapshot.scrollTop - beforeSnapshot.scrollTop)

    assertCondition(scrollDelta <= 80, `anchored realtime insert moved scrollTop by ${scrollDelta}px`)
    assertCondition(
      afterSnapshot.qa.lastObservedVisibleId === anchorId || afterSnapshot.visibleRowIds.includes(anchorId),
      `visible anchor changed after realtime insert: before ${anchorId}, after ${afterSnapshot.qa.lastObservedVisibleId}`
    )
    assertIncluded(afterSnapshot.qa.windowMode, ['userScrolledUp', 'anchoredCatchup', 'newerAppend'], 'message scroll should remain anchored after realtime insert')

    return {
      seeded: true,
      seed: summarizeSeed(seededMessages),
      realtimeMessageId: realtimeMessage.id,
      anchorId,
      scrollDelta,
      beforeSnapshot,
      afterSnapshot,
    }
  } finally {
    await closeSession(session)
  }
}

async function scenarioMedia(browserInstance, seed) {
  const mediaIndex = seedCount - 8
  const seededMessages = await seedMessages(seed, {
    label: 'media',
    count: seedCount,
    userId: seed.accounts[1].userId,
    baseOffsetMs: 780_000,
    mediaIndex,
  })
  const mediaMessage = seededMessages[mediaIndex]

  const session = await createAuthenticatedSession(browserInstance, {
    accountIndex: 1,
    label: 'media',
    targetUrl: buildChatMessageUrl(mediaMessage.id),
  })

  try {
    const { page } = session
    await waitForScrollReady(page)
    await waitForVisibleMessage(page, mediaMessage.id, 'media message')
    await page.waitForFunction(messageId => {
      const row = Array.from(document.querySelectorAll('[data-message-row="true"]'))
        .find(element => element.dataset.messageId === messageId)
      const image = row?.querySelector('img[alt="uploaded image"]')
      return image && image.naturalWidth > 0
    }, mediaMessage.id, { timeout: DEFAULT_TIMEOUT_MS })
    const snapshot = await readScrollSnapshot(page)

    return {
      seeded: true,
      mediaMessageId: mediaMessage.id,
      storageArtifacts: [],
      residualRisk: 'Media scenario uses an inline data URL image, so no Storage object cleanup is expected.',
      snapshot,
    }
  } finally {
    await closeSession(session)
  }
}

async function getSeedContext() {
  if (!seedContextPromise) {
    seedContextPromise = createSeedContext()
  }
  return seedContextPromise
}

async function createSeedContext() {
  const supabaseUrl = getEnvValue(envValues, [
    'PLAYWRIGHT_SUPABASE_URL',
    'SUPABASE_URL',
    'VITE_SUPABASE_URL',
  ])
  const serviceRoleKey = resolveServiceRoleKey(supabaseUrl, envValues, [
    'PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
  ])
  const account1 = getPlaywrightAccount(envValues, 1)
  const account2 = getPlaywrightAccount(envValues, 2)
  const missing = []

  if (!supabaseUrl) missing.push('PLAYWRIGHT_SUPABASE_URL or SUPABASE_URL/VITE_SUPABASE_URL')
  if (!serviceRoleKey) missing.push('PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY or Supabase CLI service_role access')
  if (!account1.email || !account1.password) missing.push('PLAYWRIGHT_ACCOUNT_1_EMAIL/PASSWORD')
  if (!account2.email || !account2.password) missing.push('PLAYWRIGHT_ACCOUNT_2_EMAIL/PASSWORD')

  if (missing.length > 0) {
    throw new Error(`Seeded chat-scroll scenarios require ${missing.join(', ')}. Run --scenario=metrics for non-seeded scroll timing.`)
  }

  const productionReasons = getProductionSeedBlockReasons(baseUrl, supabaseUrl, envValues)
  if (productionReasons.length > 0 && !args.allowProductionSeed) {
    throw new Error(
      `Refusing to seed production-like data (${productionReasons.join('; ')}). ` +
      'Use preview/staging credentials, or pass --allow-production-seed only after explicit approval.'
    )
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const accounts = [
    await resolveSeedAccount(client, account1),
    await resolveSeedAccount(client, account2),
  ]

  return {
    client,
    accounts,
    insertedMessageIds: new Set(),
    cursorRestoreRows: new Map(),
    storageArtifacts: [],
    seedToken: `qa-chat-scroll-${runName}-${randomUUID().slice(0, 8)}`,
  }
}

function getProductionSeedBlockReasons(targetBaseUrl, supabaseUrl, values) {
  const reasons = []
  const targetHost = new URL(targetBaseUrl).hostname.toLowerCase()
  const supabaseHost = new URL(supabaseUrl).hostname.toLowerCase()
  const seedEnvironment = getEnvValue(values, [
    'PLAYWRIGHT_SEED_ENVIRONMENT',
    'PLAYWRIGHT_QA_SEED_ENVIRONMENT',
    'QA_SEED_ENVIRONMENT',
  ]).toLowerCase()

  if (targetHost === 'shadowchat-1-0.netlify.app') {
    reasons.push(`base URL host is ${targetHost}`)
  }
  if (supabaseHost.startsWith(`${KNOWN_PRODUCTION_SUPABASE_PROJECT}.`)) {
    reasons.push(`Supabase project is ${KNOWN_PRODUCTION_SUPABASE_PROJECT}`)
  }
  if (seedEnvironment === 'production' || seedEnvironment === 'prod') {
    reasons.push(`seed environment is ${seedEnvironment}`)
  }

  return reasons
}

async function resolveSeedAccount(client, account) {
  const directProfile = await client
    .from('users')
    .select('id, email, username, display_name')
    .eq('email', account.email)
    .maybeSingle()

  if (directProfile.data?.id) {
    return {
      ...account,
      userId: directProfile.data.id,
      username: directProfile.data.username,
      displayName: directProfile.data.display_name,
    }
  }

  let authUser = null
  for (let page = 1; page <= 20 && !authUser; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw error
    authUser = data.users.find(user => user.email?.toLowerCase() === account.email.toLowerCase()) ?? null
    if ((data.users?.length ?? 0) < 100) break
  }

  if (!authUser?.id) {
    throw new Error(`Could not resolve test account profile for ${account.label}`)
  }

  const { data: profile, error } = await client
    .from('users')
    .select('id, username, display_name')
    .eq('id', authUser.id)
    .maybeSingle()

  if (error) throw error
  if (!profile?.id) {
    throw new Error(`Test account ${account.label} is missing a public.users profile`)
  }

  return {
    ...account,
    userId: profile.id,
    username: profile.username,
    displayName: profile.display_name,
  }
}

async function seedMessages(seed, {
  label,
  count,
  userId,
  baseOffsetMs,
  sameTimestamp = false,
  mediaIndex = -1,
}) {
  const baseTime = Date.now() + baseOffsetMs
  const rows = Array.from({ length: count }, (_, index) => {
    const createdAt = new Date(baseTime + (sameTimestamp ? 0 : index * 1000)).toISOString()
    const isMedia = index === mediaIndex
    const indexToken = String(index).padStart(3, '0')
    const content = `${seed.seedToken} ${label} ${indexToken}`
    return {
      user_id: userId,
      content,
      message_type: isMedia ? 'image' : 'text',
      file_url: isMedia ? inlineSvgDataUrl(label, indexToken) : null,
      reactions: {},
      pinned: false,
      created_at: createdAt,
      updated_at: createdAt,
    }
  })

  const { data, error } = await seed.client
    .from('messages')
    .insert(rows)
    .select('id, content, created_at, message_type, file_url')

  if (error) throw error
  const recordsByContent = new Map((data ?? []).map(row => [row.content, row]))
  const records = rows.map(row => {
    const record = recordsByContent.get(row.content)
    if (!record) {
      throw new Error(`Seed insert did not return message for ${row.content}`)
    }
    return record
  })

  records.forEach(message => seed.insertedMessageIds.add(message.id))
  return records
}

async function cleanupSeededData(seed) {
  const cleanup = {
    startedAt: new Date().toISOString(),
    deletedMessages: 0,
    restoredCursors: 0,
    removedStorageObjects: 0,
    storageArtifacts: seed.storageArtifacts,
  }

  const messageIds = Array.from(seed.insertedMessageIds)
  if (messageIds.length > 0) {
    cleanup.deletedMessages = await deleteMessagesById(seed, messageIds)
  }

  for (const [userId, previousCursor] of seed.cursorRestoreRows.entries()) {
    if (previousCursor) {
      const { error } = await seed.client
        .from('user_read_cursors')
        .upsert(previousCursor, { onConflict: 'user_id,surface,scope_id' })
      if (error) throw error
    } else {
      const { error } = await seed.client
        .from('user_read_cursors')
        .delete()
        .eq('user_id', userId)
        .eq('surface', READ_CURSOR_SURFACE)
        .eq('scope_id', READ_CURSOR_SCOPE)
      if (error) throw error
    }
    cleanup.restoredCursors += 1
  }

  cleanup.finishedAt = new Date().toISOString()
  cleanup.status = 'passed'
  summary.cleanup = cleanup
  await writeJson(resultPath, summary).catch(() => undefined)
}

async function deleteMessagesById(seed, messageIds) {
  let deleted = 0
  for (const chunk of chunkArray([...new Set(messageIds)], 100)) {
    const { error } = await seed.client
      .from('messages')
      .delete()
      .in('id', chunk)
    if (error) throw error
    deleted += chunk.length
  }
  return deleted
}

async function setReadCursorDirect(seed, userId, message) {
  await rememberCursorForRestore(seed, userId)
  const { error } = await seed.client
    .from('user_read_cursors')
    .upsert({
      user_id: userId,
      surface: READ_CURSOR_SURFACE,
      scope_id: READ_CURSOR_SCOPE,
      last_read_message_id: message.id,
      last_read_at: message.created_at,
    }, { onConflict: 'user_id,surface,scope_id' })

  if (error) throw error
}

async function rememberCursorForRestore(seed, userId) {
  if (seed.cursorRestoreRows.has(userId)) return
  const previousCursor = await fetchReadCursor(seed, userId, 'created_at, user_id, surface, scope_id, last_read_message_id, last_read_at, updated_at')
  seed.cursorRestoreRows.set(userId, previousCursor)
}

async function fetchReadCursor(seed, userId, columns = 'user_id, surface, scope_id, last_read_message_id, last_read_at, updated_at') {
  const { data, error } = await seed.client
    .from('user_read_cursors')
    .select(columns)
    .eq('user_id', userId)
    .eq('surface', READ_CURSOR_SURFACE)
    .eq('scope_id', READ_CURSOR_SCOPE)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

async function waitForCursor(seed, userId, expectedMessageId, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let lastCursor = null
  await waitUntil(async () => {
    lastCursor = await fetchReadCursor(seed, userId)
    return lastCursor?.last_read_message_id === expectedMessageId
  }, timeoutMs, `read cursor did not advance to ${expectedMessageId}`)
  return lastCursor
}

async function createAuthenticatedSession(browserInstance, {
  accountIndex,
  label,
  targetUrl = baseUrl,
}) {
  const context = await browserInstance.newContext({
    ...(args.desktop ? { viewport: { width: 1440, height: 960 } } : devices['iPhone 13']),
    serviceWorkers: 'block',
    ignoreHTTPSErrors: true,
  })
  const page = await context.newPage()
  attachDiagnostics(page, path.join(logsDir, `${slugify(label)}.log`), label)
  await authenticate(page, targetUrl, envValues, accountIndex)
  await waitForScrollReady(page)
  return { context, page }
}

async function authenticate(page, targetUrl, values, accountIndex) {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await waitForBootSurface(page)

  if (await isChatVisible(page)) {
    await dismissAppReleaseDialog(page)
    return
  }

  const account = getPlaywrightAccount(values, accountIndex)
  if (!account.email || !account.password) {
    throw new Error(`Missing PLAYWRIGHT_ACCOUNT_${accountIndex}_EMAIL/PASSWORD for chat scroll probe`)
  }

  if (!(await page.locator('form').getByRole('button', { name: /^Sign in$/i }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Sign in/i }).click()
  }

  await page.locator('input[name="email"]').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  await page.locator('form').getByRole('button', { name: /^Sign in$/i }).click()
  await waitForChatView(page)
  await dismissAppReleaseDialog(page)
}

function getPlaywrightAccount(values, index) {
  const prefixes = [`PLAYWRIGHT_ACCOUNT_${index}_`, `PLAYWRIGHT_ACCOUNT${index}_`]
  return {
    label: `account-${index}`,
    email: getEnvValue(values, prefixes.map(prefix => `${prefix}EMAIL`)),
    password: getEnvValue(values, prefixes.map(prefix => `${prefix}PASSWORD`)),
  }
}

async function waitForBootSurface(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    return (
      text.includes('Welcome Back') ||
      text.includes('Join the Chat') ||
      text.includes('Sign in') ||
      text.includes('Create account') ||
      text.includes('Access your Shado account') ||
      text.includes('Invite code required') ||
      text.includes('General Chat') ||
      text.includes('Direct Messages') ||
      text.includes('Lounge')
    )
  }, null, { timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForChatView(page) {
  await page.getByText(/Lounge/i).first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.locator('textarea:visible').first().waitFor({ timeout: DEFAULT_TIMEOUT_MS })
}

async function waitForScrollReady(page) {
  const scroll = page.locator('[data-testid="message-scroll"]')
  await scroll.waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.waitForFunction(() => {
    const scrollEl = document.querySelector('[data-testid="message-scroll"]')
    return Number(scrollEl?.getAttribute('data-loaded-count') || 0) > 0
  }, null, { timeout: DEFAULT_TIMEOUT_MS }).catch(() => undefined)
}

async function dismissAppReleaseDialog(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const dialog = page.getByRole('dialog').filter({
      has: page.getByText(/update|what's new|restart/i),
    }).first()

    if (!(await dialog.isVisible().catch(() => false))) {
      break
    }

    const closeButton = dialog.getByRole('button', { name: /^(Done|Got It|Later)$/ }).first()
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click()
      await dialog.waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT_MS }).catch(() => undefined)
      break
    }

    const restartButton = dialog.getByRole('button', { name: /^(Restart Now|Update Now)$/ }).first()
    if (await restartButton.isVisible().catch(() => false)) {
      await restartButton.click()
      await page.waitForLoadState('domcontentloaded', { timeout: DEFAULT_TIMEOUT_MS }).catch(() => undefined)
      await page.waitForTimeout(1500)
      continue
    }

    break
  }

  const phoneSetupDialog = page.getByRole('dialog').filter({
    has: page.getByText(/phone setup|add shadow chat/i),
  }).first()

  if (await phoneSetupDialog.isVisible().catch(() => false)) {
    const closePhoneSetup = phoneSetupDialog.getByRole('button', { name: /^(Skip for Now|Close phone setup|I Finished Setup)$/ }).first()
    if (await closePhoneSetup.isVisible().catch(() => false)) {
      await closePhoneSetup.click()
      await phoneSetupDialog.waitFor({ state: 'hidden', timeout: DEFAULT_TIMEOUT_MS }).catch(() => undefined)
    }
  }
}

async function isChatVisible(page) {
  return page.getByText(/Lounge/i).first().isVisible().catch(() => false)
}

async function waitForVisibleMessage(page, messageId, label) {
  await page.waitForFunction(id => {
    const scrollEl = document.querySelector('[data-testid="message-scroll"]')
    if (!scrollEl) return false
    const row = Array.from(document.querySelectorAll('[data-message-row="true"]'))
      .find(element => element.dataset.messageId === id)
    if (!row) return false
    const containerRect = scrollEl.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    return rowRect.bottom > containerRect.top + 8 && rowRect.top < containerRect.bottom - 8
  }, messageId, { timeout: DEFAULT_TIMEOUT_MS }).catch(async error => {
    const snapshot = await readScrollSnapshot(page).catch(() => null)
    throw new Error(`${label} ${messageId} was not visible. Snapshot: ${JSON.stringify(snapshot)}. Cause: ${error.message}`)
  })
}

async function waitForFirstUnreadTargetId(page) {
  await page.waitForFunction(() => {
    const scrollEl = document.querySelector('[data-testid="message-scroll"]')
    return Boolean(scrollEl?.dataset.firstUnreadId)
  }, null, { timeout: DEFAULT_TIMEOUT_MS }).catch(async error => {
    const snapshot = await readScrollSnapshot(page).catch(() => null)
    throw new Error(`first unread target id was not published. Snapshot: ${JSON.stringify(snapshot)}. Cause: ${error.message}`)
  })

  const snapshot = await readScrollSnapshot(page)
  if (!snapshot.qa.firstUnreadId) {
    throw new Error(`first unread target id was empty. Snapshot: ${JSON.stringify(snapshot)}`)
  }
  return snapshot.qa.firstUnreadId
}

async function waitForScrollBottom(page) {
  await page.waitForFunction(() => {
    const scrollEl = document.querySelector('[data-testid="message-scroll"]')
    if (!scrollEl) return false
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight <= 36
  }, null, { timeout: DEFAULT_TIMEOUT_MS })
}

async function forceLoadOlder(page, attempts) {
  for (let index = 0; index < attempts; index += 1) {
    await page.evaluate(() => {
      const scrollEl = document.querySelector('[data-testid="message-scroll"]')
      if (scrollEl) {
        scrollEl.scrollTop = 0
        scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }))
      }
    })
    await page.waitForTimeout(2100)
  }
}

async function moveToAnchoredPosition(page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.evaluate(() => {
      const scrollEl = document.querySelector('[data-testid="message-scroll"]')
      if (!scrollEl) return
      const targetTop = Math.max(0, scrollEl.scrollHeight - scrollEl.clientHeight - 900)
      scrollEl.scrollTop = targetTop
      scrollEl.dispatchEvent(new Event('scroll', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    const snapshot = await readScrollSnapshot(page)
    if (['userScrolledUp', 'anchoredCatchup'].includes(snapshot.qa.windowMode)) {
      return snapshot
    }
  }

  throw new Error('Could not move General Chat into anchored scroll mode')
}

async function readScrollSnapshot(page) {
  return page.evaluate(() => {
    const scrollEl = document.querySelector('[data-testid="message-scroll"]')
    if (!scrollEl) {
      return null
    }

    const containerRect = scrollEl.getBoundingClientRect()
    const rows = Array.from(document.querySelectorAll('[data-message-row="true"]')).map(row => {
      const rect = row.getBoundingClientRect()
      return {
        id: row.dataset.messageId || '',
        top: Math.round(rect.top - containerRect.top),
        bottom: Math.round(rect.bottom - containerRect.top),
        visible: rect.bottom > containerRect.top + 1 && rect.top < containerRect.bottom - 1,
      }
    })
    const dataset = scrollEl.dataset

    return {
      capturedAt: new Date().toISOString(),
      scrollTop: Math.round(scrollEl.scrollTop),
      scrollHeight: Math.round(scrollEl.scrollHeight),
      clientHeight: Math.round(scrollEl.clientHeight),
      loadedCount: Number(dataset.loadedCount || 0),
      renderedCount: Number(dataset.renderedCount || 0),
      hiddenBeforeCount: Number(dataset.hiddenBeforeCount || 0),
      hiddenAfterCount: Number(dataset.hiddenAfterCount || 0),
      rowCount: rows.length,
      rowIds: rows.map(row => row.id).filter(Boolean),
      visibleRowIds: rows.filter(row => row.visible).map(row => row.id).filter(Boolean),
      qa: {
        windowMode: dataset.windowMode || '',
        targetId: dataset.targetId || '',
        firstUnreadId: dataset.firstUnreadId || '',
        scrollTargetId: dataset.scrollTargetId || '',
        readCursorId: dataset.readCursorId || '',
        hasOlder: dataset.hasOlder || '',
        hasNewer: dataset.hasNewer || '',
        lastObservedVisibleId: dataset.lastObservedVisibleId || '',
        lastFlushedReadId: dataset.lastFlushedReadId || '',
        deepLinkStatus: dataset.deepLinkStatus || '',
      },
    }
  })
}

function buildChatMessageUrl(messageId) {
  const url = new URL(baseUrl)
  url.searchParams.set('view', 'chat')
  url.searchParams.set('message', messageId)
  return url.toString()
}

async function ensurePreviewServer(targetUrl, artifactDirPath) {
  if (args.reuseServer && await waitForUrl(targetUrl, 1_500)) {
    return { cleanup: async () => undefined }
  }

  if (!args.skipBuild) {
    await runCommand(viteCommand, [...viteBaseArgs, 'build'], artifactDirPath, 'build.log')
  }

  const url = new URL(targetUrl)
  const child = spawn(viteCommand, [
    ...viteBaseArgs,
    'preview',
    '--host',
    url.hostname,
    '--port',
    url.port || '4174',
    '--strictPort',
  ], {
    cwd: repoRoot,
    shell: process.platform === 'win32' && /\.cmd$/i.test(viteCommand),
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', chunk => void writeProcessChunk(artifactDirPath, 'preview.log', chunk))
  child.stderr.on('data', chunk => void writeProcessChunk(artifactDirPath, 'preview.log', chunk))

  if (!await waitForUrl(targetUrl, DEFAULT_TIMEOUT_MS)) {
    await stopChildProcess(child)
    throw new Error(`Preview server did not start at ${targetUrl}`)
  }

  return {
    cleanup: async () => stopChildProcess(child),
  }
}

async function runCommand(command, commandArgs, artifactDirPath, logName) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      shell: process.platform === 'win32' && /\.cmd$/i.test(command),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', chunk => void writeProcessChunk(artifactDirPath, logName, chunk))
    child.stderr.on('data', chunk => void writeProcessChunk(artifactDirPath, logName, chunk))
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${commandArgs.join(' ')} failed with exit code ${code}`))
    })
  })
}

async function writeProcessChunk(artifactDirPath, logName, chunk) {
  const logPath = path.join(artifactDirPath, logName)
  await writeFile(logPath, chunk, { flag: 'a' })
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {
      // Server is not ready yet.
    }

    await delay(300)
  }

  return false
}

async function stopChildProcess(child) {
  if (!child || child.exitCode !== null) return

  if (process.platform === 'win32' && taskKillCommand) {
    await new Promise(resolve => {
      const killer = spawn(taskKillCommand, ['/pid', String(child.pid), '/t', '/f'], {
        shell: false,
        stdio: 'ignore',
      })
      killer.on('exit', resolve)
      killer.on('error', resolve)
    })
    return
  }

  child.kill('SIGTERM')
  await new Promise(resolve => {
    child.on('exit', resolve)
    setTimeout(resolve, 2_000)
  })
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

function getEnvValue(values, names) {
  for (const name of names) {
    const value = process.env[name] || values[name]
    if (value) return value
  }
  return ''
}

function resolveServiceRoleKey(supabaseUrl, values, names) {
  const configured = getEnvValue(values, names)
  if (configured) return configured

  const ref = supabaseUrl?.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1]
  if (!ref) return ''

  try {
    const raw = execFileSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const parsed = JSON.parse(raw)
    const keys = Array.isArray(parsed) ? parsed : parsed?.api_keys || []
    const serviceRole = keys.find(key => key.name === 'service_role' || key.type === 'service_role')
    return serviceRole?.api_key || ''
  } catch {
    return ''
  }
}

function attachDiagnostics(page, logPath, label) {
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') {
      void appendFile(logPath, `[console:${label}:${message.type()}] ${message.text()}\n`)
    }
  })

  page.on('pageerror', error => {
    void appendFile(logPath, `[pageerror:${label}] ${error.message}\n`)
  })

  page.on('requestfailed', request => {
    void appendFile(logPath, `[requestfailed:${label}] ${request.method()} ${request.url()} ${request.failure()?.errorText || 'unknown'}\n`)
  })
}

async function closeSession(session) {
  await session?.context?.close?.().catch(() => undefined)
}

async function waitUntil(check, timeoutMs, errorMessage) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(250)
  }
  throw new Error(errorMessage)
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, received ${actual}`)
  }
}

function assertIncluded(actual, expectedValues, message) {
  if (!expectedValues.includes(actual)) {
    throw new Error(`${message}. Expected one of ${expectedValues.join(', ')}, received ${actual}`)
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function summarizeSeed(messages) {
  return {
    count: messages.length,
    firstId: messages[0]?.id,
    lastId: messages[messages.length - 1]?.id,
    firstCreatedAt: messages[0]?.created_at,
    lastCreatedAt: messages[messages.length - 1]?.created_at,
  }
}

function inlineSvgDataUrl(label, indexToken) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160"><rect width="240" height="160" rx="18" fill="#111315"/><rect x="14" y="14" width="212" height="132" rx="14" fill="#d7aa46" opacity="0.88"/><path d="M34 126l42-36 32 23 44-52 54 65H34z" fill="#1c2024" opacity="0.86"/><text x="24" y="42" fill="#1c2024" font-family="Arial, sans-serif" font-size="18" font-weight="700">${label} ${indexToken}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function chunkArray(items, size) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

async function writeJson(filePath, value) {
  await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function compareSeedMessagesByStableKey(left, right) {
  const leftCreatedAt = left.created_at || ''
  const rightCreatedAt = right.created_at || ''
  const leftTime = Date.parse(leftCreatedAt)
  const rightTime = Date.parse(rightCreatedAt)
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime
  }

  const timeCompare = leftCreatedAt.localeCompare(rightCreatedAt)
  if (timeCompare !== 0) return timeCompare
  return (left.id || '').localeCompare(right.id || '')
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

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

function timestampToken() {
  return new Date().toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14)
}

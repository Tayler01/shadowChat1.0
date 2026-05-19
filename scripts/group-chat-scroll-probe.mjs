import { chromium, devices, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const DEFAULT_BASE_URL = 'http://127.0.0.1:4174'
const DEFAULT_CYCLES = 10
const DEFAULT_TIMEOUT_MS = 20_000
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
  path.join(repoRoot, '.env.testing.local'),
])
const runName = slugify(args.runName || `chat-scroll-${timestampToken()}`)
const artifactDir = path.join(repoRoot, 'output', 'playwright', runName)
const resultPath = path.join(artifactDir, 'summary.json')
const baseUrl = args.baseUrl || envValues.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL
const cycles = Number(args.cycles || DEFAULT_CYCLES)
const browserType = args.browserName === 'webkit' ? webkit : chromium

await mkdir(artifactDir, { recursive: true })

let previewServer = null
let browser = null
let context = null

try {
  previewServer = await ensurePreviewServer(baseUrl, artifactDir)
  browser = await browserType.launch({ headless: !args.headed, slowMo: args.slowMo })
  context = await browser.newContext({
    ...(args.desktop ? { viewport: { width: 1440, height: 960 } } : devices['iPhone 13']),
    serviceWorkers: 'block',
    ignoreHTTPSErrors: true,
  })

  const page = await context.newPage()
  await authenticate(page, baseUrl, envValues)
  await page.locator('[data-testid="message-scroll"]').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.screenshot({ path: path.join(artifactDir, 'ready.png'), fullPage: false })

  const summary = await page.evaluate(async ({ cycles: scrollCycles }) => {
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

    const metrics = () => ({
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
      const before = metrics()
      scrollEl.scrollBy({ top: -Math.max(260, Math.floor(scrollEl.clientHeight * 0.82)), behavior: 'auto' })
      await delay(520)
      samples.push({
        index,
        before,
        after: metrics(),
      })
    }

    for (let index = 0; index < 3; index += 1) {
      const before = metrics()
      scrollEl.scrollTop = 0
      await delay(700)
      samples.push({
        index: scrollCycles + index,
        forcedTop: true,
        before,
        after: metrics(),
      })
    }

    cancelAnimationFrame(rafId)
    observer?.disconnect?.()

    const maxFrameDelta = frameDeltas.length ? Math.max(...frameDeltas) : 0
    const overBudgetFrames = frameDeltas.filter(delta => delta > 50).length
    const maxLongTask = longTasks.length ? Math.max(...longTasks) : 0

    return {
      startedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      browserName: navigator.userAgent.includes('AppleWebKit') && !navigator.userAgent.includes('Chrome')
        ? 'webkit'
        : 'chromium',
      finalMetrics: metrics(),
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

  await page.screenshot({ path: path.join(artifactDir, 'after-scroll.png'), fullPage: false })
  await writeFile(resultPath, JSON.stringify(summary, null, 2), 'utf8')

  console.log(JSON.stringify({
    resultPath,
    finalMetrics: summary.finalMetrics,
    frameStats: summary.frameStats,
    longTaskStats: summary.longTaskStats,
  }, null, 2))
} catch (error) {
  const failure = {
    error: error instanceof Error ? error.stack || error.message : String(error),
  }
  await writeFile(resultPath, JSON.stringify(failure, null, 2), 'utf8')
  console.error(failure.error)
  process.exitCode = 1
} finally {
  await context?.close().catch(() => undefined)
  await browser?.close().catch(() => undefined)
  await previewServer?.cleanup?.()
  if (args.cleanArtifacts && existsSync(artifactDir)) {
    await rm(artifactDir, { recursive: true, force: true })
  }
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: null,
    browserName: 'chromium',
    runName: null,
    headed: false,
    slowMo: 0,
    desktop: false,
    skipBuild: false,
    reuseServer: true,
    cycles: DEFAULT_CYCLES,
    cleanArtifacts: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--headed') parsed.headed = true
    else if (current === '--desktop') parsed.desktop = true
    else if (current.startsWith('--browser=')) parsed.browserName = current.slice('--browser='.length)
    else if (current === '--browser' && argv[index + 1]) parsed.browserName = argv[++index]
    else if (current === '--skip-build') parsed.skipBuild = true
    else if (current === '--no-reuse-server') parsed.reuseServer = false
    else if (current === '--clean-artifacts') parsed.cleanArtifacts = true
    else if (current.startsWith('--base-url=')) parsed.baseUrl = current.slice('--base-url='.length)
    else if (current === '--base-url' && argv[index + 1]) parsed.baseUrl = argv[++index]
    else if (current.startsWith('--run-name=')) parsed.runName = current.slice('--run-name='.length)
    else if (current === '--run-name' && argv[index + 1]) parsed.runName = argv[++index]
    else if (current.startsWith('--cycles=')) parsed.cycles = Number(current.slice('--cycles='.length)) || DEFAULT_CYCLES
    else if (current === '--cycles' && argv[index + 1]) parsed.cycles = Number(argv[++index]) || DEFAULT_CYCLES
    else if (current.startsWith('--slow-mo=')) parsed.slowMo = Number(current.slice('--slow-mo='.length)) || 0
    else if (current === '--slow-mo' && argv[index + 1]) parsed.slowMo = Number(argv[++index]) || 0
  }

  return parsed
}

async function authenticate(page, targetUrl, values) {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await waitForBootSurface(page)

  if (await isChatVisible(page)) return

  const email = getEnvValue(values, ['PLAYWRIGHT_ACCOUNT_1_EMAIL', 'PLAYWRIGHT_ACCOUNT1_EMAIL'])
  const password = getEnvValue(values, ['PLAYWRIGHT_ACCOUNT_1_PASSWORD', 'PLAYWRIGHT_ACCOUNT1_PASSWORD'])
  if (!email || !password) {
    throw new Error('Missing PLAYWRIGHT_ACCOUNT_1_EMAIL/PASSWORD for chat scroll probe')
  }

  if (!(await page.getByRole('button', { name: 'Sign In' }).isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Sign in/i }).click()
  }

  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await waitForChatView(page)
}

async function waitForBootSurface(page) {
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    return (
      text.includes('Welcome Back') ||
      text.includes('Join the Chat') ||
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

async function isChatVisible(page) {
  return page.getByText(/Lounge/i).first().isVisible().catch(() => false)
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

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
}

function timestampToken() {
  return new Date().toISOString().replace(/[-:.TZ]/gu, '').slice(0, 14)
}

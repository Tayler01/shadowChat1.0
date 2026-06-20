import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import sharp from 'sharp'

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4174
const DEFAULT_TIMEOUT_MS = 30_000
const SHADOW_RUNNER_PROGRESS_KEY = 'shadow-runner-campaign-progress-v1'
const SHADOW_RUNNER_MUSIC_KEY = 'shadow-runner-music-enabled-v1'
const SHADOW_RUNNER_SFX_KEY = 'shadow-runner-sfx-enabled-v1'

const LEVELS = {
  tutorial: {
    title: 'Tutorial Run',
    completedLevels: [],
    titleButton: /Start Tutorial/i,
  },
  'level-1': {
    title: 'East Gate Run',
    completedLevels: ['tutorial'],
  },
  'level-2': {
    title: 'Lantern Market Roofs',
    completedLevels: ['tutorial', 'level-1'],
  },
  'level-3': {
    title: 'Ivy Viaduct',
    completedLevels: ['tutorial', 'level-1', 'level-2'],
  },
  'level-4': {
    title: 'Bell Tower Archives',
    completedLevels: ['tutorial', 'level-1', 'level-2', 'level-3'],
  },
  'level-5': {
    title: 'Candle Fair Ruins',
    completedLevels: ['tutorial', 'level-1', 'level-2', 'level-3', 'level-4'],
  },
}

const PHONE_PROFILES = {
  landscape: {
    label: 'landscape',
    viewport: { width: 740, height: 390 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  android: {
    label: 'android',
    viewport: { width: 932, height: 430 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  },
}

const repoRoot = process.cwd()
const taskKillCommand = process.platform === 'win32' ? 'taskkill' : null
const windowsCommandShell = process.env.ComSpec || 'cmd.exe'
const platformCommand = name => process.platform === 'win32' ? `${name}.cmd` : name
const viteScriptPath = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const hasLocalViteScript = existsSync(viteScriptPath)
const viteCommand = hasLocalViteScript ? process.execPath : platformCommand('vite')
const viteBaseArgs = hasLocalViteScript ? [viteScriptPath] : []

const args = parseArgs(process.argv.slice(2))
const config = buildConfig(args)
const artifactDir = path.join(repoRoot, config.artifactDir)
const logsDir = path.join(artifactDir, 'logs')
const runLogPath = path.join(logsDir, 'run.log')
const summaryPath = path.join(artifactDir, 'summary.json')

await mkdir(logsDir, { recursive: true })

const summary = {
  startedAt: new Date().toISOString(),
  baseUrl: config.baseUrl,
  level: config.levelId,
  profiles: config.profiles.map(profile => profile.label),
  checks: [],
  screenshots: [],
  status: 'running',
}

let previewServer = null
let browser = null

try {
  logLine(`Artifacts: ${artifactDir}`)
  logLine(`Level: ${config.levelId}`)
  logLine(`Profiles: ${config.profiles.map(profile => profile.label).join(', ')}`)

  previewServer = await ensurePreviewServer()
  browser = await chromium.launch({
    headless: config.headless,
    slowMo: config.slowMo,
    args: ['--disable-dev-shm-usage'],
  })

  for (const profile of config.profiles) {
    await runLandscapeProfile(browser, profile)
  }

  summary.finishedAt = new Date().toISOString()
  summary.status = 'passed'
  await writeJson(summaryPath, summary)
  console.log(`Shadow Runner phone smoke passed. Summary: ${summaryPath}`)
} catch (error) {
  summary.finishedAt = new Date().toISOString()
  summary.status = 'failed'
  summary.error = serializeError(error)
  await writeJson(summaryPath, summary)
  console.error(`Shadow Runner phone smoke failed. Summary: ${summaryPath}`)
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

async function runLandscapeProfile(browserInstance, profile) {
  const level = LEVELS[config.levelId]
  const context = await browserInstance.newContext({
    viewport: profile.viewport,
    userAgent: profile.userAgent,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    serviceWorkers: 'block',
  })

  const page = await context.newPage()
  attachDiagnostics(page, path.join(logsDir, `${profile.label}.log`), profile.label)

  try {
    await page.addInitScript(({ progressKey, progress, musicKey, sfxKey }) => {
      window.localStorage.setItem(progressKey, JSON.stringify(progress))
      window.localStorage.setItem(musicKey, 'false')
      window.localStorage.setItem(sfxKey, 'false')
    }, {
      progressKey: SHADOW_RUNNER_PROGRESS_KEY,
      progress: { completedLevels: level.completedLevels },
      musicKey: SHADOW_RUNNER_MUSIC_KEY,
      sfxKey: SHADOW_RUNNER_SFX_KEY,
    })

    await page.goto(`${config.baseUrl}/?view=games&localPreview=shadow-runner`, {
      waitUntil: 'domcontentloaded',
    })
    await page.locator('.shadow-runner-landscape-stage').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await assertLandscapeReady(page, profile)
    await capture(page, `${profile.label}-01-title.png`)

    if (config.levelId === 'tutorial') {
      await page.getByRole('button', { name: LEVELS.tutorial.titleButton }).click()
    } else {
      await page.getByRole('button', { name: /Select Level/i }).click()
      await page.getByText('Level Map').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
      await capture(page, `${profile.label}-02-map.png`)
      await page.getByRole('button', { name: new RegExp(`${escapeRegExp(level.title)} details`, 'i') }).click()
      await page.getByText(level.title).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
      await capture(page, `${profile.label}-03-level-details.png`)
      await page.getByRole('button', { name: /^(Start|Replay)$/i }).click()
    }

    await page.getByText(level.title).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await page.locator('.shadow-runner-game-stage canvas').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await page.waitForFunction(() => !document.body.innerText.includes('Loading Level'), null, {
      timeout: DEFAULT_TIMEOUT_MS,
    })
    await delay(650)

    const gameplayPath = await capture(page, `${profile.label}-04-gameplay.png`)
    await assertCanvasVisible(page, profile)
    await assertHudAndControls(page, profile)
    await assertImageNonBlank(gameplayPath, `${profile.label} gameplay screenshot`)

    record(`${profile.label} ${config.levelId} phone smoke`, {
      viewport: profile.viewport,
      screenshot: gameplayPath,
    })
  } finally {
    await context.close().catch(() => {})
  }
}

async function assertLandscapeReady(page, profile) {
  const state = await page.evaluate(() => {
    const gate = document.querySelector('.shadow-runner-rotate-gate')
    const stage = document.querySelector('.shadow-runner-landscape-stage')
    const gateVisible = Boolean(gate && getComputedStyle(gate).display !== 'none')
    const stageVisible = Boolean(stage && getComputedStyle(stage).display !== 'none')

    return {
      gateVisible,
      stageVisible,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  })

  assert(state.stageVisible, `${profile.label}: Shadow Runner landscape stage is not visible`)
  assert(!state.gateVisible, `${profile.label}: rotate gate is visible in landscape phone viewport`)
  assert(state.width > state.height, `${profile.label}: expected landscape viewport`)
  record(`${profile.label} landscape stage visible`, state)
}

async function assertCanvasVisible(page, profile) {
  const box = await page.locator('.shadow-runner-game-stage canvas').boundingBox()
  assert(box, `${profile.label}: Phaser canvas was not mounted`)
  assert(box.width >= profile.viewport.width * 0.82, `${profile.label}: canvas width is too small`)
  assert(box.height >= profile.viewport.height * 0.82, `${profile.label}: canvas height is too small`)

  const canvasPath = path.join(artifactDir, `${profile.label}-canvas.png`)
  await page.locator('.shadow-runner-game-stage canvas').screenshot({ path: canvasPath })
  summary.screenshots.push(canvasPath)
  await assertImageNonBlank(canvasPath, `${profile.label} canvas`)
}

async function assertHudAndControls(page, profile) {
  const state = await page.evaluate(() => {
    const selectors = {
      playableStage: '[aria-label="Shadow Runner playable level"]',
      movement: '[aria-label="Movement controls"]',
      jump: '[aria-label="Jump"]',
      attack: '[aria-label="Sword attack"]',
      pause: '[aria-label="Open pause menu"]',
      coins: '[aria-label^="Coins collected"]',
      score: '[aria-label^="Score"]',
    }

    const entries = Object.entries(selectors).map(([name, selector]) => {
      const element = document.querySelector(selector)
      if (!element) return [name, null]
      const rect = element.getBoundingClientRect()
      return [name, {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }]
    })

    return {
      width: window.innerWidth,
      height: window.innerHeight,
      boxes: Object.fromEntries(entries),
    }
  })

  for (const [name, box] of Object.entries(state.boxes)) {
    assert(box, `${profile.label}: missing Shadow Runner control/HUD element: ${name}`)
    assert(box.width > 0 && box.height > 0, `${profile.label}: ${name} has an empty box`)
    assert(box.right > 0 && box.bottom > 0 && box.left < state.width && box.top < state.height, `${profile.label}: ${name} is outside the viewport`)
  }

  const jump = state.boxes.jump
  const attack = state.boxes.attack
  const movement = state.boxes.movement
  assert(jump.top > state.height * 0.44, `${profile.label}: jump control is too high for a phone layout`)
  assert(attack.top > state.height * 0.34, `${profile.label}: attack control is too high for a phone layout`)
  assert(movement.width >= state.width * 0.3, `${profile.label}: movement zone is too narrow`)
  record(`${profile.label} HUD and controls visible`, state.boxes)
}

async function assertImageNonBlank(imagePath, label) {
  const stats = await sharp(imagePath).stats()
  const weightedDeviation = stats.channels
    .slice(0, 3)
    .reduce((sum, channel) => sum + channel.stdev, 0) / 3

  assert(weightedDeviation > 4, `${label} appears blank or visually flat`)
  record(`${label} nonblank`, { stdev: Number(weightedDeviation.toFixed(2)) })
}

async function capture(page, name) {
  const screenshotPath = path.join(artifactDir, name)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  summary.screenshots.push(screenshotPath)
  return screenshotPath
}

async function ensurePreviewServer() {
  if (config.reuseServer && await waitForUrl(config.baseUrl, 1500)) {
    logLine(`Reusing preview server at ${config.baseUrl}`)
    return { cleanup: async () => {} }
  }

  if (!config.skipBuild) {
    await runLoggedCommand({
      command: viteCommand,
      args: [...viteBaseArgs, 'build'],
      logPath: path.join(logsDir, 'build.log'),
    })
  }

  const previewLogPath = path.join(logsDir, 'preview.log')
  const child = spawnCli(viteCommand, [
    ...viteBaseArgs,
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

async function runLoggedCommand({ command, args: commandArgs, logPath }) {
  await appendFile(logPath, `> ${command} ${commandArgs.join(' ')}\n`)

  await new Promise((resolve, reject) => {
    const child = spawnCli(command, commandArgs, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    child.stdout.on('data', chunk => void appendFile(logPath, chunk))
    child.stderr.on('data', chunk => void appendFile(logPath, chunk))
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${commandArgs.join(' ')} exited with ${code}`))
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

function spawnCli(command, commandArgs, options) {
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    return spawn(windowsCommandShell, ['/d', '/c', 'call', command, ...commandArgs], {
      ...options,
      shell: false,
    })
  }

  return spawn(command, commandArgs, options)
}

function parseArgs(argv) {
  const parsed = {
    headed: process.env.npm_config_headed === 'true',
    slowMo: Number(process.env.npm_config_slow_mo || process.env.npm_config_slowMo || 0) || 0,
    baseUrl: process.env.npm_config_base_url || null,
    reuseServer: process.env.npm_config_reuse_server === 'false' ? false : true,
    skipBuild: process.env.npm_config_skip_build === 'true',
    runName: process.env.npm_config_run_name || null,
    levelId: process.env.npm_config_level || 'tutorial',
    profiles: process.env.npm_config_profiles || 'landscape',
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
    else if (current.startsWith('--level=')) parsed.levelId = current.slice('--level='.length)
    else if (current === '--level' && argv[index + 1]) parsed.levelId = argv[++index]
    else if (current.startsWith('--profiles=')) parsed.profiles = current.slice('--profiles='.length)
    else if (current === '--profiles' && argv[index + 1]) parsed.profiles = argv[++index]
  }

  return parsed
}

function buildConfig(parsedArgs) {
  if (!Object.prototype.hasOwnProperty.call(LEVELS, parsedArgs.levelId)) {
    throw new Error(`Unsupported Shadow Runner level: ${parsedArgs.levelId}`)
  }

  const baseUrl = parsedArgs.baseUrl || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
  const base = new URL(baseUrl)
  const profiles = parsedArgs.profiles
    .split(',')
    .map(profile => profile.trim())
    .filter(Boolean)
    .map(profile => {
      const resolved = PHONE_PROFILES[profile]
      if (!resolved) throw new Error(`Unsupported phone profile: ${profile}`)
      return resolved
    })

  if (!profiles.length) {
    throw new Error('At least one phone profile is required')
  }

  return {
    baseUrl: base.toString().replace(/\/$/, ''),
    host: base.hostname,
    port: Number(base.port || DEFAULT_PORT),
    headless: !parsedArgs.headed,
    slowMo: parsedArgs.slowMo,
    reuseServer: parsedArgs.reuseServer,
    skipBuild: parsedArgs.skipBuild,
    levelId: parsedArgs.levelId,
    profiles,
    artifactDir: path.join('output', 'playwright', slugify(parsedArgs.runName || `shadow-runner-${parsedArgs.levelId}-${timestampToken()}`)),
  }
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
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

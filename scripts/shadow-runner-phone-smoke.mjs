import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium, webkit } from 'playwright'
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
    detailChecks: [
      /Level 5/i,
      /Trick Hazards/i,
      /Shielded archer volleys/i,
      /Candle Jesters/i,
    ],
    gameplayChecks: [
      /Shield up\. Stay low\. Pick coin risks\./i,
    ],
  },
  'level-6': {
    title: 'Clockmaker Yard',
    completedLevels: ['tutorial', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5'],
    detailChecks: [
      /Level 6/i,
      /Clockwork Pace/i,
      /Chrono Lantern/i,
      /Lantern Bandit Scouts/i,
    ],
    gameplayChecks: [
      /Catch the clock\. Slow the yard\. Break the gear lock\./i,
    ],
  },
  'level-7': {
    title: 'Moonlit Causeway',
    completedLevels: ['tutorial', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6'],
    detailChecks: [
      /Level 7/i,
      /Causeway Chase/i,
      /Moon Shards/i,
      /Shadow Surge/i,
    ],
    gameplayChecks: [
      /Recover every shard\. Cross the moon road\. Do not trust the bridges\./i,
    ],
  },
  'level-8': {
    title: 'Courier Catacombs',
    completedLevels: ['tutorial', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7'],
    detailChecks: [
      /Level 8/i,
      /Hidden Paths/i,
      /Wraithlight/i,
      /Mirror Ward/i,
      /Relay Seals/i,
    ],
    gameplayChecks: [
      /The courier dead kept the first road\. Recover their seals before the Rival does\./i,
    ],
  },
}

const PHONE_PROFILES = {
  landscape: {
    label: 'landscape',
    browserName: 'webkit',
    viewport: { width: 740, height: 390 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  android: {
    label: 'android',
    browserName: 'chromium',
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
  for (const profile of config.profiles) {
    const browserType = profile.browserName === 'webkit' ? webkit : chromium
    browser = await browserType.launch({
      headless: config.headless,
      slowMo: config.slowMo,
      ...(profile.browserName === 'chromium' ? { args: ['--disable-dev-shm-usage'] } : {}),
    })
    try {
      await runLandscapeProfile(browser, profile)
    } finally {
      await withTimeout(browser.close(), 5_000, `${profile.label} browser cleanup`).catch(error => {
        logLine(error.message)
      })
      browser = null
    }
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
    await withTimeout(browser.close(), 5_000, 'Browser cleanup').catch(error => {
      logLine(error.message)
    })
  }
  if (previewServer?.cleanup) {
    await withTimeout(previewServer.cleanup(), 5_000, 'Preview cleanup').catch(error => {
      logLine(error.message)
    })
  }
}

async function runLandscapeProfile(browserInstance, profile) {
  const level = LEVELS[config.levelId]
  const context = await browserInstance.newContext({
    viewport: profile.viewport,
    userAgent: profile.userAgent,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    serviceWorkers: 'allow',
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
    await page.getByRole('button', { name: /Select Level/i }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await page.waitForFunction(() => {
      const playfield = document.querySelector('.shadow-runner-playfield')
      return Boolean(playfield && Number.parseFloat(getComputedStyle(playfield).opacity) >= 0.99)
    }, null, { timeout: DEFAULT_TIMEOUT_MS })
    await delay(120)
    const titlePath = await capture(page, `${profile.label}-01-title.png`)
    await assertImageNonBlank(titlePath, `${profile.label} title screenshot`)

    if (config.levelId === 'tutorial') {
      await page.getByRole('button', { name: LEVELS.tutorial.titleButton }).click()
    } else {
      await page.getByRole('button', { name: /Select Level/i }).click()
      await page.getByText('Level Map').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
      await capture(page, `${profile.label}-02-map.png`)
      await page.getByRole('button', { name: new RegExp(`${escapeRegExp(level.title)} details`, 'i') }).click()
      await page.getByText(level.title, { exact: true }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
      await assertLevelDetails(page, level, profile)
      await capture(page, `${profile.label}-03-level-details.png`)
      await page.getByRole('button', { name: /^(Start|Replay)$/i }).click()
    }

    await page.getByText(level.title, { exact: true }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await page.locator('.shadow-runner-game-stage canvas').waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await page.waitForFunction(() => !document.body.innerText.includes('Loading Level'), null, {
      timeout: DEFAULT_TIMEOUT_MS,
    })
    await assertActiveGameplay(page, level, profile)
    await delay(3000)

    const gameplayPath = await capture(page, `${profile.label}-04-gameplay.png`)
    await assertCanvasVisible(page, profile)
    await assertHudAndControls(page, profile)
    await assertImageNonBlank(gameplayPath, `${profile.label} gameplay screenshot`)
    await exerciseGameplayControls(page, level, profile)

    record(`${profile.label} ${config.levelId} phone smoke`, {
      viewport: profile.viewport,
      screenshot: gameplayPath,
    })
  } finally {
    await context.close().catch(() => {})
  }
}

async function assertLevelDetails(page, level, profile) {
  if (!level.detailChecks?.length) return

  const pageText = await page.locator('body').innerText({ timeout: DEFAULT_TIMEOUT_MS })
  for (const pattern of level.detailChecks) {
    assert(pattern.test(pageText), `${profile.label}: missing ${config.levelId} detail text matching ${pattern}`)
  }
  record(`${profile.label} ${config.levelId} detail copy visible`, {
    checks: level.detailChecks.map(pattern => pattern.source),
  })
}

async function assertActiveGameplay(page, level, profile) {
  if (!level.gameplayChecks?.length) return

  for (const pattern of level.gameplayChecks) {
    await page.getByText(pattern).waitFor({ timeout: 4000 }).catch(() => {
      throw new Error(`${profile.label}: missing ${config.levelId} gameplay text matching ${pattern}`)
    })
  }
  record(`${profile.label} ${config.levelId} gameplay copy visible`, {
    checks: level.gameplayChecks.map(pattern => pattern.source),
  })
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
      health: '[aria-label^="Lives"]',
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

async function exerciseGameplayControls(page, level, profile) {
  await page.waitForFunction(() => typeof window.__shadowRunnerDebug === 'function', null, {
    timeout: DEFAULT_TIMEOUT_MS,
  })

  if (profile.browserName === 'webkit') {
    await page.evaluate(() => window.__shadowRunnerQa?.teleport(300, 616))
    await delay(160)
  }
  const before = await readShadowRunnerDebug(page)
  assert(before?.player, `${profile.label}: missing Shadow Runner player debug state`)

  await page.evaluate(() => window.__shadowRunnerQa?.move('right', true))
  await page.waitForFunction(
    () => (window.__shadowRunnerDebug?.().player?.velocityX ?? 0) > 0,
    null,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  await delay(420)
  await page.evaluate(() => window.__shadowRunnerQa?.move('right', false))
  const afterRun = await readShadowRunnerDebug(page)
  const minimumTravel = profile.browserName === 'webkit' ? 4 : 30
  assert(
    (afterRun?.player?.x ?? 0) >= (before.player.x ?? 0) + minimumTravel,
    `${profile.label}: movement touch zone did not move the player `
      + `(x ${before.player.x} -> ${afterRun?.player?.x ?? 'missing'})`,
  )

  await page.keyboard.down('KeyS')
  await delay(120)
  const crouching = await readShadowRunnerDebug(page)
  await page.keyboard.up('KeyS')
  assert(
    (crouching?.player?.bodyHeight ?? 99) < (afterRun?.player?.bodyHeight ?? 0),
    `${profile.label}: crouch did not reduce the player hitbox`,
  )

  await delay(80)
  await page.getByRole('button', { name: 'Jump' }).click()
  await delay(120)
  const jumping = await readShadowRunnerDebug(page)
  assert(
    (jumping?.player?.velocityY ?? 0) < 0,
    `${profile.label}: jump did not produce upward velocity`,
  )
  await page.getByRole('button', { name: 'Sword attack' }).click()

  await page.getByRole('button', { name: 'Open pause menu' }).click()
  await page.getByText('Pause', { exact: true }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await page.getByRole('button', { name: /Resume/i }).click()

  if (config.levelId === 'level-5') {
    await assertLevelFiveCheckpointAndPools(page, profile)
  } else if (config.levelId === 'level-6') {
    await assertLevelSixGameplay(page, profile)
  } else if (config.levelId === 'level-7') {
    await assertLevelSevenGameplay(page, profile)
  } else if (config.levelId === 'level-8') {
    await assertLevelEightGameplay(page, profile)
  }

  if (config.levelId !== 'level-8') {
    await page.keyboard.press('Digit3')
    await page.getByRole('dialog', { name: 'Level Complete' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
    await capture(page, `${profile.label}-07-complete.png`)
  }
  record(`${profile.label} ${config.levelId} gameplay controls and completion`, {
    startX: before.player.x,
    runX: afterRun?.player?.x,
    jumpVelocityY: jumping?.player?.velocityY,
    level: level.title,
  })
}

async function assertLevelFiveCheckpointAndPools(page, profile) {
  const checkpoints = [
    { x: 2164, y: 584, id: 'fair-first-volley' },
    { x: 4430, y: 614, id: 'fair-high-route' },
    { x: 6234, y: 520, id: 'fair-gauntlet' },
    { x: 8060, y: 584, id: 'fair-final-entry' },
  ]

  for (const checkpoint of checkpoints) {
    await page.evaluate(({ x, y }) => window.__shadowRunnerQa?.teleport(x, y), checkpoint)
    await page.waitForFunction(
      expected => window.__shadowRunnerDebug?.().checkpointId === expected,
      checkpoint.id,
      { timeout: DEFAULT_TIMEOUT_MS },
    )
    if (checkpoint.id === 'fair-high-route' || checkpoint.id === 'fair-gauntlet') {
      await delay(160)
      await capture(page, `${profile.label}-05-${checkpoint.id}.png`)
    }
  }

  await assertLevelFiveRouteSegments(page, profile)

  await page.evaluate(() => window.__shadowRunnerQa?.teleport(6460, 584))
  await delay(3200)
  const snapshot = await readShadowRunnerDebug(page)
  assert((snapshot?.pools?.projectiles.total ?? 99) <= 48, `${profile.label}: projectile pool exceeded its cap`)
  assert((snapshot?.pools?.candleHazards.total ?? 99) <= 24, `${profile.label}: candle hazard pool exceeded its cap`)
  record(`${profile.label} level-5 checkpoints and pools`, {
    checkpointId: snapshot?.checkpointId,
    pools: snapshot?.pools,
  })
}

async function assertLevelFiveRouteSegments(page, profile) {
  const crouchSegments = [
    { label: 'first low cover', x: 2518, y: 584, targetX: 2708 },
    { label: 'gauntlet low cover', x: 6888, y: 584, targetX: 7074 },
  ]

  for (const segment of crouchSegments) {
    await page.evaluate(({ x, y }) => {
      window.__shadowRunnerQa?.restore()
      window.__shadowRunnerQa?.teleport(x, y)
    }, segment)
    await delay(100)
    await page.keyboard.down('KeyS')
    await page.keyboard.down('KeyD')
    await delay(2600)
    await page.keyboard.up('KeyD')
    await page.keyboard.up('KeyS')
    const snapshot = await readShadowRunnerDebug(page)
    assert(
      (snapshot?.player?.x ?? 0) >= segment.targetX,
      `${profile.label}: Level 5 ${segment.label} stopped at x=${snapshot?.player?.x ?? 'missing'} before x=${segment.targetX}`,
    )
  }

  await page.evaluate(() => {
    window.__shadowRunnerQa?.restore()
    window.__shadowRunnerQa?.teleport(4648, 614)
  })
  await delay(100)
  await page.keyboard.down('KeyD')
  await page.getByRole('button', { name: 'Jump' }).click()
  await delay(700)
  await page.keyboard.up('KeyD')
  let snapshot = await readShadowRunnerDebug(page)
  assert((snapshot?.player?.x ?? 0) >= 4780, `${profile.label}: Level 5 recovery platforms are not navigable`)

  await page.evaluate(() => {
    window.__shadowRunnerQa?.restore()
    window.__shadowRunnerQa?.teleport(7770, 492)
  })
  await delay(100)
  await page.keyboard.down('KeyD')
  await page.getByRole('button', { name: 'Jump' }).click()
  await delay(300)
  await page.getByRole('button', { name: 'Jump' }).click()
  await delay(700)
  await page.keyboard.up('KeyD')
  snapshot = await readShadowRunnerDebug(page)
  assert((snapshot?.player?.x ?? 0) >= 8008, `${profile.label}: Level 5 final bridge is not navigable`)
  await capture(page, `${profile.label}-06-route-segments.png`)

  record(`${profile.label} level-5 route segments navigable`, {
    finalBridgeX: snapshot?.player?.x,
  })
}

async function assertLevelSixGameplay(page, profile) {
  const checkpoints = [
    { x: 2370, y: 584, id: 'yard-first-lock' },
    { x: 4070, y: 614, id: 'yard-high-route' },
    { x: 6620, y: 584, id: 'yard-gear-run' },
    { x: 8470, y: 614, id: 'yard-gauntlet' },
    { x: 9370, y: 584, id: 'yard-final-approach' },
  ]

  for (const checkpoint of checkpoints) {
    await page.evaluate(({ x, y }) => window.__shadowRunnerQa?.teleport(x, y), checkpoint)
    await page.waitForFunction(
      expected => window.__shadowRunnerDebug?.().checkpointId === expected,
      checkpoint.id,
      { timeout: DEFAULT_TIMEOUT_MS },
    )
    if (checkpoint.id === 'yard-high-route' || checkpoint.id === 'yard-gauntlet') {
      await delay(160)
      await capture(page, `${profile.label}-05-${checkpoint.id}.png`)
    }
  }

  await delay(1300)
  await page.keyboard.press('Digit7')
  await page.waitForFunction(() => window.__shadowRunnerDebug?.().player?.chronoActive === true, null, {
    timeout: DEFAULT_TIMEOUT_MS,
  })
  let snapshot = await readShadowRunnerDebug(page)
  assert((snapshot?.player?.chronoRemainingMs ?? 0) > 0, `${profile.label}: Chrono Lantern did not activate`)
  await capture(page, `${profile.label}-05-chrono-lantern.png`)

  await page.evaluate(() => window.__shadowRunnerQa?.damage(12))
  await page.waitForFunction(() => {
    const player = window.__shadowRunnerDebug?.().player
    return player?.lives === 2 && player.health === 12
  }, null, { timeout: DEFAULT_TIMEOUT_MS })

  const heartState = await page.evaluate(() => ({
    aria: document.querySelector('[aria-label^="Lives"]')?.getAttribute('aria-label'),
    hearts: Array.from(document.querySelectorAll('[data-heart-state]'))
      .map(heart => heart.getAttribute('data-heart-state')),
  }))
  assert(heartState.hearts.filter(state => state === 'full').length === 2, `${profile.label}: losing a life did not remove one full heart`)
  assert(heartState.hearts.filter(state => state === 'empty').length === 1, `${profile.label}: lost life did not render one empty heart`)
  assert(heartState.aria?.includes('health 12 of 12'), `${profile.label}: expanded health scale is missing from the HUD`)

  const crouchSegments = [
    { label: 'first clock gate', x: 2875, y: 584, targetX: 3170 },
    { label: 'second clock gate', x: 6065, y: 584, targetX: 6340 },
    { label: 'gauntlet clock gate', x: 8055, y: 584, targetX: 8330 },
  ]

  for (const segment of crouchSegments) {
    await page.evaluate(({ x, y }) => {
      window.__shadowRunnerQa?.restore()
      window.__shadowRunnerQa?.teleport(x, y)
    }, segment)
    await delay(120)
    await page.keyboard.down('KeyS')
    await page.keyboard.down('KeyD')
    await delay(3600)
    await page.keyboard.up('KeyD')
    await page.keyboard.up('KeyS')
    snapshot = await readShadowRunnerDebug(page)
    assert(
      (snapshot?.player?.x ?? 0) >= segment.targetX,
      `${profile.label}: Level 6 ${segment.label} stopped at x=${snapshot?.player?.x ?? 'missing'} before x=${segment.targetX}`,
    )
  }

  const jumpSegments = [
    { label: 'counterweight step one', x: 4260, y: 500, targetX: 4428, doubleJump: false },
    { label: 'counterweight step two', x: 4560, y: 380, targetX: 4740, doubleJump: true },
    { label: 'counterweight drop', x: 4890, y: 260, targetX: 5080, doubleJump: false },
    { label: 'final gear bridge', x: 9680, y: 584, targetX: 9920, doubleJump: true },
  ]

  for (const segment of jumpSegments) {
    await page.evaluate(({ x, y }) => {
      window.__shadowRunnerQa?.restore()
      window.__shadowRunnerQa?.teleport(x, y)
    }, segment)
    await delay(120)
    await page.keyboard.down('KeyD')
    await page.getByRole('button', { name: 'Jump' }).click()
    if (segment.doubleJump) {
      await delay(280)
      await page.getByRole('button', { name: 'Jump' }).click()
    }
    await delay(820)
    await page.keyboard.up('KeyD')
    snapshot = await readShadowRunnerDebug(page)
    assert(
      (snapshot?.player?.x ?? 0) >= segment.targetX,
      `${profile.label}: Level 6 ${segment.label} stopped at x=${snapshot?.player?.x ?? 'missing'} before x=${segment.targetX}`,
    )
  }

  await page.evaluate(() => window.__shadowRunnerQa?.teleport(8040, 584))
  await delay(3000)
  snapshot = await readShadowRunnerDebug(page)
  assert((snapshot?.pools?.projectiles.total ?? 99) <= 48, `${profile.label}: projectile pool exceeded its cap`)
  assert((snapshot?.pools?.candleHazards.total ?? 99) <= 24, `${profile.label}: candle hazard pool exceeded its cap`)
  await capture(page, `${profile.label}-06-level-6-routes.png`)

  record(`${profile.label} level-6 health, Chrono Lantern, and route segments`, {
    checkpointId: snapshot?.checkpointId,
    hearts: heartState.hearts,
    healthAria: heartState.aria,
    pools: snapshot?.pools,
  })
}

async function assertLevelSevenGameplay(page, profile) {
  const checkpoints = [
    { x: 2070, y: 616, id: 'causeway-first-bridge' },
    { x: 4410, y: 604, id: 'causeway-shard-climb' },
    { x: 5530, y: 616, id: 'causeway-arrow-pocket' },
    { x: 7910, y: 616, id: 'causeway-moon-gauntlet' },
    { x: 8970, y: 616, id: 'causeway-final-archers' },
    { x: 11290, y: 616, id: 'causeway-relay-approach' },
  ]

  for (const checkpoint of checkpoints) {
    await page.evaluate(({ x, y }) => window.__shadowRunnerQa?.teleport(x, y), checkpoint)
    await page.waitForFunction(
      expected => window.__shadowRunnerDebug?.().checkpointId === expected,
      checkpoint.id,
      { timeout: DEFAULT_TIMEOUT_MS },
    )
    if (checkpoint.id === 'causeway-arrow-pocket' || checkpoint.id === 'causeway-final-archers') {
      await delay(160)
      await capture(page, `${profile.label}-05-${checkpoint.id}.png`)
    }
  }

  await page.evaluate(() => {
    window.__shadowRunnerQa?.restore()
    window.__shadowRunnerQa?.teleport(8140, 580)
  })
  await page.waitForFunction(() => window.__shadowRunnerDebug?.().player?.surgeActive === true, null, {
    timeout: DEFAULT_TIMEOUT_MS,
  })
  let snapshot = await readShadowRunnerDebug(page)
  assert((snapshot?.player?.surgeRemainingMs ?? 0) > 0, `${profile.label}: Shadow Surge did not activate`)

  const crouchSegment = { label: 'first moon overhang', x: 2768, y: 616, targetX: 3090 }
  await page.evaluate(({ x, y }) => {
    window.__shadowRunnerQa?.restore()
    window.__shadowRunnerQa?.teleport(x, y)
  }, crouchSegment)
  await delay(120)
  await page.keyboard.down('KeyS')
  await page.keyboard.down('KeyD')
  await delay(3600)
  await page.keyboard.up('KeyD')
  await page.keyboard.up('KeyS')
  snapshot = await readShadowRunnerDebug(page)
  assert(
    (snapshot?.player?.x ?? 0) >= crouchSegment.targetX,
    `${profile.label}: Level 7 ${crouchSegment.label} stopped at x=${snapshot?.player?.x ?? 'missing'} before x=${crouchSegment.targetX}`,
  )

  const crawlPickupSegment = { label: 'moon shard crawl pickups', x: 6265, y: 616, targetX: 6600 }
  await page.evaluate(({ x, y }) => {
    window.__shadowRunnerQa?.restore()
    window.__shadowRunnerQa?.teleport(x, y)
  }, crawlPickupSegment)
  await delay(120)
  const beforeCrawlPickup = await readShadowRunnerDebug(page)
  await page.keyboard.down('KeyS')
  await page.keyboard.down('KeyD')
  await delay(4200)
  await page.keyboard.up('KeyD')
  await page.keyboard.up('KeyS')
  snapshot = await readShadowRunnerDebug(page)
  assert(
    (snapshot?.player?.x ?? 0) >= crawlPickupSegment.targetX,
    `${profile.label}: Level 7 ${crawlPickupSegment.label} stopped at x=${snapshot?.player?.x ?? 'missing'} before x=${crawlPickupSegment.targetX}`,
  )
  assert(
    (snapshot?.player?.coins ?? 0) >= (beforeCrawlPickup?.player?.coins ?? 0) + 2,
    `${profile.label}: Level 7 ${crawlPickupSegment.label} did not collect crawl-lane coins `
      + `(coins ${beforeCrawlPickup?.player?.coins ?? 'missing'} -> ${snapshot?.player?.coins ?? 'missing'}, `
      + `x=${snapshot?.player?.x ?? 'missing'}, bodyTop=${snapshot?.player?.bodyTop ?? 'missing'}, `
      + `bodyBottom=${snapshot?.player?.bodyBottom ?? 'missing'})`,
  )
  assert(
    (snapshot?.player?.moonShards ?? 0) >= (beforeCrawlPickup?.player?.moonShards ?? 0) + 1,
    `${profile.label}: Level 7 ${crawlPickupSegment.label} did not collect the crawl-lane Moon Shard`,
  )

  const recoverySegments = [
    { label: 'middle recovery chip', x: 4030, y: 616, targetX: 4400, targetBottom: 632, secondHopDelayMs: 900 },
    { label: 'moon gauntlet recovery chip', x: 8360, y: 616, targetX: 8870, targetBottom: 644, secondHopDelayMs: 980 },
    { label: 'final recovery chip', x: 9690, y: 616, targetX: 10120, targetBottom: 644, secondHopDelayMs: 920 },
  ]

  for (const segment of recoverySegments) {
    await page.evaluate(({ x, y }) => {
      window.__shadowRunnerQa?.restore()
      window.__shadowRunnerQa?.teleport(x, y)
    }, segment)
    await delay(120)
    await page.keyboard.down('KeyD')
    await page.getByRole('button', { name: 'Jump' }).click()
    await delay(280)
    await page.getByRole('button', { name: 'Jump' }).click()
    await delay(segment.secondHopDelayMs)
    await page.getByRole('button', { name: 'Jump' }).click()
    await delay(950)
    await page.keyboard.up('KeyD')
    snapshot = await readShadowRunnerDebug(page)
    assert(
      (snapshot?.player?.x ?? 0) >= segment.targetX,
      `${profile.label}: Level 7 ${segment.label} stopped at x=${snapshot?.player?.x ?? 'missing'} before x=${segment.targetX} `
        + `(bodyTop=${snapshot?.player?.bodyTop ?? 'missing'}, bodyBottom=${snapshot?.player?.bodyBottom ?? 'missing'})`,
    )
    assert(
      (snapshot?.player?.bodyBottom ?? 999) <= segment.targetBottom,
      `${profile.label}: Level 7 ${segment.label} ended below the recovery route at y=${snapshot?.player?.bodyBottom ?? 'missing'}`,
    )
  }

  const shards = [
    { x: 3060, y: 246, expected: 2 },
    { x: 10180, y: 228, expected: 3 },
  ]

  for (const shard of shards) {
    await page.evaluate(({ x, y }) => window.__shadowRunnerQa?.teleport(x, y), shard)
    await page.waitForFunction(
      expected => window.__shadowRunnerDebug?.().player?.moonShards === expected,
      shard.expected,
      { timeout: DEFAULT_TIMEOUT_MS },
    )
  }
  snapshot = await readShadowRunnerDebug(page)
  assert(snapshot?.player?.moonShards === 3, `${profile.label}: Moon Shards did not reach 3/3`)
  assert(snapshot?.player?.totalMoonShards === 3, `${profile.label}: Moon Shard total did not report 3`)

  await page.evaluate(() => window.__shadowRunnerQa?.teleport(8900, 616))
  await delay(3000)
  snapshot = await readShadowRunnerDebug(page)
  assert((snapshot?.pools?.projectiles.total ?? 99) <= 48, `${profile.label}: projectile pool exceeded its cap`)
  assert((snapshot?.pools?.candleHazards.total ?? 99) <= 24, `${profile.label}: candle hazard pool exceeded its cap`)
  await capture(page, `${profile.label}-06-level-7-routes.png`)

  record(`${profile.label} level-7 shards, Surge, crouch, and route segments`, {
    checkpointId: snapshot?.checkpointId,
    moonShards: snapshot?.player?.moonShards,
    surgeActive: snapshot?.player?.surgeActive,
    pools: snapshot?.pools,
  })
}

async function assertLevelEightGameplay(page, profile) {
  const fullPhysicsPass = profile.browserName === 'chromium'
  const checkpoints = [
    { x: 1820, y: 616, id: 'catacomb-checkpoint-descent' },
    { x: 3920, y: 616, id: 'catacomb-checkpoint-fork' },
    { x: 6240, y: 616, id: 'catacomb-checkpoint-vault' },
    { x: 8780, y: 616, id: 'catacomb-checkpoint-ossuary' },
    { x: 11400, y: 616, id: 'catacomb-checkpoint-bridge' },
    { x: 13680, y: 616, id: 'catacomb-checkpoint-echo' },
    { x: 14840, y: 616, id: 'catacomb-checkpoint-sanctum' },
    { x: 15760, y: 616, id: 'catacomb-checkpoint-door' },
  ]

  for (const checkpoint of checkpoints) {
    await page.evaluate(({ x, y }) => window.__shadowRunnerQa?.teleport(x, y), checkpoint)
    await page.waitForFunction(
      expected => window.__shadowRunnerDebug?.().checkpointId === expected,
      checkpoint.id,
      { timeout: DEFAULT_TIMEOUT_MS },
    )
  }

  let snapshot = await readShadowRunnerDebug(page)
  const sleepingLurker = snapshot?.enemies?.find(enemy => enemy.id === 'catacomb-lurker-intro')
  assert(sleepingLurker?.activated === false, `${profile.label}: offscreen Tomb Lurker woke before its encounter`)

  await page.evaluate(() => window.__shadowRunnerQa?.teleport(2470, 616))
  await page.waitForFunction(
    () => window.__shadowRunnerDebug?.().enemies
      ?.find(enemy => enemy.id === 'catacomb-lurker-intro')?.activated === true,
    null,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  snapshot = await readShadowRunnerDebug(page)
  assert(
    snapshot?.enemies?.find(enemy => enemy.id === 'catacomb-warden-fork')?.guard === 2,
    `${profile.label}: Crypt Warden guard state was not initialized`,
  )
  assert(
    snapshot?.enemies?.find(enemy => enemy.id === 'catacomb-rival-final')?.activated === true,
    `${profile.label}: Rival Courier finale encounter did not activate`,
  )
  assert(
    snapshot?.encounters?.find(encounter => encounter.id === 'catacomb-encounter-sanctum')?.barrierActive === true,
    `${profile.label}: Relay Sanctum did not seal after activation`,
  )
  await page.evaluate(() => window.__shadowRunnerQa?.teleport(15500, 616))
  await delay(180)
  await capture(page, `${profile.label}-05-sealed-sanctum.png`)
  await page.evaluate(() => {
    window.__shadowRunnerQa?.defeatEnemy('catacomb-warden-sanctum')
    window.__shadowRunnerQa?.defeatEnemy('catacomb-archer-sanctum')
  })
  await page.waitForFunction(
    () => window.__shadowRunnerDebug?.().encounters
      ?.find(encounter => encounter.id === 'catacomb-encounter-sanctum')?.barrierActive === false,
    null,
    { timeout: DEFAULT_TIMEOUT_MS },
  )

  const dpadBox = await page.locator('.shadow-runner-dpad').boundingBox()
  assert(dpadBox, `${profile.label}: movement d-pad was not measurable`)
  const crouchTap = {
    x: dpadBox.x + dpadBox.width * 0.5,
    y: dpadBox.y + dpadBox.height * 0.79,
  }
  const standingHeight = snapshot?.player?.bodyHeight ?? 0
  await page.touchscreen.tap(crouchTap.x, crouchTap.y)
  await page.waitForFunction(
    expected => (window.__shadowRunnerDebug?.().player?.bodyHeight ?? expected) < expected,
    standingHeight,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  await page.touchscreen.tap(crouchTap.x, crouchTap.y)
  await page.waitForFunction(
    expected => (window.__shadowRunnerDebug?.().player?.bodyHeight ?? 0) >= expected,
    standingHeight,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  await page.touchscreen.tap(crouchTap.x, crouchTap.y)
  await page.getByRole('button', { name: 'Jump' }).click()
  await page.waitForFunction(() => {
    const player = window.__shadowRunnerDebug?.().player
    return Boolean(player && player.bodyHeight > 40 && player.velocityY < 0 && !player.crouchInput)
  }, null, { timeout: DEFAULT_TIMEOUT_MS })

  await page.evaluate(() => {
    window.__shadowRunnerQa?.restore()
    window.__shadowRunnerQa?.teleport(2878, 616)
  })
  await delay(140)
  const beforeCrawl = await readShadowRunnerDebug(page)
  await page.touchscreen.tap(crouchTap.x, crouchTap.y)
  await page.waitForFunction(
    expected => (window.__shadowRunnerDebug?.().player?.bodyHeight ?? expected) < expected,
    standingHeight,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  if (fullPhysicsPass) {
    await page.evaluate(() => window.__shadowRunnerQa?.move('right', true))
    await page.waitForFunction(
      () => (window.__shadowRunnerDebug?.().player?.x ?? 0) >= 3220,
      null,
      { timeout: 12_000 },
    ).finally(async () => {
      await page.evaluate(() => window.__shadowRunnerQa?.move('right', false))
    })
  } else {
    await page.evaluate(() => window.__shadowRunnerQa?.teleport(3060, 616))
    await delay(160)
  }
  snapshot = await readShadowRunnerDebug(page)
  if (fullPhysicsPass) {
    assert(
      (snapshot?.player?.x ?? 0) >= 3220,
      `${profile.label}: Level 8 first crouch lane stopped at x=${snapshot?.player?.x ?? 'missing'} `
        + `(bodyHeight=${snapshot?.player?.bodyHeight ?? 'missing'})`,
    )
    assert(
      (snapshot?.player?.coins ?? 0) >= (beforeCrawl?.player?.coins ?? 0) + 4,
      `${profile.label}: Level 8 first crouch lane coins were not reachable`,
    )
  } else {
    assert(
      (snapshot?.player?.x ?? 0) >= 3000 && (snapshot?.player?.x ?? 9999) <= 3180,
      `${profile.label}: crouched player did not fit inside the first overhang`,
    )
    assert(
      (snapshot?.player?.bodyHeight ?? standingHeight) < standingHeight,
      `${profile.label}: crouched player expanded inside the first overhang`,
    )
    await page.evaluate(() => window.__shadowRunnerQa?.teleport(3230, 616))
    await delay(120)
  }
  await page.touchscreen.tap(crouchTap.x, crouchTap.y)

  await page.evaluate(() => window.__shadowRunnerQa?.collect('wraithlight', 0))
  await page.waitForFunction(
    () => window.__shadowRunnerDebug?.().player?.wraithlightActive === true,
    null,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  await page.evaluate(() => window.__shadowRunnerQa?.collect('mastery', 0))
  await page.waitForFunction(
    () => window.__shadowRunnerDebug?.().player?.masteryItems === 1,
    null,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  await capture(page, `${profile.label}-05-wraithlight-cache.png`)

  await page.evaluate(() => window.__shadowRunnerQa?.collect('mirrorWard', 0))
  await page.waitForFunction(
    () => window.__shadowRunnerDebug?.().player?.mirrorWardActive === true,
    null,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  await page.evaluate(() => window.__shadowRunnerQa?.teleport(5000, 616))
  await delay(120)
  const beforeReflection = await readShadowRunnerDebug(page)
  assert(
    (beforeReflection?.player?.mirrorWardCharges ?? 0) > 0,
    `${profile.label}: Mirror Ward had no reflection charges after collection`,
  )
  if (fullPhysicsPass) {
    await page.evaluate(() => window.__shadowRunnerQa?.fireAtPlayer())
    await page.waitForFunction(
      charges => (window.__shadowRunnerDebug?.().player?.mirrorWardCharges ?? charges) < charges,
      beforeReflection?.player?.mirrorWardCharges ?? 0,
      { timeout: DEFAULT_TIMEOUT_MS },
    )
  }
  await capture(page, `${profile.label}-06-mirror-reflection.png`)

  await page.evaluate(() => {
    window.__shadowRunnerQa?.restore()
    window.__shadowRunnerQa?.teleport(8780, 616)
  })
  await delay(2800)
  snapshot = await readShadowRunnerDebug(page)
  assert((snapshot?.pools?.projectiles.total ?? 99) <= 48, `${profile.label}: projectile pool exceeded its cap`)
  assert((snapshot?.pools?.candleHazards.total ?? 99) <= 24, `${profile.label}: candle hazard pool exceeded its cap`)
  await capture(page, `${profile.label}-07-ossuary-volley.png`)

  await page.keyboard.press('Digit3')
  await page.waitForFunction(
    () => window.__shadowRunnerDebug?.().objective === 'Relay Seals 0/3',
    null,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  assert(
    await page.getByRole('dialog', { name: 'Level Complete' }).count() === 0,
    `${profile.label}: Level 8 completed without Relay Seals`,
  )

  for (let index = 0; index < 3; index += 1) {
    await page.evaluate(pickupIndex => window.__shadowRunnerQa?.collect('objective', pickupIndex), index)
    await page.waitForFunction(
      expected => window.__shadowRunnerDebug?.().player?.objectiveItems === expected,
      index + 1,
      { timeout: DEFAULT_TIMEOUT_MS },
    )
  }

  await page.keyboard.press('Digit3')
  await page.waitForFunction(
    () => window.__shadowRunnerDebug?.().objective === 'Defeat the Rival Courier',
    null,
    { timeout: DEFAULT_TIMEOUT_MS },
  )
  assert(
    await page.getByRole('dialog', { name: 'Level Complete' }).count() === 0,
    `${profile.label}: Level 8 completed while the Rival Courier was alive`,
  )

  if (fullPhysicsPass) {
    snapshot = await readShadowRunnerDebug(page)
    const livesBeforeFall = snapshot?.player?.lives ?? 0
    assert(livesBeforeFall >= 2, `${profile.label}: Level 8 route probes consumed too many lives`)
    await page.evaluate(() => window.__shadowRunnerQa?.teleport(7000, 900))
    await page.waitForFunction(
      expectedLives => {
        const player = window.__shadowRunnerDebug?.().player
        return Boolean(player && player.lives === expectedLives - 1 && player.x >= 15680)
      },
      livesBeforeFall,
      { timeout: DEFAULT_TIMEOUT_MS },
    )
  }

  await page.evaluate(() => window.__shadowRunnerQa?.defeatEnemy('catacomb-rival-final'))
  await page.keyboard.press('Digit3')
  await page.getByRole('dialog', { name: 'Level Complete' }).waitFor({ timeout: DEFAULT_TIMEOUT_MS })
  await capture(page, `${profile.label}-08-complete.png`)

  snapshot = await readShadowRunnerDebug(page)
  record(`${profile.label} level-8 powers, encounters, route gates, and completion`, {
    checkpointId: snapshot?.checkpointId,
    relaySeals: snapshot?.player?.objectiveItems,
    courierCaches: snapshot?.player?.masteryItems,
    mirrorWardCharges: snapshot?.player?.mirrorWardCharges,
    fullPhysicsPass,
    pools: snapshot?.pools,
  })
}

async function readShadowRunnerDebug(page) {
  return page.evaluate(() => window.__shadowRunnerDebug?.())
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

async function withTimeout(promise, timeoutMs, label) {
  let timer = null
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
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

  page.on('response', async response => {
    if (response.status() < 400) return
    await appendFile(logPath, `[response:${label}:${response.status()}] ${response.request().method()} ${response.url()}\n`)
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
      return parsedArgs.levelId === 'level-8'
        ? resolved
        : { ...resolved, browserName: 'chromium' }
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

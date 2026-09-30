import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { chromium, webkit } from 'playwright'
import { allowRequest, assessPhantom, readDebugState, stableState, summarizeResources } from './shadow-runner-rebuild-lifecycle-smoke.mjs'

export const NARRATIVE_PROFILES = [
  { name: 'android', browser: 'chromium', viewport: { width: 932, height: 430 } },
  { name: 'iphone', browser: 'webkit', viewport: { width: 740, height: 390 } },
  { name: 'compact', browser: 'chromium', viewport: { width: 568, height: 320 } },
]
export const FIRST_NOTE = {
  id: 'tutorial-courier-mark', title: 'The Courier Mark',
  body: 'The old road still bears the courier seal. Beneath it, one line survives: the message moves, even when the relay does not.',
}
export const SECOND_NOTE = {
  id: 'tutorial-waiting-gate', title: 'A Waiting Gate',
  body: 'Beyond the training court, the east gate is dark. Your sealed letter is addressed to someone inside, not to the machines guarding it.',
}
const GUEST_KEY = 'shadow-runner-campaign-progress-v2:guest'
const TUTORIAL_DISPATCH = 'A road is not lost while someone is willing to cross it. The east gate is waiting.'
const DIAGNOSTIC_PATH = '/runner-waypost-diagnostic.html'

export function parseNarrativeOptions(argv) {
  const args = {}
  const allowed = new Set(['base-url', 'build-ready', 'runtime-hash', 'games-home-hash', 'run-name', 'profile', 'case', 'waypost-diagnostics'])
  for (const argument of argv) {
    if (!argument.startsWith('--')) throw new Error('Expected named arguments')
    const separator = argument.indexOf('=')
    const key = argument.slice(2, separator < 0 ? undefined : separator)
    const value = separator < 0 ? 'true' : argument.slice(separator + 1)
    if (!allowed.has(key) || Object.hasOwn(args, key)) throw new Error(`Unknown or repeated argument: ${key}`)
    args[key] = value
  }
  if (!args['build-ready'] || !/^[a-z0-9][a-z0-9_.:-]{0,79}$/i.test(args['build-ready']) || args['build-ready'] === 'true') throw new Error('Wait for main build/slot confirmation, then supply --build-ready=LABEL')
  if (!/^[a-z0-9_-]{6,40}$/i.test(args['runtime-hash'] ?? '')) throw new Error('Supply the confirmed --runtime-hash=HASH')
  if (!/^[a-z0-9_-]{6,40}$/i.test(args['games-home-hash'] ?? '')) throw new Error('Supply the confirmed --games-home-hash=HASH')
  const url = new URL(args['base-url'] ?? 'http://127.0.0.1:4176')
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Only a credential-free loopback HTTP origin is allowed')
  const runName = args['run-name'] ?? `runner-narrative-${args['build-ready'].replace(/[.:]/g, '-')}`
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(runName)) throw new Error('Use one safe output directory name')
  if (args.profile && !NARRATIVE_PROFILES.some(profile => profile.name === args.profile)) throw new Error('Unknown profile')
  const scenario = args.case ?? 'all'
  if (!['all', 'notice-expiry', 'earned-journal', 'wayposts'].includes(scenario)) throw new Error('Unknown case')
  if (args['waypost-diagnostics'] && !['true', 'false'].includes(args['waypost-diagnostics'])) throw new Error('Waypost diagnostics must be explicitly true or false')
  if (scenario === 'wayposts' && args['waypost-diagnostics'] !== 'true') throw new Error('Waypost-only cases require --waypost-diagnostics')
  return { baseUrl: url.origin, build: args['build-ready'], runtimeHash: args['runtime-hash'], gamesHomeHash: args['games-home-hash'], runName, profile: args.profile, scenario, waypostDiagnostics: args['waypost-diagnostics'] === 'true' }
}

export function rectsOverlap(a, b) {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
}

export function assessNoticeLayout(layout) {
  if (!layout) return { present: false }
  const { rect, viewport, textRects, obstacles, hitTests } = layout
  return {
    present: true,
    readableType: layout.fontSize >= 13,
    touchTarget: rect.width >= 44 && rect.height >= 44,
    withinViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height,
    textFits: textRects.length > 0 && textRects.every(text => text.left >= rect.left - 1 && text.right <= rect.right + 1 && text.top >= rect.top - 1 && text.bottom <= rect.bottom + 1),
    uncovered: hitTests.length > 0 && hitTests.every(hit => hit.notice),
    clearOfHudAndControls: !obstacles.some(obstacle => rectsOverlap(rect, obstacle.rect)),
  }
}

export function isStoryOnlyProgress(progress, ids = [FIRST_NOTE.id]) {
  const record = value => value && typeof value === 'object' && !Array.isArray(value)
  return Boolean(progress && progress.version === 2 && progress.ownerId === null
    && record(progress.levels) && Object.keys(progress.levels).length === 0
    && record(progress.pending) && Object.keys(progress.pending).length === 0
    && !progress.profileRefreshPending && Array.isArray(progress.discoveredStoryIds)
    && progress.discoveredStoryIds.length === ids.length
    && new Set(progress.discoveredStoryIds).size === ids.length
    && ids.every(id => progress.discoveredStoryIds.includes(id)))
}

export function assessNoticeDuration(events) {
  const shown = events.find(event => event.kind === 'shown')
  const hidden = shown && events.find(event => event.kind === 'hidden' && event.at >= shown.at)
  const durationMs = hidden ? hidden.at - shown.at : null
  return { durationMs, passed: durationMs !== null && durationMs >= 6200 && durationMs <= 8000 }
}

function observeNoticeLifecycle() {
  window.__runnerNarrativeNotices = []
  let visibleNode = null
  new MutationObserver(() => {
    const node = document.querySelector('.runner-discovery')
    if (node === visibleNode) return
    if (visibleNode) window.__runnerNarrativeNotices.push({ kind: 'hidden', at: performance.now() })
    visibleNode = node
    if (node) {
      let debug = null
      try { debug = window.__shadowRunnerDebug?.() ?? null } catch { /* Observation only. */ }
      window.__runnerNarrativeNotices.push({ kind: 'shown', at: performance.now(), title: node.textContent, player: debug?.player, activeTimeMs: debug?.activeTimeMs })
    }
  }).observe(document, { childList: true, subtree: true })
}

function readNoticeLayout() {
  const notice = document.querySelector('.runner-discovery')
  if (!notice) return null
  const rect = element => {
    const bounds = element.getBoundingClientRect()
    return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height }
  }
  const bounds = rect(notice)
  const span = notice.querySelector('span') ?? notice
  const range = document.createRange()
  range.selectNodeContents(span)
  const textRects = [...range.getClientRects()].map(box => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom }))
  const obstacles = [...document.querySelectorAll('.runner-status-strip, .runner-objectives > *, .runner-powers > *, .runner-pause, .runner-controls button')]
    .filter(element => element.getBoundingClientRect().width > 0)
    .map(element => ({ label: element.getAttribute('aria-label') ?? element.className, rect: rect(element) }))
  const hitTests = [0.15, 0.5, 0.85].flatMap(horizontal => [0.25, 0.75].map(vertical => {
    const x = bounds.left + bounds.width * horizontal
    const y = bounds.top + bounds.height * vertical
    return { x, y, notice: notice.contains(document.elementFromPoint(x, y)) }
  }))
  return { rect: bounds, viewport: { width: innerWidth, height: innerHeight }, textRects, obstacles, hitTests, fontSize: Number.parseFloat(getComputedStyle(span).fontSize), color: getComputedStyle(notice).color, background: getComputedStyle(notice).backgroundColor }
}

export function safeNarrativeUrl(url) {
  try {
    const value = new URL(url)
    return ['http:', 'https:', 'ws:', 'wss:'].includes(value.protocol) ? `${value.origin}${value.pathname}` : '[non-network URL]'
  } catch { return '[invalid URL]' }
}

const textUrls = text => [...String(text).matchAll(/(?:https?|wss?):\/\/[^\s<>"'`]+/gi)].map(match => safeNarrativeUrl(match[0]))
export const sanitizeNarrativeText = text => String(text)
  .replace(/(?:https?|wss?):\/\/[^\s<>"'`]+/gi, safeNarrativeUrl)
  .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, '$1 [redacted]')
  .replace(/\b((?:authorization|apikey|api_key|access_token|refresh_token|token|password|client_secret)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
const safeUrl = safeNarrativeUrl
const sanitize = sanitizeNarrativeText

export function createNarrativeTimeline(now = () => performance.now(), epochMs = Date.now()) {
  const started = now()
  const events = []
  const requests = new WeakMap()
  let nextRequestId = 1
  let phase = 'setup'
  const emit = (kind, details = {}) => {
    const elapsedMs = Math.round((now() - started) * 1000) / 1000
    const event = { sequence: events.length + 1, kind, phase, elapsedMs, timestamp: new Date(epochMs + elapsedMs).toISOString() }
    // Explicit allowlist: never persist headers, bodies, cookies or arbitrary event objects.
    if (details.url !== undefined) event.url = safeUrl(details.url)
    for (const key of ['method', 'resourceType', 'message', 'name', 'stack', 'error', 'visibilityState']) {
      if (details[key] !== undefined) event[key] = sanitize(details[key])
    }
    for (const key of ['requestId', 'status', 'browserEpochMs', 'requestStartEpochMs', 'line', 'column']) {
      if (Number.isFinite(details[key])) event[key] = details[key]
    }
    for (const key of ['isNavigationRequest', 'persisted']) if (typeof details[key] === 'boolean') event[key] = details[key]
    if (details.urls) event.urls = [...new Set(details.urls.map(safeUrl))]
    events.push(event)
    return event
  }
  return {
    events, emit,
    phase(next) { phase = next; return emit('phase') },
    request(kind, request, details = {}) {
      if (!requests.has(request)) requests.set(request, nextRequestId++)
      let startTime
      try { startTime = request.timing().startTime } catch { /* A destroyed frame may no longer expose timing. */ }
      return emit(kind, { ...details, requestId: requests.get(request), url: request.url(), method: request.method(),
        resourceType: request.resourceType(), isNavigationRequest: request.isNavigationRequest(), requestStartEpochMs: startTime })
    },
    pageError(error) {
      return emit('pageerror', { message: error.message, name: error.name, stack: error.stack,
        urls: textUrls(`${error.name}\n${error.message}\n${error.stack ?? ''}`) })
    },
  }
}

export function correlateNarrativeErrors(events, windowMs = 2000) {
  return events.filter(event => event.kind === 'pageerror').map(error => {
    const nearby = events.filter(event => event.requestId && error.urls?.includes(event.url)
      && Math.abs(event.elapsedMs - error.elapsedMs) <= windowMs)
    return {
      errorSequence: error.sequence, urls: error.urls ?? [], windowMs,
      basis: 'Exact sanitized URL within the host-clock window; temporal candidates only, not proof of causation.',
      requests: [...new Set(nearby.map(event => event.requestId))].map(requestId => ({
        requestId, events: events.filter(event => event.requestId === requestId).map(event => ({
          sequence: event.sequence, kind: event.kind, phase: event.phase, url: event.url,
          elapsedMs: event.elapsedMs, errorDeltaMs: Math.round((event.elapsedMs - error.elapsedMs) * 1000) / 1000,
        })),
      })),
    }
  })
}

export function observeNarrativePageLifecycle() {
  const emit = (kind, details = {}) => {
    void window.__runnerNarrativeRecord({ kind, ...details, browserEpochMs: performance.timeOrigin + performance.now(),
      url: location.href, visibilityState: document.visibilityState }).catch(() => {})
  }
  document.addEventListener('visibilitychange', () => emit('visibilitychange'))
  window.addEventListener('pagehide', event => emit('pagehide', { persisted: event.persisted }))
  window.addEventListener('pageshow', event => emit('pageshow', { persisted: event.persisted }))
  window.addEventListener('error', event => emit('window-error', { message: event.message, line: event.lineno, column: event.colno }))
  window.addEventListener('unhandledrejection', event => emit('unhandledrejection', {
    message: typeof event.reason === 'string' ? event.reason : event.reason?.message ?? '[non-Error rejection]',
  }))
  emit('observer-ready')
}
const click = (page, name) => page.getByRole('button', { name, exact: true }).click()
const debug = page => page.evaluate(() => window.__shadowRunnerDebug?.() ?? null)
const readProgress = page => page.evaluate(key => {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null') } catch { return null }
}, GUEST_KEY)

async function collectResources(page, result) {
  const entries = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/games/shadow-runner/')).map(entry => ({ navigation: performance.timeOrigin, startTime: entry.startTime, path: new URL(entry.name).pathname, bytes: entry.encodedBodySize, duration: entry.duration }))).catch(() => [])
  const resources = new Map([...result.resources, ...entries].map(entry => [`${entry.navigation}:${entry.startTime}:${entry.path}`, entry]))
  result.resources = [...resources.values()]
}

async function blockedKeys(page) {
  for (const key of ['w', 'j', 'ArrowRight']) await page.keyboard.down(key)
  await page.waitForTimeout(100)
  for (const key of ['w', 'j', 'ArrowRight']) await page.keyboard.up(key)
}

async function neutralSamples(page) {
  return page.evaluate(() => new Promise(resolve => {
    const startedAt = performance.now()
    const samples = []
    const step = () => {
      samples.push(window.__shadowRunnerDebug?.() ?? null)
      if (performance.now() - startedAt < 350) requestAnimationFrame(step)
      else resolve(samples)
    }
    requestAnimationFrame(step)
  }))
}

async function walkToFirstNote(page) {
  await page.keyboard.down('ArrowRight')
  try { await page.waitForFunction(() => (window.__shadowRunnerDebug?.()?.player?.x ?? 0) >= 320, undefined, { timeout: 8000 }) }
  finally { await page.keyboard.up('ArrowRight') }
  await page.waitForTimeout(100)
}

async function startTutorial(page) {
  await click(page, 'Start Tutorial')
  await page.getByRole('button', { name: 'Begin delivery', exact: true }).waitFor({ timeout: 45000 })
  await click(page, 'Begin delivery')
  await page.getByRole('button', { name: 'Move right', exact: true }).waitFor()
  await page.waitForTimeout(350)
}

async function quitToTitle(page) {
  await click(page, 'Open pause menu')
  await click(page, 'Quit Level')
  await click(page, 'Main Menu')
  await page.getByRole('button', { name: 'Start Tutorial', exact: true }).waitFor()
  await page.waitForTimeout(300)
}

async function ordinaryCase(page, scenario, record, capture, markPhase) {
  markPhase('ordinary-before-reload')
  await click(page, 'Options')
  for (const name of ['Music', 'Sound effects']) {
    const control = page.getByRole('checkbox', { name, exact: true })
    if (await control.isChecked()) await control.uncheck()
  }
  await page.getByRole('dialog', { name: 'Options', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
  await startTutorial(page)
  const initial = await debug(page)
  await walkToFirstNote(page)
  await page.locator('.runner-discovery').waitFor()
  const reached = await debug(page)
  const events = await page.evaluate(() => window.__runnerNarrativeNotices)
  const first = events.find(event => event.kind === 'shown')
  record('first discovery follows ordinary movement into the x300 landmark', initial?.player?.x < 300 && first?.player?.x >= 296 && first?.player?.x <= 464 && first?.player?.bodyBottom >= 366 && first?.player?.bodyBottom <= 440 && first?.title?.trim() === FIRST_NOTE.title, { initial, reached, events })
  const layout = await page.evaluate(readNoticeLayout)
  const readability = assessNoticeLayout(layout)
  record('notice is readable, unclipped and separate from HUD/control targets', Object.values(readability).every(Boolean), { readability, layout }, 'notice-layout')
  await capture('first-note-notice')
  const persisted = await readProgress(page)
  record('only the reached note persists, without fake completion or medal work', isStoryOnlyProgress(persisted), persisted, 'persistence')

  if (scenario === 'notice-expiry') {
    await page.waitForFunction(() => window.__runnerNarrativeNotices.some(event => event.kind === 'hidden'), undefined, { timeout: 9000 })
    const duration = assessNoticeDuration(await page.evaluate(() => window.__runnerNarrativeNotices))
    record('notice remains for approximately 6.5 seconds then expires', duration.passed, duration, 'notice-lifetime')
    const expired = await debug(page)
    record('notice is nonblocking and leaves the stationary courier unharmed', expired.activeTimeMs - reached.activeTimeMs >= 5000 && expired.player.health === reached.player.health && expired.player.lives === reached.player.lives && Math.abs(expired.player.x - reached.player.x) <= 3, { reached, expired })
    await capture('notice-expired')
    await quitToTitle(page)
  } else {
    const journalContents = async label => {
      const dialog = page.getByRole('dialog', { name: 'Courier journal', exact: true })
      await dialog.waitFor()
      const reachedCount = await dialog.getByText(FIRST_NOTE.body, { exact: true }).count()
      const unreachedCount = await dialog.getByText(SECOND_NOTE.body, { exact: true }).count()
      const unreachedTitle = await dialog.getByRole('heading', { name: SECOND_NOTE.title, exact: true }).count()
      const dispatchCount = await dialog.getByText(TUTORIAL_DISPATCH, { exact: true }).count()
      record(`${label}: exact reached note, no unreached note or unearned dispatch`, reachedCount === 1 && unreachedCount === 0 && unreachedTitle === 0 && dispatchCount === 0, { reachedCount, unreachedCount, unreachedTitle, dispatchCount }, 'earned-journal')
      await dialog.getByText(FIRST_NOTE.body, { exact: true }).scrollIntoViewIfNeeded()
    }
    const frozen = async label => {
      await page.waitForTimeout(120)
      const before = await debug(page)
      await blockedKeys(page)
      await page.waitForTimeout(400)
      const after = await debug(page)
      record(label, Boolean(before?.player) && JSON.stringify(stableState(before)) === JSON.stringify(stableState(after)), { before, after }, 'pause-input')
      return after
    }
    const resumesCleanly = async (label, before) => {
      const samples = await neutralSamples(page)
      const result = assessPhantom(before, samples)
      const clockDelta = samples.at(-1)?.activeTimeMs - before.activeTimeMs
      record(label, result.valid && result.attackDelta === 0 && result.rise <= 8 && result.horizontalDrift <= 3 && clockDelta > 0 && clockDelta < 1200, { ...result, clockDelta, before, samples }, 'pause-input')
    }
    await page.locator('.runner-discovery').click()
    await journalContents('notice opens journal')
    const beforeResume = await frozen('notice journal pauses scene, health and active clock')
    await capture('notice-journal-paused')
    await page.getByRole('dialog', { name: 'Courier journal', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
    await resumesCleanly('closing notice journal does not replay keys or catch up paused time', beforeResume)
    await click(page, 'Open pause menu')
    await click(page, 'Courier journal')
    await journalContents('pause journal before reload')
    const paused = await frozen('pause journal retains suspension')
    await capture('pause-journal')
    await page.getByRole('dialog', { name: 'Courier journal', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
    await click(page, 'Resume')
    await resumesCleanly('pause journal Resume has no phantom action', paused)
    await quitToTitle(page)
    await click(page, 'Select Level')
    await click(page, 'Courier journal')
    await journalContents('campaign journal before reload')
    await capture('campaign-journal')
    markPhase('reload-pending')
    await page.reload({ waitUntil: 'domcontentloaded' })
    markPhase('reload-domcontentloaded')
    await page.getByRole('button', { name: 'Start Tutorial', exact: true }).waitFor({ timeout: 30000 })
    markPhase('reloaded-title-ready')
    record('earned note survives reload without completion records', isStoryOnlyProgress(await readProgress(page)), await readProgress(page), 'persistence')
    await click(page, 'Select Level')
    await click(page, 'Courier journal')
    await journalContents('campaign journal after reload')
    await capture('campaign-journal-after-reload')
    await page.getByRole('dialog', { name: 'Courier journal', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
    await click(page, 'Back to Shadow Runner menu')
    await startTutorial(page)
    await click(page, 'Open pause menu')
    await click(page, 'Courier journal')
    await journalContents('pause journal after reload')
    await capture('pause-journal-after-reload')
    await page.getByRole('dialog', { name: 'Courier journal', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
    await click(page, 'Resume')
    await walkToFirstNote(page)
    record('revisiting an earned landmark does not duplicate its notice or save', await page.locator('.runner-discovery').count() === 0 && isStoryOnlyProgress(await readProgress(page)), { progress: await readProgress(page), notices: await page.evaluate(() => window.__runnerNarrativeNotices) }, 'persistence')
    await quitToTitle(page)
  }
  const teardown = await page.evaluate(readDebugState)
  record('exit removes canvas and scene references', await page.locator('canvas').count() === 0 && !teardown.debugRegistered, teardown, 'teardown')
}

// These scenes cannot contribute ordinary-play evidence or fabricated campaign unlocks.
async function waypostDiagnostic(page, levelId, options, record, capture) {
  const target = levelId === 'tutorial'
    ? { id: 'courtyard-sentry-checkpoint', x: 2010, floorY: 432 }
    : { id: 'causeway-final-archers', x: 8960, floorY: 616 }
  await page.goto(`${options.baseUrl}${DIAGNOSTIC_PATH}?localPreview=shadow-runner`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async ({ moduleUrl, level }) => {
    const runtime = await import(moduleUrl)
    const input = { current: { left: false, right: false, jump: false, attack: false, crouch: level === 'level-7', jumpPresses: 0, attackPresses: 0 } }
    window.__runnerWaypostReady = false
    window.__runnerWaypostGame = runtime.createShadowRunnerPhaserGame({
      parent: document.getElementById('stage'), levelId: level, input, startPaused: true, reducedMotion: true,
      onHudChange: () => {}, onReady: () => { window.__runnerWaypostReady = true },
      onLoadError: error => { window.__runnerWaypostError = error.message },
    })
  }, { moduleUrl: `${options.baseUrl}/assets/createShadowRunnerPhaserGame-${options.runtimeHash}.js`, level: levelId })
  await page.waitForFunction(() => window.__runnerWaypostReady || window.__runnerWaypostError, undefined, { timeout: 45000 })
  const loadError = await page.evaluate(() => window.__runnerWaypostError)
  if (loadError) throw new Error(loadError)
  const initial = await debug(page)
  const inactive = initial.wayposts?.find(post => post.id === target.id)
  record('diagnostic waypost exposes finite nonzero geometry', Boolean(inactive) && ['x', 'y', 'width', 'height', 'tint', 'alpha'].every(key => Number.isFinite(inactive[key])) && inactive.width > 0 && inactive.height > 0 && inactive.alpha > 0, { target, inactive }, 'waypost-diagnostic')
  await page.evaluate(({ x, floorY }) => {
    const player = window.__shadowRunnerDebug().player
    window.__shadowRunnerQa.teleport(x, floorY - (player.bodyBottom - player.y))
  }, target)
  await page.waitForTimeout(150)
  await capture('QA-teleport-inactive-waypost')
  await page.evaluate(() => window.__runnerWaypostGame.setPaused(false))
  await page.waitForTimeout(350)
  const settled = await debug(page)
  // Sprite x is not body-center x. Cross the near edge using bounded real input.
  if (settled.checkpointId !== target.id) {
    await page.keyboard.down('ArrowRight')
    try {
      await page.waitForFunction(({ id, x }) => {
        const state = window.__shadowRunnerDebug?.()
        return state?.checkpointId === id || state?.player?.x >= x + 20 || state?.respawnPending
      }, target, { timeout: 3000 })
    } finally { await page.keyboard.up('ArrowRight') }
  }
  await page.evaluate(() => window.__runnerWaypostGame.setPaused(true))
  const after = await debug(page)
  const active = after.wayposts?.find(post => post.id === target.id)
  record('diagnostic checkpoint activation changes waypost appearance', after.checkpointId === target.id && active?.alpha === 1 && active?.tint === 0xffffff && (inactive?.alpha !== active.alpha || inactive?.tint !== active.tint), { target, before: inactive, after: active, checkpointId: after.checkpointId, settled, activated: after }, 'waypost-diagnostic')
  // Art-only framing after activation: keep the courier from covering the post.
  await page.evaluate(({ x, floorY }) => window.__shadowRunnerQa.teleport(x + 64, floorY), target)
  await page.waitForTimeout(100)
  await capture('QA-teleport-active-waypost')
  record('isolated diagnostic creates no campaign progress', await readProgress(page) === null, await readProgress(page), 'diagnostic-isolation')
  await page.evaluate(() => { window.__runnerWaypostGame.destroy(true); delete window.__runnerWaypostGame })
  await page.waitForTimeout(300)
  const teardown = await page.evaluate(readDebugState)
  record('diagnostic scene is destroyed', await page.locator('canvas').count() === 0 && !teardown.debugRegistered, teardown, 'teardown')
}

export async function runNarrativeSmoke(argv) {
  const options = parseNarrativeOptions(argv)
  const output = path.resolve('output/playwright', options.runName)
  await mkdir(path.dirname(output), { recursive: true })
  await mkdir(output) // Refuse to overwrite an earlier acceptance report.
  const report = {
    options, startedAt: new Date().toISOString(), results: [],
    ordinaryMethod: 'Fresh guest contexts; ordinary keyboard movement and UI actions only. Read-only scene and storage observations; no injected completions, discoveries or unlocks.',
    networkMethod: 'Passive request/error/lifecycle observation. Host-monotonic elapsedMs and anchored UTC timestamp share one case clock; browserEpochMs is separate browser event time. Request IDs correlate exact request objects. No fetch replacement, error suppression or automatic exemption. URLs omit credentials/query/fragment; structured logs omit headers and bodies.',
    traceMethod: 'Screenshots/actions only; DOM/HAR snapshots disabled to avoid recording request credentials. Sanitized requestTimeline is the network evidence.',
    diagnosticMethod: options.waypostDiagnostics ? 'Separate runtime stages with a hidden root required by the bundled app bootstrap; QA teleport, scene pause and bounded real ArrowRight crossing, with crouched L7 input. A second paused teleport clears the courier from the active post for art framing. Never route traversal, journal earning, unlock or gameplay proof.' : 'Disabled',
    limitations: ['Browser automation is not physical-device certification.', 'Notice timing uses a bounded tolerance, not a performance claim.', 'Guest-local persistence only; no authenticated profile or remote data.', 'Waypost screenshots require visual review; geometry metadata alone cannot certify rendered art.'],
  }
  const save = () => writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
  for (const profile of NARRATIVE_PROFILES.filter(item => !options.profile || item.name === options.profile)) {
    const browser = await ({ chromium, webkit })[profile.browser].launch({ headless: true })
    try {
      const ordinary = options.scenario === 'all' ? ['notice-expiry', 'earned-journal'] : options.scenario === 'wayposts' ? [] : [options.scenario]
      const cases = [...ordinary, ...(options.waypostDiagnostics ? ['waypost-tutorial', 'waypost-level-7'] : [])]
      for (const scenario of cases) {
        const diagnostic = scenario.startsWith('waypost-')
        const result = { profile: profile.name, scenario, evidenceKind: diagnostic ? 'QA-assisted-art-diagnostic' : 'ordinary-UI', startedAt: new Date().toISOString(), checks: [], console: [], pageErrors: [], blockedRequests: [], blockedWebSockets: [], requestFailures: [], runtimeBundles: [], gamesHomeBundles: [], screenshots: [], snapshots: [], resources: [] }
        const timeline = createNarrativeTimeline()
        result.requestTimeline = timeline.events
        report.results.push(result)
        const context = await browser.newContext({ viewport: profile.viewport, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
        try {
          context.on('request', request => timeline.request('request', request))
          context.on('response', response => timeline.request('response', response.request(), { status: response.status() }))
          context.on('requestfinished', request => timeline.request('requestfinished', request))
          context.on('requestfailed', request => {
            const event = timeline.request('requestfailed', request, { error: request.failure()?.errorText })
            result.requestFailures.push({ url: event.url, error: event.error })
          })
          await context.route('**/*', async route => {
            const request = route.request()
            timeline.request('route-observed', request)
            if (!allowRequest(request.url(), request.method(), options.baseUrl)) {
              result.blockedRequests.push({ url: safeUrl(request.url()), method: request.method() })
              timeline.request('route-abort-requested', request, { error: 'blockedbyclient' })
              try {
                await route.abort('blockedbyclient')
                timeline.request('route-abort-completed', request, { error: 'blockedbyclient' })
              } catch (error) {
                timeline.request('route-abort-failed', request, { error: error.message })
                throw error
              }
              return
            }
            if (diagnostic && new URL(request.url()).pathname === DIAGNOSTIC_PATH) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#stage{margin:0;width:100%;height:100%;background:#050b11}#label{position:fixed;top:0;left:0;z-index:9;background:#050b11;color:white;font:12px sans-serif;padding:6px}</style></head><body><div id="root" hidden></div><div id="stage"></div><div id="label">QA-assisted waypost art diagnostic. Not gameplay proof.</div></body></html>' })
            return route.continue()
          })
          await context.routeWebSocket(/.*/, socket => {
            result.blockedWebSockets.push(safeUrl(socket.url()))
            timeline.emit('websocket-blocked', { url: socket.url() })
            socket.close({ code: 1000, reason: 'Local narrative QA only' })
          })
          await context.exposeBinding('__runnerNarrativeRecord', (_source, event) => {
            if (event && ['observer-ready', 'visibilitychange', 'pagehide', 'pageshow', 'window-error', 'unhandledrejection'].includes(event.kind)) timeline.emit(event.kind, event)
          })
          await context.addInitScript(observeNarrativePageLifecycle)
          if (!diagnostic) await context.addInitScript(observeNoticeLifecycle)
          const page = await context.newPage()
          page.setDefaultTimeout(12000)
          page.on('console', message => {
            result.console.push({ type: message.type(), text: sanitize(message.text()) })
            timeline.emit('console', { name: message.type(), message: message.text(), urls: textUrls(message.text()) })
          })
          page.on('pageerror', error => {
            result.pageErrors.push(sanitize(error.message))
            timeline.pageError(error)
          })
          page.on('framenavigated', frame => {
            if (frame === page.mainFrame()) timeline.emit('main-frame-navigated', { url: frame.url() })
          })
          page.on('domcontentloaded', () => timeline.emit('domcontentloaded', { url: page.url() }))
          page.on('response', response => {
            const pathname = new URL(response.url()).pathname
            if (/\/assets\/createShadowRunnerPhaserGame-[^/]+\.js$/.test(pathname) && !result.runtimeBundles.includes(pathname)) result.runtimeBundles.push(pathname)
            if (/\/assets\/GamesHome-[^/]+\.js$/.test(pathname) && !result.gamesHomeBundles.includes(pathname)) result.gamesHomeBundles.push(pathname)
          })
          await context.tracing.start({ screenshots: true, snapshots: false, sources: false })
          const record = (name, passed, details, category = 'narrative') => {
            result.checks.push({ name, passed: Boolean(passed), category, details })
            console.log(`${profile.name} ${scenario} ${passed ? 'PASS' : 'FAIL'} ${name}`)
          }
          const capture = async name => {
            const filename = `${profile.name}-${scenario}-${name}.png`
            await page.screenshot({ path: path.join(output, filename) })
            result.screenshots.push(filename)
            result.snapshots.push({ name, scene: await page.evaluate(readDebugState), progress: await readProgress(page), noticeLayout: await page.evaluate(readNoticeLayout) })
            await collectResources(page, result)
          }
          try {
            timeline.phase('initial-navigation')
            if (diagnostic) await waypostDiagnostic(page, scenario.slice('waypost-'.length), options, record, capture)
            else {
              await page.goto(`${options.baseUrl}/?view=games&localPreview=shadow-runner`, { waitUntil: 'domcontentloaded' })
              await page.getByRole('button', { name: 'Start Tutorial', exact: true }).waitFor({ timeout: 30000 })
              await ordinaryCase(page, scenario, record, capture, phase => timeline.phase(phase))
            }
          } catch (error) {
            record('scenario completed', false, { error: sanitize(error.message) }, 'harness-or-ui-blocker')
            await capture('failure').catch(() => {})
          } finally {
            record('confirmed runtime bundle was actually loaded', result.runtimeBundles.includes(`/assets/createShadowRunnerPhaserGame-${options.runtimeHash}.js`) && result.runtimeBundles.length === 1, result.runtimeBundles, 'build-identity')
            if (!diagnostic) record('confirmed GamesHome bundle was actually loaded', result.gamesHomeBundles.includes(`/assets/GamesHome-${options.gamesHomeHash}.js`) && result.gamesHomeBundles.length === 1, result.gamesHomeBundles, 'build-identity')
            record('no unhandled page errors', result.pageErrors.length === 0, result.pageErrors, 'runtime-error')
            await collectResources(page, result)
            result.resourceSummary = summarizeResources(result.resources)
            result.status = result.checks.every(check => check.passed) ? 'passed' : 'failed'
            result.finishedAt = new Date().toISOString()
            await context.tracing.stop({ path: path.join(output, `${profile.name}-${scenario}-trace.zip`) }).catch(() => {})
          }
        } finally {
          timeline.phase('context-close')
          await context.close()
          timeline.emit('context-closed')
          result.requestErrorCorrelations = correlateNarrativeErrors(timeline.events)
          const pageErrorCheck = result.checks.find(check => check.category === 'runtime-error')
          if (pageErrorCheck) pageErrorCheck.passed = result.pageErrors.length === 0
          result.status = result.checks.length > 0 && result.checks.every(check => check.passed) ? 'passed' : 'failed'
          result.finishedAt = new Date().toISOString()
          await save()
        }
      }
    } finally { await browser.close() }
  }
  const ordinary = report.results.filter(result => result.evidenceKind === 'ordinary-UI')
  const diagnostics = report.results.filter(result => result.evidenceKind !== 'ordinary-UI')
  report.ordinaryPassed = ordinary.length ? ordinary.every(result => result.status === 'passed') : null
  report.diagnosticsPassed = diagnostics.length ? diagnostics.every(result => result.status === 'passed') : null
  report.finishedAt = new Date().toISOString()
  await save()
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await runNarrativeSmoke(process.argv.slice(2))
  if (report.ordinaryPassed === false || report.diagnosticsPassed === false) process.exitCode = 1
}

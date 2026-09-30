import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { makeGuestSeed, mayRequest } from './shadow-runner-route-proof.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FOOT_HALF_WIDTH = 42 * 0.78 / 2
const ACTIONS = [
  ['idle', [], 0.5], ['walk-right', ['ArrowRight'], 0.3], ['crouch-left', ['KeyS', 'ArrowLeft'], 0.7],
  ['walk-left', ['ArrowLeft'], 0.7], ['crouch-right', ['KeyS', 'ArrowRight'], 0.3], ['jump', ['Space'], 0.5],
]
export const CASES = [
  { level: 'level-7', title: 'Moonlit Causeway', bridge: 'causeway-final-tilt' },
  { level: 'level-8', title: 'Courier Catacombs', bridge: 'catacomb-tilt-descent' },
  { level: 'level-9', title: 'Captain Gate', bridge: 'captain-tilt-outer' },
  { level: 'level-10', title: 'Dawn Relay Spire', bridge: 'relay-tilt-approach' },
]

export function parseOptions(argv) {
  const args = Object.fromEntries(argv.map(arg => {
    const match = /^--([a-z-]+)=(.+)$/.exec(arg)
    assert(match, `Invalid argument ${arg}`)
    return [match[1], match[2]]
  }))
  assert(Object.keys(args).every(key => ['base-url', 'runtime-hash', 'games-hash', 'browser-ready', 'run-name', 'profiles', 'fps', 'levels', 'actions', 'npc-isolation'].includes(key)), 'Unknown option')
  assert(args['browser-ready'] === 'true', 'Wait for exclusive browser handoff: --browser-ready=true')
  for (const key of ['runtime-hash', 'games-hash']) assert(/^[A-Za-z0-9_-]{8,64}$/.test(args[key] ?? ''), `Main must supply fresh ${key}`)
  const url = new URL(args['base-url'] ?? 'http://127.0.0.1:4176')
  assert(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash, 'Requires plain loopback HTTP preview')
  const runName = args['run-name'] ?? `runner-tilt-${Date.now()}`
  assert(/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(runName), 'Unsafe run directory')
  const profiles = (args.profiles ?? 'chromium,webkit').split(',')
  const fps = (args.fps ?? '60,30').split(',').map(Number)
  const levels = (args.levels ?? CASES.map(item => item.level).join(',')).split(',')
  const actions = (args.actions ?? ACTIONS.map(item => item[0]).join(',')).split(',')
  const npcIsolation = args['npc-isolation'] ?? 'none'
  assert(['none', 'nearby'].includes(npcIsolation), 'NPC isolation must be none or nearby')
  assert(profiles.length && profiles.every(item => ['chromium', 'webkit'].includes(item)), 'Unknown engine')
  assert(fps.length && fps.every(item => [30, 60].includes(item)), 'FPS must be 30 or 60')
  assert(levels.length && levels.every(item => CASES.some(test => test.level === item)), 'Unknown diagnostic level')
  assert(actions.length && actions.every(item => ACTIONS.some(test => test[0] === item)), 'Unknown diagnostic action')
  for (const list of [profiles, fps, levels, actions]) assert.equal(new Set(list).size, list.length, 'Duplicate selection')
  return { baseUrl: url.origin, runtimeHash: args['runtime-hash'], gamesHash: args['games-hash'], runName, profiles, fps, levels, actions, npcIsolation }
}

export function selectNearbyEnemies(debug, bridgeId, padding = 1200) {
  const bridge = debug?.tiltBridges?.bridges.find(item => item.id === bridgeId)
  assert(bridge && Array.isArray(debug.enemies), 'Missing NPC isolation snapshot')
  const left = bridge.left.x - padding
  const right = bridge.right.x + padding
  return debug.enemies.filter(enemy => enemy.alive && (
    enemy.x >= left && enemy.x <= right
    || Number.isFinite(enemy.patrolLeft) && Number.isFinite(enemy.patrolRight)
      && enemy.patrolRight >= left && enemy.patrolLeft <= right
  )).map(enemy => ({ id: enemy.id, kind: enemy.kind, x: enemy.x, health: enemy.health,
    patrolLeft: enemy.patrolLeft, patrolRight: enemy.patrolRight }))
}

// Every mutation is persisted before execution. An action cannot reopen setup,
// and each setup permits only one initial teleport, never a corrective teleport.
export function createSetupGate(execute, record) {
  let phase = 'closed'
  let label
  let teleported = false
  return {
    async beginSetup(nextLabel) {
      assert(phase === 'closed', 'Finish current phase before new setup')
      phase = 'setup'
      label = nextLabel
      teleported = false
      await record({ phase, label, event: 'begin' })
    },
    async mutate(operation, payload) {
      assert(phase === 'setup', 'QA mutations are setup-only')
      assert(['teleport', 'defeatEnemy'].includes(operation), 'Unauthorized QA mutation')
      assert(!teleported, 'No mutations after the initial teleport')
      if (operation === 'teleport') teleported = true
      await record({ phase, label, event: 'mutation-request', operation, payload })
      const outcome = await execute(operation, payload)
      await record({ phase, label, event: 'mutation-result', operation, outcome })
      return outcome
    },
    async startAction() {
      assert(phase === 'setup' && teleported, 'Action needs one documented setup teleport')
      phase = 'action'
      await record({ phase, label, event: 'begin' })
    },
    async finish() {
      await record({ phase, label, event: 'end' })
      phase = 'closed'
    },
  }
}

export async function verifyBuild(options) {
  const bundles = []
  for (const name of [`createShadowRunnerPhaserGame-${options.runtimeHash}.js`, `GamesHome-${options.gamesHash}.js`]) {
    const local = await readFile(path.join(ROOT, 'dist/assets', name))
    const response = await fetch(`${options.baseUrl}/assets/${name}`, { redirect: 'error', signal: AbortSignal.timeout(15000) })
    assert(response.ok, `Missing served bundle ${name}`)
    const served = Buffer.from(await response.arrayBuffer())
    assert(local.equals(served), `Preview differs from local dist: ${name}`)
    bundles.push({ name, sha256: createHash('sha256').update(served).digest('hex'), bytes: served.length })
  }
  return bundles
}

// Browser-only frame delivery cap. Native timestamps and physics clocks remain
// untouched. All callbacks in the same delivered frame run; cancellation works.
export function installRafCap(fps) {
  if (fps !== 30) return
  const nativeRequest = window.requestAnimationFrame.bind(window)
  const nativeCancel = window.cancelAnimationFrame.bind(window)
  let sequence = 0
  let delivered = -Infinity
  const pending = new Map()
  window.requestAnimationFrame = callback => {
    const id = ++sequence
    const tick = timestamp => {
      if (!pending.has(id)) return
      if (timestamp === delivered || timestamp - delivered >= 1000 / fps - 0.5) {
        delivered = timestamp
        pending.delete(id)
        callback(timestamp)
      } else pending.set(id, nativeRequest(tick))
    }
    pending.set(id, nativeRequest(tick))
    return id
  }
  window.cancelAnimationFrame = id => {
    if (pending.has(id)) nativeCancel(pending.get(id))
    pending.delete(id)
  }
}

export function assessContact(sample, bridgeId) {
  const bridge = sample?.tiltBridges?.bridges.find(item => item.id === bridgeId)
  const player = sample?.player
  if (!bridge || !player) return { valid: false }
  const support = sample.tiltBridges.playerSupport
  const left = player.x - FOOT_HALF_WIDTH
  const right = player.x + FOOT_HALF_WIDTH
  const overlap = Math.min(right, bridge.right.x) - Math.max(left, bridge.left.x)
  const supported = support?.bridgeId === bridgeId
  const slope = (bridge.right.y - bridge.left.y) / (bridge.right.x - bridge.left.x)
  const contactX = slope >= 0 ? Math.max(left, bridge.left.x) : Math.min(right, bridge.right.x)
  const idealY = bridge.left.y + (contactX - bridge.left.x) * slope
  return {
    valid: true, supported, overlap, interior: left > bridge.left.x + 1 && right < bridge.right.x - 1,
    capGap: supported ? player.bodyBottom - support.surfaceY : null,
    idealGap: overlap > 0 ? player.bodyBottom - idealY : null,
    falseGround: supported && overlap < -0.6,
    // Player x/feet are rounded by the existing getter: allow its 0.5px error.
    contactMismatch: supported && Math.abs(player.bodyBottom - support.surfaceY) > 0.51,
    activeBodies: sample.tiltBridges.activeBodyCount,
  }
}

export function assessTrace(samples, bridgeId, action, observation) {
  const contacts = samples.map(sample => assessContact(sample, bridgeId))
  const supported = contacts.filter(contact => contact.supported)
  const firstSupport = contacts.findIndex(contact => contact.supported)
  const exitIndex = contacts.findIndex((contact, index) => index > firstSupport && firstSupport >= 0 && !contact.supported)
  const exit = exitIndex < 0 ? null : { index: exitIndex, ...contacts[exitIndex], sample: samples[exitIndex] }
  const elapsed = samples.length > 1 ? samples.at(-1).wallTime - samples[0].wallTime : 0
  const initial = samples[0]?.player
  const interruptionIndex = samples.findIndex(sample => sample?.respawnPending
    || sample?.player?.health < initial?.health || sample?.player?.lives < initial?.lives)
  const interrupted = interruptionIndex >= 0
  const checks = {
    observed: samples.length >= 3 && contacts.every(contact => contact.valid),
    uninterrupted: !interrupted,
    budget: contacts.every(contact => contact.activeBodies >= 0 && contact.activeBodies <= 512),
    noFalseGround: contacts.every(contact => !contact.falseGround),
    feetMatchConfirmedCap: supported.length > 0 && supported.every(contact => !contact.contactMismatch),
  }
  if (observation) checks.observationCompleted = ['active-duration', 'contact-exit'].includes(observation.stopReason)
  if (action === 'jump') {
    const risingIndex = samples.findIndex((sample, index) => index > firstSupport && firstSupport >= 0
      && !contacts[index].supported && sample.player?.velocityY < -100)
    checks.jumped = risingIndex >= 0
    checks.airborne = risingIndex >= 0
    checks.relanded = risingIndex >= 0 && contacts.slice(risingIndex + 1).some(contact => contact.supported)
  } else {
    checks.noMidDeckDrop = interrupted ? null : !exit || !exit.interior
    if (action !== 'idle') checks.literalEndExit = Boolean(exit && exit.overlap <= 0.6)
  }
  return { passed: Object.values(checks).every(Boolean), interrupted, interruptionIndex, checks, sampleCount: samples.length,
    wallElapsedMs: elapsed,
    activeElapsedMs: samples.length > 1 ? samples.at(-1).activeTimeMs - samples[0].activeTimeMs : 0,
    observedFps: observation?.observedFps ?? (elapsed > 0 ? (samples.length - 1) * 1000 / elapsed : null),
    maxCapGap: supported.length ? Math.max(...supported.map(contact => Math.abs(contact.capGap))) : null,
    maxIdealGap: supported.length ? Math.max(...supported.map(contact => Math.abs(contact.idealGap))) : null,
    maxActiveBodies: contacts.length ? Math.max(...contacts.map(contact => contact.activeBodies ?? 0)) : 0,
    firstExit: exit }
}

function readSample() {
  const debug = window.__shadowRunnerDebug?.()
  if (!debug?.player) return null
  const { x, y, bodyBottom, bodyTop, bodyHeight, velocityX, velocityY, crouching, health, lives } = debug.player
  return { wallTime: performance.now(), activeTimeMs: debug.activeTimeMs, respawnPending: debug.respawnPending,
    player: { x, y, bodyBottom, bodyTop, bodyHeight, velocityX, velocityY, crouching, health, lives }, tiltBridges: debug.tiltBridges,
    pools: debug.pools,
    nearbyEnemies: debug.enemies.filter(enemy => Math.abs(enemy.x - x) <= 1400).slice(0, 24),
    encounters: debug.encounters.slice(0, 32) }
}

export async function sampleReadOnly(read, { activeDurationMs, bridgeId, stopOnExit = false, stopOnSupport = false, maxWallMs = 12000 }) {
  const samples = []
  const start = performance.now()
  let initialActive
  let hadSupport = false
  let stopReason
  let frame
  await new Promise(resolve => {
    const finish = reason => {
      stopReason = reason
      clearTimeout(watchdog)
      cancelAnimationFrame(frame)
      resolve()
    }
    const watchdog = setTimeout(() => finish('wall-timeout'), maxWallMs)
    const tick = () => {
      const sample = read()
      if (!sample || !Number.isFinite(sample.activeTimeMs)) return finish('runtime-missing')
      samples.push(sample)
      initialActive ??= sample.activeTimeMs
      const supported = sample.tiltBridges?.playerSupport?.bridgeId === bridgeId
      const exited = hadSupport && !supported
      hadSupport ||= supported
      if (sample.respawnPending || sample.player.health <= 0) return finish('recovery')
      if (stopOnSupport && supported) return finish('confirmed-support')
      if (stopOnExit && exited) return finish('contact-exit')
      if (sample.activeTimeMs - initialActive >= activeDurationMs) return finish('active-duration')
      if (samples.length >= 800) return finish('sample-limit')
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  })
  const elapsed = samples.length > 1 ? samples.at(-1).wallTime - samples[0].wallTime : 0
  return { samples, stopReason, activeDurationMs, maxWallMs,
    wallElapsedMs: performance.now() - start,
    activeElapsedMs: samples.length ? samples.at(-1).activeTimeMs - initialActive : 0,
    observedFps: elapsed > 0 ? (samples.length - 1) * 1000 / elapsed : null }
}

async function collect(page, settings) {
  // Both injected functions are read-only; native clocks and game time are untouched.
  return page.evaluate(({ reader, sampler, settings }) => {
    return (0, eval)(`(${sampler})`)((0, eval)(`(${reader})`), settings)
  }, { reader: readSample.toString(), sampler: sampleReadOnly.toString(), settings })
}

async function preparePlacement(page, gate, result, dir, options, label, bridgeId, fraction = 0.5) {
  const entry = { label, bridgeId, fraction, npcIsolation: options.npcIsolation, mutations: [], passed: false }
  result.placements.push(entry)
  await gate.beginSetup(label)
  try {
    const debug = await page.evaluate(() => window.__shadowRunnerDebug())
    entry.before = await page.evaluate(readSample)
    if (options.npcIsolation === 'nearby') {
      entry.npcSelection = selectNearbyEnemies(debug, bridgeId)
      for (const enemy of entry.npcSelection) {
        const outcome = await gate.mutate('defeatEnemy', { enemyId: enemy.id, reason: 'nearby contact-diagnostic NPC isolation', bridgeId })
        entry.mutations.push({ operation: 'defeatEnemy', enemy, outcome })
        assert(outcome.enemyAfter?.alive === false, `NPC isolation failed for ${enemy.id}`)
      }
    }
    const bridge = debug.tiltBridges.bridges.find(item => item.id === bridgeId)
    entry.teleport = { x: bridge.left.x + (bridge.right.x - bridge.left.x) * fraction,
      y: Math.min(bridge.left.y, bridge.right.y) - 24 }
    await gate.mutate('teleport', entry.teleport)
    entry.observation = await collect(page, { activeDurationMs: 2000, bridgeId, stopOnSupport: true, maxWallMs: 9000 })
    entry.after = await page.evaluate(readSample)
    entry.passed = entry.observation.stopReason === 'confirmed-support'
    entry.damageObserved = entry.observation.samples.some(sample => sample.player.health < entry.before.player.health
      || sample.player.lives < entry.before.player.lives || sample.respawnPending)
    assert(entry.passed, `Placement ${label}: ${entry.observation.stopReason}`)
    assert(!entry.damageObserved, `Placement ${label}: damage/recovery interrupted setup`)
    return entry
  } finally {
    await writeFile(path.join(dir, `${label}-placement.json`), JSON.stringify(entry, null, 2), { flag: 'wx' })
  }
}

async function launchLevel(page, test, navigate = true) {
  const click = name => page.getByRole('button', { name, exact: typeof name === 'string' }).click()
  if (navigate) await page.goto('/?view=games&localPreview=shadow-runner', { waitUntil: 'domcontentloaded' })
  await click('Select Level')
  await click(new RegExp(`^${test.title} details`))
  await click(/^(Start|Replay)$/)
  await page.waitForFunction(level => window.__shadowRunnerDebug?.().levelId === level, test.level, { timeout: 45000 })
  await click('Begin delivery')
  await page.getByRole('button', { name: 'Move right', exact: true }).waitFor()
  await page.locator('canvas').click({ position: { x: 180, y: 100 } })
}

async function runCase(browser, options, profile, fps, test, output, bundles) {
  const id = `${profile}-${fps}-${test.level}`
  const dir = path.join(output, id)
  await mkdir(dir)
  const result = { id, profile, fpsTarget: fps, level: test.level, bridge: test.bridge, passed: true,
    actions: [], screenshots: [], errors: [], blockedRequests: [], loadedBundles: [], lifecycle: {}, neighborhoods: [],
    placements: [], failures: [], npcIsolation: options.npcIsolation }
  const context = await browser.newContext({ baseURL: options.baseUrl,
    viewport: profile === 'webkit' ? { width: 740, height: 390 } : { width: 932, height: 430 },
    isMobile: true, hasTouch: true, serviceWorkers: 'block', acceptDownloads: false })
  await context.route('**/*', route => {
    const request = route.request()
    if (mayRequest(request.url(), request.method(), options.baseUrl)) return route.continue()
    result.blockedRequests.push({ url: request.url().split('?')[0], method: request.method() })
    return route.abort('blockedbyclient')
  })
  await context.routeWebSocket('**/*', socket => socket.close())
  await context.addInitScript(({ seed }) => {
    localStorage.setItem('shadow-runner-campaign-progress-v2:guest', JSON.stringify(seed))
    localStorage.setItem('shadow-runner-music-enabled-v1', 'false')
    localStorage.setItem('shadow-runner-sfx-enabled-v1', 'false')
  }, { seed: makeGuestSeed(test.level) })
  await context.addInitScript(installRafCap, fps)
  await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => result.errors.push(error.stack ?? error.message))
  const hashes = []
  page.on('response', response => {
    const name = new URL(response.url()).pathname.split('/').at(-1)
    if (!bundles.some(bundle => bundle.name === name)) return
    hashes.push(response.body().then(bytes => {
      result.loadedBundles.push({ name, sha256: createHash('sha256').update(bytes).digest('hex') })
    }).catch(error => result.errors.push(error.message)))
  })
  const capture = async name => {
    const file = `${name}.png`
    const before = await page.evaluate(readSample).catch(() => null)
    await page.screenshot({ path: path.join(dir, file) })
    const after = await page.evaluate(readSample).catch(() => null)
    await writeFile(path.join(dir, `${name}-capture.json`), JSON.stringify({ before, after }, null, 2), { flag: 'wx' })
    result.screenshots.push(file)
    return { before, after }
  }
  const mutationFile = path.join(dir, 'setup-mutations.jsonl')
  await writeFile(mutationFile, '', { flag: 'wx' })
  const gate = createSetupGate(async (operation, payload) => page.evaluate(({ operation, payload }) => {
    const before = window.__shadowRunnerDebug()
    const playerBefore = before.player
    if (operation === 'defeatEnemy') window.__shadowRunnerQa.defeatEnemy(payload.enemyId)
    else if (operation === 'teleport') window.__shadowRunnerQa.teleport(payload.x, payload.y)
    const after = window.__shadowRunnerDebug()
    return { wallTime: performance.now(), activeTimeMs: after.activeTimeMs, playerBefore, playerAfter: after.player,
      enemyBefore: before.enemies.find(enemy => enemy.id === payload.enemyId),
      enemyAfter: after.enemies.find(enemy => enemy.id === payload.enemyId) }
  }, { operation, payload }), event => appendFile(mutationFile, `${JSON.stringify({ recordedAt: new Date().toISOString(), ...event })}\n`))
  const phase = async (label, operation) => {
    try { await operation(); return true } catch (error) {
      result.passed = false
      result.failures.push({ phase: label, error: error.stack,
        state: await page.evaluate(readSample).catch(() => null) })
      await capture(`failure-${label}`).catch(() => {})
      console.log(`${id} ${label}: FAIL ${error.message}`)
      return false
    } finally { await gate.finish() }
  }
  try {
    await launchLevel(page, test)
    await Promise.all(hashes)
    for (const expected of bundles) assert(result.loadedBundles.some(bundle => bundle.name === expected.name && bundle.sha256 === expected.sha256), `Page did not load verified ${expected.name}`)
    assert(await page.evaluate(() => Boolean(window.__shadowRunnerDebug().tiltBridges)), 'Fresh bridge debug API missing')
    const initialBridges = await page.evaluate(() => window.__shadowRunnerDebug().tiltBridges.bridges)
    for (const [action, keys, fraction] of ACTIONS.filter(item => options.actions.includes(item[0]))) {
      const entry = { action, setup: null, samples: [], assessment: null }
      result.actions.push(entry)
      const completed = await phase(`action-${action}`, async () => {
        let sampling
        try {
          entry.setup = await preparePlacement(page, gate, result, dir, options, `action-${action}`, test.bridge, fraction)
          await gate.startAction()
          const baseline = await page.evaluate(readSample)
          sampling = collect(page, { activeDurationMs: action === 'jump' ? 1500 : 3500,
            bridgeId: test.bridge, stopOnExit: action !== 'jump' })
          for (const key of keys) await page.keyboard.down(key)
          if (action === 'idle') {
            entry.settle = await collect(page, { activeDurationMs: 300, bridgeId: test.bridge, stopOnExit: true })
            entry.settledCapture = await capture('settled-idle-300ms')
          } else if (action === 'jump' || action.startsWith('crouch')) {
            await page.waitForTimeout(100)
            if (action === 'jump') await page.keyboard.up('Space')
            await capture(`${action}-in-motion`)
          }
          entry.observation = await sampling
          entry.samples = [baseline, ...entry.observation.samples]
          entry.assessment = assessTrace(entry.samples, test.bridge, action, entry.observation)
          if (action.startsWith('crouch')) entry.assessment.checks.crouchObserved = entry.samples.some(sample => sample.player.crouching && sample.player.bodyHeight < 30)
          if (action === 'idle') {
            const settleSamples = [...entry.settle.samples, entry.settledCapture.before, entry.settledCapture.after]
            entry.assessment.checks.settledCapture = entry.settle.stopReason === 'active-duration'
              && settleSamples.every(sample => sample?.tiltBridges.playerSupport?.bridgeId === test.bridge
                && sample.player.health === baseline.player.health && sample.player.lives === baseline.player.lives
                && !sample.respawnPending)
          }
          entry.assessment.passed = Object.values(entry.assessment.checks).every(Boolean)
          const { firstExit, ...brief } = entry.assessment
          console.log(`${id} ${action}: ${entry.assessment.passed ? 'PASS' : entry.assessment.interrupted ? 'INTERRUPTED' : 'FAIL'} ${JSON.stringify({ ...brief, exitOverlap: firstExit?.overlap })}`)
          if (!entry.assessment.passed) result.passed = false
        } finally {
          for (const key of keys) await page.keyboard.up(key).catch(() => {})
          // Drain the read-only sampler even when input or screenshot capture fails.
          if (sampling && !entry.observation) entry.observation = await sampling.catch(error => ({ error: error.message }))
          await writeFile(path.join(dir, `${action}-trace.json`), JSON.stringify(entry, null, 2), { flag: 'wx' })
        }
        await capture(action)
        assert(!entry.samples.at(-1)?.respawnPending && entry.samples.at(-1)?.player.health > 0, 'Actor recovery interrupted diagnostic')
      })
      if (!completed) break
    }
    // Lifecycle proof runs before distant neighborhood scans and survives action failures.
    await phase('lifecycle', async () => {
    const errorStart = result.errors.length
    await preparePlacement(page, gate, result, dir, options, 'lifecycle-pause', test.bridge)
    await gate.startAction()
    await page.getByRole('button', { name: 'Open pause menu', exact: true }).click()
    const before = await page.evaluate(readSample)
    await page.waitForTimeout(500)
    const after = await page.evaluate(readSample)
    result.lifecycle.pauseFrozen = JSON.stringify({ ...before, wallTime: 0 }) === JSON.stringify({ ...after, wallTime: 0 })
    await capture('paused')
    await page.getByRole('button', { name: 'Resume', exact: true }).click()
    await page.waitForTimeout(120)
    result.lifecycle.resumed = (await page.evaluate(readSample)).activeTimeMs > after.activeTimeMs
    await page.getByRole('button', { name: 'Open pause menu', exact: true }).click()
    await page.getByRole('button', { name: 'Quit Level', exact: true }).click()
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await page.waitForFunction(() => !window.__shadowRunnerDebug && document.querySelectorAll('canvas').length === 0)
    result.lifecycle.disposed = true
    result.lifecycle.quitErrors = result.errors.slice(errorStart)
    await capture('disposed')
    await gate.finish()
    await launchLevel(page, test, false)
    await preparePlacement(page, gate, result, dir, options, 'lifecycle-replay', test.bridge)
    await gate.startAction()
    const restarted = await page.evaluate(readSample)
    result.lifecycle.restarted = restarted.tiltBridges.playerSupport?.bridgeId === test.bridge
      && restarted.tiltBridges.activeBodyCount <= 512 && await page.locator('canvas').count() === 1
    await capture('restarted')
    result.lifecycle.pageErrorFree = result.errors.length === errorStart
    assert(['pauseFrozen', 'resumed', 'disposed', 'restarted', 'pageErrorFree'].every(key => result.lifecycle[key]), 'Pause/restart/dispose check failed')
    })
    for (const bridge of initialBridges) {
      await phase(`neighborhood-${bridge.id}`, async () => {
        const placement = await preparePlacement(page, gate, result, dir, options, `neighborhood-${bridge.id}`, bridge.id)
        const state = placement.observation.samples.at(-1)
        result.neighborhoods.push(state)
        assert(state.tiltBridges.activeBodyCount <= 512 && state.tiltBridges.bridges.find(item => item.id === bridge.id).activeBodyCount > 0, 'Active-body neighborhood failed')
      })
    }
    assert.deepEqual(result.errors, [], 'Browser page errors')
  } catch (error) {
    result.passed = false
    result.failure = error.stack
    result.failureState = await page.evaluate(readSample).catch(() => null)
    await capture('failure').catch(() => {})
    console.log(`${id} FAILURE: ${error.message}`)
  } finally {
    for (const key of ['ArrowLeft', 'ArrowRight', 'KeyS', 'Space']) await page.keyboard.up(key).catch(() => {})
    await context.tracing.stop({ path: path.join(dir, 'trace.zip') }).catch(() => {})
    await context.close()
    await writeFile(path.join(dir, 'result.json'), JSON.stringify(result, null, 2), { flag: 'wx' })
  }
  return result
}

export async function runTiltDiagnostics(options) {
  const bundles = await verifyBuild(options)
  const output = path.join(ROOT, 'output/playwright', options.runName)
  await mkdir(path.dirname(output), { recursive: true })
  await mkdir(output) // Never overwrite an earlier failure's evidence.
  const report = { startedAt: new Date().toISOString(), options, bundles,
    method: `QA-assisted contact diagnostics. NPC isolation: ${options.npcIsolation}. Each setup logs approved nearby defeatEnemy calls and one initial teleport; actions use ordinary keyboard/UI input only. Disposable guest prerequisite unlocks. Not survival or input-route proof.`,
    harnessSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
    limitations: ['Player x and feet getter values are rounded; contact checks allow 0.5px uncertainty.',
      '30 FPS uses browser rAF delivery capping with native timestamps, not physical-device CPU certification.',
      'Action duration is measured in debug activeTimeMs with a 12-second wall watchdog; startup delta smoothing is not modified.',
      'NPC isolation does not remove already-fired projectiles or world hazards; any resulting damage remains an interruption.',
      'Screenshots require visual review for textured art gaps; geometry assertions alone cannot certify pixels.',
      'Restart means UI quit and replay; disposal is canvas/debug teardown, not a heap/GC measurement.'], results: [] }
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
  const engines = await import('playwright')
  for (const profile of options.profiles) {
    const browser = await engines[profile].launch({ headless: true })
    try {
      for (const fps of options.fps) for (const test of CASES.filter(item => options.levels.includes(item.level))) {
        report.results.push(await runCase(browser, options, profile, fps, test, output, bundles))
        await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
      }
    } finally { await browser.close() }
  }
  report.passed = report.results.every(result => result.passed)
  report.finishedAt = new Date().toISOString()
  await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
  const figures = report.results.flatMap(result => result.screenshots.map(file => `<figure><a href="${result.id}/${file}"><img src="${result.id}/${file}" loading="lazy"></a><figcaption>${result.id}: ${file}</figcaption></figure>`))
  await writeFile(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Tilt bridge diagnostics</title><style>body{background:#151515;color:#eee;font:16px system-ui;margin:24px}figure{margin:24px 0}img{max-width:100%;height:auto}a{color:#bce3d8}</style><h1>Tilt bridge diagnostics</h1><p>Build ${options.runtimeHash} / ${options.gamesHash}. Diagnostic placement, not route proof.</p>${figures.join('')}`)
  console.log(`Report: ${output}; ${report.passed ? 'PASS' : 'FAIL'}`)
  if (!report.passed) process.exitCode = 1
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runTiltDiagnostics(parseOptions(process.argv.slice(2)))
}

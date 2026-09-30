import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, webkit } from 'playwright'
import { decideStep, finaleAction, hasCompletionEvidence, makeGuestSeed, mayRequest, nextStepMemory,
  readObservationInPage, RealInputDriver } from './shadow-runner-route-proof.mjs'
import { RELAY_ROUTE_POLICIES } from './shadow-runner-relay-route-policies.mjs'
import { CAPTAIN_ROUTE_POLICIES } from './shadow-runner-captain-route-policies.mjs'

// Local diagnostic only: logged placement, prerequisite setup and prior encounter clearance.
// After setup every crossing action is a browser input; this never certifies a campaign route.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = 'http://127.0.0.1:4176'
const segment = process.argv[2] ?? 'ascent'
assert.ok(['ascent', 'foundry', 'crown', 'late-ascent', 'crawl-ascent', 'foundry-east', 'lock', 'prism-entry', 'boss', 'final-approach', 'captain-span', 'captain-boss'].includes(segment), 'Only the authored local diagnostics are allowed')
const config = segment === 'captain-span'
  ? { levelId: 'level-9', start: 'power-captain-shield-span', end: 'checkpoint-span', cleared: [],
    x: 13500, timeout: 90000, fights: ['captain-pikeman-span', 'captain-archer-span', 'captain-grenadier-span'],
    checkpointId: 'captain-checkpoint-span' }
  : segment === 'captain-boss'
    ? { levelId: 'level-9', start: 'arena-sunsteel-pass', end: 'fight-captain-moonlit-final', cleared: [],
      x: 18196, timeout: 90000, fights: ['captain-moonlit-final'] }
  : segment === 'ascent'
  ? { start: 'ascent-floor-calm', end: 'power-relay-aether-ascent', cleared: 'relay-rival-02',
    x: 21704, powerId: 'relay-aether-ascent', timeout: 45000, fights: [] }
  : segment === 'foundry' ? { start: 'foundry-stair-wind-cycle', end: 'checkpoint-gears', cleared: 'relay-drone-01',
    x: 6504, powerId: 'relay-aether-foundry', timeout: 90000,
    fights: ['relay-grenadier-01', 'relay-lancer-03'], checkpointId: 'relay-checkpoint-gears' }
    : segment === 'crown' ? { start: 'power-relay-sunsteel-crown', end: 'power-relay-aether-lock', cleared: 'relay-drone-04',
      x: 17960, powerId: 'relay-aether-lock', timeout: 90000,
      fights: ['relay-lancer-06', 'relay-caster-05'], checkpointId: 'relay-checkpoint-crown' }
      : segment === 'crawl-ascent' ? { start: 'ascent-floor-calm', end: 'fight-relay-lancer-07', cleared: 'relay-rival-02',
        x: 21704, powerId: 'relay-dawnfire-ascent', timeout: 90000,
        fights: ['relay-caster-06', 'relay-lancer-07'] }
      : segment === 'foundry-east' ? { start: 'foundry-east-stair-wind-cycle', end: 'gap-08-landing',
        cleared: ['relay-grenadier-01', 'relay-lancer-03'], x: 7516, timeout: 45000, fights: [] }
      : segment === 'lock' ? { start: 'power-relay-aether-lock', end: 'gap-21-takeoff',
        cleared: [], x: 18980, timeout: 90000, fights: ['relay-warden-02', 'relay-archer-03'],
        checkpointId: 'relay-checkpoint-lock' }
      : segment === 'prism-entry' ? { start: 'gap-04-takeoff', end: 'gap-04-landing',
        cleared: 'relay-lancer-02', x: 3500, timeout: 30000, fights: [] }
      : segment === 'boss' ? { start: 'checkpoint-sovereign', end: 'relay-ignition-pedestal',
        cleared: ['relay-pikeman-02', 'relay-caster-07', 'relay-drone-06'], x: 23960,
        timeout: 90000, fights: ['sentry-sovereign'] }
      : segment === 'final-approach' ? { start: 'fight-relay-grenadier-03', end: 'checkpoint-sovereign',
        cleared: [], x: 23064, timeout: 90000, fights: ['relay-grenadier-03'],
        threats: ['relay-drone-05'], checkpointId: 'relay-checkpoint-sovereign' }
      : { start: 'gap-23-takeoff', end: 'checkpoint-last', cleared: ['relay-caster-06', 'relay-lancer-07'],
        x: 22596, timeout: 45000, fights: [], threats: ['relay-drone-05', 'relay-grenadier-03'],
        checkpointId: 'relay-checkpoint-last' }
const output = path.join(root, 'output/playwright', `runner-${segment}-local-${new Date().toISOString().replace(/[:.]/g, '-')}`)
await mkdir(output, { recursive: true })
const levelId = config.levelId ?? 'level-10'
const normal = (levelId === 'level-9' ? CAPTAIN_ROUTE_POLICIES : RELAY_ROUTE_POLICIES)[0].steps
const steps = normal.slice(normal.findIndex(step => step.id === config.start),
  normal.findIndex(step => step.id === config.end) + 1)
if (segment === 'boss') {
  const fight = steps.find(step => step.enemyId === 'sentry-sovereign')
  fight.timeoutMs = 60000
}
assert.equal(steps[0].id, config.start)
assert.equal(steps[steps.length - 1].id, config.end)
const report = { kind: 'QA-assisted local crossing, NOT full-route acceptance', results: [],
  scriptSha256: createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex'),
  policySha256: createHash('sha256').update(await readFile(new URL('./shadow-runner-relay-route-policies.mjs', import.meta.url))).digest('hex') }

for (const [name, engine, width, height] of [['android', chromium, 932, 430], ['iphone', webkit, 740, 390]]) {
  const browser = await engine.launch()
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
  const result = { name, status: 'failed', setup: [], inputs: [], trajectory: [], completions: [],
    endingBeats: [], pageErrors: [], bundles: [] }
  let driver
  let page
  try {
    await context.route('**/*', route => mayRequest(route.request().url(), route.request().method(), baseUrl)
      ? route.continue() : route.abort('blockedbyclient'))
    await context.routeWebSocket('**/*', socket => socket.close())
    await context.addInitScript(progress => {
      if (!localStorage.getItem('shadow-runner-campaign-progress-v2:guest')) {
        localStorage.setItem('shadow-runner-campaign-progress-v2:guest', JSON.stringify(progress))
      }
      localStorage.setItem('shadow-runner-music-enabled-v1', 'false')
      localStorage.setItem('shadow-runner-sfx-enabled-v1', 'false')
    }, makeGuestSeed(levelId))
    page = await context.newPage()
    page.setDefaultTimeout(30000)
    page.on('pageerror', error => result.pageErrors.push(error.message))
    page.on('response', response => {
      if (/\/assets\/(createShadowRunnerPhaserGame|GamesHome)-.*\.js$/.test(response.url())) result.bundles.push(response.url())
      if (response.url().startsWith(baseUrl) && response.status() >= 400) result.pageErrors.push(`HTTP ${response.status()}: ${response.url()}`)
    })
    await page.goto(`${baseUrl}/?view=games&localPreview=shadow-runner`)
    await page.getByRole('button', { name: 'Select Level', exact: true }).click()
    await page.getByRole('button', { name: levelId === 'level-9' ? /^Captain Gate details/ : /^Dawn Relay Spire details/ }).click()
    await page.getByRole('button', { name: /^(Start|Replay)$/ }).click()
    await page.getByRole('button', { name: 'Begin delivery', exact: true }).click()
    await page.waitForFunction(() => window.__shadowRunnerQa && window.__shadowRunnerDebug)
    await page.locator('canvas').click({ position: { x: 360, y: 160 } })
    if (segment === 'crown' || segment === 'boss') {
      for (let index = 0; index < (segment === 'boss' ? 5 : 3); index += 1) {
        result.setup.push({ action: 'QA placement at prerequisite objective', index })
        await page.evaluate(index => window.__shadowRunnerQa.collect('objective', index), index)
        await page.waitForFunction(count => window.__shadowRunnerDebug().player.objectiveItems === count, index + 1)
      }
      result.setup.push({ action: 'restore before diagnostic only' })
      await page.evaluate(() => window.__shadowRunnerQa.restore())
    }
    const cleared = Array.isArray(config.cleared) ? config.cleared : [config.cleared]
    result.setup.push(...cleared.map(enemyId => ({ action: 'defeat prior encounter', enemyId })), { action: 'teleport', x: config.x, y: 616 })
    await page.evaluate(({ cleared, x }) => {
      cleared.forEach(id => window.__shadowRunnerQa.defeatEnemy(id))
      window.__shadowRunnerQa.teleport(x, 616)
    }, { cleared, x: config.x })
    const start = performance.now()
    const startedAt = new Date().toISOString()
    driver = new RealInputDriver(page, 'keyboard', result.inputs, () => performance.now() - start)
    await driver.apply({ direction: 0, crouch: true })
    await page.waitForTimeout(100)
    result.initial = await page.evaluate(() => window.__shadowRunnerDebug())
    assert.equal(result.initial.player.health, 12)
    assert.equal(result.initial.player.lives, 3)
    if (config.powerId) assert.equal(result.initial.collectedPowerIds.includes(config.powerId), false)
    if (segment === 'crown') assert.equal(result.initial.player.objectiveItems, 3)
    assert.ok(config.fights.every(id => result.initial.enemies.find(enemy => enemy.id === id)?.alive))
    assert.ok((config.threats ?? []).every(id => result.initial.enemies.find(enemy => enemy.id === id)?.alive))
    let index = 0
    let memory = {}
    while (index < steps.length && performance.now() - start < config.timeout) {
      const observation = await page.evaluate(readObservationInPage,
        { levelId, guestKey: 'shadow-runner-campaign-progress-v2:guest' })
      const debug = observation.debug
      const step = steps[index]
      const now = performance.now() - start
      result.trajectory.push({ time: now, step: step.id, player: debug.player, wind: debug.windZones,
        beams: debug.relayBeamZones, activeTimeMs: debug.activeTimeMs,
        collectedPowerIds: debug.collectedPowerIds,
        enemies: debug.enemies.filter(enemy => [...config.fights, ...(config.threats ?? [])].includes(enemy.id)),
        floorHazards: debug.floorHazards, stormWarnings: debug.stormWarnings,
        visibleArrows: debug.visibleArrows, pools: debug.pools })
      assert.equal(debug.player.lives, result.initial.player.lives)
      if (['ascent', 'foundry-east', 'prism-entry'].includes(segment)) assert.equal(debug.player.health, result.initial.player.health)
      else assert.ok(debug.player.health > 0, 'Combat exhausted health')
      assert.ok(debug.player.bodyBottom < 700, 'Fell below crossing')
      if (segment === 'boss' && step.kind === 'finish') {
        if (hasCompletionEvidence(observation, 'level-10', startedAt)) {
          assert.equal(result.endingBeats.length, 4)
          result.completion = observation.record.lastRun
          result.completions.push({ step: step.id, time: now, x: debug.player.x, y: debug.player.y })
          index += 1
          break
        }
        const ending = finaleAction(observation, RELAY_ROUTE_POLICIES[0], step, startedAt, result.endingBeats.length)
        if (ending) {
          await driver.release()
          await page.screenshot({ path: path.join(output, `${name}-ending-${result.endingBeats.length + 1}.png`) })
          await page.getByRole('dialog', { name: 'Dawn Relay Spire finale', exact: true })
            .getByRole('button', { name: ending.button, exact: true }).click()
          result.endingBeats.push(ending)
          result.inputs.push({ atMs: now, input: 'pointer', kind: 'click', label: ending.button })
          await page.waitForTimeout(80)
          continue
        }
      }
      const action = decideStep(step, debug, memory, now)
      assert.ok(now - memory.startedAt <= (step.timeoutMs ?? 12000), `Stalled at ${step.id}`)
      if (action.done) {
        result.completions.push({ step: step.id, time: now, x: debug.player.x, y: debug.player.y })
        const next = steps[index + 1] ?? normal[normal.findIndex(item => item.id === step.id) + 1]
        await driver.finishStep(Boolean(next?.crouch))
        // Screenshots can suspend input observations for hundreds of milliseconds.
        // Capture only after traversal so wind exposure is not a screenshot artifact.
        memory = nextStepMemory(step, next, memory)
        index += 1
      } else await driver.apply(action)
      if (!action.done) await page.waitForTimeout(80)
    }
    assert.equal(index, steps.length)
    result.final = await page.evaluate(() => window.__shadowRunnerDebug())
    if (config.powerId) assert.ok(result.final.collectedPowerIds.includes(config.powerId))
    if (segment === 'ascent') assert.equal(result.final.player.aetherStepActive, true)
    else {
      if (config.checkpointId) assert.equal(result.final.checkpointId, config.checkpointId)
      assert.ok(config.fights.every(id => result.final.enemies.find(enemy => enemy.id === id)?.alive === false))
      if (segment === 'crown') assert.equal(result.final.player.objectiveItems, 4)
    }
    assert.deepEqual(result.pageErrors, [])
    await driver.release()
    await page.screenshot({ path: path.join(output, `${name}-crossed.png`) })
    if (segment === 'boss') {
      await page.reload()
      await page.getByRole('button', { name: 'Select Level', exact: true }).click()
      await page.getByRole('button', { name: /^Dawn Relay Spire details/ }).click()
      await page.getByRole('button', { name: 'Replay', exact: true }).waitFor()
      result.reload = { completedLevelReplayVisible: true }
      await page.screenshot({ path: path.join(output, `${name}-reloaded.png`) })
    }
    result.status = 'passed'
  } catch (error) {
    result.failure = error.message
    await page?.screenshot({ path: path.join(output, `${name}-failure.png`) }).catch(() => {})
    process.exitCode = 1
  } finally {
    await driver?.release().catch(() => {})
    await context.close()
    await browser.close()
    report.results.push(result)
    await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
  }
  console.log(`${name}: ${result.status}${result.failure ? `; ${result.failure}` : ''}`)
}
console.log(`Evidence: ${output}`)

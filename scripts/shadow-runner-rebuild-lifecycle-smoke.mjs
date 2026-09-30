import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, webkit } from 'playwright'

export function parseOptions(argv) {
  const args = Object.fromEntries(argv.map(arg => arg.replace(/^--/, '').split('=')))
  const baseUrl = args['base-url'] ?? 'http://127.0.0.1:4176'
  const url = new URL(baseUrl)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('Lifecycle smoke requires a credential-free loopback HTTP preview')
  if (args['build-ready'] !== '20662') throw new Error('Run only after main confirms build 20662: --build-ready=20662')
  const runName = args['run-name'] ?? 'runner-rebuild-lifecycle-20662'
  if (!/^[a-z0-9_-]+$/i.test(runName)) throw new Error('Run name must be a single safe directory name')
  if (args.profile && !['android', 'iphone'].includes(args.profile)) throw new Error('Unknown browser profile')
  return { baseUrl: url.origin, runName, profile: args.profile, build: '20662' }
}

export function allowRequest(url, method, origin) {
  try { return new URL(url).origin === origin && ['GET', 'HEAD'].includes(method) } catch { return false }
}

export function stableState(debug) {
  if (!debug?.player) return null
  return {
    levelId: debug.levelId, activeTimeMs: debug.activeTimeMs, attackId: debug.attackId,
    player: debug.player, deadlines: debug.deadlines, enemies: debug.enemies,
  }
}

export function assessPhantom(before, samples) {
  const players = samples.filter(sample => sample?.player)
  if (!before?.player || !players.length) return { valid: false }
  return {
    valid: true,
    attackDelta: Math.max(...players.map(sample => sample.attackId)) - before.attackId,
    rise: before.player.y - Math.min(...players.map(sample => sample.player.y)),
    horizontalDrift: Math.max(...players.map(sample => Math.abs(sample.player.x - before.player.x))),
  }
}

export function readDebugState(target = globalThis) {
  const debugRegistered = typeof target.__shadowRunnerDebug === 'function'
  try {
    return { debugRegistered, debug: debugRegistered ? target.__shadowRunnerDebug() : null, debugError: null }
  } catch (error) {
    return { debugRegistered, debug: null, debugError: String(error) }
  }
}

export function summarizeResources(resources) {
  const unique = new Map()
  for (const entry of resources) unique.set(entry.path, Math.max(unique.get(entry.path) ?? 0, entry.bytes))
  return {
    entries: resources.length,
    uniquePaths: unique.size,
    uniqueEncodedBytes: [...unique.values()].reduce((sum, bytes) => sum + bytes, 0),
    zeroBytePaths: [...unique.values()].filter(bytes => bytes === 0).length,
    scope: 'Game asset Resource Timing entries only; maximum reported body size per path. Zero and missing entries are not proof of zero transfer. Not a whole-app budget or performance measurement.',
  }
}

const profiles = [
  { name: 'android', engine: chromium, viewport: { width: 932, height: 430 } },
  { name: 'iphone', engine: webkit, viewport: { width: 740, height: 390 } },
]
const faultAsset = '/games/shadow-runner/sprites/strips/shadow-runner-run-6f-128.png'
const sanitize = text => String(text).replace(/Bearer\s+[\w.-]+/gi, 'Bearer [redacted]')
const localPath = url => { try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}` } catch { return String(url) } }
const debug = page => page.evaluate(() => window.__shadowRunnerDebug?.() ?? null)
const click = (page, name) => page.getByRole('button', { name, exact: true }).click()

async function observe(page) {
  const scene = await page.evaluate(readDebugState)
  const ui = await page.evaluate(() => ({
    canvasCount: document.querySelectorAll('canvas').length,
    dialogNames: [...document.querySelectorAll('[role="dialog"]')].filter(el => el.getBoundingClientRect().width).map(el => el.querySelector('h2')?.textContent ?? el.getAttribute('aria-label')),
    health: document.querySelector('[role="meter"][aria-label="Health"]')?.getAttribute('aria-valuenow'),
    text: document.body.innerText,
    focused: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.slice(0, 80),
  }))
  return { ...scene, ...ui }
}

async function neutralSamples(page, durationMs = 350) {
  return page.evaluate(duration => new Promise(resolve => {
    const samples = []
    const start = performance.now()
    const sample = () => {
      samples.push(window.__shadowRunnerDebug?.() ?? null)
      if (performance.now() - start < duration) requestAnimationFrame(sample)
      else resolve(samples)
    }
    requestAnimationFrame(sample)
  }), durationMs)
}

async function blockedKeys(page) {
  await page.keyboard.down('w')
  await page.keyboard.down('j')
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(100)
  await page.keyboard.up('w')
  await page.keyboard.up('j')
  await page.keyboard.up('ArrowRight')
}

export async function runLifecycleSmoke(options) {
  const output = path.resolve('output/playwright', options.runName)
  await mkdir(output, { recursive: true })
  const report = {
    startedAt: new Date().toISOString(), build: options.build, baseUrl: options.baseUrl,
    method: 'Genuine UI navigation and pointer/keyboard actions. Debug getter is read-only. No seeded progress, teleportation, completion cheats, or remote requests.',
    limitations: ['Concurrent primary UI smoke; not a performance measurement.', 'Pointercancel is a DOM cancellation event paired with genuine pointer down; not physical-device gesture certification.', 'Headless blur uses native page focus where supported, otherwise a labeled window blur event.', 'Guest save details only; no authenticated session or real-user writes.'],
    results: [],
  }
  const save = () => writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
  for (const profile of profiles.filter(candidate => !options.profile || candidate.name === options.profile)) {
    const browser = await profile.engine.launch({ headless: true })
    try {
      for (const scenario of ['loader-recovery', 'five-relaunches-and-inputs', 'save-dialog-isolation']) {
        const result = { profile: profile.name, scenario, startedAt: new Date().toISOString(), checks: [], console: [], pageErrors: [], requestsFailed: [], blockedRequests: [], blockedWebSockets: [], faultRequests: [], screenshots: [], snapshots: [] }
        report.results.push(result)
        const context = await browser.newContext({ viewport: profile.viewport, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
        let abortRequiredAsset = scenario === 'loader-recovery'
        await context.route('**/*', route => {
          const request = route.request()
          if (!allowRequest(request.url(), request.method(), options.baseUrl)) {
            result.blockedRequests.push({ url: localPath(request.url()), method: request.method() })
            return route.abort('blockedbyclient')
          }
          if (abortRequiredAsset && new URL(request.url()).pathname === faultAsset) {
            result.faultRequests.push({ url: faultAsset, at: new Date().toISOString() })
            return route.abort('failed')
          }
          return route.continue()
        })
        await context.routeWebSocket(/.*/, socket => {
          result.blockedWebSockets.push(localPath(socket.url()))
          socket.close({ code: 1000, reason: 'Local read-only lifecycle QA' })
        })
        await context.addInitScript(({ storageDenied }) => {
          window.__runnerLifecyclePointers = []
          document.addEventListener('pointerdown', event => {
            window.__runnerLifecyclePointers.push({ pointerId: event.pointerId, pointerType: event.pointerType, label: event.target.closest?.('button')?.getAttribute('aria-label') })
          }, true)
          if (storageDenied) {
            const original = Storage.prototype.getItem
            Storage.prototype.getItem = function (key) {
              if (String(key).startsWith('shadow-runner-campaign-progress-')) throw new DOMException('Storage denied by lifecycle fault injection', 'SecurityError')
              return original.call(this, key)
            }
          }
        }, { storageDenied: scenario === 'save-dialog-isolation' })
        const page = await context.newPage()
        page.setDefaultTimeout(12000)
        page.on('console', message => result.console.push({ type: message.type(), text: sanitize(message.text()) }))
        page.on('pageerror', error => result.pageErrors.push(sanitize(error.message)))
        page.on('requestfailed', request => result.requestsFailed.push({ url: localPath(request.url()), reason: request.failure()?.errorText }))
        await context.tracing.start({ screenshots: true, snapshots: true, sources: false })
        const check = (name, passed, details, category = 'lifecycle') => {
          result.checks.push({ name, passed: Boolean(passed), category, details })
          console.log(`${profile.name} ${scenario} ${passed ? 'PASS' : 'FAIL'} ${name}`)
        }
        const capture = async name => {
          const file = `${profile.name}-${scenario}-${name}.png`
          await page.screenshot({ path: path.join(output, file) })
          result.screenshots.push(file)
          result.snapshots.push({ name, ...await observe(page) })
        }
        const stable = async name => {
          await page.waitForTimeout(120)
          const before = await debug(page)
          await blockedKeys(page)
          await page.waitForTimeout(350)
          const after = await debug(page)
          check(name, before?.player && JSON.stringify(stableState(before)) === JSON.stringify(stableState(after)), { before, after }, 'pause-input')
          return after
        }
        const phantom = async (name, before) => {
          const samples = await neutralSamples(page)
          const evidence = assessPhantom(before, samples)
          check(name, evidence.valid && evidence.attackDelta === 0 && evidence.rise <= 8 && evidence.horizontalDrift <= 3, { ...evidence, before, samples }, 'pause-input')
        }
        const noScene = async name => {
          await page.waitForTimeout(300)
          const state = await observe(page)
          check(`${name}: canvas removed`, state.canvasCount === 0, state)
          check(`${name}: debug reference released`, !state.debugRegistered, { debugRegistered: state.debugRegistered, debugError: state.debugError }, 'debug-teardown')
        }
        const quit = async () => {
          await click(page, 'Open pause menu')
          await click(page, 'Quit Level')
          await click(page, 'Main Menu')
          await page.getByRole('button', { name: 'Start Tutorial', exact: true }).waitFor()
        }
        const start = async () => {
          await click(page, 'Start Tutorial')
          await page.getByRole('button', { name: 'Begin delivery', exact: true }).waitFor({ timeout: 45000 })
          await page.waitForFunction(() => Boolean(window.__shadowRunnerDebug?.()?.player))
        }
        try {
          await page.goto(`${options.baseUrl}/?view=games&localPreview=shadow-runner`, { waitUntil: 'domcontentloaded' })
          await page.getByRole('button', { name: 'Start Tutorial', exact: true }).waitFor({ timeout: 30000 })
          await click(page, 'Options')
          for (const name of ['Music', 'Sound effects']) {
            const checkbox = page.getByRole('checkbox', { name, exact: true })
            if (await checkbox.isChecked()) await checkbox.uncheck()
          }
          await page.getByRole('dialog', { name: 'Options', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
          await capture('title')
          if (scenario === 'loader-recovery') {
            await click(page, 'Start Tutorial')
            const failure = page.getByRole('dialog', { name: 'Route unavailable', exact: true })
            await failure.waitFor({ timeout: 45000 })
            check('required asset failure is honest with Retry and Back', result.faultRequests.length > 0 && await failure.getByRole('button', { name: 'Retry', exact: true }).isVisible() && await failure.getByRole('button', { name: 'Return to Map', exact: true }).isVisible(), await observe(page), 'loading')
            await capture('required-asset-error')
            abortRequiredAsset = false
            await failure.getByRole('button', { name: 'Retry', exact: true }).click()
            await page.getByRole('button', { name: 'Move right', exact: true }).waitFor({ timeout: 45000 })
            check('required-asset Retry recovers playable single canvas', await page.locator('canvas').count() === 1 && Boolean((await debug(page))?.player), await observe(page), 'loading')
            await capture('retry-recovered')
            await quit()
            await noScene('no orphan after recovered route quit')
            abortRequiredAsset = true
            await click(page, 'Start Tutorial')
            await failure.waitFor({ timeout: 45000 })
            await failure.getByRole('button', { name: 'Return to Map', exact: true }).click()
            await noScene('Back from asset failure destroys failed scene')
            await capture('failure-back-to-map')
          } else if (scenario === 'five-relaunches-and-inputs') {
            for (let cycle = 1; cycle <= 5; cycle += 1) {
              await start()
              check(`cycle ${cycle}: exactly one fresh canvas`, await page.locator('canvas').count() === 1, await observe(page))
              if (cycle === 1) {
                await stable('briefing blocks player, health, enemies and active clock')
                await capture('briefing-held')
              }
              await click(page, 'Begin delivery')
              await page.waitForTimeout(600)
              if (cycle === 1) {
                await click(page, 'Open pause menu')
                const before = await stable('pause blocks keyboard and active clock')
                await capture('pause-held')
                await click(page, 'Resume')
                await phantom('paused keyboard taps do not replay jump or sword on Resume', before)
              }
              if (cycle === 2) {
                await page.setViewportSize({ width: profile.viewport.height, height: profile.viewport.width })
                await page.getByRole('dialog', { name: 'Rotate Phone', exact: true }).waitFor()
                await stable('portrait gate suspends the hidden scene')
                await capture('portrait-held')
                await page.setViewportSize(profile.viewport)
                await page.getByRole('button', { name: 'Resume', exact: true }).waitFor()
                const before = await stable('landscape return retains pause')
                await click(page, 'Resume')
                await phantom('orientation pause does not replay held input', before)
              }
              if (cycle === 3) {
                const other = await context.newPage()
                await other.bringToFront()
                await page.waitForTimeout(180)
                let method = 'browser page focus'
                if (!await page.getByRole('button', { name: 'Resume', exact: true }).isVisible()) {
                  method = 'synthetic window blur event (headless fallback)'
                  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
                }
                await page.bringToFront()
                await other.close()
                await page.getByRole('button', { name: 'Resume', exact: true }).waitFor()
                check('blur opens pause', true, { method }, 'pause-input')
                const before = await stable('blur pause freezes the scene')
                await click(page, 'Courier journal')
                await stable('journal freezes the paused scene')
                await capture('journal-held')
                await page.getByRole('dialog', { name: 'Courier journal', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
                await click(page, 'Resume')
                await phantom('blur and journal do not leak keyboard taps', before)
              }
              if (cycle === 4) {
                const control = page.getByRole('button', { name: 'Move right', exact: true })
                const box = await control.boundingBox()
                if (!box) throw new Error('Move right control missing')
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
                await page.mouse.down()
                await page.waitForTimeout(90)
                const pointer = await page.evaluate(() => window.__runnerLifecyclePointers.filter(event => event.label === 'Move right').slice(-1)[0])
                if (!pointer) throw new Error('Genuine pointerdown was not observed')
                await control.dispatchEvent('pointercancel', { ...pointer, bubbles: true })
                await page.mouse.up()
                await page.waitForTimeout(160)
                const before = await debug(page)
                await page.waitForTimeout(300)
                const after = await debug(page)
                check('pointercancel releases movement without sticky direction', Math.abs(after.player.x - before.player.x) <= 3 && after.player.velocityX === 0 && await control.getAttribute('data-pressed') === 'false', { before, after, pointer }, 'pause-input')
                await capture('pointercancel')
              }
              await quit()
              await noScene(`cycle ${cycle}: quit removes canvas and debug handle`)
              await capture(`cycle-${cycle}-quit`)
            }
          } else {
            result.storageFault = 'Browser getItem SecurityError for campaign progress keys only; no progress or gameplay state was injected.'
            await click(page, 'Save details')
            await page.getByRole('dialog', { name: 'Save details', exact: true }).waitFor()
            await blockedKeys(page)
            await noScene('title Save details has no hidden active game')
            await page.getByRole('dialog', { name: 'Save details', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
            await start()
            await click(page, 'Begin delivery')
            await page.waitForTimeout(600)
            await click(page, 'Save details')
            await page.getByRole('dialog', { name: 'Save details', exact: true }).waitFor()
            const before = await stable('Save details suspends active scene and active clock')
            const state = await observe(page)
            check('Save details is the only active dialog', state.dialogNames.length === 1 && state.dialogNames[0] === 'Save details', state, 'saving-isolation')
            await capture('save-details-held')
            await page.getByRole('dialog', { name: 'Save details', exact: true }).getByRole('button', { name: 'Close dialog', exact: true }).click()
            await phantom('closing Save details does not replay paused keys', before)
            await quit()
            await noScene('save details session leaves no orphan scene')
          }
        } catch (error) {
          check('scenario completed', false, { error: sanitize(error.message) }, 'harness-or-ui-blocker')
          await capture('failure').catch(() => {})
        } finally {
          result.resources = await page.evaluate(() => performance.getEntriesByType('resource').filter(entry => entry.name.includes('/games/shadow-runner/')).map(entry => ({ path: new URL(entry.name).pathname, bytes: entry.encodedBodySize, duration: entry.duration }))).catch(() => [])
          result.resourceSummary = summarizeResources(result.resources)
          if (result.pageErrors.length) check('no unhandled page errors', false, result.pageErrors, 'runtime-error')
          result.status = result.checks.every(item => item.passed) ? 'passed' : 'failed'
          result.finishedAt = new Date().toISOString()
          await context.tracing.stop({ path: path.join(output, `${profile.name}-${scenario}-trace.zip`) }).catch(() => {})
          await context.close()
          await save()
        }
      }
    } finally { await browser.close() }
  }
  report.finishedAt = new Date().toISOString()
  await save()
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await runLifecycleSmoke(parseOptions(process.argv.slice(2)))
  if (report.results.some(result => result.status === 'failed')) process.exitCode = 1
}

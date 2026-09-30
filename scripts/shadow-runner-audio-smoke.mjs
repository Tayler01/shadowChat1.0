import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, webkit } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')))
const baseUrl = args['base-url'] ?? 'http://127.0.0.1:4176'
const origin = new URL(baseUrl)
assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) && origin.protocol === 'http:' && !origin.username && !origin.password)
const name = args['run-name'] ?? 'runner-audio-lifecycle'
assert(/^[a-z0-9][a-z0-9_-]{0,100}$/i.test(name))
assert(!args.profile || ['android', 'iphone'].includes(args.profile))
const output = path.resolve('output/playwright', name)
await mkdir(output, { recursive: true })
const report = { scope: 'Real browser Web Audio menu playback; synthetic pagehide cleanup. Not physical iPhone Now Playing evidence.', results: [] }

for (const [profile, engine, viewport] of [
  ['android', chromium, { width: 932, height: 430 }],
  ['iphone', webkit, { width: 740, height: 390 }],
]) {
  if (args.profile && args.profile !== profile) continue
  const browser = await engine.launch({ headless: true })
  const result = { profile, states: [], errors: [], warnings: [] }
  let page
  try {
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
    await context.route('**/*', route => new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort())
    await context.routeWebSocket('**/*', socket => socket.close())
    await context.addInitScript(() => {
      localStorage.setItem('shadow-runner-music-enabled-v1', 'false')
      localStorage.setItem('shadow-runner-sfx-enabled-v1', 'false')
      const Native = window.AudioContext ?? window.webkitAudioContext
      const audit = { supported: Boolean(Native), created: 0, closed: 0, started: 0, stopped: 0, active: 0, contexts: [] }
      window.__runnerAudioAudit = audit
      if (!Native) return
      class ObservedAudioContext extends Native {
        constructor(...values) {
          super(...values)
          audit.created++
          const record = { id: audit.created, started: 0, stopped: 0, closed: false }
          audit.contexts.push(record)
          const close = this.close.bind(this)
          let closed = false
          this.close = () => {
            if (!closed) { audit.closed++; closed = true; record.closed = true }
            return close()
          }
          const create = this.createBufferSource.bind(this)
          this.createBufferSource = () => {
            const source = create()
            const start = source.start.bind(source), stop = source.stop.bind(source)
            let active = false
            source.start = (...args) => { start(...args); active = true; audit.started++; audit.active++; record.started++ }
            source.stop = (...args) => {
              stop(...args)
              if (active) { active = false; audit.stopped++; audit.active--; record.stopped++ }
            }
            return source
          }
        }
      }
      window.AudioContext = ObservedAudioContext
      if (window.webkitAudioContext) window.webkitAudioContext = ObservedAudioContext
    })
    page = await context.newPage()
    page.on('pageerror', error => result.errors.push(error.message))
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) result.warnings.push(message.text()) })
    await page.goto(`${origin.origin}/?view=games&localPreview=shadow-runner`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    const music = page.getByRole('checkbox', { name: 'Music', exact: true })
    const observe = async label => {
      const state = await page.evaluate(() => ({ ...window.__runnerAudioAudit,
        mediaElements: document.querySelectorAll('audio,video').length,
        mediaMetadata: navigator.mediaSession?.metadata ?? null,
        bundles: performance.getEntriesByType('resource').map(entry => entry.name).filter(url => /GamesHome-.*\.js/.test(url)),
      }))
      assert.equal(state.mediaElements, 0)
      assert.equal(state.mediaMetadata, null)
      result.states.push({ label, ...state })
      return state
    }
    const initial = await observe('initial-muted')
    assert.equal(initial.started, 0)
    if (!initial.supported) {
      await music.check()
      await page.getByRole('button', { name: 'Start Music', exact: true }).click()
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
      await page.getByRole('button', { name: 'Start Tutorial', exact: true }).click()
      await page.getByRole('button', { name: 'Begin delivery', exact: true }).click()
      await page.getByRole('button', { name: 'Move right', exact: true }).waitFor()
      await observe('unsupported-audio-does-not-block-game')
      assert.deepEqual(result.errors, [])
      result.passed = null
      result.fallbackPassed = true
      result.limitation = 'This browser runtime does not expose AudioContext or webkitAudioContext. Playback/cleanup is unverified; only the graceful no-audio gameplay fallback passed.'
      continue
    }
    await music.check()
    await page.waitForFunction(() => window.__runnerAudioAudit.active === 1, null, { timeout: 35000 })
    await observe('playing')
    await music.uncheck()
    await page.waitForFunction(() => window.__runnerAudioAudit.active === 0)
    const muted = await observe('muted')
    assert.equal(muted.stopped, 1)
    await music.check()
    await page.waitForFunction(() => window.__runnerAudioAudit.active === 1, null, { timeout: 35000 })
    await observe('restarted')
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
    await page.waitForFunction(() => window.__runnerAudioAudit.active === 0
      && window.__runnerAudioAudit.contexts.some(context => context.started > 0)
      && window.__runnerAudioAudit.contexts.filter(context => context.started > 0).every(context => context.closed))
    const hidden = await observe('synthetic-pagehide')
    assert.equal(hidden.started, 2)
    assert.equal(hidden.stopped, 2)
    await page.screenshot({ path: path.join(output, `${profile}-options.png`) })
    assert.deepEqual(result.errors, [])
    result.passed = true
  } catch (error) {
    result.passed = false
    result.failure = error.stack
    result.failureState = page && !page.isClosed() ? await page.evaluate(() => window.__runnerAudioAudit).catch(() => null) : null
    process.exitCode = 1
  } finally {
    await browser.close()
    report.results.push(result)
    console.log(`${profile}: ${result.passed ? 'PASS' : result.limitation ?? result.failure}`)
    await writeFile(path.join(output, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`)
  }
}

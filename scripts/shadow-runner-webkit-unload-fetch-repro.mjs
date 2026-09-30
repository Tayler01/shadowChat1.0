import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { webkit } from 'playwright'
import { allowRequest } from './shadow-runner-rebuild-lifecycle-smoke.mjs'
import { correlateNarrativeErrors, createNarrativeTimeline, safeNarrativeUrl, sanitizeNarrativeText } from './shadow-runner-narrative-smoke.mjs'

export const REPRO_REMOTE_URL = 'https://runner-unload.invalid/rest/v1/rpc/set_my_notification_installation_foreground_v2'
export const REPRO_CASES = ['minimal-idle', 'minimal-visible-caught', 'minimal-hidden-caught', 'minimal-hidden-microtask-caught', 'minimal-js-controls', 'app-signed-out']
const FIXTURE_PATH = '/__runner-unload-repro__/'
const browserEventKinds = new Set(['observer-ready', 'pagehide', 'pageshow', 'visibilitychange', 'window-error', 'unhandledrejection', 'fixture-fetch-attempt', 'fixture-fetch-resolved', 'fixture-caught', 'fixture-ready'])

export function parseUnloadOptions(argv) {
  const args = {}
  for (const argument of argv) {
    const match = /^--(base-url|build-ready|app-hash|run-name|case)=(.+)$/.exec(argument)
    if (!match || Object.hasOwn(args, match[1])) throw new Error('Unknown, missing-value or repeated argument')
    args[match[1]] = match[2]
  }
  if (!/^[a-z0-9][a-z0-9_.:-]{0,79}$/i.test(args['build-ready'] ?? '') || args['build-ready'] === 'true') throw new Error('Wait for exclusive browser-slot approval; supply --build-ready=LABEL')
  if (!/^[a-z0-9_-]{6,40}$/i.test(args['app-hash'] ?? '')) throw new Error('Supply the confirmed index bundle --app-hash=HASH')
  const url = new URL(args['base-url'] ?? 'http://127.0.0.1:4176')
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Only a credential-free loopback HTTP root origin is allowed')
  const runName = args['run-name'] ?? `runner-unload-${args['build-ready'].replace(/[.:]/g, '-')}`
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/i.test(runName)) throw new Error('Use one safe output directory name')
  const scenario = args.case ?? 'all'
  if (scenario !== 'all' && !REPRO_CASES.includes(scenario)) throw new Error('Unknown case')
  return { baseUrl: url.origin, build: args['build-ready'], appHash: args['app-hash'], runName, scenario }
}

export function observeUnloadPage() {
  const emit = (kind, details = {}) => {
    void window.__runnerUnloadRecord({ kind, ...details, browserEpochMs: performance.timeOrigin + performance.now(),
      url: location.href, visibilityState: document.visibilityState }).catch(() => {})
  }
  document.addEventListener('visibilitychange', () => emit('visibilitychange'))
  window.addEventListener('pagehide', event => emit('pagehide', { persisted: event.persisted }))
  window.addEventListener('pageshow', event => emit('pageshow', { persisted: event.persisted }))
  window.addEventListener('error', event => emit('window-error', { message: event.message, name: event.error?.name,
    stack: event.error?.stack, line: event.lineno, column: event.colno }))
  window.addEventListener('unhandledrejection', event => emit('unhandledrejection', {
    message: typeof event.reason === 'string' ? event.reason : event.reason?.message ?? '[non-Error rejection]',
    name: event.reason?.name, stack: event.reason?.stack,
  }))
  emit('observer-ready')
}

// Served as a standalone script; it imports no application, SDK or game code.
export function installMinimalFixture(mode, remoteUrl) {
  const state = window.__runnerUnloadState = { ready: false, attempted: 0, caught: 0 }
  const emit = (kind, details = {}) => {
    void window.__runnerUnloadRecord({ kind, ...details, url: remoteUrl,
      browserEpochMs: performance.timeOrigin + performance.now(), visibilityState: document.visibilityState }).catch(() => {})
  }
  const request = () => {
    state.attempted += 1
    emit('fixture-fetch-attempt')
    return fetch(remoteUrl, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: '{}', keepalive: false })
  }
  const caught = error => {
    state.caught += 1
    emit('fixture-caught', { name: error.name, message: error.message, stack: error.stack })
  }
  const runCaught = () => { void request().then(() => emit('fixture-fetch-resolved')).catch(caught) }
  const runMicrotaskCaught = () => {
    void (async () => {
      // Match the helper's initial await without importing Supabase or any credentials.
      await Promise.resolve()
      return request()
    })().catch(caught)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    if (mode === 'minimal-hidden-caught') runCaught()
    if (mode === 'minimal-hidden-microtask-caught') runMicrotaskCaught()
  })
  document.getElementById('caught-fetch').addEventListener('click', runCaught)
  document.getElementById('unhandled-rejection').addEventListener('click', () => {
    void Promise.reject(new Error('UNLOAD_REPRO_INTENTIONAL_UNHANDLED_REJECTION'))
  })
  document.getElementById('thrown-error').addEventListener('click', () => {
    setTimeout(() => { throw new Error('UNLOAD_REPRO_INTENTIONAL_THROWN_ERROR') }, 0)
  })
  state.ready = true
  emit('fixture-ready')
}

export function fixtureHtml(mode) {
  if (!REPRO_CASES.includes(mode) || mode === 'app-signed-out') throw new Error('Invalid fixture mode')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unload fetch diagnostic</title></head><body><h1>Unload fetch diagnostic</h1><p>${mode}</p><button id="caught-fetch">Run caught fetch</button><button id="unhandled-rejection">Trigger unhandled rejection</button><button id="thrown-error">Trigger thrown error</button><script defer src="${FIXTURE_PATH}fixture.js?mode=${mode}"></script></body></html>`
}

export function summarizeUnloadEvidence(result) {
  const events = result.timeline
  const select = kind => events.filter(event => event.kind === kind)
  return {
    pageErrorCount: result.pageErrors.length,
    rawErrorFree: result.pageErrors.length === 0,
    windowErrors: select('window-error'), unhandledRejections: select('unhandledrejection'),
    fetchAttempts: select('fixture-fetch-attempt'), caughtRejections: select('fixture-caught'),
    accessControlErrors: events.filter(event => event.kind === 'pageerror' && /access control checks/i.test(`${event.name} ${event.message}`)),
    requestErrorCorrelations: correlateNarrativeErrors(events),
    interpretation: 'Observations only. JS controls deliberately generate errors, but every raw pageerror still makes rawErrorFree false. Missing unload events do not prove a callback did not run; URL/time matches do not prove causation.',
  }
}

export async function runUnloadRepro(argv) {
  const options = parseUnloadOptions(argv)
  const output = path.resolve('output/playwright', options.runName)
  await mkdir(path.dirname(output), { recursive: true })
  await mkdir(output)
  const report = {
    options, startedAt: new Date().toISOString(), results: [],
    method: 'Serial WebKit 740x390 disposable contexts. Five standalone fixture controls and the ordinary signed-out app root, without localPreview flags, auth setup, gameplay or runtime imports. One genuine reload per case; no synthetic visibility changes or fetch replacement.',
    networkPolicy: 'Same-origin read-only traffic only. Every off-origin or mutating HTTP request is context-aborted; every WebSocket is closed. Minimal fixtures use a reserved .invalid hostname, omit credentials and send only an empty JSON object. No production notification changes.',
    privacy: 'Structured evidence keeps sanitized URL paths, request IDs, phases and timestamps; no headers, request bodies, cookies or storage contents. Trace DOM/HAR snapshots and sources are disabled.',
    sourceContext: ['NotificationCoordinator is outside AuthGuard (src/App.tsx:949).', 'Foreground visibility effect is not user/preview gated (NotificationCoordinator.tsx:390); hidden update has catch at line 403.', 'notificationInstallation.ts:87 awaits getWorkingClient, then calls foreground RPC at line 90.', 'getWorkingClient returns a client without validating auth (supabase.ts:313); foreground RPC is not given fetch keepalive (supabase.ts:37).'],
    limitations: ['This is a browser/notification diagnostic, never Runner gameplay or production notification acceptance.', 'No authenticated or physical-device behavior is tested.', 'Page unloading can discard binding/error callbacks; missing events remain gaps.', 'Minimal async fixture approximates the first await, not the complete Supabase request chain.', 'All intentional JS-control errors remain in raw totals; there are no error exemptions.'],
  }
  const save = () => writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
  const browser = await webkit.launch({ headless: true })
  try {
    for (const scenario of REPRO_CASES.filter(value => options.scenario === 'all' || options.scenario === value)) {
      const isApp = scenario === 'app-signed-out'
      const timeline = createNarrativeTimeline()
      const result = { scenario, startedAt: new Date().toISOString(), checks: [], pageErrors: [], console: [], timeline: timeline.events,
        appBundles: [], runnerBundles: [], screenshots: [], pageStates: [] }
      report.results.push(result)
      const context = await browser.newContext({ viewport: { width: 740, height: 390 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
      const check = (name, passed, details) => result.checks.push({ name, passed: Boolean(passed), details })
      try {
        context.on('request', request => timeline.request('request', request))
        context.on('response', response => {
          timeline.request('response', response.request(), { status: response.status() })
          const pathname = new URL(response.url()).pathname
          if (/\/assets\/index-[^/]+\.js$/.test(pathname) && !result.appBundles.includes(pathname)) result.appBundles.push(pathname)
          if (/\/assets\/createShadowRunnerPhaserGame-[^/]+\.js$/.test(pathname) && !result.runnerBundles.includes(pathname)) result.runnerBundles.push(pathname)
        })
        context.on('requestfinished', request => timeline.request('requestfinished', request))
        context.on('requestfailed', request => timeline.request('requestfailed', request, { error: request.failure()?.errorText }))
        await context.route('**/*', async route => {
          const request = route.request()
          timeline.request('route-observed', request)
          const deny = async () => {
            timeline.request('route-abort-requested', request, { error: 'blockedbyclient' })
            try {
              await route.abort('blockedbyclient')
              timeline.request('route-abort-completed', request, { error: 'blockedbyclient' })
            } catch (error) {
              timeline.request('route-abort-failed', request, { error: error.message })
              throw error
            }
          }
          if (!allowRequest(request.url(), request.method(), options.baseUrl)) return deny()
          if (isApp) return route.continue()
          const url = new URL(request.url())
          if (url.pathname === FIXTURE_PATH) return route.fulfill({ contentType: 'text/html', body: fixtureHtml(scenario) })
          if (url.pathname === `${FIXTURE_PATH}fixture.js`) return route.fulfill({ contentType: 'text/javascript', body: `(${installMinimalFixture.toString()})(${JSON.stringify(scenario)},${JSON.stringify(REPRO_REMOTE_URL)});` })
          return deny()
        })
        await context.routeWebSocket(/.*/, socket => {
          timeline.emit('websocket-blocked', { url: socket.url() })
          socket.close({ code: 1000, reason: 'Loopback unload diagnostic only' })
        })
        await context.exposeBinding('__runnerUnloadRecord', (_source, event) => {
          if (event && browserEventKinds.has(event.kind)) timeline.emit(event.kind, event)
        })
        await context.addInitScript(observeUnloadPage)
        const page = await context.newPage()
        page.setDefaultTimeout(12000)
        page.on('console', message => {
          const entry = { type: message.type(), text: sanitizeNarrativeText(message.text()) }
          result.console.push(entry)
          timeline.emit('console', { name: entry.type, message: entry.text })
        })
        page.on('pageerror', error => {
          result.pageErrors.push(sanitizeNarrativeText(error.message))
          timeline.pageError(error)
        })
        page.on('framenavigated', frame => {
          if (frame === page.mainFrame()) timeline.emit('main-frame-navigated', { url: frame.url() })
        })
        page.on('domcontentloaded', () => timeline.emit('domcontentloaded', { url: page.url() }))
        await context.tracing.start({ screenshots: true, snapshots: false, sources: false })
        const ready = async () => {
          if (isApp) await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor({ timeout: 30000 })
          else await page.waitForFunction(() => window.__runnerUnloadState?.ready === true)
          await page.waitForTimeout(300)
        }
        const capture = async label => {
          const file = `${scenario}-${label}.png`
          await page.screenshot({ path: path.join(output, file) })
          result.screenshots.push(file)
          result.pageStates.push(await page.evaluate(() => ({ canvasCount: document.querySelectorAll('canvas').length,
            runnerDebugRegistered: typeof window.__shadowRunnerDebug === 'function', visibility: document.visibilityState,
            fixture: window.__runnerUnloadState ?? null })))
        }
        try {
          timeline.phase('initial-navigation')
          await page.goto(`${options.baseUrl}${isApp ? '/' : FIXTURE_PATH}`, { waitUntil: 'domcontentloaded' })
          await ready()
          timeline.phase('before-reload')
          if (scenario === 'minimal-visible-caught') {
            await page.getByRole('button', { name: 'Run caught fetch', exact: true }).click()
            await page.waitForFunction(() => window.__runnerUnloadState.caught === 1)
            check('visible fetch rejection reached its explicit catch', timeline.events.some(event => event.kind === 'fixture-caught'))
          }
          if (scenario === 'minimal-js-controls') {
            await page.getByRole('button', { name: 'Trigger unhandled rejection', exact: true }).click()
            await page.getByRole('button', { name: 'Trigger thrown error', exact: true }).click()
            await page.waitForTimeout(350)
            check('positive control observed an unhandled rejection event', timeline.events.some(event => event.kind === 'unhandledrejection' && event.message.includes('UNLOAD_REPRO_INTENTIONAL_UNHANDLED_REJECTION')))
            check('positive control observed a window error event', timeline.events.some(event => event.kind === 'window-error' && event.message.includes('UNLOAD_REPRO_INTENTIONAL_THROWN_ERROR')))
          }
          await capture('before-reload')
          timeline.phase('reload-pending')
          await page.reload({ waitUntil: 'domcontentloaded' })
          timeline.phase('reload-domcontentloaded')
          await ready()
          timeline.phase('after-reload')
          await capture('after-reload')
          check('reload completed into the intended page', true)
          check('no Runner canvas, scene registration or runtime bundle', result.runnerBundles.length === 0 && result.pageStates.every(state => state.canvasCount === 0 && !state.runnerDebugRegistered), { runtimeBundles: result.runnerBundles, pageStates: result.pageStates })
          check(isApp ? 'confirmed ordinary app index bundle loaded' : 'minimal fixture loaded no app index bundle', isApp
            ? result.appBundles.length === 1 && result.appBundles[0] === `/assets/index-${options.appHash}.js`
            : result.appBundles.length === 0, result.appBundles)
        } catch (error) {
          check('scenario completed', false, sanitizeNarrativeText(error.message))
          await capture('failure').catch(() => {})
        } finally {
          await context.tracing.stop({ path: path.join(output, `${scenario}-trace.zip`) }).catch(() => {})
        }
      } finally {
        timeline.phase('context-close')
        await context.close()
        timeline.emit('context-closed')
        result.evidence = summarizeUnloadEvidence(result)
        check('no raw page errors', result.pageErrors.length === 0, result.pageErrors)
        result.rawChecksPassed = result.checks.every(entry => entry.passed)
        result.finishedAt = new Date().toISOString()
        await save()
        console.log(`${scenario}: ${result.checks.filter(entry => entry.passed).length}/${result.checks.length} raw checks; pageerrors=${result.pageErrors.length}; window-error=${result.evidence.windowErrors.length}; unhandledrejection=${result.evidence.unhandledRejections.length}; caught=${result.evidence.caughtRejections.length}`)
      }
    }
  } finally { await browser.close() }
  report.finishedAt = new Date().toISOString()
  report.rawChecksPassed = report.results.every(result => result.rawChecksPassed)
  await save()
  return report
}

export async function selfTestUnloadRepro() {
  const { default: assert } = await import('node:assert/strict')
  const { runInNewContext } = await import('node:vm')
  const valid = ['--build-ready=self-test-only', '--app-hash=BXWCAg6U']
  assert.throws(() => parseUnloadOptions([]), /approval/)
  for (const url of ['https://127.0.0.1:4176', 'http://127.0.0.1.evil.test', 'http://name:pass@localhost:4176', 'http://localhost:4176/?token=x']) {
    assert.throws(() => parseUnloadOptions([...valid, `--base-url=${url}`]), /loopback/)
  }
  for (const arg of ['--run-name=../escape', '--app-hash=duplicate', '--case=unknown', '--remote-url=https://example.com']) assert.throws(() => parseUnloadOptions([...valid, arg]))
  assert.equal(parseUnloadOptions(valid).scenario, 'all')
  assert.equal(new URL(REPRO_REMOTE_URL).hostname, 'runner-unload.invalid')
  assert.equal(allowRequest(REPRO_REMOTE_URL, 'POST', 'http://127.0.0.1:4176'), false)
  assert.equal(safeNarrativeUrl('https://u:p@host.test/path?token=secret#fragment'), 'https://host.test/path')
  assert.throws(() => fixtureHtml('app-signed-out'))
  for (const mode of ['minimal-hidden-caught', 'minimal-hidden-microtask-caught']) {
    const events = []
    const listeners = {}
    let requests = 0
    const window = { __runnerUnloadRecord: async event => { events.push(event) } }
    runInNewContext(`(${installMinimalFixture.toString()})(${JSON.stringify(mode)},${JSON.stringify(REPRO_REMOTE_URL)})`, {
      window, document: { visibilityState: 'hidden', addEventListener: (name, handler) => { listeners[name] = handler }, getElementById: () => ({ addEventListener() {} }) },
      performance: { timeOrigin: 1000, now: () => 1 }, setTimeout,
      fetch: (url, options) => {
        requests += 1
        assert.equal(url, REPRO_REMOTE_URL)
        assert.equal(options.credentials, 'omit')
        assert.equal(options.keepalive, false)
        assert.equal(options.body, '{}')
        return Promise.reject(new Error('fixture network rejection'))
      },
    })
    listeners.visibilitychange()
    assert.equal(requests, mode === 'minimal-hidden-caught' ? 1 : 0)
    for (let index = 0; index < 10; index += 1) await Promise.resolve()
    assert.equal(requests, 1)
    assert.equal(window.__runnerUnloadState.caught, 1)
    assert.ok(events.some(event => event.kind === 'fixture-caught'))
  }
  const summary = summarizeUnloadEvidence({ timeline: [], pageErrors: ['intentional control error'] })
  assert.equal(summary.rawErrorFree, false)
  const source = await readFile(new URL(import.meta.url), 'utf8')
  const runner = source.slice(source.indexOf('export async function runUnloadRepro'), source.indexOf('export async function selfTestUnloadRepro'))
  assert.doesNotMatch(runner, /localStorage|storageState|launchPersistentContext|\.fetch\s*=|preventDefault|\.pageErrors\.(filter|pop|splice)/)
  assert.match(runner, /await mkdir\(output\)/)
  assert.match(runner, /await context\.close\(\)/)
  assert.match(runner, /finally \{ await browser\.close\(\) \}/)
  assert.match(runner, /snapshots: false, sources: false/)
  assert.match(runner, /result\.pageErrors\.push\(sanitizeNarrativeText\(error\.message\)\)/)
  console.log('PASS unload repro self-checks: arguments, network denial, credential sanitization, direct/microtask caught rejection, raw-error preservation and cleanup guards. No browser launched.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length === 3 && process.argv[2] === '--self-test') await selfTestUnloadRepro()
  else {
    const report = await runUnloadRepro(process.argv.slice(2))
    if (!report.rawChecksPassed) process.exitCode = 1
  }
}

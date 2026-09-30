import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { allowRequest } from '../scripts/shadow-runner-rebuild-lifecycle-smoke.mjs'
import { assessNoticeDuration, assessNoticeLayout, correlateNarrativeErrors, createNarrativeTimeline, FIRST_NOTE, isStoryOnlyProgress, NARRATIVE_PROFILES, observeNarrativePageLifecycle, parseNarrativeOptions, rectsOverlap, safeNarrativeUrl, sanitizeNarrativeText, SECOND_NOTE } from '../scripts/shadow-runner-narrative-smoke.mjs'

const confirmed = ['--build-ready=confirmed-test-only', '--runtime-hash=B__RdJ_9', '--games-home-hash=B-8N9J0u']
const rectangle = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
const layout = () => ({
  rect: rectangle(100, 200, 220, 46), viewport: { width: 932, height: 430 }, fontSize: 13,
  textRects: [rectangle(130, 212, 150, 18)],
  obstacles: [{ label: 'Move left', rect: rectangle(14, 340, 72, 72) }],
  hitTests: [{ notice: true }, { notice: true }],
})
const progress = () => ({ version: 2, ownerId: null, levels: {}, pending: {}, discoveredStoryIds: [FIRST_NOTE.id] })

test('requires fresh build/slot confirmation plus a concrete runtime hash', () => {
  assert.throws(() => parseNarrativeOptions([]), /confirmation/)
  assert.throws(() => parseNarrativeOptions(['--build-ready']), /confirmation/)
  assert.throws(() => parseNarrativeOptions(['--build-ready=confirmed']), /runtime-hash/)
  assert.throws(() => parseNarrativeOptions(['--build-ready=confirmed', '--runtime-hash=../../remote']), /runtime-hash/)
  assert.throws(() => parseNarrativeOptions(['--build-ready=confirmed', '--runtime-hash=B__RdJ_9']), /games-home-hash/)
  const options = parseNarrativeOptions(confirmed)
  assert.equal(options.baseUrl, 'http://127.0.0.1:4176')
  assert.equal(options.gamesHomeHash, 'B-8N9J0u')
  assert.equal(options.waypostDiagnostics, false)
  assert.equal(options.scenario, 'all')
})

test('rejects nonloopback, credentials, paths, query strings and unsafe output names', () => {
  for (const url of ['https://127.0.0.1:4176', 'http://localhost.example.test', 'https://example.test', 'http://user:password@localhost:4176', 'http://localhost:4176/private', 'http://localhost:4176/?token=secret']) {
    assert.throws(() => parseNarrativeOptions([...confirmed, `--base-url=${url}`]), /loopback/)
  }
  assert.throws(() => parseNarrativeOptions([...confirmed, '--run-name=../escape']), /safe output/)
  assert.throws(() => parseNarrativeOptions([...confirmed, '--build-ready=duplicate']), /repeated/)
  assert.throws(() => parseNarrativeOptions([...confirmed, '--profile=desktop']), /profile/)
  assert.throws(() => parseNarrativeOptions([...confirmed, '--case=force-win']), /case/)
  assert.throws(() => parseNarrativeOptions([...confirmed, '--unknown']), /argument/)
})

test('optional art diagnostics require an explicit switch and remain separate', () => {
  assert.equal(parseNarrativeOptions([...confirmed, '--waypost-diagnostics']).waypostDiagnostics, true)
  assert.equal(parseNarrativeOptions([...confirmed, '--waypost-diagnostics=false']).waypostDiagnostics, false)
  assert.equal(parseNarrativeOptions([...confirmed, '--case=wayposts', '--waypost-diagnostics']).scenario, 'wayposts')
  assert.throws(() => parseNarrativeOptions([...confirmed, '--case=wayposts']), /require/)
  assert.throws(() => parseNarrativeOptions([...confirmed, '--waypost-diagnostics=maybe']), /explicitly/)
})

test('covers the requested three phone viewports without opening a browser on import', () => {
  assert.deepEqual(NARRATIVE_PROFILES.map(({ name, browser, viewport }) => [name, browser, viewport.width, viewport.height]), [
    ['android', 'chromium', 932, 430], ['iphone', 'webkit', 740, 390], ['compact', 'chromium', 568, 320],
  ])
})

test('shared request policy blocks all remote and mutating traffic', () => {
  const origin = 'http://127.0.0.1:4176'
  assert.equal(allowRequest(`${origin}/assets/runtime.js`, 'GET', origin), true)
  assert.equal(allowRequest(`${origin}/rpc`, 'POST', origin), false)
  assert.equal(allowRequest('https://example.supabase.co/rest/v1/users', 'GET', origin), false)
  assert.equal(allowRequest('ws://127.0.0.1:4176/socket', 'GET', origin), false)
  assert.equal(allowRequest('http://127.0.0.1:4175/asset.png', 'GET', origin), false)
})

test('layout assessment accepts a readable, exposed target and detects HUD overlap', () => {
  assert.ok(Object.values(assessNoticeLayout(layout())).every(Boolean))
  const covered = layout()
  covered.obstacles.push({ label: 'Health HUD', rect: rectangle(150, 180, 90, 50) })
  assert.equal(assessNoticeLayout(covered).clearOfHudAndControls, false)
  assert.equal(rectsOverlap(rectangle(0, 0, 10, 10), rectangle(10, 0, 10, 10)), false)
})

test('layout assessment detects clipped text, tiny type, small targets and occlusion', () => {
  assert.deepEqual(assessNoticeLayout(null), { present: false })
  const clipped = layout()
  clipped.textRects = [rectangle(120, 210, 220, 20)]
  assert.equal(assessNoticeLayout(clipped).textFits, false)
  const tiny = layout()
  tiny.fontSize = 9
  tiny.rect = rectangle(-10, 200, 40, 30)
  tiny.hitTests = [{ notice: false }]
  const result = assessNoticeLayout(tiny)
  assert.equal(result.readableType, false)
  assert.equal(result.touchTarget, false)
  assert.equal(result.withinViewport, false)
  assert.equal(result.uncovered, false)
})

test('duration assessment requires a visible lifetime near 6.5 seconds', () => {
  const events = milliseconds => [{ kind: 'shown', at: 2000 }, { kind: 'hidden', at: 2000 + milliseconds }]
  assert.deepEqual(assessNoticeDuration(events(6500)), { durationMs: 6500, passed: true })
  assert.equal(assessNoticeDuration(events(6100)).passed, false)
  assert.equal(assessNoticeDuration(events(8001)).passed, false)
  assert.equal(assessNoticeDuration([{ kind: 'shown', at: 0 }]).passed, false)
  assert.equal(assessNoticeDuration([]).passed, false)
})

test('story-only proof rejects any fabricated completion, queue, owner or extra note', () => {
  assert.equal(isStoryOnlyProgress(progress()), true)
  for (const patch of [
    { levels: { tutorial: { completedAt: null } } }, { levels: [] }, { pending: [] },
    { pending: { tutorial: { revision: 'fake' } } }, { ownerId: 'real-user' },
    { profileRefreshPending: true }, { discoveredStoryIds: [FIRST_NOTE.id, SECOND_NOTE.id] },
    { discoveredStoryIds: [FIRST_NOTE.id, FIRST_NOTE.id] }, { discoveredStoryIds: [] },
  ]) assert.equal(isStoryOnlyProgress({ ...progress(), ...patch }), false)
  assert.equal(isStoryOnlyProgress(null), false)
})

test('expected reached and unreached copy matches the source catalog', async () => {
  const catalog = await readFile(new URL('../src/features/games/shadow-runner/game/campaignMoments.ts', import.meta.url), 'utf8')
  for (const note of [FIRST_NOTE, SECOND_NOTE]) for (const value of [note.id, note.title, note.body]) assert.ok(catalog.includes(value), `Catalog drift: ${value}`)
})

test('ordinary evidence has no QA mutations, seeded progress, builds or persistent user profiles', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-narrative-smoke.mjs', import.meta.url), 'utf8')
  const ordinary = source.slice(source.indexOf('async function ordinaryCase'), source.indexOf('async function waypostDiagnostic'))
  assert.doesNotMatch(ordinary, /__shadowRunnerQa|\.teleport\(|\.setItem\(|\.restore\(/)
  assert.doesNotMatch(source, /localStorage\.(setItem|removeItem|clear)|launchPersistentContext|storageState\s*:|child_process|spawn\(|execSync\(/)
  assert.match(source, /routeWebSocket/)
  assert.match(source, /serviceWorkers: 'block'/)
  assert.match(source, /finally \{\s+timeline\.phase\('context-close'\)\s+await context\.close\(\)/)
  assert.match(source, /finally \{ await browser\.close\(\) \}/)
  assert.match(source, /QA-assisted-art-diagnostic/)
  assert.match(source, /report\.ordinaryPassed = ordinary\.length/)
  assert.match(source, /report\.diagnosticsPassed = diagnostics\.length/)
  assert.match(source, /<div id="root" hidden>/)
  assert.match(source, /import\.meta\.url === pathToFileURL/)
})

test('network URLs and error text exclude credentials, query strings and fragments', () => {
  assert.equal(safeNarrativeUrl('https://person:secret@example.test/rest/v1/rpc/update?apikey=key#token'), 'https://example.test/rest/v1/rpc/update')
  assert.equal(safeNarrativeUrl('wss://person:secret@example.test/realtime?token=key'), 'wss://example.test/realtime')
  assert.equal(safeNarrativeUrl('not a URL secret'), '[invalid URL]')
  assert.equal(safeNarrativeUrl('data:text/plain,secret'), '[non-network URL]')
  const sanitized = sanitizeNarrativeText('Fetch https://urlUsername:urlPassword@example.test/rpc?apikey=hidden#fragment failed. Bearer bearerSecret; Basic basicSecret; "password":"passwordSecret" api_key=apiSecret refresh_token=refreshSecret client_secret=clientSecret')
  assert.match(sanitized, /https:\/\/example\.test\/rpc failed/)
  for (const secret of ['urlUsername', 'urlPassword', 'hidden', 'fragment', 'bearerSecret', 'basicSecret', 'passwordSecret', 'apiSecret', 'refreshSecret', 'clientSecret']) {
    assert.equal(sanitized.includes(secret), false, sanitized)
  }
})

test('timeline gives one exact request a stable ID across phases without retaining headers or bodies', () => {
  let now = 100
  const timeline = createNarrativeTimeline(() => now, Date.UTC(2026, 8, 8))
  const request = {
    url: () => 'https://name:pass@example.test/rpc/update?token=secret', method: () => 'POST', resourceType: () => 'fetch',
    isNavigationRequest: () => false, timing: () => ({ startTime: 1234 }),
    headers: () => { throw new Error('Must not read headers') }, postData: () => { throw new Error('Must not read bodies') },
  }
  timeline.phase('reload-pending')
  now = 112
  const sent = timeline.request('request', request, { headers: { authorization: 'secret' }, body: 'secret' })
  now = 116
  const abort = timeline.request('route-abort-requested', request, { error: 'blockedbyclient' })
  timeline.phase('reload-domcontentloaded')
  const failed = timeline.request('requestfailed', request, { error: 'net::ERR_ABORTED' })
  assert.equal(sent.requestId, abort.requestId)
  assert.equal(failed.requestId, sent.requestId)
  assert.equal(sent.phase, 'reload-pending')
  assert.equal(failed.phase, 'reload-domcontentloaded')
  assert.equal(sent.elapsedMs, 12)
  assert.equal(sent.timestamp, '2026-09-08T00:00:00.012Z')
  assert.equal(sent.requestStartEpochMs, 1234)
  assert.equal(sent.url, 'https://example.test/rpc/update')
  assert.doesNotMatch(JSON.stringify(timeline.events), /secret|authorization|headers|body|name:pass/)
  assert.deepEqual(timeline.events.map(event => event.sequence), [1, 2, 3, 4, 5])
  const different = { ...request }
  assert.notEqual(timeline.request('request', different).requestId, sent.requestId)
})

test('correlation reports exact-URL timing candidates but cannot promote an error to a pass', () => {
  let now = 0
  const timeline = createNarrativeTimeline(() => now, 0)
  const request = url => ({ url: () => url, method: () => 'POST', resourceType: () => 'fetch', isNavigationRequest: () => false, timing: () => ({}) })
  const rpc = request('https://example.test/rpc/foreground?token=secret')
  timeline.request('route-abort-requested', rpc)
  timeline.request('route-abort-completed', rpc)
  timeline.request('requestfailed', request('https://example.test/rest/v1/messages'))
  now = 16
  timeline.pageError({ name: 'Error', message: 'access control checks', stack: 'Fetch API cannot load https://example.test/rpc/foreground?token=secret due to access control checks.' })
  const before = JSON.stringify(timeline.events)
  const correlation = correlateNarrativeErrors(timeline.events)[0]
  assert.equal(correlation.requests.length, 1)
  assert.deepEqual(correlation.requests[0].events.map(event => event.kind), ['route-abort-requested', 'route-abort-completed'])
  assert.equal(correlation.requests[0].events[0].errorDeltaMs, -16)
  assert.match(correlation.basis, /not proof of causation/)
  assert.equal(Object.hasOwn(correlation, 'passed'), false)
  assert.equal(JSON.stringify(timeline.events), before)
  now = 5000
  timeline.pageError({ name: 'Error', message: 'https://example.test/rpc/foreground failed', stack: '' })
  assert.deepEqual(correlateNarrativeErrors(timeline.events).at(-1).requests, [])
  assert.equal(timeline.events.filter(event => event.kind === 'pageerror').length, 2)
})

test('page lifecycle listeners observe errors and navigation without handling or replacing them', async () => {
  const windowListeners = {}
  const documentListeners = {}
  const captured = []
  const fetch = () => {}
  runInNewContext(`(${observeNarrativePageLifecycle.toString()})()`, {
    window: { fetch, addEventListener: (name, handler) => { windowListeners[name] = handler }, __runnerNarrativeRecord: async event => { captured.push(event) } },
    document: { visibilityState: 'hidden', addEventListener: (name, handler) => { documentListeners[name] = handler } },
    location: { href: 'http://127.0.0.1:4176/' }, performance: { timeOrigin: 1000, now: () => 50 },
  })
  const preventDefault = () => { throw new Error('Must not suppress errors') }
  documentListeners.visibilitychange({ preventDefault })
  windowListeners.pagehide({ persisted: false, preventDefault })
  windowListeners.error({ message: 'original error', lineno: 1, colno: 2, preventDefault })
  windowListeners.unhandledrejection({ reason: new Error('original rejection'), preventDefault })
  await Promise.resolve()
  assert.deepEqual(captured.map(event => event.kind), ['observer-ready', 'visibilitychange', 'pagehide', 'window-error', 'unhandledrejection'])
  assert.ok(captured.every(event => event.browserEpochMs === 1050))
  assert.equal(captured.at(-1).message, 'original rejection')
  assert.doesNotMatch(observeNarrativePageLifecycle.toString(), /preventDefault|stopPropagation|\.fetch\s*=|onerror\s*=/)
})

test('retake preserves raw failure checks, network denial, prior reports and credential-free trace policy', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-narrative-smoke.mjs', import.meta.url), 'utf8')
  assert.match(source, /await mkdir\(output\)/)
  assert.doesNotMatch(source, /mkdir\(output, \{ recursive: true \}\)/)
  assert.match(source, /result\.pageErrors\.push\(sanitize\(error\.message\)\)/)
  assert.match(source, /record\('no unhandled page errors', result\.pageErrors\.length === 0/)
  assert.match(source, /pageErrorCheck\.passed = result\.pageErrors\.length === 0/)
  assert.match(source, /snapshots: false, sources: false/)
  for (const event of ['request', 'response', 'requestfinished', 'requestfailed']) assert.ok(source.includes(`context.on('${event}'`))
  for (const event of ['route-abort-requested', 'route-abort-completed', 'route-abort-failed', 'reload-pending', 'reload-domcontentloaded']) assert.ok(source.includes(`'${event}'`))
  assert.doesNotMatch(source, /\.fetch\s*=|\.pageErrors\.(filter|splice|pop)|expected.*pageErrors/i)
})

test('waypost diagnostics cross the sprite/body boundary with bounded real input', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-narrative-smoke.mjs', import.meta.url), 'utf8')
  const diagnostic = source.slice(source.indexOf('async function waypostDiagnostic'), source.indexOf('export async function runNarrativeSmoke'))
  assert.match(diagnostic, /window\.__runnerWaypostGame\.setPaused\(false\)/)
  assert.match(diagnostic, /page\.keyboard\.down\('ArrowRight'\)/)
  assert.match(diagnostic, /state\?\.checkpointId === id \|\| state\?\.player\?\.x >= x \+ 20/)
  assert.match(diagnostic, /finally \{ await page\.keyboard\.up\('ArrowRight'\) \}/)
  assert.ok(diagnostic.indexOf('const after = await debug(page)') < diagnostic.indexOf('teleport(x + 64, floorY)'))
})

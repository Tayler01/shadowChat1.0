// Local rendering diagnostic. Counts WebGL submissions, not just browser rAFs.
// No production settings are changed; --dpr overrides the player in this context.
// --accelerated removes Playwright's Windows-only software compositing flag.
// --skip-draws isolates draw cost and is never visual/playability evidence.
// --passes records one draw/program trace after timing; inspection is excluded
// from reported cadence and CPU samples.
// --king-loop checks a four-jump king animation and confirming snapshot.
// --base-url uses an existing public-assets server instead of our local server.
// --camera-motion pans smoothly within +/-18 degrees during the timed sample.
import { chromium, webkit, devices } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

// Serve only public assets, and close our own server in finally. No previously
// generated preview or authenticated application session is needed.
const root = resolve('public')
const server = createServer(async (request, response) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname))
    if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) { response.writeHead(404).end(); return }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm' }
    response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    createReadStream(path).pipe(response)
  } catch { response.writeHead(404).end() }
})
const externalBase = process.argv.find(value => value.startsWith('--base-url='))?.slice('--base-url='.length)
if (!externalBase) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const baseUrl = externalBase || `http://127.0.0.1:${server.address().port}`
const pieces = []
for (const row of [0, 1, 2, 5, 6, 7]) for (let col = 0; col < 8; col++) {
  if ((row + col) % 2 === 1) pieces.push({ id: `p${row < 3 ? 2 : 1}-${row}-${col}`, owner: row < 3 ? 'player_two' : 'player_one', row, col, king: false })
}
const snapshot = { version: 1, revision: 'render-profile-opening', pieces, viewerSlot: 'player_one', selectedPieceId: null, destinations: [], helpers: [], lastPath: [], lastCaptures: [], disabled: false, showHints: false, reducedMotion: false, highContrast: false, boardSkin: 'cinematic', soundEnabled: false, ambienceEnabled: false }
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="/games/shadow-checkers/unity/frame.html" title="Shadow Checkers rendering fixture"></iframe><script>
const frame=document.querySelector('iframe');window.probeEvents=[];
addEventListener('message',event=>{if(event.source!==frame.contentWindow||event.origin!==location.origin)return;window.probeEvents.push({...event.data,receivedAt:performance.now()});if(event.data.type==='ready'){frame.contentWindow.postMessage({version:1,type:'snapshot',value:${JSON.stringify(snapshot)}},location.origin);frame.contentWindow.postMessage({version:1,type:'camera',value:'reset'},location.origin);frame.dataset.ready='true'}});
</script></body></html>`

const iphone = process.argv.includes('--webkit')
const skipDraws = process.argv.includes('--skip-draws')
const interact = process.argv.includes('--interact')
const passes = process.argv.includes('--passes')
const accelerated = process.argv.includes('--accelerated')
const cameraMotion = process.argv.includes('--camera-motion')
assert(!accelerated || (iphone && process.platform === 'win32'), '--accelerated is a Windows WebKit comparison')
const dpr = Number(process.argv.find(value => value.startsWith('--dpr='))?.split('=')[1] || 2)
assert(dpr >= 1 && dpr <= 2, 'Use a rendering DPR between 1 and 2')
const output = `output/playwright/shadow-checkers-unity/render-${iphone ? 'webkit' : 'chromium'}-${dpr}${skipDraws ? '-skip-draws' : ''}${cameraMotion ? '-camera' : ''}-${Date.now()}`
await mkdir(output, { recursive: true })
const report = { engine: iphone ? 'webkit' : 'chromium', platform: process.platform, dpr, skipDraws, accelerated, interact, fixture: 'isolated 24-piece opening board, full-viewport player, no application shell', status: 'running', errors: [], manifest: JSON.parse(await readFile('public/games/shadow-checkers/unity/build-manifest.json', 'utf8')) }
const browser = await (iphone ? webkit : chromium).launch({ headless: false, ...(accelerated && iphone ? { ignoreDefaultArgs: ['--disable-accelerated-compositing'] } : {}) })
try {
  const context = await browser.newContext({ ...devices[iphone ? 'iPhone 13' : 'Pixel 7'], viewport: { width: 915, height: 412 }, serviceWorkers: 'block' })
  try {
    await context.route('**/__shadow-checkers-render-profile', route => route.fulfill({ contentType: 'text/html', body: fixture }))
    await context.route('**/games/shadow-checkers/unity/frame.js', async route => {
      const response = await route.fetch()
      const body = await response.text()
      const setting = /devicePixelRatio:\s*Math\.min\(window\.devicePixelRatio\s*\|\|\s*1,\s*[\d.]+\)/
      assert(setting.test(body), 'Update the diagnostic for the current player resolution setting')
      await route.fulfill({ response, body: body.replace(setting, `devicePixelRatio: ${dpr},
        preMainLoop: () => { window.renderProbe.loopStart = performance.now() },
        postMainLoop: () => { window.renderProbe.loopDurations.push(performance.now() - window.renderProbe.loopStart); if (window.renderProbe.passCapture) { window.renderProbe.passCapture = false; window.renderProbe.passComplete = true } }`) })
    })
    await context.addInitScript(() => {
      window.renderProbe = { calls: 0, methods: {}, drawCpuMs: 0, skipDraws: false, loopDurations: [], textureUploads: {} }
      const programs = new Map()
      const targets = new Map()
      for (const prototype of new Set([window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype])) {
        if (!prototype) continue
        for (const name of ['texImage2D', 'compressedTexImage2D', 'texStorage2D']) {
          if (!Object.prototype.hasOwnProperty.call(prototype, name)) continue
          const original = prototype[name]
          prototype[name] = function (...args) {
            if (this.canvas.id === 'board') {
              const key = `${name}:0x${Number(args[2]).toString(16)}`
              window.renderProbe.textureUploads[key] = (window.renderProbe.textureUploads[key] || 0) + 1
            }
            return original.apply(this, args)
          }
        }
        for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
          if (!Object.prototype.hasOwnProperty.call(prototype, name)) continue
          const original = prototype[name]
          prototype[name] = function (...args) {
            if (this.canvas.id === 'board') {
              window.renderProbe.calls++
              window.renderProbe.methods[name] = (window.renderProbe.methods[name] || 0) + 1
              // Deliberately expensive inspection, enabled for one separate frame
              // after timing finishes. It must never affect performance samples.
              if (window.renderProbe.passCapture) {
                const program = this.getParameter(this.CURRENT_PROGRAM)
                if (!programs.has(program)) {
                  programs.set(program, programs.size)
                  window.renderProbe.programs.push({ id: programs.get(program), shaders: this.getAttachedShaders(program).map(shader => ({ type: this.getShaderParameter(shader, this.SHADER_TYPE), source: this.getShaderSource(shader) })) })
                }
                const target = this.getParameter(this.FRAMEBUFFER_BINDING)
                if (!targets.has(target)) targets.set(target, targets.size)
                window.renderProbe.passes.push({ program: programs.get(program), target: targets.get(target), viewport: Array.from(this.getParameter(this.VIEWPORT)), method: name, count: name.startsWith('drawArrays') ? args[2] : args[1], instances: name.endsWith('Instanced') ? args.at(-1) : 1 })
              }
              if (window.renderProbe.skipDraws) return
              const start = performance.now()
              const result = original.apply(this, args)
              window.renderProbe.drawCpuMs += performance.now() - start
              return result
            }
            return original.apply(this, args)
          }
        }
      }
    })
    const page = await context.newPage()
    report.consoleErrors = []
    report.requestFailures = []
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1000)) })
    page.on('requestfailed', request => report.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }))
    page.on('pageerror', error => report.errors.push(error.message))
    page.setDefaultTimeout(45000)
    // Record this browser's foreground rAF cadence before Unity is involved.
    await page.goto('about:blank')
    await page.bringToFront()
    report.idleRaf = await page.evaluate(() => new Promise(resolve => {
      const start = performance.now(); let callbacks = 0
      function sample(now) {
        callbacks++
        if (now - start < 1500) requestAnimationFrame(sample)
        else resolve({ callbacks, elapsedMs: now - start, callbacksPerSecond: callbacks * 1000 / (now - start) })
      }
      requestAnimationFrame(sample)
    }))
    await page.goto(`${baseUrl}/__shadow-checkers-render-profile`)
    await Promise.race([
      page.locator('iframe[data-ready=true]').waitFor({ timeout: 180000 }),
      page.waitForFunction(() => window.probeEvents.some(event => event.type === 'error'), null, { timeout: 180000 }).then(() => { throw new Error('Unity player reported a startup error') }),
    ]).catch(async error => {
      report.startupEvents = await page.evaluate(() => window.probeEvents).catch(() => [])
      throw error
    })
    await page.waitForFunction(() => window.probeEvents.some(event => event.type === 'rendered' && event.revision === 'render-profile-opening'))
    if (interact) await page.frameLocator('iframe').locator('#board').tap({ position: { x: 8, y: 8 } })
    await page.bringToFront()
    await page.waitForTimeout(1000)
    const frame = page.frames().find(item => item.url().includes('/games/shadow-checkers/unity/'))
    await frame.evaluate(skip => { window.renderProbe.skipDraws = skip; window.renderProbe.loopDurations = [] }, skipDraws)
    await page.evaluate(cameraMotion => {
      window.parentRafProbe = { callbacks: 0, gestures: 0, turn: 0, start: performance.now(), stopped: false, initialProjection: window.probeEvents.findLast(event => event.type === 'projection')?.squares }
      function sample(now) {
        const probe = window.parentRafProbe
        if (probe.stopped) return
        probe.callbacks++
        if (cameraMotion) {
          const turn = .2 * Math.sin((now - probe.start) * Math.PI * 2 / 6000)
          document.querySelector('iframe').contentWindow.postMessage({ version: 1, type: 'cameraGesture', value: { turn: turn - probe.turn } }, location.origin)
          probe.turn = turn; probe.gestures++
        }
        requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    }, cameraMotion)
    report.render = await frame.evaluate(() => new Promise(resolve => {
      const canvas = document.querySelector('#board')
      const gl = canvas.getContext('webgl2')
      const debug = gl?.getExtension('WEBGL_debug_renderer_info')
      const start = performance.now(), firstCalls = window.renderProbe.calls, firstCpuMs = window.renderProbe.drawCpuMs
      const intervals = [], drawsPerFrame = []
      let lastCalls = firstCalls, lastSubmission = null, callbacks = 0
      function sample(now) {
        callbacks++
        const calls = window.renderProbe.calls
        if (calls !== lastCalls) {
          if (lastSubmission !== null) intervals.push(now - lastSubmission)
          lastSubmission = now
          drawsPerFrame.push(calls - lastCalls)
          lastCalls = calls
        }
        if (now - start < 8000) { requestAnimationFrame(sample); return }
        intervals.sort((a, b) => a - b)
        const percentile = p => intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * p))] ?? null
        resolve({ elapsedMs: now - start, callbacks, submittedFrames: drawsPerFrame.length, submissionsPerSecond: drawsPerFrame.length * 1000 / (now - start), drawCalls: calls - firstCalls, drawCpuMs: window.renderProbe.drawCpuMs - firstCpuMs, methodsSinceLoad: window.renderProbe.methods, medianDrawsPerFrame: drawsPerFrame.sort((a, b) => a - b)[Math.floor(drawsPerFrame.length / 2)], medianSubmissionMs: percentile(.5), p95SubmissionMs: percentile(.95), over50Ms: intervals.filter(value => value > 50).length, canvas: { width: canvas.width, height: canvas.height }, renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null, note: window.renderProbe.skipDraws ? 'Diagnostic only: counts attempted draws while suppressing GPU draw submission. Not visual or playable evidence.' : 'Desktop WebGL submission cadence; not GPU completion timing or physical-phone performance.' })
      }
      requestAnimationFrame(sample)
    }))
    report.parentRaf = await page.evaluate(() => {
      const probe = window.parentRafProbe; probe.stopped = true
      return { callbacks: probe.callbacks, callbacksPerSecond: probe.callbacks * 1000 / (performance.now() - probe.start), gestures: probe.gestures }
    })
    report.loop = await frame.evaluate(() => {
      const samples = window.renderProbe.loopDurations.slice().sort((a, b) => a - b)
      return { samples: samples.length, medianMs: samples[Math.floor(samples.length * .5)], p95Ms: samples[Math.floor(samples.length * .95)], totalMs: samples.reduce((total, value) => total + value, 0) }
    })
    report.textures = await frame.evaluate(() => {
      const gl = document.querySelector('#board').getContext('webgl2')
      const extensions = gl.getSupportedExtensions()
      return {
        astcSupported: extensions.includes('WEBGL_compressed_texture_astc'),
        etc2Supported: extensions.includes('WEBGL_compressed_texture_etc'),
        dxtSupported: extensions.includes('WEBGL_compressed_texture_s3tc'),
        uploads: window.renderProbe.textureUploads,
        note: 'Observed API formats on this device; not a measurement of GPU allocation. Run on a physical phone to verify native ASTC uploads.',
      }
    })
    if (cameraMotion) {
      await page.waitForTimeout(300)
      const changed = await page.evaluate(() => JSON.stringify(window.parentRafProbe.initialProjection) !== JSON.stringify(window.probeEvents.findLast(event => event.type === 'projection')?.squares))
      assert(report.parentRaf.gestures > 0 && changed, 'Camera gestures must change the actual Unity projection')
      report.cameraMotion = { status: 'passed', boundedDegrees: 18, periodMs: 6000, gestureMessages: report.parentRaf.gestures, projectionChanged: changed }
    }
    if (process.argv.includes('--capture') && !skipDraws) await page.screenshot({ path: `${output}/landscape.png` })
    if (process.argv.includes('--king-loop')) {
      const king = { id: 'loop-king', owner: 'player_one', row: 5, col: 2, king: true }
      const captures = [[4, 3], [2, 3], [2, 1], [4, 1]].map(([row, col]) => ({ row, col }))
      const setup = { ...snapshot, revision: 'loop-setup', reducedMotion: true, pieces: [king, ...captures.map((square, index) => ({ ...square, id: `loop-victim-${index}`, owner: 'player_two', king: false }))] }
      const present = value => page.evaluate(value => document.querySelector('iframe').contentWindow.postMessage({ version: 1, type: 'snapshot', value }, location.origin), value)
      await present(setup)
      await page.waitForFunction(() => window.probeEvents.some(event => event.type === 'rendered' && event.revision === 'loop-setup'))
      await page.evaluate(() => { window.probeEvents = [] })
      const path = [[5, 2], [3, 4], [1, 2], [3, 0], [5, 2]].map(([row, col]) => ({ row, col }))
      const finished = { ...setup, revision: 'loop-finished', reducedMotion: false, pieces: [king], lastPath: path, lastCaptures: captures, lastMove: { pieceId: king.id, path, captures } }
      await present(finished)
      await page.waitForFunction(() => window.probeEvents.some(event => event.type === 'cinematic' && event.stage === 'move' && event.busy))
      await page.waitForFunction(() => window.probeEvents.some(event => event.type === 'cinematic' && !event.busy))
      const events = await page.evaluate(() => window.probeEvents)
      const placements = events.filter(event => event.type === 'sound' && event.cue === 'place')
      const victims = events.filter(event => event.type === 'sound' && event.cue === 'capture')
      const start = events.find(event => event.type === 'cinematic' && event.stage === 'move' && event.busy)
      const end = events.find(event => event.type === 'cinematic' && !event.busy)
      assert.equal(placements.length, 4, 'The loop must animate all four landings')
      assert.equal(victims.length, 4, 'All four victims must animate their captures')
      assert(end.receivedAt - start.receivedAt > 1800, 'The loop must play through its path instead of popping in place')
      await page.evaluate(() => { window.probeEvents = [] })
      await present({ ...finished, revision: 'loop-confirmed' })
      await page.waitForTimeout(500)
      assert.equal(await page.evaluate(() => window.probeEvents.filter(event => event.type === 'cinematic' && event.busy).length), 0, 'A confirming snapshot must not replay the capture')
      report.kingLoop = { status: 'passed', captures: victims.length, landings: placements.length, elapsedMs: end.receivedAt - start.receivedAt, landingTimesMs: placements.map(event => event.receivedAt - start.receivedAt), confirmationDidNotReplay: true, note: 'Actual compiled Unity movement/capture lifecycle and timed landing cues; not physical-device visual proof.' }
    }
    if (passes) {
      await frame.evaluate(() => { Object.assign(window.renderProbe, { passCapture: true, passComplete: false, passes: [], programs: [] }) })
      await frame.waitForFunction(() => window.renderProbe.passComplete)
      const captured = await frame.evaluate(() => ({ draws: window.renderProbe.passes, programs: window.renderProbe.programs }))
      await writeFile(`${output}/passes.json`, JSON.stringify(captured, null, 2))
      report.passes = { draws: captured.draws.length, programs: captured.programs.length, file: 'passes.json' }
    }
    assert(report.loop.samples > 0, 'Unity main-loop hooks were not observed; update the diagnostic for this runtime')
    assert(report.render.submittedFrames > 0, 'No Unity draw submissions were observed')
    assert.equal(report.errors.length, 0, report.errors.join('\n'))
    assert.equal(report.consoleErrors.length, 0, report.consoleErrors.join('\n'))
    report.status = 'passed'
  } finally { await context.close() }
} catch (error) { report.status = 'failed'; report.error = String(error); throw error }
finally {
  await browser.close()
  if (!externalBase) await new Promise(resolve => server.close(resolve))
  await writeFile(`${output}/summary.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ output, status: report.status, interact, accelerated, idleRaf: report.idleRaf, parentRaf: report.parentRaf, render: report.render, loop: report.loop, cameraMotion: report.cameraMotion, kingLoop: report.kingLoop, error: report.error }))
}

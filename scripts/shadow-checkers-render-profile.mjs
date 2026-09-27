// Local rendering diagnostic. Counts WebGL submissions, not just browser rAFs.
// No production settings are changed; --dpr overrides the player in this context.
// --accelerated removes Playwright's Windows-only software compositing flag.
// --skip-draws isolates draw cost and is never visual/playability evidence.
// --passes records one draw/program trace after timing; inspection is excluded
// from reported cadence and CPU samples.
import { chromium, webkit, devices } from 'playwright'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const iphone = process.argv.includes('--webkit')
const skipDraws = process.argv.includes('--skip-draws')
const interact = process.argv.includes('--interact')
const passes = process.argv.includes('--passes')
const accelerated = process.argv.includes('--accelerated')
assert(!accelerated || (iphone && process.platform === 'win32'), '--accelerated is a Windows WebKit comparison')
const dpr = Number(process.argv.find(value => value.startsWith('--dpr='))?.split('=')[1] || 2)
assert(dpr >= 1 && dpr <= 2, 'Use a rendering DPR between 1 and 2')
const output = `output/playwright/shadow-checkers-unity/render-${iphone ? 'webkit' : 'chromium'}-${dpr}${skipDraws ? '-skip-draws' : ''}-${Date.now()}`
await mkdir(output, { recursive: true })
const report = { engine: iphone ? 'webkit' : 'chromium', platform: process.platform, dpr, skipDraws, accelerated, interact, status: 'running', errors: [], manifest: JSON.parse(await readFile('public/games/shadow-checkers/unity/build-manifest.json', 'utf8')) }
const browser = await (iphone ? webkit : chromium).launch({ headless: false, ...(accelerated && iphone ? { ignoreDefaultArgs: ['--disable-accelerated-compositing'] } : {}) })
try {
  const context = await browser.newContext({ ...devices[iphone ? 'iPhone 13' : 'Pixel 7'], viewport: { width: 915, height: 412 }, serviceWorkers: 'block' })
  try {
    await context.route('**/games/shadow-checkers/unity/frame.js', async route => {
      const response = await route.fetch()
      const body = await response.text()
      const setting = 'devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2)'
      assert(body.includes(setting), 'Update the diagnostic for the current player resolution setting')
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
    await page.goto('http://127.0.0.1:4195/output/shadow-checkers-cinematic-preview.html?scenario=opening')
    await page.locator('iframe[data-ready=true]').waitFor({ timeout: 180000 })
    await page.getByRole('button', { name: 'Camera help', exact: true }).click()
    await page.getByRole('button', { name: 'Reset table camera' }).click()
    if (interact) await page.frameLocator('iframe').locator('#board').tap({ position: { x: 8, y: 8 } })
    await page.bringToFront()
    await page.waitForTimeout(1000)
    const frame = page.frames().find(item => item.url().includes('/games/shadow-checkers/unity/'))
    await frame.evaluate(skip => { window.renderProbe.skipDraws = skip; window.renderProbe.loopDurations = [] }, skipDraws)
    await page.evaluate(() => {
      window.parentRafProbe = { callbacks: 0, start: performance.now(), stopped: false }
      function sample() {
        window.parentRafProbe.callbacks++
        if (!window.parentRafProbe.stopped) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
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
      return { callbacks: probe.callbacks, callbacksPerSecond: probe.callbacks * 1000 / (performance.now() - probe.start) }
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
    if (process.argv.includes('--capture') && !skipDraws) await page.screenshot({ path: `${output}/landscape.png` })
    report.status = 'passed'
  } finally { await context.close() }
} catch (error) { report.status = 'failed'; report.error = String(error); throw error }
finally {
  await browser.close()
  await writeFile(`${output}/summary.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ output, status: report.status, interact, accelerated, idleRaf: report.idleRaf, parentRaf: report.parentRaf, render: report.render, loop: report.loop, error: report.error }))
}

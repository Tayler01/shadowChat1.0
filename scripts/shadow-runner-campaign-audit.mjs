import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { chromium, webkit } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')))
const depthInput = args['depth-input'] === 'true'
const depthCases = {
  'level-8': { count: 11, nearIndex: 5, farRate: 0.16, nearRate: 0.28, files: ['courier-catacombs-background.webp', 'catacomb-hanging-lantern.webp'] },
  'level-9': { count: 14, nearIndex: 6, farRate: 0.14, nearRate: 0.28, files: ['captain-gate-background.webp', 'watch-banner.webp'] },
  'level-10': { count: 16, nearIndex: 7, farRate: 0.14, nearRate: 0.24, files: ['dawn-relay-spire-background.webp', 'relay-hanging-cage.webp'] },
}
if (args['depth-input'] && (!depthInput || !depthCases[args.level])) throw new Error('Depth input audit requires --depth-input=true and level-8, level-9 or level-10')
const baseUrl = args['base-url'] ?? 'http://127.0.0.1:4176'
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(baseUrl).hostname)) {
  throw new Error('Campaign audit uses disposable local progress and requires a loopback preview.')
}
const output = path.resolve('output/playwright', args['run-name'] ?? 'shadow-runner-campaign-audit')
if (!/^[a-z0-9][a-z0-9._-]*$/i.test(args['run-name'] ?? 'shadow-runner-campaign-audit')) throw new Error('Invalid run name')
await mkdir(path.dirname(output), { recursive: true })
await mkdir(output)
const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'))
const optimizedAtlases = JSON.parse(await readFile('source-assets/shadow-runner/optimized-atlases/manifest.json', 'utf8'))
const expectedBundles = []
for (const name of ['createShadowRunnerPhaserGame', 'GamesHome']) {
  const matches = Object.values(manifest).filter(entry => entry.name === name)
  if (matches.length !== 1) throw new Error(`Build identity is missing or ambiguous: ${name}`)
  const file = matches[0].file
  expectedBundles.push({ path: `/${file}`, sha256: createHash('sha256').update(await readFile(path.join('dist', file))).digest('hex') })
}
const levels = [
  ['tutorial', 'Tutorial Run'], ['level-1', 'East Gate Run'],
  ['level-2', 'Lantern Market Roofs'], ['level-3', 'Ivy Viaduct'],
  ['level-4', 'Bell Tower Archives'], ['level-5', 'Candle Fair Ruins'],
  ['level-6', 'Clockmaker Yard'], ['level-7', 'Moonlit Causeway'],
  ['level-8', 'Courier Catacombs'], ['level-9', 'Captain Gate'],
  ['level-10', 'Dawn Relay Spire'],
].filter(([id]) => !args.level || args.level === id)
const profiles = [
  { name: 'android', engine: chromium, viewport: { width: 932, height: 430 } },
  { name: 'iphone', engine: webkit, viewport: { width: 740, height: 390 } },
].filter(profile => !args.profile || args.profile === profile.name)
const report = { startedAt: new Date().toISOString(), baseUrl, expectedBundles,
  scope: 'Launch, visual, pause and frame-scheduling baseline. Not a complete playthrough or physical-device GPU proof.', results: [] }

for (const profile of profiles) {
  const browser = await profile.engine.launch({ headless: true })
  try {
    for (const [levelId, title] of levels) {
      const context = await browser.newContext({ viewport: profile.viewport, isMobile: true, hasTouch: true, serviceWorkers: 'block' })
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseUrl).origin ? route.continue() : route.abort())
      await context.routeWebSocket('**/*', socket => socket.close())
      const result = { profile: profile.name, levelId, title, errors: [], requestsFailed: [], loadedBundles: [] }
      const bundleJobs = []
      const page = await context.newPage()
      page.on('pageerror', error => result.errors.push(error.message))
      page.on('requestfailed', request => result.requestsFailed.push({ url: new URL(request.url()).pathname, failure: request.failure()?.errorText }))
      page.on('response', response => {
        const url = new URL(response.url())
        if (url.origin !== new URL(baseUrl).origin || !expectedBundles.some(bundle => bundle.path === url.pathname)) return
        bundleJobs.push(response.body().then(bytes => result.loadedBundles.push({ path: url.pathname,
          sha256: createHash('sha256').update(bytes).digest('hex') })).catch(error => result.errors.push(`Bundle hash: ${error.message}`)))
      })
      try {
        await page.addInitScript(() => {
          localStorage.setItem('shadow-runner-campaign-progress-v1', JSON.stringify({
            completedLevels: ['tutorial', ...Array.from({ length: 10 }, (_, i) => `level-${i + 1}`)],
          }))
          localStorage.setItem('shadow-runner-music-enabled-v1', 'false')
          localStorage.setItem('shadow-runner-sfx-enabled-v1', 'false')
        })
        await page.goto(`${baseUrl}/?view=games&localPreview=shadow-runner`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: /Select Level/i }).waitFor()
        if (levelId === 'tutorial') {
          await page.screenshot({ path: path.join(output, `${profile.name}-title.png`) })
          await page.getByRole('button', { name: /Start Tutorial/i }).click()
        } else {
          await page.getByRole('button', { name: /Select Level/i }).click()
          await page.getByRole('button', { name: new RegExp(`${title} details`) }).click()
          await page.getByRole('dialog', { name: title, exact: true }).waitFor()
          await page.screenshot({ path: path.join(output, `${profile.name}-${levelId}-brief.png`) })
          await page.getByRole('button', { name: /^(Start|Replay)$/i }).click()
        }
        await page.waitForFunction(id => window.__shadowRunnerDebug?.().levelId === id, levelId)
        const begin = page.getByRole('button', { name: 'Begin delivery', exact: true })
        await begin.waitFor()
        await page.screenshot({ path: path.join(output, `${profile.name}-${levelId}-delivery.png`) })
        await begin.click()
        result.frames = await page.evaluate(() => new Promise(resolve => {
          const deltas = []
          let last = performance.now()
          const start = last
          const sample = now => {
            deltas.push(now - last)
            last = now
            if (now - start < 3000) return requestAnimationFrame(sample)
            deltas.sort((a, b) => a - b)
            resolve({ count: deltas.length, p50: deltas[Math.floor(deltas.length * 0.5)], p95: deltas[Math.floor(deltas.length * 0.95)], max: deltas.at(-1), over50ms: deltas.filter(n => n > 50).length })
          }
          requestAnimationFrame(sample)
        }))
        result.start = await page.evaluate(() => window.__shadowRunnerDebug?.())
        result.surface = await page.evaluate(() => {
          const canvas = document.querySelector('canvas')
          const gl = canvas?.getContext('webgl') ?? canvas?.getContext('webgl2')
          return {
          graphics: gl ? { version: gl.getParameter(gl.VERSION), maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
            drawingBufferWidth: gl.drawingBufferWidth, drawingBufferHeight: gl.drawingBufferHeight } : { version: 'no WebGL context' },
          viewport: { width: innerWidth, height: innerHeight },
          canvases: document.querySelectorAll('canvas').length,
          overflow: document.documentElement.scrollWidth > innerWidth,
          text: document.body.innerText,
          textSizes: [...document.querySelectorAll('span,p,h1,h2,h3,button')]
            .filter(el => el.getBoundingClientRect().width && el.textContent.trim() && !el.children.length)
            .map(el => ({ text: el.textContent.trim().slice(0, 80), px: Number.parseFloat(getComputedStyle(el).fontSize) })),
          assets: performance.getEntriesByType('resource').filter(e => e.name.includes('/games/shadow-runner/'))
            .map(e => ({ path: new URL(e.name).pathname, bytes: e.encodedBodySize, duration: e.duration })),
        } })
        const requestedAtlases = optimizedAtlases.filter(atlas => result.surface.assets.some(asset => asset.path === atlas.output.replace(/^public/, '')))
        result.decodedAtlases = await page.evaluate(async atlases => {
          const decoded = []
          for (const atlas of atlases) {
            const image = new Image()
            image.src = atlas.output.replace(/^public/, '')
            await image.decode()
            decoded.push({ path: image.src, width: image.naturalWidth, height: image.naturalHeight })
          }
          return decoded
        }, requestedAtlases)
        assert.deepEqual(result.decodedAtlases.map(image => [image.width, image.height]), requestedAtlases.map(atlas => [atlas.width, atlas.height]), 'Browser atlas dimensions must preserve authored crops')
        await page.screenshot({ path: path.join(output, `${profile.name}-${levelId}-play.png`) })
        if (depthInput) {
          // Ordinary movement/attacks on the starting floor; never force camera, health or progress.
          const depthCase = depthCases[levelId]
          const before = await page.evaluate(() => window.__shadowRunnerDebug?.())
          assert.equal(before.districtDepth?.length, depthCase.count)
          await page.keyboard.down('ArrowRight')
          try {
            if (levelId === 'level-10') {
              for (let step = 0; step < 100; step++) {
                const player = await page.evaluate(() => window.__shadowRunnerDebug?.().player)
                assert.ok(player.health > 0 && player.lives === before.player.lives, 'Short art probe must survive naturally')
                if (player.x >= 550) break
                await page.keyboard.press('z')
                await page.waitForTimeout(100)
              }
            } else {
              await page.waitForFunction(() => window.__shadowRunnerDebug?.().player?.x >= 550, null, { timeout: 4500, polling: 'raf' })
            }
          } finally {
            await page.keyboard.up('ArrowRight')
          }
          await page.waitForTimeout(150)
          const after = await page.evaluate(() => window.__shadowRunnerDebug?.())
          assert.equal(after.districtDepth.length, depthCase.count)
          assert.ok(after.player.x >= 550 && after.player.health > 0 && after.player.lives === before.player.lives)
          assert.ok(after.player.x < 604 && after.player.bodyBottom <= 617, 'Keep the short art probe on supported starting floor')
          const farTravel = before.districtDepth[0].x - after.districtDepth[0].x
          const nearTravel = before.districtDepth[depthCase.nearIndex].x - after.districtDepth[depthCase.nearIndex].x
          assert.ok(farTravel > 1 && nearTravel > farTravel, 'Both actual runtime layers must move at distinct rates')
          assert.ok(Math.abs(nearTravel / farTravel - depthCase.nearRate / depthCase.farRate) < 0.01)
          for (const file of depthCase.files) {
            assert.ok(result.surface.assets.some(asset => asset.path.endsWith(file)), `Required artwork did not load: ${file}`)
          }
          const canvas = await page.locator('canvas').screenshot({ path: path.join(output, `${profile.name}-${levelId}-depth-canvas.png`) })
          const stats = await sharp(canvas).stats()
          assert.ok(stats.channels.slice(0, 3).some(channel => channel.stdev > 8), 'Rendered canvas must contain actual scene pixels')
          result.depthInput = { scope: 'Short normal-input art probe, not route acceptance', before: before.districtDepth,
            after: after.districtDepth, player: after.player, farTravel, nearTravel, pixelStdev: stats.channels.map(channel => channel.stdev) }
          await page.screenshot({ path: path.join(output, `${profile.name}-${levelId}-depth-moving.png`) })
        }
        await page.getByRole('button', { name: 'Open pause menu', exact: true }).click()
        await page.getByRole('button', { name: /Resume/i }).waitFor()
        const beforePause = await page.evaluate(() => window.__shadowRunnerDebug?.())
        await page.waitForTimeout(400)
        const afterPause = await page.evaluate(() => window.__shadowRunnerDebug?.())
        result.pauseStable = JSON.stringify(beforePause) === JSON.stringify(afterPause)
        await page.screenshot({ path: path.join(output, `${profile.name}-${levelId}-pause.png`) })
        for (const job of bundleJobs) await job
        result.buildIdentityPassed = expectedBundles.every(expected => result.loadedBundles.some(actual => actual.path === expected.path && actual.sha256 === expected.sha256))
        if (!result.buildIdentityPassed) result.errors.push('Served runtime does not match the frozen dist bundles')
        result.status = result.pauseStable && !result.errors.length ? 'passed' : 'failed'
      } catch (error) {
        result.status = 'failed'
        result.errors.push(error.message)
        await page.screenshot({ path: path.join(output, `${profile.name}-${levelId}-error.png`) }).catch(() => {})
      } finally {
        report.results.push(result)
        await context.close()
        await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
        console.log(`${profile.name} ${levelId}: ${result.status}; pause=${result.pauseStable}; errors=${result.errors.join('; ')}`)
      }
    }
  } finally {
    await browser.close()
  }
}
report.finishedAt = new Date().toISOString()
await writeFile(path.join(output, 'summary.json'), JSON.stringify(report, null, 2))
if (report.results.some(result => result.status === 'failed')) process.exitCode = 1

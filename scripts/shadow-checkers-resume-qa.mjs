// Local Unity lifecycle QA. Synthetic cache events test the real player's
// handlers; actual history navigation separately reports whether caching occurred.
import { chromium, webkit, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const iphone = process.argv.includes('--webkit')
const output = `output/playwright/shadow-checkers-unity/resume-${iphone ? 'webkit' : 'chromium'}-${Date.now()}`
await mkdir(output, { recursive: true })
const report = { status: 'running', engine: iphone ? 'webkit' : 'chromium', errors: [] }
const browser = await (iphone ? webkit : chromium).launch({ headless: false,
  ignoreDefaultArgs: iphone && process.platform === 'win32' ? ['--disable-accelerated-compositing'] : ['--disable-back-forward-cache'],
})
try {
  const context = await browser.newContext({ ...devices[iphone ? 'iPhone 13' : 'Pixel 7'], viewport: { width: 915, height: 412 }, serviceWorkers: 'block' })
  await context.addInitScript(() => {
    window.cacheShows = []; window.unityEvents = []; window.projection = null
    window.addEventListener('pageshow', event => window.cacheShows.push(event.persisted))
    window.addEventListener('message', event => {
      if (event.origin !== location.origin || event.data?.version !== 1) return
      if (event.data.type === 'snapshot') window.lastUnitySnapshot = event.data.value
      if (event.data.type === 'projection') window.projection = event.data
      else window.unityEvents.push(event.data)
    })
  })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(error.message))
  page.setDefaultTimeout(45000)
  const url = 'http://127.0.0.1:4195/output/shadow-checkers-cinematic-preview.html?scenario=capture'
  await page.goto(url)
  await page.locator('iframe[data-ready=true]').waitFor({ timeout: 180000 })
  const openCameraHelp=async()=>{
    await page.getByRole('button',{name:'Open Shadow Checkers menu',exact:true}).click()
    await page.getByRole('region',{name:'Shadow Checkers menu'}).getByRole('button',{name:'Camera help',exact:true}).click()
  }
  await page.waitForFunction(() => window.unityEvents.some(event => event.type === 'cinematic' && event.stage === 'ready'))
  const frame = page.frames().find(item => item.url().includes('/games/shadow-checkers/unity/'))
  await frame.evaluate(() => {
    window.lifecycleProbe = { disposals: 0, pauses: [], token: Math.random() }
    const audio = window.ShadowStudyAudio
    const dispose = audio.dispose, configure = audio.configure
    audio.dispose = () => { window.lifecycleProbe.disposals++; return dispose() }
    audio.configure = (pieceEnabled, ambienceEnabled, paused) => { window.lifecycleProbe.pauses.push(paused); return configure(pieceEnabled, ambienceEnabled, paused) }
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
  })
  const hidden = await frame.evaluate(() => window.lifecycleProbe)
  assert.equal(hidden.disposals, 0, 'Cached player must retain its audio controller')
  assert.equal(hidden.pauses.at(-1), true)
  const readyCount = await page.evaluate(() => window.unityEvents.filter(event => event.type === 'ready').length)
  await frame.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
  await page.waitForFunction(count => window.unityEvents.filter(event => event.type === 'ready').length > count, readyCount)
  assert.equal(await frame.evaluate(() => window.lifecycleProbe.pauses.at(-1)), false)
  report.syntheticCacheResume = 'passed against the actual Unity frame'

  await page.goto('about:blank')
  await page.goBack()
  await page.locator('iframe[data-ready=true]').waitFor({ timeout: 180000 })
  await page.bringToFront()
  await page.waitForFunction(() => window.projection && window.unityEvents.some(event => event.type === 'cinematic' && event.stage === 'ready'))
  report.historyUsedCache = await page.evaluate(() => window.cacheShows.includes(true))
  const returnedFrame = page.frames().find(item => item.url().includes('/games/shadow-checkers/unity/'))
  report.retainedPlayer = await returnedFrame.evaluate(token => window.lifecycleProbe?.token === token, hidden.token)
  if (report.historyUsedCache) assert.equal(report.retainedPlayer, true, 'Cached return must keep the player')
  await page.waitForTimeout(750)
  const tap = async (row, col) => {
    const point = await page.evaluate(({ row, col }) => window.projection.squares.find(square => square.row === row && square.col === col), { row, col })
    const bounds = await page.locator('iframe').boundingBox()
    await page.touchscreen.tap(bounds.x + point.x * bounds.width, bounds.y + point.y * bounds.height)
  }
  const revision = await page.evaluate(() => window.projection.revision)
  await tap(5, 0)
  await page.waitForFunction(previous => window.projection.revision !== previous, revision)
  await tap(1, 4)
  await page.getByText('Black to move', { exact: true }).waitFor()
  await page.waitForFunction(() => window.unityEvents.some(event => event.type === 'sound' && event.cue === 'capture'))
  if (process.argv.includes('--context-loss')) {
    await page.waitForFunction(() => window.unityEvents.filter(event => event.type === 'cinematic').at(-1)?.busy === false)
    const snapshot = await returnedFrame.evaluate(() => window.lastUnitySnapshot)
    assert(snapshot.pieces.length === 2, 'The capture must be preserved before graphics recovery')
    const presented = await page.evaluate(() => window.unityEvents.filter(event => event.type === 'presented').length)
    const supported = await returnedFrame.evaluate(() => {
      const extension = document.querySelector('#board').getContext('webgl2').getExtension('WEBGL_lose_context')
      if (!extension) return false
      extension.loseContext()
      return true
    })
    assert(supported, 'This browser must support actual WebGL context loss for this check')
    await page.getByRole('button', { name: 'Retry 3D table' }).waitFor()
    assert.equal(await page.locator('iframe').count(), 0, 'Failed player must be removed')
    await openCameraHelp()
    assert.equal(await page.getByRole('button', { name: 'Overhead', exact: true }).isEnabled(), false)
    await page.getByRole('button', { name: 'Close camera help', exact: true }).click()
    await page.getByRole('button', { name: 'Retry 3D table' }).click()
    await page.locator('iframe[data-ready=true]').waitFor({ timeout: 180000 })
    const replacement = page.frames().find(item => item.url().includes('/games/shadow-checkers/unity/'))
    await replacement.waitForFunction(() => Boolean(window.lastUnitySnapshot))
    const restored = await replacement.evaluate(() => window.lastUnitySnapshot)
    assert.deepEqual(restored.pieces, snapshot.pieces, 'Retry must preserve the current pieces')
    assert.deepEqual(restored.lastMove, snapshot.lastMove, 'Retry must preserve the latest move')
    await page.waitForFunction(count => window.unityEvents.filter(event => event.type === 'presented').length > count, presented)
    await page.getByText('Black to move', { exact: true }).waitFor()
    await openCameraHelp()
    await page.getByRole('button', { name: 'Overhead', exact: true }).click()
    await page.waitForFunction(() => window.projection.squares.every(square => square.x > 0 && square.x < 1 && square.y > 0 && square.y < 1))
    report.contextLossRecovery = 'real WebGL loss; new player presented the same captured position and working overhead view'
  }
  assert.equal(report.errors.length, 0, report.errors.join('\n'))
  report.moveAfterReturn = 'capture submitted and animated'
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.error = String(error); throw error
} finally {
  await browser.close()
  await writeFile(`${output}/summary.json`, JSON.stringify(report, null, 2))
  console.log(output)
}

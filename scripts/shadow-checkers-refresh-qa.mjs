// Actual Unity player plus a Vite Fast Refresh in the same iframe. The host's
// post-refresh startup watchdog is shortened only after the first ready event.
import { chromium, devices } from 'playwright'
import { mkdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const output = `output/playwright/shadow-checkers-unity/refresh-${Date.now()}`
await mkdir(output, { recursive: true })
const source = 'src/features/games/shadow-checkers/components/ShadowCheckersUnityBoard.tsx'
const hash = async () => createHash('sha256').update(await readFile(source)).digest('hex')
const before = await hash()
const report = { status: 'running', errors: [], scope: 'Desktop Chromium actual Unity, Vite refresh and accelerated host watchdog; not production or physical-phone proof.' }
const browser = await chromium.launch({ headless: false })
try {
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, serviceWorkers: 'block' })
  await context.addInitScript(() => {
    window.refreshProbe = { armed: false, watchdogs: 0, ready: 0 }
    const schedule = window.setTimeout.bind(window)
    window.setTimeout = (callback, delay, ...args) => {
      if (delay === 120000 && window.refreshProbe.armed) { window.refreshProbe.watchdogs++; delay = 3000 }
      return schedule(callback, delay, ...args)
    }
    window.addEventListener('message', event => {
      if (event.origin === location.origin && event.data?.version === 1 && event.data.type === 'ready') window.refreshProbe.ready++
    })
  })
  const page = await context.newPage()
  page.on('pageerror', error => report.errors.push(error.message))
  await page.goto('http://127.0.0.1:4195/output/shadow-checkers-cinematic-preview.html?refresh-qa')
  await page.locator('iframe[data-ready=true]').waitFor({ timeout: 180000 })
  await page.getByRole('button', { name: 'Camera help', exact: true }).click()
  await page.getByRole('button', { name: 'Reset table camera' }).click()
  const frame = page.frames().find(item => item.url().includes('/games/shadow-checkers/unity/'))
  const origin = await frame.evaluate(() => performance.timeOrigin)
  await page.evaluate(() => { window.refreshProbe.armed = true })
  // Touch metadata only: trigger the real development watcher without rewriting
  // source or risking overwriting other work. The content hash must stay equal.
  const now = new Date()
  await utimes(source, now, now)
  await page.waitForFunction(() => window.refreshProbe.watchdogs > 0, null, { timeout: 15000 })
  await page.waitForTimeout(4000)
  report.probe = await page.evaluate(() => window.refreshProbe)
  report.failedPlayer = await page.getByRole('button', { name: 'Retry 3D table' }).isVisible()
  assert.equal(report.failedPlayer, false, 'Fast Refresh must not expire a player that is already ready')
  const retained = page.frames().find(item => item.url().includes('/games/shadow-checkers/unity/'))
  assert(retained, 'Player iframe must remain mounted')
  assert.equal(await retained.evaluate(() => performance.timeOrigin), origin, 'Refresh must retain the same running iframe')
  await page.getByRole('button', { name: 'Camera help', exact: true }).click()
  await page.getByRole('button', { name: 'Overhead', exact: true }).click()
  assert.equal(report.errors.length, 0, report.errors.join('\n'))
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'; report.error = String(error); throw error
} finally {
  report.sourceUnchanged = await hash() === before
  await browser.close()
  await writeFile(`${output}/summary.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ output, ...report }))
}

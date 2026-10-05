// Real React/CSS and AI worker with an isolated Unity frame. No auth or backend writes.
import { chromium, webkit, devices } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const engine = process.argv.includes('--webkit') ? 'webkit' : 'chromium'
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:4196'
const output = `output/playwright/shadow-checkers-solo/${engine}-${Date.now()}`
await mkdir(output, { recursive: true })
await writeFile(`${output}/index.html`, '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="height:100dvh"></div><script type="module" src="./fixture.tsx"></script></body></html>')
await writeFile(`${output}/fixture.tsx`, `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ComfortProvider } from '/src/hooks/useComfortPreferences'
import { ShadowCheckersExperience } from '/src/features/games/shadow-checkers/ShadowCheckersExperience'
import '/src/index.css'
createRoot(document.getElementById('root')).render(<ComfortProvider><ShadowCheckersExperience /></ComfortProvider>)
`)

const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true })
const report = { engine, baseUrl, scope: 'Real mode chooser, solo React state, rules and AI worker; isolated Unity frame; no backend.', checks: [], errors: [] }
try {
  const context = await browser.newContext({
    ...devices[engine === 'webkit' ? 'iPhone 13' : 'Pixel 7'],
    viewport: { width: 667, height: 320 },
    serviceWorkers: 'block',
  })
  let backendRequests = 0
  await context.route('**/*.supabase.co/**', route => { backendRequests += 1; return route.abort() })
  for (const [path, body] of [
    ['src/hooks/useAuth.tsx', 'export function useAuth(){return {user:null}}'],
    ['src/hooks/useAdminAccess.ts', 'export function useAdminAccess(){return {isAdmin:false}}'],
    ['src/features/games/shadow-checkers/hooks/useShadowCheckers.ts', 'export function useShadowCheckers(){throw new Error("Multiplayer hook mounted during solo QA") }'],
    ['src/features/games/shadow-checkers/hooks/useShadowCheckersInvitations.ts', 'export function useShadowCheckersInvitations(){return {eligibleUsers:[],outgoing:[],busy:null,error:null,send:async()=>{},cancel:async()=>{}}}'],
  ]) await context.route(`**/${path}*`, route => route.fulfill({ contentType: 'text/javascript', body }))
  await context.route('**/games/shadow-checkers/unity/frame.html*', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><body style="background:#080705"><script>
    addEventListener('message', event => {
      if (event.origin !== location.origin) return
      if (event.data?.type === 'snapshot') parent.postMessage({version:1,type:'presented',revision:event.data.value.revision}, location.origin)
    })
    setTimeout(() => parent.postMessage({version:1,type:'ready'}, location.origin), 20)
  </script></body>` }))
  await context.addInitScript(() => localStorage.setItem('shadowchat:comfort-preferences:v1', JSON.stringify({ textScale: 130 })))
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)
  page.on('pageerror', error => report.errors.push(error.message))
  await page.goto(`${baseUrl}/${output}/index.html`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.waitForFunction(() => document.documentElement.dataset.comfortTextScale === '130')

  const bounds = async label => {
    const value = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, viewportWidth: innerWidth, viewportHeight: innerHeight }))
    assert(value.width <= value.viewportWidth + 1 && value.height <= value.viewportHeight + 1, `${label} scrolls: ${JSON.stringify(value)}`)
    report.checks.push({ label, ...value })
  }
  const touch = async (locator, label) => {
    const box = await locator.boundingBox()
    assert(box && box.width >= 43.9 && box.height >= 43.9, `${label} is below 44px: ${JSON.stringify(box)}`)
    const viewport = page.viewportSize()
    assert(viewport && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${label} is clipped: ${JSON.stringify({ box, viewport })}`)
    report.checks.push({ label, width: box.width, height: box.height })
  }

  await bounds('mode chooser')
  await touch(page.getByRole('button', { name: /play computer/i }), 'Play Computer')
  await touch(page.getByRole('button', { name: /play a person/i }), 'Play a Person')
  await page.getByRole('button', { name: /play computer/i }).click()
  assert.equal(await page.getByRole('radio').count(), 4)
  for (const name of ['Rookie', 'Casual', 'Challenger', 'Master']) await touch(page.getByRole('radio', { name: new RegExp(name, 'i') }), name)
  await bounds('difficulty chooser')
  await page.getByRole('radio', { name: /master/i }).click()
  await page.getByRole('button', { name: /enter the study/i }).click()
  await page.getByRole('button', { name: /open solo game menu/i }).click()
  await page.getByRole('button', { name: /toggle accessible board/i }).click()
  await page.locator('[data-checkers-piece-id="p1-5-0"]').click()
  await page.locator('[data-checkers-square="4-1"]').click()
  await page.locator('[data-checkers-piece-id="p1-5-0"][data-checkers-square="4-1"]').waitFor()
  await page.waitForFunction(() => Array.from(document.querySelectorAll('[data-checkers-piece-id^="p2-"]')).some(element => element.getAttribute('data-checkers-square')?.startsWith('3-')))
  await page.getByText(/your move/i).waitFor()
  assert.equal(backendRequests, 0, 'Solo play must not call Supabase')
  await bounds('solo board after one turn')

  await page.getByRole('button', { name: /open solo game menu/i }).click()
  await touch(page.getByRole('button', { name: /restart game/i }), 'Restart game')
  await page.getByRole('button', { name: /restart game/i }).click()
  await page.getByRole('button', { name: /open solo game menu/i }).click()
  await page.getByRole('button', { name: /toggle accessible board/i }).click()
  await page.locator('[data-checkers-piece-id="p1-5-0"][data-checkers-square="5-0"]').waitFor()
  report.checks.push({ label: 'AI turn and local restart', backendRequests })
  assert.deepEqual(report.errors, [])
  report.status = 'passed'
  await context.close()
} catch (error) {
  report.status = 'failed'
  report.failure = error.stack || String(error)
  throw error
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  await browser.close()
  console.log(JSON.stringify({ output, status: report.status, failure: report.failure }))
}

import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { chromium, webkit, devices } from 'playwright'

// Uses designated QA accounts. Never completes a ranked game or edits global stats.
const env = {}
for (const file of ['.env', '.env.testing.local']) {
  const text = await readFile(file, 'utf8').catch(() => '')
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
    if (match) env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
}
const base = process.env.CHECKERS_QA_URL || 'http://127.0.0.1:4174'
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
if (!url || !anon) throw new Error('Backend configuration missing')
const ref = new URL(url).hostname.split('.')[0]
const keys = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', ref, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
const role = keys.find(key => key.name === 'service_role')?.api_key
if (!role) throw new Error('Exact cleanup access is required before creating a QA match')
const admin = createClient(url, role, { auth: { persistSession: false, autoRefreshToken: false } })
const report = { checks: [], cleanup: false }
const output = `output/playwright/shadow-checkers-unity/multiplayer-${Date.now()}`
await mkdir(output, { recursive: true })
let browser, created
const pages = []
const screenshots = process.argv.includes('--screenshots')
const clients = []
const assert = (value, message) => { if (!value) throw new Error(message) }
const rpc = async (client, name, args) => { const r = await client.rpc(name, args); if (r.error) throw r.error; return r.data }
try {
  for (const i of [1, 2]) {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
    const email = env[`PLAYWRIGHT_ACCOUNT_${i}_EMAIL`] || env[`PLAYWRIGHT_ACCOUNT${i}_EMAIL`]
    const password = env[`PLAYWRIGHT_ACCOUNT_${i}_PASSWORD`] || env[`PLAYWRIGHT_ACCOUNT${i}_PASSWORD`]
    assert(email && password, `Missing QA account ${i}`)
    const auth = await client.auth.signInWithPassword({ email, password })
    if (auth.error) throw auth.error
    const active = await client.from('shadow_checkers_matches').select('id').in('status', ['waiting', 'active']).or(`player_one_id.eq.${auth.data.user.id},player_two_id.eq.${auth.data.user.id}`)
    if (active.error) throw active.error
    assert(active.data.length === 0, `QA account ${i} already has a match; preserving it`)
    clients.push({ client, session: auth.data.session })
  }
  created = await rpc(clients[0].client, 'create_shadow_checkers_match', { character_key: 'obsidian-sentinel', selected_board_skin: 'cinematic' })
  assert(created?.sessionId && created?.matchId, 'Match creation did not return identifiers')
  await writeFile(`${output}/created.json`, JSON.stringify(created))
  const duplicate = await clients[1].client.rpc('join_shadow_checkers_match', { target_session_id: created.sessionId, character_key: 'obsidian-sentinel' })
  assert(duplicate.error, 'Duplicate character was accepted')
  await rpc(clients[1].client, 'join_shadow_checkers_match', { target_session_id: created.sessionId, character_key: 'amber-vow' })
  report.checks.push('Create, unique characters and join')
  const iphone = process.argv.includes('--iphone')
  const android = process.argv.includes('--android')
  const mobile = iphone || android
  browser = await (iphone ? webkit : chromium).launch({ headless: !process.argv.includes('--headed') })
  for (const account of clients) {
    const context = await browser.newContext({ ...(iphone ? devices['iPhone 13'] : android ? devices['Pixel 7'] : { viewport: { width: 1360, height: 1000 } }), serviceWorkers: 'block' })
    await context.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)) }, { key: `sb-${ref}-auth-token`, session: account.session })
    const page = await context.newPage()
    pages.push(page)
    await page.addInitScript(() => {
      window.__checkersProjection = null
      window.__checkersEvents = []
      window.addEventListener('message', event => {
        if (event.origin === location.origin && event.data?.version === 1 && event.data.type === 'projection') window.__checkersProjection = event.data
        if (event.origin === location.origin && event.data?.version === 1) {
          window.__checkersEvents.push(event.data)
          if(window.__checkersEvents.length > 50) window.__checkersEvents.shift()
        }
      })
    })
    await page.goto(`${base}/?view=games&experience=shadow-checkers&item=${created.matchId}`)
    if(mobile) {
      await page.getByRole('dialog',{name:'Rotate phone to play'}).waitFor()
      if (screenshots) await page.screenshot({path:`${output}/rotate-${pages.length+1}.png`})
      const size=page.viewportSize()
      await page.setViewportSize({width:size.height,height:size.width})
      await page.getByRole('dialog',{name:'Rotate phone to play'}).waitFor({state:'hidden'})
    }
    // Release dialogs are unrelated to the match, but may cover the initial authenticated view.
    const dismiss = page.getByRole('button', { name: /got it|close update|continue to shadowchat/i }).first()
    if (await dismiss.isVisible().catch(() => false)) await dismiss.click()
    await page.locator('iframe[data-ready="true"]').waitFor({ timeout: 120000 })
    await page.waitForFunction(() => window.__checkersProjection?.squares?.length === 64)
    await page.waitForFunction(() => window.__checkersEvents.some(e => e.type === 'cinematic' && e.busy === false))
  }
  const clickSquare = async (page, row, col) => {
    await page.bringToFront()
    await page.locator('iframe[title="Shadow Checkers 3D board"]').scrollIntoViewIfNeeded()
    const point = await page.evaluate(({ row, col }) => window.__checkersProjection.squares.find(p => p.row === row && p.col === col), { row, col })
    const bounds = await page.locator('iframe[title="Shadow Checkers 3D board"]').boundingBox()
    const x=bounds.x + point.x * bounds.width, y=bounds.y + point.y * bounds.height
    if(mobile) await page.touchscreen.tap(x,y)
    else await page.mouse.click(x,y)
  }
  const waitRevision = async (page, previous) => page.waitForFunction(previous => window.__checkersProjection?.revision !== previous, previous)
  if (process.argv.includes('--notices')) {
    await clickSquare(pages[0], 7, 0)
    await pages[0].getByText('That piece has no legal moves', { exact: true }).waitFor()
    if (screenshots) await pages[0].screenshot({path:`${output}/notice-rule.png`})
    await pages[0].getByRole('button', {name:'Dismiss table notice'}).click()
  }
  const before = await pages[0].evaluate(() => window.__checkersProjection.revision)
  await clickSquare(pages[0], 5, 0)
  await waitRevision(pages[0], before)
  await clickSquare(pages[0], 4, 1)
  if (process.argv.includes('--notices')) {
    await pages[0].getByText('Your move is played', { exact: true }).waitFor()
    if (screenshots) await pages[0].screenshot({path:`${output}/notice-move.png`})
    report.checks.push('Themed rule notice, manual dismissal and server-confirmed move notice')
  }
  await pages[1].waitForFunction(() => document.querySelector('iframe')?.dataset.ready === 'true')
  const fetchBoard = async () => {
    const r = await admin.from('shadow_checkers_matches').select('board_state,move_count,current_turn_user_id').eq('id', created.matchId).single()
    if (r.error) throw r.error
    return r.data
  }
  for (let attempt = 0; attempt < 30; attempt++) { if ((await fetchBoard()).move_count === 1) break; await new Promise(resolve => setTimeout(resolve, 500)) }
  assert((await fetchBoard()).move_count === 1, 'Unity tap did not reach authoritative move RPC')
  report.checks.push('Real Unity canvas tap submitted and server persisted move')
  // Recipient must have the newly enabled move state, verified with actual input.
  await pages[1].waitForTimeout(1200)
  const secondBefore = await pages[1].evaluate(() => window.__checkersProjection.revision)
  await clickSquare(pages[1], 2, 1)
  await waitRevision(pages[1], secondBefore)
  await clickSquare(pages[1], 3, 0)
  for (let attempt = 0; attempt < 30; attempt++) { if ((await fetchBoard()).move_count === 2) break; await new Promise(resolve => setTimeout(resolve, 500)) }
  assert((await fetchBoard()).move_count === 2, 'Recipient live update/input failed')
  report.checks.push('Recipient realtime turn update, flipped camera, and reply move')
  const message = `Unity QA ${Date.now()}`
  await pages[0].getByRole('button',{name:'Open match chat'}).click()
  await pages[1].getByRole('button',{name:'Open match chat'}).click()
  await pages[0].getByPlaceholder('Say something').fill(message)
  await pages[0].getByPlaceholder('Say something').press('Enter')
  await pages[1].getByText(message, { exact: false }).waitFor()
  report.checks.push('Temporary match chat reached the other player')
  for(const page of pages) {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflows phone width')
    await page.bringToFront()
    await page.getByRole('button', {name:'Close match chat',exact:true}).click()
    await page.getByRole('button',{name:'Overhead',exact:true}).click()
    await page.getByRole('button',{name:'Reset table camera',exact:true}).click()
    await page.waitForTimeout(800)
    if (screenshots) await page.screenshot({path:`${output}/study-${pages.indexOf(page)+1}.png`})
  }
  report.checks.push('Portrait gate, landscape width, match chat panel and camera controls')
  if (screenshots) for (const [index, page] of pages.entries()) await page.screenshot({ path: `${output}/player-${index + 1}.png`, fullPage: true })
  report.status = 'passed'
} catch (error) {
  report.status = 'failed'
  report.error = error.message
  for (const [index, page] of pages.entries()) {
    if (screenshots) await page.screenshot({ path: `${output}/failure-player-${index + 1}.png`, fullPage: true }).catch(() => {})
    await writeFile(`${output}/failure-player-${index + 1}.json`, JSON.stringify(await page.evaluate(() => ({events:window.__checkersEvents, text:document.body.innerText}))))
  }
  throw error
} finally {
  await browser?.close()
  if (created?.sessionId) {
    const deletion = await admin.from('game_sessions').delete().eq('id', created.sessionId)
    if (deletion.error) report.cleanupError = deletion.error.message
    else {
      const remaining = await admin.from('shadow_checkers_matches').select('id').eq('id', created.matchId)
      report.cleanup = !remaining.error && remaining.data.length === 0
    }
  }
  for (const account of clients) await account.client.removeAllChannels()
  await writeFile(`${output}/summary.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ output, ...report }))
}

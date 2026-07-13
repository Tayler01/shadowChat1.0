import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, webkit } from 'playwright'

const repoRoot = process.cwd()
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4174'
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'wave2-candidate2-threads')

const parseEnvFile = async filePath => {
  const source = await readFile(filePath, 'utf8').catch(() => '')
  return Object.fromEntries(source.split(/\r?\n/).flatMap(line => {
    const normalized = line.trim()
    if (!normalized || normalized.startsWith('#')) return []
    const separator = normalized.indexOf('=')
    if (separator < 1) return []
    const key = normalized.slice(0, separator).trim()
    const value = normalized.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2')
    return [[key, value]]
  }))
}

const env = {
  ...await parseEnvFile(path.join(repoRoot, '.env')),
  ...await parseEnvFile(path.join(repoRoot, '.env.testing.local')),
  ...process.env,
}

const credentials = [1, 2].map(number => ({
  email: env[`PLAYWRIGHT_ACCOUNT_${number}_EMAIL`] || env[`PLAYWRIGHT_ACCOUNT${number}_EMAIL`],
  password: env[`PLAYWRIGHT_ACCOUNT_${number}_PASSWORD`] || env[`PLAYWRIGHT_ACCOUNT${number}_PASSWORD`],
}))
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey || credentials.some(account => !account.email || !account.password)) {
  throw new Error('Missing Supabase or two-account Playwright credentials.')
}

const clients = credentials.map(() => createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}))
const userIds = []
for (let index = 0; index < clients.length; index += 1) {
  const { data, error } = await clients[index].auth.signInWithPassword(credentials[index])
  if (error || !data.user) throw error || new Error(`Unable to sign in QA account ${index + 1}.`)
  userIds.push(data.user.id)
}

const marker = `THREAD-QA-${Date.now()}`
const created = []
const insertMessage = async (clientIndex, values) => {
  const { data, error } = await clients[clientIndex]
    .from('messages')
    .insert({
      user_id: userIds[clientIndex],
      client_message_id: randomUUID(),
      message_type: 'text',
      ...values,
    })
    .select('id,created_at')
    .single()
  if (error) throw error
  created.push({ id: data.id, clientIndex })
  return data
}

const root = await insertMessage(0, { content: `${marker} root` })
const reply = await insertMessage(1, { content: `${marker} first reply`, reply_to: root.id })
const nestedReply = await insertMessage(0, { content: `${marker} nested reply`, reply_to: reply.id })

const profiles = [
  { name: 'pixel-chromium', engine: chromium, viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' },
  { name: 'iphone-webkit', engine: webkit, viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1' },
]

const results = []
const cleanupErrors = []
await mkdir(artifactDir, { recursive: true })

const dismissTransientUi = async page => {
  for (const label of [/^Skip for Now$/i, /^(Done|Got It|Later|Not now)$/i]) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true })
      await page.waitForTimeout(200)
    }
  }
}

try {
  for (const profile of profiles) {
    const browser = await profile.engine.launch({ headless: true })
    const context = await browser.newContext({
      viewport: profile.viewport,
      userAgent: profile.userAgent,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
      serviceWorkers: 'block',
    })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
    page.on('pageerror', error => pageErrors.push(error.message))

    // Cursor semantics are covered by SQL/Jest. Avoid leaving QA cursor rows in
    // the shared project because the legacy cursor table intentionally has no
    // member DELETE policy.
    await page.route('**/rest/v1/rpc/set_user_read_cursor', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    }))

    try {
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(rootId => {
        const text = document.body?.innerText || ''
        return text.includes('Sign in') || document.getElementById(`message-${rootId}`) !== null || text.includes('General Chat')
      }, root.id, { timeout: 30_000 })
      const signIn = page.locator('form').getByRole('button', { name: /^Sign in$/i })
      if (await signIn.isVisible().catch(() => false)) {
        await page.locator('input[name="email"]').fill(credentials[0].email)
        await page.locator('input[name="password"]').fill(credentials[0].password)
        await signIn.click()
      }
      await page.locator(`[id="message-${root.id}"]`).waitFor({ timeout: 30_000 })
      await dismissTransientUi(page)

      const rootRow = page.getByTestId('message-stack').locator(`[id="message-${root.id}"]`)
      if (await page.getByText(`${marker} first reply`, { exact: true }).isVisible().catch(() => false)) {
        throw new Error('A reply leaked into the root-only Lounge feed.')
      }
      const scroll = page.getByTestId('message-scroll')
      const before = await scroll.evaluate(element => ({
        top: element.scrollTop,
        loaded: element.getAttribute('data-loaded-count'),
      }))
      before.rootTop = await rootRow.evaluate(element => element.getBoundingClientRect().top)

      await rootRow.getByTestId('open-message-thread').click()
      const sheet = page.getByTestId('general-chat-thread-sheet')
      await sheet.waitFor({ timeout: 15_000 })
      await sheet.getByText(`${marker} first reply`, { exact: true }).first().waitFor({ timeout: 15_000 })
      await sheet.getByText(`${marker} nested reply`, { exact: true }).first().waitFor({ timeout: 15_000 })
      await page.waitForTimeout(280)
      const routedUrl = new URL(page.url())
      if (routedUrl.searchParams.get('thread') !== root.id || routedUrl.searchParams.get('message') !== root.id) {
        throw new Error(`Unexpected thread route: ${routedUrl.href}`)
      }

      const geometry = await sheet.evaluate(element => {
        const rect = element.getBoundingClientRect()
        const composer = element.querySelector('[data-message-composer-surface="true"]')?.getBoundingClientRect()
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          viewportWidth: window.innerWidth,
          viewportHeight: window.visualViewport?.height ?? window.innerHeight,
          pageScrollWidth: document.documentElement.scrollWidth,
          composerBottom: composer?.bottom ?? null,
        }
      })
      if (geometry.left < -1 || geometry.right > geometry.viewportWidth + 1 || geometry.top < -1 || geometry.bottom > geometry.viewportHeight + 1 || geometry.pageScrollWidth > geometry.viewportWidth + 1) {
        throw new Error(`Thread sheet overflow: ${JSON.stringify(geometry)}`)
      }

      const opened = await scroll.evaluate(element => ({
        top: element.scrollTop,
        loaded: element.getAttribute('data-loaded-count'),
      }))
      opened.rootTop = await rootRow.evaluate(element => element.getBoundingClientRect().top)

      const uiReplyContent = `${marker} ui ${profile.name}`
      await sheet.getByPlaceholder('Reply in thread').fill(uiReplyContent)
      await sheet.getByRole('button', { name: /^Send message/i }).click()
      await sheet.getByText(uiReplyContent, { exact: true }).first().waitFor({ timeout: 20_000 })
      let uiReplyId = null
      for (let attempt = 0; attempt < 20 && !uiReplyId; attempt += 1) {
        const { data } = await clients[0]
          .from('messages')
          .select('id')
          .eq('user_id', userIds[0])
          .eq('content', uiReplyContent)
          .maybeSingle()
        uiReplyId = data?.id ?? null
        if (!uiReplyId) await page.waitForTimeout(100)
      }
      if (!uiReplyId) throw new Error('UI thread reply was not persisted.')
      created.push({ id: uiReplyId, clientIndex: 0 })

      const liveReply = await insertMessage(1, {
        content: `${marker} live ${profile.name}`,
        reply_to: nestedReply.id,
      })
      await sheet.getByText(`${marker} live ${profile.name}`, { exact: true }).first().waitFor({ timeout: 20_000 })
      await page.waitForTimeout(180)
      const after = await scroll.evaluate(element => ({
        top: element.scrollTop,
        loaded: element.getAttribute('data-loaded-count'),
      }))
      after.rootTop = await rootRow.evaluate(element => element.getBoundingClientRect().top)
      if (Math.abs(opened.rootTop - after.rootTop) > 1 || opened.loaded !== after.loaded) {
        throw new Error(`Lounge moved during thread realtime: ${JSON.stringify({ opened, after })}`)
      }

      await page.screenshot({ path: path.join(artifactDir, `${profile.name}-thread.png`) })
      await page.getByRole('button', { name: 'Back to General Chat' }).click()
      await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('thread'))
      await rootRow.waitFor({ state: 'visible' })
      await page.waitForTimeout(180)
      const restored = await scroll.evaluate(element => ({
        top: element.scrollTop,
        loaded: element.getAttribute('data-loaded-count'),
      }))
      restored.rootTop = await rootRow.evaluate(element => element.getBoundingClientRect().top)
      if (Math.abs(before.rootTop - restored.rootTop) > 1 || before.loaded !== restored.loaded) {
        throw new Error(`Lounge did not restore after Back: ${JSON.stringify({ before, restored })}`)
      }

      await page.goto(`${baseUrl}/?view=chat&thread=${root.id}&message=${liveReply.id}`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('general-chat-thread-sheet').waitFor({ timeout: 30_000 })
      const exactTarget = page.locator(`[data-thread-message-id="${liveReply.id}"]`)
      await exactTarget.waitFor({ timeout: 20_000 })
      await page.waitForFunction(id => document.activeElement?.getAttribute('data-thread-message-id') === id, liveReply.id)
      await page.screenshot({ path: path.join(artifactDir, `${profile.name}-exact-target.png`) })

      await page.getByRole('button', { name: 'Back to General Chat' }).click()
      await page.waitForFunction(() => !new URL(window.location.href).searchParams.has('thread'))

      if (consoleErrors.length || pageErrors.length) {
        throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`)
      }
      results.push({ profile: profile.name, passed: true, geometry, before, opened, after, restored, consoleErrors, pageErrors })
    } catch (error) {
      await page.screenshot({ path: path.join(artifactDir, `${profile.name}-failure.png`) }).catch(() => undefined)
      results.push({ profile: profile.name, passed: false, error: error instanceof Error ? error.message : String(error), consoleErrors, pageErrors })
    } finally {
      await context.close()
      await browser.close()
    }
  }
} finally {
  for (const item of [...created].reverse()) {
    const { data, error } = await clients[item.clientIndex]
      .from('messages')
      .delete()
      .eq('id', item.id)
      .select('id')
    if (error || !data?.some(row => row.id === item.id)) {
      cleanupErrors.push(error?.message || `Delete not confirmed for ${item.id}`)
    }
  }
  const { data: remaining, error: remainingError } = await clients[0]
    .from('messages')
    .select('id')
    .in('id', created.map(item => item.id))
  if (remainingError) cleanupErrors.push(remainingError.message)
  if (remaining?.length) cleanupErrors.push(`Rows remain: ${remaining.map(row => row.id).join(',')}`)
  for (const client of clients) await client.auth.signOut()
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  rootId: root.id,
  passed: results.every(result => result.passed) && cleanupErrors.length === 0,
  cleanup: { attemptedMessageDeletes: created.length, errors: cleanupErrors },
  results,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
if (!summary.passed) {
  console.error(JSON.stringify(summary, null, 2))
  process.exitCode = 1
} else {
  console.log(`General Chat threads browser proof passed: ${path.join(artifactDir, 'summary.json')}`)
}

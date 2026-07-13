import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, webkit } from 'playwright'

const repoRoot = process.cwd()
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4174'
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'shadow-pin-theater-rapid-swipe')

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

const credential = {
  email: env.PLAYWRIGHT_ACCOUNT_1_EMAIL || env.PLAYWRIGHT_ACCOUNT1_EMAIL,
  password: env.PLAYWRIGHT_ACCOUNT_1_PASSWORD || env.PLAYWRIGHT_ACCOUNT1_PASSWORD,
}
const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey || !credential.email || !credential.password) {
  throw new Error('Missing Supabase or Playwright account credentials.')
}

const client = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const signedIn = await client.auth.signInWithPassword(credential)
if (signedIn.error || !signedIn.data.user || !signedIn.data.session) throw signedIn.error || new Error('Unable to sign in the Theater QA account.')
const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

const visiblePins = await client
  .from('shadow_pin_images')
  .select('id,category_id,title,created_at')
  .is('deleted_at', null)
  .not('category_id', 'is', null)
  .order('created_at', { ascending: false })
  .order('id', { ascending: false })
  .limit(250)
if (visiblePins.error) throw visiblePins.error

const pinsByCategory = new Map()
for (const pin of visiblePins.data || []) {
  const categoryPins = pinsByCategory.get(pin.category_id) || []
  categoryPins.push(pin)
  pinsByCategory.set(pin.category_id, categoryPins)
}
const sequence = [...pinsByCategory.values()].find(pins => pins.length >= 3)?.slice(0, 3)
if (!sequence) throw new Error('No visible ShadowPin category has at least three Pins for rapid-swipe QA.')

const profiles = [
  { name: 'pixel-chromium', engine: chromium, viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' },
  { name: 'iphone-webkit', engine: webkit, viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1' },
]

const dismissTransientUi = async page => {
  for (const label of [/^Skip for Now$/i, /^(Done|Got It|Later|Not now)$/i]) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) await button.click({ force: true })
  }
}

const swipeLeft = async (stage, pointerId) => {
  const box = await stage.boundingBox()
  if (!box) throw new Error('Theater media stage has no layout box.')
  const startX = box.x + box.width * 0.78
  const endX = box.x + box.width * 0.2
  const y = box.y + box.height * 0.5
  const base = { pointerId, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientY: y }
  await stage.dispatchEvent('pointerdown', { ...base, clientX: startX })
  await stage.dispatchEvent('pointermove', { ...base, clientX: endX })
  await stage.dispatchEvent('pointerup', { ...base, buttons: 0, clientX: endX })
}

const results = []
await mkdir(artifactDir, { recursive: true })

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
  await context.addInitScript(({ storageKey, session }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(session))
  }, { storageKey: authStorageKey, session: signedIn.data.session })
  const page = await context.newPage()
  const consoleErrors = []
  const browserDiagnostics = []
  const pageErrors = []
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Content Security Policy') && text.toLowerCase().includes('report-only')) {
      browserDiagnostics.push(text)
    } else {
      consoleErrors.push(text)
    }
  })
  page.on('pageerror', error => pageErrors.push(error.message))

  try {
    await page.goto(`${baseUrl}/?view=pins&pin=${sequence[0].id}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !document.querySelector('input[name="email"]'), undefined, { timeout: 30_000 })
    await dismissTransientUi(page)
    const theater = page.getByTestId('shadow-pin-theater')
    await theater.waitFor({ timeout: 30_000 })
    await theater.getByRole('heading', { name: sequence[0].title, exact: true }).waitFor({ timeout: 30_000 })
    const nextButton = theater.getByRole('button', { name: 'Next Pin', exact: true })
    await nextButton.waitFor({ timeout: 20_000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('[aria-label="Next Pin"]')
      const counter = document.querySelector('[aria-label^="Pin "]')?.getAttribute('aria-label') || ''
      return button instanceof HTMLButtonElement && !button.disabled && /^Pin 1 of ([3-9]|\d{2,})$/.test(counter)
    }, undefined, { timeout: 30_000 })

    const stage = theater.getByTestId('shadow-pin-theater-media-stage')
    await swipeLeft(stage, 71)
    await page.waitForTimeout(24)
    await swipeLeft(stage, 72)

    await page.waitForFunction(expectedId => new URL(window.location.href).searchParams.get('pin') === expectedId, sequence[2].id, { timeout: 5_000 })
    await theater.getByRole('heading', { name: sequence[2].title, exact: true }).waitFor({ timeout: 5_000 })
    const settledCounter = await theater.locator('[aria-label^="Pin "]').getAttribute('aria-label')
    if (!settledCounter?.startsWith('Pin 3 of ')) throw new Error(`Rapid swipe settled on an unexpected counter: ${settledCounter}`)

    const settledRoute = page.url()
    const settledTitle = await theater.locator('#shadow-pin-theater-title').textContent()
    await page.waitForTimeout(650)
    if (page.url() !== settledRoute || await theater.locator('#shadow-pin-theater-title').textContent() !== settledTitle) {
      throw new Error('Theater route or active Pin snapped back after rapid swiping.')
    }
    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`)
    }

    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-settled.png`) })
    results.push({ profile: profile.name, passed: true, settledCounter, settledPinId: sequence[2].id, consoleErrors, browserDiagnostics, pageErrors })
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-failure.png`) }).catch(() => undefined)
    results.push({ profile: profile.name, passed: false, error: error instanceof Error ? error.message : String(error), consoleErrors, browserDiagnostics, pageErrors })
  } finally {
    await context.close()
    await browser.close()
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  sequence,
  passed: results.every(result => result.passed),
  results,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

if (!summary.passed) {
  console.error(JSON.stringify(summary, null, 2))
  process.exitCode = 1
} else {
  console.log(`ShadowPin Theater rapid-swipe browser proof passed: ${path.join(artifactDir, 'summary.json')}`)
}

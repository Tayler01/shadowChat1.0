import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices, webkit } from 'playwright'

const repoRoot = process.cwd()
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'catch-up')

const parseArgs = values => {
  const result = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value.startsWith('--base-url=')) result.baseUrl = value.slice('--base-url='.length)
    else if (value === '--base-url' && values[index + 1]) result.baseUrl = values[++index]
  }
  return result
}

const parseEnvFile = async filePath => {
  const source = await readFile(filePath, 'utf8').catch(() => '')
  return Object.fromEntries(source.split(/\r?\n/u).flatMap(line => {
    const normalized = line.trim()
    if (!normalized || normalized.startsWith('#')) return []
    const separator = normalized.indexOf('=')
    if (separator < 1) return []
    const key = normalized.slice(0, separator).trim()
    const value = normalized.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/u, '$2')
    return [[key, value]]
  }))
}

const env = {
  ...await parseEnvFile(path.join(repoRoot, '.env')),
  ...await parseEnvFile(path.join(repoRoot, '.env.testing.local')),
  ...process.env,
}
const args = parseArgs(process.argv.slice(2))
const requestedBaseUrl = String(args.baseUrl || env.PLAYWRIGHT_BASE_URL || '').trim()
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
const email = env.PLAYWRIGHT_ACCOUNT_1_EMAIL || env.PLAYWRIGHT_ACCOUNT1_EMAIL
const password = env.PLAYWRIGHT_ACCOUNT_1_PASSWORD || env.PLAYWRIGHT_ACCOUNT1_PASSWORD

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}

must(requestedBaseUrl, '--base-url or PLAYWRIGHT_BASE_URL is required.')
const base = new URL(requestedBaseUrl)
must(['http:', 'https:'].includes(base.protocol), 'The base URL must be HTTP(S).')
must(!base.username && !base.password && !base.search && !base.hash, 'The base URL must be a credential-free origin.')
const localOrigin = ['localhost', '127.0.0.1'].includes(base.hostname)
const trialOrigin = base.hostname === 'shadowchat-2-0-wave-one.netlify.app'
  || base.hostname.endsWith('--shadowchat-2-0-wave-one.netlify.app')
must(localOrigin || trialOrigin, `Refusing non-trial frontend origin ${base.origin}.`)
const baseUrl = base.origin

must(supabaseUrl && supabaseAnonKey, 'Supabase URL and browser-safe anon key are required.')
must(email && password, 'A controlled PLAYWRIGHT_ACCOUNT_1 account is required.')
const projectRef = new URL(supabaseUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/iu)?.[1]
must(projectRef, 'A hosted Supabase project is required for controlled authentication.')
must(env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF, 'PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF is required.')
must(projectRef === env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF, `Refusing unexpected Supabase project ${projectRef}.`)

const client = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const auth = await client.auth.signInWithPassword({ email, password })
if (auth.error) throw auth.error
must(auth.data.session, 'The controlled account did not return a session.')
const probe = await client.rpc('get_my_catch_up_v1', { section_limit: 1, lookback_hours: 24 })
if (probe.error) throw new Error(`Catch-Up RPC probe failed: ${probe.error.message}`)
must(probe.data?.source_linked === true && probe.data?.ai_generated === false, 'Catch-Up RPC provenance flags are invalid.')

await mkdir(artifactDir, { recursive: true })
const profiles = [
  { name: 'pixel-chromium', engine: chromium, device: devices['Pixel 7'] },
  { name: 'iphone-webkit', engine: webkit, device: devices['iPhone 13'] },
]
const results = []

const dismissTransientUi = async page => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let dismissed = false
    for (const label of [
      /^Skip for Now$/iu,
      /^(Done|Got It|Later|Not now)$/iu,
      /^(Restart Now|Update Now)$/iu,
      /^(Close phone setup|I Finished Setup)$/iu,
    ]) {
      const button = page.getByRole('button', { name: label }).first()
      if (await button.isVisible().catch(() => false)) {
        const actionText = await button.textContent().catch(() => '')
        await button.click({ force: true })
        await page.waitForTimeout(/Now/iu.test(actionText ?? '') ? 1_200 : 120)
        dismissed = true
        break
      }
    }
    if (!dismissed) return
  }
}

for (const profile of profiles) {
  const browser = await profile.engine.launch({ headless: true })
  const context = await browser.newContext({ ...profile.device, serviceWorkers: 'block' })
  await context.addInitScript(({ storageKey, session }) => {
    localStorage.setItem(storageKey, JSON.stringify(session))
    localStorage.setItem(`shadowchat:phone-install-onboarding:seen:v2:${session.user.id}`, new Date().toISOString())
  }, { storageKey: `sb-${projectRef}-auth-token`, session: auth.data.session })

  const page = await context.newPage()
  const diagnostics = { consoleErrors: [], pageErrors: [], requestFailures: [], errorResponses: [] }
  let snapshotCalls = 0
  let acknowledgementCalls = 0
  page.on('request', request => {
    if (/\/rest\/v1\/rpc\/get_my_catch_up_v1(?:\?|$)/u.test(request.url())) snapshotCalls += 1
    if (/\/rest\/v1\/rpc\/acknowledge_my_catch_up_events(?:\?|$)/u.test(request.url())) acknowledgementCalls += 1
  })
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!/content security policy/iu.test(text)) diagnostics.consoleErrors.push(text)
  })
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message))
  page.on('requestfailed', request => diagnostics.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`))
  page.on('response', response => {
    if (response.status() >= 400) diagnostics.errorResponses.push(`${response.status()} ${response.url()}`)
  })

  try {
    await page.goto(`${baseUrl}/?view=settings`, { waitUntil: 'domcontentloaded' })
    await dismissTransientUi(page)
    await page.getByRole('button', { name: /Notifications & Audio/iu }).waitFor({
      timeout: 20_000,
    })
    must(snapshotCalls === 0, `${profile.name} fetched Catch-Up before the surface was opened.`)

    await page.goto(`${baseUrl}/?view=catchup`, { waitUntil: 'domcontentloaded' })
    await dismissTransientUi(page)
    await page.getByRole('heading', { name: 'Your Catch-Up', level: 1 }).waitFor({ timeout: 20_000 })
    // The deliberate full-page transition from Settings cancels unrelated
    // background requests from that source page. Scope diagnostics to the
    // Catch-Up surface after it is visibly ready.
    diagnostics.consoleErrors.length = 0
    diagnostics.pageErrors.length = 0
    diagnostics.requestFailures.length = 0
    diagnostics.errorResponses.length = 0
    await page.getByText('Source-linked / No AI').waitFor()
    await page.getByRole('button', { name: 'Refresh Catch-Up' }).waitFor()
    must(new URL(page.url()).searchParams.get('view') === 'catchup', `${profile.name} did not preserve the Catch-Up route.`)
    must(snapshotCalls === 1, `${profile.name} expected one on-demand snapshot call, saw ${snapshotCalls}.`)
    must(acknowledgementCalls === 0, `${profile.name} acknowledged an event without opening a source.`)

    const beforeRefresh = snapshotCalls
    await page.getByRole('button', { name: 'Refresh Catch-Up' }).click()
    await page.waitForFunction(
      count => window.performance.getEntriesByType('resource').filter(entry => entry.name.includes('/rpc/get_my_catch_up_v1')).length > count,
      beforeRefresh - 1
    ).catch(() => undefined)
    await page.waitForTimeout(750)
    must(snapshotCalls === beforeRefresh + 1, `${profile.name} refresh did not issue exactly one snapshot call.`)
    must(acknowledgementCalls === 0, `${profile.name} refresh acknowledged source data.`)

    const geometry = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      refreshVisible: (() => {
        const element = document.querySelector('[aria-label="Refresh Catch-Up"]')
        if (!(element instanceof HTMLElement)) return false
        const rect = element.getBoundingClientRect()
        return rect.top >= 0 && rect.right <= window.innerWidth + 1
      })(),
    }))
    must(geometry.scrollWidth <= geometry.viewportWidth + 1, `${profile.name} Catch-Up has horizontal overflow.`)
    must(geometry.refreshVisible, `${profile.name} refresh control is outside the viewport.`)
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}.png`), fullPage: true })

    must(diagnostics.consoleErrors.length === 0, `${profile.name} console errors: ${JSON.stringify(diagnostics.consoleErrors)}`)
    must(diagnostics.pageErrors.length === 0, `${profile.name} page errors: ${JSON.stringify(diagnostics.pageErrors)}`)
    must(diagnostics.requestFailures.length === 0, `${profile.name} request failures: ${JSON.stringify(diagnostics.requestFailures)}`)
    must(diagnostics.errorResponses.length === 0, `${profile.name} error responses: ${JSON.stringify(diagnostics.errorResponses)}`)
    results.push({ profile: profile.name, passed: true, snapshotCalls, acknowledgementCalls, geometry, diagnostics })
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-failure.png`), fullPage: true }).catch(() => undefined)
    results.push({ profile: profile.name, passed: false, error: error instanceof Error ? error.message : String(error), snapshotCalls, acknowledgementCalls, diagnostics })
  } finally {
    await context.close()
    await browser.close()
  }
}

await client.auth.signOut()
const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  supabaseProjectRef: projectRef,
  passed: results.every(result => result.passed),
  residue: 'Read-only UI/RPC proof; no fixtures, acknowledgements, uploads, messages, or user-state mutations created.',
  results,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
must(summary.passed, `Catch-Up browser proof failed: ${path.join(artifactDir, 'summary.json')}`)
console.log(`Catch-Up browser proof passed: ${path.join(artifactDir, 'summary.json')}`)

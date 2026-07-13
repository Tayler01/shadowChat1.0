import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices, webkit } from 'playwright'

const repoRoot = process.cwd()
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'wave3-shadow-pin-feed-modes')
const npxCliPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
const runStartedAt = new Date(Date.now() - 5_000).toISOString()
const marker = `FEED-MODES-QA-${Date.now()}`

const parseArgs = values => {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value.startsWith('--base-url=')) parsed.baseUrl = value.slice('--base-url='.length)
    else if (value === '--base-url' && values[index + 1]) parsed.baseUrl = values[++index]
    else if (value === '--help') parsed.help = true
  }
  return parsed
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log([
    'ShadowPin Feed Modes browser verifier',
    '',
    'Usage:',
    '  node scripts/verify-shadow-pin-feed-modes-browser.mjs --base-url=https://<isolated-test-origin>',
    '',
    'Requires two controlled PLAYWRIGHT_ACCOUNT_* accounts, Supabase URL/anon key,',
    'PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF, and service-role access through env or Supabase CLI.',
  ].join('\n'))
  process.exit(0)
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

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}
const messageOf = error => error instanceof Error ? error.message : String(error)
const firstRow = value => Array.isArray(value) ? value[0] : value
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const unique = values => [...new Set(values.filter(Boolean))]
const assertNoError = (error, context) => {
  if (error) throw new Error(`${context}: ${error.message || String(error)}`)
}
const poll = async (label, callback, timeoutMs = 30_000, intervalMs = 250) => {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const result = await callback()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await wait(intervalMs)
  }
  throw new Error(`${label} timed out${lastError ? `: ${messageOf(lastError)}` : ''}`)
}

const requestedBaseUrl = String(args.baseUrl || env.PLAYWRIGHT_BASE_URL || '').trim()
must(requestedBaseUrl, '--base-url or PLAYWRIGHT_BASE_URL is required; no production origin is assumed.')
const base = new URL(requestedBaseUrl)
must(['http:', 'https:'].includes(base.protocol), 'The test origin must use HTTP(S).')
must(!base.username && !base.password, 'The test origin must not contain credentials.')
must((base.pathname === '/' || base.pathname === '') && !base.search && !base.hash, 'The test URL must be an origin only.')
const isLocalOrigin = ['localhost', '127.0.0.1'].includes(base.hostname)
const isIsolatedTrialOrigin = base.hostname === 'shadowchat-2-0-wave-one.netlify.app'
  || base.hostname.endsWith('--shadowchat-2-0-wave-one.netlify.app')
must(isLocalOrigin || isIsolatedTrialOrigin, `Refusing non-trial frontend origin ${base.origin}.`)
const baseUrl = base.origin

const credentials = [1, 2].map(number => ({
  email: env[`PLAYWRIGHT_ACCOUNT_${number}_EMAIL`] || env[`PLAYWRIGHT_ACCOUNT${number}_EMAIL`],
  password: env[`PLAYWRIGHT_ACCOUNT_${number}_PASSWORD`] || env[`PLAYWRIGHT_ACCOUNT${number}_PASSWORD`],
}))
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
must(supabaseUrl && supabaseAnonKey, 'Missing Supabase URL or browser-safe anon key.')
must(credentials.every(account => account.email && account.password), 'Two controlled Playwright accounts are required.')

const expectedSupabaseHost = new URL(supabaseUrl).hostname
const projectRef = expectedSupabaseHost.match(/^([a-z0-9-]+)\.supabase\.co$/iu)?.[1]
must(projectRef, 'Feed Modes verification requires a hosted Supabase project.')
must(env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF, 'PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF is required.')
must(projectRef === env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF, `Refusing unexpected Supabase project ${projectRef}.`)

const resolveServiceRoleKey = () => {
  const configured = env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (configured) return configured
  const raw = execFileSync(process.execPath, [
    npxCliPath,
    'supabase',
    'projects',
    'api-keys',
    '--project-ref',
    projectRef,
    '--output',
    'json',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 60_000,
  })
  const parsed = JSON.parse(raw)
  const keys = Array.isArray(parsed) ? parsed : parsed?.api_keys || []
  const serviceRole = keys.find(key => key.name === 'service_role' || key.type === 'service_role')
  must(serviceRole?.api_key, 'Supabase service-role cleanup access is unavailable.')
  return serviceRole.api_key
}

await mkdir(artifactDir, { recursive: true })
const admin = createClient(supabaseUrl, resolveServiceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const clients = credentials.map(() => createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}))

const userIds = []
for (let index = 0; index < clients.length; index += 1) {
  const result = await clients[index].auth.signInWithPassword(credentials[index])
  assertNoError(result.error, `Sign in controlled account ${index + 1}`)
  must(result.data.user, `Controlled account ${index + 1} has no authenticated user.`)
  userIds.push(result.data.user.id)
}
must(userIds[0] !== userIds[1], 'The controlled accounts resolve to the same user.')

const profilesResult = await admin.from('users').select('id,username,display_name').in('id', userIds)
assertNoError(profilesResult.error, 'Read controlled profiles')
const profileById = new Map((profilesResult.data || []).map(profile => [profile.id, profile]))
must(userIds.every(userId => profileById.has(userId)), 'A controlled account is missing its public profile row.')
const activationResult = await admin.from('user_activation_journeys')
  .select('user_id,selected_first_action_kind,first_action_completed_at')
  .in('user_id', userIds)
assertNoError(activationResult.error, 'Read controlled activation state')
const unsafeActivationRows = (activationResult.data || []).filter(row => (
  row.selected_first_action_kind === 'shadow_pin_heart' && !row.first_action_completed_at
))
must(unsafeActivationRows.length === 0, 'A controlled account has an unfinished ShadowPin-heart activation; refusing to mutate onboarding state.')

const migrationProbe = await admin.from('shadow_pin_feed_preferences').select('user_id').limit(1)
if (migrationProbe.error && ['42P01', 'PGRST204', 'PGRST205'].includes(migrationProbe.error.code)) {
  const summary = {
    generatedAt: new Date().toISOString(),
    status: 'ready-to-run',
    passed: false,
    reason: 'The ShadowPin Feed Modes migration is not present on the configured backend.',
    baseUrl,
    supabaseProjectRef: projectRef,
  }
  await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  for (const client of clients) await client.auth.signOut()
  console.log(`Feed Modes verifier is ready after migration deployment: ${path.join(artifactDir, 'summary.json')}`)
  process.exit(0)
}
assertNoError(migrationProbe.error, 'Probe ShadowPin Feed Modes migration')

const [memberLowId, memberHighId] = [...userIds].sort()
const readPair = async () => {
  const result = await admin.from('user_connections')
    .select('id,status,revision')
    .eq('member_low_id', memberLowId)
    .eq('member_high_id', memberHighId)
  assertNoError(result.error, 'Read controlled Connection pair')
  return result.data || []
}
const readPairBlocks = async () => {
  const result = await admin.from('user_blocks')
    .select('blocker_id,blocked_id')
    .in('blocker_id', userIds)
    .in('blocked_id', userIds)
  assertNoError(result.error, 'Read controlled reciprocal blocks')
  return result.data || []
}
must((await readPair()).length === 0, 'Refusing to overwrite a preexisting Connection between the controlled accounts.')
must((await readPairBlocks()).length === 0, 'Refusing to alter a preexisting personal block between the controlled accounts.')

const originalPreferencesResult = await admin.from('shadow_pin_feed_preferences').select('*').in('user_id', userIds)
assertNoError(originalPreferencesResult.error, 'Snapshot feed preferences')
const originalPreferences = originalPreferencesResult.data || []
const originalPreferenceByUser = new Map(originalPreferences.map(row => [row.user_id, row]))

const categoryIds = [randomUUID(), randomUUID()]
const pinIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
const pinTitles = [
  `${marker}-A-NEW`,
  `${marker}-A-OLD`,
  `${marker}-B-NEW`,
  `${marker}-B-OLD`,
]
const pinOwnerById = new Map([
  [pinIds[0], userIds[0]],
  [pinIds[1], userIds[0]],
  [pinIds[2], userIds[1]],
  [pinIds[3], userIds[1]],
])
const expectedFeedByViewer = new Map([
  [userIds[0], [pinIds[2], pinIds[3]]],
  [userIds[1], [pinIds[0], pinIds[1]]],
])
const pairIds = new Set()
const commentIds = new Set()
const browsers = []
const browserDiagnostics = []
const checks = []
const cleanupErrors = []
let failure = null

const seedFixtures = async () => {
  const categoryRows = categoryIds.map((id, index) => ({
    id,
    creator_id: userIds[index],
    title: `${marker}-CATEGORY-${index + 1}`,
    description: 'Temporary exact-ID Feed Modes verification category.',
    image_url: index === 0
      ? `${baseUrl}/themes/obsidian-gold/preview.webp`
      : `${baseUrl}/entertainment/shado-tv/posters/neon-nights.webp`,
    image_path: `external:feed-modes-qa:${marker}:category:${index + 1}`,
    image_content_type: 'image/webp',
    processing_status: 'ready',
  }))
  const categories = await admin.from('shadow_pin_categories').insert(categoryRows)
  assertNoError(categories.error, 'Seed exact Feed Modes categories')

  const now = Date.now()
  const pinRows = pinIds.map((id, index) => ({
    id,
    category_id: index < 2 ? categoryIds[0] : categoryIds[1],
    // Insert without a creator so the production new-Pin trigger cannot fan
    // fixture notifications out to real members; attach exact owners below.
    creator_id: null,
    title: pinTitles[index],
    description: 'Temporary exact-ID Feed Modes browser verification Pin.',
    image_url: index % 2 === 0
      ? `${baseUrl}/themes/obsidian-gold/preview.webp`
      : `${baseUrl}/entertainment/shado-tv/posters/neon-nights.webp`,
    image_path: `external:feed-modes-qa:${marker}:pin:${index + 1}`,
    image_content_type: 'image/webp',
    processing_status: 'ready',
    media_type: 'image',
    created_at: new Date(now - (index % 2 === 0 ? 10_000 : 20_000)).toISOString(),
  }))
  const pins = await admin.from('shadow_pin_images').insert(pinRows)
  assertNoError(pins.error, 'Seed exact Feed Modes Pins without notification fanout')
  for (const userId of userIds) {
    const ownedIds = pinIds.filter(id => pinOwnerById.get(id) === userId)
    const attached = await admin.from('shadow_pin_images').update({ creator_id: userId }).in('id', ownedIds).select('id')
    assertNoError(attached.error, `Attach Feed Modes fixture owner ${userId}`)
    must(attached.data?.length === ownedIds.length, `Not every Feed Modes fixture was attached to ${userId}.`)
  }
  const notificationProbe = await admin.from('notification_events')
    .select('id', { count: 'exact', head: true })
    .in('entity_id', pinIds)
    .eq('type', 'shadow_pin_post')
  assertNoError(notificationProbe.error, 'Verify fixture insertion did not notify members')
  must(notificationProbe.count === 0, 'Fixture insertion unexpectedly created member new-Pin notifications.')
}

const mutateConnection = async (clientIndex, targetIndex, action) => {
  const result = await clients[clientIndex].rpc('mutate_connection', {
    target_user_id: userIds[targetIndex],
    target_action: action,
  })
  assertNoError(result.error, `${action} controlled Connection`)
  const connectionId = firstRow(result.data)?.connection_id
  if (connectionId) pairIds.add(connectionId)
  return firstRow(result.data)
}

const connectPair = async () => {
  await mutateConnection(0, 1, 'request')
  await mutateConnection(1, 0, 'accept')
  const pair = await poll('accepted controlled Connection', async () => {
    const rows = await readPair()
    return rows.length === 1 && rows[0].status === 'accepted' ? rows[0] : null
  })
  pairIds.add(pair.id)
  return pair
}

const resetPairWithBlock = async () => {
  const blocks = await readPairBlocks()
  const unexpected = blocks.filter(row => row.blocker_id !== userIds[0] || row.blocked_id !== userIds[1])
  must(unexpected.length === 0, 'Ambiguous cleanup: an unexpected reciprocal block appeared.')
  if (blocks.length > 0) {
    const unblocked = await clients[0].rpc('unblock_user', { target_user_id: userIds[1] })
    assertNoError(unblocked.error, 'Clear verifier-owned block')
    must(unblocked.data === true, 'Verifier-owned block was not cleared.')
  }
  const rows = await readPair()
  for (const row of rows) pairIds.add(row.id)
  if (rows.length > 0) {
    const blocked = await clients[0].rpc('block_user', { target_user_id: userIds[1] })
    assertNoError(blocked.error, 'Hard-delete verifier Connection through personal block')
    must(blocked.data === true, 'Verifier-owned cleanup block was not created.')
    const unblocked = await clients[0].rpc('unblock_user', { target_user_id: userIds[1] })
    assertNoError(unblocked.error, 'Remove verifier cleanup block')
    must(unblocked.data === true, 'Verifier-owned cleanup block was not removed.')
  }
  must((await readPair()).length === 0, 'Controlled Connection pair remains after reset.')
  must((await readPairBlocks()).length === 0, 'Controlled reciprocal block remains after reset.')
}

const setPreference = async (clientIndex, mode) => {
  const result = await clients[clientIndex].rpc('set_my_shadow_pin_feed_mode', { target_mode: mode })
  assertNoError(result.error, `Set account ${clientIndex + 1} Feed Mode to ${mode}`)
  must(firstRow(result.data)?.feed_mode === mode, `Account ${clientIndex + 1} Feed Mode did not become ${mode}.`)
}

const waitForStoredPreference = (userId, mode) => poll(`${mode} preference for ${userId}`, async () => {
  const result = await admin.from('shadow_pin_feed_preferences').select('feed_mode').eq('user_id', userId).maybeSingle()
  assertNoError(result.error, `Read stored Feed Mode for ${userId}`)
  return result.data?.feed_mode === mode ? result.data : null
})

const dismissTransientUi = async page => {
  for (const label of [/^Skip for Now$/iu, /^(Done|Got It|Later|Not now)$/iu]) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true })
      await page.waitForTimeout(200)
    }
  }
}

const browserProfiles = [
  { name: 'pixel-chromium', engine: chromium, device: devices['Pixel 7'], accountIndex: 0 },
  { name: 'iphone-webkit', engine: webkit, device: devices['iPhone 13'], accountIndex: 1 },
]

const openControlledPage = async profile => {
  const browser = await profile.engine.launch({ headless: true })
  const context = await browser.newContext({ ...profile.device, serviceWorkers: 'block' })
  const page = await context.newPage()
  const diagnostics = {
    profile: profile.name,
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
    errorResponses: [],
    reportOnlyDiagnostics: [],
    supabaseHosts: new Set(),
  }
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/content security policy/iu.test(text) && /report-only/iu.test(text)) diagnostics.reportOnlyDiagnostics.push(text)
    else diagnostics.consoleErrors.push(text)
  })
  page.on('pageerror', error => diagnostics.pageErrors.push(error.message))
  page.on('request', request => {
    const hostname = new URL(request.url()).hostname
    if (hostname.endsWith('.supabase.co')) diagnostics.supabaseHosts.add(hostname)
  })
  page.on('requestfailed', request => {
    const failureText = request.failure()?.errorText || 'unknown failure'
    if (!/abort|cancelled/iu.test(failureText)) {
      diagnostics.requestFailures.push(`${request.method()} ${request.url()} - ${failureText}`)
    }
  })
  page.on('response', response => {
    if (response.status() < 400) return
    const type = response.request().resourceType()
    if (['document', 'script', 'stylesheet', 'xhr', 'fetch'].includes(type)) {
      diagnostics.errorResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })
  browsers.push({ browser, context, page, profile, diagnostics })
  browserDiagnostics.push(diagnostics)

  await page.goto(`${baseUrl}/?view=pins`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    return text.includes('Sign in') || Boolean(document.querySelector('[data-testid="shadow-pin-feed-mode-tabs"]'))
  }, null, { timeout: 30_000 })
  const signIn = page.locator('form').getByRole('button', { name: /^Sign in$/iu })
  if (await signIn.isVisible().catch(() => false)) {
    await page.locator('input[name="email"]').fill(credentials[profile.accountIndex].email)
    await page.locator('input[name="password"]').fill(credentials[profile.accountIndex].password)
    await signIn.click()
  }
  await page.getByTestId('shadow-pin-feed-mode-tabs').waitFor({ timeout: 30_000 })
  await dismissTransientUi(page)
  return page
}

const focusRefresh = async page => {
  await page.bringToFront()
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(900)
}

const waitForMode = async (page, mode) => {
  const tab = page.getByTestId(`shadow-pin-feed-mode-${mode}`)
  try {
    await poll(`${mode} mode UI`, async () => {
      const selected = await tab.getAttribute('aria-selected').catch(() => null)
      const enabled = await tab.isEnabled().catch(() => false)
      const rootMode = await page.locator('[data-feed-mode]').first().getAttribute('data-feed-mode').catch(() => null)
      const url = new URL(page.url())
      const canonicalRoute = mode === 'connections'
        ? url.searchParams.get('feed') === 'connections'
        : !url.searchParams.has('feed')
      return enabled && selected === 'true' && rootMode === mode && canonicalRoute
    })
  } catch (error) {
    const browserProfile = browsers.find(item => item.page === page)?.profile.name || 'unknown-browser'
    const state = {
      selected: await tab.getAttribute('aria-selected').catch(() => null),
      enabled: await tab.isEnabled().catch(() => false),
      rootMode: await page.locator('[data-feed-mode]').first().getAttribute('data-feed-mode').catch(() => null),
      url: page.url(),
      text: (await page.locator('body').innerText().catch(() => '')).slice(0, 500),
    }
    throw new Error(`${browserProfile} ${messageOf(error)}: ${JSON.stringify(state)}`)
  }
}

const selectMode = async (page, accountIndex, mode, keyboard = false) => {
  const tab = page.getByTestId(`shadow-pin-feed-mode-${mode}`)
  if (keyboard) {
    const other = mode === 'connections' ? 'discover' : 'connections'
    await page.getByTestId(`shadow-pin-feed-mode-${other}`).focus()
    await page.keyboard.press(mode === 'connections' ? 'End' : 'Home')
  } else {
    const browserProfile = browsers.find(item => item.page === page)?.profile
    if (browserProfile?.device?.hasTouch) await tab.tap()
    else await tab.click()
  }
  await waitForMode(page, mode)
  await waitForStoredPreference(userIds[accountIndex], mode)
}

const assertGeometry = async (page, locator, label) => {
  const geometry = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      pageScrollWidth: document.documentElement.scrollWidth,
      surfaceScrollWidth: element.scrollWidth,
      surfaceClientWidth: element.clientWidth,
    }
  })
  must(geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1, `${label} escaped the viewport: ${JSON.stringify(geometry)}`)
  must(geometry.pageScrollWidth <= geometry.viewportWidth + 1, `${label} has page overflow: ${JSON.stringify(geometry)}`)
  must(geometry.surfaceScrollWidth <= geometry.surfaceClientWidth + 1, `${label} has horizontal overflow: ${JSON.stringify(geometry)}`)
  return geometry
}

const assertWaitingState = async page => {
  const empty = page.getByTestId('shadow-pin-feed-empty')
  await empty.getByText('Your Connections feed is waiting', { exact: true }).waitFor({ timeout: 30_000 })
  await empty.getByRole('button', { name: 'Find Connections', exact: true }).waitFor()
}

const assertAcceptedEmptyState = async page => {
  const empty = page.getByTestId('shadow-pin-feed-empty')
  await empty.getByText('No new Pins from your Connections', { exact: true }).waitFor({ timeout: 30_000 })
  await empty.getByRole('button', { name: 'Manage Connections', exact: true }).waitFor()
}

const assertFeed = async (page, expectedIds) => {
  const feed = page.getByTestId('shadow-pin-feed')
  await feed.waitFor({ timeout: 30_000 })
  await poll('ordered Connections feed cards', async () => {
    const ids = await feed.locator('[data-testid^="shadow-pin-feed-card-"]').evaluateAll(elements => (
      elements.map(element => element.getAttribute('data-testid')?.replace('shadow-pin-feed-card-', ''))
    ))
    return JSON.stringify(ids) === JSON.stringify(expectedIds) ? ids : null
  })
  return assertGeometry(page, feed, 'Connections Pin feed')
}

const assertUniversalSearch = async (page, title) => {
  const trigger = page.getByRole('button', { name: 'Open category search', exact: true })
  await trigger.click()
  const input = page.getByRole('searchbox', { name: 'Search all of ShadowPin' })
  await input.fill(title)
  const result = page.getByRole('option').filter({ hasText: title }).first()
  await result.waitFor({ timeout: 30_000 })
  must(await result.isVisible(), `Universal Search did not return ${title}.`)
  await input.fill('')
}

const exerciseTheaterAndComments = async (page, accountIndex, pinId, title) => {
  const feed = page.getByTestId('shadow-pin-feed')
  const card = feed.getByTestId(`shadow-pin-feed-card-${pinId}`)
  const openButton = card.getByRole('button', { name: new RegExp(`^Open .*${title}`, 'u') })
  const browserProfile = browsers.find(item => item.page === page)?.profile
  if (browserProfile?.device?.hasTouch) await openButton.tap()
  else await openButton.click()
  const theater = page.getByTestId('shadow-pin-theater')
  await theater.waitFor({ timeout: 30_000 })
  await theater.locator('#shadow-pin-theater-title').getByText(title, { exact: true }).waitFor()
  let route = new URL(page.url())
  must(route.searchParams.get('view') === 'pins' && route.searchParams.get('feed') === 'connections' && route.searchParams.get('pin') === pinId, `Theater route lost Connections context: ${route.href}`)
  await assertGeometry(page, theater, 'ShadowPin Theater')

  const heart = theater.getByRole('button', { name: new RegExp(`^Heart ${title}`, 'u') })
  await heart.click()
  await poll(`heart on ${title}`, async () => {
    const result = await admin.from('shadow_pin_image_hearts').select('image_id,user_id')
      .eq('image_id', pinId)
      .eq('user_id', userIds[accountIndex])
    assertNoError(result.error, `Read Feed Modes heart for ${title}`)
    return result.data?.length === 1 ? result.data[0] : null
  })

  await theater.getByRole('button', { name: /comments\. Open comments\./iu }).click()
  const commentsDialog = page.locator('[role="dialog"][aria-labelledby="shadow-pin-comments-title"]')
  await commentsDialog.waitFor({ timeout: 30_000 })
  route = new URL(page.url())
  must(route.searchParams.get('panel') === 'comments' && route.searchParams.get('pin') === pinId && route.searchParams.get('feed') === 'connections', `Comments route lost Connections context: ${route.href}`)
  await assertGeometry(page, commentsDialog, 'ShadowPin comments')
  const body = `${marker}-COMMENT-${accountIndex + 1}`
  await commentsDialog.getByRole('textbox', { name: 'Add a ShadowPin comment' }).fill(body)
  await commentsDialog.getByRole('button', { name: 'Post comment', exact: true }).click()
  const comment = await poll(`comment on ${title}`, async () => {
    const result = await admin.from('shadow_pin_comments').select('id,image_id,author_id,body')
      .eq('image_id', pinId)
      .eq('author_id', userIds[accountIndex])
      .eq('body', body)
      .maybeSingle()
    assertNoError(result.error, `Read Feed Modes comment for ${title}`)
    return result.data
  })
  commentIds.add(comment.id)
  await commentsDialog.getByText(body, { exact: true }).waitFor()

  await page.goBack({ waitUntil: 'domcontentloaded' })
  await commentsDialog.waitFor({ state: 'hidden', timeout: 20_000 })
  await theater.waitFor({ timeout: 20_000 })
  route = new URL(page.url())
  must(!route.searchParams.has('panel') && route.searchParams.get('pin') === pinId && route.searchParams.get('feed') === 'connections', `Back from comments did not restore Theater: ${route.href}`)
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await theater.waitFor({ state: 'hidden', timeout: 20_000 })
  await page.getByTestId('shadow-pin-connections-panel').waitFor({ timeout: 20_000 })
  route = new URL(page.url())
  must(!route.searchParams.has('pin') && route.searchParams.get('feed') === 'connections', `Back from Theater did not restore Connections feed: ${route.href}`)
}

const refreshBoth = async pages => {
  for (const page of pages) await focusRefresh(page)
}

const restorePinOwners = async () => {
  for (const userId of userIds) {
    const ownedIds = pinIds.filter(id => pinOwnerById.get(id) === userId)
    const result = await admin.from('shadow_pin_images').update({ creator_id: userId }).in('id', ownedIds).select('id')
    assertNoError(result.error, `Restore Feed Modes fixture owners for ${userId}`)
    must(result.data?.length === ownedIds.length, `Not every fixture owner was restored for ${userId}.`)
  }
}

const closeBrowsers = async () => {
  for (const item of browsers.reverse()) {
    await item.context.close().catch(() => undefined)
    await item.browser.close().catch(() => undefined)
  }
  await wait(500)
}

const cleanup = async () => {
  await closeBrowsers()

  try {
    await resetPairWithBlock()
  } catch (error) {
    cleanupErrors.push(`Pair/block cleanup: ${messageOf(error)}`)
  }

  const exactEntityIds = unique([...pinIds, ...commentIds, ...pairIds])
  try {
    if (exactEntityIds.length > 0) {
      const result = await admin.from('notification_events').delete({ count: 'exact' }).in('entity_id', exactEntityIds)
      assertNoError(result.error, 'Delete exact Feed Modes notification events')
    }
  } catch (error) {
    cleanupErrors.push(`Notification cleanup: ${messageOf(error)}`)
  }

  try {
    const exactCommentIds = [...commentIds]
    if (pinIds.length > 0 || exactCommentIds.length > 0) {
      let query = admin.from('activity_events').delete({ count: 'exact' }).in('shadow_pin_image_id', pinIds)
      const result = await query
      assertNoError(result.error, 'Delete exact Feed Modes Activity rows')
    }
    if (exactCommentIds.length > 0) {
      const result = await admin.from('shadow_pin_comments').delete({ count: 'exact' }).in('id', exactCommentIds)
      assertNoError(result.error, 'Delete exact Feed Modes comments')
    }
  } catch (error) {
    cleanupErrors.push(`Comment/activity cleanup: ${messageOf(error)}`)
  }

  try {
    const result = await admin.from('shadow_pin_image_hearts').delete({ count: 'exact' }).in('image_id', pinIds).in('user_id', userIds)
    assertNoError(result.error, 'Delete exact Feed Modes hearts')
  } catch (error) {
    cleanupErrors.push(`Heart cleanup: ${messageOf(error)}`)
  }

  try {
    const events = await admin.from('shadow_pin_activity_events').select('id')
      .in('user_id', userIds)
      .gte('created_at', runStartedAt)
    assertNoError(events.error, 'Find run-scoped ShadowPin analytics events')
    const eventIds = (events.data || []).map(row => row.id)
    if (eventIds.length > 0) {
      const deleted = await admin.from('shadow_pin_activity_events').delete({ count: 'exact' }).in('id', eventIds)
      assertNoError(deleted.error, 'Delete run-scoped ShadowPin analytics events')
    }
    const sessions = await admin.from('shadow_pin_activity_sessions').select('id')
      .in('user_id', userIds)
      .gte('created_at', runStartedAt)
    assertNoError(sessions.error, 'Find run-scoped ShadowPin analytics sessions')
    const sessionIds = (sessions.data || []).map(row => row.id)
    if (sessionIds.length > 0) {
      const deleted = await admin.from('shadow_pin_activity_sessions').delete({ count: 'exact' }).in('id', sessionIds)
      assertNoError(deleted.error, 'Delete run-scoped ShadowPin analytics sessions')
    }
  } catch (error) {
    cleanupErrors.push(`Analytics cleanup: ${messageOf(error)}`)
  }

  try {
    const pins = await admin.from('shadow_pin_images').delete({ count: 'exact' }).in('id', pinIds)
    assertNoError(pins.error, 'Delete exact Feed Modes Pins')
    const categories = await admin.from('shadow_pin_categories').delete({ count: 'exact' }).in('id', categoryIds)
    assertNoError(categories.error, 'Delete exact Feed Modes categories')
  } catch (error) {
    cleanupErrors.push(`Fixture cleanup: ${messageOf(error)}`)
  }

  try {
    for (const userId of userIds) {
      const original = originalPreferenceByUser.get(userId)
      if (original) {
        const restored = await admin.from('shadow_pin_feed_preferences').upsert(original).select('*')
        assertNoError(restored.error, `Restore Feed Mode preference for ${userId}`)
        must(restored.data?.length === 1, `Feed Mode preference restore was not confirmed for ${userId}.`)
      } else {
        const removed = await admin.from('shadow_pin_feed_preferences').delete({ count: 'exact' }).eq('user_id', userId)
        assertNoError(removed.error, `Remove verifier-created Feed Mode preference for ${userId}`)
      }
    }
  } catch (error) {
    cleanupErrors.push(`Preference cleanup: ${messageOf(error)}`)
  }

  try {
    const exactCommentIds = [...commentIds]
    const [pairs, blocks, pins, categories, hearts, notifications, activity, analyticsEvents, analyticsSessions, comments, preferences] = await Promise.all([
      readPair(),
      readPairBlocks(),
      admin.from('shadow_pin_images').select('id', { count: 'exact', head: true }).in('id', pinIds),
      admin.from('shadow_pin_categories').select('id', { count: 'exact', head: true }).in('id', categoryIds),
      admin.from('shadow_pin_image_hearts').select('image_id', { count: 'exact', head: true }).in('image_id', pinIds),
      exactEntityIds.length > 0
        ? admin.from('notification_events').select('id', { count: 'exact', head: true }).in('entity_id', exactEntityIds)
        : Promise.resolve({ count: 0, error: null }),
      admin.from('activity_events').select('id', { count: 'exact', head: true }).in('shadow_pin_image_id', pinIds),
      admin.from('shadow_pin_activity_events').select('id', { count: 'exact', head: true }).in('user_id', userIds).gte('created_at', runStartedAt),
      admin.from('shadow_pin_activity_sessions').select('id', { count: 'exact', head: true }).in('user_id', userIds).gte('created_at', runStartedAt),
      exactCommentIds.length > 0
        ? admin.from('shadow_pin_comments').select('id', { count: 'exact', head: true }).in('id', exactCommentIds)
        : Promise.resolve({ count: 0, error: null }),
      admin.from('shadow_pin_feed_preferences').select('*').in('user_id', userIds),
    ])
    for (const [label, result] of Object.entries({ pins, categories, hearts, notifications, activity, analyticsEvents, analyticsSessions, comments, preferences })) {
      assertNoError(result.error, `Verify ${label} cleanup`)
    }
    must(pairs.length === 0 && blocks.length === 0, 'Connection or block residue remains.')
    for (const [label, result] of Object.entries({ pins, categories, hearts, notifications, activity, analyticsEvents, analyticsSessions, comments })) {
      must((result.count || 0) === 0, `${label} cleanup left ${result.count} rows.`)
    }
    const restoredByUser = new Map((preferences.data || []).map(row => [row.user_id, row]))
    for (const userId of userIds) {
      const expected = originalPreferenceByUser.get(userId) || null
      const actual = restoredByUser.get(userId) || null
      must(JSON.stringify(actual) === JSON.stringify(expected), `Feed preference does not match its snapshot for ${userId}.`)
    }
  } catch (error) {
    cleanupErrors.push(`Zero-residue proof: ${messageOf(error)}`)
  }
}

try {
  await seedFixtures()
  await Promise.all([setPreference(0, 'discover'), setPreference(1, 'discover')])

  const pixelPage = await openControlledPage(browserProfiles[0])
  const iphonePage = await openControlledPage(browserProfiles[1])
  const pages = [pixelPage, iphonePage]

  for (const page of pages) await waitForMode(page, 'discover')
  await selectMode(pixelPage, 0, 'connections', true)
  await selectMode(iphonePage, 1, 'connections')
  await Promise.all(pages.map(assertWaitingState))
  await assertUniversalSearch(pixelPage, pinTitles[2])
  await assertUniversalSearch(iphonePage, pinTitles[0])

  for (let index = 0; index < pages.length; index += 1) {
    await pages[index].goto(`${baseUrl}/?view=pins`, { waitUntil: 'domcontentloaded' })
    await pages[index].getByTestId('shadow-pin-feed-mode-tabs').waitFor({ timeout: 30_000 })
    await waitForMode(pages[index], 'connections')
  }
  checks.push({ name: 'mode-selector-keyboard-account-sync-reload-and-universal-search', passed: true })

  await selectMode(pixelPage, 0, 'discover')
  await selectMode(iphonePage, 1, 'discover')
  for (let index = 0; index < pages.length; index += 1) {
    await pages[index].goto(`${baseUrl}/?view=pins`, { waitUntil: 'domcontentloaded' })
    await pages[index].getByTestId('shadow-pin-feed-mode-tabs').waitFor({ timeout: 30_000 })
    await waitForMode(pages[index], 'discover')
  }
  await selectMode(pixelPage, 0, 'connections')
  await selectMode(iphonePage, 1, 'connections')
  checks.push({ name: 'discover-preference-reload', passed: true })

  await connectPair()
  await refreshBoth(pages)
  const pixelGeometry = await assertFeed(pixelPage, expectedFeedByViewer.get(userIds[0]))
  const iphoneGeometry = await assertFeed(iphonePage, expectedFeedByViewer.get(userIds[1]))
  checks.push({ name: 'accepted-connection-cross-category-order', passed: true, geometry: { pixelGeometry, iphoneGeometry } })

  await exerciseTheaterAndComments(pixelPage, 0, pinIds[2], pinTitles[2])
  await exerciseTheaterAndComments(iphonePage, 1, pinIds[0], pinTitles[0])
  checks.push({ name: 'connections-scoped-theater-heart-comments-and-browser-back', passed: true })

  const detached = await admin.from('shadow_pin_images').update({ creator_id: null }).in('id', pinIds).select('id')
  assertNoError(detached.error, 'Temporarily remove all eligible Connection Pins')
  must(detached.data?.length === pinIds.length, 'Not every Connection Pin was detached for accepted-empty proof.')
  await refreshBoth(pages)
  await Promise.all(pages.map(assertAcceptedEmptyState))
  await restorePinOwners()
  await refreshBoth(pages)
  await assertFeed(pixelPage, expectedFeedByViewer.get(userIds[0]))
  await assertFeed(iphonePage, expectedFeedByViewer.get(userIds[1]))
  checks.push({ name: 'accepted-but-no-eligible-pins-empty-state', passed: true })

  await mutateConnection(0, 1, 'remove')
  await refreshBoth(pages)
  await Promise.all(pages.map(assertWaitingState))
  await assertUniversalSearch(pixelPage, pinTitles[2])
  checks.push({ name: 'remove-fails-closed-while-search-remains-universal', passed: true })

  await resetPairWithBlock()
  await connectPair()
  await refreshBoth(pages)
  await assertFeed(pixelPage, expectedFeedByViewer.get(userIds[0]))
  await assertFeed(iphonePage, expectedFeedByViewer.get(userIds[1]))

  const blocked = await clients[0].rpc('block_user', { target_user_id: userIds[1] })
  assertNoError(blocked.error, 'Block controlled Connection for fail-closed proof')
  must(blocked.data === true, 'Controlled block was not created.')
  await refreshBoth(pages)
  await Promise.all(pages.map(assertWaitingState))
  const unblocked = await clients[0].rpc('unblock_user', { target_user_id: userIds[1] })
  assertNoError(unblocked.error, 'Unblock controlled Connection for recovery proof')
  must(unblocked.data === true, 'Controlled block was not removed.')
  await connectPair()
  await refreshBoth(pages)
  await assertFeed(pixelPage, expectedFeedByViewer.get(userIds[0]))
  await assertFeed(iphonePage, expectedFeedByViewer.get(userIds[1]))
  checks.push({ name: 'block-fails-closed-and-explicit-reconnect-recovers', passed: true })

  await pixelPage.screenshot({ path: path.join(artifactDir, 'pixel-chromium-connections-feed.png'), fullPage: true })
  await iphonePage.screenshot({ path: path.join(artifactDir, 'iphone-webkit-connections-feed.png'), fullPage: true })

  for (const diagnostics of browserDiagnostics) {
    must(diagnostics.supabaseHosts.size > 0, `${diagnostics.profile} made no observable Supabase request.`)
    must([...diagnostics.supabaseHosts].every(host => host === expectedSupabaseHost), `${diagnostics.profile} contacted an unexpected Supabase host.`)
    must(diagnostics.consoleErrors.length === 0, `${diagnostics.profile} console errors: ${JSON.stringify(diagnostics.consoleErrors)}`)
    must(diagnostics.pageErrors.length === 0, `${diagnostics.profile} page errors: ${JSON.stringify(diagnostics.pageErrors)}`)
    must(diagnostics.requestFailures.length === 0, `${diagnostics.profile} request failures: ${JSON.stringify(diagnostics.requestFailures)}`)
    must(diagnostics.errorResponses.length === 0, `${diagnostics.profile} error responses: ${JSON.stringify(diagnostics.errorResponses)}`)
  }
  checks.push({ name: 'zero-console-page-request-response-and-overflow-errors', passed: true })
} catch (error) {
  failure = messageOf(error)
  for (const item of browsers) {
    await item.page.screenshot({ path: path.join(artifactDir, `${item.profile.name}-failure.png`), fullPage: true }).catch(() => undefined)
  }
} finally {
  await cleanup()
  for (const client of clients) await client.auth.signOut()
}

const serializableDiagnostics = browserDiagnostics.map(item => ({ ...item, supabaseHosts: [...item.supabaseHosts] }))
const passed = !failure && cleanupErrors.length === 0 && checks.every(check => check.passed)
const summary = {
  generatedAt: new Date().toISOString(),
  status: passed ? 'passed' : 'failed',
  passed,
  baseUrl,
  supabaseProjectRef: projectRef,
  marker,
  controlledUserIds: userIds,
  fixtureIds: { categoryIds, pinIds, commentIds: [...commentIds], pairIds: [...pairIds] },
  checks,
  browserDiagnostics: serializableDiagnostics,
  cleanup: {
    strategy: 'close browsers; block/unblock hard-delete pair; exact notification/comment/heart/activity/fixture deletion; run-scoped QA analytics deletion; exact preference restoration; zero-count proof',
    errors: cleanupErrors,
  },
  failure,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
if (!passed) {
  console.error(JSON.stringify(summary, null, 2))
  process.exitCode = 1
} else {
  console.log(`ShadowPin Feed Modes browser proof passed: ${path.join(artifactDir, 'summary.json')}`)
}

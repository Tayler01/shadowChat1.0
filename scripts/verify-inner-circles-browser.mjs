import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices, webkit } from 'playwright'

const repoRoot = process.cwd()
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'wave3-inner-circles')
const npxCliPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
const runStartedAt = new Date(Date.now() - 5_000).toISOString()
const marker = `INNER-CIRCLES-QA-${Date.now()}`

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
    'Inner Circles authenticated browser verifier',
    '',
    'Usage:',
    '  node scripts/verify-inner-circles-browser.mjs --base-url=https://<isolated-test-origin>',
    '',
    'Requires two controlled PLAYWRIGHT_ACCOUNT_* accounts, Supabase URL/anon key,',
    'PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF, and service-role access through env or Supabase CLI.',
    'The verifier refuses production origins and preexisting Connection/block state.',
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
const assertNoError = (error, context) => {
  if (error) throw new Error(`${context}: ${error.message || String(error)}`)
}
const messageOf = error => error instanceof Error ? error.message : String(error)
const firstRow = value => Array.isArray(value) ? value[0] : value
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const unique = values => [...new Set(values.filter(Boolean))]
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const stableRows = rows => [...rows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
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
must(projectRef, 'Inner Circles verification requires a hosted Supabase project.')
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
const accountSessions = []
for (let index = 0; index < clients.length; index += 1) {
  const result = await clients[index].auth.signInWithPassword(credentials[index])
  assertNoError(result.error, `Sign in controlled account ${index + 1}`)
  must(result.data.user, `Controlled account ${index + 1} has no authenticated user.`)
  must(result.data.session, `Controlled account ${index + 1} has no authenticated session.`)
  userIds.push(result.data.user.id)
  accountSessions.push(result.data.session)
}
must(userIds[0] !== userIds[1], 'The controlled accounts resolve to the same user.')

const migrationProbe = await admin.from('inner_circles').select('id').limit(1)
const rpcProbe = await clients[0].rpc('list_my_inner_circles')
const migrationMissingCodes = new Set(['42P01', 'PGRST202', 'PGRST204', 'PGRST205'])
if (
  (migrationProbe.error && migrationMissingCodes.has(migrationProbe.error.code))
  || (rpcProbe.error && migrationMissingCodes.has(rpcProbe.error.code))
) {
  const summary = {
    generatedAt: new Date().toISOString(),
    status: 'ready-to-run',
    passed: false,
    reason: 'The Inner Circles migration is not present on the configured backend.',
    baseUrl,
    supabaseProjectRef: projectRef,
  }
  await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
  for (const client of clients) await client.auth.signOut()
  console.log(`Inner Circles verifier is ready after migration deployment: ${path.join(artifactDir, 'summary.json')}`)
  process.exit(0)
}
assertNoError(migrationProbe.error, 'Probe Inner Circles table')
assertNoError(rpcProbe.error, 'Probe Inner Circles API')

const profilesResult = await admin.from('users').select('id,username,display_name').in('id', userIds)
assertNoError(profilesResult.error, 'Read controlled profiles')
const profileById = new Map((profilesResult.data || []).map(profile => [profile.id, profile]))
must(userIds.every(userId => profileById.has(userId)), 'A controlled account is missing its public profile row.')
must(userIds.every(userId => profileById.get(userId)?.username), 'A controlled account needs a username for deterministic picker verification.')

const activationResult = await admin.from('user_activation_journeys')
  .select('user_id,selected_first_action_kind,first_action_completed_at')
  .in('user_id', userIds)
assertNoError(activationResult.error, 'Read controlled activation state')
const unsafeActivationRows = (activationResult.data || []).filter(row => (
  row.selected_first_action_kind === 'shadow_pin_heart' && !row.first_action_completed_at
))
must(unsafeActivationRows.length === 0, 'A controlled account has an unfinished ShadowPin-heart activation; refusing to mutate onboarding state.')

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
  assertNoError(result.error, 'Read reciprocal controlled blocks')
  return result.data || []
}
must((await readPair()).length === 0, 'Refusing to overwrite a preexisting Connection between the controlled accounts.')
must((await readPairBlocks()).length === 0, 'Refusing to alter a preexisting personal block between the controlled accounts.')

const readControlledCircles = async () => {
  const result = await admin.from('inner_circles').select('*').in('owner_id', userIds).order('id')
  assertNoError(result.error, 'Read controlled Inner Circles')
  return stableRows(result.data || [])
}
const readControlledMemberships = async () => {
  const circles = await readControlledCircles()
  const circleIds = circles.map(circle => circle.id)
  if (circleIds.length === 0) return []
  const result = await admin.from('inner_circle_members').select('*').in('circle_id', circleIds).order('circle_id').order('member_id')
  assertNoError(result.error, 'Read controlled Inner Circle memberships')
  return stableRows(result.data || [])
}
const originalCircles = await readControlledCircles()
const originalMemberships = await readControlledMemberships()
const originalCircleIds = new Set(originalCircles.map(circle => circle.id))

const originalPreferencesResult = await admin.from('shadow_pin_feed_preferences').select('*').in('user_id', userIds).order('user_id')
assertNoError(originalPreferencesResult.error, 'Snapshot ShadowPin Feed Mode preferences')
const originalPreferences = stableRows(originalPreferencesResult.data || [])
const originalPreferenceByUser = new Map(originalPreferences.map(row => [row.user_id, row]))

const categoryIds = [randomUUID(), randomUUID()]
const pinIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
const circleNameStem = `ICQA-${Date.now().toString(36).toUpperCase()}`
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
const expectedCircleFeedByViewer = new Map([
  [userIds[0], [pinIds[2], pinIds[3]]],
  [userIds[1], [pinIds[0], pinIds[1]]],
])
const circleIds = [null, null]
const circleNames = [`${circleNameStem}-P`, `${circleNameStem}-I`]
const renamedCircleNames = [`${circleNameStem}-P-R`, `${circleNameStem}-I-R`]
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
    description: 'Temporary exact-ID Inner Circles verification category.',
    image_url: index === 0
      ? `${baseUrl}/themes/obsidian-gold/preview.webp`
      : `${baseUrl}/entertainment/shado-tv/posters/neon-nights.webp`,
    image_path: `external:inner-circles-qa:${marker}:category:${index + 1}`,
    image_content_type: 'image/webp',
    processing_status: 'ready',
  }))
  const categories = await admin.from('shadow_pin_categories').insert(categoryRows)
  assertNoError(categories.error, 'Seed exact Inner Circles categories')

  const now = Date.now()
  const pinRows = pinIds.map((id, index) => ({
    id,
    category_id: index < 2 ? categoryIds[0] : categoryIds[1],
    // Avoid new-Pin notification fanout while exact QA fixtures are inserted.
    creator_id: null,
    title: pinTitles[index],
    description: 'Temporary exact-ID Inner Circles browser verification Pin.',
    image_url: index % 2 === 0
      ? `${baseUrl}/themes/obsidian-gold/preview.webp`
      : `${baseUrl}/entertainment/shado-tv/posters/neon-nights.webp`,
    image_path: `external:inner-circles-qa:${marker}:pin:${index + 1}`,
    image_content_type: 'image/webp',
    processing_status: 'ready',
    media_type: 'image',
    created_at: new Date(now - (index % 2 === 0 ? 10_000 : 20_000)).toISOString(),
  }))
  const pins = await admin.from('shadow_pin_images').insert(pinRows)
  assertNoError(pins.error, 'Seed exact Inner Circles Pins without notification fanout')
  for (const userId of userIds) {
    const ownedIds = pinIds.filter(id => pinOwnerById.get(id) === userId)
    const attached = await admin.from('shadow_pin_images').update({ creator_id: userId }).in('id', ownedIds).select('id')
    assertNoError(attached.error, `Attach Inner Circles fixture owner ${userId}`)
    must(attached.data?.length === ownedIds.length, `Not every Inner Circles fixture was attached to ${userId}.`)
  }
  const notificationProbe = await admin.from('notification_events')
    .select('id', { count: 'exact', head: true })
    .in('entity_id', pinIds)
    .eq('type', 'shadow_pin_post')
  assertNoError(notificationProbe.error, 'Verify fixture insertion did not notify members')
  must(notificationProbe.count === 0, 'Fixture insertion unexpectedly created new-Pin notifications.')
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

const setFeedPreference = async (clientIndex, mode) => {
  const result = await clients[clientIndex].rpc('set_my_shadow_pin_feed_mode', { target_mode: mode })
  assertNoError(result.error, `Set account ${clientIndex + 1} Feed Mode to ${mode}`)
  must(firstRow(result.data)?.feed_mode === mode, `Account ${clientIndex + 1} Feed Mode did not become ${mode}.`)
}

const dismissTransientUi = async page => {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    let dismissed = false
    for (const label of [/^Skip for Now$/iu, /^(Done|Got It|Later|Not now)$/iu]) {
      const button = page.getByRole('button', { name: label }).first()
      if (await button.isVisible().catch(() => false)) {
        await button.click({ force: true })
        dismissed = true
        await page.waitForTimeout(200)
      }
    }
    await page.waitForTimeout(dismissed ? 250 : 200)
  }
}

const browserProfiles = [
  { name: 'pixel-chromium', engine: chromium, device: devices['Pixel 7'], accountIndex: 0 },
  { name: 'iphone-webkit', engine: webkit, device: devices['iPhone 13'], accountIndex: 1 },
]

const openControlledPage = async profile => {
  const browser = await profile.engine.launch({ headless: true })
  const context = await browser.newContext({ ...profile.device, serviceWorkers: 'block' })
  await context.addInitScript(({ storageKey, session }) => {
    localStorage.setItem(storageKey, JSON.stringify(session))
  }, {
    storageKey: `sb-${projectRef}-auth-token`,
    session: accountSessions[profile.accountIndex],
  })
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

  const hubUrl = `${baseUrl}/?view=dms&panel=connections`
  await page.goto(hubUrl, { waitUntil: 'domcontentloaded' })
  const connectionsHub = page.getByTestId('connections-hub')
  await connectionsHub.waitFor({ timeout: 30_000 })
  await dismissTransientUi(page)
  return page
}

const browserForPage = page => browsers.find(item => item.page === page)
const activate = async (page, locator) => {
  const profile = browserForPage(page)?.profile
  if (profile?.device?.hasTouch) await locator.tap()
  else await locator.click()
}

const focusRefresh = async page => {
  await page.bringToFront()
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(900)
}

const assertGeometry = async (page, locator, label, requireVerticalFit = false) => {
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
  if (requireVerticalFit) {
    must(geometry.top >= -1 && geometry.bottom <= geometry.viewportHeight + 1, `${label} escaped the visual viewport: ${JSON.stringify(geometry)}`)
  }
  must(geometry.pageScrollWidth <= geometry.viewportWidth + 1, `${label} has page overflow: ${JSON.stringify(geometry)}`)
  must(geometry.surfaceScrollWidth <= geometry.surfaceClientWidth + 1, `${label} has horizontal overflow: ${JSON.stringify(geometry)}`)
  return geometry
}

const assertKeyboardCompression = async (page, dialog, input, label) => {
  const originalViewport = page.viewportSize()
  must(originalViewport, `${label} has no controlled viewport.`)
  await input.focus()
  await page.setViewportSize({
    width: originalViewport.width,
    height: Math.max(420, Math.floor(originalViewport.height * 0.68)),
  })
  await page.waitForTimeout(250)
  try {
    const geometry = await dialog.evaluate(element => {
      const dialogRect = element.getBoundingClientRect()
      const inputElement = element.querySelector('input, textarea')
      const footerElement = element.querySelector('footer')
      const inputRect = inputElement?.getBoundingClientRect()
      const footerRect = footerElement?.getBoundingClientRect()
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      return {
        dialogTop: dialogRect.top,
        dialogBottom: dialogRect.bottom,
        inputTop: inputRect?.top ?? null,
        inputBottom: inputRect?.bottom ?? null,
        footerTop: footerRect?.top ?? null,
        footerBottom: footerRect?.bottom ?? null,
        viewportHeight,
        viewportWidth: window.innerWidth,
        pageScrollWidth: document.documentElement.scrollWidth,
      }
    })
    must(geometry.dialogTop >= -1 && geometry.dialogBottom <= geometry.viewportHeight + 1, `${label} dialog is not keyboard-compressed: ${JSON.stringify(geometry)}`)
    must(geometry.inputTop !== null && geometry.inputBottom <= geometry.viewportHeight + 1, `${label} input is outside the compressed viewport: ${JSON.stringify(geometry)}`)
    must(geometry.footerTop !== null && geometry.footerBottom <= geometry.viewportHeight + 1, `${label} actions are outside the compressed viewport: ${JSON.stringify(geometry)}`)
    must(geometry.pageScrollWidth <= geometry.viewportWidth + 1, `${label} introduced horizontal overflow: ${JSON.stringify(geometry)}`)
    return geometry
  } finally {
    await page.setViewportSize(originalViewport)
    await page.waitForTimeout(200)
  }
}

const waitForCircleRoute = async (page, expectedCircleId = null) => poll('Inner Circle route', async () => {
  const url = new URL(page.url())
  const circleId = url.searchParams.get('circle')
  const validBase = url.searchParams.get('view') === 'dms'
    && url.searchParams.get('panel') === 'connections'
    && url.searchParams.get('section') === 'circles'
  if (!validBase) return null
  if (expectedCircleId !== null && circleId !== expectedCircleId) return null
  if (expectedCircleId === null && circleId !== null) return null
  return url
})

const readCircle = async circleId => {
  const result = await admin.from('inner_circles').select('*').eq('id', circleId).maybeSingle()
  assertNoError(result.error, `Read Inner Circle ${circleId}`)
  return result.data
}

const readCircleMembers = async circleId => {
  const result = await admin.from('inner_circle_members').select('*').eq('circle_id', circleId).order('member_id')
  assertNoError(result.error, `Read Inner Circle members ${circleId}`)
  return result.data || []
}

const openMemberPickerAndChoose = async (page, accountIndex, circleName) => {
  const counterpart = profileById.get(userIds[1 - accountIndex])
  const counterpartName = counterpart.display_name || counterpart.username
  await activate(page, page.getByRole('button', { name: 'Add Connections', exact: true }))
  const picker = page.getByTestId('inner-circle-member-picker')
  await picker.waitFor({ timeout: 20_000 })
  const search = picker.getByLabel('Search accepted Connections')
  await search.fill(counterpart.username)
  const checkbox = picker.getByRole('checkbox', {
    name: new RegExp(escapeRegex(counterpart.username), 'iu'),
  })
  await checkbox.waitFor({ timeout: 20_000 })
  must(await checkbox.getAttribute('aria-checked') === 'false', `${counterpartName} was already selected in ${circleName}.`)
  const geometry = await assertKeyboardCompression(page, picker, search, `${browserForPage(page)?.profile.name} member picker`)
  await activate(page, checkbox)
  must(await checkbox.getAttribute('aria-checked') === 'true', `${counterpartName} was not selected in ${circleName}.`)
  await activate(page, picker.getByRole('button', { name: 'Save Members', exact: true }))
  await picker.waitFor({ state: 'hidden', timeout: 20_000 })
  return { counterpart, counterpartName, geometry }
}

const exerciseCircleHub = async (page, accountIndex) => {
  await page.goto(`${baseUrl}/?view=dms&panel=connections`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('connections-hub').waitFor({ timeout: 30_000 })
  await dismissTransientUi(page)
  const hub = page.getByTestId('connections-hub')
  const peopleTab = page.getByRole('tab', { name: /^People/iu })
  const circlesTab = page.getByRole('tab', { name: /^Circles/iu })
  must(await peopleTab.getAttribute('aria-selected') === 'true', 'Connections hub did not begin on People.')
  const hubGeometry = await assertGeometry(page, hub, `${browserForPage(page)?.profile.name} Connections hub`, true)

  await peopleTab.focus()
  await page.keyboard.press('End')
  await poll('Circles tab keyboard selection', async () => (
    await circlesTab.getAttribute('aria-selected') === 'true'
      && new URL(page.url()).searchParams.get('section') === 'circles'
  ))
  await waitForCircleRoute(page)

  await activate(page, page.getByRole('button', { name: 'New Circle', exact: true }))
  const editor = page.getByTestId('inner-circle-editor-sheet')
  await editor.waitFor({ timeout: 20_000 })
  const nameInput = editor.getByLabel('Circle name')
  await nameInput.fill(circleNames[accountIndex])
  const editorGeometry = await assertKeyboardCompression(page, editor, nameInput, `${browserForPage(page)?.profile.name} circle editor`)
  await activate(page, editor.getByRole('button', { name: 'Create Circle', exact: true }))
  await editor.waitFor({ state: 'hidden', timeout: 20_000 })
  const createdRoute = await poll('created Inner Circle detail route', async () => {
    const url = new URL(page.url())
    const id = url.searchParams.get('circle')
    return url.searchParams.get('section') === 'circles' && /^[0-9a-f-]{36}$/iu.test(id || '') ? { url, id } : null
  })
  circleIds[accountIndex] = createdRoute.id
  const circleId = createdRoute.id
  const createdRow = await poll('created Inner Circle backend row', async () => {
    const row = await readCircle(circleId)
    return row?.owner_id === userIds[accountIndex] && row.name === circleNames[accountIndex] ? row : null
  })
  must(createdRow.revision === 1, 'A new Inner Circle did not begin at revision 1.')

  await page.goBack({ waitUntil: 'domcontentloaded' })
  await waitForCircleRoute(page)
  await page.getByRole('button', { name: new RegExp(`^Open ${escapeRegex(circleNames[accountIndex])}, 0 members$`, 'u') }).waitFor({ timeout: 20_000 })
  await activate(page, page.getByRole('button', { name: new RegExp(`^Open ${escapeRegex(circleNames[accountIndex])}, 0 members$`, 'u') }))
  await waitForCircleRoute(page, circleId)

  await activate(page, page.getByRole('button', { name: `Rename ${circleNames[accountIndex]}`, exact: true }).first())
  await editor.waitFor({ timeout: 20_000 })
  await editor.getByLabel('Circle name').fill(renamedCircleNames[accountIndex])
  await activate(page, editor.getByRole('button', { name: 'Save Name', exact: true }))
  await editor.waitFor({ state: 'hidden', timeout: 20_000 })
  await page.getByRole('heading', { name: renamedCircleNames[accountIndex], exact: true }).waitFor({ timeout: 20_000 })
  await poll('renamed Inner Circle backend row', async () => {
    const row = await readCircle(circleId)
    return row?.name === renamedCircleNames[accountIndex] && row.revision >= 2 ? row : null
  })

  const unconnectedUserId = randomUUID()
  const rejected = await clients[accountIndex].rpc('set_my_inner_circle_members', {
    target_circle_id: circleId,
    target_member_ids: [userIds[1 - accountIndex], unconnectedUserId],
  })
  must(Boolean(rejected.error), 'A mixed accepted/unaccepted member set was not rejected atomically.')
  must((await readCircleMembers(circleId)).length === 0, 'Atomic rejection partially added an Inner Circle member.')

  const firstPicker = await openMemberPickerAndChoose(page, accountIndex, renamedCircleNames[accountIndex])
  await poll('valid Inner Circle member add', async () => {
    const rows = await readCircleMembers(circleId)
    return rows.length === 1 && rows[0].member_id === userIds[1 - accountIndex] ? rows : null
  })
  const removeButton = page.getByRole('button', {
    name: `Remove ${firstPicker.counterpartName} from ${renamedCircleNames[accountIndex]}`,
    exact: true,
  })
  await removeButton.waitFor({ timeout: 20_000 })
  await activate(page, removeButton)
  await poll('Inner Circle member remove', async () => (await readCircleMembers(circleId)).length === 0)
  await page.getByText('No one is in this circle yet', { exact: true }).waitFor({ timeout: 20_000 })

  const secondPicker = await openMemberPickerAndChoose(page, accountIndex, renamedCircleNames[accountIndex])
  await poll('Inner Circle member re-add', async () => {
    const rows = await readCircleMembers(circleId)
    return rows.length === 1 && rows[0].member_id === userIds[1 - accountIndex] ? rows : null
  })
  await page.getByRole('button', {
    name: `Remove ${secondPicker.counterpartName} from ${renamedCircleNames[accountIndex]}`,
    exact: true,
  }).waitFor({ timeout: 20_000 })
  await page.screenshot({
    path: path.join(artifactDir, `${browserForPage(page)?.profile.name}-circle-detail.png`),
    fullPage: true,
  })
  return {
    circleId,
    hubGeometry,
    editorGeometry,
    pickerGeometry: secondPicker.geometry,
  }
}

const waitForConnectionsMode = async page => {
  const tab = page.getByTestId('shadow-pin-feed-mode-connections')
  await poll('Connections Feed Mode', async () => {
    const url = new URL(page.url())
    const rootMode = await page.locator('[data-feed-mode]').first().getAttribute('data-feed-mode').catch(() => null)
    return await tab.getAttribute('aria-selected') === 'true'
      && rootMode === 'connections'
      && url.searchParams.get('feed') === 'connections'
  })
}

const assertFeed = async (page, expectedIds) => {
  const feed = page.getByTestId('shadow-pin-feed')
  await feed.waitFor({ timeout: 30_000 })
  await poll('ordered circle Pin feed cards', async () => {
    const ids = await feed.locator('[data-testid^="shadow-pin-feed-card-"]').evaluateAll(elements => (
      elements.map(element => element.getAttribute('data-testid')?.replace('shadow-pin-feed-card-', ''))
    ))
    return JSON.stringify(ids) === JSON.stringify(expectedIds) ? ids : null
  })
  return assertGeometry(page, feed, `${browserForPage(page)?.profile.name} Inner Circle Pin feed`)
}

const assertUniversalSearch = async (page, title) => {
  await activate(page, page.getByRole('button', { name: 'Open category search', exact: true }))
  const input = page.getByRole('searchbox', { name: 'Search all of ShadowPin' })
  await input.fill(title)
  const result = page.getByRole('option').filter({ hasText: title }).first()
  await result.waitFor({ timeout: 30_000 })
  must(await result.isVisible(), `Universal Search did not return ${title}.`)
  await input.fill('')
}

const exerciseTheaterAndComments = async (page, accountIndex, circleId, pinId, title) => {
  const card = page.getByTestId('shadow-pin-feed').getByTestId(`shadow-pin-feed-card-${pinId}`)
  const openButton = card.getByRole('button', { name: new RegExp(`^Open .*${escapeRegex(title)}`, 'u') })
  await activate(page, openButton)
  const theater = page.getByTestId('shadow-pin-theater')
  await theater.waitFor({ timeout: 30_000 })
  await theater.locator('#shadow-pin-theater-title').getByText(title, { exact: true }).waitFor()
  let route = new URL(page.url())
  must(
    route.searchParams.get('view') === 'pins'
      && route.searchParams.get('feed') === 'connections'
      && route.searchParams.get('circle') === circleId
      && route.searchParams.get('pin') === pinId,
    `Theater route lost Inner Circle context: ${route.href}`,
  )
  const theaterGeometry = await assertGeometry(page, theater, `${browserForPage(page)?.profile.name} circle Theater`, true)

  await theater.getByRole('button', { name: /comments\. Open comments\./iu }).click()
  const commentsDialog = page.locator('[role="dialog"][aria-labelledby="shadow-pin-comments-title"]')
  await commentsDialog.waitFor({ timeout: 30_000 })
  route = new URL(page.url())
  must(
    route.searchParams.get('panel') === 'comments'
      && route.searchParams.get('circle') === circleId
      && route.searchParams.get('pin') === pinId
      && route.searchParams.get('feed') === 'connections',
    `Comments route lost Inner Circle context: ${route.href}`,
  )
  const commentsGeometry = await assertGeometry(page, commentsDialog, `${browserForPage(page)?.profile.name} circle comments`, true)
  const body = `${marker}-COMMENT-${accountIndex + 1}`
  await commentsDialog.getByRole('textbox', { name: 'Add a ShadowPin comment' }).fill(body)
  await commentsDialog.getByRole('button', { name: 'Post comment', exact: true }).click()
  const comment = await poll(`comment on ${title}`, async () => {
    const result = await admin.from('shadow_pin_comments').select('id,image_id,author_id,body')
      .eq('image_id', pinId)
      .eq('author_id', userIds[accountIndex])
      .eq('body', body)
      .maybeSingle()
    assertNoError(result.error, `Read Inner Circles comment for ${title}`)
    return result.data
  })
  commentIds.add(comment.id)
  await commentsDialog.getByText(body, { exact: true }).waitFor()

  await page.goBack({ waitUntil: 'domcontentloaded' })
  await commentsDialog.waitFor({ state: 'hidden', timeout: 20_000 })
  await theater.waitFor({ timeout: 20_000 })
  route = new URL(page.url())
  must(!route.searchParams.has('panel') && route.searchParams.get('circle') === circleId && route.searchParams.get('pin') === pinId, `Back from comments lost Inner Circle Theater: ${route.href}`)
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await theater.waitFor({ state: 'hidden', timeout: 20_000 })
  await page.getByTestId('shadow-pin-connections-panel').waitFor({ timeout: 20_000 })
  route = new URL(page.url())
  must(!route.searchParams.has('pin') && route.searchParams.get('circle') === circleId && route.searchParams.get('feed') === 'connections', `Back from Theater lost Inner Circle feed: ${route.href}`)
  return { theaterGeometry, commentsGeometry }
}

const exerciseCircleFeed = async (page, accountIndex) => {
  const circleId = circleIds[accountIndex]
  must(circleId, `Account ${accountIndex + 1} has no verifier Circle.`)
  await page.goto(`${baseUrl}/?view=pins&feed=connections`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('shadow-pin-feed-mode-tabs').waitFor({ timeout: 30_000 })
  await dismissTransientUi(page)
  await waitForConnectionsMode(page)

  const trigger = page.getByTestId('shadow-pin-circle-filter-trigger')
  await trigger.getByText('All Connections', { exact: true }).waitFor({ timeout: 20_000 })
  await activate(page, trigger)
  const filter = page.getByTestId('shadow-pin-circle-filter')
  await filter.waitFor({ timeout: 20_000 })
  await assertGeometry(page, filter, `${browserForPage(page)?.profile.name} circle filter`, true)
  const circleOption = filter.getByRole('radio', {
    name: new RegExp(`^${escapeRegex(renamedCircleNames[accountIndex])}`, 'u'),
  })
  await circleOption.waitFor({ timeout: 20_000 })
  await activate(page, circleOption)
  await filter.waitFor({ state: 'hidden', timeout: 20_000 })
  await poll('selected ShadowPin circle filter route', async () => {
    const url = new URL(page.url())
    return url.searchParams.get('view') === 'pins'
      && url.searchParams.get('feed') === 'connections'
      && url.searchParams.get('circle') === circleId
  })
  await trigger.getByText(renamedCircleNames[accountIndex], { exact: true }).waitFor({ timeout: 20_000 })

  const expectedIds = expectedCircleFeedByViewer.get(userIds[accountIndex])
  const feedGeometry = await assertFeed(page, expectedIds)
  await assertUniversalSearch(page, pinTitles[accountIndex * 2])
  const theater = await exerciseTheaterAndComments(
    page,
    accountIndex,
    circleId,
    expectedIds[0],
    pinTitles[pinIds.indexOf(expectedIds[0])],
  )

  const emptied = await clients[accountIndex].rpc('set_my_inner_circle_members', {
    target_circle_id: circleId,
    target_member_ids: [],
  })
  assertNoError(emptied.error, `Empty account ${accountIndex + 1} Inner Circle`)
  await focusRefresh(page)
  const empty = page.getByTestId('shadow-pin-feed-empty')
  await empty.getByText('This circle is empty', { exact: true }).waitFor({ timeout: 30_000 })
  must(new URL(page.url()).searchParams.get('circle') === circleId, 'Empty Inner Circle dropped its selected route.')

  // The product deliberately coalesces focus/visibility refresh waves for 750ms.
  await page.waitForTimeout(800)
  const restored = await clients[accountIndex].rpc('set_my_inner_circle_members', {
    target_circle_id: circleId,
    target_member_ids: [userIds[1 - accountIndex]],
  })
  assertNoError(restored.error, `Restore account ${accountIndex + 1} Inner Circle member`)
  await focusRefresh(page)
  await assertFeed(page, expectedIds)
  await page.screenshot({
    path: path.join(artifactDir, `${browserForPage(page)?.profile.name}-circle-feed.png`),
    fullPage: true,
  })
  return { feedGeometry, ...theater }
}

const deleteCircleThroughUi = async (page, accountIndex) => {
  const circleId = circleIds[accountIndex]
  must(circleId, `Account ${accountIndex + 1} has no Circle to delete.`)
  await page.goto(`${baseUrl}/?view=dms&panel=connections&section=circles&circle=${circleId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('connections-hub').waitFor({ timeout: 30_000 })
  await page.getByRole('heading', { name: renamedCircleNames[accountIndex], exact: true }).waitFor({ timeout: 30_000 })
  await activate(page, page.getByRole('button', { name: `Delete ${renamedCircleNames[accountIndex]}`, exact: true }).first())
  const dialog = page.getByTestId('inner-circle-delete-dialog')
  await dialog.waitFor({ timeout: 20_000 })
  await assertGeometry(page, dialog, `${browserForPage(page)?.profile.name} circle delete dialog`, true)
  await activate(page, dialog.getByRole('button', { name: 'Delete', exact: true }))
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 })
  await poll('deleted Inner Circle backend row', async () => (await readCircle(circleId)) === null)
  await waitForCircleRoute(page)
}

const closeBrowsers = async () => {
  for (const item of browsers.reverse()) {
    await item.context.close().catch(() => undefined)
    await item.browser.close().catch(() => undefined)
  }
  await wait(500)
}

const deleteRemainingVerifierCircles = async () => {
  for (let accountIndex = 0; accountIndex < circleIds.length; accountIndex += 1) {
    const listed = await clients[accountIndex].rpc('list_my_inner_circles')
    assertNoError(listed.error, `List verifier Circles for cleanup account ${accountIndex + 1}`)
    const verifierNames = new Set([circleNames[accountIndex], renamedCircleNames[accountIndex]])
    const candidates = (listed.data || []).filter(row => (
      !originalCircleIds.has(row.id)
      && (row.id === circleIds[accountIndex] || verifierNames.has(row.name))
    ))
    for (const circle of candidates) {
      if (!circleIds[accountIndex]) circleIds[accountIndex] = circle.id
      const removed = await clients[accountIndex].rpc('mutate_my_inner_circle', {
        target_circle_id: circle.id,
        target_action: 'delete',
        target_name: null,
        expected_revision: circle.revision,
      })
      assertNoError(removed.error, `Delete verifier Circle ${circle.id}`)
    }
  }
}

const cleanup = async () => {
  await closeBrowsers()

  try {
    await deleteRemainingVerifierCircles()
  } catch (error) {
    cleanupErrors.push(`Circle cleanup: ${messageOf(error)}`)
  }

  try {
    await resetPairWithBlock()
  } catch (error) {
    cleanupErrors.push(`Pair/block cleanup: ${messageOf(error)}`)
  }

  const exactEntityIds = unique([...pinIds, ...commentIds, ...pairIds, ...circleIds])
  try {
    if (exactEntityIds.length > 0) {
      const result = await admin.from('notification_events').delete({ count: 'exact' }).in('entity_id', exactEntityIds)
      assertNoError(result.error, 'Delete exact Inner Circles notification events')
    }
  } catch (error) {
    cleanupErrors.push(`Notification cleanup: ${messageOf(error)}`)
  }

  try {
    const activity = await admin.from('activity_events').delete({ count: 'exact' }).in('shadow_pin_image_id', pinIds)
    assertNoError(activity.error, 'Delete exact Inner Circles Activity rows')
    if (commentIds.size > 0) {
      const comments = await admin.from('shadow_pin_comments').delete({ count: 'exact' }).in('id', [...commentIds])
      assertNoError(comments.error, 'Delete exact Inner Circles comments')
    }
  } catch (error) {
    cleanupErrors.push(`Comment/activity cleanup: ${messageOf(error)}`)
  }

  try {
    const hearts = await admin.from('shadow_pin_image_hearts').delete({ count: 'exact' }).in('image_id', pinIds).in('user_id', userIds)
    assertNoError(hearts.error, 'Delete exact Inner Circles hearts')
  } catch (error) {
    cleanupErrors.push(`Heart cleanup: ${messageOf(error)}`)
  }

  try {
    const events = await admin.from('shadow_pin_activity_events').select('id')
      .in('user_id', userIds)
      .gte('created_at', runStartedAt)
    assertNoError(events.error, 'Find run-scoped Inner Circles analytics events')
    const eventIds = (events.data || []).map(row => row.id)
    if (eventIds.length > 0) {
      const deleted = await admin.from('shadow_pin_activity_events').delete({ count: 'exact' }).in('id', eventIds)
      assertNoError(deleted.error, 'Delete run-scoped Inner Circles analytics events')
    }
    const sessions = await admin.from('shadow_pin_activity_sessions').select('id')
      .in('user_id', userIds)
      .gte('created_at', runStartedAt)
    assertNoError(sessions.error, 'Find run-scoped Inner Circles analytics sessions')
    const sessionIds = (sessions.data || []).map(row => row.id)
    if (sessionIds.length > 0) {
      const deleted = await admin.from('shadow_pin_activity_sessions').delete({ count: 'exact' }).in('id', sessionIds)
      assertNoError(deleted.error, 'Delete run-scoped Inner Circles analytics sessions')
    }
  } catch (error) {
    cleanupErrors.push(`Analytics cleanup: ${messageOf(error)}`)
  }

  try {
    const pins = await admin.from('shadow_pin_images').delete({ count: 'exact' }).in('id', pinIds)
    assertNoError(pins.error, 'Delete exact Inner Circles Pins')
    const categories = await admin.from('shadow_pin_categories').delete({ count: 'exact' }).in('id', categoryIds)
    assertNoError(categories.error, 'Delete exact Inner Circles categories')
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
    const [circles, memberships, pairs, blocks, pins, categories, hearts, notifications, activity, analyticsEvents, analyticsSessions, comments, preferences] = await Promise.all([
      readControlledCircles(),
      readControlledMemberships(),
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
      commentIds.size > 0
        ? admin.from('shadow_pin_comments').select('id', { count: 'exact', head: true }).in('id', [...commentIds])
        : Promise.resolve({ count: 0, error: null }),
      admin.from('shadow_pin_feed_preferences').select('*').in('user_id', userIds).order('user_id'),
    ])
    for (const [label, result] of Object.entries({ pins, categories, hearts, notifications, activity, analyticsEvents, analyticsSessions, comments, preferences })) {
      assertNoError(result.error, `Verify ${label} cleanup`)
    }
    must(JSON.stringify(circles) === JSON.stringify(originalCircles), 'Controlled Inner Circles do not match the pre-run snapshot.')
    must(JSON.stringify(memberships) === JSON.stringify(originalMemberships), 'Controlled Inner Circle memberships do not match the pre-run snapshot.')
    must(pairs.length === 0 && blocks.length === 0, 'Connection or block residue remains.')
    for (const [label, result] of Object.entries({ pins, categories, hearts, notifications, activity, analyticsEvents, analyticsSessions, comments })) {
      must((result.count || 0) === 0, `${label} cleanup left ${result.count} rows.`)
    }
    must(JSON.stringify(stableRows(preferences.data || [])) === JSON.stringify(originalPreferences), 'Feed Mode preferences do not match the pre-run snapshot.')
  } catch (error) {
    cleanupErrors.push(`Zero-residue proof: ${messageOf(error)}`)
  }
}

try {
  await seedFixtures()
  await Promise.all([setFeedPreference(0, 'connections'), setFeedPreference(1, 'connections')])
  await connectPair()

  const pixelPage = await openControlledPage(browserProfiles[0])
  const iphonePage = await openControlledPage(browserProfiles[1])
  const pages = [pixelPage, iphonePage]

  const hubResults = []
  for (let index = 0; index < pages.length; index += 1) {
    hubResults.push(await exerciseCircleHub(pages[index], index))
  }
  checks.push({
    name: 'people-circles-detail-back-create-rename-atomic-membership-and-mobile-geometry',
    passed: true,
    profiles: hubResults,
  })

  const feedResults = []
  for (let index = 0; index < pages.length; index += 1) {
    feedResults.push(await exerciseCircleFeed(pages[index], index))
  }
  checks.push({
    name: 'circle-filter-empty-scoped-feed-universal-search-theater-comments-and-back',
    passed: true,
    profiles: feedResults,
  })

  for (let index = 0; index < pages.length; index += 1) {
    await deleteCircleThroughUi(pages[index], index)
  }
  checks.push({ name: 'owner-delete-and-safe-circles-route-restoration', passed: true })

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
  fixtureIds: {
    categoryIds,
    pinIds,
    circleIds,
    commentIds: [...commentIds],
    pairIds: [...pairIds],
  },
  checks,
  browserDiagnostics: serializableDiagnostics,
  cleanup: {
    strategy: 'close browsers; owner-RPC exact Circle deletion; block/unblock pair hard-delete; exact notification/comment/activity/fixture deletion; run-scoped analytics deletion; exact preference and controlled-circle snapshot restoration; zero-count proof',
    errors: cleanupErrors,
  },
  failure,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
if (!passed) {
  console.error(JSON.stringify(summary, null, 2))
  process.exitCode = 1
} else {
  console.log(`Inner Circles browser proof passed: ${path.join(artifactDir, 'summary.json')}`)
}

import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices, webkit } from 'playwright'

const repoRoot = process.cwd()
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'wave3-connections')
const npxCliPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
const connectionEventTypes = ['connection_request', 'connection_accepted', 'connection_changed']

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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const credentials = [1, 2].map(number => ({
  email: env[`PLAYWRIGHT_ACCOUNT_${number}_EMAIL`] || env[`PLAYWRIGHT_ACCOUNT${number}_EMAIL`],
  password: env[`PLAYWRIGHT_ACCOUNT_${number}_PASSWORD`] || env[`PLAYWRIGHT_ACCOUNT${number}_PASSWORD`],
}))
const baseUrl = String(env.PLAYWRIGHT_BASE_URL || '').replace(/\/$/u, '')
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

must(baseUrl, 'PLAYWRIGHT_BASE_URL is required; Connections verification never assumes a production origin.')
must(supabaseUrl && supabaseAnonKey, 'Missing Supabase URL or browser-safe anon key.')
must(credentials.every(account => account.email && account.password), 'Two controlled Playwright accounts are required.')

const parsedBaseUrl = new URL(baseUrl)
must(['http:', 'https:'].includes(parsedBaseUrl.protocol), 'PLAYWRIGHT_BASE_URL must be an HTTP(S) origin.')
must(!parsedBaseUrl.username && !parsedBaseUrl.password, 'PLAYWRIGHT_BASE_URL must not contain credentials.')
must((parsedBaseUrl.pathname === '/' || parsedBaseUrl.pathname === '') && !parsedBaseUrl.search && !parsedBaseUrl.hash, 'PLAYWRIGHT_BASE_URL must be an origin only.')

const projectRef = new URL(supabaseUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/iu)?.[1]
must(projectRef, 'Connections browser verification requires a hosted Supabase project.')
if (env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF) {
  must(
    env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF === projectRef,
    `Refusing unexpected Supabase project ${projectRef}.`,
  )
}

const resolveServiceRoleKey = () => {
  const configured = env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (configured) return configured
  const raw = execFileSync(process.execPath, [npxCliPath, 'supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'], {
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
  const { data, error } = await clients[index].auth.signInWithPassword(credentials[index])
  if (error || !data.user) throw error || new Error(`Unable to sign in controlled account ${index + 1}.`)
  userIds.push(data.user.id)
}
must(userIds[0] !== userIds[1], 'The controlled accounts resolve to the same user.')

const migrationProbe = await admin.from('user_connections').select('id').limit(1)
if (migrationProbe.error && ['42P01', 'PGRST204', 'PGRST205'].includes(migrationProbe.error.code)) {
  const readySummary = {
    generatedAt: new Date().toISOString(),
    status: 'ready-to-run',
    passed: false,
    reason: 'The Connections migration is not present on the configured shared backend. Apply and verify it before running this browser proof.',
    baseUrl,
    supabaseProjectRef: projectRef,
  }
  await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(readySummary, null, 2)}\n`, 'utf8')
  for (const client of clients) await client.auth.signOut()
  console.log(`Connections browser verifier is ready to run after the remote migration: ${path.join(artifactDir, 'summary.json')}`)
  process.exit(0)
}
if (migrationProbe.error) throw migrationProbe.error

const profilesResult = await admin
  .from('users')
  .select('id,username,display_name,dm_discoverable')
  .in('id', userIds)
if (profilesResult.error) throw profilesResult.error
const profilesById = new Map((profilesResult.data || []).map(profile => [profile.id, profile]))
const controlledProfiles = userIds.map(userId => profilesById.get(userId))
must(controlledProfiles.every(Boolean), 'A controlled account is missing its public profile row.')
const discoveryProfile = controlledProfiles[1]
const changedDiscoveryUserIds = []
if (discoveryProfile.dm_discoverable !== true) {
  const enabledDiscovery = await admin
    .from('users')
    .update({ dm_discoverable: true })
    .eq('id', discoveryProfile.id)
    .eq('dm_discoverable', false)
    .select('id,dm_discoverable')
  if (enabledDiscovery.error) throw enabledDiscovery.error
  must(enabledDiscovery.data?.length === 1 && enabledDiscovery.data[0].dm_discoverable === true, 'Controlled discovery setup could not be confirmed.')
  changedDiscoveryUserIds.push(discoveryProfile.id)
}

const [memberLowId, memberHighId] = [...userIds].sort()
const preexistingPair = await admin
  .from('user_connections')
  .select('id,status,revision')
  .eq('member_low_id', memberLowId)
  .eq('member_high_id', memberHighId)
if (preexistingPair.error) throw preexistingPair.error
must(preexistingPair.data?.length === 0, 'Refusing to overwrite a preexisting Connection between the controlled accounts.')

const readPairBlocks = async () => {
  const { data, error } = await admin
    .from('user_blocks')
    .select('blocker_id,blocked_id,created_at')
    .in('blocker_id', userIds)
    .in('blocked_id', userIds)
  if (error) throw error
  return data || []
}

const preexistingBlocks = await readPairBlocks()
must(preexistingBlocks.length === 0, 'Refusing to alter a preexisting personal block between the controlled accounts.')

const readDmHistory = async () => {
  const conversationsResult = await admin
    .from('dm_conversations')
    .select('id,participants,created_at')
    .contains('participants', userIds)
    .order('id', { ascending: true })
  if (conversationsResult.error) throw conversationsResult.error
  const conversations = conversationsResult.data || []
  const conversationIds = conversations.map(row => row.id)
  if (conversationIds.length === 0) return { conversations, messages: [] }
  const messagesResult = await admin
    .from('dm_messages')
    .select('id,conversation_id,sender_id,content,message_type,file_url,audio_url,audio_duration,created_at,client_message_id')
    .in('conversation_id', conversationIds)
    .order('id', { ascending: true })
  if (messagesResult.error) throw messagesResult.error
  return { conversations, messages: messagesResult.data || [] }
}

const dmBefore = await readDmHistory()
must(dmBefore.conversations.length === 1, 'The controlled accounts need exactly one existing DM conversation so the Message entry point can be verified without creating or deleting DM data.')

const readPreferences = async () => {
  const { data, error } = await admin
    .from('notification_preferences')
    .select('*')
    .in('user_id', userIds)
  if (error) throw error
  return data || []
}

const originalPreferences = await readPreferences()
const originalPreferenceByUser = new Map(originalPreferences.map(row => [row.user_id, row]))
const insertedPreferenceUsers = []
for (const userId of userIds) {
  const original = originalPreferenceByUser.get(userId)
  if (original) {
    const { error } = await admin
      .from('notification_preferences')
      .update({ connection_notifications_enabled: true })
      .eq('user_id', userId)
    if (error) throw error
  } else {
    const { error } = await admin
      .from('notification_preferences')
      .insert({ user_id: userId, connection_notifications_enabled: true })
    if (error) throw error
    insertedPreferenceUsers.push(userId)
  }
}
const enabledPreferences = await readPreferences()
const enabledPreferenceByUser = new Map(enabledPreferences.map(row => [row.user_id, row]))

const browserProfiles = [
  {
    name: 'pixel-chromium',
    engine: chromium,
    device: devices['Pixel 7'],
  },
  {
    name: 'iphone-webkit',
    engine: webkit,
    device: devices['iPhone 13'],
  },
]

const browsers = []
const browserDiagnostics = []
const pairIds = new Set()
const cleanupErrors = []
const results = []

const dismissTransientUi = async page => {
  for (const label of [/^Skip for Now$/iu, /^(Done|Got It|Later|Not now)$/iu]) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true })
      await page.waitForTimeout(200)
    }
  }
}

const launchControlledPage = async (browserProfile, accountIndex) => {
  const browser = await browserProfile.engine.launch({ headless: true })
  const context = await browser.newContext({
    ...browserProfile.device,
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  const diagnostics = {
    profile: browserProfile.name,
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
    const failure = request.failure()?.errorText || 'unknown failure'
    if (/abort|cancelled/iu.test(failure)) return
    diagnostics.requestFailures.push(`${request.method()} ${request.url()} - ${failure}`)
  })
  page.on('response', response => {
    if (response.status() < 400) return
    const type = response.request().resourceType()
    if (!['document', 'script', 'stylesheet', 'xhr', 'fetch'].includes(type)) return
    diagnostics.errorResponses.push(`${response.status()} ${response.request().method()} ${response.url()}`)
  })

  await page.goto(`${baseUrl}/?view=dms`, { waitUntil: 'domcontentloaded' })
  try {
    await page.waitForFunction(() => {
      const text = document.body?.innerText || ''
      return text.includes('Sign in') || text.includes('Search conversations')
    }, null, { timeout: 30_000 })
  } catch (error) {
    const bodyText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/gu, ' ').trim().slice(0, 240)
    throw new Error(`${browserProfile.name} app readiness timed out at ${page.url()}${bodyText ? `; visible text: ${bodyText}` : '; no visible text'}`, { cause: error })
  }
  const signIn = page.locator('form').getByRole('button', { name: /^Sign in$/iu })
  if (await signIn.isVisible().catch(() => false)) {
    await page.locator('input[name="email"]').fill(credentials[accountIndex].email)
    await page.locator('input[name="password"]').fill(credentials[accountIndex].password)
    await signIn.click()
  }
  await page.getByPlaceholder('Search conversations').waitFor({ timeout: 30_000 })
  await dismissTransientUi(page)
  if (new URL(page.url()).searchParams.get('view') !== 'dms') {
    await page.goto(`${baseUrl}/?view=dms`, { waitUntil: 'domcontentloaded' })
    await page.getByPlaceholder('Search conversations').waitFor({ timeout: 30_000 })
    await dismissTransientUi(page)
  }
  browsers.push({ browser, context, page, diagnostics })
  browserDiagnostics.push(diagnostics)
  return { page, diagnostics }
}

const assertNoHorizontalOverflow = async (page, surfaceTestId) => {
  const geometry = await page.getByTestId(surfaceTestId).evaluate(element => {
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
  must(geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1, `${surfaceTestId} escaped the viewport: ${JSON.stringify(geometry)}`)
  must(geometry.pageScrollWidth <= geometry.viewportWidth + 1, `Page has horizontal overflow: ${JSON.stringify(geometry)}`)
  must(geometry.surfaceScrollWidth <= geometry.surfaceClientWidth + 1, `${surfaceTestId} has horizontal overflow: ${JSON.stringify(geometry)}`)
  return geometry
}

const openConnections = async page => {
  await dismissTransientUi(page)
  const button = page.getByRole('button', { name: /^Open Connections(?:,|$)/iu })
  await button.waitFor({ timeout: 20_000 })
  await button.click()
  const hub = page.getByTestId('connections-hub')
  await hub.waitFor({ timeout: 15_000 })
  try {
    await page.waitForURL(url => url.searchParams.get('panel') === 'connections', { timeout: 10_000 })
  } catch (error) {
    throw new Error(`Connections hub opened without its exact route; current URL is ${page.url()}`, { cause: error })
  }
  return hub
}

const focusRefresh = async page => {
  await page.bringToFront()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForTimeout(350)
}

const waitForDialogFocus = async (page, focusAnchor, label) => {
  const element = await focusAnchor.elementHandle()
  must(element, `${label} focus anchor is unavailable.`)
  try {
    await page.waitForFunction(anchor => anchor.closest('[role="dialog"]')?.contains(document.activeElement) === true, element, { timeout: 3_000 })
  } catch (error) {
    const state = await focusAnchor.evaluate(anchor => {
      const active = document.activeElement
      return {
        activeTag: active?.tagName || null,
        activeLabel: active?.getAttribute?.('aria-label') || null,
        activeTestId: active?.getAttribute?.('data-testid') || null,
        activeRole: active?.getAttribute?.('role') || null,
        activeId: active?.id || null,
        activeClass: typeof active?.className === 'string' ? active.className.slice(0, 240) : null,
        activeDialogLabel: active?.closest?.('[role="dialog"]')?.getAttribute('aria-labelledby') || null,
      }
    })
    throw new Error(`${label} did not receive modal focus: ${JSON.stringify(state)}`, { cause: error })
  }
}

const captureCurrentPairId = async client => {
  const { data, error } = await client.rpc('get_my_connection_state', { target_user_id: userIds[1] })
  if (error) throw error
  const connectionId = firstRow(data)?.connection_id
  if (connectionId) pairIds.add(connectionId)
  return firstRow(data)
}

const resetPairWithBlock = async () => {
  const existingBlocks = await readPairBlocks()
  const unexpected = existingBlocks.filter(row => row.blocker_id !== userIds[0] || row.blocked_id !== userIds[1])
  must(unexpected.length === 0, 'Ambiguous cleanup: an unexpected reciprocal block appeared during verification.')
  if (existingBlocks.length > 0) {
    const { data, error } = await clients[0].rpc('unblock_user', { target_user_id: userIds[1] })
    if (error) throw error
    must(data === true, 'Unable to clear the verifier-owned block before pair reset.')
  }
  const blockResult = await clients[0].rpc('block_user', { target_user_id: userIds[1] })
  if (blockResult.error) throw blockResult.error
  must(blockResult.data === true, 'Verifier-owned block was not created for hard-delete cleanup.')
  const unblockResult = await clients[0].rpc('unblock_user', { target_user_id: userIds[1] })
  if (unblockResult.error) throw unblockResult.error
  must(unblockResult.data === true, 'Verifier-owned block was not removed after hard-delete cleanup.')
  const remaining = await admin
    .from('user_connections')
    .select('id')
    .eq('member_low_id', memberLowId)
    .eq('member_high_id', memberHighId)
  if (remaining.error) throw remaining.error
  must(remaining.data?.length === 0, 'Block cleanup did not hard-delete the test pair.')
}

const waitForHubRow = (page, userId) => page.getByTestId(`connection-row-${userId}`).waitFor({ timeout: 20_000 })

try {
  const accountA = await launchControlledPage(browserProfiles[0], 0)
  const accountB = await launchControlledPage(browserProfiles[1], 1)
  const pageA = accountA.page
  const pageB = accountB.page

  let hubA = await openConnections(pageA)
  const initialFocusInsideHub = await hubA.evaluate(element => element.contains(document.activeElement))
  must(initialFocusInsideHub, 'Connections hub did not place focus inside the modal.')
  const pixelGeometry = await assertNoHorizontalOverflow(pageA, 'connections-hub')

  await pageA.goBack({ waitUntil: 'domcontentloaded' })
  await hubA.waitFor({ state: 'hidden', timeout: 15_000 })
  must(!new URL(pageA.url()).searchParams.has('panel'), 'Browser Back did not close the exact Connections route.')
  hubA = await openConnections(pageA)
  await pageA.keyboard.press('Escape')
  await hubA.waitFor({ state: 'hidden', timeout: 15_000 })
  must(!new URL(pageA.url()).searchParams.has('panel'), 'Escape did not close the Connections route.')
  hubA = await openConnections(pageA)

  const searchA = pageA.getByTestId('connections-search-input')
  await searchA.fill(controlledProfiles[1].username)
  const searchRowB = pageA.getByTestId(`connection-row-${userIds[1]}`)
  await searchRowB.waitFor({ timeout: 20_000 })
  await searchRowB.getByRole('button').first().click()
  const profileCloseA = pageA.getByRole('button', { name: 'Close profile' })
  await profileCloseA.waitFor({ timeout: 15_000 })
  await waitForDialogFocus(pageA, profileCloseA, 'Public profile')

  await pageA.getByTestId(`connection-action-request-${userIds[1]}`).click()
  await pageA.getByTestId(`connection-action-cancel-${userIds[1]}`).waitFor({ timeout: 20_000 })
  const firstState = await captureCurrentPairId(clients[0])
  must(firstState?.direction === 'outgoing', 'The canonical backend did not record the outgoing request.')

  const requestBanner = pageB.getByRole('button', { name: /sent you a connection request\. Open Connections\./iu }).last()
  await requestBanner.waitFor({ timeout: 20_000 })
  await pageB.getByRole('button', { name: /Open Connections, 1 pending request/iu }).waitFor({ timeout: 20_000 })
  await requestBanner.click()
  let hubB = pageB.getByTestId('connections-hub')
  await hubB.waitFor({ timeout: 15_000 })
  const iphoneGeometry = await assertNoHorizontalOverflow(pageB, 'connections-hub')
  await pageB.getByTestId('connections-tab-incoming').click()
  await waitForHubRow(pageB, userIds[0])

  await pageA.getByTestId(`connection-action-cancel-${userIds[1]}`).click()
  await pageA.getByRole('group', { name: /Cancel your request/iu }).getByRole('button', { name: 'Confirm' }).click()
  await pageA.getByRole('button', { name: /Connection request available again in/iu }).waitFor({ timeout: 20_000 })
  await pageB.getByTestId(`connection-row-${userIds[0]}`).waitFor({ state: 'hidden', timeout: 20_000 })
  await resetPairWithBlock()
  await focusRefresh(pageA)
  await pageA.getByTestId(`connection-action-request-${userIds[1]}`).waitFor({ timeout: 20_000 })

  await pageA.getByTestId(`connection-action-request-${userIds[1]}`).click()
  await pageA.getByTestId(`connection-action-cancel-${userIds[1]}`).waitFor({ timeout: 20_000 })
  await captureCurrentPairId(clients[0])
  await waitForHubRow(pageB, userIds[0])
  await pageB.getByTestId(`connection-action-decline-${userIds[0]}`).click()
  await pageB.getByRole('group', { name: /Decline .*connection request/iu }).getByRole('button', { name: 'Confirm' }).click()
  await pageB.getByTestId(`connection-row-${userIds[0]}`).waitFor({ state: 'hidden', timeout: 20_000 })
  await resetPairWithBlock()
  await focusRefresh(pageA)
  await pageA.getByTestId(`connection-action-request-${userIds[1]}`).waitFor({ timeout: 20_000 })

  await pageA.getByTestId(`connection-action-request-${userIds[1]}`).click()
  await pageA.getByTestId(`connection-action-cancel-${userIds[1]}`).waitFor({ timeout: 20_000 })
  await captureCurrentPairId(clients[0])
  await waitForHubRow(pageB, userIds[0])
  await pageB.getByTestId(`connection-action-accept-${userIds[0]}`).click()
  const acceptedBanner = pageA.getByRole('button', { name: /accepted your connection request\. Open Connections\./iu }).last()
  await acceptedBanner.waitFor({ timeout: 20_000 })
  await pageB.getByTestId(`connection-row-${userIds[0]}`).waitFor({ state: 'hidden', timeout: 20_000 })

  await focusRefresh(pageA)
  await pageA.getByTestId(`connection-action-remove-${userIds[1]}`).waitFor({ timeout: 20_000 })
  const acceptedState = await captureCurrentPairId(clients[0])
  must(acceptedState?.direction === 'connected', 'Focus refresh did not converge on the canonical accepted state.')

  await pageB.getByTestId('connections-tab-accepted').click()
  await waitForHubRow(pageB, userIds[0])
  const acceptedRow = pageB.getByTestId(`connection-row-${userIds[0]}`)
  await acceptedRow.getByRole('button').first().click()
  const closeAcceptedProfile = pageB.getByRole('button', { name: 'Close profile' })
  await closeAcceptedProfile.waitFor({ timeout: 15_000 })
  await pageB.getByTestId(`connection-action-remove-${userIds[0]}`).waitFor({ timeout: 15_000 })
  await waitForDialogFocus(pageB, closeAcceptedProfile, 'Accepted profile entry')
  await pageB.keyboard.press('Escape')
  await closeAcceptedProfile.waitFor({ state: 'hidden', timeout: 15_000 })
  hubB = pageB.getByTestId('connections-hub')
  must(await hubB.evaluate(element => element.contains(document.activeElement)), 'Focus was not restored to Connections after closing the profile.')

  await acceptedRow.getByRole('button', { name: /^Message /iu }).click()
  await pageB.waitForFunction(conversationId => new URL(window.location.href).searchParams.get('conversation') === conversationId, dmBefore.conversations[0].id, { timeout: 20_000 })
  await pageB.getByTestId('dm-message-scroll').waitFor({ timeout: 20_000 })
  await pageB.goBack({ waitUntil: 'domcontentloaded' })
  hubB = pageB.getByTestId('connections-hub')
  await hubB.waitFor({ timeout: 20_000 })
  await pageB.getByTestId('connections-tab-accepted').click()
  await waitForHubRow(pageB, userIds[0])

  await pageB.getByTestId(`connection-action-remove-${userIds[0]}`).click()
  await pageB.getByRole('group', { name: /Remove .* from your Connections/iu }).getByRole('button', { name: 'Confirm' }).click()
  await pageB.getByTestId(`connection-row-${userIds[0]}`).waitFor({ state: 'hidden', timeout: 20_000 })

  const dmAfter = await readDmHistory()
  must(JSON.stringify(dmAfter) === JSON.stringify(dmBefore), 'Connection lifecycle or Message routing changed immutable DM conversation/history data.')

  const expectedSupabaseHost = new URL(supabaseUrl).hostname
  for (const diagnostics of browserDiagnostics) {
    must(diagnostics.supabaseHosts.size > 0, `${diagnostics.profile} did not make an observable Supabase request.`)
    must([...diagnostics.supabaseHosts].every(host => host === expectedSupabaseHost), `${diagnostics.profile} contacted an unexpected Supabase host.`)
    must(diagnostics.consoleErrors.length === 0, `${diagnostics.profile} console errors: ${JSON.stringify(diagnostics.consoleErrors)}`)
    must(diagnostics.pageErrors.length === 0, `${diagnostics.profile} page errors: ${JSON.stringify(diagnostics.pageErrors)}`)
    must(diagnostics.requestFailures.length === 0, `${diagnostics.profile} request failures: ${JSON.stringify(diagnostics.requestFailures)}`)
    must(diagnostics.errorResponses.length === 0, `${diagnostics.profile} error responses: ${JSON.stringify(diagnostics.errorResponses)}`)
  }

  await pageA.screenshot({ path: path.join(artifactDir, 'pixel-chromium-connected-profile.png'), fullPage: true })
  await pageB.screenshot({ path: path.join(artifactDir, 'iphone-webkit-connections-hub.png'), fullPage: true })
  results.push({
    passed: true,
    actions: ['request', 'cancel', 'request', 'decline', 'request', 'accept', 'remove'],
    routes: { exactHub: true, browserBack: true, escape: true, messageConversationId: dmBefore.conversations[0].id },
    modalFocus: { hub: true, publicProfile: true, restoredToHub: true },
    canonicalFocusRefresh: true,
    realtime: { pendingBadge: true, requestBanner: true, acceptedBanner: true },
    entryPoints: { list: true, profile: true, message: true },
    geometry: { pixelChromium: pixelGeometry, iphoneWebkit: iphoneGeometry },
    dmHistoryUnchanged: true,
  })
} catch (error) {
  results.push({ passed: false, error: messageOf(error) })
  for (const item of browsers) {
    await item.page.screenshot({ path: path.join(artifactDir, `${item.diagnostics.profile}-failure.png`), fullPage: true }).catch(() => undefined)
  }
} finally {
  try {
    const currentPair = await admin
      .from('user_connections')
      .select('id')
      .eq('member_low_id', memberLowId)
      .eq('member_high_id', memberHighId)
    if (currentPair.error) throw currentPair.error
    for (const row of currentPair.data || []) pairIds.add(row.id)
    await resetPairWithBlock()
  } catch (error) {
    cleanupErrors.push(`Pair cleanup: ${messageOf(error)}`)
  }

  try {
    if (pairIds.size > 0) {
      const eventRows = await admin
        .from('notification_events')
        .select('id,user_id,type,entity_id,payload')
        .in('entity_id', [...pairIds])
        .in('user_id', userIds)
        .in('type', connectionEventTypes)
      if (eventRows.error) throw eventRows.error
      const ambiguous = (eventRows.data || []).filter(row => {
        const actorId = row.payload?.actor?.id || row.payload?.actor?.user_id
        return !userIds.includes(row.user_id) || !userIds.includes(actorId) || actorId === row.user_id
      })
      must(ambiguous.length === 0, 'Ambiguous cleanup: a test pair event has an unexpected actor or recipient.')
      const eventIds = (eventRows.data || []).map(row => row.id)
      if (eventIds.length > 0) {
        const deleted = await admin.from('notification_events').delete().in('id', eventIds).select('id')
        if (deleted.error) throw deleted.error
        must(deleted.data?.length === eventIds.length, 'Not every exact test notification event was deleted.')
      }
      const remainingEvents = await admin
        .from('notification_events')
        .select('id')
        .in('entity_id', [...pairIds])
        .in('user_id', userIds)
        .in('type', connectionEventTypes)
      if (remainingEvents.error) throw remainingEvents.error
      must(remainingEvents.data?.length === 0, 'Test connection notification events remain after cleanup.')
    }
  } catch (error) {
    cleanupErrors.push(`Event cleanup: ${messageOf(error)}`)
  }

  try {
    for (const userId of userIds) {
      const original = originalPreferenceByUser.get(userId)
      if (original) {
        const restored = await admin
          .from('notification_preferences')
          .update({ connection_notifications_enabled: original.connection_notifications_enabled })
          .eq('user_id', userId)
          .select('user_id,connection_notifications_enabled')
        if (restored.error) throw restored.error
        must(restored.data?.length === 1 && restored.data[0].connection_notifications_enabled === original.connection_notifications_enabled, `Preference restore was not confirmed for ${userId}.`)
      } else if (insertedPreferenceUsers.includes(userId)) {
        const current = await admin.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle()
        if (current.error) throw current.error
        const enabled = enabledPreferenceByUser.get(userId)
        const withoutUpdatedAt = row => Object.fromEntries(Object.entries(row || {}).filter(([key]) => key !== 'updated_at'))
        must(
          JSON.stringify(withoutUpdatedAt(current.data)) === JSON.stringify(withoutUpdatedAt(enabled)),
          `Ambiguous cleanup: verifier-created preferences changed for ${userId}.`,
        )
        const deleted = await admin.from('notification_preferences').delete().eq('user_id', userId).select('user_id')
        if (deleted.error) throw deleted.error
        must(deleted.data?.length === 1, `Verifier-created preferences were not deleted for ${userId}.`)
      }
    }
  } catch (error) {
    cleanupErrors.push(`Preference cleanup: ${messageOf(error)}`)
  }

  try {
    for (const userId of changedDiscoveryUserIds) {
      const restored = await admin
        .from('users')
        .update({ dm_discoverable: false })
        .eq('id', userId)
        .eq('dm_discoverable', true)
        .select('id,dm_discoverable')
      if (restored.error) throw restored.error
      must(restored.data?.length === 1 && restored.data[0].dm_discoverable === false, `Discovery preference restore was not confirmed for ${userId}.`)
    }
  } catch (error) {
    cleanupErrors.push(`Discovery cleanup: ${messageOf(error)}`)
  }

  try {
    const [remainingPair, remainingBlocks, dmAfterCleanup] = await Promise.all([
      admin.from('user_connections').select('id').eq('member_low_id', memberLowId).eq('member_high_id', memberHighId),
      readPairBlocks(),
      readDmHistory(),
    ])
    if (remainingPair.error) throw remainingPair.error
    must(remainingPair.data?.length === 0, 'A test Connection pair remains.')
    must(remainingBlocks.length === 0, 'A verifier-owned personal block remains.')
    must(JSON.stringify(dmAfterCleanup) === JSON.stringify(dmBefore), 'DM data/history differs after cleanup.')
  } catch (error) {
    cleanupErrors.push(`Residue proof: ${messageOf(error)}`)
  }

  for (const item of browsers) {
    await item.context.close().catch(() => undefined)
    await item.browser.close().catch(() => undefined)
  }
  for (const client of clients) await client.auth.signOut()
}

const serializableDiagnostics = browserDiagnostics.map(item => ({
  ...item,
  supabaseHosts: [...item.supabaseHosts],
}))
const summary = {
  generatedAt: new Date().toISOString(),
  status: results.every(result => result.passed) && cleanupErrors.length === 0 ? 'passed' : 'failed',
  passed: results.every(result => result.passed) && cleanupErrors.length === 0,
  baseUrl,
  supabaseProjectRef: projectRef,
  controlledUserIds: userIds,
  testPairIds: [...pairIds],
  results,
  browserDiagnostics: serializableDiagnostics,
  cleanup: {
    strategy: 'authenticated block then unblock hard-delete; exact service-role notification IDs; notification and discovery preference restoration',
    errors: cleanupErrors,
  },
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
if (!summary.passed) {
  console.error(JSON.stringify(summary, null, 2))
  process.exitCode = 1
} else {
  console.log(`Connections browser proof passed: ${path.join(artifactDir, 'summary.json')}`)
}

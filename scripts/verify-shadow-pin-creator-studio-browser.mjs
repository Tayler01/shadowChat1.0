import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, webkit } from 'playwright'

const repoRoot = process.cwd()
const requestedBaseUrl = process.env.PLAYWRIGHT_BASE_URL
if (!requestedBaseUrl) {
  throw new Error('PLAYWRIGHT_BASE_URL must be an exact immutable Netlify deploy URL.')
}
const base = new URL(requestedBaseUrl)
const deployMatch = base.hostname.match(/^([a-f0-9]{20,})--shadowchat-2-0-wave-one\.netlify\.app$/i)
if (base.protocol !== 'https:' || !deployMatch || base.pathname !== '/' || base.search || base.hash) {
  throw new Error(`Refusing mutable or unexpected verification origin: ${requestedBaseUrl}`)
}
const baseUrl = base.origin
const deployId = deployMatch[1]
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'wave2-candidate3-creator-studio')
const imagePath = path.join(repoRoot, 'public', 'themes', 'obsidian-gold', 'preview.webp')
const markerPrefix = 'CREATOR-QA-'
const marker = `${markerPrefix}${Date.now()}`
const runStartedAt = new Date(Date.now() - 5_000).toISOString()

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
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
if (!supabaseUrl || !supabaseAnonKey || credentials.some(account => !account.email || !account.password)) {
  throw new Error('Missing Supabase or two-account Playwright credentials.')
}
const expectedSupabaseHost = new URL(supabaseUrl).hostname

const resolveServiceRoleKey = () => {
  const configured = env.SUPABASE_SERVICE_ROLE_KEY || env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY
  if (configured) return configured
  const projectRef = supabaseUrl.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1]
  if (!projectRef) throw new Error('Unable to resolve the linked Supabase project reference for cleanup.')
  const raw = execFileSync('supabase', ['projects', 'api-keys', '--project-ref', projectRef, '-o', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const parsed = JSON.parse(raw)
  const keys = Array.isArray(parsed) ? parsed : parsed?.api_keys || []
  const serviceRole = keys.find(key => key.name === 'service_role' || key.type === 'service_role')
  if (!serviceRole?.api_key) throw new Error('Supabase service-role cleanup access is unavailable.')
  return serviceRole.api_key
}

const admin = createClient(supabaseUrl, resolveServiceRoleKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
})
const clients = credentials.map(() => createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}))

const userIds = []
for (let index = 0; index < clients.length; index += 1) {
  const { data, error } = await clients[index].auth.signInWithPassword(credentials[index])
  if (error || !data.user) throw error || new Error(`Unable to sign in QA account ${index + 1}.`)
  userIds.push(data.user.id)
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const unique = values => [...new Set(values.filter(Boolean))]
const firstRow = value => Array.isArray(value) ? value[0] : value
const messageOf = error => error instanceof Error ? error.message : String(error)

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}

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

const listStorageObjects = async (bucket, prefix) => {
  const found = []
  const visit = async currentPrefix => {
    let offset = 0
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(currentPrefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      assertNoError(error, `List ${bucket}/${currentPrefix}`)
      const rows = data || []
      for (const row of rows) {
        const objectPath = currentPrefix ? `${currentPrefix}/${row.name}` : row.name
        if (row.id) found.push(objectPath)
        else await visit(objectPath)
      }
      if (rows.length < 100) break
      offset += rows.length
    }
  }
  await visit(prefix)
  return found
}

const removeStorageObjects = async (bucket, paths) => {
  const objectPaths = unique(paths)
  for (let index = 0; index < objectPaths.length; index += 100) {
    const { error } = await admin.storage.from(bucket).remove(objectPaths.slice(index, index + 100))
    assertNoError(error, `Remove scoped ${bucket} objects`)
  }
  return objectPaths.length
}

const findArtifacts = async ({ cleanupMarker = null } = {}) => {
  let draftsQuery = admin.from('shadow_pin_creator_drafts').select('*').in('creator_id', userIds)
  let pinsQuery = admin.from('shadow_pin_images').select('*').in('creator_id', userIds)
  if (cleanupMarker) {
    draftsQuery = draftsQuery.eq('title', cleanupMarker)
    pinsQuery = pinsQuery.eq('title', cleanupMarker)
  } else {
    draftsQuery = draftsQuery.gte('created_at', runStartedAt)
    pinsQuery = pinsQuery.gte('created_at', runStartedAt)
  }
  const [draftsResult, pinsResult] = await Promise.all([draftsQuery, pinsQuery])
  assertNoError(draftsResult.error, 'Find Creator Studio drafts for cleanup')
  assertNoError(pinsResult.error, 'Find Creator Studio Pins for cleanup')
  const drafts = draftsResult.data || []
  const draftIds = drafts.map(row => row.id)

  let linkedPins = []
  if (draftIds.length) {
    const result = await admin.from('shadow_pin_images').select('*').in('creator_draft_id', draftIds)
    assertNoError(result.error, 'Find canonical Pins linked to Creator Studio drafts')
    linkedPins = result.data || []
  }
  const pins = [...new Map([...(pinsResult.data || []), ...linkedPins].map(row => [row.id, row])).values()]
  let assets = []
  if (draftIds.length) {
    const result = await admin.from('shadow_pin_draft_assets').select('*').in('draft_id', draftIds)
    assertNoError(result.error, 'Find Creator Studio assets for cleanup')
    assets = result.data || []
  }
  return { drafts, assets, pins }
}

const cleanupArtifacts = async ({ cleanupMarker = null } = {}) => {
  const artifacts = await findArtifacts({ cleanupMarker })
  const draftIds = artifacts.drafts.map(row => row.id)
  const pinIds = artifacts.pins.map(row => row.id)
  const assetIds = artifacts.assets.map(row => row.id)
  const privatePaths = unique(artifacts.assets.flatMap(row => [
    row.original_path,
    row.thumbnail_path,
    row.medium_path,
  ]))
  const publicPaths = unique([
    ...artifacts.assets.flatMap(row => [
      row.final_image_path,
      row.final_thumbnail_path,
      row.final_medium_path,
    ]),
    ...artifacts.pins.flatMap(row => [row.image_path, row.thumbnail_path, row.medium_path]),
  ])

  for (const draft of artifacts.drafts) {
    privatePaths.push(...await listStorageObjects('shadow-pin-drafts', `${draft.creator_id}/${draft.id}`))
    publicPaths.push(...await listStorageObjects('shadow-pin', `${draft.creator_id}/studio/${draft.id}`))
  }

  let notificationsRemoved = 0
  let activityEventsRemoved = 0
  let analyticsEventsRemoved = 0
  let analyticsSessionsRemoved = 0
  if (pinIds.length) {
    const notificationResult = await admin.from('notification_events')
      .delete({ count: 'exact' })
      .eq('type', 'shadow_pin_post')
      .in('entity_id', pinIds)
    assertNoError(notificationResult.error, 'Delete test ShadowPin notification events')
    notificationsRemoved = notificationResult.count || 0

    const activityResult = await admin.from('activity_events')
      .delete({ count: 'exact' })
      .in('shadow_pin_image_id', pinIds)
    assertNoError(activityResult.error, 'Delete mirrored test ShadowPin activity events')
    activityEventsRemoved = activityResult.count || 0

    const analyticsResult = await admin.from('shadow_pin_activity_events')
      .delete({ count: 'exact' })
      .in('image_id', pinIds)
    assertNoError(analyticsResult.error, 'Delete test ShadowPin analytics events')
    analyticsEventsRemoved = analyticsResult.count || 0

    const pinDelete = await admin.from('shadow_pin_images').delete({ count: 'exact' }).in('id', pinIds)
    assertNoError(pinDelete.error, 'Delete canonical test Pins')
    must(pinDelete.count === pinIds.length, `Canonical Pin cleanup count mismatch: ${pinDelete.count} of ${pinIds.length}`)
  }

  if (!cleanupMarker) {
    const analyticsResult = await admin.from('shadow_pin_activity_events')
      .delete({ count: 'exact' })
      .in('user_id', userIds)
      .gte('created_at', runStartedAt)
    assertNoError(analyticsResult.error, 'Delete run-scoped ShadowPin analytics events')
    analyticsEventsRemoved += analyticsResult.count || 0

    const sessionResult = await admin.from('shadow_pin_activity_sessions')
      .delete({ count: 'exact' })
      .in('user_id', userIds)
      .gte('created_at', runStartedAt)
    assertNoError(sessionResult.error, 'Delete run-scoped ShadowPin analytics sessions')
    analyticsSessionsRemoved = sessionResult.count || 0
  }

  if (draftIds.length) {
    const draftDelete = await admin.from('shadow_pin_creator_drafts').delete({ count: 'exact' }).in('id', draftIds)
    assertNoError(draftDelete.error, 'Delete test Creator Studio drafts')
    must(draftDelete.count === draftIds.length, `Creator draft cleanup count mismatch: ${draftDelete.count} of ${draftIds.length}`)
  }

  const privateObjectsRemoved = await removeStorageObjects('shadow-pin-drafts', privatePaths)
  const publicObjectsRemoved = await removeStorageObjects('shadow-pin', publicPaths)

  const verification = {}
  if (pinIds.length) {
    const [pinsLeft, notificationsLeft, activityLeft] = await Promise.all([
      admin.from('shadow_pin_images').select('id', { count: 'exact', head: true }).in('id', pinIds),
      admin.from('notification_events').select('id', { count: 'exact', head: true }).in('entity_id', pinIds),
      admin.from('activity_events').select('id', { count: 'exact', head: true }).in('shadow_pin_image_id', pinIds),
    ])
    assertNoError(pinsLeft.error, 'Verify canonical Pin cleanup')
    assertNoError(notificationsLeft.error, 'Verify notification cleanup')
    assertNoError(activityLeft.error, 'Verify activity cleanup')
    verification.pins = pinsLeft.count || 0
    verification.notifications = notificationsLeft.count || 0
    verification.activityEvents = activityLeft.count || 0
  }
  if (draftIds.length) {
    const [draftsLeft, assetsLeft] = await Promise.all([
      admin.from('shadow_pin_creator_drafts').select('id', { count: 'exact', head: true }).in('id', draftIds),
      admin.from('shadow_pin_draft_assets').select('id', { count: 'exact', head: true }).in('id', assetIds.length ? assetIds : ['00000000-0000-0000-0000-000000000000']),
    ])
    assertNoError(draftsLeft.error, 'Verify Creator draft cleanup')
    assertNoError(assetsLeft.error, 'Verify Creator asset cleanup')
    verification.drafts = draftsLeft.count || 0
    verification.assets = assetsLeft.count || 0
    for (const draft of artifacts.drafts) {
      const remainingPrivate = await listStorageObjects('shadow-pin-drafts', `${draft.creator_id}/${draft.id}`)
      const remainingPublic = await listStorageObjects('shadow-pin', `${draft.creator_id}/studio/${draft.id}`)
      must(remainingPrivate.length === 0, `Private Storage cleanup left ${remainingPrivate.length} object(s).`)
      must(remainingPublic.length === 0, `Public Storage cleanup left ${remainingPublic.length} object(s).`)
    }
  }
  if (!cleanupMarker) {
    const [analyticsEventsLeft, analyticsSessionsLeft] = await Promise.all([
      admin.from('shadow_pin_activity_events')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds)
        .gte('created_at', runStartedAt),
      admin.from('shadow_pin_activity_sessions')
        .select('id', { count: 'exact', head: true })
        .in('user_id', userIds)
        .gte('created_at', runStartedAt),
    ])
    assertNoError(analyticsEventsLeft.error, 'Verify run-scoped ShadowPin analytics event cleanup')
    assertNoError(analyticsSessionsLeft.error, 'Verify run-scoped ShadowPin analytics session cleanup')
    verification.analyticsEvents = analyticsEventsLeft.count || 0
    verification.analyticsSessions = analyticsSessionsLeft.count || 0
  }
  must(Object.values(verification).every(value => value === 0), `Cleanup verification failed: ${JSON.stringify(verification)}`)
  return {
    draftsRemoved: draftIds.length,
    assetsRemoved: assetIds.length,
    pinsRemoved: pinIds.length,
    notificationsRemoved,
    activityEventsRemoved,
    analyticsEventsRemoved,
    analyticsSessionsRemoved,
    privateObjectsRemoved,
    publicObjectsRemoved,
    remaining: verification,
  }
}

if (process.argv.includes('--cleanup-only')) {
  const cleanupMarkerArgument = process.argv.find(argument => argument.startsWith('--cleanup-marker='))
  const exactCleanupMarker = cleanupMarkerArgument?.slice('--cleanup-marker='.length)
  must(exactCleanupMarker?.startsWith(markerPrefix), 'Cleanup-only requires an exact --cleanup-marker=CREATOR-QA-... value.')
  const markerCleanup = await cleanupArtifacts({ cleanupMarker: exactCleanupMarker })
  console.log(JSON.stringify({ cleanupMarker: exactCleanupMarker, markerCleanup }, null, 2))
  process.exit(0)
}

const activeDrafts = await admin.from('shadow_pin_creator_drafts')
  .select('id,creator_id,state,title')
  .in('creator_id', userIds)
  .not('state', 'in', '(published,abandoned)')
assertNoError(activeDrafts.error, 'Check controlled accounts for existing active drafts')
if ((activeDrafts.data || []).length) {
  throw new Error('A controlled QA account already has an unfinished Creator Studio draft. Refusing to open Studio over unrelated work.')
}

const [preferenceResult, forwardBlockResult, reverseBlockResult] = await Promise.all([
  admin.from('notification_preferences').select('shadow_pin_new_post_enabled').eq('user_id', userIds[1]).maybeSingle(),
  admin.from('user_blocks').select('blocker_id').eq('blocker_id', userIds[0]).eq('blocked_id', userIds[1]).maybeSingle(),
  admin.from('user_blocks').select('blocker_id').eq('blocker_id', userIds[1]).eq('blocked_id', userIds[0]).maybeSingle(),
])
assertNoError(preferenceResult.error, 'Check Account B ShadowPin notification preference')
assertNoError(forwardBlockResult.error, 'Check Account A/B block boundary')
assertNoError(reverseBlockResult.error, 'Check Account B/A block boundary')
const accountBNotificationEligible = preferenceResult.data?.shadow_pin_new_post_enabled !== false
  && !forwardBlockResult.data
  && !reverseBlockResult.data

const profiles = {
  pixel: {
    name: 'pixel-chromium',
    engine: chromium,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36',
  },
  iphone: {
    name: 'iphone-webkit',
    engine: webkit,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1',
  },
}

const browserHandles = []
const pageEvidence = []
const unexpectedSupabaseHosts = new Set()
const networkCapturePromises = []
let pixelPage = null
let iphonePage = null
let draftId = null
let assetId = null
let pinId = null
let failure = null
let cleanup = null
let failureDiagnostics = null
const checks = []

await mkdir(artifactDir, { recursive: true })

const recordPageErrors = (page, profileName) => {
  const evidence = { profile: profileName, consoleErrors: [], browserDiagnostics: [], pageErrors: [], criticalResponses: [] }
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (
      text.includes('Content Security Policy') &&
      text.includes('report-only')
    ) evidence.browserDiagnostics.push(text)
    else evidence.consoleErrors.push(text)
  })
  page.on('pageerror', error => evidence.pageErrors.push(error.message))
  page.on('response', response => {
    const url = new URL(response.url())
    const critical = response.status() >= 400 && response.status() !== 406 && (
      url.pathname.includes('/api/shadow-pin/media') ||
      url.pathname.includes('/functions/v1/shadow-pin-video') ||
      (url.hostname.endsWith('.supabase.co') && (
        url.pathname.includes('/rest/v1/rpc/') ||
        url.pathname.includes('/storage/v1/object')
      ))
    )
    if (!critical) return
    const capture = response.text()
      .catch(() => '')
      .then(body => evidence.criticalResponses.push({
        status: response.status(),
        path: url.pathname,
        body: body.slice(0, 800),
      }))
    networkCapturePromises.push(capture)
  })
  pageEvidence.push(evidence)
  return evidence
}

const dismissTransientUi = async page => {
  for (const label of [/^Skip for Now$/i, /^(Done|Got It|Later|Not now)$/i]) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.isVisible().catch(() => false)) {
      await button.click({ force: true })
      await page.waitForTimeout(200)
    }
  }
}

const signInToPins = async (page, credential) => {
  await page.goto(`${baseUrl}/?view=pins`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => {
    const text = document.body?.innerText || ''
    return text.includes('Sign in') || text.includes('ShadowPin')
  }, undefined, { timeout: 30_000 })
  const signIn = page.locator('form').getByRole('button', { name: /^Sign in$/i })
  if (await signIn.isVisible().catch(() => false)) {
    await page.locator('input[name="email"]').fill(credential.email)
    await page.locator('input[name="password"]').fill(credential.password)
    await signIn.click()
  }
  await page.getByRole('button', { name: 'Create Pin', exact: true }).waitFor({ timeout: 30_000 })
  await dismissTransientUi(page)
  must(new URL(page.url()).origin === baseUrl, `Verification navigated away from the immutable deploy: ${page.url()}`)
}

const openPage = async (profile, credential) => {
  const browser = await profile.engine.launch({ headless: true })
  browserHandles.push(browser)
  const context = await browser.newContext({
    viewport: profile.viewport,
    userAgent: profile.userAgent,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
  })
  const page = await context.newPage()
  await page.route('**/*', async route => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.hostname.endsWith('.supabase.co') && requestUrl.hostname !== expectedSupabaseHost) {
      unexpectedSupabaseHosts.add(requestUrl.hostname)
      await route.abort('blockedbyclient')
      return
    }
    await route.continue()
  })
  recordPageErrors(page, profile.name)
  await signInToPins(page, credential)
  return page
}

const assertStudioGeometry = async (page, profileName) => {
  const studio = page.getByTestId('shadow-pin-creator-studio')
  await studio.waitFor({ timeout: 20_000 })
  const geometry = await studio.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const dialog = element.querySelector('[role="dialog"]')?.getBoundingClientRect()
    const header = element.querySelector('header')?.getBoundingClientRect()
    const main = element.querySelector('main')
    const mainRect = main?.getBoundingClientRect()
    const footer = element.querySelector('footer')?.getBoundingClientRect()
    return {
      studio: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      dialog: dialog ? { left: dialog.left, right: dialog.right, top: dialog.top, bottom: dialog.bottom } : null,
      header: header ? { left: header.left, right: header.right, top: header.top, bottom: header.bottom } : null,
      main: mainRect ? { left: mainRect.left, right: mainRect.right, top: mainRect.top, bottom: mainRect.bottom } : null,
      footer: footer ? { left: footer.left, right: footer.right, top: footer.top, bottom: footer.bottom } : null,
      mainScrollWidth: main?.scrollWidth ?? null,
      mainClientWidth: main?.clientWidth ?? null,
      pageScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    }
  })
  const rects = [geometry.studio, geometry.dialog, geometry.header, geometry.main, geometry.footer].filter(Boolean)
  must(rects.every(rect => rect.left >= -1 && rect.right <= geometry.viewportWidth + 1), `${profileName} Studio has horizontal overflow: ${JSON.stringify(geometry)}`)
  must(geometry.studio.top >= -1 && geometry.studio.bottom <= geometry.viewportHeight + 1, `${profileName} Studio misses the visual viewport: ${JSON.stringify(geometry)}`)
  must(geometry.footer?.bottom <= geometry.viewportHeight + 1, `${profileName} Studio footer is below the visual viewport: ${JSON.stringify(geometry)}`)
  must(geometry.pageScrollWidth <= geometry.viewportWidth + 1, `${profileName} document horizontally overflows in Studio: ${JSON.stringify(geometry)}`)
  must((geometry.mainScrollWidth || 0) <= (geometry.mainClientWidth || 0) + 1, `${profileName} Studio main horizontally overflows: ${JSON.stringify(geometry)}`)
  return geometry
}

const waitForStudioRecovery = async page => {
  const continueButton = page.getByTestId('shadow-pin-creator-studio').getByRole('button', { name: /^Continue/ })
  await poll('Creator Studio initial recovery', async () => (
    await continueButton.isVisible().catch(() => false) &&
    await continueButton.isEnabled().catch(() => false)
  ), 30_000, 100)
}

const assertTheaterGeometry = async (page, profileName) => {
  const theater = page.getByTestId('shadow-pin-theater')
  await theater.waitFor({ timeout: 30_000 })
  const geometry = await theater.evaluate(element => {
    const rect = element.getBoundingClientRect()
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      pageScrollWidth: document.documentElement.scrollWidth,
    }
  })
  must(geometry.left >= -1 && geometry.right <= geometry.viewportWidth + 1 && geometry.top >= -1 && geometry.bottom <= geometry.viewportHeight + 1, `${profileName} Theater misses the viewport: ${JSON.stringify(geometry)}`)
  must(geometry.pageScrollWidth <= geometry.viewportWidth + 1, `${profileName} Theater horizontally overflows: ${JSON.stringify(geometry)}`)
  return geometry
}

const findDraftByMarker = async () => {
  const { data, error } = await admin.from('shadow_pin_creator_drafts')
    .select('*')
    .eq('creator_id', userIds[0])
    .eq('title', marker)
    .maybeSingle()
  assertNoError(error, 'Read the marker Creator Studio draft')
  return data
}

try {
  iphonePage = await openPage(profiles.iphone, credentials[1])
  await iphonePage.getByRole('button', { name: 'Create Pin', exact: true }).click()
  const iphoneStudioGeometry = await assertStudioGeometry(iphonePage, profiles.iphone.name)
  await waitForStudioRecovery(iphonePage)
  await iphonePage.screenshot({ path: path.join(artifactDir, 'iphone-webkit-studio.png') })
  await iphonePage.getByRole('button', { name: 'Save draft and exit Creator Studio' }).click()
  await iphonePage.getByTestId('shadow-pin-creator-studio').waitFor({ state: 'hidden', timeout: 15_000 })
  must(!new URL(iphonePage.url()).searchParams.has('studio'), 'iPhone Studio close left the Studio route active.')
  checks.push({ name: 'iphone-studio-geometry-and-close', passed: true, geometry: iphoneStudioGeometry })

  // Let any pre-existing unread notification toasts finish before the marker
  // Pin is published, so the realtime assertion is unambiguous.
  await iphonePage.waitForTimeout(5_500)

  pixelPage = await openPage(profiles.pixel, credentials[0])
  await pixelPage.getByRole('button', { name: 'Create Pin', exact: true }).click()
  const pixelStudioGeometry = await assertStudioGeometry(pixelPage, profiles.pixel.name)
  await waitForStudioRecovery(pixelPage)
  await pixelPage.screenshot({ path: path.join(artifactDir, 'pixel-chromium-studio-media.png') })
  checks.push({ name: 'pixel-studio-geometry', passed: true, geometry: pixelStudioGeometry })

  const studio = pixelPage.getByTestId('shadow-pin-creator-studio')
  await studio.locator('input[type="file"]').setInputFiles(imagePath)
  await studio.getByRole('img', { name: 'Draft Pin preview' }).waitFor({ timeout: 10_000 })
  await studio.getByRole('button', { name: /^Continue/ }).click()
  await pixelPage.getByTestId('creator-step-details').waitFor({ timeout: 10_000 })

  const details = pixelPage.getByTestId('creator-step-details')
  await details.getByPlaceholder('Give this Pin a clear title').fill(marker)
  const categorySelect = details.locator('select')
  await categorySelect.waitFor({ timeout: 15_000 })
  await pixelPage.waitForFunction(select => select.options.length > 1, await categorySelect.elementHandle(), { timeout: 15_000 })
  const selectedCategory = await categorySelect.selectOption({ index: 1 })
  must(Boolean(selectedCategory[0]), 'Creator Studio had no visible category available for publication.')
  await details.getByPlaceholder('Add context, credits, or the story behind it').fill('Temporary authenticated Wave 2 verification Pin. Removed automatically after proof.')
  await details.getByPlaceholder('folklore, travel, behind-the-scenes').fill('wave2, qa, creator-studio')

  await studio.getByRole('button', { name: /^Continue/ }).click()
  await pixelPage.getByTestId('creator-step-preview').waitFor({ timeout: 60_000 })
  await pixelPage.getByRole('heading', { name: marker, exact: true }).waitFor({ timeout: 15_000 })
  const draft = await poll('Creator Studio draft persistence', findDraftByMarker, 20_000)
  draftId = draft.id
  const asset = await poll('Creator Studio staged image persistence', async () => {
    const { data, error } = await admin.from('shadow_pin_draft_assets')
      .select('*')
      .eq('draft_id', draftId)
      .eq('state', 'ready')
      .maybeSingle()
    assertNoError(error, 'Read staged Creator Studio image')
    return data
  }, 20_000)
  assetId = asset.id
  must(asset.storage_bucket === 'shadow-pin-drafts', `Draft image used unexpected bucket ${asset.storage_bucket}.`)

  const [crossDraft, crossAsset, crossList, crossSigned] = await Promise.all([
    clients[1].from('shadow_pin_creator_drafts').select('id').eq('id', draftId),
    clients[1].from('shadow_pin_draft_assets').select('id').eq('id', assetId),
    clients[1].rpc('list_my_shadow_pin_creator_drafts', { target_limit: 50 }),
    clients[1].storage.from('shadow-pin-drafts').createSignedUrl(asset.medium_path || asset.thumbnail_path || asset.original_path, 60),
  ])
  assertNoError(crossDraft.error, 'Account B cross-owner draft read')
  assertNoError(crossAsset.error, 'Account B cross-owner asset read')
  assertNoError(crossList.error, 'Account B own draft list')
  must((crossDraft.data || []).length === 0, 'Account B could read Account A Creator Studio draft.')
  must((crossAsset.data || []).length === 0, 'Account B could read Account A Creator Studio asset.')
  must(!(crossList.data || []).some(bundle => (bundle.draft?.id || bundle.id) === draftId), 'Account A draft leaked through Account B draft RPC.')
  must(Boolean(crossSigned.error) && !crossSigned.data?.signedUrl, 'Account B could mint a private preview URL for Account A asset.')
  checks.push({ name: 'owner-private-draft-and-asset', passed: true })

  await pixelPage.getByRole('button', { name: 'Save draft and exit Creator Studio' }).click()
  await pixelPage.getByTestId('shadow-pin-creator-studio').waitFor({ state: 'hidden', timeout: 20_000 })
  const savedOrigin = new URL(pixelPage.url())
  must(savedOrigin.searchParams.get('view') === 'pins' && !savedOrigin.searchParams.has('studio') && !savedOrigin.searchParams.has('pin'), `Save and exit did not restore ShadowPin origin: ${savedOrigin.href}`)

  await pixelPage.reload({ waitUntil: 'domcontentloaded' })
  await pixelPage.getByRole('button', { name: 'Create Pin', exact: true }).waitFor({ timeout: 30_000 })
  await pixelPage.getByRole('button', { name: 'Create Pin', exact: true }).click()
  await pixelPage.getByTestId('creator-step-preview').waitFor({ timeout: 30_000 })
  await pixelPage.getByText('Recovered your latest draft.', { exact: false }).waitFor({ timeout: 20_000 })
  const recoveredImage = pixelPage.getByTestId('creator-step-preview').getByRole('img', { name: marker, exact: true })
  await recoveredImage.waitFor({ timeout: 20_000 })
  const recoveredImageSrc = await recoveredImage.getAttribute('src')
  must(Boolean(recoveredImageSrc), 'Recovered Creator Studio preview has no image URL.')
  must(recoveredImageSrc.includes('/storage/v1/object/sign/shadow-pin-drafts/'), 'Recovered image did not use an owner-signed private preview URL.')
  must(!recoveredImageSrc.includes('/object/public/'), 'Recovered private draft used a public Storage URL.')
  await pixelPage.screenshot({ path: path.join(artifactDir, 'pixel-chromium-studio-recovered-preview.png') })
  checks.push({ name: 'save-reload-private-preview-recovery', passed: true, signedPrivatePreview: true })

  await pixelPage.getByTestId('shadow-pin-creator-studio').getByRole('button', { name: /^Continue/ }).click()
  await pixelPage.getByTestId('creator-step-publish').waitFor({ timeout: 15_000 })
  await pixelPage.getByText('I am ready to publish this Pin', { exact: true }).click()
  await pixelPage.getByRole('button', { name: 'Publish Pin', exact: true }).click()
  await pixelPage.getByTestId('shadow-pin-theater').waitFor({ timeout: 60_000 })
  await pixelPage.locator('#shadow-pin-theater-title').getByText(marker, { exact: true }).waitFor({ timeout: 30_000 })
  const publishedUrl = new URL(pixelPage.url())
  pinId = publishedUrl.searchParams.get('pin')
  must(Boolean(pinId) && publishedUrl.searchParams.get('view') === 'pins' && !publishedUrl.searchParams.has('studio'), `Publish did not route to the exact Pin Theater: ${publishedUrl.href}`)
  const pixelTheaterGeometry = await assertTheaterGeometry(pixelPage, profiles.pixel.name)
  await pixelPage.screenshot({ path: path.join(artifactDir, 'pixel-chromium-published-theater.png') })

  const canonical = await poll('canonical Creator Studio Pin', async () => {
    const { data, error } = await admin.from('shadow_pin_images')
      .select('*')
      .eq('id', pinId)
      .eq('creator_draft_id', draftId)
      .maybeSingle()
    assertNoError(error, 'Read the canonical Creator Studio Pin')
    return data
  }, 20_000)
  must(canonical.title === marker && canonical.processing_status === 'ready', 'Published canonical Pin did not match the ready marker Pin.')

  const publishedDraft = await poll('published Creator Studio receipt', async () => {
    const { data, error } = await admin.from('shadow_pin_creator_drafts').select('*').eq('id', draftId).maybeSingle()
    assertNoError(error, 'Read the published Creator Studio receipt')
    return data?.state === 'published' ? data : null
  }, 20_000)
  const repeat = await clients[0].rpc('finalize_shadow_pin_creator_draft', {
    target_draft_id: draftId,
    target_expected_revision: publishedDraft.revision,
    target_publish_idempotency_key: publishedDraft.publish_idempotency_key,
  })
  assertNoError(repeat.error, 'Repeat Creator Studio finalization')
  const repeatReceipt = firstRow(repeat.data)
  must(repeatReceipt?.was_already_published === true, 'Repeated finalization did not return the idempotent published receipt.')
  must((repeatReceipt?.image?.id || repeatReceipt?.image?.[0]?.id) === pinId, 'Repeated finalization returned a different Pin.')
  const canonicalCount = await admin.from('shadow_pin_images')
    .select('id', { count: 'exact', head: true })
    .eq('creator_draft_id', draftId)
  assertNoError(canonicalCount.error, 'Count canonical Pins for the published draft')
  must(canonicalCount.count === 1, `Creator Studio publish created ${canonicalCount.count} canonical Pins.`)
  checks.push({ name: 'publish-once-exact-theater', passed: true, geometry: pixelTheaterGeometry, canonicalCount: canonicalCount.count })

  const accountBPin = await clients[1].from('shadow_pin_images').select('id,title,creator_draft_id').eq('id', pinId).maybeSingle()
  assertNoError(accountBPin.error, 'Account B exact published Pin read')
  must(accountBPin.data?.id === pinId && accountBPin.data.title === marker, 'Account B could not read the exact published Pin.')

  if (accountBNotificationEligible) {
    const notification = await poll('Account B eligible new-Pin notification', async () => {
      const { data, error } = await clients[1].from('notification_events')
        .select('id,type,entity_id,payload')
        .eq('user_id', userIds[1])
        .eq('type', 'shadow_pin_post')
        .eq('entity_id', pinId)
      assertNoError(error, 'Read Account B new-Pin notification')
      return data?.length === 1 ? data[0] : null
    }, 15_000)
    must(notification.payload?.image_title === marker, 'Account B notification payload did not target the marker Pin.')
    let toast = iphonePage.locator('button[aria-label$="Open ShadowPin."]').filter({ hasText: marker }).first()
    if (!await toast.isVisible().catch(() => false)) {
      await iphonePage.bringToFront()
      await iphonePage.evaluate(() => window.dispatchEvent(new Event('focus')))
    }
    await toast.waitFor({ timeout: 8_000 })
    checks.push({ name: 'account-b-one-eligible-notification', passed: true, eventCount: 1, realtimeToast: true })
  } else {
    checks.push({ name: 'account-b-one-eligible-notification', passed: true, skipped: 'Account B preference/block state is not eligible; no state was changed.' })
  }

  await iphonePage.goto(`${baseUrl}/?view=pins&pin=${encodeURIComponent(pinId)}`, { waitUntil: 'domcontentloaded' })
  await iphonePage.getByTestId('shadow-pin-theater').waitFor({ timeout: 30_000 })
  await iphonePage.locator('#shadow-pin-theater-title').getByText(marker, { exact: true }).waitFor({ timeout: 30_000 })
  const iphoneTheaterGeometry = await assertTheaterGeometry(iphonePage, profiles.iphone.name)
  await iphonePage.screenshot({ path: path.join(artifactDir, 'iphone-webkit-exact-published-theater.png') })
  checks.push({ name: 'account-b-exact-visible-pin', passed: true, geometry: iphoneTheaterGeometry })

  await pixelPage.getByRole('button', { name: 'Close ShadowPin Theater' }).click()
  await pixelPage.getByTestId('shadow-pin-theater').waitFor({ state: 'hidden', timeout: 15_000 })
  await pixelPage.getByRole('button', { name: 'Create Pin', exact: true }).waitFor({ timeout: 15_000 })
  const returnedUrl = new URL(pixelPage.url())
  must(returnedUrl.searchParams.get('view') === 'pins' && !returnedUrl.searchParams.has('pin') && !returnedUrl.searchParams.has('studio'), `Closing published Theater did not return to the ShadowPin origin: ${returnedUrl.href}`)
  checks.push({ name: 'published-theater-return-origin', passed: true })

  for (const evidence of pageEvidence) {
    must(evidence.consoleErrors.length === 0, `${evidence.profile} console errors: ${evidence.consoleErrors.join(' | ')}`)
    must(evidence.pageErrors.length === 0, `${evidence.profile} page errors: ${evidence.pageErrors.join(' | ')}`)
    must(evidence.criticalResponses.length === 0, `${evidence.profile} Creator media API failures: ${JSON.stringify(evidence.criticalResponses)}`)
  }
  must(unexpectedSupabaseHosts.size === 0, `Deploy attempted to use unexpected Supabase host(s): ${[...unexpectedSupabaseHosts].join(', ')}`)
  must([pixelPage, iphonePage].every(page => new URL(page.url()).origin === baseUrl), 'A verification page left the immutable deploy origin.')
  checks.push({ name: 'zero-console-page-media-api-errors', passed: true })
} catch (error) {
  failure = messageOf(error)
  const pages = [
    { name: profiles.pixel.name, page: pixelPage },
    { name: profiles.iphone.name, page: iphonePage },
  ]
  const diagnostics = []
  for (const entry of pages) {
    if (!entry.page || entry.page.isClosed()) continue
    const page = entry.page
    const state = await page.evaluate(() => ({
      url: window.location.href,
      step: document.querySelector('[data-testid^="creator-step-"]')?.getAttribute('data-testid') || null,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(element => element.textContent?.trim()).filter(Boolean),
      live: [...document.querySelectorAll('[aria-live]')].map(element => element.textContent?.trim()).filter(Boolean),
    })).catch(diagnosticError => ({ diagnosticError: messageOf(diagnosticError) }))
    const screenshot = `${entry.name}-failure.png`
    await page.screenshot({ path: path.join(artifactDir, screenshot) }).catch(() => undefined)
    diagnostics.push({ profile: entry.name, screenshot, ...state })
  }
  failureDiagnostics = diagnostics
} finally {
  await Promise.allSettled(networkCapturePromises)
  for (const browser of browserHandles.reverse()) {
    await browser.close().catch(() => undefined)
  }
  await wait(500)
  try {
    cleanup = await cleanupArtifacts()
  } catch (error) {
    const cleanupFailure = messageOf(error)
    failure = failure ? `${failure} | Cleanup failure: ${cleanupFailure}` : `Cleanup failure: ${cleanupFailure}`
  }

  const summary = {
    status: failure ? 'failed' : 'passed',
    baseUrl,
    deployId,
    expectedSupabaseHost,
    unexpectedSupabaseHosts: [...unexpectedSupabaseHosts],
    marker,
    profiles: [profiles.pixel.name, profiles.iphone.name],
    accountBNotificationEligible,
    checks,
    created: { draftId, assetId, pinId },
    pageEvidence,
    cleanup,
    failureDiagnostics,
    failure,
    completedAt: new Date().toISOString(),
  }
  await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
}

if (failure) {
  console.error(`Candidate 3 browser verification failed: ${failure}`)
  console.error(`Evidence: ${path.join(artifactDir, 'summary.json')}`)
  process.exitCode = 1
} else {
  console.log(`Candidate 3 browser verification passed: ${path.join(artifactDir, 'summary.json')}`)
}

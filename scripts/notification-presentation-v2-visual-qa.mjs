import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium, devices, webkit } from 'playwright'

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter(argument => argument.startsWith('--'))
    .map(argument => {
      const [key, ...value] = argument.slice(2).split('=')
      return [key, value.join('=') || 'true']
    }),
)
const baseUrl = args['base-url'] || 'http://127.0.0.1:4174'
const storageState = args['storage-state']
const artifactDir = path.resolve(
  args['artifact-dir'] || 'output/playwright/notification-presentation-v2',
)
const storageStatePath = storageState ? path.resolve(storageState) : null

if (!storageState) {
  throw new Error('Pass an authenticated Playwright state with --storage-state=<path>')
}

const storageStateJson = JSON.parse(await readFile(storageStatePath, 'utf8'))
const authStorageEntry = storageStateJson.origins
  ?.flatMap(origin => origin.localStorage ?? [])
  .find(entry => /^sb-.+-auth-token$/.test(entry.name))
const authenticatedUserId = authStorageEntry
  ? JSON.parse(authStorageEntry.value)?.user?.id
  : null

if (typeof authenticatedUserId !== 'string' || !authenticatedUserId) {
  throw new Error('The supplied Playwright storage state has no authenticated Supabase user')
}

const profiles = [
  {
    id: 'iphone-webkit',
    browserType: webkit,
    device: devices['iPhone 13'],
    viewport: { width: 390, height: 844 },
  },
  {
    id: 'android-chromium',
    browserType: chromium,
    device: devices['Pixel 7'] ?? devices['Pixel 5'],
    viewport: { width: 412, height: 915 },
  },
]

const createNotificationPreferences = userId => ({
  user_id: userId,
  notifications_enabled: true,
  dm_enabled: true,
  mention_enabled: true,
  reply_enabled: true,
  reaction_enabled: true,
  group_enabled: true,
  hype_enabled: true,
  shadow_pin_new_post_enabled: true,
  shadow_pin_comment_enabled: true,
  shadow_pin_reply_enabled: true,
  connection_notifications_enabled: true,
  checkers_turn_enabled: true,
  shado_live_in_app_enabled: true,
  presence_in_app_enabled: true,
  presence_push_enabled: true,
  presence_notification_scope: 'connections',
  badge_dm_enabled: true,
  badge_group_enabled: true,
  badge_interactions_enabled: true,
  badge_connections_enabled: true,
  badge_shadow_pin_enabled: true,
  badge_games_enabled: true,
  notification_preview_mode: 'full',
  notification_media_enabled: true,
  notification_foreground_sounds_enabled: false,
  general_chat_muted: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_timezone: 'UTC',
  mute_until: null,
})

const installNotificationContractFixtures = async (page, fixture) => {
  // These narrowly-scoped fixtures make the visual test deterministic and non-mutating
  // while the Notification Presentation v2 migration is staged. Every unrelated request
  // still reaches the current preview/backend and remains covered by the error gate below.
  //
  // Playwright request routing cannot intercept fetches made by a service-worker-controlled
  // page. Install a minimal fetch shim before application code instead of blocking workers.
  await page.addInitScript(({
    qaFixture,
    preferences,
    userId,
  }) => {
    const qaState = {
      ...qaFixture,
      armed: false,
    }
    Object.defineProperty(window, '__shadowchatNotificationV2Qa', {
      configurable: true,
      value: qaState,
    })

    const nativeFetch = window.fetch.bind(window)
    const createJsonResponse = (body, contentRange = null) => new Response(
      JSON.stringify(body),
      {
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
          'content-type': 'application/json',
          ...(contentRange ? { 'content-range': contentRange } : {}),
        },
      },
    )
    window.fetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      const url = new URL(request.url)
      if (
        request.method === 'GET' &&
        url.pathname.endsWith('/rest/v1/notification_preferences')
      ) {
        return createJsonResponse(preferences, '0-0/1')
      }
      if (
        request.method === 'GET' &&
        url.pathname.endsWith('/rest/v1/notification_category_presentation_preferences')
      ) {
        return createJsonResponse([], '*/0')
      }
      if (
        request.method === 'GET' &&
        url.pathname.endsWith('/rest/v1/notification_events') &&
        url.searchParams.has('created_at') &&
        url.searchParams.has('presentation_expires_at')
      ) {
        if (!qaState.armed) return createJsonResponse([], '*/0')
        const createdAt = new Date()
        return createJsonResponse([{
          id: qaState.eventId,
          user_id: userId,
          type: 'shadow_pin_post',
          category: 'shadow_pin',
          entity_id: qaState.eventId,
          conversation_id: null,
          message_id: null,
          dm_message_id: null,
          actor_id: qaState.actorId,
          route: '/?view=pins',
          payload: {
            title: 'Visual QA posted a new ShadowPin',
            body: 'Coordinator routing and foreground presentation are operable.',
            actor: {
              id: qaState.actorId,
              display_name: 'Visual QA',
              avatar_url: null,
            },
          },
          sent_at: null,
          read_at: null,
          presented_at: null,
          resolved_at: null,
          created_at: createdAt.toISOString(),
          presentation_expires_at: new Date(createdAt.getTime() + 90_000).toISOString(),
        }], '0-0/1')
      }

      if (request.method === 'POST') {
        const rpcName = url.pathname.split('/').pop()
        const rpcFixtures = {
          register_my_notification_installation_v2: qaState.installationId,
          set_my_notification_installation_foreground_v2: true,
          claim_my_notification_presentation_v2: true,
          claim_my_notification_event: true,
          mark_my_notification_event_read: true,
        }
        if (Object.prototype.hasOwnProperty.call(rpcFixtures, rpcName)) {
          return createJsonResponse(rpcFixtures[rpcName])
        }
      }
      return nativeFetch(input, init)
    }

    // Chromium's headless Badging implementation crashes when an authenticated page sends
    // SHADOWCHAT_BADGE_UPDATE into a newly claimed worker. Delay automatic push registration,
    // no-op only the OS badge bridge, and register the real worker explicitly once the app is
    // stable. Notification clear and click-routing messages still reach the real worker.
    try {
      delete window.PushManager
    } catch {
      // WebKit already omits PushManager outside an installed Home Screen context.
    }
    try {
      Object.defineProperty(navigator, 'setAppBadge', {
        configurable: true,
        value: async () => {},
      })
      Object.defineProperty(navigator, 'clearAppBadge', {
        configurable: true,
        value: async () => {},
      })
    } catch {
      // The badge surface can be non-configurable on some engines.
    }
    if (typeof ServiceWorker !== 'undefined') {
      const nativePostMessage = ServiceWorker.prototype.postMessage
      ServiceWorker.prototype.postMessage = function postMessage(message, ...transfer) {
        if (message?.type === 'SHADOWCHAT_BADGE_UPDATE') return undefined
        return nativePostMessage.call(this, message, ...transfer)
      }
    }
  }, {
    qaFixture: fixture,
    preferences: createNotificationPreferences(authenticatedUserId),
    userId: authenticatedUserId,
  })
}

const serviceWorkerRouteCancellation = issue => (
  issue.kind === 'requestfailed' &&
  issue.phase === 'service-worker-route-transition' &&
  /^(net::ERR_ABORTED|Load interrupted)$/i.test(issue.errorText ?? '')
)

// The only browser-error allowlist is an exact browser cancellation emitted while the real
// worker calls client.navigate() during our deliberate synthetic click. Chromium cancels the
// previous SPA route's in-flight requests and lazy chunks at that instant. The same failures
// at boot, coordinator presentation, settings preview, or after the route settles still fail.
const knownLocalPreviewAllowlist = [
  {
    id: 'service-worker-route-transition-cancelled-request',
    matches: serviceWorkerRouteCancellation,
  },
]

const partitionIssues = issues => {
  const allowed = []
  const unexpected = []
  for (const issue of issues) {
    const allowance = knownLocalPreviewAllowlist.find(candidate => candidate.matches(issue))
    if (allowance) {
      allowed.push({ ...issue, allowance: allowance.id })
    } else {
      unexpected.push(issue)
    }
  }
  return { allowed, unexpected }
}

const ensureServiceWorker = async page => page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are unavailable in this browser profile')
  }

  let registration = await navigator.serviceWorker.getRegistration('/')
  if (!registration) {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    })
  }
  registration = await navigator.serviceWorker.ready

  if (!navigator.serviceWorker.controller) {
    await new Promise(resolve => {
      const timeoutId = window.setTimeout(resolve, 4_000)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.clearTimeout(timeoutId)
        resolve()
      }, { once: true })
    })
  }

  return {
    scope: registration.scope,
    activeScriptUrl: registration.active?.scriptURL ?? null,
    controlled: Boolean(navigator.serviceWorker.controller),
  }
})

const dispatchServiceWorkerNotificationClick = async ({
  context,
  page,
  profileId,
  route,
}) => {
  const targetHref = new URL(route, baseUrl).href
  const workers = context.serviceWorkers()
  const worker = workers.find(candidate => candidate.url().endsWith('/sw.js'))
  const allowedIssues = []

  if (worker) {
    try {
      await worker.evaluate(async targetRoute => {
        const pending = []
        const event = new Event('notificationclick')
        const createdAt = new Date()
        Object.defineProperties(event, {
          action: { configurable: true, value: '' },
          notification: {
            configurable: true,
            value: {
              close() {},
              data: {
                envelopeV2: {
                  schemaVersion: 2,
                  eventId: '00000000-0000-4000-8000-000000000099',
                  eventIds: ['00000000-0000-4000-8000-000000000099'],
                  type: 'presence_active',
                  category: 'presence',
                  entityId: '00000000-0000-4000-8000-000000000099',
                  route: targetRoute,
                  groupKey: 'visual-qa:service-worker-route',
                  priority: 'ambient',
                  privacy: 'full',
                  actor: null,
                  content: {
                    eyebrow: 'Active now',
                    title: 'Service worker route check',
                    body: null,
                    privateTitle: 'ShadowChat notification',
                    privateBody: null,
                  },
                  media: null,
                  actions: ['open'],
                  soundId: 'silent',
                  androidChannelKey: 'social_v1',
                  badgeCategory: 'none',
                  autoRead: true,
                  createdAt: createdAt.toISOString(),
                  expiresAt: new Date(createdAt.getTime() + 60_000).toISOString(),
                },
              },
            },
          },
          waitUntil: {
            configurable: true,
            value: promise => pending.push(Promise.resolve(promise)),
          },
        })
        self.dispatchEvent(event)
        await Promise.all(pending)
      }, route)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/InvalidAccessError: Not allowed to focus a window\.$/.test(message)) {
        throw error
      }
      // A synthetic, untrusted notificationclick cannot receive browser user activation.
      // Chromium still executes the real worker routing/postMessage path before focus().
      allowedIssues.push({
        kind: 'serviceworker',
        allowance: 'synthetic-notification-click-cannot-focus-window',
        message,
      })
    }
  } else {
    assert.equal(
      profileId,
      'iphone-webkit',
      `No active Playwright service worker handle was available for ${profileId}`,
    )
    await page.evaluate(href => {
      navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'SHADOWCHAT_NOTIFICATION_CLICK',
          targetHref: href,
          targetUrl: new URL(href).pathname + new URL(href).search,
          action: '',
        },
      }))
    }, targetHref)
    // Playwright does not currently expose WebKit ServiceWorker handles. The worker is
    // still registered/controlling; this exercises the app's real worker-message route.
    allowedIssues.push({
      kind: 'serviceworker',
      allowance: 'playwright-webkit-worker-handle-unavailable',
      message: 'Used the controlling ServiceWorkerContainer message path.',
    })
  }

  await page.waitForURL(url => (
    url.searchParams.get('view') === 'active-users' &&
    url.searchParams.get('notificationQa') === 'service-worker'
  ), { timeout: 20_000 })
  await page.getByTestId('active-users-view').waitFor({ timeout: 20_000 })
  return allowedIssues
}

const getButtonGeometry = (list, viewport) =>
  list.locator('button').evaluateAll((buttons, size) => buttons.map(button => {
    const rect = button.getBoundingClientRect()
    return {
      label: button.getAttribute('aria-label'),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
      inViewport: (
        rect.left >= -1 &&
        rect.right <= size.width + 1 &&
        rect.top >= -1 &&
        rect.bottom <= size.height + 1
      ),
    }
  }), viewport)

await mkdir(artifactDir, { recursive: true })
const results = []

for (const profile of profiles) {
  const browser = await profile.browserType.launch({ headless: true })
  let context = null
  let page = null
  const artifacts = []
  const observedIssues = []
  const explicitAllowedIssues = []
  let currentPhase = 'boot'
  const fixture = {
    armed: false,
    actorId: '00000000-0000-4000-8000-000000000011',
    eventId: profile.id === 'iphone-webkit'
      ? '00000000-0000-4000-8000-000000000021'
      : '00000000-0000-4000-8000-000000000022',
    installationId: profile.id === 'iphone-webkit'
      ? '00000000-0000-4000-8000-000000000031'
      : '00000000-0000-4000-8000-000000000032',
  }
  try {
    context = await browser.newContext({
      ...profile.device,
      viewport: profile.viewport,
      storageState: storageStatePath,
      serviceWorkers: 'allow',
    })
    page = await context.newPage()
    await installNotificationContractFixtures(page, fixture)
    page.on('pageerror', error => {
      observedIssues.push({ kind: 'pageerror', phase: currentPhase, message: error.message })
    })
    page.on('console', message => {
      if (message.type() !== 'error') return
      const location = message.location()
      observedIssues.push({
        kind: 'console',
        phase: currentPhase,
        message: message.text(),
        url: location.url || null,
        line: location.lineNumber ?? null,
        column: location.columnNumber ?? null,
      })
    })
    page.on('response', response => {
      if (response.status() < 400) return
      observedIssues.push({
        kind: 'response',
        phase: currentPhase,
        status: response.status(),
        method: response.request().method(),
        resourceType: response.request().resourceType(),
        url: response.url(),
      })
    })
    page.on('requestfailed', request => {
      observedIssues.push({
        kind: 'requestfailed',
        phase: currentPhase,
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
        errorText: request.failure()?.errorText ?? 'Unknown request failure',
      })
    })
    page.on('websocket', socket => {
      socket.on('socketerror', error => {
        observedIssues.push({
          kind: 'websocket',
          phase: currentPhase,
          url: socket.url(),
          message: String(error),
        })
      })
    })
    page.on('crash', () => {
      observedIssues.push({
        kind: 'pagecrash',
        phase: currentPhase,
        message: `${profile.id} page crashed`,
      })
    })

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    currentPhase = 'app-ready'
    await page.locator('textarea:visible').first().waitFor({ timeout: 20_000 })
    const skipSetup = page.getByRole('button', {
      name: /^(Skip for Now|Close phone setup|I Finished Setup)$/,
    }).first()
    await skipSetup.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => {})
    if (await skipSetup.isVisible().catch(() => false)) {
      await skipSetup.click()
    }

    const serviceWorker = await ensureServiceWorker(page)
    assert.equal(serviceWorker.controlled, true, JSON.stringify(serviceWorker))
    assert.ok(serviceWorker.activeScriptUrl?.endsWith('/sw.js'), JSON.stringify(serviceWorker))
    explicitAllowedIssues.push({
      kind: 'serviceworker',
      allowance: 'headless-os-badge-bridge-disabled',
      message: 'OS badge calls only are disabled to avoid a Playwright Chromium crash.',
    })

    const mainNavigation = page.getByRole('list', { name: 'Main navigation' })
    await mainNavigation.waitFor()
    assert.equal(await mainNavigation.getAttribute('aria-hidden'), 'false')
    await page.getByRole('button', { name: /active users/i }).waitFor()
    await page.getByRole('button', { name: 'Show more navigation' }).waitFor()
    assert.equal(await mainNavigation.getByText('More', { exact: true }).count(), 1)
    assert.equal(await mainNavigation.getByText('Play', { exact: true }).count(), 0)

    const primaryGeometry = await getButtonGeometry(mainNavigation, profile.viewport)
    assert.ok(primaryGeometry.every(item => item.inViewport), JSON.stringify(primaryGeometry))
    assert.ok(primaryGeometry.every(item => item.height >= 44), JSON.stringify(primaryGeometry))
    const primaryNavArtifact = path.join(artifactDir, `${profile.id}-primary-nav.png`)
    await page.screenshot({
      path: primaryNavArtifact,
      fullPage: false,
    })
    artifacts.push(primaryNavArtifact)

    await page.getByRole('button', { name: 'Show more navigation' }).click()
    const moreNavigation = page.getByRole('list', { name: 'More navigation' })
    await page.waitForFunction(() =>
      document.querySelector('[data-testid="mobile-nav-pages"]')
        ?.classList.contains('-translate-x-1/2'))
    await page.waitForFunction(({ width, height }) => {
      const list = document.querySelector('[aria-label="More navigation"]')
      if (!list) return false
      return [...list.querySelectorAll('button')].every(button => {
        const rect = button.getBoundingClientRect()
        return (
          rect.left >= -1 &&
          rect.right <= width + 1 &&
          rect.top >= -1 &&
          rect.bottom <= height + 1
        )
      })
    }, profile.viewport, { timeout: 2_000 })
    assert.equal(await moreNavigation.getAttribute('aria-hidden'), 'false')
    await page.getByRole('button', { name: /Open Play/i }).waitFor()
    assert.equal(await moreNavigation.getByText('Play', { exact: true }).count(), 1)
    assert.equal(await moreNavigation.getByText('Settings', { exact: true }).count(), 1)

    const moreGeometry = await getButtonGeometry(moreNavigation, profile.viewport)
    assert.ok(moreGeometry.every(item => item.inViewport), JSON.stringify(moreGeometry))
    assert.ok(moreGeometry.every(item => item.height >= 44), JSON.stringify(moreGeometry))
    const moreNavArtifact = path.join(artifactDir, `${profile.id}-more-nav.png`)
    await page.screenshot({
      path: moreNavArtifact,
      fullPage: false,
    })
    artifacts.push(moreNavArtifact)

    await page.getByRole('button', { name: 'Open app preferences' }).click()
    const notificationsSettings = page.getByRole('button', {
      name: /Notifications & Audio/i,
    })
    await notificationsSettings.waitFor({ timeout: 20_000 })
    await notificationsSettings.click()
    await page.getByRole('heading', { name: 'Presentation & Privacy' })
      .waitFor({ timeout: 20_000 })

    const banner = page.getByTestId('notification-banner-v2')
    await banner.scrollIntoViewIfNeeded()
    const bannerGeometry = await banner.evaluate((element, viewport) => {
      const rect = element.getBoundingClientRect()
      const controls = [...element.querySelectorAll('button')].map(control => {
        const controlRect = control.getBoundingClientRect()
        return {
          width: Math.round(controlRect.width),
          height: Math.round(controlRect.height),
        }
      })
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        inViewport: rect.left >= -1 && rect.right <= viewport.width + 1,
        controls,
      }
    }, profile.viewport)
    assert.ok(bannerGeometry.inViewport, JSON.stringify(bannerGeometry))
    assert.ok(
      bannerGeometry.controls.every(control => control.height >= 44),
      JSON.stringify(bannerGeometry),
    )
    const previewOpen = banner.getByRole('button', {
      name: /JJ commented on your ShadowPin.*View Comment/i,
    })
    await previewOpen.click()
    const previewConfirmation = page.getByText('The real banner opens its exact source')
    await previewConfirmation.waitFor()
    assert.equal(await banner.isVisible(), true)

    const settingsArtifact = path.join(artifactDir, `${profile.id}-notification-settings.png`)
    await page.screenshot({
      path: settingsArtifact,
      fullPage: false,
    })
    artifacts.push(settingsArtifact)
    await previewConfirmation.waitFor({ state: 'hidden', timeout: 10_000 })

    await page.evaluate(() => {
      window.__shadowchatNotificationV2Qa.armed = true
      window.dispatchEvent(new Event('focus'))
    })
    const coordinatorTray = page.getByTestId('notification-coordinator-tray')
    await coordinatorTray.waitFor({ timeout: 20_000 })
    const coordinatorBanner = coordinatorTray.getByTestId('notification-banner-v2')
    await coordinatorBanner
      .getByText('Visual QA posted a new ShadowPin', { exact: true })
      .waitFor()
    const coordinatorOpen = coordinatorBanner.getByRole('button', {
      name: /Visual QA posted a new ShadowPin.*View Pin/i,
    })
    assert.ok(
      (await coordinatorOpen.boundingBox())?.height >= 44,
      'The real coordinator action is smaller than 44px',
    )

    const coordinatorArtifact = path.join(artifactDir, `${profile.id}-coordinator-banner.png`)
    await page.screenshot({ path: coordinatorArtifact, fullPage: false })
    artifacts.push(coordinatorArtifact)

    await coordinatorOpen.click()
    await page.waitForURL(url => url.searchParams.get('view') === 'pins', {
      timeout: 20_000,
    })
    await page.getByTestId('shadow-pin-category-list').waitFor({ timeout: 20_000 })
    await coordinatorTray.waitFor({ state: 'hidden', timeout: 20_000 })
    const coordinatorRoute = page.url()

    const coordinatorRouteArtifact = path.join(
      artifactDir,
      `${profile.id}-coordinator-route.png`,
    )
    await page.screenshot({ path: coordinatorRouteArtifact, fullPage: false })
    artifacts.push(coordinatorRouteArtifact)

    currentPhase = 'service-worker-route-transition'
    explicitAllowedIssues.push(...await dispatchServiceWorkerNotificationClick({
      context,
      page,
      profileId: profile.id,
      route: '/?view=active-users&notificationQa=service-worker',
    }))
    const workerRouteArtifact = path.join(
      artifactDir,
      `${profile.id}-service-worker-route.png`,
    )
    await page.screenshot({ path: workerRouteArtifact, fullPage: false })
    artifacts.push(workerRouteArtifact)
    currentPhase = 'service-worker-route-settled'

    const serviceWorkerAfterRoutes = await ensureServiceWorker(page)
    assert.equal(serviceWorkerAfterRoutes.controlled, true, JSON.stringify(serviceWorkerAfterRoutes))
    await page.waitForTimeout(400)
    const issuePartition = partitionIssues(observedIssues)
    const allowedIssues = [...issuePartition.allowed, ...explicitAllowedIssues]
    assert.deepEqual(issuePartition.unexpected, [])

    results.push({
      profile: profile.id,
      status: 'passed',
      artifacts,
      primaryGeometry,
      moreGeometry,
      bannerGeometry,
      coordinator: {
        route: coordinatorRoute,
        serviceWorker,
        serviceWorkerAfterRoutes,
      },
      allowedIssues,
      unexpectedIssues: [],
    })
  } catch (error) {
    const issuePartition = partitionIssues(observedIssues)
    const failureArtifact = path.join(artifactDir, `${profile.id}-failure.png`)
    if (page && !page.isClosed()) {
      await page.screenshot({ path: failureArtifact, fullPage: false })
        .then(() => artifacts.push(failureArtifact))
        .catch(() => undefined)
    }
    results.push({
      profile: profile.id,
      status: 'failed',
      artifacts,
      error: error instanceof Error ? error.stack ?? error.message : String(error),
      allowedIssues: [...issuePartition.allowed, ...explicitAllowedIssues],
      unexpectedIssues: issuePartition.unexpected,
    })
  } finally {
    await context?.close().catch(() => undefined)
    await browser.close()
  }
}

const failedProfiles = results.filter(result => result.status === 'failed')
const summary = {
  status: failedProfiles.length === 0 ? 'passed' : 'failed',
  baseUrl,
  serviceWorkers: 'allow',
  results,
}
await writeFile(
  path.join(artifactDir, 'summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
)
console.log(JSON.stringify({
  status: summary.status,
  profiles: results.map(result => result.profile),
  screenshots: results.reduce((count, result) => count + result.artifacts.length, 0),
  summary: path.join(artifactDir, 'summary.json'),
}))
if (failedProfiles.length > 0) process.exitCode = 1

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
  let notificationReadCalls = 0
  let syntheticNotificationRead = false
  page.on('request', request => {
    if (/\/rest\/v1\/rpc\/get_my_catch_up_v1(?:\?|$)/u.test(request.url())) snapshotCalls += 1
    if (/\/rest\/v1\/rpc\/acknowledge_my_catch_up_events(?:\?|$)/u.test(request.url())) acknowledgementCalls += 1
  })
  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (!/content security policy/iu.test(text)) diagnostics.consoleErrors.push(text)
  })
  page.on('pageerror', error => diagnostics.pageErrors.push(error.stack || error.message))
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

    await page.route('**/rest/v1/notification_events*', async route => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': syntheticNotificationRead ? '*/0' : '0-0/1' },
        body: JSON.stringify(syntheticNotificationRead ? [] : [{
          id: '00000000-0000-4000-8000-000000000123',
          type: 'shadow_pin_comment',
          category: 'shadow_pin',
          actor_id: null,
          route: '/?view=pins&pin=browser-proof-pin',
          payload: {
            title: 'Browser proof notification',
            body: 'Swipe this controlled notification to verify durable dismissal.',
            image_id: 'browser-proof-pin',
          },
          created_at: '2026-07-17T12:00:00.000Z',
          actor: null,
        }]),
      })
    })
    await page.route('**/rest/v1/rpc/mark_my_notification_event_read*', async route => {
      notificationReadCalls += 1
      syntheticNotificationRead = true
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'true' })
    })

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

    const notificationSurface = page.locator('[data-notification-swipe-id="notification:00000000-0000-4000-8000-000000000123"]')
    await notificationSurface.waitFor()
    const notificationDragSurface = notificationSurface.locator('[data-swipe-offset]')
    const notificationBox = await notificationSurface.boundingBox()
    must(notificationBox, `${profile.name} notification surface did not have measurable geometry.`)
    const swipeStartX = notificationBox.x + (notificationBox.width * 0.82)
    const swipeEndX = notificationBox.x + (notificationBox.width * 0.32)
    const swipeY = notificationBox.y + (notificationBox.height * 0.5)
    const dispatchSyntheticTouch = async (type, points, changedPoints = points) => (
      notificationDragSurface.evaluate((element, payload) => {
        const toTouches = values => values.map(value => ({
          identifier: value.id,
          target: element,
          clientX: value.x,
          clientY: value.y,
          pageX: value.x,
          pageY: value.y,
          screenX: value.x,
          screenY: value.y,
        }))
        const event = new Event(payload.type, { bubbles: true, cancelable: true })
        Object.defineProperties(event, {
          touches: { value: toTouches(payload.points) },
          targetTouches: { value: toTouches(payload.points) },
          changedTouches: { value: toTouches(payload.changedPoints) },
        })
        element.dispatchEvent(event)
        return event.defaultPrevented
      }, { type, points, changedPoints })
    )
    const cdp = profile.engine === chromium ? await context.newCDPSession(page) : null
    const dispatchTouch = async (type, points, changedPoints = points) => {
      if (!cdp) {
        const domType = {
          touchStart: 'touchstart',
          touchMove: 'touchmove',
          touchEnd: 'touchend',
          touchCancel: 'touchcancel',
        }[type]
        return dispatchSyntheticTouch(domType, points, changedPoints)
      }
      await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points,
      })
      return null
    }
    const startPoint = { x: swipeStartX, y: swipeY, id: 1 }
    await dispatchTouch('touchStart', [startPoint])
    await dispatchTouch('touchMove', [{ x: swipeStartX - 4, y: swipeY + 7, id: 1 }])
    const pendingSwipe = await notificationDragSurface.getAttribute('data-swipe-offset')
    const pendingLock = await page.getByRole('region', { name: 'Catch-Up content' })
      .getAttribute('data-horizontal-swipe-locked')
    must(pendingSwipe === '0', `${profile.name} moved the notification before diagonal swipe intent was clear.`)
    must(pendingLock === 'false', `${profile.name} locked vertical scrolling during ambiguous finger movement.`)
    await dispatchTouch('touchMove', [{ x: swipeStartX - 24, y: swipeY + 18, id: 1 }])
    for (const progress of [0.25, 0.5, 0.75, 1]) {
      await dispatchTouch('touchMove', [{
        x: (swipeStartX - 24) + ((swipeEndX - (swipeStartX - 24)) * progress),
        y: (swipeY + 18) + (26 * progress),
        id: 1,
      }])
    }
    const swipeLocked = await page.getByRole('region', { name: 'Catch-Up content' })
      .getAttribute('data-horizontal-swipe-locked')
    must(swipeLocked === 'true', `${profile.name} did not lock vertical scrolling after claiming the notification swipe.`)
    const claimedOffset = Number(await notificationDragSurface.getAttribute('data-swipe-offset'))
    must(claimedOffset < -80, `${profile.name} did not keep tracking a claimed swipe through downward finger drift.`)
    const fullSwipeX = notificationBox.x + 2
    await dispatchTouch('touchMove', [{ x: fullSwipeX, y: swipeY + 46, id: 1 }])
    const fullSwipeOffset = Number(await notificationDragSurface.getAttribute('data-swipe-offset'))
    must(
      fullSwipeOffset <= -(notificationBox.width * 0.9),
      `${profile.name} stopped the card before full-width finger travel.`
    )
    await dispatchTouch('touchMove', [{ x: swipeStartX - 70, y: swipeY + 30, id: 1 }])
    const reversedOffset = Number(await notificationDragSurface.getAttribute('data-swipe-offset'))
    must(
      reversedOffset > fullSwipeOffset + (notificationBox.width * 0.35),
      `${profile.name} did not reverse the card continuously when the finger moved back.`
    )
    await dispatchTouch('touchMove', [{ x: fullSwipeX, y: swipeY + 44, id: 1 }])
    await dispatchTouch('touchEnd', [], [{ x: fullSwipeX, y: swipeY + 44, id: 1 }])
    const swipeReleased = await page.getByRole('region', { name: 'Catch-Up content' })
      .getAttribute('data-horizontal-swipe-locked')
    must(swipeReleased === 'false', `${profile.name} did not release the vertical scroll lock after pointer up.`)
    const disintegration = page.getByTestId('notification-disintegration-notification:00000000-0000-4000-8000-000000000123')
    await disintegration.waitFor({ timeout: 2_000 })
    must(
      await notificationDragSurface.getAttribute('data-card-disintegration') === 'active',
      `${profile.name} did not erode the actual notification card during dismissal.`
    )
    const sandCanvas = disintegration.locator('[data-notification-sand-canvas]')
    await sandCanvas.waitFor({ timeout: 2_000 })
    await page.waitForTimeout(100)
    const sandSource = await sandCanvas.getAttribute('data-sand-source')
    const sandParticleCount = Number(await sandCanvas.getAttribute('data-sand-particle-count'))
    must(
      sandSource === 'captured-card-pixels',
      `${profile.name} did not rasterize the real notification surface before disintegration (source=${sandSource || 'missing'}).`
    )
    must(
      sandParticleCount > 1_000,
      `${profile.name} did not create a dense pixel-sourced sand field (particles=${sandParticleCount}).`
    )
    await page.waitForTimeout(360)
    const sandProgress = Number(await sandCanvas.getAttribute('data-sand-progress'))
    must(
      sandProgress > 0.03 && sandProgress < 0.98,
      `${profile.name} did not expose a visible in-progress full-card sand frame.`
    )
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-disintegration.png`) })
    await notificationSurface.waitFor({ state: 'detached', timeout: 10_000 })
    must(notificationReadCalls === 1, `${profile.name} expected one notification read acknowledgement, saw ${notificationReadCalls}.`)
    const pendingReadIds = await page.evaluate(userId => {
      const key = `shadowchat:pending-notification-reads:v1:${userId}`
      return JSON.parse(localStorage.getItem(key) || '[]')
    }, auth.data.session.user.id)
    must(Array.isArray(pendingReadIds) && pendingReadIds.length === 0, `${profile.name} retained a confirmed notification read in its retry ledger.`)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await dismissTransientUi(page)
    await page.getByRole('heading', { name: 'Your Catch-Up', level: 1 }).waitFor({ timeout: 20_000 })
    must(
      await page.locator('[data-notification-swipe-id="notification:00000000-0000-4000-8000-000000000123"]').count() === 0,
      `${profile.name} restored a notification after reload even though its read acknowledgement was confirmed.`
    )
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}.png`), fullPage: true })

    must(diagnostics.consoleErrors.length === 0, `${profile.name} console errors: ${JSON.stringify(diagnostics.consoleErrors)}`)
    must(diagnostics.pageErrors.length === 0, `${profile.name} page errors: ${JSON.stringify(diagnostics.pageErrors)}`)
    must(diagnostics.requestFailures.length === 0, `${profile.name} request failures: ${JSON.stringify(diagnostics.requestFailures)}`)
    must(diagnostics.errorResponses.length === 0, `${profile.name} error responses: ${JSON.stringify(diagnostics.errorResponses)}`)
    results.push({ profile: profile.name, passed: true, snapshotCalls, acknowledgementCalls, notificationReadCalls, geometry, diagnostics })
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-failure.png`), fullPage: true }).catch(() => undefined)
    results.push({ profile: profile.name, passed: false, error: error instanceof Error ? error.message : String(error), snapshotCalls, acknowledgementCalls, notificationReadCalls, diagnostics })
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
  residue: 'This visual swipe proof intercepts notification reads and creates no user-state mutations. Run qa:catch-up:persistence separately for a real linked write-read-reload-cleanup proof.',
  results,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
must(summary.passed, `Catch-Up browser proof failed: ${path.join(artifactDir, 'summary.json')}`)
console.log(`Catch-Up browser proof passed: ${path.join(artifactDir, 'summary.json')}`)

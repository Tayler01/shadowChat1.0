import { chromium, devices, webkit } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, ...value] = argument.replace(/^--/, '').split('=')
  return [key, value.join('=')]
}))
const baseUrl = new URL(args['base-url'] || '')
const storageState = path.resolve(args['storage-state'] || '')
const artifactDir = path.resolve(args['artifact-dir'] || 'output/playwright/final-acceptance-mobile')

if (!baseUrl.hostname.endsWith('--shadowchat-2-0-wave-one.netlify.app')) {
  throw new Error('Final acceptance mobile verification requires an immutable isolated Netlify deploy URL.')
}
if (!args['storage-state']) {
  throw new Error('Pass an authenticated Playwright storage state with --storage-state=<path>.')
}

await mkdir(artifactDir, { recursive: true })

const profiles = [
  { name: 'android-chromium', engine: chromium, device: devices['Pixel 7'] || devices['Pixel 5'] },
  { name: 'iphone-webkit', engine: webkit, device: devices['iPhone 13'] },
]
const evidence = []

const assertMobileGeometry = async (page, expectedView) => {
  const metrics = await page.evaluate(() => ({
    view: new URL(window.location.href).searchParams.get('view'),
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    mobileNavVisible: Boolean(document.querySelector('nav[aria-label="Primary and utility navigation"]')),
    visibleNavButtons: Array.from(document.querySelectorAll('nav[aria-label="Primary and utility navigation"] button'))
      .map(button => {
        const rect = button.getBoundingClientRect()
        return {
          name: button.getAttribute('aria-label') || button.textContent?.trim() || '',
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }
      })
      .filter(button => button.width > 0 && button.right > 0 && button.left < window.innerWidth),
  }))

  if (metrics.view !== expectedView) {
    throw new Error(`Expected ${expectedView} route, received ${metrics.view || 'none'}.`)
  }
  if (metrics.documentWidth > metrics.viewportWidth + 1) {
    throw new Error(`${expectedView} overflowed by ${metrics.documentWidth - metrics.viewportWidth}px.`)
  }
  if (!metrics.mobileNavVisible) {
    throw new Error(`${expectedView} did not retain the mobile navigation.`)
  }
  if (metrics.visibleNavButtons.length !== 5) {
    throw new Error(`${expectedView} exposed ${metrics.visibleNavButtons.length} mobile navigation buttons instead of 5: ${JSON.stringify(metrics.visibleNavButtons)}`)
  }
  return metrics
}

const dismissBlockingDialogs = async page => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const releaseDialog = page.getByRole('dialog').filter({
      has: page.getByText(/update|what's new|restart/i),
    }).first()
    if (!(await releaseDialog.isVisible().catch(() => false))) break

    const close = releaseDialog.getByRole('button', { name: /^(Done|Got It|Later)$/ }).first()
    if (await close.isVisible().catch(() => false)) {
      await close.click()
      await releaseDialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined)
      break
    }

    const restart = releaseDialog.getByRole('button', { name: /^(Restart Now|Update Now)$/ }).first()
    if (await restart.isVisible().catch(() => false)) {
      await restart.click()
      await page.waitForLoadState('domcontentloaded').catch(() => undefined)
      await page.waitForTimeout(1000)
      continue
    }
    break
  }

  const phoneSetupDialog = page.getByRole('dialog').filter({
    has: page.getByText(/phone setup|add shadow chat/i),
  }).first()
  if (await phoneSetupDialog.isVisible().catch(() => false)) {
    const close = phoneSetupDialog.getByRole('button', {
      name: /^(Skip for Now|Close phone setup|I Finished Setup)$/,
    }).first()
    if (await close.isVisible().catch(() => false)) {
      await close.click()
      await phoneSetupDialog.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined)
    }
  }
}

for (const profile of profiles) {
  console.log(`Starting ${profile.name}`)
  const browser = await profile.engine.launch({
    headless: true,
    args: profile.engine === chromium ? ['--disable-dev-shm-usage', '--disable-gpu'] : [],
  })
  try {
    const context = await browser.newContext({
      ...profile.device,
      storageState,
      serviceWorkers: 'block',
    })
    const routeErrors = []
    const openRoute = async route => {
      const page = await context.newPage()
      const errors = []
      page.setDefaultTimeout(20_000)
      page.setDefaultNavigationTimeout(30_000)
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(new URL(route, baseUrl).href, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1000)
      await dismissBlockingDialogs(page)
      return { page, errors }
    }
    const finishRoute = async ({ page, errors }, route) => {
      await page.waitForTimeout(750)
      routeErrors.push(...errors.map(error => `${route}: ${error}`))
      await page.close()
    }

    const activeRoute = await openRoute('/?view=active-users')
    await activeRoute.page.getByRole('button', { name: 'Refresh active users' }).waitFor()
    const activeUsers = await assertMobileGeometry(activeRoute.page, 'active-users')
    await activeRoute.page.waitForTimeout(5500)
    await dismissBlockingDialogs(activeRoute.page)
    await activeRoute.page.screenshot({
      path: path.join(artifactDir, `${profile.name}-active-users.png`),
    })
    await finishRoute(activeRoute, 'active-users')

    const weatherRoute = await openRoute('/?view=weather')
    await weatherRoute.page.getByPlaceholder('Search city or postal code').waitFor()
    await weatherRoute.page.getByRole('button', { name: 'Refresh weather' }).waitFor()
    const weather = await assertMobileGeometry(weatherRoute.page, 'weather')
    await weatherRoute.page.waitForTimeout(5500)
    await dismissBlockingDialogs(weatherRoute.page)
    await weatherRoute.page.screenshot({
      path: path.join(artifactDir, `${profile.name}-weather.png`),
    })
    await finishRoute(weatherRoute, 'weather')

    const settingsRoute = await openRoute('/?view=settings&settingsSection=notifications-audio')
    const badgeHeading = settingsRoute.page.getByRole('heading', { name: 'Home Screen Badge' })
    const presenceLabel = settingsRoute.page.getByText('Active Users (in-app)', { exact: true })
    await badgeHeading.waitFor()
    await presenceLabel.waitFor()
    const settings = await assertMobileGeometry(settingsRoute.page, 'settings')
    await settingsRoute.page.waitForTimeout(5500)
    await dismissBlockingDialogs(settingsRoute.page)
    await presenceLabel.scrollIntoViewIfNeeded()
    await settingsRoute.page.waitForTimeout(300)
    await settingsRoute.page.screenshot({
      path: path.join(artifactDir, `${profile.name}-presence-settings.png`),
    })
    await badgeHeading.scrollIntoViewIfNeeded()
    await settingsRoute.page.waitForTimeout(300)
    await settingsRoute.page.screenshot({
      path: path.join(artifactDir, `${profile.name}-notification-settings.png`),
    })
    await finishRoute(settingsRoute, 'settings')

    if (routeErrors.length) {
      throw new Error(`Browser page errors: ${routeErrors.join(' | ')}`)
    }

    evidence.push({ profile: profile.name, activeUsers, weather, settings, pageErrors: 0 })
    await context.close()
    console.log(`Passed ${profile.name}`)
  } finally {
    await browser.close().catch(() => undefined)
  }
}

const summary = {
  status: 'passed',
  baseUrl: baseUrl.origin,
  createdAt: new Date().toISOString(),
  evidence,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
console.log(`Final acceptance mobile verification passed: ${path.join(artifactDir, 'summary.json')}`)

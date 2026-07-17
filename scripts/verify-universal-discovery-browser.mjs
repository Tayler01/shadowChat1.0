import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium, webkit } from 'playwright'

const repoRoot = process.cwd()
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4174'
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'wave2-candidate1-discovery')

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

const email = env.PLAYWRIGHT_ACCOUNT_1_EMAIL || env.PLAYWRIGHT_ACCOUNT1_EMAIL
const password = env.PLAYWRIGHT_ACCOUNT_1_PASSWORD || env.PLAYWRIGHT_ACCOUNT1_PASSWORD
if (!email || !password) throw new Error('Missing PLAYWRIGHT_ACCOUNT_1 credentials.')

const allProfiles = [
  { name: 'pixel-chromium', engine: chromium, viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36' },
  { name: 'iphone-webkit', engine: webkit, viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1' },
]
const profiles = process.env.DISCOVERY_BROWSER_PROFILE
  ? allProfiles.filter(profile => profile.name === process.env.DISCOVERY_BROWSER_PROFILE)
  : allProfiles

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
  const page = await context.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', error => pageErrors.push(error.message))

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => {
      const text = document.body?.innerText || ''
      return text.includes('Sign in') || text.includes('General Chat') || text.includes('Direct Messages')
    }, null, { timeout: 30_000 })
    const signIn = page.locator('form').getByRole('button', { name: /^Sign in$/i })
    if (await signIn.isVisible().catch(() => false)) {
      await page.locator('input[name="email"]').fill(email)
      await page.locator('input[name="password"]').fill(password)
      await signIn.click()
    }

    await page.getByRole('button', { name: 'Show app tools' }).waitFor({ timeout: 30_000 })
    await page.getByRole('button', { name: /^Skip for Now$/i }).first().waitFor({ state: 'visible', timeout: 2_000 }).catch(() => {})
    for (const label of [/^Skip for Now$/i, /^(Done|Got It|Later|Not now)$/i]) {
      const dismiss = page.getByRole('button', { name: label }).first()
      if (await dismiss.isVisible().catch(() => false)) {
        await dismiss.click({ force: true })
        await page.waitForTimeout(250)
      }
    }
    const releaseDialog = page.getByRole('dialog').filter({ has: page.getByText(/update|what's new|restart/i) }).first()
    if (await releaseDialog.isVisible().catch(() => false)) {
      const dismiss = releaseDialog.getByRole('button', { name: /^(Done|Got It|Later)$/ }).first()
      if (await dismiss.isVisible().catch(() => false)) await dismiss.click()
    }
    const remainingSkip = page.getByRole('button', { name: /^Skip for Now$/i }).first()
    if (await remainingSkip.isVisible().catch(() => false)) {
      await remainingSkip.click({ force: true })
      await page.waitForTimeout(250)
    }
    await page.getByRole('button', { name: 'Show app tools' }).click()
    const openDiscover = page.getByRole('button', { name: 'Open search and saved messages' })
    await openDiscover.waitFor({ timeout: 15_000 })
    await openDiscover.click()

    const discover = page.getByTestId('universal-discovery-view')
    await discover.waitFor()
    const mobileNav = page.getByRole('navigation', { name: 'Primary and utility navigation' })
    await mobileNav.waitFor()
    if (await page.getByRole('dialog', { name: 'Discover' }).count()) {
      throw new Error('Discover still renders as a modal dialog.')
    }
    if (!await discover.evaluate(element => element.classList.contains('theme-app-surface'))) {
      throw new Error('Discover is missing the standard themed app surface.')
    }
    if (new URL(page.url()).searchParams.get('view') !== 'discover') {
      throw new Error(`Discover did not use its routed page URL: ${page.url()}`)
    }
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-01-empty.png`) })

    const search = page.getByLabel('Search ShadowChat')
    await search.fill('shadow')
    await page.getByText('Shadow Mystery', { exact: true }).first().waitFor({ timeout: 20_000 })
    const firstMessageCard = discover.locator('section[aria-label="Messages"] article').first()
    const messageCardDiagnostics = await firstMessageCard.isVisible().then(visible => visible
      ? firstMessageCard.evaluate(element => ({
          height: element.getBoundingClientRect().height,
          computed: {
            display: getComputedStyle(element).display,
            height: getComputedStyle(element).height,
            minHeight: getComputedStyle(element).minHeight,
            alignSelf: getComputedStyle(element).alignSelf,
            flex: getComputedStyle(element).flex,
          },
          parent: element.parentElement ? {
            height: element.parentElement.getBoundingClientRect().height,
            display: getComputedStyle(element.parentElement).display,
            flexDirection: getComputedStyle(element.parentElement).flexDirection,
            alignItems: getComputedStyle(element.parentElement).alignItems,
          } : null,
          heightRules: Array.from(document.styleSheets).flatMap(sheet => {
            try {
              return Array.from(sheet.cssRules).flatMap(rule => {
                if (!(rule instanceof CSSStyleRule)) return []
                try {
                  return element.matches(rule.selectorText) && /height|block-size|inset/.test(rule.style.cssText)
                    ? [rule.cssText]
                    : []
                } catch {
                  return []
                }
              })
            } catch {
              return []
            }
          }),
          children: Array.from(element.children).map(child => ({
            tag: child.tagName,
            className: child.className,
            height: child.getBoundingClientRect().height,
            display: getComputedStyle(child).display,
            minHeight: getComputedStyle(child).minHeight,
          })),
        }))
      : null)
    const messageCardHeight = messageCardDiagnostics?.height ?? null
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-02-all-results.png`) })

    const geometry = await discover.evaluate(element => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      pageScrollWidth: document.documentElement.scrollWidth,
      menuVisible: (() => {
        const nav = document.querySelector('nav[aria-label="Primary and utility navigation"]')
        if (!(nav instanceof HTMLElement)) return false
        const rect = nav.getBoundingClientRect()
        return rect.height > 0 && rect.bottom <= window.innerHeight + 1
      })(),
    }))
    if (geometry.width > geometry.viewportWidth + 1 || geometry.height > geometry.viewportHeight + 1 || geometry.pageScrollWidth > geometry.viewportWidth + 1 || !geometry.menuVisible) {
      throw new Error(`Discover overflow: ${JSON.stringify(geometry)}`)
    }
    if (messageCardHeight && messageCardHeight > 360) {
      const minContentHeight = await firstMessageCard.evaluate(element => {
        element.style.height = 'min-content'
        const height = element.getBoundingClientRect().height
        const clone = document.createElement('div')
        clone.className = element.className
        clone.innerHTML = element.innerHTML
        element.parentElement?.insertBefore(clone, element)
        const cloneHeight = clone.getBoundingClientRect().height
        clone.remove()
        return { height, cloneHeight }
      })
      throw new Error(`Message result card is too tall: ${JSON.stringify({ ...messageCardDiagnostics, minContentHeight })}`)
    }

    await page.getByRole('tab', { name: /play/i }).click()
    await search.fill('shadow mystery')
    await page.getByText('Shadow Mystery', { exact: true }).first().waitFor({ timeout: 20_000 })
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-03-play.png`) })

    await page.getByRole('tab', { name: /library/i }).click()
    await page.getByLabel('Filter saved messages by collection').waitFor({ timeout: 20_000 })
    await page.getByText('Loading your Library').waitFor({ state: 'hidden', timeout: 20_000 })
    if (await discover.locator('.text-red-100').isVisible().catch(() => false)) {
      throw new Error(`Library error: ${await discover.locator('.text-red-100').innerText()}`)
    }
    const libraryHeaderGeometry = await discover.locator('header').last().evaluate(header => {
      const title = header.querySelector('#universal-discovery-title')
      const headerRect = header.getBoundingClientRect()
      const titleRect = title?.getBoundingClientRect()
      return {
        scrollX: window.scrollX,
        headerLeft: headerRect.left,
        headerRight: headerRect.right,
        titleLeft: titleRect?.left ?? null,
        titleRight: titleRect?.right ?? null,
      }
    })
    if (libraryHeaderGeometry.scrollX !== 0 || libraryHeaderGeometry.titleLeft === null || libraryHeaderGeometry.titleLeft < 0 || libraryHeaderGeometry.titleRight > geometry.viewportWidth) {
      throw new Error(`Library header moved outside the viewport: ${JSON.stringify(libraryHeaderGeometry)}`)
    }
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-04-library.png`) })
    await discover.locator('header').last().screenshot({ path: path.join(artifactDir, `${profile.name}-04-library-header.png`) })

    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors: ${JSON.stringify({ consoleErrors, pageErrors })}`)
    }

    results.push({ profile: profile.name, passed: true, geometry, messageCardHeight, libraryHeaderGeometry, consoleErrors, pageErrors })
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-failure.png`) }).catch(() => {})
    results.push({ profile: profile.name, passed: false, error: error instanceof Error ? error.message : String(error), consoleErrors, pageErrors })
  } finally {
    await context.close()
    await browser.close()
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  passed: results.every(result => result.passed),
  results,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
if (!summary.passed) {
  console.error(JSON.stringify(summary, null, 2))
  process.exitCode = 1
} else {
  console.log(`Universal Discovery browser proof passed: ${path.join(artifactDir, 'summary.json')}`)
}

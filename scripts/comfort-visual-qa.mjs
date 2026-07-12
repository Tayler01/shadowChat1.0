import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { chromium, devices, webkit } from 'playwright'

const args = Object.fromEntries(process.argv.slice(2).map(argument => {
  const [key, ...rest] = argument.replace(/^--/, '').split('=')
  return [key, rest.join('=') || 'true']
}))

const baseUrl = args['base-url'] || 'http://127.0.0.1:4174'
const storageState = args['storage-state']
const outputDir = path.resolve(args['output-dir'] || 'output/playwright/comfort-visual-qa')

if (!storageState) {
  throw new Error('Pass --storage-state=<authenticated Playwright storage state>')
}

const profiles = [
  {
    name: 'compact-320-chromium',
    browserType: chromium,
    device: {
      ...devices['Pixel 5'],
      viewport: { width: 320, height: 568 },
      screen: { width: 320, height: 568 },
    },
  },
  {
    name: 'android-chromium',
    browserType: chromium,
    device: devices['Pixel 7'],
  },
  {
    name: 'iphone-webkit',
    browserType: webkit,
    device: devices['iPhone 13'],
  },
]

const ensure = (condition, message) => {
  if (!condition) throw new Error(message)
}

const dismissTransientDialogs = async page => {
  for (let pass = 0; pass < 3; pass += 1) {
    let dismissed = false
    for (const label of ['Done', 'Got It', 'Later', 'Restart Now', 'Update Now', 'Skip for Now', 'Close phone setup', 'I Finished Setup']) {
      const button = page.getByRole('button', { name: label }).first()
      if (await button.isVisible().catch(() => false)) {
        await button.click()
        await page.waitForTimeout(label.includes('Now') ? 1_200 : 150)
        dismissed = true
        break
      }
    }
    if (!dismissed) break
  }
}

const openComfortSettings = async page => {
  await page.waitForFunction(() => {
    const text = (document.body?.innerText || '').trim()
    return text.length > 30 && !/^Loading Shado/i.test(text)
  })
  const comfortHeading = page.getByRole('heading', { name: 'Comfort Profiles' })
  if (await comfortHeading.isVisible().catch(() => false)) return

  const settingsHeading = page.getByRole('heading', { name: 'Settings' })
  if (!(await settingsHeading.isVisible().catch(() => false))) {
    const appPreferences = page.getByRole('button', { name: 'Open app preferences' }).first()
    if (await appPreferences.isVisible().catch(() => false)) {
      await appPreferences.click()
    } else {
      const settingsButton = page.getByRole('button', { name: /^Settings$/ }).first()
      if (await settingsButton.isVisible().catch(() => false)) {
        await settingsButton.click()
      } else {
        const bodyText = (await page.locator('body').innerText()).slice(0, 500)
        throw new Error(`Settings entry point is unavailable. Visible body: ${bodyText}`)
      }
    }
  }

  await settingsHeading.waitFor()
  await page.getByRole('button', { name: /Accessibility & Comfort/ }).click()
  await comfortHeading.waitFor()
}

const assertNoHorizontalOverflow = async (page, stage) => {
  const geometry = await page.evaluate(() => ({
    documentClient: document.documentElement.clientWidth,
    documentScroll: document.documentElement.scrollWidth,
    bodyClient: document.body.clientWidth,
    bodyScroll: document.body.scrollWidth,
  }))
  ensure(
    geometry.documentScroll <= geometry.documentClient + 1,
    `${stage}: document overflows horizontally (${geometry.documentScroll} > ${geometry.documentClient})`
  )
  ensure(
    geometry.bodyScroll <= geometry.bodyClient + 1,
    `${stage}: body overflows horizontally (${geometry.bodyScroll} > ${geometry.bodyClient})`
  )
  return geometry
}

await mkdir(outputDir, { recursive: true })
const results = []

for (const profile of profiles) {
  const browser = await profile.browserType.launch({ headless: true })
  const errors = []
  const warnings = []
  try {
    const context = await browser.newContext({
      ...profile.device,
      storageState: path.resolve(storageState),
      serviceWorkers: 'block',
      ignoreHTTPSErrors: true,
    })
    const page = await context.newPage()
    page.on('pageerror', error => {
      if (/finish_shadow_pin_activity_session due to access control checks/i.test(error.message)) {
        warnings.push(`pageerror: ${error.message}`)
        return
      }
      errors.push(`pageerror: ${error.message}`)
    })
    page.on('console', message => {
      if (message.type() !== 'error') return
      if (/Failed to load resource: the server responded with a status of 404/i.test(message.text())) {
        warnings.push(`console: ${message.text()}`)
        return
      }
      errors.push(`console: ${message.text()}`)
    })

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => (document.body?.innerText || '').trim().length > 30)
    await dismissTransientDialogs(page)
    await openComfortSettings(page)

    await page.getByRole('button', { name: /High visibility/ }).click()
    await page.waitForFunction(() => document.documentElement.dataset.comfortPreset === 'high-visibility')

    const highVisibility = await page.evaluate(() => {
      const root = document.documentElement
      const panel = document.querySelector('.glass-panel')
      const sharedButton = document.querySelector('.comfort-button')
      const panelStyle = panel ? getComputedStyle(panel) : null
      const buttonBox = sharedButton?.getBoundingClientRect()
      return {
        preset: root.dataset.comfortPreset,
        motion: root.dataset.comfortMotion,
        transparency: root.dataset.comfortTransparency,
        contrast: root.dataset.comfortContrast,
        textScale: root.dataset.comfortTextScale,
        touchTarget: root.dataset.comfortTouchTarget,
        rootFontSize: getComputedStyle(root).fontSize,
        panelBackdrop: panelStyle?.backdropFilter || panelStyle?.webkitBackdropFilter || 'none',
        sharedButtonHeight: buttonBox?.height || 0,
      }
    })
    ensure(highVisibility.preset === 'high-visibility', `${profile.name}: profile did not apply`)
    ensure(highVisibility.transparency === 'solid', `${profile.name}: solid surfaces did not apply`)
    ensure(highVisibility.contrast === 'high', `${profile.name}: high contrast did not apply`)
    ensure(highVisibility.touchTarget === 'large', `${profile.name}: large touch targets did not apply`)
    ensure(highVisibility.sharedButtonHeight >= 48, `${profile.name}: shared button is below 48px`)
    ensure(highVisibility.panelBackdrop === 'none', `${profile.name}: glass blur remained active`)
    await assertNoHorizontalOverflow(page, `${profile.name} high visibility`)

    await page.getByLabel('Text size').selectOption('130')
    await page.getByLabel('Message spacing').selectOption('spacious')
    await page.getByLabel('Media playback').selectOption('never')
    await page.getByLabel('Motion').selectOption('none')
    await page.waitForFunction(() => (
      document.documentElement.dataset.comfortTextScale === '130'
      && document.documentElement.dataset.comfortAutoplay === 'never'
      && document.documentElement.dataset.comfortMotion === 'none'
    ))
    await assertNoHorizontalOverflow(page, `${profile.name} custom largest text`)

    await page.keyboard.press('Tab')
    const focusProof = await page.evaluate(() => {
      const active = document.activeElement
      if (!(active instanceof HTMLElement)) return null
      const style = getComputedStyle(active)
      return {
        tag: active.tagName,
        label: active.getAttribute('aria-label') || active.innerText.slice(0, 60),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
      }
    })
    ensure(focusProof && focusProof.outlineStyle !== 'none', `${profile.name}: keyboard focus is not visible`)

    await page.screenshot({
      path: path.join(outputDir, `${profile.name}-comfort-custom.png`),
      fullPage: false,
    })

    const hapticsSwitch = page.getByRole('switch', { name: /Haptics/ })
    await hapticsSwitch.scrollIntoViewIfNeeded()
    const hapticsBox = await hapticsSwitch.boundingBox()
    const comfortNavBox = await page.locator('nav.shadowchat-mobile-nav').boundingBox()
    ensure(
      hapticsBox && comfortNavBox && hapticsBox.y + hapticsBox.height <= comfortNavBox.y + 1,
      `${profile.name}: final comfort control is covered by the mobile navigation`
    )
    const hapticsBefore = await hapticsSwitch.getAttribute('aria-checked')
    await hapticsSwitch.click()
    ensure(
      await hapticsSwitch.getAttribute('aria-checked') !== hapticsBefore,
      `${profile.name}: reachable Haptics control did not toggle`
    )
    await hapticsSwitch.click()

    const surfaceGeometry = {}
    const mobileNav = page.locator('nav.shadowchat-mobile-nav')
    for (const surface of ['Chat', 'DMs', 'Activity', 'Pins']) {
      const target = mobileNav.getByRole('button', { name: new RegExp(`^${surface}`) }).first()
      ensure(await target.isVisible().catch(() => false), `${profile.name}: ${surface} navigation is unavailable`)
      await target.click()
      await page.waitForTimeout(500)
      surfaceGeometry[surface] = await assertNoHorizontalOverflow(
        page,
        `${profile.name} ${surface} at 130% text`
      )
    }

    await page.reload({ waitUntil: 'domcontentloaded' })
    await dismissTransientDialogs(page)
    const bootstrap = await page.evaluate(() => window.__shadowchatComfortBootstrap)
    ensure(bootstrap?.effective?.textScale === 130, `${profile.name}: bootstrap lost text scale`)
    ensure(bootstrap?.effective?.autoplay === 'never', `${profile.name}: bootstrap lost autoplay policy`)
    ensure(bootstrap?.effective?.motion === 'none', `${profile.name}: bootstrap lost motion policy`)
    ensure(
      bootstrap?.attributes?.['data-comfort-transparency'] === 'solid',
      `${profile.name}: bootstrap lost solid surfaces`
    )

    await openComfortSettings(page)
    await assertNoHorizontalOverflow(page, `${profile.name} persisted reload`)
    const headerTitle = page.locator('header').getByText('Comfort', { exact: true })
    const headerReset = page.getByRole('button', { name: 'Reset comfort settings' })
    ensure(await headerTitle.isVisible(), `${profile.name}: persisted Comfort header title is missing`)
    ensure(await headerReset.isVisible(), `${profile.name}: persisted header reset is unavailable`)
    await page.screenshot({
      path: path.join(outputDir, `${profile.name}-comfort-persisted.png`),
      fullPage: false,
    })

    await headerReset.click()
    await page.waitForFunction(() => document.documentElement.dataset.comfortPreset === 'follow-device')
    ensure(
      await page.getByLabel('Text size').inputValue() === '100',
      `${profile.name}: fixed header reset did not recover standard text size`
    )

    ensure(errors.length === 0, `${profile.name}: browser errors: ${errors.join(' | ')}`)
    results.push({ profile: profile.name, highVisibility, focusProof, surfaceGeometry, bootstrap: bootstrap.attributes, warnings })
    await context.close()
  } finally {
    await browser.close()
  }
}

console.log(JSON.stringify({ ok: true, baseUrl, outputDir, results }, null, 2))

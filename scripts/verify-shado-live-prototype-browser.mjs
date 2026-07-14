import { readFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices, webkit } from 'playwright'

const repoRoot = process.cwd()
const artifactDir = path.join(repoRoot, 'output', 'playwright', 'shado-live-prototype')

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
const baseUrl = String(args.baseUrl || env.PLAYWRIGHT_BASE_URL || '').replace(/\/$/u, '')
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const supabaseAnonKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
const email = env.PLAYWRIGHT_ACCOUNT_1_EMAIL || env.PLAYWRIGHT_ACCOUNT1_EMAIL
const password = env.PLAYWRIGHT_ACCOUNT_1_PASSWORD || env.PLAYWRIGHT_ACCOUNT1_PASSWORD

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}

must(baseUrl, '--base-url or PLAYWRIGHT_BASE_URL is required.')
must(supabaseUrl && supabaseAnonKey, 'Supabase URL and browser-safe anon key are required.')
must(email && password, 'A controlled PLAYWRIGHT_ACCOUNT_1 account is required.')

const origin = new URL(baseUrl)
must(['http:', 'https:'].includes(origin.protocol), 'The base URL must be HTTP(S).')
must(!origin.username && !origin.password && !origin.search && !origin.hash, 'The base URL must be a credential-free origin.')
const projectRef = new URL(supabaseUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/iu)?.[1]
must(projectRef, 'A hosted Supabase project is required for controlled authentication.')
if (env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF) {
  must(projectRef === env.PLAYWRIGHT_EXPECTED_SUPABASE_PROJECT_REF, `Refusing unexpected Supabase project ${projectRef}.`)
}

const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const auth = await client.auth.signInWithPassword({ email, password })
if (auth.error) throw auth.error
must(auth.data.session, 'The controlled account did not return a session.')

await rm(artifactDir, { recursive: true, force: true })
await mkdir(artifactDir, { recursive: true })

const profiles = [
  {
    name: 'compact-chromium',
    engine: chromium,
    device: {
      viewport: { width: 320, height: 568 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: devices['Pixel 7'].userAgent,
    },
    textScale: 1.3,
  },
  { name: 'pixel-chromium', engine: chromium, device: devices['Pixel 7'] },
  { name: 'iphone-webkit', engine: webkit, device: devices['iPhone 13'] },
  {
    name: 'desktop-chromium',
    engine: chromium,
    device: { viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 },
  },
]

const results = []

for (const profile of profiles) {
  const browser = await profile.engine.launch({ headless: true })
  const context = await browser.newContext({ ...profile.device, serviceWorkers: 'block' })
  await context.addInitScript(({ storageKey, session }) => {
    localStorage.setItem(storageKey, JSON.stringify(session))
    localStorage.setItem(`shadowchat:phone-install-onboarding:seen:v2:${session.user.id}`, new Date().toISOString())
    window.__shadoLiveMediaCalls = []
    const mediaDevices = navigator.mediaDevices || {}
    Object.defineProperty(mediaDevices, 'getUserMedia', {
      configurable: true,
      value: constraints => {
        window.__shadoLiveMediaCalls.push(constraints)
        return Promise.reject(new DOMException('Prototype media access blocked by QA.', 'NotAllowedError'))
      },
    })
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices })
    }
  }, {
    storageKey: `sb-${projectRef}-auth-token`,
    session: auth.data.session,
  })

  const page = await context.newPage()
  const diagnostics = { consoleErrors: [], pageErrors: [], requestFailures: [], errorResponses: [] }
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
    await page.goto(`${baseUrl}/?view=games`, { waitUntil: 'domcontentloaded' })
    if (profile.textScale) {
      await page.evaluate(textScale => {
        document.documentElement.style.fontSize = `${textScale * 100}%`
      }, profile.textScale)
    }

    const pickerButton = page.getByRole('button', { name: 'Open Shado Live prototype' })
    const promptDeadline = Date.now() + 20_000
    while (Date.now() < promptDeadline && !(await pickerButton.isVisible().catch(() => false))) {
      const dismiss = page.getByRole('button', { name: /^(Skip for Now|Done|Got It|Later|Not now)$/iu }).first()
      if (await dismiss.isVisible().catch(() => false)) await dismiss.click({ force: true })
      await page.waitForTimeout(250)
    }

    await pickerButton.waitFor({ timeout: 20_000 })
    const pickerImage = pickerButton.getByRole('img', { name: 'Shado Live' })
    await pickerImage.waitFor()
    const pickerGeometry = await pickerButton.evaluate((button, image) => {
      const buttonRect = button.getBoundingClientRect()
      const banner = image instanceof HTMLImageElement ? image : null
      return {
        viewportWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        width: buttonRect.width,
        height: buttonRect.height,
        imageComplete: Boolean(banner?.complete),
        naturalWidth: banner?.naturalWidth ?? 0,
        naturalHeight: banner?.naturalHeight ?? 0,
      }
    }, await pickerImage.elementHandle())
    must(pickerGeometry.scrollWidth <= pickerGeometry.viewportWidth + 1, `${profile.name} picker has horizontal overflow.`)
    must(pickerGeometry.imageComplete && pickerGeometry.naturalWidth === 1920 && pickerGeometry.naturalHeight === 720, `${profile.name} did not load the Shado Live banner.`)
    await page.waitForFunction(() => {
      const picker = document.querySelector('button[aria-label="Open Shado Live prototype"]')
      const surface = picker?.closest('.theme-app-surface')
      return Boolean(surface && Number.parseFloat(getComputedStyle(surface).opacity || '1') >= 0.99)
    })
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-picker.png`), fullPage: true })
    await pickerButton.click()

    const shadoLiveHeading = page.getByRole('heading', { name: 'Shado Live', level: 1 })
    await shadoLiveHeading.waitFor({ timeout: 20_000 })
    must(new URL(page.url()).searchParams.get('experience') === 'shado-live', `${profile.name} did not preserve the Shado Live route.`)
    await page.getByText(/No microphone, camera, broadcast, upload, message, or room is started/iu).waitFor()

    const lobbyGeometry = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      enterVisible: (() => {
        const button = Array.from(document.querySelectorAll('button')).find(element => element.textContent?.includes('Enter interactive preview'))
        if (!button) return false
        const rect = button.getBoundingClientRect()
        return rect.top >= 0 && rect.bottom <= window.innerHeight
      })(),
    }))
    must(lobbyGeometry.scrollWidth <= lobbyGeometry.viewportWidth + 1, `${profile.name} lobby has horizontal overflow.`)
    if (profile.name !== 'compact-chromium') {
      must(lobbyGeometry.enterVisible, `${profile.name} lobby entry action is not visible without scrolling.`)
    }
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-lobby.png`), fullPage: true })

    await page.getByRole('button', { name: 'Enter interactive preview' }).click()
    await page.getByTestId('shado-live-stage').waitFor()
    const leaveButton = page.getByRole('button', { name: 'Leave Shado Live preview' })
    await leaveButton.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Leave Shado Live preview')

    await page.getByRole('button', { name: 'Microphone preview' }).click()
    await page.getByRole('button', { name: 'Camera preview' }).click()
    await page.getByRole('button', { name: 'Raise hand' }).click()
    must(await page.getByRole('button', { name: 'Lower hand' }).getAttribute('aria-pressed') === 'true', `${profile.name} hand state is not accessible.`)
    must((await page.evaluate(() => window.__shadoLiveMediaCalls.length)) === 0, `${profile.name} requested media permission.`)

    const roomTab = page.getByRole('tab', { name: 'Room' })
    await roomTab.click()
    must(await roomTab.getAttribute('aria-controls') === 'shado-live-panel-room', `${profile.name} Room tab is not wired to its panel.`)
    must(await page.getByRole('tabpanel').getAttribute('aria-labelledby') === 'shado-live-tab-room', `${profile.name} Room panel is not labelled by its tab.`)
    await roomTab.press('ArrowRight')
    const safetyTab = page.getByRole('tab', { name: 'Safety' })
    must(await safetyTab.getAttribute('aria-selected') === 'true', `${profile.name} roving tabs did not select Safety.`)
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-panel') === 'safety')
    await page.getByTestId('shado-live-safety-panel').getByText(/reporting is paused/iu).waitFor()

    await roomTab.click()
    const reconnectButton = page.getByRole('button', { name: 'Reconnect' })
    await reconnectButton.focus()
    await reconnectButton.click()
    await page.getByRole('dialog', { name: 'Reconnecting to the room' }).waitFor()
    const retryButton = page.getByRole('button', { name: 'Retry preview' })
    await page.waitForFunction(() => document.activeElement?.textContent?.includes('Retry preview'))
    await retryButton.press('Escape')
    await page.getByRole('dialog', { name: 'Reconnecting to the room' }).waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.activeElement?.textContent?.includes('Reconnect'))

    await page.getByRole('tab', { name: 'Chat' }).click()
    const composer = page.getByRole('textbox', { name: 'Preview a chat message' })
    await composer.fill(`Local ${profile.name} message`)
    await page.getByRole('button', { name: 'Add message to local preview' }).click()
    const localMessage = page.getByText(`Local ${profile.name} message`)
    await localMessage.waitFor()
    await page.waitForFunction(() => document.activeElement === document.querySelector('textarea'))

    const stageGeometry = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      activeElementVisible: (() => {
        if (!(document.activeElement instanceof HTMLElement)) return false
        const rect = document.activeElement.getBoundingClientRect()
        const viewport = window.visualViewport
        const bottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)
        return rect.top >= (viewport?.offsetTop ?? 0) && rect.bottom <= bottom
      })(),
      layoutSeparated: (() => {
        const stage = document.querySelector('[data-testid="shado-live-stage-visual"]')?.getBoundingClientRect()
        const panel = document.querySelector('[data-testid="shado-live-panel"]')?.getBoundingClientRect()
        if (!stage || !panel) return false
        return window.matchMedia('(min-width: 1024px)').matches
          ? stage.right <= panel.left + 1
          : stage.bottom <= panel.top + 1
      })(),
      messageVisible: (() => {
        const message = Array.from(document.querySelectorAll('p')).find(element => element.textContent?.startsWith('Local '))?.getBoundingClientRect()
        const composerBox = document.querySelector('[data-testid="shado-live-composer"]')?.getBoundingClientRect()
        return Boolean(message && composerBox && message.bottom <= composerBox.top + 1)
      })(),
    }))
    must(stageGeometry.scrollWidth <= stageGeometry.viewportWidth + 1, `${profile.name} stage has horizontal overflow.`)
    must(stageGeometry.activeElementVisible, `${profile.name} active stage control is outside the viewport.`)
    must(stageGeometry.layoutSeparated, `${profile.name} room panel overlaps the stage.`)
    must(stageGeometry.messageVisible, `${profile.name} local message is hidden behind the composer.`)

    let keyboardGeometry = null
    if (profile.device.isMobile) {
      const keyboardInset = Math.min(240, Math.round(profile.device.viewport.height * 0.42))
      await page.waitForTimeout(400)
      await page.evaluate(inset => {
        const root = document.documentElement
        root.dataset.shadowchatKeyboard = 'open'
        root.dataset.shadowchatMobilePlatform = 'ios'
        root.style.setProperty('--shadowchat-mobile-scroll-keyboard-inset', `${inset}px`)
      }, keyboardInset)
      await page.waitForFunction(inset => {
        const composerBox = document.querySelector('[data-testid="shado-live-composer"]')?.getBoundingClientRect()
        const stageSurface = document.querySelector('.shado-live-stage-visual')
        const dock = document.querySelector('.shado-live-control-dock')
        if (!composerBox || !stageSurface || !dock) return false
        const keyboardTop = window.innerHeight - inset
        return composerBox.bottom <= keyboardTop + 1
          && getComputedStyle(stageSurface).opacity === '0'
          && getComputedStyle(dock).opacity === '0'
      }, keyboardInset, { timeout: 2_000 })
      keyboardGeometry = await page.evaluate(inset => {
        const composerBox = document.querySelector('[data-testid="shado-live-composer"]')?.getBoundingClientRect()
        const stageSurface = document.querySelector('.shado-live-stage-visual')
        const dock = document.querySelector('.shado-live-control-dock')
        const stageBox = stageSurface?.getBoundingClientRect()
        const dockBox = dock?.getBoundingClientRect()
        const keyboardTop = window.innerHeight - inset
        return {
          composerBottom: composerBox?.bottom ?? Infinity,
          keyboardTop,
          composerGap: keyboardTop - (composerBox?.bottom ?? 0),
          stageCollapsed: !stageBox || stageBox.height <= 1 || getComputedStyle(stageSurface).opacity === '0',
          controlsCollapsed: !dockBox || dockBox.height <= 1 || getComputedStyle(dock).opacity === '0',
        }
      }, keyboardInset)
      must(keyboardGeometry.composerBottom <= keyboardGeometry.keyboardTop + 1, `${profile.name} composer is behind the simulated keyboard: ${JSON.stringify(keyboardGeometry)}`)
      must(keyboardGeometry.composerGap >= -1 && keyboardGeometry.composerGap <= 24, `${profile.name} leaves an excessive keyboard/composer gap: ${JSON.stringify(keyboardGeometry)}`)
      must(keyboardGeometry.stageCollapsed && keyboardGeometry.controlsCollapsed, `${profile.name} did not reserve the keyboard viewport for chat: ${JSON.stringify(keyboardGeometry)}`)
      await page.screenshot({ path: path.join(artifactDir, `${profile.name}-keyboard.png`), fullPage: true })
      await page.evaluate(() => {
        const root = document.documentElement
        root.dataset.shadowchatKeyboard = 'closed'
        root.style.setProperty('--shadowchat-mobile-scroll-keyboard-inset', '0px')
      })
      await page.waitForTimeout(120)
    }

    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-stage.png`), fullPage: true })
    await leaveButton.click()
    await page.waitForFunction(() => document.activeElement?.textContent?.includes('Enter interactive preview'))

    must(diagnostics.consoleErrors.length === 0, `${profile.name} console errors: ${JSON.stringify(diagnostics.consoleErrors)}`)
    must(diagnostics.pageErrors.length === 0, `${profile.name} page errors: ${JSON.stringify(diagnostics.pageErrors)}`)
    must(diagnostics.requestFailures.length === 0, `${profile.name} request failures: ${JSON.stringify(diagnostics.requestFailures)}`)
    must(diagnostics.errorResponses.length === 0, `${profile.name} error responses: ${JSON.stringify(diagnostics.errorResponses)}`)

    results.push({ profile: profile.name, passed: true, pickerGeometry, lobbyGeometry, stageGeometry, keyboardGeometry, diagnostics, mediaPermissionCalls: 0 })
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, `${profile.name}-failure.png`), fullPage: true }).catch(() => undefined)
    results.push({ profile: profile.name, passed: false, error: error instanceof Error ? error.message : String(error), diagnostics })
  } finally {
    await context.close()
    await browser.close()
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  baseUrl,
  supabaseProjectRef: projectRef,
  passed: results.every(result => result.passed),
  residue: 'No fixtures, rows, uploads, notifications, media streams, or provider sessions created.',
  results,
}
await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')

must(summary.passed, `Shado Live prototype browser proof failed: ${path.join(artifactDir, 'summary.json')}`)
console.log(`Shado Live prototype browser proof passed: ${path.join(artifactDir, 'summary.json')}`)

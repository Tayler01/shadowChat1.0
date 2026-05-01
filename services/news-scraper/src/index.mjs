import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const EASTERN_TIME_ZONE = 'America/New_York'
const DEFAULT_INTERVAL_MS = 90_000
const DEFAULT_SETTLE_MS = 8_000
const DEFAULT_X_SCROLL_STEPS = 1
const DEFAULT_X_SCROLL_SETTLE_MS = 1_500
const DEFAULT_X_MAX_CANDIDATES = 12
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const cleanHandle = value => String(value || '').trim().replace(/^@+\s*/, '').trim()

const getArgValue = name => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const getEasternDay = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

const stripHtml = html =>
  String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()

const isTimelineChromeLine = (line, authorHandle, authorDisplayName) => {
  const value = String(line || '').trim()
  const lowered = value.toLowerCase()
  const handle = cleanHandle(authorHandle).toLowerCase()
  const display = String(authorDisplayName || '').trim().toLowerCase()

  return (
    !value ||
    value === '·' ||
    lowered === 'pinned' ||
    lowered === 'quote' ||
    lowered === 'show more' ||
    lowered === 'show this thread' ||
    lowered === 'follow' ||
    lowered === handle ||
    lowered === `@${handle}` ||
    (display && lowered === display) ||
    /^@?[a-z0-9_.-]{1,32}$/i.test(value) ||
    /^\d+[smhd]$/i.test(value) ||
    /^\d+[,.]?\d*[kmb]?$/i.test(value) ||
    /^\d+[,.]?\d*[kmb]?\s+(views|replies|reposts|likes)$/i.test(value) ||
    /^(replying to|reposted|quoted)$/i.test(value)
  )
}

const cleanPostText = (text, authorHandle, authorDisplayName) => {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !isTimelineChromeLine(line, authorHandle, authorDisplayName))

  return lines.join('\n').trim() || String(text || '').replace(/\s+/g, ' ').trim()
}

const isTruthChromeLine = (line, authorHandle, authorDisplayName) => {
  const value = String(line || '').trim()
  const lowered = value.toLowerCase()
  const handle = cleanHandle(authorHandle).toLowerCase()
  const display = String(authorDisplayName || '').trim().toLowerCase()

  return (
    !value ||
    lowered === handle ||
    lowered === `@${handle}` ||
    (display && lowered === display) ||
    lowered === 'truth' ||
    lowered === 'retruth' ||
    lowered === 'show more' ||
    lowered === 'show thread' ||
    lowered === 'follow' ||
    /^\d+[smhd]$/i.test(value) ||
    /^\d+[,.]?\d*[kmb]?$/i.test(value) ||
    /^\d+[,.]?\d*[kmb]?\s+(replies|retruths|likes|views)$/i.test(value)
  )
}

const cleanTruthText = (text, authorHandle, authorDisplayName) => {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !isTruthChromeLine(line, authorHandle, authorDisplayName))

  return lines.join('\n').trim() || String(text || '').replace(/\s+/g, ' ').trim()
}

const firstMeaningfulLine = text => {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)

  return (lines[0] || String(text || '').replace(/\s+/g, ' ').trim() || 'New post').slice(0, 180)
}

const toSortableId = value => {
  try {
    return BigInt(String(value || '').replace(/\D/g, ''))
  } catch {
    return null
  }
}

const compareSnapshotsDesc = (left, right) => {
  const leftId = toSortableId(left.externalId)
  const rightId = toSortableId(right.externalId)

  if (leftId !== null && rightId !== null && leftId !== rightId) {
    return leftId > rightId ? -1 : 1
  }

  const leftDate = left.postedAt ? Date.parse(left.postedAt) : 0
  const rightDate = right.postedAt ? Date.parse(right.postedAt) : 0
  return rightDate - leftDate
}

const belongsOnTodayBoard = snapshot => {
  if (!snapshot.postedAt) return true
  const postedAt = new Date(snapshot.postedAt)
  if (Number.isNaN(postedAt.getTime())) return true
  return getEasternDay(postedAt) === getEasternDay()
}

const uniqueSnapshots = snapshots => {
  const seen = new Set()
  return snapshots.filter(snapshot => {
    const key = `${snapshot.platform}:${snapshot.externalId}`
    if (!snapshot?.externalId || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const filterXTimelineCandidates = (items, handle) => {
  const candidates = Array.isArray(items) ? items.filter(item => item?.externalId && item?.sourceUrl) : []
  const nonPinned = candidates.filter(item => !item.isPinned)

  if (nonPinned.length) {
    return nonPinned
  }

  if (candidates.some(item => item.isPinned)) {
    const pinnedIds = candidates
      .filter(item => item.isPinned)
      .map(item => item.externalId)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')
    throw new Error(`Only pinned X posts could be extracted for @${handle}${pinnedIds ? ` (${pinnedIds})` : ''}`)
  }

  return candidates
}

export const selectSnapshotsToStore = (source, snapshots) => {
  const sorted = uniqueSnapshots(snapshots).sort(compareSnapshotsDesc)
  const latest = sorted[0] || null
  const cursor = toSortableId(source.last_seen_external_id)

  if (!latest) {
    return { latest: null, cursorSnapshot: null, toStore: [], staleCursor: false }
  }

  if (cursor === null) {
    return {
      latest,
      cursorSnapshot: latest,
      toStore: belongsOnTodayBoard(latest) ? [latest] : [],
      staleCursor: false,
    }
  }

  const newerSnapshots = sorted.filter(snapshot => {
    const snapshotId = toSortableId(snapshot.externalId)
    return snapshotId !== null && snapshotId > cursor
  })

  const latestId = toSortableId(latest.externalId)
  const cursorSnapshot = newerSnapshots[0] || (latestId !== null && latestId === cursor ? latest : null)
  const toStore = newerSnapshots
    .filter(snapshot => belongsOnTodayBoard(snapshot))
    .sort((left, right) => compareSnapshotsDesc(right, left))

  return { latest, cursorSnapshot, toStore, staleCursor: !cursorSnapshot }
}

const uniqueMedia = media => {
  const seen = new Set()
  return media.filter(item => {
    if (!item?.url || seen.has(item.url)) return false
    seen.add(item.url)
    return true
  })
}

const makeSnapshot = snapshot => {
  const authorHandle = cleanHandle(snapshot.authorHandle)
  const authorDisplayName = snapshot.authorDisplayName || authorHandle
  const bodyText = cleanPostText(snapshot.bodyText, authorHandle, authorDisplayName)

  return {
    platform: snapshot.platform,
    externalId: String(snapshot.externalId),
    postKind: snapshot.postKind || 'post',
    authorHandle,
    authorDisplayName,
    authorAvatarUrl: snapshot.authorAvatarUrl || null,
    headline: firstMeaningfulLine(bodyText),
    bodyText,
    sourceUrl: snapshot.sourceUrl,
    media: uniqueMedia(snapshot.media || []),
    metrics: snapshot.metrics || {},
    raw: snapshot.raw || {},
    postedAt: snapshot.postedAt || null,
  }
}

const launchBrowser = async () => {
  if (process.env.PINCHTAB_CDP_URL) {
    return chromium.connectOverCDP(process.env.PINCHTAB_CDP_URL)
  }

  if (process.env.PINCHTAB_WS_ENDPOINT) {
    return chromium.connect(process.env.PINCHTAB_WS_ENDPOINT)
  }

  return chromium.launch({
    headless: process.env.NEWS_SCRAPE_HEADLESS !== 'false',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-first-run',
      '--no-sandbox',
    ],
  })
}

const newContext = browser =>
  browser.newContext({
    viewport: { width: 1365, height: 900 },
    userAgent: USER_AGENT,
    locale: 'en-US',
  })

const newXContext = browser => {
  const options = {
    viewport: { width: 1365, height: 900 },
    userAgent: USER_AGENT,
    locale: 'en-US',
  }

  if (hasXAuthState()) {
    options.storageState = getXAuthStatePath()
  } else {
    const cookieStorageState = buildXCookieStorageState()
    if (cookieStorageState) {
      options.storageState = cookieStorageState
    }
  }

  return browser.newContext(options)
}

const getTruthAuthStatePath = () => {
  const configured = process.env.NEWS_TRUTH_AUTH_STATE_PATH
  if (configured) return configured
  return path.resolve(process.cwd(), '.news-scraper', 'truth-auth-state.json')
}

const hasTruthAuthState = () => existsSync(getTruthAuthStatePath())

const saveTruthAuthState = async context => {
  const authStatePath = getTruthAuthStatePath()
  await mkdir(path.dirname(authStatePath), { recursive: true })
  await context.storageState({ path: authStatePath })
}

const newTruthContext = browser => {
  const options = {
    viewport: { width: 1365, height: 900 },
    userAgent: USER_AGENT,
    locale: 'en-US',
  }

  if (hasTruthAuthState()) {
    options.storageState = getTruthAuthStatePath()
  } else {
    const cookieStorageState = buildTruthCookieStorageState()
    if (cookieStorageState) {
      options.storageState = cookieStorageState
    }
  }

  return browser.newContext(options)
}

const getTruthCredentials = () => {
  const username = process.env.TRUTH_USERNAME || process.env.TRUTH_EMAIL
  const password = process.env.TRUTH_PASSWORD
  return username && password ? { username, password } : null
}

const hasSeededTruthCookieSession = () => Boolean(
  process.env.NEWS_TRUTH_COOKIE_HEADER ||
  process.env.TRUTH_COOKIE_HEADER
)

const getXCredentials = () => {
  const username = process.env.X_USERNAME || process.env.X_EMAIL
  const password = process.env.X_PASSWORD
  return username && password ? { username, password } : null
}

const getXSecondaryIdentifier = () =>
  process.env.X_SECONDARY_IDENTIFIER || process.env.X_EMAIL || process.env.X_USERNAME || null

const hasSeededXCookieSession = () => Boolean(
  process.env.NEWS_X_COOKIE_HEADER ||
  process.env.X_COOKIE_HEADER ||
  process.env.X_AUTH_TOKEN ||
  process.env.X_CT0
)

const parseCookieHeader = header =>
  String(header || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [name, ...valueParts] = part.split('=')
      return {
        name: name?.trim(),
        value: valueParts.join('=').trim(),
      }
    })
    .filter(cookie => cookie.name && cookie.value)

const buildCookieStorageState = (rawCookies, domains, httpOnlyNames = new Set()) => {
  const uniqueCookies = new Map()
  for (const cookie of rawCookies.filter(Boolean)) {
    uniqueCookies.set(cookie.name, cookie)
  }

  const cookies = [...uniqueCookies.values()].flatMap(cookie =>
    domains.map(domain => ({
      ...cookie,
      domain,
      path: '/',
      httpOnly: httpOnlyNames.has(cookie.name),
      secure: true,
      sameSite: 'Lax',
    }))
  )

  return cookies.length ? { cookies, origins: [] } : null
}

const buildXCookieStorageState = () =>
  buildCookieStorageState(
    [
      ...parseCookieHeader(process.env.NEWS_X_COOKIE_HEADER || process.env.X_COOKIE_HEADER),
      process.env.X_AUTH_TOKEN ? { name: 'auth_token', value: process.env.X_AUTH_TOKEN } : null,
      process.env.X_CT0 ? { name: 'ct0', value: process.env.X_CT0 } : null,
    ],
    ['.x.com', '.twitter.com'],
    new Set(['auth_token'])
  )

const buildTruthCookieStorageState = () =>
  buildCookieStorageState(
    parseCookieHeader(process.env.NEWS_TRUTH_COOKIE_HEADER || process.env.TRUTH_COOKIE_HEADER),
    ['.truthsocial.com', 'truthsocial.com']
  )

const getPageText = async page =>
  (await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '')).replace(/\s+/g, ' ').trim()

const clickXNext = async (page, input) => {
  await page.getByRole('button', { name: /^next$/i }).last().click({ force: true, timeout: 5_000 }).catch(async () => {
    await input.press('Enter')
  })
}

const clickXLoginShell = async page => {
  const loginName = /^(log in|sign in)$/i
  for (const locator of [
    page.getByRole('link', { name: loginName }).last(),
    page.getByRole('button', { name: loginName }).last(),
    page.locator('a[href="/login"], a[href="/i/flow/login"]').last(),
  ]) {
    if (await locator.isVisible().catch(() => false)) {
      await locator.click({ force: true, timeout: 5_000 }).catch(() => {})
      await page.waitForTimeout(2_000)
      return true
    }
  }
  return false
}

const findXTextInput = page =>
  page
    .locator('input[data-testid="ocfEnterTextTextInput"], input[autocomplete="username"], input[name="text"], input[type="text"]')
    .first()

const findXPasswordInput = page =>
  page.locator('input[name="password"], input[type="password"]').first()

const getXAuthStatePath = () => {
  const configured = process.env.NEWS_X_AUTH_STATE_PATH
  if (configured) return configured
  return path.resolve(process.cwd(), '.news-scraper', 'x-auth-state.json')
}

const hasXAuthState = () => existsSync(getXAuthStatePath())

const saveXAuthState = async context => {
  const authStatePath = getXAuthStatePath()
  await mkdir(path.dirname(authStatePath), { recursive: true })
  await context.storageState({ path: authStatePath })
}

const isSignedInToX = async page => {
  if (/\/i\/flow\/login/i.test(page.url())) return false
  const onHome = /^https:\/\/x\.com\/home(?:[/?#]|$)/i.test(page.url())
  const composeVisible = await page
    .locator('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"], a[aria-label*="Post"]')
    .first()
    .isVisible({ timeout: 2_000 })
    .catch(() => false)
  const loginVisible = await page
    .locator('a[href="/login"], a[href="/i/flow/login"], input[autocomplete="username"], input[name="password"]')
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false)

  return composeVisible || (onHome && !loginVisible)
}

const maybeSignInX = async context => {
  const credentials = getXCredentials()

  const page = await context.newPage()
  try {
    if (hasXAuthState() || hasSeededXCookieSession()) {
      await page.goto('https://x.com/home', {
        waitUntil: 'domcontentloaded',
        timeout: 35_000,
      }).catch(() => {})
      await page.waitForTimeout(2_000)
      if (await isSignedInToX(page)) {
        await saveXAuthState(context).catch(() => {})
        return true
      }
      if (hasSeededXCookieSession() && !credentials) {
        const text = await getPageText(page)
        throw new Error(`X cookie session was provided but was not accepted by X. Refresh X_AUTH_TOKEN/X_CT0 or NEWS_X_COOKIE_HEADER from a signed-in browser. url=${page.url()} text=${text.slice(0, 220)}`)
      }
    }

    if (!credentials) return false

    await page.goto('https://x.com/i/flow/login', {
      waitUntil: 'domcontentloaded',
      timeout: 35_000,
    })
    await page.waitForTimeout(2_000)

    let usernameInput = findXTextInput(page)

    if (!(await usernameInput.isVisible().catch(() => false))) {
      await page.goto('https://x.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 35_000,
      }).catch(() => {})
      await page.waitForTimeout(2_000)
      usernameInput = findXTextInput(page)
    }

    if (!(await usernameInput.isVisible().catch(() => false))) {
      await clickXLoginShell(page)
      usernameInput = findXTextInput(page)
    }

    if (!(await usernameInput.isVisible().catch(() => false))) {
      const text = await getPageText(page)
      throw new Error(`X credentials are configured, but the login form was not found. url=${page.url()} text=${text.slice(0, 220)}`)
    }

    const secondaryIdentifier = getXSecondaryIdentifier()
    const identityAttempts = [
      credentials.username,
      secondaryIdentifier,
    ].filter((value, index, values) => value && values.indexOf(value) === index)
    let passwordInput = findXPasswordInput(page)

    for (const identity of identityAttempts) {
      if (await passwordInput.isVisible().catch(() => false)) break
      const identityInput = findXTextInput(page)
      if (!(await identityInput.isVisible().catch(() => false))) {
        await clickXLoginShell(page)
      }
      const visibleInput = findXTextInput(page)
      if (await visibleInput.isVisible().catch(() => false)) {
        await visibleInput.fill(identity)
        await clickXNext(page, visibleInput)
      }
      await page.waitForTimeout(2_000)
      passwordInput = findXPasswordInput(page)
    }

    if (!(await passwordInput.isVisible().catch(() => false))) {
      const verificationInput = findXTextInput(page)
      if (secondaryIdentifier && await verificationInput.isVisible().catch(() => false)) {
        await verificationInput.fill(secondaryIdentifier)
        await clickXNext(page, verificationInput)
        await page.waitForTimeout(2_000)
        passwordInput = findXPasswordInput(page)
      }
    }

    if (!(await passwordInput.isVisible().catch(() => false))) {
      const text = await getPageText(page)
      throw new Error(`X password step was not found. Confirm X_USERNAME is accepted by X and X_EMAIL or X_SECONDARY_IDENTIFIER matches the account challenge. url=${page.url()} text=${text.slice(0, 260)}`)
    }

    await passwordInput.fill(credentials.password)
    await page.getByRole('button', { name: /^(log in|sign in)$/i }).click().catch(async () => {
      await passwordInput.press('Enter')
    })
    await page.waitForTimeout(Number(process.env.NEWS_X_LOGIN_SETTLE_MS || 6_000))
    const signedIn = await isSignedInToX(page)
    if (signedIn) {
      await saveXAuthState(context)
    }
    return signedIn
  } finally {
    await page.close().catch(() => {})
  }
}

const isSignedInToTruth = async page => {
  const text = await getPageText(page)
  const loginVisible = await page
    .locator('input[name="username"], input[name="email"], input[type="email"], input[type="password"], button:has-text("Sign in"), button:has-text("Log in")')
    .first()
    .isVisible({ timeout: 1_000 })
    .catch(() => false)
  return !loginVisible && !/\b(sign in|log in|create account|join truth social)\b/i.test(text)
}

const maybeSignInTruth = async (page, context) => {
  const credentials = getTruthCredentials()

  if (hasTruthAuthState() || hasSeededTruthCookieSession()) {
    await page.goto('https://truthsocial.com/home', {
      waitUntil: 'domcontentloaded',
      timeout: 35_000,
    }).catch(() => {})
    await page.waitForTimeout(2_000)
    if (await isSignedInToTruth(page)) {
      await saveTruthAuthState(context).catch(() => {})
      return true
    }
    if (hasSeededTruthCookieSession() && !credentials) {
      const text = await getPageText(page)
      throw new Error(`Truth cookie session was provided but was not accepted. Refresh NEWS_TRUTH_COOKIE_HEADER from a signed-in browser. url=${page.url()} text=${text.slice(0, 220)}`)
    }
  }

  if (!credentials) return false

  const findLoginInputs = () => ({
    usernameInput: page
      .locator('input[name="username"], input[name="email"], input[type="email"], input[autocomplete="username"], input[aria-label="Username"], input[placeholder="Username"]')
      .first(),
    passwordInput: page
      .locator('input[name="password"], input[type="password"], input[autocomplete="current-password"], input[aria-label="Password"], input[placeholder="Password"]')
      .first(),
  })

  await page.goto('https://truthsocial.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 35_000,
  })
  await page.waitForTimeout(3_000)

  for (const cookieLabel of ['Decline All', 'Accept All', 'DECLINE ALL', 'ACCEPT ALL']) {
    const cookieButton = page.getByRole('button', { name: cookieLabel }).first()
    if (await cookieButton.isVisible().catch(() => false)) {
      await cookieButton.click().catch(() => {})
      await page.waitForTimeout(500)
      break
    }
  }

  let { usernameInput, passwordInput } = findLoginInputs()

  if (!(await usernameInput.isVisible().catch(() => false)) || !(await passwordInput.isVisible().catch(() => false))) {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], a'))
      const visibleButtons = buttons.filter(element => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      })
      const signIn = visibleButtons.reverse().find(element =>
        /^sign in$/i.test((element.textContent || element.getAttribute('aria-label') || '').trim())
      )
      if (signIn instanceof HTMLElement) signIn.click()
    })
    await page.waitForTimeout(3_000)
    ;({ usernameInput, passwordInput } = findLoginInputs())
  }

  if (!(await usernameInput.isVisible().catch(() => false)) || !(await passwordInput.isVisible().catch(() => false))) {
    const text = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '')
    throw new Error(`Truth credentials are configured, but the login form was not found. url=${page.url()} text=${text.replace(/\s+/g, ' ').slice(0, 180)}`)
  }

  await usernameInput.fill(credentials.username)
  await passwordInput.fill(credentials.password)

  const submitButton = page
    .locator('button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")')
    .first()

  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click()
  } else {
    await passwordInput.press('Enter')
  }

  await page.waitForTimeout(Number(process.env.NEWS_TRUTH_LOGIN_SETTLE_MS || 6_000))
  const signedIn = await isSignedInToTruth(page)
  if (signedIn) {
    await saveTruthAuthState(context).catch(() => {})
  }
  return signedIn
}

const scrapeX = async (browser, rawHandle, session = {}) => {
  const handle = cleanHandle(rawHandle)
  const ownsContext = !session.shared
  const context = session.xContext || await newXContext(browser)
  session.xContext = context

  if (ownsContext || !session.xLoginAttempted) {
    session.xLoginAttempted = true
    session.xSignedIn = await maybeSignInX(context)
  }

  const page = await context.newPage()

  try {
    await page.goto(`https://x.com/${encodeURIComponent(handle)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 35_000,
    })
    await page.waitForTimeout(Number(process.env.NEWS_SCRAPE_SETTLE_MS || DEFAULT_SETTLE_MS))

    const scrollSteps = Number(process.env.NEWS_X_SCROLL_STEPS || DEFAULT_X_SCROLL_STEPS)
    const scrollSettleMs = Number(process.env.NEWS_X_SCROLL_SETTLE_MS || DEFAULT_X_SCROLL_SETTLE_MS)
    for (let index = 0; index < scrollSteps; index += 1) {
      await page.mouse.wheel(0, 1600).catch(() => {})
      await page.waitForTimeout(scrollSettleMs)
    }

    const raw = await page.evaluate(({ targetHandle, signedIn, maxCandidates }) => {
      const target = String(targetHandle || '').toLowerCase()
      const toAbsolute = value => {
        try {
          return new URL(value, location.origin).toString()
        } catch {
          return null
        }
      }
      const articles = Array.from(document.querySelectorAll('article'))
      const candidates = []

      for (const article of articles) {
        const links = Array.from(article.querySelectorAll('a[href*="/status/"]'))
          .map(link => link.getAttribute('href') || '')
          .filter(Boolean)

        const statusHref = links.find(href =>
          href.toLowerCase().includes(`/${target}/status/`) &&
          !/\/(analytics|photo|video)\b/i.test(href)
        ) || links.find(href => !/\/(analytics|photo|video)\b/i.test(href)) || links[0]
        if (!statusHref) continue

        const match = statusHref.match(/\/([^/]+)\/status\/(\d+)/)
        if (!match?.[2]) continue

        const authorHandle = match[1]
        const images = Array.from(article.querySelectorAll('img'))
          .map(img => img.currentSrc || img.src)
          .filter(src => src && /pbs\.twimg\.com\/(media|ext_tw_video_thumb|amplify_video_thumb)\//i.test(src))
          .map(src => ({
            type: /video_thumb/i.test(src) ? 'video' : 'image',
            url: src,
            thumbnail_url: src,
          }))

        const avatar = Array.from(article.querySelectorAll('img'))
          .map(img => img.currentSrc || img.src)
          .find(src => src && /pbs\.twimg\.com\/profile_images\//i.test(src))

        const text = article.innerText || ''
        const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
        const isPinned = lines.some(line => /^pinned$/i.test(line))
        const displayName = lines.find(line =>
          !line.startsWith('@') &&
          line !== '·' &&
          !/^pinned$/i.test(line) &&
          !/^\d+[smhd]$/i.test(line)
        ) || authorHandle

        candidates.push({
          externalId: match[2],
          authorHandle,
          authorDisplayName: displayName,
          authorAvatarUrl: avatar || null,
          sourceUrl: toAbsolute(statusHref),
          bodyText: text,
          media: images,
          isPinned,
          postedAt: article.querySelector('time[datetime]')?.getAttribute('datetime') || null,
          extractionMode: 'profile-dom',
          signedIn,
        })
      }

      if (candidates.length) return candidates.slice(0, maxCandidates)

      const fallback = Array.from(document.querySelectorAll('a[href*="/status/"]'))
        .map(link => link.getAttribute('href') || '')
        .find(Boolean)
      const match = fallback?.match(/\/([^/]+)\/status\/(\d+)/)
      return match?.[2]
        ? [{
            externalId: match[2],
            authorHandle: match[1],
            authorDisplayName: match[1],
            authorAvatarUrl: null,
            sourceUrl: toAbsolute(fallback),
            bodyText: `${match[1]} posted on X`,
            media: [],
            extractionMode: 'profile-link',
            signedIn,
          }]
        : []
    }, {
      targetHandle: handle,
      signedIn: Boolean(session.xSignedIn),
      maxCandidates: Number(process.env.NEWS_X_MAX_CANDIDATES || DEFAULT_X_MAX_CANDIDATES),
    })

    if (!raw?.length) {
      throw new Error(`No X post could be extracted for @${handle}`)
    }

    return filterXTimelineCandidates(raw, handle)
      .map(item => makeSnapshot({
        platform: 'x',
        postKind: 'post',
        ...item,
        raw: {
          extractedFrom: page.url(),
          handle,
          isPinned: Boolean(item.isPinned),
          signedIn: Boolean(session.xSignedIn),
          extractionMode: item.extractionMode || 'profile-dom',
        },
      }))
  } finally {
    await page.close().catch(() => {})
    if (ownsContext) await context.close()
  }
}

const hasConfiguredXSession = () => Boolean(
  getXCredentials() ||
  hasXAuthState() ||
  hasSeededXCookieSession() ||
  process.env.PINCHTAB_CDP_URL ||
  process.env.PINCHTAB_WS_ENDPOINT
)

const scrapeTruth = async (browser, rawHandle) => {
  const handle = cleanHandle(rawHandle)
  const context = await newTruthContext(browser)
  const page = await context.newPage()
  let signedIn = false

  try {
    if (getTruthCredentials() || hasTruthAuthState() || hasSeededTruthCookieSession()) {
      signedIn = await maybeSignInTruth(page, context)
    }

    await page.goto(`https://truthsocial.com/@${encodeURIComponent(handle)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 35_000,
    })
    await page.waitForTimeout(Number(process.env.NEWS_SCRAPE_SETTLE_MS || DEFAULT_SETTLE_MS))

    const raw = await page.evaluate(async targetHandle => {
      const handle = String(targetHandle || '').replace(/^@+/, '')
      const toAbsolute = value => {
        try {
          return new URL(value, location.origin).toString()
        } catch {
          return null
        }
      }
      const getJson = async path => {
        const response = await fetch(path, {
          headers: {
            accept: 'application/json, text/plain, */*',
          },
          credentials: 'include',
        })
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        return response.json()
      }

      try {
        const account = await getJson(`/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`)
        const statuses = await getJson(`/api/v1/accounts/${account.id}/statuses?exclude_replies=false&only_replies=false&with_muted=true&limit=10`)
        return { mode: 'api', account, statuses: Array.isArray(statuses) ? statuses : [] }
      } catch (apiError) {
        const links = Array.from(document.querySelectorAll('a[href*="/posts/"]'))
          .map(link => ({
            href: link.getAttribute('href') || '',
            node: link,
          }))
          .filter(item => item.href)

        const candidates = []
        for (const link of links) {
          const match = link.href.match(/\/@?([^/?#]+)\/posts\/(\d+)/i) || link.href.match(/\/posts\/(\d+)/i)
          const externalId = match?.[2] || match?.[1]
          if (!externalId) continue

          let card = link.node.closest('article')
          let current = link.node.parentElement
          for (let depth = 0; depth < 9 && current; depth += 1) {
            const text = (current.innerText || '').trim()
            if (text.length > 30 && text.length < 5000) {
              card = current
            }
            current = current.parentElement
          }

          const text = (card?.innerText || link.node.innerText || '').trim()
          const images = Array.from(card?.querySelectorAll('img') || [])
            .map(img => img.currentSrc || img.src)
            .filter(src => src && !/avatar|profile|emoji|logo|badge/i.test(src))
            .map(src => ({ type: 'image', url: src, thumbnail_url: src }))

          const avatar = Array.from(card?.querySelectorAll('img') || [])
            .map(img => img.currentSrc || img.src)
            .find(src => src && /avatar|profile/i.test(src))

          const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean)
          const authorDisplayName = lines.find(line =>
            !line.startsWith('@') &&
            !/^truth$/i.test(line) &&
            !/^\d+[smhd]$/i.test(line)
          ) || handle

          candidates.push({
            mode: 'dom',
            externalId,
            authorHandle: handle,
            authorDisplayName,
            authorAvatarUrl: avatar || null,
            sourceUrl: toAbsolute(link.href),
            bodyText: text,
            media: images,
            postedAt: card?.querySelector('time[datetime]')?.getAttribute('datetime') || null,
            apiError: apiError instanceof Error ? apiError.message : String(apiError),
          })
        }

        return candidates.length ? { mode: 'dom', candidates } : {
          mode: 'error',
          apiError: apiError instanceof Error ? apiError.message : String(apiError),
        }
      }
    }, handle)

    if (raw?.mode === 'dom' && raw.candidates?.length) {
      return raw.candidates.map(candidate => makeSnapshot({
        platform: 'truth',
        postKind: 'post',
        ...candidate,
        bodyText: cleanTruthText(candidate.bodyText, candidate.authorHandle, candidate.authorDisplayName),
        raw: { extractedFrom: page.url(), handle, apiError: candidate.apiError, mode: 'dom', signedIn },
      }))
    }

    if (!raw?.statuses?.length) {
      throw new Error(`No Truth Social post could be extracted for @${handle}${raw?.apiError ? ` (${raw.apiError})` : ''}`)
    }

    return raw.statuses.map(rawStatus => {
      const status = rawStatus.reblog || rawStatus
      const account = rawStatus.account || raw.account
      const bodyText = stripHtml(status.content || status.spoiler_text || '')
      const media = uniqueMedia((status.media_attachments || []).map(item => ({
        type: item.type === 'video' || item.type === 'gifv' ? 'video' : 'image',
        url: item.url || item.remote_url || item.preview_url,
        thumbnail_url: item.preview_url || item.url,
        alt: item.description || undefined,
      })))

      return makeSnapshot({
        platform: 'truth',
        externalId: rawStatus.id,
        postKind: rawStatus.reblog ? 'retruth' : rawStatus.in_reply_to_id ? 'reply' : 'post',
        authorHandle: account.username || account.acct || handle,
        authorDisplayName: stripHtml(account.display_name || account.username || handle),
        authorAvatarUrl: account.avatar_static || account.avatar || null,
        bodyText,
        sourceUrl: rawStatus.url || status.url || `https://truthsocial.com/@${handle}/posts/${rawStatus.id}`,
        media,
        metrics: {
          replies: rawStatus.replies_count ?? status.replies_count,
          boosts: rawStatus.reblogs_count ?? status.reblogs_count,
          favorites: rawStatus.favourites_count ?? status.favourites_count,
        },
        raw: { status: rawStatus, account: raw.account, signedIn },
        postedAt: rawStatus.created_at || status.created_at || null,
      })
    })
  } finally {
    await context.close()
  }
}

const classifySourceError = (source, error) => {
  const rawMessage = error instanceof Error ? error.message : String(error)
  if (source.platform === 'x' && /Only pinned X posts could be extracted/i.test(rawMessage)) {
    return {
      health_status: 'degraded',
      last_error: `${rawMessage}. X returned a pinned-only logged-out timeline; configure X credentials or a trusted browser session so the scraper can see current posts.`,
    }
  }

  if (source.platform === 'truth' && /\b403\b|forbidden/i.test(rawMessage)) {
    return {
      health_status: 'blocked',
      last_error: 'Truth Social blocked public scraping from the worker. Add TRUTH_USERNAME and TRUTH_PASSWORD in Render, or pause this source.',
    }
  }

  return {
    health_status: 'error',
    last_error: rawMessage.slice(0, 500),
  }
}

const scrapeSource = async (browser, source, session) => {
  if (source.platform === 'x') {
    return scrapeX(browser, source.handle, session)
  }

  if (source.platform === 'truth') {
    return scrapeTruth(browser, source.handle)
  }

  throw new Error(`Unsupported news source platform: ${source.platform}`)
}

const createSupabaseClient = () => {
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required outside proof mode')
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const updateSourceHealth = async (supabase, sourceId, patch) => {
  await supabase
    .from('news_sources')
    .update({
      last_checked_at: new Date().toISOString(),
      ...patch,
    })
    .eq('id', sourceId)
}

const writeSnapshot = async (supabase, source, snapshot) => {
  const row = {
    source_id: source.id,
    platform: snapshot.platform,
    external_id: snapshot.externalId,
    post_kind: snapshot.postKind,
    author_handle: snapshot.authorHandle,
    author_display_name: snapshot.authorDisplayName,
    author_avatar_url: snapshot.authorAvatarUrl,
    headline: snapshot.headline,
    body_text: snapshot.bodyText,
    source_url: snapshot.sourceUrl,
    media: snapshot.media,
    metrics: snapshot.metrics,
    raw: snapshot.raw,
    posted_at: snapshot.postedAt,
    detected_at: new Date().toISOString(),
    visible_day: getEasternDay(),
  }

  const { error } = await supabase
    .from('news_feed_items')
    .upsert(row, { onConflict: 'platform,external_id', ignoreDuplicates: true })

  if (error) throw error
}

const runCycle = async supabase => {
  await supabase.rpc('clear_expired_news_feed_items')

  const { data: sources, error } = await supabase
    .from('news_sources')
    .select('*')
    .eq('enabled', true)
    .order('platform')
    .order('handle')

  if (error) throw error
  if (!sources?.length) {
    console.log('No enabled news sources.')
    return
  }

  let browser
  const session = { shared: true }

  try {
    browser = await launchBrowser()
  } catch (error) {
    throw new Error(`Failed to launch news scraper browser: ${error instanceof Error ? error.message : String(error)}`)
  }

  try {
    for (const source of sources) {
      try {
        const snapshots = await scrapeSource(browser, source, session)
        const { latest, cursorSnapshot, toStore, staleCursor } = selectSnapshotsToStore(source, snapshots)

        if (!latest) {
          throw new Error(`No snapshots extracted for ${source.platform}:${source.handle}`)
        }

        if (staleCursor) {
          const configuredSessionHint = source.platform === 'x' && !hasConfiguredXSession()
            ? ' No X credentials or trusted browser session are configured for the worker.'
            : ''
          await updateSourceHealth(supabase, source.id, {
            last_success_at: new Date().toISOString(),
            last_error: `Latest extracted ${source.platform}:${latest.externalId} is older than stored cursor ${source.last_seen_external_id}; the provider returned a stale timeline.${configuredSessionHint}`,
            health_status: 'degraded',
            external_account_id: source.external_account_id || latest.authorHandle,
          })
          console.log(`Skipped stale ${latest.platform}:${latest.externalId} for ${source.handle}; cursor remains ${source.last_seen_external_id}`)
          continue
        }

        for (const snapshot of toStore) {
          await writeSnapshot(supabase, source, snapshot)
        }

        await updateSourceHealth(supabase, source.id, {
          last_success_at: new Date().toISOString(),
          last_seen_external_id: cursorSnapshot.externalId,
          last_seen_at: cursorSnapshot.postedAt || new Date().toISOString(),
          last_error: null,
          health_status: 'ok',
          external_account_id: source.external_account_id || cursorSnapshot.authorHandle,
        })
        console.log(`${toStore.length ? `Stored ${toStore.length}` : 'Skipped seen'} ${cursorSnapshot.platform}:${cursorSnapshot.externalId} for ${source.handle}`)
      } catch (error) {
        const healthPatch = classifySourceError(source, error)
        await updateSourceHealth(supabase, source.id, healthPatch)
        console.error(`Source ${source.platform}:${source.handle} failed: ${healthPatch.last_error}`)
      }
    }
  } finally {
    await session.xContext?.close().catch(() => {})
    await browser?.close().catch(() => {})
  }
}

const runBackfill = async supabase => {
  const hours = Number(getArgValue('--hours') || process.env.NEWS_BACKFILL_HOURS || 6)
  const cutoff = Date.now() - Math.max(1, hours) * 60 * 60 * 1000
  const { data: sources, error } = await supabase
    .from('news_sources')
    .select('*')
    .eq('enabled', true)
    .order('platform')
    .order('handle')

  if (error) throw error
  if (!sources?.length) {
    console.log('No enabled news sources.')
    return
  }

  for (const source of sources) {
    let browser
    const session = { shared: process.env.NEWS_X_SHARED_CONTEXT === 'true' }

    try {
      browser = await launchBrowser()
      const snapshots = await scrapeSource(browser, source, session)
      const recentSnapshots = uniqueSnapshots(snapshots)
        .filter(snapshot => {
          if (!snapshot.postedAt) return true
          const postedAt = Date.parse(snapshot.postedAt)
          return Number.isNaN(postedAt) || postedAt >= cutoff
        })
        .sort((left, right) => compareSnapshotsDesc(right, left))

      if (!recentSnapshots.length) {
        await updateSourceHealth(supabase, source.id, {
          last_success_at: new Date().toISOString(),
          health_status: 'degraded',
          last_error: `Backfill found no posts from the last ${hours} hours for ${source.platform}:${source.handle}.`,
        })
        console.log(`Backfill found no recent posts for ${source.platform}:${source.handle}`)
        continue
      }

      for (const snapshot of recentSnapshots.filter(item => belongsOnTodayBoard(item))) {
        await writeSnapshot(supabase, source, snapshot)
      }

      const newest = recentSnapshots.sort(compareSnapshotsDesc)[0]
      const currentCursor = toSortableId(source.last_seen_external_id)
      const newestId = toSortableId(newest.externalId)
      const cursorPatch = newestId !== null && (currentCursor === null || newestId > currentCursor)
        ? {
            last_seen_external_id: newest.externalId,
            last_seen_at: newest.postedAt || new Date().toISOString(),
          }
        : {}

      await updateSourceHealth(supabase, source.id, {
        last_success_at: new Date().toISOString(),
        last_error: null,
        health_status: 'ok',
        external_account_id: source.external_account_id || newest.authorHandle,
        ...cursorPatch,
      })
      console.log(`Backfilled ${recentSnapshots.length} ${source.platform} posts for ${source.handle}`)
    } catch (error) {
      const healthPatch = classifySourceError(source, error)
      await updateSourceHealth(supabase, source.id, healthPatch)
      console.error(`Backfill ${source.platform}:${source.handle} failed: ${healthPatch.last_error}`)
    } finally {
      await session.xContext?.close().catch(() => {})
      await browser?.close().catch(() => {})
    }
  }
}

const runWorker = async () => {
  const supabase = createSupabaseClient()
  const interval = Number(process.env.NEWS_SCRAPE_INTERVAL_MS || DEFAULT_INTERVAL_MS)

  if (process.argv.includes('--backfill')) {
    await runBackfill(supabase)
    return
  }

  if (process.argv.includes('--once')) {
    await runCycle(supabase)
    return
  }

  while (true) {
    const startedAt = Date.now()
    try {
      await runCycle(supabase)
    } catch (error) {
      console.error(error instanceof Error ? error.stack || error.message : error)
    }

    const elapsed = Date.now() - startedAt
    await delay(Math.max(5_000, interval - elapsed))
  }
}

const runProof = async () => {
  const xHandle = getArgValue('--x') || process.env.NEWS_PROOF_X_HANDLE || 'OpenAI'
  const truthHandle = getArgValue('--truth') || process.env.NEWS_PROOF_TRUTH_HANDLE || 'realDonaldTrump'
  const xOnly = process.argv.includes('--x-only')
  const browser = await launchBrowser()

  try {
    const x = await scrapeX(browser, xHandle)
    const xLatest = uniqueSnapshots(x).sort(compareSnapshotsDesc)[0]
    if (xOnly) {
      const ok = Boolean(xLatest?.externalId && xLatest.bodyText && xLatest.sourceUrl)
      console.log(JSON.stringify({ ok, generatedAt: new Date().toISOString(), x: xLatest, xCandidates: x.length }, null, 2))
      if (!ok) process.exitCode = 1
      return
    }

    const truth = await scrapeTruth(browser, truthHandle)
    const truthLatest = uniqueSnapshots(truth).sort(compareSnapshotsDesc)[0]
    const ok = Boolean(xLatest?.externalId && xLatest.bodyText && xLatest.sourceUrl && truthLatest?.externalId && truthLatest.bodyText && truthLatest.sourceUrl)

    console.log(JSON.stringify({ ok, generatedAt: new Date().toISOString(), x: xLatest, xCandidates: x.length, truth: truthLatest, truthCandidates: truth.length }, null, 2))
    if (!ok) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain && process.argv.includes('--proof')) {
  runProof().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
} else if (isMain) {
  runWorker().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}

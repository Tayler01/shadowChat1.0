import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const EASTERN_TIME_ZONE = 'America/New_York'
const DEFAULT_INTERVAL_MS = 90_000
const DEFAULT_SETTLE_MS = 8_000
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

const uniqueSnapshots = snapshots => {
  const seen = new Set()
  return snapshots.filter(snapshot => {
    const key = `${snapshot.platform}:${snapshot.externalId}`
    if (!snapshot?.externalId || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const selectSnapshotsToStore = (source, snapshots) => {
  const sorted = uniqueSnapshots(snapshots).sort(compareSnapshotsDesc)
  const latest = sorted[0] || null
  const cursor = toSortableId(source.last_seen_external_id)

  if (!latest) {
    return { latest: null, toStore: [] }
  }

  if (cursor === null) {
    return { latest, toStore: [latest] }
  }

  const toStore = sorted
    .filter(snapshot => {
      const snapshotId = toSortableId(snapshot.externalId)
      return snapshotId !== null && snapshotId > cursor
    })
    .sort((left, right) => compareSnapshotsDesc(right, left))

  return { latest, toStore }
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
    args: ['--disable-blink-features=AutomationControlled'],
  })
}

const newContext = browser =>
  browser.newContext({
    viewport: { width: 1365, height: 900 },
    userAgent: USER_AGENT,
    locale: 'en-US',
  })

const getTruthCredentials = () => {
  const username = process.env.TRUTH_USERNAME || process.env.TRUTH_EMAIL
  const password = process.env.TRUTH_PASSWORD
  return username && password ? { username, password } : null
}

const getXCredentials = () => {
  const username = process.env.X_USERNAME || process.env.X_EMAIL
  const password = process.env.X_PASSWORD
  return username && password ? { username, password } : null
}

const maybeSignInX = async context => {
  const credentials = getXCredentials()
  if (!credentials) return false

  const page = await context.newPage()
  try {
    await page.goto('https://x.com/i/flow/login', {
      waitUntil: 'domcontentloaded',
      timeout: 35_000,
    })
    await page.waitForTimeout(2_000)

    const usernameInput = page
      .locator('input[autocomplete="username"], input[name="text"], input[type="text"]')
      .first()

    if (!(await usernameInput.isVisible().catch(() => false))) {
      const text = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '')
      throw new Error(`X credentials are configured, but the login form was not found. url=${page.url()} text=${text.replace(/\s+/g, ' ').slice(0, 180)}`)
    }

    await usernameInput.fill(credentials.username)
    await page.getByRole('button', { name: /^next$/i }).click().catch(async () => {
      await usernameInput.press('Enter')
    })
    await page.waitForTimeout(2_000)

    const verificationInput = page
      .locator('input[data-testid="ocfEnterTextTextInput"], input[name="text"]')
      .first()
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first()

    if (
      !(await passwordInput.isVisible().catch(() => false)) &&
      process.env.X_EMAIL &&
      await verificationInput.isVisible().catch(() => false)
    ) {
      await verificationInput.fill(process.env.X_EMAIL)
      await page.getByRole('button', { name: /^next$/i }).click().catch(async () => {
        await verificationInput.press('Enter')
      })
      await page.waitForTimeout(2_000)
    }

    if (!(await passwordInput.isVisible().catch(() => false))) {
      const text = await page.locator('body').innerText({ timeout: 3_000 }).catch(() => '')
      throw new Error(`X password step was not found. url=${page.url()} text=${text.replace(/\s+/g, ' ').slice(0, 180)}`)
    }

    await passwordInput.fill(credentials.password)
    await page.getByRole('button', { name: /^(log in|sign in)$/i }).click().catch(async () => {
      await passwordInput.press('Enter')
    })
    await page.waitForTimeout(Number(process.env.NEWS_X_LOGIN_SETTLE_MS || 6_000))
    return !/\/i\/flow\/login/i.test(page.url())
  } finally {
    await page.close().catch(() => {})
  }
}

const maybeSignInTruth = async page => {
  const credentials = getTruthCredentials()
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
  return true
}

const scrapeX = async (browser, rawHandle, session = {}) => {
  const handle = cleanHandle(rawHandle)
  const ownsContext = !session.xContext
  const context = session.xContext || await newContext(browser)
  session.xContext = context

  if (!session.xLoginAttempted) {
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

    const raw = await page.evaluate(targetHandle => {
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
        })
      }

      if (candidates.length) return candidates

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
          }]
        : []
    }, handle)

    if (!raw?.length) {
      throw new Error(`No X post could be extracted for @${handle}`)
    }

    return raw
      .filter(item => item?.externalId && item?.sourceUrl)
      .map(item => makeSnapshot({
        platform: 'x',
        postKind: 'post',
        ...item,
        raw: {
          extractedFrom: page.url(),
          handle,
          isPinned: Boolean(item.isPinned),
          signedIn: Boolean(session.xSignedIn),
        },
      }))
  } finally {
    await page.close().catch(() => {})
    if (ownsContext) await context.close()
  }
}

const scrapeTruth = async (browser, rawHandle) => {
  const handle = cleanHandle(rawHandle)
  const context = await newContext(browser)
  const page = await context.newPage()

  try {
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
        raw: { extractedFrom: page.url(), handle, apiError: candidate.apiError, mode: 'dom' },
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
        raw: { status: rawStatus, account: raw.account },
        postedAt: rawStatus.created_at || status.created_at || null,
      })
    })
  } finally {
    await context.close()
  }
}

const classifySourceError = (source, error) => {
  const rawMessage = error instanceof Error ? error.message : String(error)
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

  const browser = await launchBrowser()
  const session = {}
  try {
    for (const source of sources) {
      try {
        const snapshots = await scrapeSource(browser, source, session)
        const { latest, toStore } = selectSnapshotsToStore(source, snapshots)

        if (!latest) {
          throw new Error(`No snapshots extracted for ${source.platform}:${source.handle}`)
        }

        for (const snapshot of toStore) {
          await writeSnapshot(supabase, source, snapshot)
        }

        await updateSourceHealth(supabase, source.id, {
          last_success_at: new Date().toISOString(),
          last_seen_external_id: latest.externalId,
          last_seen_at: latest.postedAt || new Date().toISOString(),
          last_error: null,
          health_status: 'ok',
          external_account_id: source.external_account_id || latest.authorHandle,
        })
        console.log(`${toStore.length ? `Stored ${toStore.length}` : 'Skipped seen'} ${latest.platform}:${latest.externalId} for ${source.handle}`)
      } catch (error) {
        const healthPatch = classifySourceError(source, error)
        await updateSourceHealth(supabase, source.id, healthPatch)
        console.error(`Source ${source.platform}:${source.handle} failed: ${healthPatch.last_error}`)
      }
    }
  } finally {
    await session.xContext?.close().catch(() => {})
    await browser.close()
  }
}

const runWorker = async () => {
  const supabase = createSupabaseClient()
  const interval = Number(process.env.NEWS_SCRAPE_INTERVAL_MS || DEFAULT_INTERVAL_MS)

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
  const browser = await launchBrowser()

  try {
    const x = await scrapeX(browser, xHandle)
    const truth = await scrapeTruth(browser, truthHandle)
    const xLatest = uniqueSnapshots(x).sort(compareSnapshotsDesc)[0]
    const truthLatest = uniqueSnapshots(truth).sort(compareSnapshotsDesc)[0]
    const ok = Boolean(xLatest?.externalId && xLatest.bodyText && xLatest.sourceUrl && truthLatest?.externalId && truthLatest.bodyText && truthLatest.sourceUrl)

    console.log(JSON.stringify({ ok, generatedAt: new Date().toISOString(), x: xLatest, xCandidates: x.length, truth: truthLatest, truthCandidates: truth.length }, null, 2))
    if (!ok) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

if (process.argv.includes('--proof')) {
  runProof().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
} else {
  runWorker().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : error)
    process.exitCode = 1
  })
}

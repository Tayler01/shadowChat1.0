import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const EASTERN_TIME_ZONE = 'America/New_York'
const DEFAULT_INTERVAL_MS = 90_000
const DEFAULT_SETTLE_MS = 8_000
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const cleanHandle = value => String(value || '').trim().replace(/^@+/, '')

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

const firstMeaningfulLine = text => {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)

  return (lines[0] || String(text || '').replace(/\s+/g, ' ').trim() || 'New post').slice(0, 180)
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

const scrapeX = async (browser, rawHandle) => {
  const handle = cleanHandle(rawHandle)
  const context = await newContext(browser)
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

        const statusHref = links.find(href => href.toLowerCase().includes(`/${target}/status/`)) || links[0]
        if (!statusHref) continue

        const match = statusHref.match(/\/([^/]+)\/status\/(\d+)/)
        if (!match?.[2]) continue

        const authorHandle = match[1]
        const images = Array.from(article.querySelectorAll('img'))
          .map(img => img.currentSrc || img.src)
          .filter(src => src && /pbs\.twimg\.com\/media\//i.test(src))
          .map(src => ({ type: 'image', url: src, thumbnail_url: src }))

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
        })
      }

      if (candidates.length) {
        return candidates.find(candidate => !candidate.isPinned) || candidates[0]
      }

      const fallback = Array.from(document.querySelectorAll('a[href*="/status/"]'))
        .map(link => link.getAttribute('href') || '')
        .find(Boolean)
      const match = fallback?.match(/\/([^/]+)\/status\/(\d+)/)
      return match?.[2]
        ? {
            externalId: match[2],
            authorHandle: match[1],
            authorDisplayName: match[1],
            authorAvatarUrl: null,
            sourceUrl: toAbsolute(fallback),
            bodyText: `${match[1]} posted on X`,
            media: [],
          }
        : null
    }, handle)

    if (!raw?.externalId || !raw?.sourceUrl) {
      throw new Error(`No X post could be extracted for @${handle}`)
    }

    return makeSnapshot({
      platform: 'x',
      postKind: 'post',
      ...raw,
      raw: { extractedFrom: page.url(), handle },
    })
  } finally {
    await context.close()
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

      const account = await getJson(`/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`)
      const statuses = await getJson(`/api/v1/accounts/${account.id}/statuses?exclude_replies=false&only_replies=false&with_muted=true&limit=10`)
      const status = Array.isArray(statuses) ? statuses[0] : null
      if (!status?.id) return null
      return { account, status }
    }, handle)

    if (!raw?.status?.id) {
      throw new Error(`No Truth Social post could be extracted for @${handle}`)
    }

    const status = raw.status.reblog || raw.status
    const account = raw.status.account || raw.account
    const bodyText = stripHtml(status.content || status.spoiler_text || '')
    const media = uniqueMedia((status.media_attachments || []).map(item => ({
      type: item.type === 'video' || item.type === 'gifv' ? 'video' : 'image',
      url: item.url || item.remote_url || item.preview_url,
      thumbnail_url: item.preview_url || item.url,
      alt: item.description || undefined,
    })))

    return makeSnapshot({
      platform: 'truth',
      externalId: raw.status.id,
      postKind: raw.status.reblog ? 'retruth' : raw.status.in_reply_to_id ? 'reply' : 'post',
      authorHandle: account.username || account.acct || handle,
      authorDisplayName: stripHtml(account.display_name || account.username || handle),
      authorAvatarUrl: account.avatar_static || account.avatar || null,
      bodyText,
      sourceUrl: raw.status.url || status.url || `https://truthsocial.com/@${handle}/posts/${raw.status.id}`,
      media,
      metrics: {
        replies: raw.status.replies_count ?? status.replies_count,
        boosts: raw.status.reblogs_count ?? status.reblogs_count,
        favorites: raw.status.favourites_count ?? status.favourites_count,
      },
      raw: { status: raw.status, account: raw.account },
      postedAt: raw.status.created_at || status.created_at || null,
    })
  } finally {
    await context.close()
  }
}

const scrapeSource = async (browser, source) => {
  if (source.platform === 'x') {
    return scrapeX(browser, source.handle)
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
  try {
    for (const source of sources) {
      try {
        const snapshot = await scrapeSource(browser, source)
        const alreadySeen = source.last_seen_external_id === snapshot.externalId

        if (!alreadySeen) {
          await writeSnapshot(supabase, source, snapshot)
        }

        await updateSourceHealth(supabase, source.id, {
          last_success_at: new Date().toISOString(),
          last_seen_external_id: snapshot.externalId,
          last_seen_at: snapshot.postedAt || new Date().toISOString(),
          last_error: null,
          health_status: 'ok',
          external_account_id: source.external_account_id || snapshot.authorHandle,
        })
        console.log(`${alreadySeen ? 'Skipped seen' : 'Stored'} ${snapshot.platform}:${snapshot.externalId} for ${source.handle}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await updateSourceHealth(supabase, source.id, {
          last_error: message.slice(0, 500),
          health_status: 'error',
        })
        console.error(`Source ${source.platform}:${source.handle} failed: ${message}`)
      }
    }
  } finally {
    await browser.close()
  }
}

const runWorker = async () => {
  const supabase = createSupabaseClient()
  const interval = Number(process.env.NEWS_SCRAPE_INTERVAL_MS || DEFAULT_INTERVAL_MS)

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
    const ok = Boolean(x.externalId && x.bodyText && x.sourceUrl && truth.externalId && truth.bodyText && truth.sourceUrl)

    console.log(JSON.stringify({ ok, generatedAt: new Date().toISOString(), x, truth }, null, 2))
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

const appUrl = process.env.PRODUCTION_APP_URL || 'https://shadochat.online'
const supabaseUrl = process.env.MONITOR_SUPABASE_URL?.replace(/\/$/, '')
const serviceKey = process.env.MONITOR_SUPABASE_SERVICE_ROLE_KEY
const newsMonitoringEnabled = process.env.NEWS_MONITOR_ENABLED?.trim().toLowerCase() === 'true'
const maxAgeMinutes = Number(process.env.NEWS_MAX_AGE_MINUTES || 10)

const fail = message => {
  console.error(`health-check: ${message}`)
  process.exitCode = 1
}

let appStatus = 0
try {
  const appResponse = await fetch(appUrl, { redirect: 'follow', signal: AbortSignal.timeout(15_000) })
  appStatus = appResponse.status
  if (!appResponse.ok) fail(`app returned HTTP ${appResponse.status}`)
} catch {
  fail('app request failed')
}

if (!newsMonitoringEnabled) {
  console.log(JSON.stringify({ app: appStatus, newsMonitoring: 'paused' }))
} else if (!supabaseUrl || !serviceKey) {
  fail('MONITOR_SUPABASE_URL and MONITOR_SUPABASE_SERVICE_ROLE_KEY are required for News freshness coverage')
} else {
  const response = await fetch(`${supabaseUrl}/rest/v1/news_sources?select=health_status,last_checked_at,last_success_at&enabled=eq.true`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    fail(`News freshness query returned HTTP ${response.status}`)
  } else {
    const rows = await response.json()
    const cutoff = Date.now() - maxAgeMinutes * 60_000
    const stale = rows.filter(row => !row.last_success_at || Date.parse(row.last_success_at) < cutoff)
    const unhealthy = rows.filter(row => ['error', 'blocked'].includes(row.health_status))
    console.log(JSON.stringify({ app: appStatus, enabledSources: rows.length, staleSources: stale.length, unhealthySources: unhealthy.length, maxAgeMinutes }))
    if (!rows.length) fail('no enabled News sources were returned')
    if (stale.length) fail(`${stale.length} enabled News source(s) exceeded the freshness threshold`)
    if (unhealthy.length) fail(`${unhealthy.length} enabled News source(s) reported blocked/error health`)
  }
}

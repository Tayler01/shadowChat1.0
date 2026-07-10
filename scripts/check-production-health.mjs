import { upsertOperationsHealthSnapshot } from './operations-health-shared.mjs'

const appUrl = process.env.PRODUCTION_APP_URL || 'https://shadochat.online'
const supabaseUrl = process.env.MONITOR_SUPABASE_URL?.replace(/\/$/, '')
const serviceKey = process.env.MONITOR_SUPABASE_SERVICE_ROLE_KEY
const newsMonitoringEnabled = process.env.NEWS_MONITOR_ENABLED?.trim().toLowerCase() === 'true'
const maxAgeMinutes = Number(process.env.NEWS_MAX_AGE_MINUTES || 10)
const expectedCommitSha = process.env.OPERATIONS_HEALTH_COMMIT_SHA?.trim() || ''
const failures = []

const serviceHeaders = key => ({
  apikey: key,
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
})

const fail = message => {
  failures.push(message)
  console.error(`health-check: ${message}`)
}

let appStatus = 0
try {
  const appResponse = await fetch(appUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  })
  appStatus = appResponse.status
  if (!appResponse.ok) fail(`app returned HTTP ${appResponse.status}`)
} catch {
  fail('app request failed')
}

let buildHealth = null
if (supabaseUrl && serviceKey) {
  try {
    const healthManifestUrl = new URL('/.well-known/shadowchat-health.json', appUrl)
    const response = await fetch(healthManifestUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    buildHealth = await response.json()
    if (buildHealth?.schemaVersion !== 1 || !buildHealth.commitSha) {
      throw new Error('invalid release metadata')
    }
    if (expectedCommitSha && buildHealth.commitSha !== expectedCommitSha) {
      fail(
        `deployed frontend SHA ${buildHealth.commitSha} does not match expected SHA ${expectedCommitSha}`
      )
    }
  } catch {
    fail('deployed build health manifest is unavailable or invalid')
  }
}

let newsSummary = { newsMonitoring: 'paused' }
if (newsMonitoringEnabled && (!supabaseUrl || !serviceKey)) {
  fail('MONITOR_SUPABASE_URL and MONITOR_SUPABASE_SERVICE_ROLE_KEY are required for News freshness coverage')
} else if (newsMonitoringEnabled) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/news_sources?select=health_status,last_checked_at,last_success_at&enabled=eq.true`,
    {
      headers: serviceHeaders(serviceKey),
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!response.ok) {
    fail(`News freshness query returned HTTP ${response.status}`)
  } else {
    const rows = await response.json()
    const cutoff = Date.now() - maxAgeMinutes * 60_000
    const stale = rows.filter(row => !row.last_success_at || Date.parse(row.last_success_at) < cutoff)
    const unhealthy = rows.filter(row => ['error', 'blocked'].includes(row.health_status))
    newsSummary = {
      enabledSources: rows.length,
      staleSources: stale.length,
      unhealthySources: unhealthy.length,
      maxAgeMinutes,
    }
    if (!rows.length) fail('no enabled News sources were returned')
    if (stale.length) fail(`${stale.length} enabled News source(s) exceeded the freshness threshold`)
    if (unhealthy.length) fail(`${unhealthy.length} enabled News source(s) reported blocked/error health`)
  }
}

if (supabaseUrl && serviceKey) {
  const checkedAt = new Date().toISOString()
  const snapshot = {
    environment: 'production',
    smoke_status: failures.length === 0 ? 'passed' : 'failed',
    smoke_checked_at: checkedAt,
    app_http_status: appStatus || null,
    news_state: 'paused',
    bridge_state: 'paused',
  }
  if (buildHealth?.commitSha) snapshot.frontend_sha = buildHealth.commitSha.slice(0, 80)
  if (buildHealth?.buildId) snapshot.frontend_build_id = buildHealth.buildId.slice(0, 160)

  try {
    await upsertOperationsHealthSnapshot({
      serviceRoleKey: serviceKey,
      snapshot,
      supabaseUrl,
    })
  } catch {
    fail('could not record the sanitized operations health snapshot')
  }
}

console.log(JSON.stringify({ app: appStatus, ...newsSummary }))
if (failures.length > 0) process.exitCode = 1

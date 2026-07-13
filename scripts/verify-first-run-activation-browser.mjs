import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { mkdir, open, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { chromium, devices, webkit } from 'playwright'

const repoRoot = process.cwd()
const artifactRoot = path.join(repoRoot, 'output', 'playwright', 'wave2-candidate4-activation')
const npxCliPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js')
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const timeoutMs = 45_000
const sensitiveValues = new Set()

const parseArgs = values => Object.fromEntries(values.flatMap(value => {
  if (!value.startsWith('--')) return []
  const separator = value.indexOf('=')
  return separator < 0
    ? [[value.slice(2), true]]
    : [[value.slice(2, separator), value.slice(separator + 1)]]
}))

const args = parseArgs(process.argv.slice(2))
if (args.help) {
  console.log([
    'Candidate 4 first-run activation browser verifier',
    '',
    'Required normal-run inputs:',
    '  PLAYWRIGHT_BASE_URL or --base-url=https://<deploy>--<site>.netlify.app',
    '  ACTIVATION_TRIAL_DEPLOY_ID or --deploy-id=<netlify-deploy-id>',
    '  ACTIVATION_EXPECTED_PROJECT_REF or --project-ref=<supabase-project-ref>',
    '  ACTIVATION_TEST_EMAIL_BASE (falls back to PLAYWRIGHT_ACCOUNT_1_EMAIL)',
    '  Supabase URL/anon key plus service-role access',
    '',
    'Recovery-only mode:',
    '  node scripts/verify-first-run-activation-browser.mjs --cleanup-only --recovery=<path-to-.cleanup-state.json>',
  ].join('\n'))
  process.exit(0)
}

const parseEnvFile = async filePath => {
  const source = await readFile(filePath, 'utf8').catch(() => '')
  return Object.fromEntries(source.split(/\r?\n/u).flatMap(line => {
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

const firstEnv = (...names) => {
  for (const name of names) {
    const value = env[name]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const messageOf = error => error instanceof Error ? error.message : String(error)
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
const unique = values => [...new Set(values.filter(Boolean))]

const must = (condition, message) => {
  if (!condition) throw new Error(message)
}

const activationEmailBase = firstEnv('ACTIVATION_TEST_EMAIL_BASE', 'PLAYWRIGHT_ACCOUNT_1_EMAIL', 'PLAYWRIGHT_ACCOUNT1_EMAIL').toLowerCase()
const activationEmailAt = activationEmailBase.lastIndexOf('@')
must(activationEmailAt > 0 && activationEmailAt < activationEmailBase.length - 1, 'Missing a valid owned QA email for disposable plus-addresses.')
const activationEmailLocal = activationEmailBase.slice(0, activationEmailAt).split('+')[0]
const activationEmailDomain = activationEmailBase.slice(activationEmailAt + 1)
sensitiveValues.add(activationEmailBase)

const assertNoError = (error, context) => {
  if (error) throw new Error(`${context}: ${error.message || String(error)}`)
}

const sanitizeToken = value => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9-]+/gu, '-')
  .replace(/^-+|-+$/gu, '')
  .slice(0, 80)

const sanitizeText = value => {
  let text = String(value ?? '')
  for (const sensitive of sensitiveValues) {
    if (sensitive) text = text.split(sensitive).join('[redacted]')
  }
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, '[redacted-email]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[redacted-jwt]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/gu, '[redacted-key]')
    .replace(/([?&](?:token|apikey|code|invite|password|access_token|refresh_token)=)[^&\s]+/giu, '$1[redacted]')
    .slice(0, 2_000)
}

const digest = value => createHash('sha256').update(String(value)).digest('hex').slice(0, 12)

const poll = async (label, callback, limitMs = timeoutMs, intervalMs = 300) => {
  const deadline = Date.now() + limitMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const result = await callback()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await wait(intervalMs)
  }
  throw new Error(`${label} timed out${lastError ? `: ${sanitizeText(messageOf(lastError))}` : ''}`)
}

const sqlLiteral = value => `'${String(value).replace(/'/gu, "''")}'`
const uuidSql = values => unique(values).map(value => {
  must(uuidPattern.test(value), 'Refusing to interpolate a non-UUID cleanup identifier.')
  return `${sqlLiteral(value)}::uuid`
}).join(', ') || 'NULL::uuid'
const textSql = values => unique(values).map(value => `${sqlLiteral(value)}::text`).join(', ') || 'NULL::text'

const execNpxSync = (argumentsList, options) => execFileSync(
  process.execPath,
  [npxCliPath, ...argumentsList],
  options
)

const isPathInside = (parent, candidate) => {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

const profileCodeBySuffix = {
  'pixel-chat': 'pc',
  'pixel-dm': 'pd',
  'pixel-pin': 'pp',
  'iphone-chat': 'ic',
  'iphone-dm': 'id',
  'iphone-pin': 'ip',
}

const expectedProfileIdentity = (runId, suffix) => {
  const compact = runId.replace(/-/gu, '').slice(-14)
  const profileCode = profileCodeBySuffix[suffix]
  must(profileCode, 'Disposable profile suffix is outside the verifier namespace.')
  const email = `${activationEmailLocal}+sca-${compact}-${profileCode}@${activationEmailDomain}`.toLowerCase()
  must(email.slice(0, email.lastIndexOf('@')).length <= 64 && email.length <= 254, 'Disposable plus-address exceeds email length limits.')
  return {
    email,
    username: `act_${suffix.replace(/[^a-z0-9_]/gu, '')}_${compact}`.slice(0, 32),
    messageContent: `ACTIVATION-QA-${runId}-${suffix}`.slice(0, 180),
  }
}

const legacyProfileUsername = (runId, suffix) => {
  const compact = runId.replace(/-/gu, '').slice(-14)
  return `act_${suffix}_${compact}`.slice(0, 32)
}

const validateRecoveryJournal = (journal, expectedProjectRef) => {
  must(journal && typeof journal === 'object' && !Array.isArray(journal), 'Recovery journal must be an object.')
  must(journal.schemaVersion === 3, 'Recovery journal has an unsupported schema.')
  must(journal.kind === 'shadowchat-first-run-activation-browser-cleanup', 'Recovery journal kind is invalid.')
  must(journal.projectRef === expectedProjectRef, 'Recovery journal belongs to a different Supabase project.')
  must(/^[a-z0-9][a-z0-9-]{5,79}$/u.test(journal.runId), 'Recovery journal run ID is invalid.')
  must(Number.isInteger(journal.serverStartedEpoch) && journal.serverStartedEpoch > 1_700_000_000, 'Recovery journal server start is invalid.')
  must(typeof journal.startedAt === 'string' && !Number.isNaN(Date.parse(journal.startedAt)), 'Recovery journal start time is invalid.')
  must(Array.isArray(journal.profiles) && journal.profiles.length === 6, 'Recovery journal must contain exactly six mobile action profiles.')

  const expectedProfiles = [
    { profile: 'pixel-chromium-general-chat', suffix: 'pixel-chat', actionKind: 'group_message' },
    { profile: 'pixel-chromium-direct-message', suffix: 'pixel-dm', actionKind: 'direct_message' },
    { profile: 'pixel-chromium-shadow-pin', suffix: 'pixel-pin', actionKind: 'shadow_pin_heart' },
    { profile: 'iphone-webkit-general-chat', suffix: 'iphone-chat', actionKind: 'group_message' },
    { profile: 'iphone-webkit-direct-message', suffix: 'iphone-dm', actionKind: 'direct_message' },
    { profile: 'iphone-webkit-shadow-pin', suffix: 'iphone-pin', actionKind: 'shadow_pin_heart' },
  ]
  for (const expected of expectedProfiles) {
    const profile = journal.profiles.find(candidate => candidate?.profile === expected.profile)
    must(profile && profile.suffix === expected.suffix && profile.actionKind === expected.actionKind, `Recovery journal is missing ${expected.profile}.`)
    const identity = expectedProfileIdentity(journal.runId, expected.suffix)
    must(profile.email === identity.email, `${expected.profile} recovery email is outside the verifier namespace.`)
    must(
      profile.username === identity.username || profile.username === legacyProfileUsername(journal.runId, expected.suffix),
      `${expected.profile} recovery username is outside the verifier namespace.`
    )
    must(profile.messageContent === identity.messageContent, `${expected.profile} recovery action marker is outside the verifier namespace.`)
    for (const field of ['inviteId', 'userId', 'messageId', 'dmMessageId', 'dmConversationId', 'dmRecipientUserId', 'pinHeartImageId']) {
      must(profile[field] == null || (typeof profile[field] === 'string' && uuidPattern.test(profile[field])), `${expected.profile} recovery ${field} is invalid.`)
    }
  }
  const journalUserIds = new Set(journal.profiles.map(profile => profile.userId).filter(Boolean))
  for (const profile of journal.profiles) {
    if (profile.dmRecipientUserId) {
      must(journalUserIds.has(profile.dmRecipientUserId), `${profile.profile} DM recipient is outside the disposable account set.`)
      must(profile.dmRecipientUserId !== profile.userId, `${profile.profile} DM recipient cannot be the sender.`)
    }
  }
  must(new Set(journal.profiles.map(profile => profile.profile)).size === 6, 'Recovery journal profile names are duplicated.')
  return journal
}

const runLinkedSql = sql => {
  const sqlFile = path.join(tmpdir(), `shadowchat-activation-${process.pid}-${randomBytes(8).toString('hex')}.sql`)
  writeFileSync(sqlFile, sql, { encoding: 'utf8', flag: 'wx' })
  try {
    return execNpxSync(
      ['supabase', 'db', 'query', '--linked', '--output-format', 'json', '--file', sqlFile],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      }
    )
  } finally {
    rmSync(sqlFile, { force: true })
  }
}

const requireOutputMarker = (output, marker) => {
  const match = String(output).match(new RegExp(`${marker}([0-9:]+)`))
  must(match, `Linked SQL did not return ${marker} proof.`)
  return match[1].split(':').map(Number)
}

const requireIdentityCountMarker = (output, marker) => {
  const match = String(output).match(new RegExp(`${marker}([0-9]+):([0-9a-f-]{36}|NONE)`, 'i'))
  must(match, `Linked SQL did not return ${marker} count and identity proof.`)
  const count = Number(match[1])
  const id = match[2] === 'NONE' ? null : match[2]
  must(id == null || uuidPattern.test(id), `Linked SQL returned an invalid ${marker} UUID.`)
  return { count, id }
}

const resolveServiceRoleKey = (supabaseUrl, projectRef) => {
  const configured = firstEnv('PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
  if (configured) return configured

  const raw = execNpxSync(
    ['supabase', 'projects', 'api-keys', '--project-ref', projectRef, '--output', 'json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    }
  )
  const parsed = JSON.parse(raw)
  const keys = Array.isArray(parsed) ? parsed : parsed?.api_keys || []
  const serviceRole = keys.find(key => key.name === 'service_role' || key.type === 'service_role')
  must(serviceRole?.api_key, `Service-role cleanup access is unavailable for ${new URL(supabaseUrl).hostname}.`)
  return serviceRole.api_key
}

const readJsonFromCommand = raw => {
  const source = String(raw).trim()
  try {
    return JSON.parse(source)
  } catch {
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(source.slice(start, end + 1))
    throw new Error('Command did not return JSON.')
  }
}

const verifyNetlifyDeploy = async ({ baseUrl, deployId }) => {
  const raw = execNpxSync(
    ['--yes', 'netlify@26.0.0', 'api', 'getDeploy', '--data', JSON.stringify({ deploy_id: deployId })],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 90_000,
    }
  )
  const deploy = readJsonFromCommand(raw)
  const resolvedId = deploy.id || deploy.deploy_id || deploy.deployId
  must(resolvedId === deployId, 'Netlify returned a different deploy than the requested trial deploy.')
  must(deploy.state === 'ready', `Netlify trial deploy is not ready (state=${deploy.state || 'unknown'}).`)

  const expectedHost = new URL(baseUrl).hostname
  const isolatedDeployHosts = unique([
    deploy.deploy_url,
    deploy.deployUrl,
    deploy.deploy_ssl_url,
    deploy.deploySslUrl,
  ]).flatMap(value => {
    try {
      return [new URL(value).hostname]
    } catch {
      return []
    }
  })
  must(isolatedDeployHosts.includes(expectedHost), 'PLAYWRIGHT_BASE_URL is not the immutable URL for the supplied Netlify deploy ID.')
  must(expectedHost.toLowerCase().startsWith(`${deployId.toLowerCase()}--`), 'PLAYWRIGHT_BASE_URL is not a deploy-specific Netlify hostname.')

  const healthUrl = new URL('/.well-known/shadowchat-health.json', baseUrl)
  const healthResponse = await fetch(healthUrl, {
    redirect: 'manual',
    headers: { 'cache-control': 'no-cache' },
  })
  must(healthResponse.status >= 200 && healthResponse.status < 300, `Trial health manifest returned HTTP ${healthResponse.status}.`)
  must(healthResponse.url === healthUrl.href, 'Trial health manifest redirected away from the supplied deploy origin.')
  must(healthResponse.ok, `Trial health manifest returned HTTP ${healthResponse.status}.`)
  const health = await healthResponse.json()
  must(health?.schemaVersion === 1, 'Trial health manifest has an unsupported schema.')
  const deployCommit = deploy.commit_ref || deploy.commitRef
  if (health.commitSha && deployCommit) {
    must(health.commitSha === deployCommit, 'Trial health manifest commit does not match the Netlify deploy.')
  }

  return {
    deployIdDigest: digest(deployId),
    deployContext: health.deployContext || deploy.context || null,
    commitSha: health.commitSha || deployCommit || null,
    buildId: health.buildId || null,
    healthReleaseIdentityAvailable: Boolean(health.commitSha && health.buildId),
  }
}

const verifyDeploySupabaseBinding = async ({ baseUrl, expectedSupabaseHost }) => {
  const baseOrigin = new URL(baseUrl).origin
  const indexResponse = await fetch(`${baseOrigin}/`, {
    redirect: 'manual',
    headers: { 'cache-control': 'no-cache' },
  })
  must(indexResponse.status >= 200 && indexResponse.status < 300, `Trial index returned HTTP ${indexResponse.status}.`)
  must(indexResponse.url === `${baseOrigin}/`, 'Trial index redirected away from the supplied deploy origin.')
  const indexHtml = await indexResponse.text()
  const assetQueue = []
  const queued = new Set()
  const enqueue = (candidate, parentUrl = baseOrigin) => {
    try {
      const url = new URL(candidate, parentUrl)
      if (url.origin !== baseOrigin || !url.pathname.endsWith('.js') || queued.has(url.href)) return
      queued.add(url.href)
      assetQueue.push(url)
    } catch {
      // Ignore malformed non-asset strings.
    }
  }
  for (const match of indexHtml.matchAll(/(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/giu)) enqueue(match[1], `${baseOrigin}/`)
  must(assetQueue.length > 0, 'Trial index did not expose a JavaScript entry asset.')

  const seenSupabaseHosts = new Set()
  let inspectedAssets = 0
  while (assetQueue.length) {
    must(inspectedAssets < 80, 'Trial JavaScript dependency graph exceeded the bounded deploy-binding scan.')
    const assetUrl = assetQueue.shift()
    const response = await fetch(assetUrl, { redirect: 'manual', headers: { 'cache-control': 'no-cache' } })
    must(response.status >= 200 && response.status < 300, `Trial JavaScript asset returned HTTP ${response.status}.`)
    must(response.url === assetUrl.href, 'A trial JavaScript asset redirected away from the supplied deploy origin.')
    const source = await response.text()
    must(source.length <= 8_000_000, 'A trial JavaScript asset exceeded the bounded deploy-binding size.')
    inspectedAssets += 1
    for (const match of source.matchAll(/https:\/\/([a-z0-9-]+\.supabase\.co)/giu)) seenSupabaseHosts.add(match[1].toLowerCase())
    for (const match of source.matchAll(/["']((?:\.{0,2}\/|\/|assets\/)[^"']+\.js)["']/giu)) {
      enqueue(match[1], match[1].startsWith('assets/') ? `${baseOrigin}/` : assetUrl)
    }
  }

  must(seenSupabaseHosts.has(expectedSupabaseHost), 'Trial JavaScript is not bound to the configured shared Supabase project.')
  must([...seenSupabaseHosts].every(host => host === expectedSupabaseHost), 'Trial JavaScript embeds an unexpected Supabase project.')
  return { inspectedAssets, expectedProjectSeen: true, unexpectedProjectCount: 0 }
}

const assertTrialOrigin = (page, baseUrl, label) => {
  const expectedOrigin = new URL(baseUrl).origin
  const actualOrigin = new URL(page.url()).origin
  must(actualOrigin === expectedOrigin, `${label} left the isolated trial origin.`)
}

const installContextFirewall = async (context, { baseUrl, expectedSupabaseHost }) => {
  const expectedOrigin = new URL(baseUrl).origin
  const evidence = {
    sendPushRequests: [],
    sendPushPreflights: 0,
  }
  await context.route('**/*', async route => {
    const request = route.request()
    try {
      const url = new URL(request.url())
      const looksLikeSupabaseApi = /^\/(?:auth|rest|storage|functions|realtime)\/v1(?:\/|$)/u.test(url.pathname)
      if ((url.hostname.endsWith('.supabase.co') || looksLikeSupabaseApi) && url.hostname !== expectedSupabaseHost) {
        await route.abort('blockedbyclient')
        return
      }
      if (url.hostname === expectedSupabaseHost && url.pathname === '/functions/v1/send-push') {
        const corsHeaders = {
          'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-origin': expectedOrigin,
          'content-type': 'application/json',
          vary: 'Origin',
        }
        if (request.method() === 'OPTIONS') {
          evidence.sendPushPreflights += 1
          await route.fulfill({ status: 204, headers: corsHeaders, body: '' })
          return
        }
        let body = null
        try {
          body = request.postDataJSON()
        } catch {
          // Preserve a null body for the exact post-run firewall assertion.
        }
        evidence.sendPushRequests.push({
          method: request.method(),
          type: typeof body?.type === 'string' ? body.type : null,
          messageId: typeof body?.messageId === 'string' ? body.messageId : null,
          bodyKeys: body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body).sort() : [],
        })
        await route.fulfill({
          status: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, sent: 0, failed: 0, qaIntercepted: true }),
        })
        return
      }
      if (request.resourceType() === 'document' && ['http:', 'https:'].includes(url.protocol) && url.origin !== expectedOrigin) {
        await route.abort('blockedbyclient')
        return
      }
    } catch {
      if (request.resourceType() === 'document') {
        await route.abort('blockedbyclient')
        return
      }
    }
    await route.continue()
  })
  return evidence
}

const verifySendPushFirewall = (profile, evidence) => {
  const expected = profile.account.actionKind === 'group_message'
    ? { type: 'group_message', messageId: profile.account.messageId }
    : profile.account.actionKind === 'direct_message'
      ? { type: 'dm_message', messageId: profile.account.dmMessageId }
      : null
  must(evidence.sendPushPreflights >= 0 && evidence.sendPushPreflights <= 1, `${profile.name} emitted duplicate send-push preflights.`)
  must(evidence.sendPushRequests.length === (expected ? 1 : 0), `${profile.name} send-push interception count was unexpected.`)
  if (expected) {
    const [request] = evidence.sendPushRequests
    must(request.method === 'POST', `${profile.name} send-push used an unexpected method.`)
    must(request.type === expected.type, `${profile.name} send-push used an unexpected notification type.`)
    must(uuidPattern.test(expected.messageId || '') && request.messageId === expected.messageId, `${profile.name} send-push referenced an unexpected message.`)
    must(JSON.stringify(request.bodyKeys) === JSON.stringify(['messageId', 'type']), `${profile.name} send-push body shape was unexpected.`)
  }
  checks.push({
    name: `${profile.name}-send-push-delivery-firewalled`,
    passed: true,
    expectedType: expected?.type || null,
    interceptedPostCount: evidence.sendPushRequests.length,
    interceptedPreflightCount: evidence.sendPushPreflights,
    liveDeliveryAttempts: 0,
  })
}

const verifyReadOnlyBrowserBootstrap = async ({ baseUrl, expectedSupabaseHost }) => {
  let browser = null
  let context = null
  const supabaseHosts = new Set()
  const consoleErrors = []
  const pageErrors = []
  try {
    browser = await chromium.launch({ headless: true })
    context = await browser.newContext({
      ...devices['Pixel 7'],
      serviceWorkers: 'block',
      ignoreHTTPSErrors: false,
    })
    await installContextFirewall(context, { baseUrl, expectedSupabaseHost })
    const page = await context.newPage()
    page.on('request', request => {
      try {
        const host = new URL(request.url()).hostname.toLowerCase()
        if (host.endsWith('.supabase.co')) supabaseHosts.add(host)
      } catch {
        // Ignore browser-internal request targets.
      }
    })
    page.on('console', message => {
      if (message.type() !== 'error') return
      const text = sanitizeText(message.text())
      if (!(text.includes('Content Security Policy') && text.toLowerCase().includes('report-only'))) consoleErrors.push(text)
    })
    page.on('pageerror', error => pageErrors.push(sanitizeText(error.message)))
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    assertTrialOrigin(page, baseUrl, 'Read-only browser bootstrap')
    await page.getByRole('button', { name: 'Sign up', exact: true }).waitFor({ timeout: timeoutMs })
    must([...supabaseHosts].every(host => host === expectedSupabaseHost), 'Read-only browser bootstrap contacted an unexpected Supabase project.')
    must(consoleErrors.length === 0, `Read-only browser bootstrap console errors: ${consoleErrors.join(' | ')}`)
    must(pageErrors.length === 0, `Read-only browser bootstrap page errors: ${pageErrors.join(' | ')}`)
    return {
      expectedProjectContacted: supabaseHosts.has(expectedSupabaseHost),
      unexpectedProjectCount: [...supabaseHosts].filter(host => host !== expectedSupabaseHost).length,
    }
  } finally {
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
}

const verifyLinkedBackendPreflight = async projectRef => {
  const linkedRef = (await readFile(path.join(repoRoot, 'supabase', '.temp', 'project-ref'), 'utf8')).trim()
  must(linkedRef === projectRef, 'Linked Supabase project does not match the configured frontend Supabase URL.')

  const output = runLinkedSql(`
    select 'ACTIVATION_BACKEND_PREFLIGHT:' ||
      (to_regclass('public.user_activation_journeys') is not null)::int || ':' ||
      (to_regclass('private.signup_invites') is not null)::int || ':' ||
      (exists (
        select 1 from private.activation_rollouts
        where rollout_key = 'first_run_activation_v1'
      ))::int || ':' ||
      (to_regprocedure('public.get_my_activation_journey()') is not null)::int || ':' ||
      (to_regprocedure('public.update_my_activation_journey(integer,text,text)') is not null)::int || ':' ||
      floor(extract(epoch from clock_timestamp()))::bigint;
  `)
  const proof = requireOutputMarker(output, 'ACTIVATION_BACKEND_PREFLIGHT:')
  must(proof.length === 6 && proof.slice(0, 5).every(value => value === 1), `Activation backend preflight failed: ${proof.join(':')}`)
  must(proof[5] > 1_700_000_000, 'Activation backend preflight did not return a valid server clock.')
  return { contract: proof.slice(0, 5), serverStartedEpoch: proof[5] }
}

const findAuthUserIdByEmailViaLinkedSql = email => {
  const output = runLinkedSql(`
    select 'ACTIVATION_AUTH_EMAIL:' || count(*) || ':' || coalesce((
      select id::text from auth.users
      where lower(email) = ${sqlLiteral(email.toLowerCase())}
      order by id
      limit 1
    ), 'NONE')
    from auth.users
    where lower(email) = ${sqlLiteral(email.toLowerCase())};
  `)
  const proof = requireIdentityCountMarker(output, 'ACTIVATION_AUTH_EMAIL:')
  must(proof.count <= 1, 'Disposable email matched multiple Auth users.')
  return proof.id
}

const findInviteIdByEmailViaLinkedSql = email => {
  const output = runLinkedSql(`
    select 'ACTIVATION_INVITE_EMAIL:' || count(*) || ':' || coalesce((
      select id::text from private.signup_invites
      where lower(email_lock) = ${sqlLiteral(email.toLowerCase())}
      order by id
      limit 1
    ), 'NONE')
    from private.signup_invites
    where lower(email_lock) = ${sqlLiteral(email.toLowerCase())};
  `)
  const proof = requireIdentityCountMarker(output, 'ACTIVATION_INVITE_EMAIL:')
  must(proof.count <= 1, 'Disposable email matched multiple signup invites.')
  return proof.id
}

const findRedemptionUserIdViaLinkedSql = (email, inviteId) => {
  if (!inviteId) return null
  const output = runLinkedSql(`
    select 'ACTIVATION_REDEMPTION_USER:' || count(*) || ':' || coalesce((
      select redeemed_by::text
      from private.signup_invite_redemptions
      where invite_id = ${sqlLiteral(inviteId)}::uuid
        and lower(redeemed_email) = ${sqlLiteral(email.toLowerCase())}
      order by redeemed_by
      limit 1
    ), 'NONE')
    from private.signup_invite_redemptions
    where invite_id = ${sqlLiteral(inviteId)}::uuid
      and lower(redeemed_email) = ${sqlLiteral(email.toLowerCase())};
  `)
  const proof = requireIdentityCountMarker(output, 'ACTIVATION_REDEMPTION_USER:')
  must(proof.count <= 1, 'Disposable invite matched multiple redemption users.')
  return proof.id
}

const findActionReceiptViaLinkedSql = profile => {
  if (!profile.userId) return
  if (profile.actionKind === 'group_message') {
    const output = runLinkedSql(`
      select 'ACTIVATION_GROUP_RECEIPT:' || count(*) || ':' || coalesce((
        select id::text from public.messages
        where user_id = ${sqlLiteral(profile.userId)}::uuid
          and content = ${sqlLiteral(profile.messageContent)}
        order by id limit 1
      ), 'NONE')
      from public.messages
      where user_id = ${sqlLiteral(profile.userId)}::uuid
        and content = ${sqlLiteral(profile.messageContent)};
    `)
    const proof = requireIdentityCountMarker(output, 'ACTIVATION_GROUP_RECEIPT:')
    must(proof.count <= 1, 'Disposable group action matched multiple messages.')
    if (proof.id) {
      if (profile.messageId) must(profile.messageId === proof.id, 'Recovery group message ID changed.')
      profile.messageId = proof.id
    }
    return
  }
  if (profile.actionKind === 'direct_message') {
    const output = runLinkedSql(`
      select 'ACTIVATION_DM_RECEIPT:' || count(*) || ':' ||
        coalesce((
          select id::text from public.dm_messages
          where sender_id = ${sqlLiteral(profile.userId)}::uuid
            and content = ${sqlLiteral(profile.messageContent)}
          order by id limit 1
        ), 'NONE') || ':' || coalesce((
          select conversation_id::text from public.dm_messages
          where sender_id = ${sqlLiteral(profile.userId)}::uuid
            and content = ${sqlLiteral(profile.messageContent)}
          order by id limit 1
        ), 'NONE')
      from public.dm_messages
      where sender_id = ${sqlLiteral(profile.userId)}::uuid
        and content = ${sqlLiteral(profile.messageContent)};
    `)
    const match = String(output).match(/ACTIVATION_DM_RECEIPT:([0-9]+):([0-9a-f-]{36}|NONE):([0-9a-f-]{36}|NONE)/iu)
    must(match, 'Linked SQL did not return disposable DM receipt proof.')
    const count = Number(match[1])
    const dmMessageId = match[2] === 'NONE' ? null : match[2]
    const dmConversationId = match[3] === 'NONE' ? null : match[3]
    must(count <= 1, 'Disposable DM action matched multiple messages.')
    must((dmMessageId == null) === (dmConversationId == null), 'Disposable DM receipt was incomplete.')
    if (dmMessageId) {
      if (profile.dmMessageId) must(profile.dmMessageId === dmMessageId, 'Recovery DM message ID changed.')
      if (profile.dmConversationId) must(profile.dmConversationId === dmConversationId, 'Recovery DM conversation ID changed.')
      profile.dmMessageId = dmMessageId
      profile.dmConversationId = dmConversationId
    }
    return
  }
  if (profile.actionKind === 'shadow_pin_heart') {
    const output = runLinkedSql(`
      select 'ACTIVATION_PIN_HEART:' || count(*) || ':' || coalesce((
        select image_id::text from public.shadow_pin_image_hearts
        where user_id = ${sqlLiteral(profile.userId)}::uuid
        order by image_id limit 1
      ), 'NONE')
      from public.shadow_pin_image_hearts
      where user_id = ${sqlLiteral(profile.userId)}::uuid;
    `)
    const proof = requireIdentityCountMarker(output, 'ACTIVATION_PIN_HEART:')
    must(proof.count <= 1, 'Disposable Pin action matched multiple hearts.')
    if (proof.id) {
      if (profile.pinHeartImageId) must(profile.pinHeartImageId === proof.id, 'Recovery ShadowPin heart image changed.')
      profile.pinHeartImageId = proof.id
    }
  }
}

const resolveJournalTargetIds = async journal => {
  for (const profile of journal.profiles) {
    const authUserId = findAuthUserIdByEmailViaLinkedSql(profile.email)
    if (authUserId) {
      if (profile.userId) must(profile.userId === authUserId, 'Recovery journal user ID did not match the disposable email.')
      profile.userId = authUserId
    }
    const inviteId = findInviteIdByEmailViaLinkedSql(profile.email)
    if (inviteId) {
      if (profile.inviteId) must(profile.inviteId === inviteId, 'Recovery journal invite ID did not match the disposable email lock.')
      profile.inviteId = inviteId
    }
    const redemptionUserId = findRedemptionUserIdViaLinkedSql(profile.email, profile.inviteId)
    if (redemptionUserId) {
      if (profile.userId) must(profile.userId === redemptionUserId, 'Recovery journal user ID did not match the exact invite redemption.')
      profile.userId = redemptionUserId
    }
    if (profile.userId) {
      const expectedIdentity = expectedProfileIdentity(journal.runId, profile.suffix)
      const publicProfile = await admin.from('users').select('id,username').eq('id', profile.userId).maybeSingle()
      assertNoError(publicProfile.error, 'Resolve disposable public profile during recovery')
      if (publicProfile.data) {
        must(publicProfile.data.id === profile.userId, 'Recovery public profile ID changed.')
        must(publicProfile.data.username === expectedIdentity.username, 'Recovery public profile username is outside the normalized verifier namespace.')
        profile.username = expectedIdentity.username
      }
    }
    findActionReceiptViaLinkedSql(profile)
  }
}

const writeRecoveryJournal = async (journalPath, journal) => {
  const safe = {
    schemaVersion: 3,
    kind: 'shadowchat-first-run-activation-browser-cleanup',
    projectRef: journal.projectRef,
    runId: journal.runId,
    startedAt: journal.startedAt,
    serverStartedEpoch: journal.serverStartedEpoch,
    profiles: journal.profiles.map(profile => ({
      profile: profile.profile,
      suffix: profile.suffix,
      actionKind: profile.actionKind,
      email: profile.email,
      username: profile.username,
      inviteId: profile.inviteId || null,
      userId: profile.userId || null,
      messageId: profile.messageId || null,
      dmMessageId: profile.dmMessageId || null,
      dmConversationId: profile.dmConversationId || null,
      dmRecipientUserId: profile.dmRecipientUserId || null,
      pinHeartImageId: profile.pinHeartImageId || null,
      messageContent: profile.messageContent,
    })),
  }
  const payload = `${JSON.stringify(safe, null, 2)}\n`
  const temporaryPath = `${journalPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  let file = null
  try {
    file = await open(temporaryPath, 'wx', 0o600)
    await file.writeFile(payload, 'utf8')
    await file.sync()
    await file.close()
    file = null
    await rename(temporaryPath, journalPath)
  } catch (error) {
    await file?.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

const verifyNoPreexistingTargets = journal => {
  validateRecoveryJournal(journal, journal.projectRef)
  const emails = journal.profiles.map(profile => profile.email)
  const usernames = journal.profiles.map(profile => profile.username)
  const messageContents = journal.profiles.map(profile => profile.messageContent)
  const output = runLinkedSql(`
    select 'ACTIVATION_COLLISION_PREFLIGHT:' ||
      (select count(*) from auth.users where lower(email) in (${textSql(emails)})) || ':' ||
      (select count(*) from public.users where username in (${textSql(usernames)})) || ':' ||
      (select count(*) from private.signup_invites where lower(email_lock) in (${textSql(emails)})) || ':' ||
      (select count(*) from private.signup_invite_redemptions where lower(redeemed_email) in (${textSql(emails)})) || ':' ||
      (select count(*) from public.messages where content in (${textSql(messageContents)})) || ':' ||
      (select count(*) from public.dm_messages where content in (${textSql(messageContents)}));
  `)
  const proof = requireOutputMarker(output, 'ACTIVATION_COLLISION_PREFLIGHT:')
  must(proof.length === 6 && proof.every(value => value === 0), `Disposable target collision preflight failed: ${proof.join(':')}`)
  return proof
}

const verifyCleanupRelationships = journal => {
  for (const profile of journal.profiles) {
    const userId = profile.userId ? `${sqlLiteral(profile.userId)}::uuid` : null
    const inviteId = profile.inviteId ? `${sqlLiteral(profile.inviteId)}::uuid` : null
    const messageId = profile.messageId ? `${sqlLiteral(profile.messageId)}::uuid` : null
    const dmMessageId = profile.dmMessageId ? `${sqlLiteral(profile.dmMessageId)}::uuid` : null
    const dmConversationId = profile.dmConversationId ? `${sqlLiteral(profile.dmConversationId)}::uuid` : null
    const dmRecipientUserId = profile.dmRecipientUserId ? `${sqlLiteral(profile.dmRecipientUserId)}::uuid` : null
    const pinHeartImageId = profile.pinHeartImageId ? `${sqlLiteral(profile.pinHeartImageId)}::uuid` : null
    const email = sqlLiteral(profile.email)
    const username = sqlLiteral(profile.username)
    const messageContent = sqlLiteral(profile.messageContent)
    const output = runLinkedSql(`
      with ownership as (
        select
          (select count(*) from auth.users where lower(email) = ${email}${userId ? ` or id = ${userId}` : ''}) as auth_target,
          (select count(*) from auth.users where lower(email) = ${email}${userId ? ` and id = ${userId}` : ' and false'}) as auth_exact,
          (select count(*) from public.users where username = ${username}${userId ? ` or id = ${userId}` : ''}) as profile_target,
          (select count(*) from public.users where username = ${username}${userId ? ` and id = ${userId}` : ' and false'}) as profile_exact,
          (select count(*) from private.signup_invites where lower(email_lock) = ${email}${inviteId ? ` or id = ${inviteId}` : ''}) as invite_target,
          (select count(*) from private.signup_invites where lower(email_lock) = ${email}${inviteId ? ` and id = ${inviteId}` : ''}) as invite_exact,
          (select count(*) from private.signup_invite_redemptions
            where lower(redeemed_email) = ${email}${inviteId ? ` or invite_id = ${inviteId}` : ''}${userId ? ` or redeemed_by = ${userId}` : ''}) as redemption_target,
          (select count(*) from private.signup_invite_redemptions
            where lower(redeemed_email) = ${email}${inviteId ? ` and invite_id = ${inviteId}` : ' and false'}${userId ? ` and redeemed_by = ${userId}` : ' and false'}) as redemption_exact,
          ${userId ? `(select count(*) from public.user_activation_journeys where user_id = ${userId})` : '0'} as journey_target,
          ${userId ? `(select count(*) from public.user_activation_journeys where user_id = ${userId})` : '0'} as journey_exact,
          (select count(*) from public.messages
            where content = ${messageContent}${messageId ? ` or id = ${messageId}` : ''}${userId ? ` or user_id = ${userId}` : ''}) as message_target,
          ${userId ? `(select count(*) from public.messages where user_id = ${userId})` : '0'} as message_exact,
          ${messageId ? `(select count(*) from public.messages where id = ${messageId})` : '0'} as receipt_target,
          ${messageId && userId ? `(select count(*) from public.messages where id = ${messageId} and user_id = ${userId} and content = ${messageContent})` : '0'} as receipt_exact,
          (select count(*) from public.dm_messages
            where content = ${messageContent}${dmMessageId ? ` or id = ${dmMessageId}` : ''}${userId ? ` or sender_id = ${userId}` : ''}) as dm_target,
          ${userId ? `(select count(*) from public.dm_messages where sender_id = ${userId})` : '0'} as dm_exact,
          ${dmMessageId ? `(select count(*) from public.dm_messages where id = ${dmMessageId})` : '0'} as dm_receipt_target,
          ${dmMessageId && dmConversationId && userId ? `(select count(*) from public.dm_messages where id = ${dmMessageId} and conversation_id = ${dmConversationId} and sender_id = ${userId} and content = ${messageContent})` : '0'} as dm_receipt_exact,
          ${dmConversationId ? `(select count(*) from public.dm_conversations where id = ${dmConversationId})` : '0'} as conversation_target,
          ${dmConversationId && userId && dmRecipientUserId ? `(select count(*) from public.dm_conversations where id = ${dmConversationId} and cardinality(participants) = 2 and participants @> array[${userId}, ${dmRecipientUserId}]::uuid[])` : '0'} as conversation_exact,
          ${userId ? `(select count(*) from public.shadow_pin_image_hearts where user_id = ${userId})` : '0'} as pin_heart_target,
          ${userId && pinHeartImageId ? `(select count(*) from public.shadow_pin_image_hearts where user_id = ${userId} and image_id = ${pinHeartImageId})` : '0'} as pin_heart_exact,
          ${userId ? `(select count(*) from storage.objects where owner_id = (${userId})::text)` : '0'} as storage_target
      )
      select 'ACTIVATION_CLEANUP_RELATIONSHIP:' ||
        ((auth_target <> auth_exact or auth_target > 1)::int) || ':' ||
        ((profile_target <> profile_exact or profile_target > 1)::int) || ':' ||
        ((invite_target <> invite_exact or invite_target > 1)::int) || ':' ||
        ((redemption_target <> redemption_exact or redemption_target > 1)::int) || ':' ||
        ((journey_target <> journey_exact or journey_target > 1)::int) || ':' ||
        ((message_target <> message_exact)::int) || ':' ||
        ((receipt_target <> receipt_exact or receipt_target > 1)::int) || ':' ||
        ((dm_target <> dm_exact)::int) || ':' ||
        ((dm_receipt_target <> dm_receipt_exact or dm_receipt_target > 1)::int) || ':' ||
        ((conversation_target <> conversation_exact or conversation_target > 1)::int) || ':' ||
        ((pin_heart_target <> pin_heart_exact or pin_heart_target > 1)::int) || ':' ||
        ((storage_target > 0)::int) || ':' ||
        (((auth_exact + profile_exact + receipt_exact + dm_receipt_exact + pin_heart_exact) = 0
          and (auth_target + profile_target + journey_target + message_target + dm_target + pin_heart_target) > 0)::int)
      from ownership;
    `)
    const proof = requireOutputMarker(output, 'ACTIVATION_CLEANUP_RELATIONSHIP:')
    must(proof.length === 13 && proof.every(value => value === 0), `${profile.profile} cleanup ownership proof failed: ${proof.join(':')}`)
  }
}

const getAuthUserById = async (admin, userId) => {
  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error && (error.status === 404 || error.code === 'user_not_found')) return null
  assertNoError(error, 'Read disposable Auth user by ID')
  return data?.user || null
}

const cleanupTestState = async ({ admin, journal, journalPath }) => {
  validateRecoveryJournal(journal, projectRef)
  await resolveJournalTargetIds(journal)
  validateRecoveryJournal(journal, projectRef)
  await writeRecoveryJournal(journalPath, journal)
  verifyCleanupRelationships(journal)

  const userIds = unique(journal.profiles.map(profile => profile.userId))
  const inviteIds = unique(journal.profiles.map(profile => profile.inviteId))
  const emails = unique(journal.profiles.map(profile => profile.email.toLowerCase()))
  const usernames = unique(journal.profiles.map(profile => profile.username))
  const messageContents = unique(journal.profiles.map(profile => profile.messageContent))
  const messageIds = unique(journal.profiles.map(profile => profile.messageId))
  const dmMessageIds = unique(journal.profiles.map(profile => profile.dmMessageId))
  const dmConversationIds = unique(journal.profiles.map(profile => profile.dmConversationId))
  const pinHeartImageIds = unique(journal.profiles.map(profile => profile.pinHeartImageId))
  let messagesRemoved = 0
  if (userIds.length) {
    const deletion = await admin.from('messages').delete({ count: 'exact' }).in('user_id', userIds)
    assertNoError(deletion.error, 'Delete activation verification messages')
    messagesRemoved = deletion.count || 0
  }

  const dmMessagesRemoved = requireOutputMarker(runLinkedSql(`
    with deleted_rows as (
      delete from public.dm_messages
      where sender_id in (${uuidSql(userIds)})
        and (
          id in (${uuidSql(dmMessageIds)})
          or content in (${textSql(messageContents)})
        )
      returning id
    )
    select 'ACTIVATION_DM_CLEANUP:' || count(*) from deleted_rows;
  `), 'ACTIVATION_DM_CLEANUP:')
  const dmConversationsRemoved = requireOutputMarker(runLinkedSql(`
    with deleted_rows as (
      delete from public.dm_conversations conversations
      where conversations.id in (${uuidSql(dmConversationIds)})
        and cardinality(conversations.participants) = 2
        and not exists (
          select 1
          from unnest(conversations.participants) participant
          where participant not in (${uuidSql(userIds)})
        )
      returning id
    )
    select 'ACTIVATION_DM_CONVERSATION_CLEANUP:' || count(*) from deleted_rows;
  `), 'ACTIVATION_DM_CONVERSATION_CLEANUP:')
  const pinHeartsRemoved = requireOutputMarker(runLinkedSql(`
    with deleted_rows as (
      delete from public.shadow_pin_image_hearts hearts
      where hearts.user_id in (${uuidSql(userIds)})
        and (
          hearts.image_id in (${uuidSql(pinHeartImageIds)})
          or hearts.user_id in (${uuidSql(userIds)})
      )
      returning image_id
    )
    select 'ACTIVATION_PIN_HEART_CLEANUP:' || count(*) from deleted_rows;
  `), 'ACTIVATION_PIN_HEART_CLEANUP:')
  runLinkedSql(`
    update public.shadow_pin_images images
    set heart_count = (
      select count(*)::integer
      from public.shadow_pin_image_hearts hearts
      where hearts.image_id = images.id
    )
    where images.id in (${uuidSql(pinHeartImageIds)});
    select 'ACTIVATION_PIN_HEART_RECOUNTED:1';
  `)
  must(dmMessagesRemoved.length === 1 && dmConversationsRemoved.length === 1 && pinHeartsRemoved.length === 1, 'Activation action cleanup did not return complete counts.')

  runLinkedSql(`
    delete from private.signup_invite_redemptions
    where invite_id in (${uuidSql(inviteIds)})
       or redeemed_by in (${uuidSql(userIds)})
       or lower(redeemed_email) in (${textSql(emails)});

    delete from private.signup_invites
    where id in (${uuidSql(inviteIds)})
       or lower(email_lock) in (${textSql(emails)});

    select 'ACTIVATION_PRIVATE_CLEANUP_APPLIED:1';
  `)

  let usersRemoved = 0
  for (const profile of journal.profiles) {
    if (!profile.userId) continue
    const authUser = await getAuthUserById(admin, profile.userId)
    if (!authUser) continue
    must(authUser.email?.toLowerCase() === profile.email, `${profile.profile} Auth user email changed before cleanup.`)
    const { error } = await admin.auth.admin.deleteUser(authUser.id, false)
    assertNoError(error, `Delete ${profile.profile} disposable auth user`)
    usersRemoved += 1
  }

  const cleanupSql = `
    delete from public.user_activation_journeys
    where user_id in (${uuidSql(userIds)});

    delete from public.users
    where id in (${uuidSql(userIds)})
      and username in (${textSql(usernames)});

    select 'ACTIVATION_CLEANUP_PROOF:' ||
      (select count(*) from private.signup_invites
        where id in (${uuidSql(inviteIds)})
           or lower(email_lock) in (${textSql(emails)})) || ':' ||
      (select count(*) from private.signup_invite_redemptions
        where invite_id in (${uuidSql(inviteIds)})
           or redeemed_by in (${uuidSql(userIds)})
           or lower(redeemed_email) in (${textSql(emails)})) || ':' ||
      (select count(*) from auth.users
        where id in (${uuidSql(userIds)})
           or lower(email) in (${textSql(emails)})) || ':' ||
      (select count(*) from public.users
        where id in (${uuidSql(userIds)})
           or username in (${textSql(usernames)})) || ':' ||
      (select count(*) from public.user_activation_journeys
        where user_id in (${uuidSql(userIds)})
           or user_id in (
             select id from public.users where username in (${textSql(usernames)})
           )) || ':' ||
      (select count(*) from public.messages
        where id in (${uuidSql(messageIds)})
           or user_id in (${uuidSql(userIds)})
           or content in (${textSql(messageContents)})) || ':' ||
      (select count(*) from public.dm_messages
        where id in (${uuidSql(dmMessageIds)})
           or sender_id in (${uuidSql(userIds)})
           or content in (${textSql(messageContents)})) || ':' ||
      (select count(*) from public.dm_conversations
        where id in (${uuidSql(dmConversationIds)})) || ':' ||
      (select count(*) from public.shadow_pin_image_hearts
        where user_id in (${uuidSql(userIds)})) || ':' ||
      (select count(*) from storage.objects
        where owner_id in (${textSql(userIds)})) || ':' ||
      (select count(*) from public.shadow_pin_activity_sessions
        where user_id in (${uuidSql(userIds)})) || ':' ||
      (select count(*) from public.shadow_pin_activity_events
        where user_id in (${uuidSql(userIds)})) || ':' ||
      (select count(*) from public.notification_events
        where user_id in (${uuidSql(userIds)})
           or message_id in (${uuidSql(messageIds)})
           or dm_message_id in (${uuidSql(dmMessageIds)})
           or conversation_id in (${uuidSql(dmConversationIds)})) || ':' ||
      (select count(*) from public.activity_events
        where user_id in (${uuidSql(userIds)})
           or actor_id in (${uuidSql(userIds)})
           or message_id in (${uuidSql(messageIds)})
           or dm_message_id in (${uuidSql(dmMessageIds)})
           or conversation_id in (${uuidSql(dmConversationIds)}));
  `
  const proof = requireOutputMarker(runLinkedSql(cleanupSql), 'ACTIVATION_CLEANUP_PROOF:')
  must(proof.length === 14 && proof.every(value => value === 0), `Cleanup proof was not zero: ${proof.join(':')}`)

  for (const profile of journal.profiles) {
    if (!profile.userId) continue
    const authUser = await getAuthUserById(admin, profile.userId)
    must(!authUser, `${profile.profile} Auth user remains after cleanup.`)
  }

  await rm(journalPath, { force: true })
  return {
    usersRemoved,
    messagesRemoved,
    dmMessagesRemoved: dmMessagesRemoved[0],
    dmConversationsRemoved: dmConversationsRemoved[0],
    pinHeartsRemoved: pinHeartsRemoved[0],
    invitesTargeted: inviteIds.length,
    remaining: {
      invites: proof[0],
      redemptions: proof[1],
      authUsers: proof[2],
      profiles: proof[3],
      journeys: proof[4],
      messages: proof[5],
      dmMessages: proof[6],
      dmConversations: proof[7],
      pinHearts: proof[8],
      storageObjects: proof[9],
      pinActivitySessions: proof[10],
      pinActivityEvents: proof[11],
      notificationEvents: proof[12],
      activityEvents: proof[13],
    },
    recoveryJournalRemoved: true,
  }
}

const supabaseUrl = firstEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
const supabaseAnonKey = firstEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY')
must(supabaseUrl && supabaseAnonKey, 'Missing Supabase URL or browser-safe anon key.')
const projectRef = new URL(supabaseUrl).hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i)?.[1]
must(projectRef, 'Unable to identify the hosted Supabase project reference.')
const serviceRoleKey = resolveServiceRoleKey(supabaseUrl, projectRef)
sensitiveValues.add(serviceRoleKey)
sensitiveValues.add(supabaseAnonKey)

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const backendPreflight = await verifyLinkedBackendPreflight(projectRef)

if (args['cleanup-only']) {
  const recoveryPath = path.resolve(repoRoot, String(args.recovery || ''))
  must(args.recovery, 'Recovery-only mode requires --recovery=<cleanup-state-path>.')
  must(isPathInside(artifactRoot, recoveryPath), 'Recovery journal must stay under the Candidate 4 verifier artifact root.')
  must(path.basename(recoveryPath) === '.cleanup-state.json', 'Recovery path must target a Candidate 4 cleanup-state journal.')
  const resolvedArtifactRoot = await realpath(artifactRoot)
  const resolvedRecoveryPath = await realpath(recoveryPath)
  must(isPathInside(resolvedArtifactRoot, resolvedRecoveryPath), 'Resolved recovery journal escaped the Candidate 4 verifier artifact root.')
  must(path.basename(resolvedRecoveryPath) === '.cleanup-state.json', 'Resolved recovery path is not a Candidate 4 cleanup-state journal.')
  const journal = JSON.parse(await readFile(resolvedRecoveryPath, 'utf8'))
  validateRecoveryJournal(journal, projectRef)
  must(path.basename(path.dirname(resolvedRecoveryPath)) === journal.runId, 'Recovery journal parent directory does not match its run ID.')
  const cleanup = await cleanupTestState({ admin, journal, journalPath: resolvedRecoveryPath })
  const outputPath = path.join(path.dirname(resolvedRecoveryPath), 'cleanup-summary.json')
  await writeFile(outputPath, `${JSON.stringify({ status: 'passed', cleanup, completedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  console.log(`Activation recovery cleanup passed: ${outputPath}`)
  process.exit(0)
}

const baseUrl = String(args['base-url'] || firstEnv('PLAYWRIGHT_BASE_URL')).replace(/\/$/u, '')
const deployId = String(args['deploy-id'] || firstEnv('ACTIVATION_TRIAL_DEPLOY_ID')).trim()
const assertedProjectRef = String(args['project-ref'] || firstEnv('ACTIVATION_EXPECTED_PROJECT_REF')).trim()
must(baseUrl, 'PLAYWRIGHT_BASE_URL or --base-url is required; no production URL is assumed.')
must(/^[a-z0-9-]{6,160}$/iu.test(deployId), 'ACTIVATION_TRIAL_DEPLOY_ID or --deploy-id is required.')
must(/^[a-z0-9-]{10,40}$/u.test(assertedProjectRef), 'ACTIVATION_EXPECTED_PROJECT_REF or --project-ref is required.')
must(assertedProjectRef === projectRef, 'Explicit Supabase project ref does not match the configured browser backend.')
const parsedBaseUrl = new URL(baseUrl)
must(parsedBaseUrl.protocol === 'https:', 'Activation verification requires an HTTPS trial origin.')
must(!parsedBaseUrl.username && !parsedBaseUrl.password, 'Activation trial URL must not contain credentials.')
must((parsedBaseUrl.pathname === '/' || parsedBaseUrl.pathname === '') && !parsedBaseUrl.search && !parsedBaseUrl.hash, 'Activation trial URL must be an origin only.')
const baseHost = parsedBaseUrl.hostname.toLowerCase()
must(baseHost.endsWith('.netlify.app'), 'Activation verification must target an isolated Netlify deploy URL.')
must(!['shadochat.online', 'www.shadochat.online', 'shadowchat-2-0-wave-one.netlify.app'].includes(baseHost), 'Refusing to run Candidate 4 verification against a production or shared branch alias.')

const deployEvidence = await verifyNetlifyDeploy({ baseUrl, deployId })
deployEvidence.supabaseBundleBinding = await verifyDeploySupabaseBinding({
  baseUrl,
  expectedSupabaseHost: new URL(supabaseUrl).hostname.toLowerCase(),
})
deployEvidence.readOnlyBrowserBootstrap = await verifyReadOnlyBrowserBootstrap({
  baseUrl,
  expectedSupabaseHost: new URL(supabaseUrl).hostname.toLowerCase(),
})
const runLabel = sanitizeToken(firstEnv('ACTIVATION_RUN_ID') || 'activation').slice(0, 36) || 'activation'
const runToken = `${runLabel}-${Date.now()}-${randomBytes(6).toString('hex')}`.slice(0, 80)
const artifactDir = path.join(artifactRoot, runToken)
const journalPath = path.join(artifactDir, '.cleanup-state.json')

const buildProfile = (profile, suffix, actionKind) => {
  const identity = expectedProfileIdentity(runToken, suffix)
  const password = `Shado!${randomBytes(12).toString('hex')}Aa9`
  sensitiveValues.add(identity.email)
  sensitiveValues.add(password)
  return {
    profile,
    suffix,
    actionKind,
    email: identity.email,
    password,
    username: identity.username,
    displayName: suffix.startsWith('pixel') ? `Activation Pixel ${actionKind}` : `Activation iPhone ${actionKind}`,
    messageContent: identity.messageContent,
    inviteId: null,
    inviteCode: null,
    userId: null,
    messageId: null,
    dmMessageId: null,
    dmConversationId: null,
    dmRecipientUserId: null,
    pinHeartImageId: null,
  }
}

const comfort130Preferences = Object.freeze({
  version: 1,
  preset: 'custom',
  motion: 'none',
  transparency: 'solid',
  contrast: 'high',
  textScale: 130,
  density: 'spacious',
  touchTarget: 'large',
  autoplay: 'never',
  uiSounds: false,
  celebrationSounds: false,
  gameMusic: false,
  gameSfx: false,
  haptics: false,
})

const profiles = [
  {
    name: 'pixel-chromium-general-chat',
    engine: chromium,
    device: devices['Pixel 7'],
    installOutcome: 'simulated-prompt',
    navigationRecovery: true,
    isolationProbe: true,
    account: buildProfile('pixel-chromium-general-chat', 'pixel-chat', 'group_message'),
  },
  {
    name: 'pixel-chromium-direct-message',
    engine: chromium,
    device: devices['Pixel 7'],
    installOutcome: 'later',
    dmRecipientProfile: 'iphone-webkit-general-chat',
    account: buildProfile('pixel-chromium-direct-message', 'pixel-dm', 'direct_message'),
  },
  {
    name: 'pixel-chromium-shadow-pin',
    engine: chromium,
    device: devices['Pixel 7'],
    installOutcome: 'later',
    account: buildProfile('pixel-chromium-shadow-pin', 'pixel-pin', 'shadow_pin_heart'),
  },
  {
    name: 'iphone-webkit-general-chat',
    engine: webkit,
    device: devices['iPhone 14'],
    installOutcome: 'guide-later',
    navigationRecovery: true,
    isolationProbe: true,
    account: buildProfile('iphone-webkit-general-chat', 'iphone-chat', 'group_message'),
  },
  {
    name: 'iphone-webkit-direct-message',
    engine: webkit,
    device: devices['iPhone 14'],
    installOutcome: 'later',
    dmRecipientProfile: 'pixel-chromium-general-chat',
    account: buildProfile('iphone-webkit-direct-message', 'iphone-dm', 'direct_message'),
  },
  {
    name: 'iphone-webkit-shadow-pin',
    engine: webkit,
    device: devices['iPhone 14'],
    installOutcome: 'later',
    account: buildProfile('iphone-webkit-shadow-pin', 'iphone-pin', 'shadow_pin_heart'),
  },
]

const journal = {
  schemaVersion: 3,
  kind: 'shadowchat-first-run-activation-browser-cleanup',
  projectRef,
  runId: runToken,
  startedAt: new Date().toISOString(),
  serverStartedEpoch: backendPreflight.serverStartedEpoch,
  profiles: profiles.map(profile => profile.account),
}
validateRecoveryJournal(journal, projectRef)
verifyNoPreexistingTargets(journal)

const inviteCreatorOutput = runLinkedSql(`
  select 'ACTIVATION_FULL_ADMIN:' || count(*) || ':' || coalesce((
    select user_id::text
    from public.user_roles
    where role = 'admin'
    order by user_id
    limit 1
  ), 'NONE')
  from public.user_roles
  where role = 'admin';
`)
const fullAdminProof = requireIdentityCountMarker(inviteCreatorOutput, 'ACTIVATION_FULL_ADMIN:')
must(fullAdminProof.count === 1, 'Canonical invite issuance requires exactly one full admin.')
const inviteCreatorId = fullAdminProof.id
must(inviteCreatorId, 'Canonical invite issuance could not resolve the sole full admin.')

await mkdir(artifactDir, { recursive: true })
await writeRecoveryJournal(journalPath, journal)

const pageEvidence = []
const checks = []

const recordPageEvidence = (page, profileName) => {
  const evidence = {
    profile: profileName,
    consoleErrors: [],
    browserDiagnostics: [],
    approvedNavigationAborts: [],
    approvedSecurityDenials: [],
    approvedSecurityDiagnostics: [],
    pageErrors: [],
    httpErrors: [],
    requestFailures: [],
    expectedSupabaseSeen: false,
    unexpectedSupabaseProjectCount: 0,
    unexpectedNavigationOriginCount: 0,
  }
  const supabaseHosts = new Set()
  let activeSecurityProbeUserId = null

  page.on('console', message => {
    if (message.type() !== 'error') return
    const text = sanitizeText(message.text())
    if (text.includes('Content Security Policy') && text.toLowerCase().includes('report-only')) {
      evidence.browserDiagnostics.push(text)
    } else {
      evidence.consoleErrors.push(text)
    }
  })
  page.on('pageerror', error => evidence.pageErrors.push(sanitizeText(error.message)))
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return
    try {
      if (new URL(frame.url()).origin !== new URL(baseUrl).origin) evidence.unexpectedNavigationOriginCount += 1
    } catch {
      evidence.unexpectedNavigationOriginCount += 1
    }
  })
  page.on('request', request => {
    try {
      const host = new URL(request.url()).hostname
      if (host.endsWith('.supabase.co')) supabaseHosts.add(host)
    } catch {
      // Ignore non-URL browser internals.
    }
  })
  page.on('requestfailed', request => {
    let target = request.url()
    let url = null
    try {
      url = new URL(target)
      target = `${url.origin}${url.pathname}`
    } catch {
      // Keep the sanitized raw value.
    }
    const failure = {
      method: request.method(),
      target: sanitizeText(target),
      error: sanitizeText(request.failure()?.errorText || 'request failed'),
    }
    const navigationCancellation = /aborted|cancelled/iu.test(failure.error)
    const expectedHost = new URL(supabaseUrl).hostname
    const approvedMediaCancellation = navigationCancellation
      && request.method() === 'GET'
      && url?.hostname === expectedHost
      && (url.pathname.startsWith('/storage/v1/object/') || url.pathname.startsWith('/storage/v1/render/image/'))
    const approvedReadCursorCancellation = navigationCancellation
      && request.method() === 'POST'
      && url?.hostname === expectedHost
      && url.pathname === '/rest/v1/rpc/set_user_read_cursor'
    if (approvedMediaCancellation || approvedReadCursorCancellation) evidence.approvedNavigationAborts.push(failure)
    else evidence.requestFailures.push(failure)
  })
  page.on('response', response => {
    if (response.status() < 400) return
    const url = new URL(response.url())
    const record = {
      method: response.request().method(),
      status: response.status(),
      target: sanitizeText(`${url.origin}${url.pathname}`),
      body: null,
    }
    const approvedCrossOwnerDenial = response.request().method() === 'PATCH'
      && url.hostname === new URL(supabaseUrl).hostname
      && url.pathname === '/rest/v1/user_activation_journeys'
      && url.searchParams.get('select') === 'user_id,revision,presentation_state'
      && url.searchParams.get('user_id') === `eq.${activeSecurityProbeUserId}`
      && [...url.searchParams.keys()].length === 2
      && uuidPattern.test(activeSecurityProbeUserId || '')
      && (response.status() === 401 || response.status() === 403)
    if (approvedCrossOwnerDenial) evidence.approvedSecurityDenials.push(record)
    else evidence.httpErrors.push(record)
    void response.text()
      .then(body => { record.body = sanitizeText(body) })
      .catch(() => undefined)
  })

  Object.defineProperty(evidence, 'finalizeHosts', {
    enumerable: false,
    value: (assertExpected = true) => {
      const expectedHost = new URL(supabaseUrl).hostname
      evidence.expectedSupabaseSeen = supabaseHosts.has(expectedHost)
      evidence.unexpectedSupabaseProjectCount = [...supabaseHosts].filter(host => host !== expectedHost).length
      if (!assertExpected) return
      must(evidence.expectedSupabaseSeen, `${profileName} never contacted the configured shared Supabase project.`)
      must(evidence.unexpectedSupabaseProjectCount === 0, `${profileName} contacted an unexpected Supabase project.`)
      must(evidence.unexpectedNavigationOriginCount === 0, `${profileName} navigated away from the isolated trial origin.`)
    },
  })
  Object.defineProperty(evidence, 'beginSecurityProbe', {
    enumerable: false,
    value: userId => {
      must(uuidPattern.test(userId), `${profileName} security probe target is invalid.`)
      must(activeSecurityProbeUserId == null, `${profileName} security probe was already active.`)
      activeSecurityProbeUserId = userId
    },
  })
  Object.defineProperty(evidence, 'endSecurityProbe', {
    enumerable: false,
    value: () => { activeSecurityProbeUserId = null },
  })
  pageEvidence.push(evidence)
  return evidence
}

const capture = async (page, name) => {
  const fileName = `${sanitizeToken(name)}.png`
  await page.screenshot({
    path: path.join(artifactDir, fileName),
    fullPage: false,
    animations: 'disabled',
  })
  return fileName
}

const assertNoHorizontalOverflow = async (page, label, locator = null) => {
  const geometry = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.visualViewport?.height ?? window.innerHeight,
    visualViewportWidth: window.visualViewport?.width ?? window.innerWidth,
    visualViewportOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body?.scrollWidth ?? 0,
  }))
  must(geometry.documentScrollWidth <= geometry.viewportWidth + 1, `${label} document overflow: ${JSON.stringify(geometry)}`)
  must(geometry.bodyScrollWidth <= geometry.viewportWidth + 1, `${label} body overflow: ${JSON.stringify(geometry)}`)

  if (locator) {
    const box = await locator.boundingBox()
    must(box, `${label} proof surface has no bounding box.`)
    must(box.x >= -1 && box.x + box.width <= geometry.viewportWidth + 1, `${label} proof surface overflows horizontally: ${JSON.stringify({ box, geometry })}`)
    const surface = await locator.evaluate(element => {
      const root = element
      const offenders = []
      const candidates = [root, ...root.querySelectorAll('button, a, input, textarea, select, [role], [contenteditable="true"]')]
      for (const candidate of candidates) {
        const style = window.getComputedStyle(candidate)
        const rect = candidate.getBoundingClientRect()
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue
        const leftEdge = window.visualViewport?.offsetLeft ?? 0
        const rightEdge = leftEdge + (window.visualViewport?.width ?? window.innerWidth)
        if (rect.left < leftEdge - 1 || rect.right > rightEdge + 1) {
          offenders.push({
            tag: candidate.tagName.toLowerCase(),
            role: candidate.getAttribute('role'),
            testId: candidate.getAttribute('data-testid'),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
          })
        }
      }
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        offenders: offenders.slice(0, 12),
      }
    })
    must(surface.scrollWidth <= surface.clientWidth + 1, `${label} proof surface scroll overflow: ${JSON.stringify(surface)}`)
    must(surface.offenders.length === 0, `${label} visible controls overflow: ${JSON.stringify(surface.offenders)}`)
  }
  checks.push({ name: `${label}-no-horizontal-overflow`, passed: true, geometry })
  return geometry
}

const assertComfort130 = async (page, label) => {
  const state = await page.evaluate(() => ({
    textScale: document.documentElement.getAttribute('data-comfort-text-scale'),
    preset: document.documentElement.getAttribute('data-comfort-preset'),
    fontSize: getComputedStyle(document.documentElement).fontSize,
  }))
  must(state.textScale === '130', `${label} did not retain 130% Comfort text scale.`)
  must(state.preset === 'custom', `${label} replaced the disposable custom Comfort settings.`)
  checks.push({ name: `${label}-comfort-130`, passed: true, state })
  return state
}

const assertFocusedFooterGeometry = async (page, label, input, footer) => {
  await input.focus()
  await page.waitForTimeout(250)
  const geometry = await page.evaluate(({ inputSelector, footerSelector }) => {
    const inputElement = document.querySelector(inputSelector)
    const footerElement = document.querySelector(footerSelector)
    const rectOf = element => {
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height }
    }
    return {
      activeWithinInput: inputElement instanceof HTMLElement && (document.activeElement === inputElement || inputElement.contains(document.activeElement)),
      input: rectOf(inputElement),
      footer: rectOf(footerElement),
      viewport: {
        left: window.visualViewport?.offsetLeft ?? 0,
        top: window.visualViewport?.offsetTop ?? 0,
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      },
      textScale: document.documentElement.getAttribute('data-comfort-text-scale'),
    }
  }, {
    inputSelector: await input.evaluate(element => {
      const marker = `activation-input-${Math.random().toString(36).slice(2)}`
      element.setAttribute('data-activation-qa-marker', marker)
      return `[data-activation-qa-marker="${marker}"]`
    }),
    footerSelector: await footer.evaluate(element => {
      const marker = `activation-footer-${Math.random().toString(36).slice(2)}`
      element.setAttribute('data-activation-qa-marker', marker)
      return `[data-activation-qa-marker="${marker}"]`
    }),
  })
  must(geometry.activeWithinInput, `${label} input did not retain focus.`)
  must(geometry.textScale === '130', `${label} focused footer was not rendered at 130% Comfort scale.`)
  must(geometry.input && geometry.footer, `${label} focused footer geometry was unavailable.`)
  const viewportRight = geometry.viewport.left + geometry.viewport.width
  const viewportBottom = geometry.viewport.top + geometry.viewport.height
  for (const [surface, rect] of [['input', geometry.input], ['footer', geometry.footer]]) {
    must(rect.left >= geometry.viewport.left - 1 && rect.right <= viewportRight + 1, `${label} ${surface} overflowed horizontally.`)
    must(rect.top < viewportBottom && rect.bottom > geometry.viewport.top, `${label} ${surface} was outside the visual viewport.`)
  }
  must(geometry.input.height >= 44, `${label} focused input was shorter than a mobile touch target.`)
  checks.push({ name: `${label}-focused-footer-geometry`, passed: true, geometry })
  return geometry
}

const verifyCrossOwnerIsolation = async (page, account, otherAccount, evidence) => {
  const before = await getJourney(otherAccount.userId)
  must(before, `${account.profile} cross-owner target journey was unavailable.`)
  const consoleStart = evidence.consoleErrors.length
  evidence.beginSecurityProbe(otherAccount.userId)
  let result
  try {
    result = await page.evaluate(async ({ apiUrl, anonKey, project, targetUserId }) => {
      const raw = localStorage.getItem(`sb-${project}-auth-token`)
      if (!raw) return { session: false }
      const stored = JSON.parse(raw)
      const accessToken = stored?.access_token || stored?.currentSession?.access_token || stored?.session?.access_token
      if (!accessToken) return { session: false }
      const headers = {
        apikey: anonKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      }
      const target = `${apiUrl}/rest/v1/user_activation_journeys?select=user_id,revision,presentation_state&user_id=eq.${encodeURIComponent(targetUserId)}`
      const read = await fetch(target, { headers })
      const readRows = await read.json().catch(() => null)
      const write = await fetch(target, {
        method: 'PATCH',
        headers: { ...headers, prefer: 'return=representation' },
        body: JSON.stringify({ presentation_state: 'minimized' }),
      })
      const writeBody = await write.text()
      return {
        session: true,
        readStatus: read.status,
        readRowCount: Array.isArray(readRows) ? readRows.length : -1,
        writeStatus: write.status,
        writeBodyPresent: Boolean(writeBody),
      }
    }, { apiUrl: supabaseUrl, anonKey: supabaseAnonKey, project: projectRef, targetUserId: otherAccount.userId })
  } finally {
    evidence.endSecurityProbe()
  }
  must(result.session, `${account.profile} could not resolve its authenticated browser session.`)
  must(result.readStatus === 200 && result.readRowCount === 0, `${account.profile} could read a cross-owner activation row.`)
  must(result.writeStatus === 401 || result.writeStatus === 403, `${account.profile} direct cross-owner activation write was not explicitly denied.`)
  const after = await getJourney(otherAccount.userId)
  must(after && after.revision === before.revision && after.presentation_state === before.presentation_state, `${account.profile} cross-owner write changed the target journey.`)
  must(evidence.approvedSecurityDenials.length === 1, `${account.profile} did not record exactly one approved cross-owner denial.`)
  const probeConsoleErrors = evidence.consoleErrors.splice(consoleStart)
  const approvedConsoleErrors = probeConsoleErrors.filter(message => /^Failed to load resource: the server responded with a status of 403 \(\)$/u.test(message))
  const unexpectedConsoleErrors = probeConsoleErrors.filter(message => !approvedConsoleErrors.includes(message))
  evidence.approvedSecurityDiagnostics.push(...approvedConsoleErrors)
  evidence.consoleErrors.push(...unexpectedConsoleErrors)
  must(approvedConsoleErrors.length <= 1, `${account.profile} emitted duplicate console diagnostics for one approved security denial.`)
  checks.push({
    name: `${account.profile}-authenticated-cross-owner-row-denial`,
    passed: true,
    readStatus: result.readStatus,
    readRowCount: result.readRowCount,
    writeStatus: result.writeStatus,
    approvedConsoleDiagnosticCount: approvedConsoleErrors.length,
  })
}

const dismissForegroundRelease = async page => {
  const close = page.getByRole('button', { name: /^(Close update notes|Done|Got It|Later)$/i }).first()
  if (await close.isVisible().catch(() => false)) {
    await close.click()
    await page.waitForTimeout(300)
  }
}

const getJourney = async userId => {
  const result = await admin.from('user_activation_journeys').select('*').eq('user_id', userId).maybeSingle()
  assertNoError(result.error, 'Read activation journey from the server')
  return result.data
}

const waitForJourney = (label, userId, predicate) => poll(label, async () => {
  const journey = await getJourney(userId)
  return journey && predicate(journey) ? journey : null
})

const createInvite = async account => {
  const output = runLinkedSql(`
    select 'ACTIVATION_INVITE_CREATED:' || id::text || ':' || invite_code
    from private.create_signup_invite(
      ${sqlLiteral(inviteCreatorId)}::uuid,
      ${sqlLiteral(account.email)}
    );
  `)
  const receipt = String(output).match(/ACTIVATION_INVITE_CREATED:([0-9a-f-]{36}):([A-F0-9]{6}(?:-[A-F0-9]{6}){5})/u)
  must(receipt && uuidPattern.test(receipt[1]), `${account.profile} canonical invite issuance returned an invalid receipt.`)
  account.inviteId = receipt[1]
  account.inviteCode = receipt[2]
  sensitiveValues.add(account.inviteCode)
  await writeRecoveryJournal(journalPath, journal)
  return { id: account.inviteId }
}

const findProfileByUsername = async username => {
  const result = await admin.from('users').select('id,username,created_at').eq('username', username).maybeSingle()
  assertNoError(result.error, 'Resolve disposable profile after signup')
  return result.data
}

const verifyGenuineEnrollment = async account => {
  const journey = await waitForJourney(
    `${account.profile} activation enrollment`,
    account.userId,
    row => row.enrollment_source === 'invite_signup' && row.current_step === 'identity' && row.revision === 1
  )
  const output = runLinkedSql(`
    select 'ACTIVATION_ENROLLMENT_PROOF:' || count(*)
    from public.user_activation_journeys journey
    join auth.users auth_user on auth_user.id = journey.user_id
    join private.signup_invite_redemptions redemption on redemption.redeemed_by = journey.user_id
    join private.signup_invites invite on invite.id = redemption.invite_id
    join private.activation_rollouts rollout on rollout.rollout_key = 'first_run_activation_v1'
    where journey.user_id = ${sqlLiteral(account.userId)}::uuid
      and redemption.invite_id = ${sqlLiteral(account.inviteId)}::uuid
      and invite.created_by = ${sqlLiteral(inviteCreatorId)}::uuid
      and invite.redeemed_by = journey.user_id
      and lower(auth_user.email) = ${sqlLiteral(account.email)}
      and lower(invite.email_lock) = ${sqlLiteral(account.email)}
      and lower(redemption.redeemed_email) = ${sqlLiteral(account.email)}
      and auth_user.created_at >= rollout.started_at
      and redemption.redeemed_at >= rollout.started_at
      and invite.created_at >= to_timestamp(${journal.serverStartedEpoch})
      and auth_user.created_at >= to_timestamp(${journal.serverStartedEpoch})
      and redemption.redeemed_at >= to_timestamp(${journal.serverStartedEpoch})
      and journey.enrolled_at >= to_timestamp(${journal.serverStartedEpoch});
  `)
  const proof = requireOutputMarker(output, 'ACTIVATION_ENROLLMENT_PROOF:')
  must(proof.length === 1 && proof[0] === 1, `${account.profile} did not satisfy genuine post-rollout invite enrollment.`)
  checks.push({ name: `${account.profile}-genuine-server-enrollment`, passed: true, initialRevision: journey.revision })
  return journey
}

const provisionAccount = async account => {
  // generateLink(type=signup) exercises canonical Supabase Auth user creation,
  // including the Before User Created invite hook, without sending an email.
  // Email delivery/confirmation-link delivery is intentionally outside this
  // browser proof; the disposable user is confirmed explicitly before sign-in.
  const generatedSignup = await admin.auth.admin.generateLink({
    type: 'signup',
    email: account.email,
    password: account.password,
    options: {
      data: {
        username: account.username,
        invite_code: account.inviteCode,
      },
    },
  })
  assertNoError(generatedSignup.error, `Create ${account.profile} no-email Auth signup`)
  must(generatedSignup.data.user && uuidPattern.test(generatedSignup.data.user.id), `${account.profile} no-email Auth signup returned no valid user.`)
  account.userId = generatedSignup.data.user.id
  await writeRecoveryJournal(journalPath, journal)

  const profile = await poll(`${account.profile} auth profile creation`, () => findProfileByUsername(account.username))
  must(profile.id === account.userId, `${account.profile} Auth profile belongs to a different user.`)
  await verifyGenuineEnrollment(account)

  const confirmation = await admin.auth.admin.updateUserById(account.userId, { email_confirm: true })
  assertNoError(confirmation.error, `Confirm ${account.profile} disposable email`)
  checks.push({
    name: `${account.profile}-canonical-no-email-auth-signup`,
    passed: true,
    emailDeliveryVerified: false,
  })
}

const signInAndEnterJourney = async (page, account) => {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  assertTrialOrigin(page, baseUrl, `${account.profile} sign-in navigation`)

  const journeySurface = page.getByTestId('first-run-activation-journey')
  await page.getByLabel('Email').fill(account.email)
  await page.locator('input[name="password"]').fill(account.password)
  assertTrialOrigin(page, baseUrl, `${account.profile} sign-in submit`)
  await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click()

  assertTrialOrigin(page, baseUrl, `${account.profile} authenticated activation entry`)
  await journeySurface.waitFor({ timeout: timeoutMs })
  must(await page.getByRole('heading', { name: 'Add Shadow Chat and turn on alerts', exact: true }).count() === 0, `${account.profile} displayed legacy PhoneInstallOnboarding over activation.`)
  checks.push({ name: `${account.profile}-activation-excludes-legacy-install-onboarding`, passed: true })
  return journeySurface
}

const firstActionButtonName = {
  group_message: /^Say hello Open General Chat and send your first message\.$/i,
  direct_message: /^Start a DM Choose a member and begin a private conversation\.$/i,
  shadow_pin_heart: /^Heart a Pin Explore ShadowPin and heart something you like\.$/i,
}

const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

let pinCategoryTargetPromise = null
const getPinCategoryTarget = async () => {
  if (!pinCategoryTargetPromise) {
    pinCategoryTargetPromise = (async () => {
      const images = await admin.from('shadow_pin_images')
        .select('id,category_id,title')
        .is('deleted_at', null)
        .not('category_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50)
      assertNoError(images.error, 'Resolve a visible ShadowPin action target')
      for (const image of images.data || []) {
        const category = await admin.from('shadow_pin_categories')
          .select('id,title')
          .eq('id', image.category_id)
          .is('deleted_at', null)
          .maybeSingle()
        assertNoError(category.error, 'Resolve ShadowPin target category')
        if (category.data) {
          return {
            ...category.data,
            imageId: image.id,
            imageTitle: image.title,
          }
        }
      }
      throw new Error('No active ShadowPin category with an image is available for activation QA.')
    })()
  }
  return pinCategoryTargetPromise
}

const verifyNavigationRecovery = async (page, profile, journeySurface, resumeCard) => {
  const { account } = profile
  await page.keyboard.press('Escape')
  await waitForJourney(
    `${account.profile} Escape minimization`,
    account.userId,
    row => row.current_step === 'identity' && row.presentation_state === 'minimized' && row.dismissed_at
  )
  await resumeCard.waitFor({ timeout: timeoutMs })
  await assertNoHorizontalOverflow(page, `${account.profile}-escape-minimized`, resumeCard)
  await capture(page, `${account.profile}-02-escape-minimized`)
  checks.push({ name: `${account.profile}-escape-minimize-resume`, passed: true })

  await resumeCard.getByRole('button', { name: 'Review setup', exact: true }).click()
  await journeySurface.waitFor({ timeout: timeoutMs })
  await waitForJourney(
    `${account.profile} expanded after Escape`,
    account.userId,
    row => row.current_step === 'identity' && row.presentation_state === 'expanded' && !row.dismissed_at
  )

  await page.evaluate(() => window.history.back())
  await waitForJourney(
    `${account.profile} Browser Back minimization`,
    account.userId,
    row => row.current_step === 'identity' && row.presentation_state === 'minimized' && row.dismissed_at
  )
  assertTrialOrigin(page, baseUrl, `${account.profile} Browser Back activation history`)
  await resumeCard.waitFor({ timeout: timeoutMs })
  await assertNoHorizontalOverflow(page, `${account.profile}-browser-back-minimized`, resumeCard)
  await capture(page, `${account.profile}-03-browser-back-minimized`)
  checks.push({ name: `${account.profile}-browser-back-minimize-resume`, passed: true })

  await resumeCard.getByRole('button', { name: 'Review setup', exact: true }).click()
  await journeySurface.waitFor({ timeout: timeoutMs })
  await waitForJourney(
    `${account.profile} expanded before reload`,
    account.userId,
    row => row.current_step === 'identity' && row.presentation_state === 'expanded' && !row.dismissed_at
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  assertTrialOrigin(page, baseUrl, `${account.profile} expanded resumability reload`)
  await page.getByRole('heading', { name: 'Start with your identity', exact: true }).waitFor({ timeout: timeoutMs })
  await assertNoHorizontalOverflow(page, `${account.profile}-reloaded-expanded`, journeySurface)
  await capture(page, `${account.profile}-04-reloaded-expanded`)
  checks.push({ name: `${account.profile}-server-resume-after-reload`, passed: true })
}

const verifyGroupAction = async (page, account, resumeCard) => {
  await page.locator('textarea[name^="message-composer-"]:visible').first().waitFor({ timeout: timeoutMs })
  await assertNoHorizontalOverflow(page, `${account.profile}-selected-action-chat`, resumeCard)
  const composer = page.locator('textarea[name^="message-composer-"]:visible').first()
  const composerForm = composer.locator('xpath=ancestor::form[1]')
  await assertNoHorizontalOverflow(page, `${account.profile}-group-composer`, composerForm)
  await assertFocusedFooterGeometry(page, `${account.profile}-group-composer`, composer, composerForm)
  await capture(page, `${account.profile}-07-group-handoff-focused`)
  await composer.fill(account.messageContent)
  assertTrialOrigin(page, baseUrl, `${account.profile} canonical group message submit`)
  await composerForm.locator('button[aria-label^="Send message"]').click()
  const message = await poll(`${account.profile} canonical group message`, async () => {
    const result = await admin.from('messages')
      .select('id,user_id,content,created_at')
      .eq('user_id', account.userId)
      .eq('content', account.messageContent)
      .maybeSingle()
    assertNoError(result.error, `Read ${account.profile} activation message`)
    return result.data
  })
  account.messageId = message.id
  await writeRecoveryJournal(journalPath, journal)
  return message.id
}

const openDisposableDm = async (page, recipient) => {
  const start = page.getByRole('button', { name: 'Start new conversation', exact: true })
  if (await start.isVisible().catch(() => false)) await start.click()
  const search = page.getByPlaceholder('Search people')
  await search.waitFor({ timeout: timeoutMs })
  await search.fill(recipient.username)
  const target = page.getByRole('button').filter({ hasText: `@${recipient.username}` }).first()
  await target.waitFor({ timeout: timeoutMs })
  await target.click()
  await page.getByRole('log', { name: /^Direct messages with /i }).waitFor({ timeout: timeoutMs })
}

const verifyDirectMessageAction = async (page, account, recipient, resumeCard) => {
  account.dmRecipientUserId = recipient.userId
  await writeRecoveryJournal(journalPath, journal)
  await openDisposableDm(page, recipient)
  await capture(page, `${account.profile}-07-dm-nested-thread`)
  await page.evaluate(() => window.history.back())
  assertTrialOrigin(page, baseUrl, `${account.profile} nested DM Browser Back`)
  await page.getByPlaceholder('Search conversations').waitFor({ timeout: timeoutMs })
  await resumeCard.waitFor({ timeout: timeoutMs })
  checks.push({ name: `${account.profile}-nested-dm-browser-back`, passed: true })
  await page.evaluate(() => window.history.forward())
  await page.getByRole('log', { name: /^Direct messages with /i }).waitFor({ timeout: timeoutMs })
  const composer = page.locator('textarea[name^="message-composer-"]:visible').first()
  await composer.waitFor({ timeout: timeoutMs })
  const composerForm = composer.locator('xpath=ancestor::form[1]')
  await assertNoHorizontalOverflow(page, `${account.profile}-dm-composer`, composerForm)
  await assertFocusedFooterGeometry(page, `${account.profile}-dm-composer`, composer, composerForm)
  await capture(page, `${account.profile}-08-dm-handoff-focused`)
  await composer.fill(account.messageContent)
  assertTrialOrigin(page, baseUrl, `${account.profile} canonical DM submit`)
  await composerForm.locator('button[aria-label^="Send message"]').click()
  const message = await poll(`${account.profile} canonical direct message`, async () => {
    const result = await admin.from('dm_messages')
      .select('id,conversation_id,sender_id,content,created_at')
      .eq('sender_id', account.userId)
      .eq('content', account.messageContent)
      .maybeSingle()
    assertNoError(result.error, `Read ${account.profile} activation DM`)
    return result.data
  })
  account.dmMessageId = message.id
  account.dmConversationId = message.conversation_id
  await writeRecoveryJournal(journalPath, journal)
  return message.id
}

const openPinCategory = async (page, category) => {
  const list = page.getByTestId('shadow-pin-category-list')
  await list.waitFor({ timeout: timeoutMs })
  await page.getByRole('button', { name: 'Open category search', exact: true }).click()
  const search = page.getByRole('searchbox', { name: 'Search all of ShadowPin', exact: true })
  await search.waitFor({ timeout: timeoutMs })
  await search.fill(category.title)
  const results = page.getByRole('listbox', { name: 'ShadowPin search results', exact: true })
  const option = results.getByRole('option', { name: category.title, exact: true }).first()
  await option.waitFor({ timeout: timeoutMs })
  await page.waitForTimeout(400)
  await option.focus()
  must(await option.evaluate(element => document.activeElement === element), 'ShadowPin category result did not accept keyboard focus.')
  await page.keyboard.press('Enter')
  await page.getByRole('list', { name: 'ShadowPin pin masonry grid' }).waitFor({ timeout: timeoutMs })
}

const verifyShadowPinAction = async (page, account, resumeCard) => {
  const category = await getPinCategoryTarget()
  const existingHeart = await admin.from('shadow_pin_image_hearts')
    .select('image_id')
    .eq('image_id', category.imageId)
    .eq('user_id', account.userId)
  assertNoError(existingHeart.error, `Read ${account.profile} pre-action Pin heart`)
  must(existingHeart.data?.length === 0, `${account.profile} unexpectedly inherited a Pin heart.`)
  const beforeImage = await admin.from('shadow_pin_images')
    .select('id,heart_count')
    .eq('id', category.imageId)
    .single()
  assertNoError(beforeImage.error, `Read ${account.profile} pre-action Pin count`)
  await openPinCategory(page, category)
  const grid = page.getByRole('list', { name: 'ShadowPin pin masonry grid' })
  const opener = grid.getByRole('button', {
    name: new RegExp(`^Open .${escapeRegExp(category.imageTitle)}. by `, 'u'),
  })
  await opener.waitFor({ timeout: timeoutMs })
  await opener.click()
  const theater = page.getByTestId('shadow-pin-theater')
  await theater.waitFor({ timeout: timeoutMs })
  await capture(page, `${account.profile}-07-pin-nested-viewer`)
  await page.evaluate(() => window.history.back())
  assertTrialOrigin(page, baseUrl, `${account.profile} nested Pin Browser Back`)
  await theater.waitFor({ state: 'hidden', timeout: timeoutMs })
  await grid.waitFor({ timeout: timeoutMs })
  await resumeCard.waitFor({ timeout: timeoutMs })
  checks.push({ name: `${account.profile}-nested-pin-browser-back`, passed: true })

  await opener.click()
  await theater.waitFor({ timeout: timeoutMs })
  must(new URL(page.url()).searchParams.get('pin') === category.imageId, `${account.profile} Theater route did not target the selected Pin.`)
  await assertNoHorizontalOverflow(page, `${account.profile}-pin-handoff`, theater)
  const pressedButtons = theater.locator('button[aria-pressed]')
  const buttonStates = await poll(`${account.profile} unique Pin heart control`, async () => {
    const states = await pressedButtons.evaluateAll(buttons => buttons.map(button => ({
      label: button.getAttribute('aria-label') || '',
      pressed: button.getAttribute('aria-pressed'),
    })))
    return states.length === 1 ? states : null
  })
  const labelPattern = /^(Heart|Remove heart from) (.+), ([0-9]+) hearts?$/u
  const beforeControl = buttonStates[0]
  const beforeLabel = beforeControl.label.match(labelPattern)
  must(beforeControl.pressed === 'false' && beforeLabel?.[1] === 'Heart', `${account.profile} Pin heart control was already active or malformed: ${JSON.stringify(buttonStates)}.`)
  const beforeUiCount = Number(beforeLabel[3])
  must(beforeUiCount === beforeImage.data.heart_count, `${account.profile} Pin heart UI and database counts disagreed before activation.`)
  const heart = pressedButtons.first()
  await capture(page, `${account.profile}-08-pin-handoff`)
  assertTrialOrigin(page, baseUrl, `${account.profile} canonical ShadowPin heart submit`)
  await heart.click()
  const receipt = await poll(`${account.profile} canonical ShadowPin heart`, async () => {
    const result = await admin.from('shadow_pin_image_hearts')
      .select('image_id,user_id,created_at')
      .eq('user_id', account.userId)
    assertNoError(result.error, `Read ${account.profile} activation Pin heart`)
    return result.data?.length === 1 ? result.data[0] : null
  })
  const afterControl = await poll(`${account.profile} Pin heart UI delta`, async () => {
    const state = await heart.evaluate(button => ({
      label: button.getAttribute('aria-label') || '',
      pressed: button.getAttribute('aria-pressed'),
    })).catch(() => null)
    const match = state?.label.match(labelPattern)
    return state?.pressed === 'true' && match?.[1] === 'Remove heart from' ? { ...state, count: Number(match[3]) } : null
  })
  must(afterControl.count === beforeUiCount + 1, `${account.profile} Pin heart UI count did not increment exactly once.`)
  const afterImage = await poll(`${account.profile} Pin heart database count delta`, async () => {
    const result = await admin.from('shadow_pin_images').select('id,heart_count').eq('id', category.imageId).single()
    assertNoError(result.error, `Read ${account.profile} post-action Pin count`)
    return result.data.heart_count === beforeImage.data.heart_count + 1 ? result.data : null
  })
  must(afterImage.heart_count === afterControl.count, `${account.profile} Pin heart UI and database counts disagreed after activation.`)
  account.pinHeartImageId = receipt.image_id
  await writeRecoveryJournal(journalPath, journal)
  checks.push({
    name: `${account.profile}-pin-heart-fresh-state-and-count-delta`,
    passed: true,
    beforeCount: beforeUiCount,
    afterCount: afterControl.count,
  })
  await theater.getByRole('button', { name: 'Close ShadowPin Theater', exact: true }).click()
  await theater.waitFor({ state: 'hidden', timeout: timeoutMs })
  await grid.waitFor({ timeout: timeoutMs })
  await resumeCard.waitFor({ timeout: timeoutMs })
  checks.push({ name: `${account.profile}-pin-theater-closed-before-install-choice`, passed: true })
  return receipt.image_id
}

const verifyIphoneInstallGuide = async (page, account, successCard) => {
  await successCard.getByRole('button', { name: 'Install app', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Add Shadow Chat and turn on alerts' })
  await dialog.waitFor({ timeout: timeoutMs })
  must(await dialog.locator('video').count() === 0, `${account.profile} iPhone guide unexpectedly rendered a video.`)
  const details = dialog.getByTestId('phone-install-scroll-details')
  await details.waitFor({ timeout: timeoutMs })
  await assertNoHorizontalOverflow(page, `${account.profile}-iphone-install-guide`, dialog)
  const geometry = await dialog.evaluate(element => {
    const dialogRect = element.getBoundingClientRect()
    const scroller = element.querySelector('[data-testid="phone-install-scroll-details"]')
    const footerButtons = [...element.querySelectorAll('button')].slice(-2).map(button => {
      const rect = button.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    })
    return {
      dialog: { left: dialogRect.left, right: dialogRect.right, top: dialogRect.top, bottom: dialogRect.bottom },
      viewport: {
        left: window.visualViewport?.offsetLeft ?? 0,
        top: window.visualViewport?.offsetTop ?? 0,
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      },
      scroller: scroller instanceof HTMLElement ? { clientHeight: scroller.clientHeight, scrollHeight: scroller.scrollHeight } : null,
      footerButtons,
    }
  })
  must(geometry.scroller && geometry.scroller.scrollHeight >= geometry.scroller.clientHeight, `${account.profile} iPhone install details were not scroll-safe.`)
  const viewportBottom = geometry.viewport.top + geometry.viewport.height
  must(geometry.dialog.top >= geometry.viewport.top - 1 && geometry.dialog.bottom <= viewportBottom + 1, `${account.profile} iPhone install guide escaped the visual viewport.`)
  must(geometry.footerButtons.length === 2 && geometry.footerButtons.every(button => button.top < viewportBottom && button.bottom <= viewportBottom + 1), `${account.profile} iPhone install footer was not safe-area visible.`)
  await details.evaluate(element => { element.scrollTop = element.scrollHeight })
  await capture(page, `${account.profile}-10-iphone-no-video-install-guide`)
  checks.push({ name: `${account.profile}-iphone-no-video-install-guide-scroll-safe`, passed: true, geometry })
  await dialog.getByRole('button', { name: 'Skip for Now', exact: true }).click()
}

const verifySimulatedInstallPrompt = async (page, account, successCard) => {
  await page.evaluate(() => {
    window.__activationInstallQa = { promptCalls: 0, appInstalledEvents: 0 }
    window.addEventListener('appinstalled', () => { window.__activationInstallQa.appInstalledEvents += 1 }, { once: true })
    const event = new Event('beforeinstallprompt', { cancelable: true })
    Object.defineProperty(event, 'prompt', { value: async () => { window.__activationInstallQa.promptCalls += 1 } })
    Object.defineProperty(event, 'userChoice', { value: Promise.resolve({ outcome: 'accepted', platform: 'qa-simulated' }) })
    window.dispatchEvent(event)
  })
  await successCard.getByRole('button', { name: 'Install app', exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')))
  const browserContract = await page.evaluate(() => window.__activationInstallQa)
  must(browserContract?.promptCalls === 1 && browserContract?.appInstalledEvents === 1, `${account.profile} browser install event contract did not complete.`)
  checks.push({
    name: `${account.profile}-simulated-beforeinstallprompt-and-appinstalled-contract`,
    passed: true,
    simulatedBrowserContract: true,
    nativeInstallVerified: false,
    browserContract,
  })
}

const verifyInstallOutcome = async (page, profile, successCard, completed, actionId) => {
  const { account } = profile
  assertTrialOrigin(page, baseUrl, `${account.profile} optional install submit`)
  let expectedChoice = 'later'
  if (profile.installOutcome === 'simulated-prompt') {
    expectedChoice = 'installed'
    await verifySimulatedInstallPrompt(page, account, successCard)
  } else if (profile.installOutcome === 'guide-later') {
    await verifyIphoneInstallGuide(page, account, successCard)
  } else {
    await successCard.getByRole('button', { name: 'Maybe later', exact: true }).click()
  }
  const installed = await waitForJourney(
    `${account.profile} optional install choice`,
    account.userId,
    row => row.current_step === 'complete'
      && row.install_choice === expectedChoice
      && row.install_completed_at
      && row.presentation_state === 'minimized'
      && row.completed_at === completed.completed_at
  )
  must(installed.first_action_id === actionId, `${account.profile} install choice changed the canonical first-action receipt.`)
  await successCard.waitFor({ state: 'hidden', timeout: timeoutMs })
  await assertNoHorizontalOverflow(page, `${account.profile}-install-dismissed`)
  await capture(page, `${account.profile}-11-install-dismissed`)
  checks.push({ name: `${account.profile}-optional-install-does-not-gate-completion`, passed: true, choice: expectedChoice })
}

const verifyJourneyFlow = async (page, profile) => {
  const { account } = profile
  const journeySurface = page.getByTestId('first-run-activation-journey')
  const resumeCard = page.getByLabel('Resume first-run setup')
  await dismissForegroundRelease(page)
  await page.getByRole('heading', { name: 'Start with your identity', exact: true }).waitFor({ timeout: timeoutMs })
  await assertComfort130(page, `${account.profile}-identity`)
  await assertNoHorizontalOverflow(page, `${account.profile}-identity`, journeySurface)
  await capture(page, `${account.profile}-01-identity-130`)
  if (profile.navigationRecovery) await verifyNavigationRecovery(page, profile, journeySurface, resumeCard)

  await page.getByPlaceholder('What should people call you?').fill(account.displayName)
  const status = page.getByPlaceholder('A little about you')
  await status.fill(`Disposable ${account.profile} activation verification.`)
  await status.focus()
  await assertNoHorizontalOverflow(page, `${account.profile}-identity-focused`, journeySurface)
  assertTrialOrigin(page, baseUrl, `${account.profile} identity submit`)
  await journeySurface.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('heading', { name: 'Choose your experience', exact: true }).waitFor({ timeout: timeoutMs })
  await waitForJourney(
    `${account.profile} identity completion`,
    account.userId,
    row => row.current_step === 'preferences' && row.identity_completed_at
  )

  await page.getByText('Custom settings active', { exact: true }).waitFor({ timeout: timeoutMs })
  await assertComfort130(page, `${account.profile}-preferences`)
  await assertNoHorizontalOverflow(page, `${account.profile}-preferences`, journeySurface)
  await capture(page, `${account.profile}-05-preferences-130`)
  assertTrialOrigin(page, baseUrl, `${account.profile} notification choice submit`)
  await journeySurface.getByRole('button', { name: 'Not now', exact: true }).click()
  await page.getByRole('heading', { name: 'Make your first move', exact: true }).waitFor({ timeout: timeoutMs })
  await waitForJourney(
    `${account.profile} preferences completion`,
    account.userId,
    row => row.current_step === 'first_action'
      && row.notification_choice === 'notifications_later'
      && row.preferences_completed_at
      && row.comfort_reviewed_at
  )

  await assertComfort130(page, `${account.profile}-first-action`)
  await assertNoHorizontalOverflow(page, `${account.profile}-first-action`, journeySurface)
  await capture(page, `${account.profile}-06-first-action-130`)
  assertTrialOrigin(page, baseUrl, `${account.profile} first-action selection submit`)
  await journeySurface.getByRole('button', { name: firstActionButtonName[account.actionKind] }).click()
  await waitForJourney(
    `${account.profile} selected action handoff`,
    account.userId,
    row => row.current_step === 'first_action'
      && row.selected_first_action_kind === account.actionKind
      && row.presentation_state === 'minimized'
  )

  await dismissForegroundRelease(page)
  await resumeCard.waitFor({ timeout: timeoutMs })
  await assertComfort130(page, `${account.profile}-selected-action`)
  let actionId = null
  if (account.actionKind === 'group_message') actionId = await verifyGroupAction(page, account, resumeCard)
  if (account.actionKind === 'direct_message') {
    const recipientProfile = profiles.find(candidate => candidate.name === profile.dmRecipientProfile)
    must(recipientProfile?.account.userId, `${account.profile} disposable DM recipient was not provisioned.`)
    actionId = await verifyDirectMessageAction(page, account, recipientProfile.account, resumeCard)
  }
  if (account.actionKind === 'shadow_pin_heart') actionId = await verifyShadowPinAction(page, account, resumeCard)
  must(actionId && uuidPattern.test(actionId), `${account.profile} canonical action returned no valid receipt.`)

  const completed = await waitForJourney(
    `${account.profile} canonical completion`,
    account.userId,
    row => row.current_step === 'complete'
      && row.first_action_kind === account.actionKind
      && row.first_action_id === actionId
      && row.completed_at
      && row.presentation_state === 'expanded'
      && !row.dismissed_at
  )
  await dismissForegroundRelease(page)
  const successCard = page.getByLabel('First-run setup complete')
  await successCard.waitFor({ timeout: timeoutMs })
  await assertNoHorizontalOverflow(page, `${account.profile}-success`, successCard)
  await capture(page, `${account.profile}-09-success`)
  checks.push({ name: `${account.profile}-${account.actionKind}-canonical-action-success`, passed: true })
  await verifyInstallOutcome(page, profile, successCard, completed, actionId)
}

const runProfile = async profile => {
  let browser = null
  let context = null
  let page = null
  let evidence = null
  let firewallEvidence = null
  try {
    browser = await profile.engine.launch({ headless: true })
    context = await browser.newContext({
      ...profile.device,
      serviceWorkers: 'block',
      ignoreHTTPSErrors: false,
    })
    await context.addInitScript(preferences => {
      try {
        localStorage.setItem('shadowchat:comfort-preferences:v1', JSON.stringify(preferences))
      } catch {
        // about:blank and browser internals can deny storage before the trial origin loads.
      }
    }, comfort130Preferences)
    firewallEvidence = await installContextFirewall(context, {
      baseUrl,
      expectedSupabaseHost: new URL(supabaseUrl).hostname.toLowerCase(),
    })
    page = await context.newPage()
    evidence = recordPageEvidence(page, profile.name)
    await signInAndEnterJourney(page, profile.account)
    if (profile.isolationProbe) {
      const otherProfileName = profile.name.startsWith('pixel-')
        ? 'iphone-webkit-general-chat'
        : 'pixel-chromium-general-chat'
      const otherProfile = profiles.find(candidate => candidate.name === otherProfileName)
      must(otherProfile?.account.userId, `${profile.name} cross-owner target was not provisioned.`)
      await verifyCrossOwnerIsolation(page, profile.account, otherProfile.account, evidence)
    }
    await verifyJourneyFlow(page, profile)
    verifySendPushFirewall(profile, firewallEvidence)
    evidence.finalizeHosts()
    must(evidence.consoleErrors.length === 0, `${profile.name} console errors: ${evidence.consoleErrors.join(' | ')}`)
    must(evidence.pageErrors.length === 0, `${profile.name} page errors: ${evidence.pageErrors.join(' | ')}`)
    must(evidence.httpErrors.length === 0, `${profile.name} HTTP errors: ${JSON.stringify(evidence.httpErrors)}`)
    must(evidence.requestFailures.length === 0, `${profile.name} request failures: ${JSON.stringify(evidence.requestFailures)}`)
    must(evidence.approvedSecurityDenials.length === (profile.isolationProbe ? 1 : 0), `${profile.name} approved security-denial count was unexpected.`)
    checks.push({ name: `${profile.name}-zero-browser-network-errors`, passed: true })
  } catch (error) {
    evidence?.finalizeHosts(false)
    if (page && !page.isClosed()) {
      const authSecretsVisible = await page.locator('input[name="password"]:visible, input[name="inviteCode"]:visible').count().then(count => count > 0).catch(() => false)
      if (!authSecretsVisible) {
        await page.screenshot({
          path: path.join(artifactDir, `${sanitizeToken(profile.name)}-failure.png`),
          fullPage: false,
          animations: 'disabled',
          mask: [page.locator('input, textarea, [contenteditable="true"]')],
          maskColor: '#111111',
        }).catch(() => undefined)
      }
    }
    throw error
  } finally {
    evidence?.finalizeHosts(false)
    await context?.close().catch(() => undefined)
    await browser?.close().catch(() => undefined)
  }
}

let failure = null
let cleanup = null
try {
  for (const profile of profiles) await createInvite(profile.account)
  for (const profile of profiles) await provisionAccount(profile.account)
  for (const profile of profiles) {
    await runProfile(profile)
    await wait(1_000)
  }
} catch (error) {
  failure = sanitizeText(messageOf(error))
} finally {
  try {
    cleanup = await cleanupTestState({ admin, journal, journalPath })
  } catch (error) {
    const cleanupFailure = sanitizeText(messageOf(error))
    failure = failure ? `${failure} | Cleanup failure: ${cleanupFailure}` : `Cleanup failure: ${cleanupFailure}`
  }

  const summary = {
    status: failure ? 'failed' : 'passed',
    runId: runToken,
    baseUrl,
    deploy: deployEvidence,
    supabaseProjectDigest: digest(projectRef),
    profiles: profiles.map(profile => ({
      name: profile.name,
      disposableIdentityDigest: digest(`${profile.account.email}:${profile.account.userId || ''}`),
      actionKind: profile.account.actionKind,
      inviteCreated: Boolean(profile.account.inviteId),
      userCreated: Boolean(profile.account.userId),
      actionCreated: Boolean(profile.account.messageId || profile.account.dmMessageId || profile.account.pinHeartImageId),
    })),
    installEvidence: {
      laterOutcomeAutomated: checks.some(check => check.name.endsWith('optional-install-does-not-gate-completion') && check.choice === 'later'),
      simulatedBrowserPromptContractAutomated: checks.some(check => check.simulatedBrowserContract === true),
      iphoneNoVideoGuideAutomated: checks.some(check => check.name.endsWith('iphone-no-video-install-guide-scroll-safe')),
      nativeOsInstallVerified: false,
      physicalDeviceResidual: 'Native OS install-sheet acceptance and launch from the installed Home Screen remain physical-device-only.',
    },
    checks,
    pageEvidence,
    cleanup,
    recoveryJournal: cleanup?.recoveryJournalRemoved ? 'removed-after-zero-row-proof' : path.basename(journalPath),
    failure,
    completedAt: new Date().toISOString(),
  }
  await writeFile(path.join(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
}

if (failure) {
  console.error(`Candidate 4 browser verification failed: ${failure}`)
  console.error(`Sanitized evidence: ${path.join(artifactDir, 'summary.json')}`)
  if (!cleanup?.recoveryJournalRemoved) console.error(`Recovery journal retained: ${journalPath}`)
  process.exitCode = 1
} else {
  console.log(`Candidate 4 browser verification passed: ${path.join(artifactDir, 'summary.json')}`)
}

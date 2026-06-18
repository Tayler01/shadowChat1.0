#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const DEFAULT_HYPE_TARGET = 5
const APP_RELEASE_BROADCAST_TOPIC = 'app-release-updates'
const APP_RELEASE_BROADCAST_EVENT = 'app_release_published'
const SHADO_USERNAME = 'shado_ai'

const USER_SELECT = [
  'id',
  'username',
  'display_name',
  'avatar_url',
  'avatar_thumbnail_url',
  'banner_url',
  'banner_thumbnail_url',
  'color',
].join(',')

const SUBMISSION_SELECT = [
  'id',
  'user_id',
  'submission_type',
  'title',
  'description',
  'status',
  'created_at',
].join(',')

const usage = `
Usage:
  node .agents/skills/shadowchat-recognition-update/scripts/publish-recognition-update.mjs --username jj --feature-title "Full-screen photo pinch zoom"

Options:
  --username <name>          Requester username.
  --user-id <uuid>           Requester user id.
  --submission-id <uuid>     Feedback submission id to credit.
  --feature-title <text>     Shipped feature title.
  --display-name <text>      Presentation name override.
  --submission-title <text>  Fallback submission title.
  --summary <text>           Popup summary override.
  --title <text>             Popup title override.
  --build-id <text>          Idempotent app release build id.
  --hype-target <number>     Hype count target; defaults to 5.
  --force                    Publish a new post even if a matching recent post exists.
  --skip-popup               Do not publish the app release popup.
  --skip-post                Do not publish the Shado post.
  --dry-run                  Print planned writes without creating data.
`

function toCamelFlag(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

function parseArgs(argv) {
  const booleanFlags = new Set(['dry-run', 'force', 'skip-popup', 'skip-post', 'help'])
  const args = {
    dryRun: false,
    force: false,
    skipPopup: false,
    skipPost: false,
    hypeTarget: DEFAULT_HYPE_TARGET,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`)
    }

    const rawKey = arg.slice(2)
    const key = toCamelFlag(rawKey)
    if (booleanFlags.has(rawKey)) {
      args[key] = true
      continue
    }

    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`)
    }

    args[key] = value
    index += 1
  }

  if (args.help) {
    console.log(usage.trim())
    process.exit(0)
  }

  args.hypeTarget = Number.parseInt(String(args.hypeTarget || DEFAULT_HYPE_TARGET), 10)
  if (!Number.isFinite(args.hypeTarget) || args.hypeTarget < 0) {
    throw new Error('--hype-target must be a nonnegative integer.')
  }

  if (args.skipPopup && args.skipPost) {
    throw new Error('Nothing to publish: remove --skip-popup or --skip-post.')
  }

  if (!args.username && !args.userId && !args.submissionId) {
    throw new Error('Provide --username, --user-id, or --submission-id.')
  }

  return args
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (key && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function loadLocalEnv() {
  for (const fileName of ['.env', '.env.local', '.env.production']) {
    loadEnvFile(path.join(process.cwd(), fileName))
  }
}

function firstEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]
    if (value && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function getGitValue(args) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function getProjectRef(supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).hostname
    return host.split('.')[0] || ''
  } catch {
    return ''
  }
}

function findServiceRoleKey(value) {
  if (!value) {
    return ''
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findServiceRoleKey(item)
      if (found) {
        return found
      }
    }
    return ''
  }

  if (typeof value !== 'object') {
    return ''
  }

  const record = value
  const label = [
    record.name,
    record.type,
    record.key_type,
    record.keyType,
    record.role,
  ].filter(Boolean).join(' ')
  const candidate = record.api_key || record.apiKey || record.key || record.value
  if (candidate && /service[_ -]?role/i.test(label)) {
    return String(candidate)
  }

  for (const nested of Object.values(record)) {
    const found = findServiceRoleKey(nested)
    if (found) {
      return found
    }
  }

  return ''
}

function loadServiceRoleKey(supabaseUrl) {
  const envKey = firstEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY')
  if (envKey) {
    return envKey
  }

  const projectRef = getProjectRef(supabaseUrl)
  if (!projectRef) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing and the Supabase project ref could not be inferred.')
  }

  try {
    const raw = execFileSync(
      'supabase',
      ['projects', 'api-keys', '--project-ref', projectRef, '-o', 'json'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    const key = findServiceRoleKey(JSON.parse(raw))
    if (key) {
      return key
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY is missing and Supabase CLI key lookup failed: ${detail}`)
  }

  throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing and Supabase CLI did not return a service_role key.')
}

function normalizeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || fallback
}

function truncate(value, maxLength) {
  const text = normalizeText(value)
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function slugify(value) {
  return normalizeText(value, 'update')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'update'
}

function todayStamp() {
  const now = new Date()
  return [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('')
}

function assertCleanText(label, text) {
  if (text.includes('\uFFFD')) {
    throw new Error(`${label} contains a replacement character. Check encoding before publishing.`)
  }
}

class SupabaseRest {
  constructor(supabaseUrl, serviceRoleKey) {
    this.supabaseUrl = supabaseUrl
    this.serviceRoleKey = serviceRoleKey
  }

  async request(pathname, options = {}) {
    const endpoint = new URL(pathname, this.supabaseUrl)
    for (const [key, value] of Object.entries(options.query || {})) {
      if (value !== undefined && value !== null && value !== '') {
        endpoint.searchParams.set(key, String(value))
      }
    }

    const headers = {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      ...options.headers,
    }

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(endpoint, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    const text = await response.text().catch(() => '')
    if (!response.ok) {
      throw new Error(`${options.label || pathname} failed (${response.status}): ${text || response.statusText}`)
    }

    if (!text) {
      return null
    }

    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  }
}

async function selectOne(rest, pathname, query, label) {
  const rows = await rest.request(pathname, {
    query: { ...query, limit: 1 },
    label,
  })
  return Array.isArray(rows) ? rows[0] || null : null
}

async function findSubmission(rest, submissionId) {
  if (!submissionId) {
    return null
  }

  const submission = await selectOne(
    rest,
    '/rest/v1/feedback_submissions',
    {
      select: SUBMISSION_SELECT,
      id: `eq.${submissionId}`,
    },
    'Feedback submission lookup'
  )

  if (!submission) {
    throw new Error(`No feedback submission found for ${submissionId}.`)
  }

  return submission
}

async function findUser(rest, args, submission) {
  if (args.userId || submission?.user_id) {
    const userId = args.userId || submission.user_id
    const user = await selectOne(
      rest,
      '/rest/v1/users',
      {
        select: USER_SELECT,
        id: `eq.${userId}`,
      },
      'User lookup by id'
    )
    if (user) {
      return user
    }
    throw new Error(`No user found for ${userId}.`)
  }

  const username = normalizeText(args.username).replace(/^@/, '')
  const user = await selectOne(
    rest,
    '/rest/v1/users',
    {
      select: USER_SELECT,
      username: `ilike.${username}`,
    },
    'User lookup by username'
  )
  if (!user) {
    throw new Error(`No user found for username ${username}.`)
  }
  return user
}

async function findRecentSubmission(rest, userId, featureTitle) {
  const rows = await rest.request('/rest/v1/feedback_submissions', {
    query: {
      select: SUBMISSION_SELECT,
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
      limit: 25,
    },
    label: 'Recent feedback lookup',
  })

  if (!Array.isArray(rows)) {
    return null
  }

  const featureTerms = normalizeText(featureTitle).toLowerCase().split(/\s+/).filter(Boolean)
  return rows.find(row => {
    const haystack = `${row.title || ''} ${row.description || ''}`.toLowerCase()
    return featureTerms.length > 0 && featureTerms.some(term => haystack.includes(term))
  }) || rows[0] || null
}

function getDisplayName(user, override = '') {
  return normalizeText(override, normalizeText(user.display_name, user.username || 'ShadowChat member'))
}

function buildRecognitionRelease(args, user, submission) {
  const displayName = getDisplayName(user, args.displayName)
  const featureTitle = truncate(
    args.featureTitle || args.submissionTitle || submission?.title || 'A Shadow Chat request',
    180
  )
  const submissionTitle = truncate(args.submissionTitle || submission?.title || featureTitle, 180)
  const submissionType = normalizeText(args.submissionType || submission?.submission_type || 'request')
  const commitSha = truncate(args.commitSha || getGitValue(['rev-parse', 'HEAD']), 80)
  const buildId = truncate(
    args.buildId ||
      `recognition-${todayStamp()}-${slugify(user.username || displayName)}-${slugify(featureTitle)}`,
    160
  )
  const title = truncate(args.title || `${displayName}'s request is live`, 140)
  const summary = truncate(
    args.summary ||
      `${displayName} asked for ${featureTitle}, and it has been added to Shadow Chat. Keep sending feature requests and bug reports.`,
    2000
  )
  const shippedAt = new Date().toISOString()

  return {
    build_id: buildId,
    commit_sha: commitSha || null,
    deploy_id: null,
    deploy_url: null,
    title,
    summary,
    sections: [
      {
        kind: 'recognition',
        heading: 'Community credit',
        items: [
          `${displayName} submitted "${submissionTitle}" as a ${submissionType}, and it is now in the app.`,
          'Feature requests and bug reports help decide what gets built next.',
        ],
        recognition: {
          userId: user.id,
          username: user.username || null,
          displayName,
          avatarUrl: user.avatar_url || null,
          avatarThumbnailUrl: user.avatar_thumbnail_url || null,
          bannerUrl: user.banner_url || null,
          bannerThumbnailUrl: user.banner_thumbnail_url || null,
          profileColor: user.color || null,
          submissionId: submission?.id || null,
          submissionTitle,
          submissionType,
          featureTitle,
          shippedAt,
        },
      },
      {
        heading: 'What landed',
        items: [
          `${featureTitle} is available now.`,
          'The update is scoped to the shipped request and keeps the rest of Shadow Chat unchanged.',
        ],
      },
      {
        heading: 'Keep requests coming',
        items: [
          'Submit feature requests and bug reports from Settings so the next useful fix has a clean trail.',
        ],
      },
    ],
    restart_policy: 'notice_only',
    severity: 'feature',
    active: true,
    published_at: shippedAt,
  }
}

function buildPostContent(args, user, submission) {
  const displayName = getDisplayName(user, args.displayName)
  const featureTitle = truncate(
    args.featureTitle || args.submissionTitle || submission?.title || 'a Shadow Chat update',
    180
  )
  const submissionTitle = truncate(args.submissionTitle || submission?.title || featureTitle, 180)
  const lines = [
    `Shado update: ${displayName}'s request just shipped.`,
    '',
    `${displayName} submitted "${submissionTitle}", and ${featureTitle} is now live in Shadow Chat.`,
    '',
    'This is why feature requests and bug reports matter. Keep sending them in, and we will keep calling out the people who help shape the app.',
  ]

  const content = truncate(args.message || lines.join('\n'), 4000)
  assertCleanText('Shado post content', content)
  return content
}

async function upsertAppRelease(rest, row) {
  const rows = await rest.request('/rest/v1/app_releases', {
    method: 'POST',
    query: { on_conflict: 'build_id' },
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: row,
    label: 'App release upsert',
  })
  return Array.isArray(rows) ? rows[0] || null : null
}

async function broadcastAppRelease(rest, row) {
  await rest.request('/realtime/v1/api/broadcast', {
    method: 'POST',
    body: {
      messages: [
        {
          topic: APP_RELEASE_BROADCAST_TOPIC,
          event: APP_RELEASE_BROADCAST_EVENT,
          payload: {
            build_id: row.build_id,
            commit_sha: row.commit_sha,
            title: row.title,
            restart_policy: row.restart_policy,
            severity: row.severity,
            published_at: row.published_at,
            sent_at: new Date().toISOString(),
          },
        },
      ],
    },
    label: 'App release broadcast',
  })
}

async function findShadoUser(rest) {
  const user = await selectOne(
    rest,
    '/rest/v1/users',
    {
      select: 'id,username,display_name',
      username: `eq.${SHADO_USERNAME}`,
    },
    'Shado user lookup'
  )
  if (!user) {
    throw new Error(`No ${SHADO_USERNAME} user found.`)
  }
  return user
}

async function findDuplicatePost(rest, shadoUserId, content, featureTitle, displayName) {
  const rows = await rest.request('/rest/v1/messages', {
    query: {
      select: 'id,content,created_at,hype_count',
      user_id: `eq.${shadoUserId}`,
      order: 'created_at.desc',
      limit: 50,
    },
    label: 'Recent Shado post lookup',
  })

  if (!Array.isArray(rows)) {
    return null
  }

  const featureNeedle = normalizeText(featureTitle).toLowerCase()
  const displayNeedle = normalizeText(displayName).toLowerCase()
  const contentNeedle = content.slice(0, 80).toLowerCase()
  return rows.find(row => {
    const haystack = normalizeText(row.content).toLowerCase()
    return (
      haystack.includes(featureNeedle) &&
      haystack.includes(displayNeedle)
    ) || haystack.includes(contentNeedle)
  }) || null
}

async function insertMessage(rest, shadoUserId, content) {
  const rows = await rest.request('/rest/v1/messages', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: {
      user_id: shadoUserId,
      content,
      message_type: 'text',
      reactions: {},
    },
    label: 'Shado message insert',
  })
  const message = Array.isArray(rows) ? rows[0] || null : null
  if (!message?.id) {
    throw new Error('Shado message insert did not return a message id.')
  }
  return message
}

async function fetchMessage(rest, messageId) {
  const message = await selectOne(
    rest,
    '/rest/v1/messages',
    {
      select: 'id,user_id,hype_count,content,created_at',
      id: `eq.${messageId}`,
    },
    'Message verification'
  )
  if (!message) {
    throw new Error(`Message ${messageId} could not be verified.`)
  }
  return message
}

async function applyHypeTarget(rest, messageId, messageAuthorId, target) {
  const existingRows = await rest.request('/rest/v1/message_hypes', {
    query: {
      select: 'id',
      message_id: `eq.${messageId}`,
      limit: 200,
    },
    label: 'Existing message hypes lookup',
  })
  const existingCount = Array.isArray(existingRows) ? existingRows.length : 0
  const needed = Math.max(0, target - existingCount)

  if (needed > 0) {
    await rest.request('/rest/v1/message_hypes', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: Array.from({ length: needed }, () => ({
        message_id: messageId,
        actor_id: null,
        message_author_id: messageAuthorId,
        event_id: null,
      })),
      label: 'Message hype insert',
    })
  }

  await rest.request('/rest/v1/rpc/refresh_message_hype_summary', {
    method: 'POST',
    body: { target_message_id: messageId },
    label: 'Hype summary refresh',
  })

  const verified = await fetchMessage(rest, messageId)
  return {
    inserted: needed,
    previousCount: existingCount,
    hypeCount: verified.hype_count ?? 0,
  }
}

async function main() {
  loadLocalEnv()
  const args = parseArgs(process.argv.slice(2))
  const supabaseUrl = firstEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  if (!supabaseUrl) {
    throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL.')
  }

  const serviceRoleKey = loadServiceRoleKey(supabaseUrl)
  const rest = new SupabaseRest(supabaseUrl, serviceRoleKey)

  const explicitSubmission = await findSubmission(rest, args.submissionId)
  const user = await findUser(rest, args, explicitSubmission)
  const submission = explicitSubmission || await findRecentSubmission(rest, user.id, args.featureTitle || args.submissionTitle || '')
  const releaseRow = buildRecognitionRelease(args, user, submission)
  const postContent = buildPostContent(args, user, submission)
  const result = {
    dryRun: args.dryRun,
    requester: {
      id: user.id,
      username: user.username,
      displayName: getDisplayName(user, args.displayName),
    },
    submission: submission ? {
      id: submission.id,
      title: submission.title,
      submissionType: submission.submission_type,
      status: submission.status,
    } : null,
    release: args.skipPopup ? null : {
      buildId: releaseRow.build_id,
      title: releaseRow.title,
      published: false,
    },
    post: args.skipPost ? null : {
      preview: postContent,
      messageId: null,
      created: false,
      duplicateSkipped: false,
      hypeTarget: args.hypeTarget,
      hypeCount: 0,
    },
  }

  if (!args.skipPopup) {
    if (args.dryRun) {
      result.release.row = releaseRow
    } else {
      const release = await upsertAppRelease(rest, releaseRow)
      await broadcastAppRelease(rest, releaseRow)
      result.release.id = release?.id || null
      result.release.published = true
    }
  }

  if (!args.skipPost) {
    const shadoUser = await findShadoUser(rest)
    const duplicate = await findDuplicatePost(
      rest,
      shadoUser.id,
      postContent,
      releaseRow.sections[0].recognition.featureTitle,
      getDisplayName(user, args.displayName)
    )

    let message = duplicate
    if (duplicate && !args.force) {
      result.post.duplicateSkipped = true
      result.post.messageId = duplicate.id
    } else if (args.dryRun) {
      result.post.messageId = 'dry-run'
    } else {
      message = await insertMessage(rest, shadoUser.id, postContent)
      result.post.created = true
      result.post.messageId = message.id
    }

    if (!args.dryRun && message?.id) {
      const hype = await applyHypeTarget(rest, message.id, shadoUser.id, args.hypeTarget)
      result.post.hypeInserted = hype.inserted
      result.post.hypeCount = hype.hypeCount
      if (hype.hypeCount < args.hypeTarget) {
        throw new Error(`Post hype verification failed: expected ${args.hypeTarget}, got ${hype.hypeCount}.`)
      }
    }
  }

  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

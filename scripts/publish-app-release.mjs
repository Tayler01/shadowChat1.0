import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const VALID_POLICIES = new Set([
  'notice_only',
  'optional_restart',
  'required_restart',
  'critical_force_restart',
])

const VALID_SEVERITIES = new Set(['info', 'feature', 'maintenance', 'critical'])

const DEFAULT_MANUAL_RELEASE_NOTES_PATH = path.join('release-notes', 'current.json')
const APP_RELEASE_BROADCAST_TOPIC = 'app-release-updates'
const APP_RELEASE_BROADCAST_EVENT = 'app_release_published'

const AREA_RULES = [
  {
    label: 'In-app update popup and release publishing',
    pattern: /^(src\/components\/releases|src\/lib\/appReleases|scripts\/publish-app-release|docs\/APP_RELEASES|release-notes|\.github\/workflows\/netlify-production)/,
  },
  {
    label: 'General Chat message loading and media',
    pattern: /^(src\/components\/chat|src\/hooks\/useMessages|src\/hooks\/useUnreadScroll|src\/lib\/mediaAssets|tests\/MessageItem|tests\/useUnreadScroll)/,
  },
  {
    label: 'Direct Messages',
    pattern: /^(src\/components\/dms|src\/hooks\/useDirectMessages|tests\/useDirectMessages)/,
  },
  {
    label: 'Shadow Pin',
    pattern: /^(src\/features\/shadow-pin|netlify\/functions\/.*shadow-pin|docs\/SHADOW_PIN|supabase\/.*shadow_pin|tests\/ShadowPin|tests\/useShadowPin)/,
  },
  {
    label: 'News',
    pattern: /^(src\/components\/news|src\/hooks\/useNews|services\/news-scraper|docs\/NEWS|docs\/LINK_PREVIEWS)/,
  },
  {
    label: 'Backend and database',
    pattern: /^(supabase\/migrations|supabase\/functions)/,
  },
  {
    label: 'Deploy automation',
    pattern: /^\.github\/workflows/,
  },
  {
    label: 'Documentation',
    pattern: /^docs\//,
  },
  {
    label: 'Automated checks',
    pattern: /^(tests|scripts)\//,
  },
]

function parseArgs(argv) {
  const envReleaseNotesPath = process.env.APP_RELEASE_NOTES_PATH || ''
  const args = {
    releaseNotesPath: envReleaseNotesPath,
    releaseNotesExplicit: Boolean(envReleaseNotesPath),
    netlifyJsonPath: '',
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--release-notes') {
      args.releaseNotesPath = argv[index + 1] || DEFAULT_MANUAL_RELEASE_NOTES_PATH
      args.releaseNotesExplicit = true
      index += 1
    } else if (arg === '--netlify-json') {
      args.netlifyJsonPath = argv[index + 1] || ''
      index += 1
    } else if (arg === '--dry-run') {
      args.dryRun = true
    }
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

function getGitLines(args) {
  const value = getGitValue(args)
  if (!value) {
    return []
  }

  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function gitRevisionExists(revision) {
  if (!revision || isZeroSha(revision)) {
    return false
  }

  try {
    execFileSync('git', ['rev-parse', '--verify', `${revision}^{commit}`], {
      cwd: process.cwd(),
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

function readJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read ${label} at ${filePath}: ${detail}`)
  }
}

function normalizeText(value, maxLength, fieldName, required = false) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) {
    throw new Error(`${fieldName} is required.`)
  }
  if (text.length > maxLength) {
    throw new Error(`${fieldName} must be ${maxLength} characters or fewer.`)
  }
  return text
}

function normalizeSections(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((section, index) => {
    if (!section || typeof section !== 'object') {
      throw new Error(`sections[${index}] must be an object.`)
    }

    const heading = normalizeText(section.heading, 80, `sections[${index}].heading`, true)
    const items = Array.isArray(section.items)
      ? section.items.map((item, itemIndex) =>
          normalizeText(item, 280, `sections[${index}].items[${itemIndex}]`, true)
        )
      : []

    if (items.length === 0) {
      throw new Error(`sections[${index}].items must contain at least one item.`)
    }

    return { heading, items }
  })
}

function normalizeReleaseNotesObject(notes) {
  const title = normalizeText(notes.title, 140, 'title', true)
  const summary = normalizeText(notes.summary, 2000, 'summary', true)
  const restartPolicy = normalizeText(
    notes.restartPolicy || notes.restart_policy || 'required_restart',
    80,
    'restartPolicy'
  )
  const severity = normalizeText(notes.severity || 'feature', 80, 'severity')
  const sections = normalizeSections(notes.sections)

  if (!VALID_POLICIES.has(restartPolicy)) {
    throw new Error(`restartPolicy must be one of: ${Array.from(VALID_POLICIES).join(', ')}.`)
  }

  if (!VALID_SEVERITIES.has(severity)) {
    throw new Error(`severity must be one of: ${Array.from(VALID_SEVERITIES).join(', ')}.`)
  }

  if (sections.length === 0) {
    throw new Error('sections must contain at least one feature overview section.')
  }

  return {
    title,
    summary,
    sections,
    restart_policy: restartPolicy,
    severity,
  }
}

function normalizeReleaseNotes(filePath) {
  const notes = readJsonFile(filePath, 'release notes')
  return normalizeReleaseNotesObject(notes)
}

function isZeroSha(value) {
  return /^0{7,40}$/i.test(value.trim())
}

function truncateText(value, maxLength) {
  const text = value.trim().replace(/\s+/g, ' ')
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function capitalizeFirst(value) {
  const text = value.trim()
  if (!text) {
    return text
  }

  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

function cleanCommitSubject(subject) {
  const text = subject
    .trim()
    .replace(/^Merge pull request\b.*$/i, '')
    .replace(/^Merge branch\b.*$/i, '')
    .replace(/^[a-z]+(?:\([^)]+\))?!?:\s*/i, '')
    .replace(/\s+/g, ' ')

  return capitalizeFirst(text)
}

function uniqueTexts(values) {
  const seen = new Set()
  const result = []

  for (const value of values) {
    const text = value.trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(text)
  }

  return result
}

function listToSentence(values) {
  if (values.length === 0) {
    return ''
  }

  if (values.length === 1) {
    return values[0]
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`
  }

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`
}

function getReleaseBaseCommit(headRevision) {
  const explicitBase = firstEnv('APP_RELEASE_BEFORE_SHA', 'GITHUB_EVENT_BEFORE')
  if (explicitBase && !isZeroSha(explicitBase) && gitRevisionExists(explicitBase)) {
    return explicitBase
  }

  const previousCommit = getGitValue(['rev-parse', `${headRevision}^`])
  if (previousCommit && gitRevisionExists(previousCommit)) {
    return previousCommit
  }

  return ''
}

function getReleaseCommitSubjects(baseRevision, headRevision) {
  const range = baseRevision ? `${baseRevision}..${headRevision}` : headRevision
  const args = baseRevision
    ? ['log', '--no-merges', '--format=%s', range]
    : ['log', '-1', '--format=%s', headRevision]
  let subjects = getGitLines(args).map(cleanCommitSubject).filter(Boolean)

  if (baseRevision && subjects.length === 0) {
    subjects = getGitLines(['log', '--format=%s', range])
      .map(cleanCommitSubject)
      .filter(Boolean)
  }

  if (subjects.length === 0) {
    subjects = getGitLines(['log', '-1', '--format=%s', headRevision])
      .map(cleanCommitSubject)
      .filter(Boolean)
  }

  return uniqueTexts(subjects).slice(0, 8)
}

function getReleaseChangedFiles(baseRevision, headRevision) {
  const files = baseRevision
    ? getGitLines(['diff', '--name-only', `${baseRevision}..${headRevision}`])
    : getGitLines(['show', '--name-only', '--format=', headRevision])

  return uniqueTexts(files.map(file => file.replace(/\\/g, '/')))
}

function getReleaseHeadRevision(commitSha) {
  return (
    firstEnv('APP_RELEASE_HEAD_SHA', 'APP_RELEASE_COMMIT_SHA', 'VITE_APP_COMMIT_SHA', 'GITHUB_SHA') ||
    commitSha ||
    'HEAD'
  )
}

function defaultReleaseNotesChanged(headRevision) {
  const notesPath = DEFAULT_MANUAL_RELEASE_NOTES_PATH.replace(/\\/g, '/')
  const absoluteNotesPath = path.resolve(process.cwd(), DEFAULT_MANUAL_RELEASE_NOTES_PATH)
  if (!fs.existsSync(absoluteNotesPath)) {
    return false
  }

  const baseRevision = getReleaseBaseCommit(headRevision)
  const changedFiles = getReleaseChangedFiles(baseRevision, headRevision)
  return changedFiles.some(file => file.replace(/\\/g, '/') === notesPath)
}

function classifyChangedFiles(files) {
  const labels = []

  for (const file of files) {
    const normalizedFile = file.replace(/\\/g, '/')
    const rule = AREA_RULES.find(candidate => candidate.pattern.test(normalizedFile))
    if (rule) {
      labels.push(rule.label)
    }
  }

  return uniqueTexts(labels)
}

function inferReleaseSeverity(files, subjects) {
  const combined = `${files.join(' ')} ${subjects.join(' ')}`.toLowerCase()

  if (/\b(critical|security|hotfix|urgent)\b/.test(combined)) {
    return 'critical'
  }

  if (
    files.some(file =>
      /^(scripts\/|\.github\/workflows\/|docs\/|release-notes\/)/.test(file.replace(/\\/g, '/'))
    )
  ) {
    return 'maintenance'
  }

  return 'feature'
}

function buildGeneratedReleaseNotes(commitSha) {
  const headRevision = getReleaseHeadRevision(commitSha)
  const baseRevision = getReleaseBaseCommit(headRevision)
  const subjects = getReleaseCommitSubjects(baseRevision, headRevision)
  const changedFiles = getReleaseChangedFiles(baseRevision, headRevision)
  const areas = classifyChangedFiles(changedFiles)
  const highlights = subjects.length > 0
    ? subjects
    : ['Refresh the app with the latest production build']
  const title = highlights.length === 1
    ? highlights[0]
    : areas.length > 0
      ? `${areas[0]} update`
      : 'Shadow Chat update'
  const areaSentence = areas.length > 0
    ? `It updates ${listToSentence(areas.slice(0, 4)).toLowerCase()}.`
    : 'It updates the latest production build.'
  const summary = highlights.length === 1
    ? `This release includes: ${highlights[0]}. ${areaSentence} Restart or refresh to load the newest version.`
    : `This release includes ${highlights.length} shipped changes, including ${listToSentence(highlights.slice(0, 3))}. ${areaSentence} Restart or refresh to load the newest version.`
  const areaItems = areas.length > 0
    ? areas.map(area => `${area} received production changes in this build.`)
    : [`${changedFiles.length || 1} project file${changedFiles.length === 1 ? '' : 's'} changed in this build.`]

  return normalizeReleaseNotesObject({
    title: truncateText(title, 140),
    summary: truncateText(summary, 2000),
    restartPolicy: 'required_restart',
    severity: inferReleaseSeverity(changedFiles, highlights),
    sections: [
      {
        heading: 'Highlights',
        items: highlights.slice(0, 6).map(item => truncateText(item, 280)),
      },
      {
        heading: 'Updated areas',
        items: areaItems.slice(0, 6).map(item => truncateText(item, 280)),
      },
      {
        heading: 'Restart required',
        items: [
          'Restart or refresh Shadow Chat to load this build and clear the previous cached app version.',
        ],
      },
    ],
  })
}

function readNetlifyDeployInfo(filePath) {
  if (!filePath) {
    return {}
  }

  const absolutePath = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Netlify deploy JSON does not exist: ${absolutePath}`)
  }

  const data = readJsonFile(absolutePath, 'Netlify deploy output')
  return {
    deployId: data.deploy_id || data.deployId || data.id || '',
    deployUrl: data.deploy_url || data.deployUrl || data.ssl_url || data.url || '',
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

async function upsertAppRelease(supabaseUrl, serviceRoleKey, row) {
  const endpoint = new URL('/rest/v1/app_releases', supabaseUrl)
  endpoint.searchParams.set('on_conflict', 'build_id')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Release publish failed (${response.status}): ${body || response.statusText}`)
  }
}

async function broadcastAppRelease(supabaseUrl, serviceRoleKey, row) {
  const endpoint = new URL('/realtime/v1/api/broadcast', supabaseUrl)
  const payload = {
    build_id: row.build_id,
    commit_sha: row.commit_sha,
    deploy_id: row.deploy_id,
    deploy_url: row.deploy_url,
    title: row.title,
    restart_policy: row.restart_policy,
    severity: row.severity,
    published_at: row.published_at,
    sent_at: new Date().toISOString(),
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          topic: APP_RELEASE_BROADCAST_TOPIC,
          event: APP_RELEASE_BROADCAST_EVENT,
          payload,
        },
      ],
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Release broadcast failed (${response.status}): ${body || response.statusText}`)
  }
}

async function main() {
  loadLocalEnv()
  const args = parseArgs(process.argv.slice(2))
  const netlifyInfo = readNetlifyDeployInfo(args.netlifyJsonPath)

  const commitSha =
    firstEnv('APP_RELEASE_COMMIT_SHA', 'VITE_APP_COMMIT_SHA', 'GITHUB_SHA') ||
    getGitValue(['rev-parse', 'HEAD'])
  const buildId =
    firstEnv('APP_RELEASE_BUILD_ID', 'VITE_APP_BUILD_ID') ||
    commitSha
  const deployId =
    firstEnv('APP_RELEASE_DEPLOY_ID', 'NETLIFY_DEPLOY_ID') ||
    netlifyInfo.deployId
  const deployUrl =
    firstEnv('APP_RELEASE_DEPLOY_URL', 'NETLIFY_DEPLOY_URL', 'DEPLOY_URL', 'URL') ||
    netlifyInfo.deployUrl
  const notes = args.releaseNotesExplicit
    ? normalizeReleaseNotes(path.resolve(process.cwd(), args.releaseNotesPath))
    : defaultReleaseNotesChanged(getReleaseHeadRevision(commitSha))
      ? normalizeReleaseNotes(path.resolve(process.cwd(), DEFAULT_MANUAL_RELEASE_NOTES_PATH))
      : buildGeneratedReleaseNotes(commitSha)

  if (!buildId) {
    throw new Error('Missing build id. Set APP_RELEASE_BUILD_ID or VITE_APP_BUILD_ID.')
  }

  const row = {
    build_id: buildId.slice(0, 160),
    commit_sha: commitSha ? commitSha.slice(0, 80) : null,
    deploy_id: deployId ? deployId.slice(0, 160) : null,
    deploy_url: deployUrl ? deployUrl.slice(0, 600) : null,
    title: notes.title,
    summary: notes.summary,
    sections: notes.sections,
    restart_policy: notes.restart_policy,
    severity: notes.severity,
    active: true,
    published_at: new Date().toISOString(),
  }

  if (args.dryRun) {
    console.log(JSON.stringify(row, null, 2))
    return
  }

  const supabaseUrl = firstEnv('SUPABASE_URL', 'VITE_SUPABASE_URL')
  const serviceRoleKey = firstEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  }

  await upsertAppRelease(supabaseUrl, serviceRoleKey, row)
  await broadcastAppRelease(supabaseUrl, serviceRoleKey, row)

  console.log(`Published and broadcast app release ${row.build_id}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

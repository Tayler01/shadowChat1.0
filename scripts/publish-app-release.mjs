import { createClient } from '@supabase/supabase-js'
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

const DEFAULT_RELEASE_NOTES_PATH = path.join('release-notes', 'current.json')

function parseArgs(argv) {
  const args = {
    releaseNotesPath: process.env.APP_RELEASE_NOTES_PATH || DEFAULT_RELEASE_NOTES_PATH,
    netlifyJsonPath: '',
    dryRun: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--release-notes') {
      args.releaseNotesPath = argv[index + 1] || args.releaseNotesPath
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

function normalizeReleaseNotes(filePath) {
  const notes = readJsonFile(filePath, 'release notes')
  const title = normalizeText(notes.title, 140, 'title', true)
  const summary = normalizeText(notes.summary, 2000, 'summary')
  const restartPolicy = normalizeText(
    notes.restartPolicy || notes.restart_policy || 'optional_restart',
    80,
    'restartPolicy'
  )
  const severity = normalizeText(notes.severity || 'feature', 80, 'severity')

  if (!VALID_POLICIES.has(restartPolicy)) {
    throw new Error(`restartPolicy must be one of: ${Array.from(VALID_POLICIES).join(', ')}.`)
  }

  if (!VALID_SEVERITIES.has(severity)) {
    throw new Error(`severity must be one of: ${Array.from(VALID_SEVERITIES).join(', ')}.`)
  }

  return {
    title,
    summary,
    sections: normalizeSections(notes.sections),
    restart_policy: restartPolicy,
    severity,
  }
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

async function main() {
  const args = parseArgs(process.argv.slice(2))
  loadLocalEnv()

  const releaseNotesPath = path.resolve(process.cwd(), args.releaseNotesPath)
  const notes = normalizeReleaseNotes(releaseNotesPath)
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

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { error } = await supabase
    .from('app_releases')
    .upsert(row, { onConflict: 'build_id' })

  if (error) {
    throw error
  }

  console.log(`Published app release ${row.build_id}`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

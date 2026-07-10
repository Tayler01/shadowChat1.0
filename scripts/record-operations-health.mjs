import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  loadFunctionManifest,
  validateFunctionManifest,
  verifyRemoteFunctionInventory,
} from './deploy-supabase-functions.mjs'
import { upsertOperationsHealthSnapshot } from './operations-health-shared.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const firstEnvironmentValue = (...keys) => {
  for (const key of keys) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const readJson = (filePath, label) => {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(root, filePath), 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read ${label} at ${filePath}: ${detail}`)
  }
}

const parseArgs = argv => {
  const values = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--')) continue
    values[key.slice(2)] = argv[index + 1] || ''
    index += 1
  }
  return values
}

const normalizeUrl = value => {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

export const getLatestMigrationVersion = (migrationRoot = path.join(root, 'supabase', 'migrations')) => {
  const versions = fs.readdirSync(migrationRoot)
    .map(fileName => /^(\d{14})_.+\.sql$/.exec(fileName)?.[1] || '')
    .filter(Boolean)
    .sort()
  const latest = versions.at(-1)
  if (!latest) throw new Error('No timestamped Supabase migrations were found.')
  return latest
}

export const getFunctionManifestDigest = () => {
  const source = fs.readFileSync(path.join(root, 'supabase', 'function-manifest.json'))
  return createHash('sha256').update(source).digest('hex')
}

const getNetlifyDeployInfo = deploy => ({
  deployId: deploy.deploy_id || deploy.deployId || deploy.id || null,
  deployUrl: normalizeUrl(
    deploy.deploy_url || deploy.deployUrl || deploy.ssl_url || deploy.url || ''
  ),
})

export const buildReleaseHealthSnapshot = ({
  buildManifest,
  commitSha,
  functionManifest,
  functionManifestDigest,
  latestMigrationVersion,
  netlifyDeploy,
  remoteFunctions,
  secretEntries,
  workflowUrl,
  now = new Date(),
}) => {
  if (!commitSha) throw new Error('The release commit SHA is required.')
  if (buildManifest.schemaVersion !== 1) {
    throw new Error(`Unsupported build health schema: ${buildManifest.schemaVersion}`)
  }
  if (buildManifest.commitSha !== commitSha) {
    throw new Error(
      `Built frontend SHA ${buildManifest.commitSha || 'missing'} does not match release SHA ${commitSha}.`
    )
  }
  if (buildManifest.deployContext !== 'production') {
    throw new Error('The production build health manifest is missing its production deploy context.')
  }

  verifyRemoteFunctionInventory(functionManifest, remoteFunctions)

  const deployedFunctionNames = new Set(
    remoteFunctions
      .filter(entry => entry.status === 'ACTIVE')
      .map(entry => entry.name ?? entry.slug)
  )
  const configuredSecretNames = new Set(secretEntries.map(entry => entry.name))
  const pushMissingRequirements = []

  if (!buildManifest.pushPublicKeyConfigured) {
    pushMissingRequirements.push('VITE_WEB_PUSH_PUBLIC_KEY')
  }
  for (const secretName of [
    'WEB_PUSH_PUBLIC_KEY',
    'WEB_PUSH_PRIVATE_KEY',
    'WEB_PUSH_SUBJECT',
  ]) {
    if (!configuredSecretNames.has(secretName)) pushMissingRequirements.push(secretName)
  }
  if (!deployedFunctionNames.has('send-push')) {
    pushMissingRequirements.push('send-push Edge Function')
  }

  const { deployId, deployUrl } = getNetlifyDeployInfo(netlifyDeploy)
  const recordedAt = now.toISOString()

  return {
    environment: 'production',
    frontend_sha: commitSha.slice(0, 80),
    frontend_build_id: (buildManifest.buildId || commitSha).slice(0, 160),
    deploy_id: deployId ? String(deployId).slice(0, 160) : null,
    deploy_url: deployUrl?.slice(0, 600) || null,
    release_workflow_url: normalizeUrl(workflowUrl)?.slice(0, 600) || null,
    deployed_at: recordedAt,
    migration_version: latestMigrationVersion,
    migrations_current: true,
    function_manifest_sha256: functionManifestDigest,
    active_function_count: functionManifest.active.length,
    paused_function_count: functionManifest.pausedDeny.length,
    removed_function_count: functionManifest.pausedRemove.length,
    functions_current: true,
    backend_checked_at: recordedAt,
    smoke_status: 'pending',
    push_ready: pushMissingRequirements.length === 0,
    push_missing_requirements: pushMissingRequirements,
    news_state: 'paused',
    bridge_state: 'paused',
  }
}

export const recordReleaseHealth = async ({ args = {}, fetchImpl = fetch } = {}) => {
  if (firstEnvironmentValue('OPERATIONS_MIGRATIONS_CURRENT').toLowerCase() !== 'true') {
    throw new Error('OPERATIONS_MIGRATIONS_CURRENT=true is required after a clean post-push dry run.')
  }

  const functionManifest = validateFunctionManifest(loadFunctionManifest())
  const buildManifest = readJson(
    args.build || 'dist/.well-known/shadowchat-health.json',
    'build health manifest'
  )
  const remoteFunctions = readJson(
    args.functions || 'output/release-evidence/functions.json',
    'remote function inventory'
  )
  const secretEntries = readJson(
    args.secrets || firstEnvironmentValue('OPERATIONS_HEALTH_SECRETS_PATH'),
    'Supabase secret-name inventory'
  )
  const netlifyDeploy = readJson(
    args.netlify || 'netlify-production.json',
    'Netlify deploy output'
  )
  const commitSha = firstEnvironmentValue(
    'OPERATIONS_HEALTH_COMMIT_SHA',
    'APP_RELEASE_HEAD_SHA',
    'GITHUB_SHA'
  )
  const workflowUrl = firstEnvironmentValue('OPERATIONS_HEALTH_WORKFLOW_URL')
    || (
      firstEnvironmentValue('GITHUB_SERVER_URL')
      && firstEnvironmentValue('GITHUB_REPOSITORY')
      && firstEnvironmentValue('GITHUB_RUN_ID')
        ? `${firstEnvironmentValue('GITHUB_SERVER_URL')}/${firstEnvironmentValue('GITHUB_REPOSITORY')}/actions/runs/${firstEnvironmentValue('GITHUB_RUN_ID')}`
        : ''
    )

  const snapshot = buildReleaseHealthSnapshot({
    buildManifest,
    commitSha,
    functionManifest,
    functionManifestDigest: getFunctionManifestDigest(),
    latestMigrationVersion: getLatestMigrationVersion(),
    netlifyDeploy,
    remoteFunctions,
    secretEntries,
    workflowUrl,
  })

  const supabaseUrl = firstEnvironmentValue('SUPABASE_URL', 'MONITOR_SUPABASE_URL')
  const serviceRoleKey = firstEnvironmentValue(
    'SUPABASE_SERVICE_ROLE_KEY',
    'MONITOR_SUPABASE_SERVICE_ROLE_KEY'
  )
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }

  await upsertOperationsHealthSnapshot({
    fetchImpl,
    serviceRoleKey,
    snapshot,
    supabaseUrl,
  })
  console.log(
    `Recorded operations release evidence for ${snapshot.frontend_sha.slice(0, 7)} `
    + `(${snapshot.active_function_count} active Functions, push ${snapshot.push_ready ? 'ready' : 'incomplete'}).`
  )
  return snapshot
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  recordReleaseHealth({ args }).catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}

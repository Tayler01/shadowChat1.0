/** Read-only target/key lookup for destructive synthetic QA. No linked/.env fallback. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

export const SHADOWCHAT_PRODUCTION_PROJECT = 'shsqqouecvdoifzufkqm'
const PROJECT_REF = /^[a-z]{20}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function argument(args, name) {
  const matches = args.filter(value => value.startsWith(`--${name}=`))
  assert.equal(matches.length, 1, `Exactly one --${name}= value is required`)
  return matches[0].slice(name.length + 3)
}

export function parseHostedTestTarget(args) {
  assert(args.includes('--execute'), 'Explicit --execute is required for synthetic hosted QA')
  const project = argument(args, 'project-ref')
  const parentProject = argument(args, 'parent-project-ref')
  const branchId = argument(args, 'branch-id')
  const bootstrapReceipt = argument(args, 'bootstrap-receipt')
  assert.match(project, PROJECT_REF, 'A valid disposable project reference is required')
  assert.equal(parentProject, SHADOWCHAT_PRODUCTION_PROJECT, 'The explicitly selected parent must be the ShadowChat project')
  assert.notEqual(project, parentProject, 'Production is never a synthetic hosted test target')
  assert.match(branchId, UUID, 'The exact disposable branch ID is required')
  assert(bootstrapReceipt, 'A verified staged bootstrap receipt is required')
  return { project, parentProject, branchId, bootstrapReceipt, url: `https://${project}.supabase.co` }
}

export function validateDisposableBranch(target, branches) {
  assert(Array.isArray(branches), 'Authoritative branch listing must be an array')
  const matching = branches.filter(branch => branch.id === target.branchId)
  assert.equal(matching.length, 1, 'The exact disposable branch must still exist')
  const branch = matching[0]
  assert.equal(branch.project_ref, target.project, 'Branch and test project must match')
  assert.equal(branch.parent_project_ref, target.parentProject, 'Branch parent must match')
  assert.equal(branch.is_default, false, 'The main/default branch is forbidden')
  assert.equal(branch.with_data, false, 'Only a no-data synthetic branch is permitted')
  assert.equal(branch.persistent, false, 'Persistent/shared branches are forbidden')
  return { id: branch.id, name: branch.name, parentProject: branch.parent_project_ref }
}

export function stagedMigrationHashes() {
  const directory = new URL('../supabase/migrations/', import.meta.url)
  return Object.fromEntries(readdirSync(directory).filter(name => /^\d{14}_.+\.sql$/.test(name) && name >= '20261022231052_')
    .map(name => [`supabase/migrations/${name}`, createHash('sha256').update(readFileSync(new URL(name, directory))).digest('hex')]))
}

export function validateBootstrapReceipt(target, receipt, expectedMigrations, now = Date.now()) {
  assert.equal(receipt?.schemaVersion, 1, 'A versioned bootstrap receipt is required')
  assert.equal(receipt.purpose, 'streamlined-staged-acceptance', 'A baseline-only receipt is insufficient')
  assert.equal(receipt.ready, true, 'Staged schema/functions must be verified ready')
  assert.equal(receipt.projectRef, target.project)
  assert.equal(receipt.parentProjectRef, target.parentProject)
  assert.equal(receipt.branchId, target.branchId)
  const verifiedAt = Date.parse(receipt.verifiedAt)
  assert(Number.isFinite(verifiedAt) && verifiedAt <= now && now - verifiedAt <= 24 * 60 * 60 * 1000, 'Bootstrap verification must be fresh')
  for (const key of ['dispatchersDisabled', 'cronDisabled', 'noProductionData']) {
    assert.equal(receipt.isolation?.[key], true, `Bootstrap must verify ${key}`)
  }
  assert(Array.isArray(receipt.migrations), 'Receipt must include verified migration source hashes')
  const applied = new Map(receipt.migrations.map(entry => [entry.file, entry.sha256]))
  assert.equal(applied.size, receipt.migrations.length, 'Duplicate migration entries are forbidden')
  assert(Object.keys(expectedMigrations).length > 0, 'No staged migration sources found')
  for (const [file, hash] of Object.entries(expectedMigrations)) {
    assert.equal(applied.get(file), hash, `Staged migration is missing or changed: ${file}`)
  }
  assert(Array.isArray(receipt.functions), 'Receipt must include verified Edge deployment metadata')
  for (const name of ['delete-account', 'moderation-media', 'shadow-pin-video']) {
    const matches = receipt.functions.filter(entry => entry.name === name)
    assert.equal(matches.length, 1, `Exact Edge deployment required: ${name}`)
    assert.equal(matches[0].status, 'ACTIVE', `Edge function must be active: ${name}`)
    assert(Number.isInteger(matches[0].version) && matches[0].version > 0, `Edge deployment version required: ${name}`)
  }
  return { verifiedAt: receipt.verifiedAt, migrationCount: applied.size, functionNames: receipt.functions.map(entry => entry.name) }
}

export function validateHostedTestKeys(target, result) {
  const keys = Array.isArray(result) ? result : result?.api_keys
  assert(Array.isArray(keys), 'Disposable project API keys are unavailable')
  const selected = {}
  for (const role of ['anon', 'service_role']) {
    const key = keys.find(entry => entry.name === role)?.api_key
    assert(typeof key === 'string', `Disposable ${role} key is unavailable`)
    let payload
    try { payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) }
    catch { throw new Error(`Disposable ${role} key has no verifiable project binding`) }
    assert.equal(payload.ref, target.project, 'API key must belong to the disposable target')
    assert.equal(payload.role, role, 'API key role must match its intended use')
    selected[role] = key
  }
  return { anonKey: selected.anon, serviceKey: selected.service_role }
}

export function loadHostedTestTarget(args, execute = execFileSync, readiness = {}) {
  const target = parseHostedTestTarget(args)
  const command = process.platform === 'win32' ? 'supabase.exe' : 'supabase'
  const readJson = parameters => {
    try {
      return JSON.parse(execute(command, parameters, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
      }))
    } catch {
      // CLI errors may include captured output; never print credential-bearing output.
      throw new Error('Disposable Supabase target lookup failed; no credentials were printed')
    }
  }
  const branch = validateDisposableBranch(target, readJson([
    'branches', 'list', '--project-ref', target.parentProject, '--output', 'json',
  ]))
  // Branch status can retain MIGRATIONS_FAILED after explicitly repaired history.
  // Readiness comes from fresh, source-bound catalog/deployment verification.
  const receipt = readiness.receipt ?? JSON.parse(readFileSync(target.bootstrapReceipt, 'utf8'))
  const bootstrap = validateBootstrapReceipt(target, receipt, readiness.migrations ?? stagedMigrationHashes())
  const keys = validateHostedTestKeys(target, readJson([
    'projects', 'api-keys', '--project-ref', target.project, '--output', 'json',
  ]))
  return { ...target, branch, bootstrap, ...keys }
}

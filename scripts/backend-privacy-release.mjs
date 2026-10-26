/** Explicit backend-only phases. No frontend, Auth config, provider toggle or purge publication. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseSupabaseQueryRows } from './supabase-query-output.mjs'
import { accountDeletionReleaseConfig, verifyAccountDeletionReleaseReadiness } from './verify-account-deletion-release.mjs'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
export const releasePlanPath = 'supabase/backend-privacy-release.json'
export const producerFunctions = ['shadow-pin-video', 'shado-tv-bunny-upload', 'moderation-media']
const phases = ['foundation', 'producers', 'deletion-handover', 'activation']
export const minimumDeletionDrainMs = 15 * 60 * 1000
const migrationPath = /^supabase\/migrations\/([0-9]{14})_[a-z0-9_]+\.sql$/
const shaPattern = /^[a-f0-9]{64}$/
const commitPattern = /^[a-f0-9]{40}$/
const lf = value => Buffer.from(value).toString('utf8').replaceAll('\r\n', '\n')
export const releaseSha256 = value => createHash('sha256').update(lf(value)).digest('hex')
const versionOf = entry => entry.path.match(migrationPath)?.[1]
const sorted = values => [...values].sort()

function filesBelow(root, relative) {
  const directory = path.join(root, relative)
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink(), `Release inputs cannot contain symlinks: ${relative}/${entry.name}`)
    const child = `${relative}/${entry.name}`
    return entry.isDirectory() ? filesBelow(root, child) : entry.isFile() ? [child] : []
  }).sort()
}

export function treeDigest(paths, read) {
  return releaseSha256(sorted(paths).map(file => `${file}\0${releaseSha256(read(file))}`).join('\n'))
}

export function validateReleasePlan(plan) {
  assert.equal(plan?.version, 1, 'Unsupported backend privacy release plan')
  assert.equal(plan.projectRef, 'shsqqouecvdoifzufkqm', 'Backend release project differs from the reviewed production project')
  assert.equal(plan.libraryId, '666331', 'Backend release library differs from the reviewed provider inventory')
  assert.equal(plan.hashFormat, 'sha256-lf', 'Release hashes must specify canonical LF bytes')
  assert.match(plan.baselineVersion, /^[0-9]{14}$/, 'Invalid baseline migration version')
  assert.match(plan.baselineSha256, shaPattern, 'Missing reviewed historical migration digest')
  assert.match(plan.backendFilesSha256, shaPattern, 'Missing reviewed function/config digest')
  assert(Array.isArray(plan.foundation) && plan.foundation.length === 20, 'Foundation must contain exactly the 20 reviewed migrations')
  assert(Array.isArray(plan.activation) && plan.activation.length === 1, 'Activation must contain exactly one reviewed migration')
  const entries = [...plan.foundation, ...plan.activation]
  const versions = entries.map(entry => {
    assert.match(entry.path, migrationPath, 'Unsafe migration path')
    assert.match(entry.sha256, shaPattern, 'Missing exact migration digest')
    return versionOf(entry)
  })
  assert.equal(new Set(versions).size, versions.length, 'Duplicate migration version')
  assert.deepEqual(versions, sorted(versions), 'Release migrations must be in chronological order')
  assert(versions[0] > plan.baselineVersion, 'Foundation must follow the deployed baseline')
  assert.equal(plan.activation[0].path, 'supabase/migrations/20261023224455_security_privacy_activation.sql', 'Unexpected activation migration')
  assert.deepEqual(plan.producers.map(entry => entry.name), producerFunctions, 'Producer phase is an exact function allowlist')
  for (const entry of plan.producers) assert.equal(typeof entry.verifyJwt, 'boolean', 'Function JWT contract is required')
  return plan
}

export function loadReleasePlan(root = repositoryRoot) {
  return validateReleasePlan(JSON.parse(readFileSync(path.join(root, releasePlanPath), 'utf8')))
}

export function inspectReleaseInputs(root, plan) {
  validateReleasePlan(plan)
  const read = file => readFileSync(path.join(root, file))
  const allMigrations = filesBelow(root, 'supabase/migrations').filter(file => migrationPath.test(file))
  const baseline = allMigrations.filter(file => file.match(migrationPath)[1] <= plan.baselineVersion)
  assert(baseline.length > 0, 'Historical migrations are missing')
  assert.equal(treeDigest(baseline, read), plan.baselineSha256, 'Historical migration snapshot changed')
  const expected = [...baseline, ...plan.foundation.map(entry => entry.path), ...plan.activation.map(entry => entry.path)]
  assert.deepEqual(sorted(allMigrations), sorted(expected), 'A migration outside the reviewed phase allowlist is present')
  for (const entry of [...plan.foundation, ...plan.activation]) {
    assert.equal(releaseSha256(read(entry.path)), entry.sha256, `Reviewed migration changed: ${entry.path}`)
  }
  const backend = [
    ...filesBelow(root, 'supabase/functions'), ...filesBelow(root, 'supabase/templates'),
    'supabase/config.toml', 'supabase/function-manifest.json', 'supabase/security-definer-allowlist.json', 'deno.lock',
  ]
  assert.equal(treeDigest(backend, read), plan.backendFilesSha256, 'Reviewed backend function/config snapshot changed')
  return { baseline, backend, read, planSha256: releaseSha256(read(releasePlanPath)) }
}

// History stores statements rather than original file bytes. Ignore only SQL
// comments, whitespace and delimiters outside quoted literals; preserve bodies.
export function migrationStatementDigest(statements) {
  assert(Array.isArray(statements) && statements.every(value => typeof value === 'string'), 'Missing migration statement history')
  const source = lf(statements.join('\n;\n'))
  const tokens = []
  let i = 0
  while (i < source.length) {
    if (/\s/.test(source[i]) || source[i] === ';') { i++; continue }
    if (source.startsWith('--', i)) { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end; continue }
    if (source.startsWith('/*', i)) {
      let depth = 1; i += 2
      while (i < source.length && depth) {
        if (source.startsWith('/*', i)) { depth++; i += 2 }
        else if (source.startsWith('*/', i)) { depth--; i += 2 }
        else i++
      }
      assert.equal(depth, 0, 'Unterminated SQL comment')
      continue
    }
    const dollar = source.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0]
    if (dollar) {
      const end = source.indexOf(dollar, i + dollar.length)
      assert(end >= 0, 'Unterminated SQL function body')
      tokens.push(source.slice(i, end + dollar.length)); i = end + dollar.length; continue
    }
    if (source[i] === "'" || source[i] === '"') {
      const start = i; const quote = source[i++]
      const escapes = quote === "'" && /(?:^|[^a-zA-Z0-9_])[eE]$/.test(source.slice(0, start))
      let ended = false
      while (i < source.length) {
        if (escapes && source[i] === '\\') { i += 2; continue }
        if (source[i++] === quote) {
          if (source[i] === quote) { i++; continue }
          ended = true; break
        }
      }
      assert(ended, 'Unterminated SQL literal')
      tokens.push(source.slice(start, i)); continue
    }
    const word = source.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_$]*/)?.[0]
    if (word) { tokens.push(word.toLowerCase()); i += word.length }
    else tokens.push(source[i++])
  }
  return releaseSha256(JSON.stringify(tokens))
}

export function assertMigrationHistory(rows, plan, inputs, phase) {
  assert(Array.isArray(rows), 'Invalid migration history')
  const baseline = inputs.baseline.map(file => file.match(migrationPath)[1])
  const entries = [...plan.foundation, ...plan.activation]
  const known = new Set([...baseline, ...entries.map(versionOf)])
  const actual = rows.map(row => row.version)
  assert.equal(new Set(actual).size, actual.length, 'Duplicate remote migration version')
  assert(baseline.every(version => actual.includes(version)), 'Baseline history is incomplete; the phase must not replay historical migrations')
  assert(actual.every(version => known.has(version)), 'Unexpected remote migration history; review before changing this project')
  for (const entry of entries) {
    const row = rows.find(row => row.version === versionOf(entry))
    if (row) assert.equal(migrationStatementDigest(row.statements), migrationStatementDigest([lf(inputs.read(entry.path))]), `Deployed migration differs from reviewed SQL: ${versionOf(entry)}`)
  }
  const foundation = plan.foundation.map(versionOf)
  const installed = foundation.filter(version => actual.includes(version))
  assert.deepEqual(installed, foundation.slice(0, installed.length), 'Foundation history has a gap')
  if (phase !== 'foundation') assert.deepEqual(installed, foundation, 'Complete foundation is required first')
  const activated = actual.includes(versionOf(plan.activation[0]))
  if (phase !== 'activation' && phase !== 'complete') assert.equal(activated, false, 'This preparation phase cannot run after activation')
  if (phase === 'complete') assert.equal(activated, true, 'Security activation is pending; use the explicit backend-only phase workflow')
  return { installed, activated }
}

export function assertMainReleaseContext(environment, git) {
  const commit = git(['rev-parse', 'HEAD']).trim()
  assert.match(commit, commitPattern, 'Invalid source commit')
  if (environment.GITHUB_ACTIONS === 'true') {
    assert.equal(environment.GITHUB_REF, 'refs/heads/main', 'Backend changes are main-only')
    assert.equal(environment.GITHUB_SHA, commit, 'Checkout differs from the workflow source commit')
  } else assert.equal(git(['branch', '--show-current']).trim(), 'main', 'Backend changes require the main branch')
  assert.equal(git(['status', '--porcelain', '--', 'scripts', 'supabase', 'deno.lock', '.github/workflows']).trim(), '', 'Release inputs must be committed and clean on main')
  return commit
}

function historyQuery(plan) {
  const versions = [...plan.foundation, ...plan.activation].map(entry => `'${versionOf(entry)}'`).join(',')
  return `begin transaction read only; select version,case when version in (${versions}) then statements else null end as statements from supabase_migrations.schema_migrations order by version; rollback;`
}

export function assertProducerInventory(functions, plan) {
  assert(Array.isArray(functions), 'Invalid deployed function inventory')
  return plan.producers.map(expected => {
    const actual = functions.find(entry => (entry.name ?? entry.slug) === expected.name)
    assert(actual && actual.status === 'ACTIVE' && actual.verify_jwt === expected.verifyJwt, `Producer missing or JWT contract changed: ${expected.name}`)
    assert(Number.isSafeInteger(actual.version) && actual.version > 0, 'Invalid deployed function version')
    const updatedAt = typeof actual.updated_at === 'number' ? actual.updated_at : Date.parse(actual.updated_at)
    assert(Number.isFinite(updatedAt) && updatedAt > 0, 'Deployed function update time is unavailable')
    return { name: expected.name, version: actual.version, updatedAt, verifyJwt: expected.verifyJwt }
  })
}

const acceptanceChecks = {
  producers: ['foundation_preserves_existing_full_app'],
  'deletion-handover': ['foundation_preserves_existing_full_app', 'existing_and_new_provider_actions', 'old_producer_requests_drained', 'moderation_capture_ready', 'legacy_reconciliation_hosted', 'deletion_handover_start_guard'],
  activation: ['foundation_preserves_existing_full_app', 'existing_and_new_provider_actions', 'old_producer_requests_drained', 'moderation_capture_ready', 'profile_and_realtime_compatibility', 'legacy_reconciliation_hosted', 'deletion_handover_start_guard', 'old_deletion_requests_drained'],
}
export function assertPhaseAcceptance(value, { phase, planSha256, projectRef, commit, producers, deletionHandler, now = Date.now() }) {
  assert.equal(value?.version, 1, 'Runtime acceptance evidence is required')
  assert.equal(value.phase, phase, 'Acceptance evidence belongs to another phase')
  assert.equal(value.projectRef, projectRef, 'Acceptance evidence targets another project')
  assert.equal(value.sourceCommit, commit, 'Acceptance evidence belongs to another source commit')
  assert.equal(value.planSha256, planSha256, 'Acceptance evidence belongs to another reviewed release plan')
  const observed = Date.parse(value.observedAt)
  assert(Number.isFinite(observed) && observed <= now && now - observed < 4 * 60 * 60 * 1000, 'Runtime acceptance evidence must be fresh (under four hours)')
  for (const check of acceptanceChecks[phase]) {
    assert.equal(value.checks?.[check]?.passed, true, `Runtime acceptance has not passed: ${check}`)
    assert(typeof value.checks[check].evidence === 'string' && value.checks[check].evidence.trim().length > 5, `Missing test evidence reference: ${check}`)
  }
  if (phase === 'activation' || phase === 'deletion-handover') {
    assert.deepEqual(value.producers, producers, 'Producer versions changed after acceptance')
    assert(producers.every(entry => observed >= entry.updatedAt), 'Acceptance predates a producer deployment')
  }
  if (phase === 'activation') {
    assert.deepEqual(value.deletionHandler, deletionHandler, 'Durable deletion handler changed after acceptance')
    assert(deletionHandler && observed >= deletionHandler.updatedAt + minimumDeletionDrainMs,
      'Old deletion requests must drain for at least 15 minutes after durable handler deployment')
  }
  return value
}

export function assertDeletionHandlerInventory(functions) {
  return assertProducerInventory(functions, { producers: [{ name: 'delete-account', verifyJwt: false }] })[0]
}

export async function probeDeletionHandover(projectRef, fetchImpl = fetch) {
  const response = await fetchImpl(`https://${projectRef}.supabase.co/functions/v1/delete-account`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'capabilities' }), signal: AbortSignal.timeout(15_000),
  })
  assert(response.ok, 'Durable deletion capability probe failed')
  const value = await response.json()
  assert(value?.protocol === 'shadowchat.account-deletion.v1' && value.action === 'capabilities'
    && value.receiptRecovery === true && value.stagedHandover === true
    && value.legacyRequestCompatibility === true && value.deletionStarted === false,
  'Deployed deletion handler does not prove the guarded legacy-compatible handover protocol')
  return { protocol: value.protocol, stagedHandover: true, legacyRequestCompatibility: true, deletionStarted: false }
}

function createCli(environment, run = execFileSync) {
  return (args, workdir, json = false) => {
    let result
    try {
      result = run(process.platform === 'win32' ? 'supabase.exe' : 'supabase', [...args, '--workdir', workdir],
        { cwd: repositoryRoot, env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000, maxBuffer: 32 * 1024 * 1024 })
    } catch { throw new Error(`Backend phase command failed (${args.slice(0, 2).join(' ')}); raw credentials and database diagnostics are not printed`) }
    if (!json) return result
    try { return JSON.parse(result) } catch { throw new Error('Backend phase command returned invalid JSON') }
  }
}

export function verifySecurityActivationReady({ root = repositoryRoot, environment = process.env, run = execFileSync } = {}) {
  const plan = loadReleasePlan(root)
  const linked = readFileSync(path.join(root, 'supabase/.temp/project-ref'), 'utf8')
  const config = accountDeletionReleaseConfig(environment, linked)
  assert.equal(config.projectRef, plan.projectRef, 'Activation check targets another project')
  assert.equal(config.libraryId, plan.libraryId, 'Activation check targets another provider library')
  for (const entry of [...plan.foundation, ...plan.activation]) assert.equal(releaseSha256(readFileSync(path.join(root, entry.path))), entry.sha256, 'Reviewed security migration changed')
  const rows = parseSupabaseQueryRows(createCli(environment, run)(['db', 'query', '--linked', '--output', 'json', historyQuery(plan)], root))
  for (const entry of [...plan.foundation, ...plan.activation]) {
    const record = rows.find(row => row.version === versionOf(entry))
    assert(record, 'Security activation is pending; use the explicit backend-only phase workflow before normal production publication')
    assert.equal(migrationStatementDigest(record.statements), migrationStatementDigest([lf(readFileSync(path.join(root, entry.path)))]), 'Installed security migration differs from the reviewed phase')
  }
  return { activated: true, version: versionOf(plan.activation[0]) }
}

export async function runBackendPrivacyPhase({ phase, apply = false, acceptance, root = repositoryRoot,
  environment = process.env, run = execFileSync, readiness = verifyAccountDeletionReleaseReadiness,
  probeDeletion = probeDeletionHandover, now = () => Date.now() } = {}) {
  assert(phases.includes(phase), 'Choose foundation, producers, deletion-handover or activation')
  const plan = loadReleasePlan(root)
  const inputs = inspectReleaseInputs(root, plan)
  const selected = phase === 'activation' ? [...plan.foundation, ...plan.activation] : plan.foundation
  if (!apply) return { phase, apply: false, planSha256: inputs.planSha256, migrationPaths: phase === 'producers' || phase === 'deletion-handover' ? [] : selected.map(entry => entry.path), functionNames: phase === 'producers' ? producerFunctions : phase === 'deletion-handover' ? ['delete-account'] : phase === 'activation' ? 'classified backend inventory; delete-account last' : [], frontendPublication: false, configPublication: false }
  const git = args => run('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  const commit = assertMainReleaseContext(environment, git)
  const configuration = accountDeletionReleaseConfig(environment, plan.projectRef)
  assert.equal(environment.SUPABASE_PROJECT_ID, plan.projectRef, 'Release environment targets another project')
  assert.equal(configuration.libraryId, plan.libraryId, 'Release environment targets another provider library')
  assert(environment.SUPABASE_ACCESS_TOKEN && environment.SUPABASE_DB_PASSWORD, 'Explicit backend release credentials are required')
  const cli = createCli(environment, run)
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'shadowchat-backend-release-'))
  const write = (file, contents) => { mkdirSync(path.dirname(path.join(temporary, file)), { recursive: true }); writeFileSync(path.join(temporary, file), lf(contents), { flag: 'wx' }) }
  const readHistory = () => parseSupabaseQueryRows(cli(['db', 'query', '--linked', '--output', 'json', historyQuery(plan)], temporary))
  const liveReadiness = () => readiness({ environment, workspaceRoot: temporary, run })
  let receipt
  try {
    for (const file of [...inputs.baseline, ...selected.map(entry => entry.path)]) write(file, inputs.read(file))
    write(releasePlanPath, readFileSync(path.join(root, releasePlanPath)))
    if (phase === 'foundation') write('supabase/config.toml', 'project_id = "shadowchat-backend-foundation"\n')
    else for (const file of inputs.backend) write(file, inputs.read(file))
    cli(['link', '--project-ref', plan.projectRef], temporary)
    assert.equal(readFileSync(path.join(temporary, 'supabase/.temp/project-ref'), 'utf8').trim(), plan.projectRef, 'Isolated release link changed')
    assertMigrationHistory(readHistory(), plan, inputs, phase)
    receipt = { version: 1, phase, runId: randomUUID(), status: 'incomplete', projectRef: plan.projectRef, sourceCommit: commit, planSha256: inputs.planSha256,
      backendFilesSha256: plan.backendFilesSha256, startedAt: new Date(now()).toISOString(), lastCompletedStep: 'history_verified',
      frontendPublication: false, configPublication: false, functionNames: [] }
    if (phase !== 'foundation') {
      liveReadiness()
      const functions = phase === 'activation' || phase === 'deletion-handover'
        ? cli(['functions', 'list', '--project-ref', plan.projectRef, '--output', 'json'], temporary, true) : undefined
      const producers = functions ? assertProducerInventory(functions, plan) : undefined
      const deletionHandler = phase === 'activation' ? assertDeletionHandlerInventory(functions) : undefined
      assertPhaseAcceptance(acceptance, { phase, projectRef: plan.projectRef, planSha256: inputs.planSha256, commit, producers, deletionHandler, now: now() })
      if (phase === 'activation') receipt.deletionProtocol = await probeDeletion(plan.projectRef)
    }
    if (phase === 'foundation' || phase === 'activation') {
      cli(['db', 'push', '--linked', '--dry-run'], temporary)
      cli(['db', 'push', '--linked', '--yes'], temporary)
      const installed = assertMigrationHistory(readHistory(), plan, inputs, phase === 'activation' ? 'complete' : 'foundation')
      assert.deepEqual(installed.installed, plan.foundation.map(versionOf), 'Foundation did not finish applying')
      receipt.appliedVersions = selected.map(versionOf)
      receipt.lastCompletedStep = 'migrations_verified'
    }
    if (phase === 'producers') {
      const before = cli(['functions', 'list', '--project-ref', plan.projectRef, '--output', 'json'], temporary, true)
      // Explicit names are mandatory: an omitted CLI name means deploy ALL.
      cli(['functions', 'deploy', ...producerFunctions, '--project-ref', plan.projectRef, '--use-api', '--jobs', '1'], temporary)
      receipt.functionNames = [...producerFunctions]
      receipt.producers = assertProducerInventory(cli(['functions', 'list', '--project-ref', plan.projectRef, '--output', 'json'], temporary, true), plan)
      for (const actual of receipt.producers) {
        const previous = before.find(entry => (entry.name ?? entry.slug) === actual.name)
        assert(!previous || actual.version > previous.version, `Producer deployment version did not advance: ${actual.name}`)
      }
      receipt.lastCompletedStep = 'producers_deployed'
      liveReadiness()
    }
    if (phase === 'deletion-handover') {
      const before = assertDeletionHandlerInventory(cli(['functions', 'list', '--project-ref', plan.projectRef, '--output', 'json'], temporary, true))
      cli(['functions', 'deploy', 'delete-account', '--project-ref', plan.projectRef, '--use-api', '--jobs', '1'], temporary)
      receipt.functionNames = ['delete-account']
      receipt.deletionHandler = assertDeletionHandlerInventory(cli(['functions', 'list', '--project-ref', plan.projectRef, '--output', 'json'], temporary, true))
      assert(receipt.deletionHandler.version > before.version, 'Durable deletion handler version did not advance')
      receipt.lastCompletedStep = 'durable_deletion_handler_deployed'
      receipt.deletionProtocol = await probeDeletion(plan.projectRef)
      receipt.activationNotBefore = new Date(receipt.deletionHandler.updatedAt + minimumDeletionDrainMs).toISOString()
      liveReadiness()
    }
    if (phase === 'activation') {
      liveReadiness()
      run(process.execPath, [path.join(root, 'scripts/deploy-supabase-functions.mjs'), '--deploy'], {
        cwd: root, env: { ...environment, SHADOWCHAT_BACKEND_RELEASE_WORKDIR: temporary }, stdio: 'inherit', timeout: 600_000,
      })
      receipt.functionNames = 'classified backend inventory; delete-account last'
      receipt.lastCompletedStep = 'function_inventory_verified'
      // Runtime recovery requires a separately authorized schedule and actual
      // dispatch/drain proof after this endpoint exists in production.
      receipt.legacyReconciliationOperational = false
      receipt.pendingOperationalProof = ['legacy_reconciliation_schedule_and_bounded_drain']
    }
    receipt.status = 'complete'
    receipt.completedAt = new Date(now()).toISOString()
    return receipt
  } finally {
    try {
      if (receipt) {
        const evidenceDirectory = path.join(root, 'output/release-evidence')
        mkdirSync(evidenceDirectory, { recursive: true })
        writeFileSync(path.join(evidenceDirectory, `backend-privacy-${phase}-${receipt.runId}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' })
      }
    } finally {
      const resolved = path.resolve(temporary)
      assert(path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('shadowchat-backend-release-'), 'Unsafe temporary release cleanup path')
      rmSync(resolved, { recursive: true, force: true })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const value = flag => { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1] }
  const accepted = new Set(['--phase', '--acceptance', '--apply', '--plan', '--production-check'])
  for (let i = 0; i < args.length; i++) { assert(accepted.has(args[i]), `Unknown option: ${args[i]}`); if (args[i] === '--phase' || args[i] === '--acceptance') i++ }
  if (args.includes('--production-check')) console.log(JSON.stringify(verifySecurityActivationReady()))
  else {
    assert(!(args.includes('--apply') && args.includes('--plan')), 'Choose plan or apply')
    const file = value('--acceptance')
    const raw = file ? readFileSync(file, 'utf8') : process.env.SECURITY_RELEASE_ACCEPTANCE
    const result = await runBackendPrivacyPhase({ phase: value('--phase'), apply: args.includes('--apply'), acceptance: raw ? JSON.parse(raw) : undefined })
    console.log(JSON.stringify(result, null, 2))
  }
}

import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  assertPhaseAcceptance, inspectReleaseInputs, migrationStatementDigest, producerFunctions, releasePlanPath,
  releaseSha256, runBackendPrivacyPhase, treeDigest, validateReleasePlan, verifySecurityActivationReady,
  assertDeletionHandlerInventory, minimumDeletionDrainMs, probeDeletionHandover,
} from '../scripts/backend-privacy-release.mjs'

const projectRef = 'shsqqouecvdoifzufkqm'
const commit = 'a'.repeat(40)
const time = Date.parse('2026-10-24T00:00:00Z')
const environment = { SUPABASE_PROJECT_ID: projectRef, SUPABASE_URL: `https://${projectRef}.supabase.co`,
  BUNNY_STREAM_LIBRARY_ID: '666331', SUPABASE_ACCESS_TOKEN: 'synthetic-test-only', SUPABASE_DB_PASSWORD: 'synthetic-test-only' }

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'backend-phase-test-'))
  t.after(() => { assert(path.dirname(root) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('backend-phase-test-')); rmSync(root, { recursive: true, force: true }) })
  const write = (file, content) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), content) }
  const read = file => readFileSync(path.join(root, file))
  const baseline = 'supabase/migrations/20260927233457_baseline.sql'
  write(baseline, 'create table baseline(id integer);\n')
  const foundation = Array.from({ length: 20 }, (_, i) => {
    const file = `supabase/migrations/${20261022231000n + BigInt(i)}_foundation_${i}.sql`
    const sql = `-- reviewed foundation ${i}\nbegin; create table foundation_${i}(id integer); commit;\n`
    write(file, sql)
    return { path: file, sha256: releaseSha256(sql) }
  })
  const activation = [{ path: 'supabase/migrations/20261023224455_security_privacy_activation.sql', sha256: releaseSha256('begin; create table activation(id integer); commit;\n') }]
  write(activation[0].path, 'begin; create table activation(id integer); commit;\n')
  const backend = ['supabase/config.toml', 'supabase/function-manifest.json', 'supabase/security-definer-allowlist.json', 'supabase/templates/confirmation.html', 'deno.lock',
    'supabase/functions/_shared/helper.ts', ...producerFunctions.map(name => `supabase/functions/${name}/index.ts`), 'supabase/functions/delete-account/index.ts']
  for (const file of backend) write(file, file.endsWith('.json') || file === 'deno.lock' ? '{}\n' : `// synthetic ${file}\n`)
  const plan = { version: 1, projectRef, libraryId: '666331', hashFormat: 'sha256-lf', baselineVersion: '20260927233457',
    baselineSha256: treeDigest([baseline], read), backendFilesSha256: treeDigest(backend, read), foundation, activation,
    producers: producerFunctions.map(name => ({ name, verifyJwt: name === 'shado-tv-bunny-upload' })) }
  write(releasePlanPath, `${JSON.stringify(plan, null, 2)}\n`)
  write('supabase/.temp/project-ref', projectRef)
  const rows = entries => entries.map(entry => ({ version: entry.path.match(/\d{14}/)[0], statements: [read(entry.path).toString('utf8')] }))
  const baselineRows = [{ version: plan.baselineVersion, statements: null }]
  const functions = plan.producers.map(entry => ({ name: entry.name, verify_jwt: entry.verifyJwt, status: 'ACTIVE', version: 2, updated_at: time - 60_000 }))
  functions.push({ name: 'delete-account', verify_jwt: false, status: 'ACTIVE', version: 85, updated_at: time - minimumDeletionDrainMs - 1 })
  return { root, write, read, plan, rows, baselineRows, functions, planSha256: releaseSha256(read(releasePlanPath)) }
}

function commandHarness(f, { history = f.baselineRows, branch = 'main', failReadinessAt } = {}) {
  const calls = []
  const state = { history: [...history], functions: structuredClone(f.functions), workdir: null, readinessCalls: 0 }
  const run = (program, args) => {
    if (program === 'git') {
      if (args[0] === 'rev-parse') return commit
      if (args[0] === 'branch') return branch
      if (args[0] === 'status') return ''
      throw new Error('Unexpected Git command')
    }
    if (program === process.execPath) { calls.push({ kind: 'canonical-functions', args }); return '' }
    const workdir = args[args.indexOf('--workdir') + 1]
    state.workdir = workdir
    const command = args.slice(0, args.indexOf('--workdir'))
    calls.push({ kind: 'cli', command, files: existsSync(path.join(workdir, 'supabase/migrations')) ? readdirSync(path.join(workdir, 'supabase/migrations')) : [] })
    if (command[0] === 'link') {
      mkdirSync(path.join(workdir, 'supabase/.temp'), { recursive: true })
      writeFileSync(path.join(workdir, 'supabase/.temp/project-ref'), projectRef)
      return ''
    }
    if (command[0] === 'db' && command[1] === 'query') return JSON.stringify({ rows: state.history })
    if (command[0] === 'db' && command[1] === 'push') {
      if (!command.includes('--dry-run')) {
        const activationIncluded = existsSync(path.join(workdir, f.plan.activation[0].path))
        state.history = [...f.baselineRows, ...f.rows(f.plan.foundation), ...(activationIncluded ? f.rows(f.plan.activation) : [])]
      }
      return ''
    }
    if (command[0] === 'functions' && command[1] === 'list') return JSON.stringify(state.functions)
    if (command[0] === 'functions' && command[1] === 'deploy') {
      for (const entry of state.functions.filter(entry => command.includes(entry.name))) { entry.version++; entry.updated_at = time }
      return ''
    }
    throw new Error(`Unexpected command: ${command.slice(0, 2)}`)
  }
  const readiness = () => {
    calls.push({ kind: 'readiness' })
    state.readinessCalls++
    if (state.readinessCalls === failReadinessAt) throw new Error('Unresolved media repair')
    return { ready: true }
  }
  const probeDeletion = async () => { calls.push({ kind: 'deletion-probe' }); return { protocol: 'shadowchat.account-deletion.v1', stagedHandover: true, legacyRequestCompatibility: true, deletionStarted: false } }
  return { calls, state, run, readiness, probeDeletion }
}

function acceptance(f, phase, producers) {
  return { version: 1, phase, projectRef, sourceCommit: commit, planSha256: f.planSha256, observedAt: new Date(time).toISOString(), producers,
    deletionHandler: assertDeletionHandlerInventory(f.functions),
    checks: Object.fromEntries(['foundation_preserves_existing_full_app', 'existing_and_new_provider_actions', 'old_producer_requests_drained', 'moderation_capture_ready', 'profile_and_realtime_compatibility', 'legacy_reconciliation_hosted', 'deletion_handover_start_guard', 'old_deletion_requests_drained']
      .map(key => [key, { passed: true, evidence: `output/release-evidence/${key}.json` }])) }
}

test('exact reviewed snapshots reject changed SQL, unlisted migrations and different producer sets', t => {
  const f = fixture(t)
  inspectReleaseInputs(f.root, f.plan)
  assert.throws(() => validateReleasePlan({ ...f.plan, producers: [...f.plan.producers, { name: 'delete-account', verifyJwt: false }] }), /exact function allowlist/)
  f.write(f.plan.foundation[0].path, 'select 123;')
  assert.throws(() => inspectReleaseInputs(f.root, f.plan), /Reviewed migration changed/)
  f.write(f.plan.foundation[0].path, '-- reviewed foundation 0\nbegin; create table foundation_0(id integer); commit;\n')
  f.write('supabase/migrations/20261022239999_unreviewed.sql', 'select 1;')
  assert.throws(() => inspectReleaseInputs(f.root, f.plan), /outside the reviewed phase allowlist/)
})

test('plan mode invokes no tools and does not include activation in foundation', async t => {
  const f = fixture(t)
  const result = await runBackendPrivacyPhase({ root: f.root, phase: 'foundation', run: () => { throw new Error('No tools allowed') } })
  assert.equal(result.apply, false)
  assert.equal(result.migrationPaths.length, 20)
  assert(result.migrationPaths.every(file => !file.includes('activation')))
  assert.deepEqual(result.functionNames, [])
  assert.equal(result.frontendPublication, false)
})

test('foundation applies only its immutable migrations, records the boundary, and cleans its isolated link', async t => {
  const f = fixture(t)
  const h = commandHarness(f)
  const result = await runBackendPrivacyPhase({ root: f.root, phase: 'foundation', apply: true, environment, ...h, now: () => time })
  assert.equal(result.status, 'complete')
  assert.equal(result.appliedVersions.length, 20)
  assert.deepEqual(result.functionNames, [])
  assert.equal(result.configPublication, false)
  assert(h.calls.every(call => call.kind !== 'cli' || call.command[0] !== 'functions' && call.command[0] !== 'config' && call.command[0] !== 'secrets'))
  const push = h.calls.find(call => call.kind === 'cli' && call.command[1] === 'push' && call.command.includes('--yes'))
  assert.equal(push.files.length, 21)
  assert(push.files.every(file => !file.includes('activation')))
  assert.equal(existsSync(h.state.workdir), false)
})

test('off-main execution and missing or changed migration history cannot perform a migration push', async t => {
  const f = fixture(t)
  for (const options of [{ branch: 'codex/unsafe' }, { history: [] }, { history: [...f.baselineRows, { version: f.plan.foundation[0].path.match(/\d{14}/)[0], statements: ['create table wrong(id integer)'] }] }]) {
    const h = commandHarness(f, options)
    await assert.rejects(runBackendPrivacyPhase({ root: f.root, phase: 'foundation', apply: true, environment, ...h, now: () => time }))
    assert(h.calls.every(call => call.kind !== 'cli' || call.command[1] !== 'push'))
  }
})

test('producer phase requires repaired data and runtime proof, deploys only three names, and never pushes schema/config', async t => {
  const f = fixture(t)
  const history = [...f.baselineRows, ...f.rows(f.plan.foundation)]
  const blocked = commandHarness(f, { history, failReadinessAt: 1 })
  await assert.rejects(runBackendPrivacyPhase({ root: f.root, phase: 'producers', apply: true, environment, acceptance: acceptance(f, 'producers'), ...blocked, now: () => time }), /Unresolved media/)
  assert(blocked.calls.every(call => call.kind !== 'cli' || call.command[1] !== 'deploy'))
  const h = commandHarness(f, { history })
  const result = await runBackendPrivacyPhase({ root: f.root, phase: 'producers', apply: true, environment, acceptance: acceptance(f, 'producers'), ...h, now: () => time })
  assert.equal(result.status, 'complete')
  assert.equal(h.state.readinessCalls, 2)
  const deploy = h.calls.find(call => call.kind === 'cli' && call.command[1] === 'deploy')
  assert.deepEqual(deploy.command.slice(2, 5), producerFunctions)
  assert(!deploy.command.includes('delete-account'))
  assert(h.calls.every(call => call.kind !== 'cli' || call.command[1] !== 'push' && call.command[0] !== 'config'))
  assert(h.calls.every(call => call.kind !== 'canonical-functions'))
})

test('late legacy media drift after producer publication retains incomplete evidence and stops activation', async t => {
  const f = fixture(t)
  const h = commandHarness(f, { history: [...f.baselineRows, ...f.rows(f.plan.foundation)], failReadinessAt: 2 })
  await assert.rejects(runBackendPrivacyPhase({ root: f.root, phase: 'producers', apply: true, environment, acceptance: acceptance(f, 'producers'), ...h, now: () => time }), /Unresolved media/)
  const evidence = readdirSync(path.join(f.root, 'output/release-evidence')).map(file => JSON.parse(readFileSync(path.join(f.root, 'output/release-evidence', file), 'utf8')))
  assert.equal(evidence[0].status, 'incomplete')
  assert.equal(evidence[0].lastCompletedStep, 'producers_deployed')
  assert.equal(existsSync(h.state.workdir), false)
})

test('activation requires current producer versions and fresh compatibility proof before any write', async t => {
  const f = fixture(t)
  const h = commandHarness(f, { history: [...f.baselineRows, ...f.rows(f.plan.foundation)] })
  const producers = f.functions.filter(entry => producerFunctions.includes(entry.name)).map(entry => ({ name: entry.name, version: entry.version, updatedAt: entry.updated_at, verifyJwt: entry.verify_jwt }))
  const valid = acceptance(f, 'activation', producers)
  for (const invalid of [{ ...valid, sourceCommit: 'b'.repeat(40) }, { ...valid, producers: [] }, { ...valid, observedAt: '2020-01-01T00:00:00Z' }, { ...valid, checks: {} }]) {
    assert.throws(() => assertPhaseAcceptance(invalid, { phase: 'activation', projectRef, planSha256: f.planSha256, commit, producers, deletionHandler: valid.deletionHandler, now: time }))
  }
  const result = await runBackendPrivacyPhase({ root: f.root, phase: 'activation', apply: true, environment, acceptance: valid, ...h, now: () => time })
  assert.equal(result.status, 'complete')
  const pushIndex = h.calls.findIndex(call => call.kind === 'cli' && call.command[1] === 'push' && call.command.includes('--yes'))
  const functionsIndex = h.calls.findIndex(call => call.kind === 'canonical-functions')
  assert(pushIndex > 0 && functionsIndex > pushIndex)
  assert(h.calls[pushIndex].files.some(file => file.includes('224455_security_privacy_activation')))
  assert.equal(result.frontendPublication, false)
  assert.equal(result.configPublication, false)
  assert.equal(result.legacyReconciliationOperational, false)
  assert.deepEqual(result.pendingOperationalProof, ['legacy_reconciliation_schedule_and_bounded_drain'])
})

test('deletion handover requires complete foundation and captures only the durable endpoint', async t => {
  const f = fixture(t)
  const producers = f.functions.filter(entry => producerFunctions.includes(entry.name)).map(entry => ({ name: entry.name, version: entry.version, updatedAt: entry.updated_at, verifyJwt: entry.verify_jwt }))
  const valid = acceptance(f, 'deletion-handover', producers)
  const early = commandHarness(f)
  await assert.rejects(runBackendPrivacyPhase({ root: f.root, phase: 'deletion-handover', apply: true, environment, acceptance: valid, ...early, now: () => time }), /Complete foundation/)
  const missingProof = commandHarness(f, { history: [...f.baselineRows, ...f.rows(f.plan.foundation)] })
  await assert.rejects(runBackendPrivacyPhase({ root: f.root, phase: 'deletion-handover', apply: true, environment,
    acceptance: { ...valid, checks: { ...valid.checks, deletion_handover_start_guard: { passed: false } } }, ...missingProof, now: () => time }), /deletion_handover_start_guard/)
  assert(missingProof.calls.every(call => call.kind !== 'cli' || call.command[1] !== 'deploy'))
  const h = commandHarness(f, { history: [...f.baselineRows, ...f.rows(f.plan.foundation)] })
  const result = await runBackendPrivacyPhase({ root: f.root, phase: 'deletion-handover', apply: true, environment, acceptance: valid, ...h, now: () => time })
  assert.equal(result.status, 'complete')
  assert.deepEqual(result.functionNames, ['delete-account'])
  assert.equal(result.deletionHandler.version, 86)
  assert.equal(result.activationNotBefore, new Date(time + minimumDeletionDrainMs).toISOString())
  assert.equal(h.calls.filter(call => call.kind === 'deletion-probe').length, 1)
  assert(h.calls.every(call => call.kind !== 'canonical-functions' && (call.kind !== 'cli' || call.command[1] !== 'push')))
})

test('activation refuses unverified handler protocols and an undrained old-handler window', async t => {
  const f = fixture(t)
  const producers = f.functions.filter(entry => producerFunctions.includes(entry.name)).map(entry => ({ name: entry.name, version: entry.version, updatedAt: entry.updated_at, verifyJwt: entry.verify_jwt }))
  const valid = acceptance(f, 'activation', producers)
  const recent = { ...valid.deletionHandler, updatedAt: time - 1000 }
  assert.throws(() => assertPhaseAcceptance({ ...valid, deletionHandler: recent }, { phase: 'activation', projectRef, planSha256: f.planSha256, commit, producers, deletionHandler: recent, now: time }), /drain for at least 15 minutes/)
  const h = commandHarness(f, { history: [...f.baselineRows, ...f.rows(f.plan.foundation)] })
  await assert.rejects(runBackendPrivacyPhase({ root: f.root, phase: 'activation', apply: true, environment, acceptance: valid, ...h,
    probeDeletion: async () => { throw new Error('wrong protocol') }, now: () => time }), /wrong protocol/)
  assert(h.calls.every(call => call.kind !== 'cli' || call.command[1] !== 'push'))
  const fetchImpl = async (url, options) => {
    assert.equal(url, `https://${projectRef}.supabase.co/functions/v1/delete-account`)
    assert.deepEqual(JSON.parse(options.body), { action: 'capabilities' })
    assert(!('Authorization' in options.headers))
    return Response.json({ protocol: 'shadowchat.account-deletion.v1', action: 'capabilities', receiptRecovery: true, deletionStarted: false })
  }
  await assert.rejects(probeDeletionHandover(projectRef, fetchImpl), /does not prove/)
})

test('ordinary production cannot implicitly activate the pending batch', t => {
  const f = fixture(t)
  const h = commandHarness(f, { history: [...f.baselineRows, ...f.rows(f.plan.foundation)] })
  assert.throws(() => verifySecurityActivationReady({ root: f.root, environment, run: h.run }), /activation is pending/)
  assert(h.calls.every(call => call.kind !== 'cli' || call.command[0] === 'db' && call.command[1] === 'query'))
})

test('migration history comparison tolerates CLI statement splitting without hiding literal or function-body drift', () => {
  const sql = "-- heading\nbegin; create function x() returns text language sql as $$select 'a; -- literal'$$; /* end */ commit;"
  assert.equal(migrationStatementDigest([sql]), migrationStatementDigest(['BEGIN', "create function x() returns text language sql as $$select 'a; -- literal'$$", 'COMMIT']))
  assert.notEqual(migrationStatementDigest([sql]), migrationStatementDigest([sql.replace('a; -- literal', 'b; -- literal')]))
  assert.notEqual(migrationStatementDigest([sql]), migrationStatementDigest([sql.replace("select 'a", "select  'a")]))
})

test('backend workflow has no frontend credentials/publication and shares the main release lock', () => {
  const workflow = readFileSync(new URL('../.github/workflows/backend-privacy.yml', import.meta.url), 'utf8')
  const production = readFileSync(new URL('../.github/workflows/netlify-production.yml', import.meta.url), 'utf8')
  assert(workflow.includes("if: ${{ github.ref == 'refs/heads/main' }}"))
  assert(workflow.includes('group: netlify-production-refs/heads/main'))
  assert(workflow.includes('default: false'))
  assert(!/NETLIFY_AUTH_TOKEN|NETLIFY_SITE_ID|netlify@|config push|publish-app-release|npm run build/.test(workflow))
  assert(production.includes('push:\n    branches:\n      - main'))
  assert(production.indexOf('--production-check') < production.indexOf('- name: Apply production migrations'))
})

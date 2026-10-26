/** Default is offline dry run. --verify is read-only; --apply needs hash-bound
 * verification evidence and an exclusive, resumable local journal. No deletes. */
import assert from 'node:assert/strict'
import { readFile, mkdir, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { bindRepairPlan, executeRepair, sha256 } from './private-media-repair-core.mjs'
import { createRepairAdapter } from './private-media-repair-adapter.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const usage = `node scripts/execute-private-media-repair.mjs \\
  --project-ref=<exact-ref> --inventory=<inventory.json> --inventory-sha256=<sha256> \\
  --plan=<plan.json> --plan-sha256=<sha256> \\
  [--verify --out=output/privacy/verification.json] \\
  [--apply --verification=<verification.json> --verification-sha256=<sha256> \\
    --out=output/privacy/apply-journal.json [--resume]]

No mode flag: validate and summarize locally, with no backend access.
--verify: require staged policies, author RLS, stable source hashes, and unchanged rows.
--apply: repeat live checks, preserve originals, copy without overwrite, require exact CAS.
--resume: reuse the same bound journal; never bypass a failed check or delete a lock.
Use standard Supabase CLI login. Credentials are kept in process memory only.
`

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help')) { console.log(usage); return }
  const allowed = new Set(['project-ref', 'inventory', 'inventory-sha256', 'plan', 'plan-sha256', 'out', 'verification', 'verification-sha256', 'verify', 'apply', 'resume'])
  const args = {}
  for (const value of argv) {
    assert(value.startsWith('--'), 'Use named arguments; see --help')
    const split = value.indexOf('=')
    const name = value.slice(2, split < 0 ? undefined : split)
    assert(allowed.has(name) && !Object.hasOwn(args, name), 'Unknown or duplicate argument')
    assert(['verify', 'apply', 'resume'].includes(name) ? split < 0 : split > 0 && value.slice(split + 1).length > 0, 'Mode flags take no value; other arguments require =value')
    args[name] = split < 0 ? true : value.slice(split + 1)
  }
  assert(!(args.verify && args.apply), 'Choose --verify or --apply')
  assert(!args.resume || args.apply, '--resume requires --apply')
  for (const key of ['project-ref', 'inventory', 'inventory-sha256', 'plan', 'plan-sha256']) assert(typeof args[key] === 'string', `--${key} is required`)
  const inventoryBytes = await readFile(path.resolve(root, args.inventory))
  const planBytes = await readFile(path.resolve(root, args.plan))
  const bound = bindRepairPlan({ inventoryBytes, planBytes, projectRef: args['project-ref'], inventorySha256: args['inventory-sha256'], planSha256: args['plan-sha256'] })
  if (!args.verify && !args.apply) {
    console.log(JSON.stringify({ mode: 'offline-dry-run', projectRef: bound.projectRef,
      inventorySha256: bound.inventorySha256, planSha256: bound.planSha256,
      copies: bound.plan.copyRequests.length, rowUpdates: bound.plan.updates.length,
      authors: bound.plan.authorizations.length, backendAccess: false, mutations: 0 }, null, 2))
    return
  }
  assert(typeof args.out === 'string', '--out is required for verification evidence or apply journal')
  const out = path.resolve(root, args.out)
  const evidenceRoot = path.join(root, 'output', 'privacy')
  const relative = path.relative(evidenceRoot, out)
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative) && out.endsWith('.json'), 'Evidence must be a JSON file within output/privacy')
  assert(!['inventory', 'plan', 'verification'].some(key => typeof args[key] === 'string' && path.resolve(root, args[key]) === out), 'Evidence must not overwrite an input')
  let verification
  if (args.apply) {
    assert(typeof args.verification === 'string' && typeof args['verification-sha256'] === 'string', 'Apply requires reviewed verification file and hash')
    const bytes = await readFile(path.resolve(root, args.verification))
    assert.equal(sha256(bytes), args['verification-sha256'], 'Verification file hash changed')
    verification = JSON.parse(bytes)
  }
  await mkdir(path.dirname(out), { recursive: true })
  const lockPath = `${out}.lock`
  const lockToken = randomUUID()
  const lock = await open(lockPath, 'wx')
  await lock.writeFile(lockToken)
  await lock.sync()
  await lock.close()
  let adapter
  let journal
  let tempPath
  try {
    if (args.resume) journal = JSON.parse(await readFile(out, 'utf8'))
    else {
      // Reserve without overwriting an earlier verification or interrupted run.
      const reserved = await open(out, 'wx')
      await reserved.close()
    }
    adapter = await createRepairAdapter(bound)
    const checkpoint = async value => {
      assert.equal(await readFile(lockPath, 'utf8'), lockToken, 'Repair journal lock changed')
      tempPath = `${out}.${lockToken}.tmp`
      const handle = await open(tempPath, 'wx')
      try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`); await handle.sync() } finally { await handle.close() }
      await rename(tempPath, out)
      tempPath = undefined
    }
    const result = await executeRepair(bound, adapter, { mode: args.apply ? 'apply' : 'verify', verification,
      verificationSha256: args['verification-sha256'], journal, checkpoint })
    console.log(JSON.stringify({ mode: result.mode, complete: result.complete, copies: Object.keys(result.copies).length,
      rowUpdates: Object.keys(result.updates).length, evidence: path.relative(root, out), evidenceSha256: sha256(await readFile(out)) }, null, 2))
  } finally {
    await adapter?.close()
    if (tempPath) await unlink(tempPath).catch(() => {})
    // Never remove a replacement lock belonging to a different run.
    if (await readFile(lockPath, 'utf8').catch(() => null) === lockToken) await unlink(lockPath)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`Repair stopped: ${String(error.message).split('\n')[0].slice(0, 300)}`); process.exitCode = 1 })
}

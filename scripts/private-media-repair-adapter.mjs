import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { sha256, objectSql, readRowSql, proveSql, compareAndSwapSql, inventorySql } from './private-media-repair-core.mjs'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const cli = process.platform === 'win32' ? 'supabase.exe' : 'supabase'
const version = ['20261022231053', '20261023001140']
const normalized = value => String(value).replaceAll('\r\n', '\n').trim()
const functionBody = (source, name) => {
  const offset = source.indexOf(`function ${name}(`)
  assert(offset >= 0, 'Expected staged function is missing')
  const match = source.slice(offset).match(/as \$\$([\s\S]*?)\$\$;/i)
  assert(match, 'Expected staged function body is missing')
  return normalized(match[1])
}
export const policyGateSql = `begin read only;
select jsonb_build_object(
 'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations where version in ('20261022231053','20261023001140')),
 'functions',(select jsonb_object_agg(p.proname,jsonb_build_object('body',p.prosrc,'definer',p.prosecdef,'config',p.proconfig)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and ((p.proname='can_read_member_media' and p.pronargs=2) or (p.proname='is_active_member' and p.pronargs=0))),
 'rls',(select bool_and(c.relrowsecurity) and count(*)=5 from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname,c.relname) in (('storage','objects'),('public','messages'),('public','dm_messages'),('public','shadow_pin_images'),('public','shadow_pin_categories'))),
 'activePolicies',(select count(*) from pg_policies where policyname='active_member_required' and permissive='RESTRICTIVE' and cmd='ALL' and 'authenticated'=any(roles) and qual='( SELECT private.is_active_member() AS is_active_member)' and with_check='( SELECT private.is_active_member() AS is_active_member)' and (schemaname,tablename) in (('storage','objects'),('public','messages'),('public','dm_messages'),('public','shadow_pin_images'),('public','shadow_pin_categories'))),
 'signingPolicy',(select qual from pg_policies where schemaname='storage' and tablename='objects' and policyname='Members read visible messaging media' and cmd='SELECT' and roles=array['authenticated']::name[]),
 'legacyLaunch',exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public read for launch buckets')
) as repair_result; rollback;`

export function validatePolicyGate(data, sources) {
  assert.deepEqual(data?.migrations, version, 'Required staged policy migrations are not installed')
  assert.equal(data.rls, true, 'Canonical tables must retain RLS')
  assert.equal(data.activePolicies, 5, 'Active-member restrictive policies are missing or changed')
  assert.equal(data.legacyLaunch, false, 'Broad legacy Storage read policy remains')
  const signing = String(data.signingPolicy).replace(/\s+/g, ' ').trim()
  assert.equal(signing, "((bucket_id = ANY (ARRAY['chat-uploads'::text, 'message-media'::text, 'shadow-pin'::text])) AND private.can_read_member_media(bucket_id, name))", 'Signing policy does not match staged authorization')
  for (const [name, expectedDefiner] of [['can_read_member_media', false], ['is_active_member', true]]) {
    const actual = data.functions?.[name]
    assert.equal(actual?.definer, expectedDefiner, 'Unexpected function privilege boundary')
    assert.deepEqual(actual.config, ['search_path=""'], 'Unexpected function search path')
    assert.equal(normalized(actual.body), functionBody(sources[name], `private.${name}`), 'Installed authorization body differs from reviewed source')
  }
  return { verified: true, digest: sha256(JSON.stringify({ ...data, functions: Object.fromEntries(Object.entries(data.functions).map(([name, entry]) => [name, { ...entry, body: normalized(entry.body) }])) })) }
}

/** Uses only standard CLI auth. Its isolated link cannot target another checkout. */
export async function createRepairAdapter(bound) {
  const base = path.join(root, 'output', 'privacy', 'repair-runtime')
  await mkdir(base, { recursive: true })
  const workdir = await mkdtemp(path.join(base, 'run-'))
  assert(path.dirname(workdir) === base, 'Unexpected temporary workspace')
  const temp = path.join(workdir, 'supabase', '.temp')
  await mkdir(temp, { recursive: true })
  const configPath = path.join(workdir, 'supabase', 'config.toml')
  const refPath = path.join(temp, 'project-ref')
  const sqlPath = path.join(workdir, 'query.sql')
  await writeFile(configPath, 'project_id = "bounded-private-media-repair"\n', { flag: 'wx' })
  await writeFile(refPath, bound.projectRef, { flag: 'wx' })
  let serviceKey
  const command = async args => {
    let output
    try { output = await exec(cli, args, { cwd: root, windowsHide: true, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 }) }
    catch { throw new Error('Supabase CLI command failed; no raw command output is included') }
    try { return JSON.parse(output.stdout) } catch { throw new Error('Supabase CLI returned an unexpected format') }
  }
  const query = async sql => {
    assert.equal(await readFile(refPath, 'utf8'), bound.projectRef, 'Isolated project link changed')
    await writeFile(sqlPath, sql)
    const value = await command(['db', 'query', '--linked', '--workdir', workdir, '--file', sqlPath, '--output', 'json'])
    const rows = Array.isArray(value) ? value : value.rows
    assert(Array.isArray(rows) && rows.length === 1 && Object.hasOwn(rows[0], 'repair_result'), 'SQL did not return one bounded result')
    return rows[0].repair_result
  }
  const key = async () => {
    if (serviceKey) return serviceKey
    const value = await command(['projects', 'api-keys', '--project-ref', bound.projectRef, '--output', 'json'])
    serviceKey = (Array.isArray(value) ? value : value.api_keys)?.find(entry => entry.name === 'service_role')?.api_key
    assert(typeof serviceKey === 'string', 'Standard branch/project service key is unavailable')
    let claims
    try { claims = JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64url')) } catch { throw new Error('Unexpected service credential format') }
    assert(claims.ref === bound.projectRef && claims.role === 'service_role', 'Service credential belongs to a different project or role')
    return serviceKey
  }
  const request = async (endpoint, init = {}) => {
    const credential = await key()
    const response = await fetch(`${bound.plan.projectUrl}/storage/v1/${endpoint}`, { ...init, redirect: 'error',
      signal: AbortSignal.timeout(60_000), cache: 'no-store', headers: {
        Authorization: `Bearer ${credential}`, apikey: credential, 'Cache-Control': 'no-cache', ...init.headers,
      } })
    if (!response.ok) { await response.body?.cancel(); throw new Error(`Storage request failed (${response.status}); no response body is included`) }
    return response
  }
  return {
    async gate() {
      const sources = {
        can_read_member_media: await readFile(path.join(root, 'supabase/migrations/20261022231053_member_media_visibility_policies.sql'), 'utf8'),
        is_active_member: await readFile(path.join(root, 'supabase/migrations/20261023001140_active_member_access_boundary.sql'), 'utf8'),
      }
      return validatePolicyGate(await query(policyGateSql), sources)
    },
    readRow: row => query(readRowSql(row)),
    object: (bucket, objectPath) => query(objectSql(bucket, objectPath)),
    prove: (copy, row) => query(proveSql(bound.plan.projectUrl, copy, row)),
    compareAndSwap: (row, confirmed) => query(compareAndSwapSql(bound.plan.projectUrl, row, confirmed)),
    async inventory() { return query(inventorySql(bound.plan.projectUrl, await readFile(path.join(root, 'supabase/rollout/private-member-media-inventory.sql'), 'utf8'))) },
    async hashObject(bucket, objectPath, maximum) {
      const response = await request(`object/authenticated/${bucket}/${objectPath.split('/').map(encodeURIComponent).join('/')}`)
      const hash = createHash('sha256')
      let size = 0
      try {
        assert(Number(response.headers.get('content-length') || 0) <= maximum, 'Storage response exceeds limit')
        for await (const chunk of response.body) {
          size += chunk.byteLength
          assert(size <= maximum, 'Storage response exceeds limit')
          hash.update(chunk)
        }
        return { size, sha256: hash.digest('hex') }
      } finally { await response.body?.cancel().catch(() => {}) }
    },
    async copy(copy) {
      const response = await request('object/copy', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' },
        body: JSON.stringify({ bucketId: copy.bucketId, sourceKey: copy.sourceKey, destinationBucket: copy.destinationBucket, destinationKey: copy.destinationKey, upsert: false }) })
      await response.body?.cancel()
    },
    async close() {
      serviceKey = undefined
      // Remove only the exact files this adapter created; no recursive deletion.
      for (const file of [sqlPath, refPath, configPath]) await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error })
      // The CLI may add other temporary metadata. Preserve uncertain files and
      // report a nonempty directory instead of sweeping arbitrary contents.
      for (const directory of [temp, path.dirname(temp), workdir]) await rmdir(directory).catch(error => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error })
    },
  }
}

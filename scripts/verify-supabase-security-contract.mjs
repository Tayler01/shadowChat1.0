import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const contract = JSON.parse(readFileSync(
  new URL('../supabase/security-definer-allowlist.json', import.meta.url),
  'utf8',
))

const scope = process.argv.includes('--linked') ? '--linked' : '--local'

function query(sql) {
  const raw = execFileSync(
    'supabase',
    ['db', 'query', scope, '--output-format', 'json', sql],
    { cwd: new URL('..', import.meta.url), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  return JSON.parse(raw).rows ?? []
}

const expectedAuthenticated = contract.domains
  .flatMap(domain => domain.signatures)
  .sort()
const expectedAnon = [...contract.anon_signatures].sort()

const authenticatedRows = query(`
  select p.oid::regprocedure::text as signature
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
  order by 1
`)
const anonRows = query(`
  select p.oid::regprocedure::text as signature
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
  order by 1
`)
const [definerSummary] = query(`
  select
    count(*)::integer as total,
    count(*) filter (
      where not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
    )::integer as missing_search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
`)
const pausedGrantRows = query(`
  select grantee, table_name, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('anon', 'authenticated')
    and (
      table_name like 'board\\_%' escape '\\'
      or table_name like 'news\\_%' escape '\\'
      or table_name like 'art\\_board\\_%' escape '\\'
      or table_name like 'bridge\\_%' escape '\\'
    )
  order by table_name, grantee, privilege_type
`)

assert.deepEqual(
  authenticatedRows.map(row => row.signature),
  expectedAuthenticated,
  'authenticated SECURITY DEFINER surface drifted from the reviewed allowlist',
)
assert.deepEqual(
  anonRows.map(row => row.signature),
  expectedAnon,
  'anonymous SECURITY DEFINER surface drifted from the reviewed allowlist',
)
assert.equal(
  Number(definerSummary?.total),
  contract.expected_total_security_definers,
  'total public SECURITY DEFINER count drifted',
)
assert.equal(Number(definerSummary?.missing_search_path), 0, 'every SECURITY DEFINER must pin search_path')
assert.deepEqual(pausedGrantRows, [], 'paused domains must expose no table privileges to browser roles')

console.log(JSON.stringify({
  scope: scope.slice(2),
  authenticatedSecurityDefiners: expectedAuthenticated.length,
  anonSecurityDefiners: expectedAnon.length,
  totalSecurityDefiners: Number(definerSummary.total),
  pausedBrowserTableGrants: pausedGrantRows.length,
}))

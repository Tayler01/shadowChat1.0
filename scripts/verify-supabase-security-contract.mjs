import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseSupabaseQueryRows } from './supabase-query-output.mjs'

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
  return parseSupabaseQueryRows(raw)
}

const expectedAuthenticated = contract.domains
  .flatMap(domain => domain.signatures)
  .sort()
const expectedAnon = [...contract.anon_signatures].sort()
const expectedInternal = [...contract.internal_signatures].sort()
const expectedPrivate = [...contract.private_security_definers].sort()
const expectedUnexposed = [...(contract.unexposed_security_definers ?? [])].sort()
const expectedActiveTablePrivileges = [...contract.required_active_table_privileges].sort()
const expectedUsersUpdateColumns = [...contract.authenticated_users_update_columns].sort()
const activeGrantTables = [...new Set(expectedActiveTablePrivileges.map(entry => entry.split(':')[1]))]
const sqlStringList = values => values.map(value => `'${value.replaceAll("'", "''")}'`).join(', ')

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
const internalRows = query(`
  select p.oid::regprocedure::text as signature
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
  order by 1
`)
const privateRows = query(`
  select p.oid::regprocedure::text as signature
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.prosecdef
  order by 1
`)
const unexposedRows = query(`
  select p.oid::regprocedure::text as signature
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('activation_private', 'connections_private', 'shadow_pin_private')
    and p.prosecdef
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
const [privateDefinerSummary] = query(`
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
  where n.nspname = 'private'
    and p.prosecdef
`)
const [unexposedDefinerSummary] = query(`
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
  where n.nspname in ('activation_private', 'connections_private', 'shadow_pin_private')
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
const activeGrantRows = query(`
  select grantee || ':' || table_name || ':' || privilege_type as grant_entry
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee in ('authenticated', 'service_role')
    and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    and table_name in (${sqlStringList(activeGrantTables)})
  order by 1
`)
const dangerousBrowserGrantRows = query(`
  select grantee, table_name, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public'
    and (
      grantee = 'anon'
      or (
        grantee = 'authenticated'
        and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
      )
    )
  order by grantee, table_name, privilege_type
`)
const usersUpdateColumnRows = query(`
  select column_name
  from information_schema.column_privileges
  where table_schema = 'public'
    and table_name = 'users'
    and grantee = 'authenticated'
    and privilege_type = 'UPDATE'
  order by column_name
`)

assert.deepEqual(
  authenticatedRows.map(row => row.signature).sort(),
  expectedAuthenticated,
  'authenticated SECURITY DEFINER surface drifted from the reviewed allowlist',
)
assert.deepEqual(
  anonRows.map(row => row.signature).sort(),
  expectedAnon,
  'anonymous SECURITY DEFINER surface drifted from the reviewed allowlist',
)
assert.deepEqual(
  internalRows.map(row => row.signature).sort(),
  expectedInternal,
  'internal/service-role SECURITY DEFINER surface drifted from the reviewed allowlist',
)
assert.deepEqual(
  privateRows.map(row => row.signature).sort(),
  expectedPrivate,
  'private SECURITY DEFINER surface drifted from the reviewed allowlist',
)
assert.deepEqual(
  unexposedRows.map(row => row.signature).sort(),
  expectedUnexposed,
  'unexposed SECURITY DEFINER surface drifted from the reviewed allowlist',
)
assert.equal(
  Number(definerSummary?.total),
  contract.expected_total_security_definers,
  'total public SECURITY DEFINER count drifted',
)
assert.equal(Number(definerSummary?.missing_search_path), 0, 'every SECURITY DEFINER must pin search_path')
assert.equal(
  Number(privateDefinerSummary?.missing_search_path),
  0,
  'every private SECURITY DEFINER must pin search_path',
)
assert.equal(
  Number(unexposedDefinerSummary?.missing_search_path),
  0,
  'every unexposed SECURITY DEFINER must pin search_path',
)
assert.deepEqual(pausedGrantRows, [], 'paused domains must expose no table privileges to browser roles')
assert.deepEqual(
  activeGrantRows.map(row => row.grant_entry).sort(),
  expectedActiveTablePrivileges,
  'active core Data API table privileges drifted from the reviewed contract',
)
assert.deepEqual(
  dangerousBrowserGrantRows,
  [],
  'anonymous grants and authenticated TRUNCATE/TRIGGER/REFERENCES grants are forbidden',
)
assert.deepEqual(
  usersUpdateColumnRows.map(row => row.column_name).sort(),
  expectedUsersUpdateColumns,
  'authenticated public.users UPDATE columns drifted from the reviewed allowlist',
)

console.log(JSON.stringify({
  scope: scope.slice(2),
  authenticatedSecurityDefiners: expectedAuthenticated.length,
  anonSecurityDefiners: expectedAnon.length,
  internalSecurityDefiners: expectedInternal.length,
  totalSecurityDefiners: Number(definerSummary.total),
  privateSecurityDefiners: Number(privateDefinerSummary.total),
  unexposedSecurityDefiners: Number(unexposedDefinerSummary.total),
  pausedBrowserTableGrants: pausedGrantRows.length,
  activeTablePrivileges: expectedActiveTablePrivileges.length,
  usersUpdateColumns: expectedUsersUpdateColumns.length,
}))

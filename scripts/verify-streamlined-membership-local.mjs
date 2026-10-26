/** Isolated PostgreSQL runtime checks. No remote connection or real accounts. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtime = process.env.SHADOWCHAT_PGLITE_MODULE_PATH || path.join(root, 'node_modules/@electric-sql/pglite/dist/index.js')
const { PGlite } = await import(pathToFileURL(runtime).href)
const db = new PGlite()
const first = '10000000-0000-4000-8000-000000000001'
const second = '10000000-0000-4000-8000-000000000002'
const version = '2026-10-22.2'
let assertions = 0
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions += 1 }
const rejected = async (sql, params, label) => { await assert.rejects(db.query(sql, params), undefined, label); assertions += 1 }
const asMember = async id => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  await db.exec('set role authenticated')
}
const accept = (id = first, policy = version, adult = true, terms = true, privacy = true) => db.query(
  'select * from public.accept_streamlined_membership($1::uuid, $2, $3, $4, $5)', [id, policy, adult, terms, privacy],
)

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create schema private;
    revoke all on schema private from public, anon, authenticated;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users (id uuid primary key);
    create table public.users (id uuid primary key references auth.users(id) on delete cascade, active boolean not null default true);
    grant select on public.users to authenticated;
    create function private.is_active_member() returns boolean language sql stable security definer set search_path = '' as
      $$ select exists (select 1 from public.users where id = auth.uid() and active) $$;
    revoke all on function private.is_active_member() from public, anon;
    grant execute on function private.is_active_member() to authenticated;
    insert into auth.users values ('${first}'), ('${second}');
    insert into public.users(id) values ('${first}'), ('${second}');
  `)
  await db.exec(await readFile(path.join(root, 'supabase/migrations/20261023001218_streamlined_membership_acknowledgement.sql'), 'utf8'))
  await asMember(first)
  equal((await db.query('select * from public.get_streamlined_membership_acknowledgement()')).rows, [], 'A new member has no implicit acceptance')
  equal((await db.query('select id from public.users')).rows.length, 2, 'Existing shared member reads do not require streamlined acknowledgement')
  for (const badArgs of [[first, version, false, true, true], [first, version, true, false, true], [first, version, true, true, null], [first, 'old', true, true, true], [second, version, true, true, true]]) {
    await rejected('select * from public.accept_streamlined_membership($1::uuid, $2, $3, $4, $5)', badArgs, 'Incomplete, outdated, or different-account acceptance is denied')
  }
  const receipt = (await accept()).rows[0]
  equal(receipt.user_id, first, 'Identity comes from the authenticated account')
  equal(receipt.policy_version, version, 'Current policy is server-owned')
  equal([receipt.adult_declared, receipt.terms_accepted, receipt.privacy_acknowledged], [true, true, true], 'All declarations are recorded')
  equal(Number.isFinite(new Date(receipt.accepted_at).getTime()), true, 'Server timestamp is valid')
  equal((await accept()).rows[0], receipt, 'A retry is idempotent and preserves the original receipt')
  await rejected('update public.streamlined_membership_acknowledgements set accepted_at = now()', [], 'Accepted records cannot be rewritten')
  await rejected('delete from public.streamlined_membership_acknowledgements', [], 'Browser clients cannot erase acceptance history')
  await rejected('insert into public.streamlined_membership_acknowledgements (user_id, adult_declared, terms_accepted, privacy_acknowledged) values ($1, true, true, true)', [second], 'Browser client cannot choose another member identity')
  await rejected("insert into public.streamlined_membership_acknowledgements (policy_version, adult_declared, terms_accepted, privacy_acknowledged) values ('invented', true, true, true)", [], 'Browser client cannot choose a policy version')
  await asMember(second)
  equal((await db.query('select * from public.streamlined_membership_acknowledgements')).rows, [], 'Other members cannot read the first member acknowledgement')
  await db.exec('reset role; set role anon')
  await rejected('select * from public.get_streamlined_membership_acknowledgement()', [], 'Anonymous RPC read denied')
  await rejected('select * from public.accept_streamlined_membership($1::uuid, $2, true, true, true)', [second, version], 'Anonymous RPC write denied')
  await db.exec('reset role')
  await db.query('update public.users set active = false where id = $1', [first])
  await asMember(first)
  equal((await db.query('select * from public.get_streamlined_membership_acknowledgement()')).rows, [], 'Inactive membership cannot read acceptance')
  await rejected('select * from public.accept_streamlined_membership($1::uuid, $2, true, true, true)', [first, version], 'Inactive membership cannot accept, even as an idempotent retry')
  await db.exec('reset role')
  await db.query('delete from auth.users where id = $1', [first])
  equal((await db.query('select * from public.streamlined_membership_acknowledgements')).rows, [], 'Auth deletion removes acceptance records')
  await asMember(first)
  await rejected('select * from public.accept_streamlined_membership($1::uuid, $2, true, true, true)', [first, version], 'Deleted identity with a stale token cannot accept')
  console.log(`Streamlined membership SQL: ${assertions} assertions passed; owner isolation, explicit declaration, immutable server receipt, active-member checks, deletion cascade and full-app separation verified locally.`)
} finally {
  await db.close()
}

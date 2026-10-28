import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// Executes real installation/token definitions, enrollment functions and the
// additive migration in local PostgreSQL. No connection or production data.
test('scoped enrollment and retry-safe revocation preserve identity, rollback and lifecycle serialization', async () => {
  const db = new PGlite()
  const sql = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')
  const user = '11111111-1111-4111-8111-111111111111'
  const installation = '22222222-2222-4222-8222-222222222222'
  const otherInstallation = '33333333-3333-4333-8333-333333333333'
  const verifier = 'a'.repeat(64)
  const credential = 'b'.repeat(64)
  const hash = text => createHash('sha256').update(text).digest('hex')
  const requestId = 'scoped-enrollment-fixture-v1'
  const wrapper = 'public.redeem_scoped_native_notification_enrollment_ticket_v2(text,text,uuid,text,text,text,integer,text,text,text,text,integer,text)'
  const original = 'public.redeem_native_notification_enrollment_ticket_v2(text,text,uuid,text,text,text,text,text,text,text,integer,text)'
  const root = () => db.exec('reset role')
  const anon = () => db.exec('set role anon')
  const mint = async (key = installation, deviceCredential = credential, memberId = user) => {
    await root()
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [memberId])
    await db.exec('set role authenticated')
    const result = await db.query('select public.create_my_native_notification_enrollment_ticket_v2($1,$2,$3,$4) as value', [requestId, key, hash(verifier), hash(deviceCredential)])
    return result.rows[0].value.ticket
  }
  const redeem = (ticket, { build = '22', version = 1, key = installation, secret = verifier, deviceCredential = credential, token = 'ExponentPushToken[scoped-fixture-token]', legacy = false } = {}) => {
    const params = [ticket, requestId, key, secret, deviceCredential, 'ios']
    if (!legacy) params.push(version)
    params.push('1.0.0', build, 'en-US', 'UTC', 2, token)
    return db.query(`select public.${legacy ? 'redeem_native_notification_enrollment_ticket_v2' : 'redeem_scoped_native_notification_enrollment_ticket_v2'}(${params.map((_, i) => `$${i + 1}`).join(',')}) as value`, params)
  }
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema private; create schema extensions;
      grant usage on schema public, auth to anon, authenticated, service_role;
      revoke all on schema private from public;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.users(id uuid primary key);
      insert into public.users values ('${user}');
      -- PGlite has PostgreSQL SHA-256 built in; these local adapters provide
      -- pgcrypto's signatures without replacing any enrollment/auth function.
      create function extensions.digest(value text, algorithm text) returns bytea language sql as
        $$select sha256(convert_to(value,'UTF8'))$$;
      create function extensions.gen_random_bytes(count integer) returns bytea language sql as
        $$select substring(decode(repeat(replace(gen_random_uuid()::text,'-',''),(count+15)/16),'hex') from 1 for count)$$;
    `)
    const foundation = await sql('20260718210000_notification_presentation_v2_foundation.sql')
    await db.exec(foundation.match(/create table if not exists public\.notification_installations \([\s\S]*?(?=alter table public\.push_subscriptions)/)[0])
    await db.exec(foundation.match(/create table if not exists private\.notification_native_tokens \([\s\S]*?\n\);/)[0])
    await db.exec(await sql('20260720152414_native_notification_enrollment_ticket.sql'))
    await db.exec(await sql('20261028215545_scoped_native_notification_community_capability.sql'))
    await db.exec(await sql('20261028220830_idempotent_native_notification_revocation_proof.sql'))
    await db.exec(await sql('20261028222221_settle_pending_native_notification_enrollment_attempt.sql'))

    const grants = (await db.query(`select has_function_privilege('anon',$1,'execute') as anon,
      has_function_privilege('authenticated',$1,'execute') as member,
      has_function_privilege('service_role',$1,'execute') as service,
      has_function_privilege('anon',$2,'execute') as legacy`, [wrapper, original])).rows[0]
    assert.deepEqual(grants, { anon: true, member: false, service: false, legacy: true })
    assert.equal((await db.query(`select exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
      where p.oid=$1::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') as public`, [wrapper])).rows[0].public, false)

    let ticket = await mint()
    await anon()
    for (const options of [{ build: '21' }, { build: '22.0' }, { build: '022' }, { build: null }, { version: null }, { version: 2 }, { secret: 'c'.repeat(64) }, { key: otherInstallation }]) {
      await assert.rejects(redeem(ticket, options))
    }
    await root()
    assert.equal((await db.query('select consumed_at from private.notification_native_enrollment_tickets')).rows[0].consumed_at, null)
    assert.equal((await db.query('select * from public.notification_installations')).rows.length, 0)
    await anon()
    const enrolled = (await redeem(ticket)).rows[0].value
    assert.equal(enrolled.user_id, user)
    assert.equal(enrolled.community_scope_version, 1)
    await assert.rejects(redeem(ticket))
    await root()
    assert.deepEqual((await db.query('select user_id,installation_key,app_version,build_number,community_scope_version from public.notification_installations')).rows,
      [{ user_id: user, installation_key: installation, app_version: '1.0.0', build_number: '22', community_scope_version: 1 }])
    assert.equal((await db.query('select count(*)::integer as total from private.notification_native_tokens')).rows[0].total, 1)
    await db.exec('set role authenticated')
    await assert.rejects(db.exec('update public.notification_installations set community_scope_version=1'))

    // An existing valid credential refresh must retain the scoped capability.
    await anon()
    await db.query('select public.set_notification_installation_foreground_by_credential_v2($1,$2,null)', [installation, credential])
    await root()
    assert.equal((await db.query('select community_scope_version from public.notification_installations')).rows[0].community_scope_version, 1)

    // Even identical raw metadata through the old RPC clears prior opt-in.
    ticket = await mint()
    await anon()
    await redeem(ticket, { legacy: true })
    await root()
    assert.equal((await db.query('select community_scope_version from public.notification_installations')).rows[0].community_scope_version, null)

    // Force the wrapper's binding update to affect zero rows. Its exception
    // must roll back original redemption's ticket, token and credential writes.
    await db.exec(`create function private.reject_test_scope() returns trigger language plpgsql as $$begin return null; end$$;
      create trigger reject_test_scope before update of community_scope_version on public.notification_installations
      for each row execute function private.reject_test_scope()`)
    ticket = await mint(otherInstallation)
    await anon()
    await assert.rejects(redeem(ticket, { key: otherInstallation, token: 'ExponentPushToken[another-fixture-token]' }), /could not be bound/)
    await root()
    assert.equal((await db.query('select consumed_at from private.notification_native_enrollment_tickets')).rows[0].consumed_at, null)
    assert.equal((await db.query('select * from public.notification_installations where installation_key=$1', [otherInstallation])).rows.length, 0)
    assert.equal((await db.query('select count(*)::integer as total from private.notification_native_tokens')).rows[0].total, 1)
    assert.equal((await db.query('select count(*)::integer as total from private.notification_installation_credentials')).rows[0].total, 1)
    await db.exec('drop trigger reject_test_scope on public.notification_installations')
    // Verify the independently runnable, rolled-back hosted-demo fixture too.
    await db.exec('alter table public.users add column username text, add column display_name text')
    await db.exec(await readFile(new URL('./sql/scoped-native-notification-community.sql', import.meta.url), 'utf8'))
    assert.equal((await db.query("select count(*)::integer as total from public.users where id='95000000-0000-4000-8000-000000000081'")).rows[0].total, 0)
    const proofSignature = 'public.revoke_notification_installation_with_proof_v1(uuid,uuid,text)'
    assert.deepEqual((await db.query(`select has_function_privilege('anon',$1,'execute') as anon,
      has_function_privilege('authenticated',$1,'execute') as member,
      has_function_privilege('service_role',$1,'execute') as service`, [proofSignature])).rows[0],
    { anon: true, member: false, service: false })
    assert.equal((await db.query(`select exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
      where p.oid=$1::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') as public`, [proofSignature])).rows[0].public, false)
    const proof = async (member = user, key = installation, secret = credential) => {
      await anon()
      return (await db.query('select public.revoke_notification_installation_with_proof_v1($1,$2,$3) as value', [member, key, secret])).rows[0].value
    }
    for (const [member, key, secret] of [[user, otherInstallation, credential], [user, installation, 'f'.repeat(64)],
      [otherInstallation, installation, credential], [null, installation, credential], [user, null, credential],
      [user, installation, null], [user, installation, 'bad']]) assert.equal(await proof(member, key, secret), false)
    // Missing-row calls still retain the same transaction key lock: credential
    // resolution occurs after serialization, including old lifecycle methods.
    for (const [query, params] of [
      ['select public.register_native_notification_token_by_credential_v2($1,$2,$3) as value', [otherInstallation, credential, 'ExponentPushToken[lock-fixture-token]']],
      ['select public.set_notification_installation_foreground_by_credential_v2($1,$2,null) as value', [otherInstallation, credential]],
      ['select public.revoke_notification_installation_by_credential_v2($1,$2) as value', [otherInstallation, credential]],
      ['select public.revoke_notification_installation_with_proof_v1($1,$2,$3) as value', [user, otherInstallation, credential]],
    ]) {
      await root()
      await db.exec('begin')
      await anon()
      assert.equal((await db.query(query, params)).rows[0].value, false)
      await root()
      assert.equal((await db.query("select count(*)::integer as total from pg_locks where locktype='advisory' and granted and pid=pg_backend_pid()")).rows[0].total, 1,
        `Lifecycle must lock before resolving missing credentials: ${query}`)
      await db.exec('rollback')
    }
    await root()
    for (const provider of ['apns', 'fcm']) await db.query('select private.register_native_notification_token_for_user_v2($1,$2,$3,$4,$5)',
      [user, installation, provider, 'production', `fixture-${provider}-native-token-value`])

    // Skipped token disables must roll back the earlier credential/row writes.
    await db.exec(`create function private.reject_test_token_disable() returns trigger language plpgsql as $$begin return null; end$$;
      create trigger reject_test_token_disable before update of enabled on private.notification_native_tokens
      for each row execute function private.reject_test_token_disable()`)
    await assert.rejects(proof(), /revocation proof failed/)
    await root()
    assert.equal((await db.query('select revoked_at from public.notification_installations where installation_key=$1', [installation])).rows[0].revoked_at, null)
    assert.equal((await db.query('select revoked_at from private.notification_installation_credentials')).rows[0].revoked_at, null)
    assert.equal((await db.query('select count(*)::integer as total from private.notification_native_tokens where enabled')).rows[0].total, 3)
    await db.exec('drop trigger reject_test_token_disable on private.notification_native_tokens')

    await proof() // Simulate losing the successful response.
    assert.equal(await proof(), true, 'Retry proves an already-revoked exact credential')
    await root()
    const revokedAt = (await db.query('select revoked_at from public.notification_installations where installation_key=$1', [installation])).rows[0].revoked_at
    assert.equal((await db.query('select count(*)::integer as total from private.notification_native_tokens where enabled or disabled_at is null')).rows[0].total, 0)
    await db.exec('begin')
    assert.equal(await proof(), true)
    await root()
    assert.equal((await db.query("select count(*)::integer as total from pg_locks where locktype='advisory' and granted and pid=pg_backend_pid()")).rows[0].total, 1,
      'Proof retains the shared key lock until the transaction ends')
    await db.exec('commit')
    assert.deepEqual((await db.query('select revoked_at from public.notification_installations where installation_key=$1', [installation])).rows[0].revoked_at, revokedAt)
    await anon()
    assert.equal((await db.query('select public.revoke_notification_installation_by_credential_v2($1,$2) as value', [installation, credential])).rows[0].value, false,
      'Original legacy false-after-revoked contract stays intact')
    assert.equal((await db.query('select public.register_native_notification_token_by_credential_v2($1,$2,$3) as value', [installation, credential, 'ExponentPushToken[stale-refresh-token]'])).rows[0].value, false)

    const replacementCredential = 'd'.repeat(64)
    ticket = await mint(installation, replacementCredential)
    await anon()
    await redeem(ticket, { deviceCredential: replacementCredential })
    assert.equal(await proof(), false, 'Same-user credential replacement invalidates old proof')
    await anon()
    assert.equal((await db.query('select public.revoke_notification_installation_by_credential_v2($1,$2) as value', [installation, replacementCredential])).rows[0].value, true)
    assert.equal(await proof(user, installation, replacementCredential), true, 'Recovers a lost legacy success response')

    const anotherUser = '77777777-7777-4777-8777-777777777777'
    await root()
    await db.query('insert into public.users(id) values($1)', [anotherUser])
    ticket = await mint(installation, credential, anotherUser)
    await anon()
    await redeem(ticket)
    assert.equal(await proof(user, installation, replacementCredential), false, 'Historical credential cannot attest another active same-key registration')
    await root()
    assert.equal((await db.query('select revoked_at from public.notification_installations where user_id=$1', [anotherUser])).rows[0].revoked_at, null)
    assert.equal(await proof(anotherUser), true)

    await root()
    await db.query('delete from public.notification_installations where installation_key=$1', [installation])
    assert.equal(await proof(), false, 'Missing historical row is not proof')
    ticket = await mint(installation, replacementCredential)
    await anon()
    await redeem(ticket, { deviceCredential: replacementCredential })
    assert.equal(await proof(), false, 'Recreated key with a new credential remains a different generation')
    assert.equal(await proof(user, installation, replacementCredential), true)
    const settleSignature = 'public.settle_native_notification_enrollment_attempt_v1(uuid,uuid,text,text,text,text)'
    await root()
    assert.deepEqual((await db.query(`select has_function_privilege('anon',$1,'execute') as anon,
      has_function_privilege('authenticated',$1,'execute') as member,
      has_function_privilege('service_role',$1,'execute') as service`, [settleSignature])).rows[0],
    { anon: true, member: false, service: false })
    assert.equal((await db.query(`select exists(select 1 from pg_proc p, lateral aclexplode(p.proacl) a
      where p.oid=$1::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') as public`, [settleSignature])).rows[0].public, false)
    const settle = async (pendingTicket, { member = user, key = installation, request = requestId, secret = verifier, deviceCredential = credential } = {}) => {
      await anon()
      return (await db.query('select public.settle_native_notification_enrollment_attempt_v1($1,$2,$3,$4,$5,$6) as value',
        [member, key, pendingTicket, request, secret, deviceCredential])).rows[0].value
    }
    // Preserve a previous live credential while cancelling a never-committed
    // attempt. A late original redemption must be rejected after settlement.
    ticket = await mint(installation, replacementCredential)
    await anon()
    await redeem(ticket, { deviceCredential: replacementCredential })
    let pendingTicket = await mint()
    for (const options of [{ member: anotherUser }, { key: otherInstallation }, { request: 'wrong-request-id-value' },
      { secret: 'f'.repeat(64) }, { deviceCredential: 'f'.repeat(64) }]) assert.equal(await settle(pendingTicket, options), false)
    assert.equal(await settle('malformed'), false)
    assert.equal(await settle(pendingTicket), true)
    await root()
    await db.exec(await readFile(new URL('./sql/pending-native-notification-enrollment-settlement.sql', import.meta.url), 'utf8'))
    assert.equal((await db.query("select count(*)::integer as total from public.users where id='95000000-0000-4000-8000-000000000097'")).rows[0].total, 0)
    assert.equal(await settle(pendingTicket), true, 'Lost settlement response can be retried')
    await anon()
    await assert.rejects(redeem(pendingTicket), /Invalid or expired/)
    await root()
    assert.equal((await db.query('select revoked_at from public.notification_installations where user_id=$1 and installation_key=$2', [user, installation])).rows[0].revoked_at, null,
      'Cancellation does not attest or revoke a different prior credential')
    assert.equal(await proof(user, installation, replacementCredential), true)

    // A lost successful enrollment response is settled by revoking the exact
    // newly committed credential, with no delayed redeem or token refresh.
    pendingTicket = await mint()
    await anon()
    await redeem(pendingTicket)
    assert.equal(await settle(pendingTicket), true)
    assert.equal(await proof(), true)
    await anon()
    await assert.rejects(redeem(pendingTicket), /Invalid or expired/)
    assert.equal((await db.query('select public.register_native_notification_token_by_credential_v2($1,$2,$3) as value', [installation, credential, 'ExponentPushToken[settled-stale-refresh]'])).rows[0].value, false)

    // A ticket secret rotated by another device and an expired/pruned ticket
    // cannot redeem the old attempt. Neither attests unrelated revocation.
    pendingTicket = await mint()
    const rotatedTicket = await mint(installation, replacementCredential)
    assert.equal(await settle(pendingTicket), true)
    await anon()
    await redeem(rotatedTicket, { deviceCredential: replacementCredential })
    await root()
    assert.equal((await db.query('select revoked_at from public.notification_installations where user_id=$1 and installation_key=$2', [user, installation])).rows[0].revoked_at, null)
    pendingTicket = await mint()
    await root()
    await db.query('delete from private.notification_native_enrollment_tickets where user_id=$1', [user])
    assert.equal(await settle(pendingTicket), true)
    await anon()
    await assert.rejects(redeem(pendingTicket), /Invalid or expired/)
    await root()
    assert.equal((await db.query('select revoked_at from public.notification_installations where user_id=$1 and installation_key=$2', [user, installation])).rows[0].revoked_at, null)

    // Cancellation skipped by a trigger must throw and retain the live ticket.
    pendingTicket = await mint()
    await root()
    await db.exec(`create function private.reject_test_ticket_cancel() returns trigger language plpgsql as $$begin return null; end$$;
      create trigger reject_test_ticket_cancel before update of consumed_at on private.notification_native_enrollment_tickets
      for each row execute function private.reject_test_ticket_cancel()`)
    await assert.rejects(settle(pendingTicket), /could not be settled/)
    await root()
    assert.equal((await db.query('select consumed_at from private.notification_native_enrollment_tickets where user_id=$1', [user])).rows[0].consumed_at, null)
    await db.exec('drop trigger reject_test_ticket_cancel on private.notification_native_enrollment_tickets')
    assert.equal(await settle(pendingTicket), true)
    await root()
    await db.exec(await readFile(new URL('./sql/idempotent-native-notification-revocation.sql', import.meta.url), 'utf8'))
    assert.equal((await db.query("select count(*)::integer as total from public.users where id='95000000-0000-4000-8000-000000000088'")).rows[0].total, 0)
  } finally {
    await db.close()
  }
})

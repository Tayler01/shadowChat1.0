import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (filePath: string) => readFileSync(path.join(root, filePath), 'utf8')
const compact = (source: string) => source.replace(/\s+/g, ' ').toLowerCase()
const migrationName = readdirSync(path.join(root, 'supabase/migrations'))
  .find(name => name.endsWith('_edge_request_limits_and_ai_ledger.sql'))

if (!migrationName) {
  throw new Error('edge request limit migration was not created with the Supabase CLI')
}

const migration = compact(read(`supabase/migrations/${migrationName}`))
const guard = compact(read('supabase/functions/_shared/edge-guard.ts'))

describe('Edge Function abuse and idempotency boundaries', () => {
  it('keeps atomic buckets and claims private behind service-role-only RPCs', () => {
    expect(migration).toContain('create table if not exists private.edge_request_buckets')
    expect(migration).toContain('create table if not exists private.edge_request_claims')
    expect(migration).toContain('alter table private.edge_request_buckets enable row level security')
    expect(migration).toContain('alter table private.edge_request_claims enable row level security')
    expect(migration).toContain('create policy "no direct edge request bucket access"')
    expect(migration).toContain('create policy "no direct edge request claim access"')
    expect(migration).toContain('on private.edge_request_buckets (subject_id)')
    expect(migration).toContain('on private.edge_request_claims (subject_id)')
    expect(migration).toContain('on conflict on constraint edge_request_claims_pkey do update')
    expect(migration).toContain("claims.claim_status = 'failed'")
    expect(migration).toContain("claims.claim_status = 'processing' and claims.lease_expires_at <= observed_at")
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('grant execute on function public.claim_edge_request')
    expect(migration).toContain('to service_role')
    expect(migration).not.toMatch(/grant execute on function public\.(?:claim|read|complete|fail|consume)_edge_request[^;]+to authenticated/)
  })

  it('returns authenticated identities and centralizes atomic guard RPCs', () => {
    expect(guard).toContain('export const authenticateedgeuser')
    expect(guard).toContain('return { id: user.id')
    expect(guard).toContain("calledgerpc(supabase, 'consume_edge_request_bucket'")
    expect(guard).toContain("calledgerpc(supabase, 'claim_edge_request'")
    expect(guard).toContain("calledgerpc(supabase, 'complete_edge_request_claim'")
    expect(guard).toContain('export const deterministicrequestkey')
  })

  it('claims AI requests by source chat message or deterministic request hash before provider work', () => {
    const source = compact(read('supabase/functions/openai-chat/index.ts'))
    const handler = source.slice(source.indexOf('serve(async req =>'))
    const validation = handler.indexOf('validateposttochat(supabase, user.id, messages)')
    const sourceKey = handler.indexOf('`chat-message:${sourcemessageid}`')
    const deterministicKey = handler.indexOf('deterministicrequestkey({ messages, model: model ?? null })')
    const claim = handler.indexOf('await claimedgerequest(supabase')
    const limit = handler.indexOf('await consumeedgeratelimit(supabase')
    const provider = handler.indexOf('await requestaicompletion(messages, model)')

    expect(validation).toBeGreaterThan(-1)
    expect(sourceKey).toBeGreaterThan(validation)
    expect(deterministicKey).toBeGreaterThan(validation)
    expect(claim).toBeGreaterThan(deterministicKey)
    expect(limit).toBeGreaterThan(claim)
    expect(provider).toBeGreaterThan(limit)
    expect(handler).toContain('waitforedgerequestclaim')
    expect(source).toContain("'x-idempotent-replay': 'true'")
  })

  it('rejects link-preview requests atomically before provider fetch or storage work', () => {
    const source = compact(read('supabase/functions/link-preview/index.ts'))
    const handler = source.slice(source.indexOf('serve(async req =>'))
    const auth = handler.indexOf('authenticateedgeuser(req)')
    const limit = handler.indexOf('consumeedgeratelimit(getsupabaseadmin()')
    const providers = handler.indexOf('fetchopengraphpreview(url)')
    const storage = handler.indexOf('makepreviewimagedurable(url, preview)')

    expect(auth).toBeGreaterThan(-1)
    expect(limit).toBeGreaterThan(auth)
    expect(providers).toBeGreaterThan(limit)
    expect(storage).toBeGreaterThan(providers)
    expect(handler).toContain("scope: 'link-preview:minute'")
  })

  it('rate-limits every ShadowPin provider action before its external operation', () => {
    const source = compact(read('supabase/functions/shadow-pin-video/index.ts'))
    expect(source).toContain("scope: 'shadow-pin-video:provider-minute'")

    const actionContracts = [
      ['handlecreateupload', "enforceproviderrequestlimit(auth.supabase, auth.userid, 'create-upload')", 'createbunnyvideo('],
      ['handlereplaceupload', "enforceproviderrequestlimit(auth.supabase, auth.userid, 'replace-upload')", 'createbunnyvideo('],
      ['handlesyncstatus', "enforceproviderrequestlimit(auth.supabase, auth.userid, 'sync-status')", 'getbunnyvideo('],
      ['handlecreateexternal', "enforceproviderrequestlimit(auth.supabase, auth.userid, 'create-external')", 'buildexternalrecord('],
      ['handlereplaceexternal', "enforceproviderrequestlimit(auth.supabase, auth.userid, 'replace-external')", 'buildexternalrecord('],
      ['handledeletevideoasset', "enforceproviderrequestlimit(auth.supabase, auth.userid, 'delete-video-asset')", 'deletebunnyvideo('],
    ] as const

    for (const [handlerName, guardMarker, providerMarker] of actionContracts) {
      const start = source.indexOf(`const ${handlerName}`)
      const nextHandler = source.indexOf('\nconst handle', start + 10)
      const handler = source.slice(start, nextHandler > start ? nextHandler : source.length)
      expect(start).toBeGreaterThan(-1)
      expect(handler.indexOf(guardMarker)).toBeGreaterThan(-1)
      expect(handler.indexOf(providerMarker)).toBeGreaterThan(handler.indexOf(guardMarker))
    }
  })

  it('claims push delivery before VAPID work and stores the replay response', () => {
    const source = compact(read('supabase/functions/send-push/index.ts'))
    const handler = source.slice(source.indexOf('serve(async (req): promise<response> =>'))
    const claim = handler.indexOf('await claimedgerequest(supabase')
    const limit = handler.indexOf('await consumeedgeratelimit(supabase')
    // The service-role recovery route has its own VAPID lookup before the
    // caller-owned idempotency path. Verify ordering within the latter.
    const vapid = handler.indexOf('getvapidkeys()', limit)
    const delivery = handler.indexOf('await senddmpush(')
    const completion = handler.indexOf('await completeedgerequestclaim(supabase')

    expect(claim).toBeGreaterThan(-1)
    expect(limit).toBeGreaterThan(claim)
    expect(vapid).toBeGreaterThan(limit)
    expect(delivery).toBeGreaterThan(vapid)
    expect(completion).toBeGreaterThan(delivery)
    expect(handler).toContain('waitforedgerequestclaim')
  })

  it('keeps push subscription identifiers private and retries provider failures', () => {
    const source = compact(read('supabase/functions/send-push/index.ts'))
    const delivery = source.slice(
      source.indexOf('const deliverpushtosubscriptions'),
      source.indexOf('const senddmpush')
    )

    expect(delivery).not.toContain('endpoint: subscriptionrow.endpoint, status: response.status')
    expect(delivery).toContain('retryablefailures: results.filter')
    expect(delivery).not.toContain('results, }')
    expect(source).not.toContain('results: perrecipientresults')
    expect(source).toContain("errormessage: 'push provider delivery can be retried'")
    expect(source).toContain('blockedmessageauthorids')
  })

  it('leaves account deletion exempt from request-ledger retention', () => {
    const source = compact(read('supabase/functions/delete-account/index.ts'))
    const config = compact(read('supabase/config.toml'))
    expect(source).not.toContain("from '../_shared/edge-guard.ts'")
    expect(source).not.toContain('consumeedgeratelimit')
    expect(source).not.toContain('claimedgerequest')
    expect(config).toContain('deliberately exempt from the shared edge request ledger')
  })
})

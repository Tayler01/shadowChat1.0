import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { badRequest, corsHeaders, getSupabaseAdmin, hashToken, json } from '../_shared/bridge.ts'
import { AccountDeletionRequestError, runAccountDeletion, runLegacyAccountDeletion, type DeletionManifest } from '../_shared/account-deletion-workflow.ts'
import { cleanupAccountProviders, createBunnyVideoDeletionProvider } from '../_shared/account-deletion-providers.ts'
import { createLiveKitClients } from '../_shared/shado-live.ts'
import { captureModerationMedia } from '../_shared/moderation-media.ts'
import { ACCOUNT_DELETION_CAPABILITIES } from '../_shared/account-deletion-protocol.ts'
import { isDeletionReconciliationRequest, LEGACY_DELETION_CONTROL_TIMEOUT_MS, LEGACY_DELETION_WORK_TIMEOUT_MS, reconcileLegacyAccountDeletion } from '../_shared/account-deletion-reconciliation.ts'

const bearerToken = (req: Request) => {
  const value = req.headers.get('Authorization') ?? ''
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() || null : null
}
const cleanupActions = (supabase: ReturnType<typeof getSupabaseAdmin>, signal?: AbortSignal) => ({
  cleanupProviders: async (manifest: DeletionManifest, userId: string) => {
    signal?.throwIfAborted()
    const live = manifest.live_rooms.length || manifest.live_memberships.length
      ? createLiveKitClients(signal ? { requestTimeout: 10, failover: false } : undefined).rooms : null
    await cleanupAccountProviders({
      removeLiveParticipant: async (room, id) => {
        if (!live) throw new Error('Live provider unavailable')
        await live.removeParticipant(room, id, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) })
      },
      deleteLiveRoom: async room => { if (!live) throw new Error('Live provider unavailable'); await live.deleteRoom(room) },
      deleteBunnyVideo: createBunnyVideoDeletionProvider(() => ({
        libraryId: Deno.env.get('BUNNY_STREAM_LIBRARY_ID'),
        apiKey: Deno.env.get('BUNNY_STREAM_API_KEY'),
      }), signal),
    }, manifest, userId, signal)
  },
  preserveEvidence: async (userId: string) => {
    signal?.throwIfAborted()
    const pending = await supabase.rpc('get_pending_moderation_media_for_owner', { target_user_id: userId })
    signal?.throwIfAborted()
    if (pending.error) throw new Error('Submitted evidence preservation is not ready')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    if (!supabaseUrl) throw new Error('Evidence capture configuration is missing')
    await captureModerationMedia(supabase, pending.data, { supabaseUrl })
    signal?.throwIfAborted()
  },
})

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await req.json().catch(() => ({})) as { action?: string; confirm?: string; receipt?: string; expectedUserId?: string } | null
    if (!body || typeof body !== 'object' || Array.isArray(body)) return badRequest('A request object is required')
    if (body.action !== undefined) {
      // This public probe is intentionally before admin clients, hashing, Auth,
      // database and provider work. Mixed probe/deletion bodies fail closed.
      if (Object.keys(body).length !== 1) return badRequest('Invalid action request')
      if (body.action === 'capabilities') {
        return new Response(JSON.stringify(ACCOUNT_DELETION_CAPABILITIES), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      }
      if (body.action !== 'reconcile-legacy') return badRequest('Invalid action request')
      if (!(await isDeletionReconciliationRequest(
        { apiKey: req.headers.get('apikey'), bearer: bearerToken(req) },
        { secretKeysJson: Deno.env.get('SUPABASE_SECRET_KEYS'), legacyServiceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') },
      ))) {
        return json({ error: 'Service authentication is required' }, 401)
      }
      const signal = AbortSignal.timeout(LEGACY_DELETION_WORK_TIMEOUT_MS)
      const control = getSupabaseAdmin({ signal: AbortSignal.timeout(LEGACY_DELETION_CONTROL_TIMEOUT_MS) })
      const work = getSupabaseAdmin({ signal })
      const { cleanupProviders, preserveEvidence } = cleanupActions(work, signal)
      try {
        const result = await reconcileLegacyAccountDeletion(control, work, cleanupProviders, preserveEvidence, signal)
        return json({ ok: true, ...result })
      } catch {
        return json({ error: 'Legacy deletion reconciliation needs retry', retryable: true }, 503)
      }
    }
    if (body.confirm !== 'DELETE') {
      return badRequest('Deletion confirmation is required')
    }
    const legacyRequest = Object.keys(body).length === 1
    // Only the published client's exact body uses legacy compatibility. A
    // malformed or partial receipt request must never fall back to that path.
    if (!legacyRequest && (typeof body.receipt !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.receipt))) {
      return badRequest('A valid deletion receipt is required')
    }
    if (!legacyRequest && (typeof body.expectedUserId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.expectedUserId))) {
      return badRequest('The account to delete must be identified')
    }
    const token = bearerToken(req)
    if (legacyRequest && !token) throw new AccountDeletionRequestError('Authentication is required to start account deletion', 401)
    const supabase = getSupabaseAdmin()
    const { cleanupProviders, preserveEvidence } = cleanupActions(supabase)
    if (legacyRequest) {
      // Domain-separated bearer hashes remain server-only and never appear in
      // responses/logs. A fresh opaque digest is used only for a brand-new job.
      const generatedReceiptDigest = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
      await runLegacyAccountDeletion(supabase, token!, await hashToken(`legacy-delete-bearer:v1:${token}`), generatedReceiptDigest, cleanupProviders, preserveEvidence)
    } else {
      // New clients save their completion-only receipt before the first POST.
      await runAccountDeletion(supabase, token, await hashToken(body.receipt!), body.expectedUserId!, cleanupProviders, preserveEvidence)
    }
    return json({ ok: true })
  } catch (error) {
    if (error instanceof AccountDeletionRequestError) return json({ error: error.message, deletionStarted: false, ...(error.status === 503 ? { retryable: true } : {}) }, error.status)
    return json({
      code: 'account_deletion_incomplete',
      error: 'Account deletion is not yet complete. Access is restricted once cleanup starts. Return to the deletion page and try again to finish removing your account and uploads.',
      retryable: true,
      partialDeletion: true,
    }, 503)
  }
})

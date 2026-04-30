import {
  ensureSession,
  getSessionWithTimeout,
  getStoredRefreshToken,
  getWorkingClient,
} from './supabase'

export type RealtimeRecoveryReason =
  | 'session-recovery'
  | 'channel-error'
  | 'send-error'
  | 'manual'

export interface RealtimeRecoveryResult {
  ok: boolean
  skipped: boolean
  reason: RealtimeRecoveryReason
  error?: string
}

export const REALTIME_RECOVERY_EVENT = 'shadowchat:realtime-recovery'

let realtimeRecoveryPromise: Promise<RealtimeRecoveryResult> | null = null

const dispatchRealtimeRecoveryEvent = (result: RealtimeRecoveryResult) => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<RealtimeRecoveryResult>(REALTIME_RECOVERY_EVENT, {
      detail: result,
    })
  )
}

export const runRealtimeRecovery = async (
  reason: RealtimeRecoveryReason = 'manual',
  options: { sessionReady?: boolean } = {}
): Promise<RealtimeRecoveryResult> => {
  if (realtimeRecoveryPromise) {
    return realtimeRecoveryPromise
  }

  realtimeRecoveryPromise = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { ok: false, skipped: true, reason, error: 'offline' }
    }

    if (!options.sessionReady && !getStoredRefreshToken()) {
      return { ok: false, skipped: true, reason, error: 'no-stored-session' }
    }

    if (!options.sessionReady) {
      const ok = await ensureSession(reason === 'manual')
      if (!ok) {
        return { ok: false, skipped: false, reason, error: 'session-not-ready' }
      }
    }

    const workingClient = await getWorkingClient()
    const {
      data: { session },
    } = await getSessionWithTimeout(workingClient)

    try {
      workingClient.realtime?.setAuth?.(session?.access_token || '')
    } catch {
      // ignore token propagation failures and still attempt reconnect
    }

    try {
      workingClient.realtime?.connect?.()
    } catch {
      // reconnect is best-effort; channel resubscribe/refetch handles stale state
    }

    return { ok: true, skipped: false, reason }
  })()
    .then(result => {
      dispatchRealtimeRecoveryEvent(result)
      return result
    })
    .finally(() => {
      realtimeRecoveryPromise = null
    })

  return realtimeRecoveryPromise
}


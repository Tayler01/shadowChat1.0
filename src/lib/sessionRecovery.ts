import {
  ensureSession,
  getStoredRefreshToken,
  updateUserPresence,
} from './supabase'
import { refreshAppBadge } from './appBadge'
import { runRealtimeRecovery } from './realtimeRecovery'

export type SessionRecoveryReason =
  | 'startup'
  | 'resume'
  | 'focus'
  | 'online'
  | 'manual'

export interface SessionRecoveryResult {
  ok: boolean
  skipped: boolean
  reason: SessionRecoveryReason
  error?: string
}

export const SESSION_RECOVERY_EVENT = 'shadowchat:session-recovery'

let recoveryPromise: Promise<SessionRecoveryResult> | null = null

const dispatchRecoveryEvent = (result: SessionRecoveryResult) => {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent<SessionRecoveryResult>(SESSION_RECOVERY_EVENT, {
      detail: result,
    })
  )
}

export const runSessionRecovery = async (
  reason: SessionRecoveryReason = 'manual'
): Promise<SessionRecoveryResult> => {
  if (recoveryPromise) {
    return recoveryPromise
  }

  recoveryPromise = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { ok: false, skipped: true, reason, error: 'offline' }
    }

    if (!getStoredRefreshToken()) {
      return { ok: false, skipped: true, reason, error: 'no-stored-session' }
    }

    try {
      const ok = await ensureSession(reason === 'manual')
      if (!ok) {
        return { ok: false, skipped: false, reason, error: 'session-not-ready' }
      }

      await Promise.allSettled([
        runRealtimeRecovery('session-recovery', { sessionReady: true }),
        updateUserPresence(),
        refreshAppBadge(),
      ])

      return { ok: true, skipped: false, reason }
    } catch (err) {
      return {
        ok: false,
        skipped: false,
        reason,
        error: err instanceof Error ? err.message : 'session-recovery-failed',
      }
    }
  })()
    .then(result => {
      dispatchRecoveryEvent(result)
      return result
    })
    .finally(() => {
      recoveryPromise = null
    })

  return recoveryPromise
}

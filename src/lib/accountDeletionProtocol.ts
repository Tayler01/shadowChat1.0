import { supportsAccountDeletionRecovery } from '../../supabase/functions/_shared/account-deletion-protocol'

const unavailable = 'Safe account deletion is unavailable right now. No deletion request was sent. Try again later or contact privacy@shadochat.online.'

/** Probe every attempt: a deployment can change between separate user actions. */
export async function requireAccountDeletionProtocol(url: string, anonKey: string): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(`${url}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      // Legacy handlers require confirm:'DELETE'. This body cannot authorize one.
      body: JSON.stringify({ action: 'capabilities' }),
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      redirect: 'error', signal: controller.signal,
    })
    if (!response.ok) {
      await response.body?.cancel()
      throw new Error(unavailable)
    }
    if (!supportsAccountDeletionRecovery(await response.json())) throw new Error(unavailable)
  } catch {
    throw new Error(unavailable)
  } finally {
    clearTimeout(timeout)
  }
}

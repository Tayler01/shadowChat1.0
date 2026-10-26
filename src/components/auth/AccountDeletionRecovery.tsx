import { useEffect, useState } from 'react'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { getAccountDeletionState, subscribeAccountDeletion } from '../../lib/accountDeletionReceipt'
import { retryPendingAccountDeletion } from '../../../apps/streamlined/src-overrides/lib/auth'

/** Public recovery route: deleting a profile must never hide the retry control. */
export default function AccountDeletionRecovery() {
  const [state, setState] = useState(getAccountDeletionState)
  useEffect(() => subscribeAccountDeletion(() => setState(getAccountDeletionState())), [])
  const retry = async () => {
    try { await retryPendingAccountDeletion() } catch { /* Shared operation state displays the failure. */ }
  }
  return <main className="theme-page-surface flex min-h-[100dvh] items-center justify-center px-4 py-8">
    <section className="glass-panel-strong w-full max-w-md space-y-4 rounded-[var(--radius-xl)] p-6" aria-labelledby="deletion-heading">
      {state.confirmed ? <ShieldCheck className="h-9 w-9 text-[var(--text-gold)]" aria-hidden="true" /> : <Trash2 className="h-9 w-9 text-[var(--text-gold)]" aria-hidden="true" />}
      <h1 id="deletion-heading" className="text-xl font-semibold">{state.confirmed ? 'Account deleted' : state.pending ? 'Finish account deletion' : 'Account deletion help'}</h1>
      {state.confirmed ? <p className="text-sm leading-6 text-[var(--text-secondary)]">The server confirmed that your account deletion is complete. This applies to every ShadowChat edition. Restricted safety records and copies shared by others follow the privacy policy.</p>
        : state.pending ? <>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">Your deletion request is saved in this browser. Once deletion starts, chat access is closed while your account and associated uploads are removed.</p>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">If the connection is interrupted, return here and retry. The same request continues safely even when you can no longer sign in. Keep this browser's site data until completion.</p>
          {state.running && <p role="status" className="text-sm text-[var(--text-gold)]">Finishing deletion. This may take a moment…</p>}
          <Button variant="danger" loading={state.running} disabled={state.running} onClick={() => void retry()}>Retry deletion</Button>
        </> : <p className="text-sm leading-6 text-[var(--text-secondary)]">No pending request was found in this browser. Sign in and open Account settings to begin deletion, or contact privacy support if a previous request was interrupted.</p>}
      {state.error && !state.confirmed && <p role="alert" className="text-sm leading-6 text-red-200">{state.error}</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <a className="inline-flex min-h-11 items-center text-[var(--text-gold)]" href="mailto:privacy@shadochat.online">Privacy support</a>
        {!state.running && <a className="inline-flex min-h-11 items-center text-[var(--text-gold)]" href="/">{state.confirmed ? 'Return to sign in' : 'Back to ShadowChat'}</a>}
      </div>
    </section>
  </main>
}

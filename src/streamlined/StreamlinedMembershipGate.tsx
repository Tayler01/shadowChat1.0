import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../../apps/streamlined/src-overrides/hooks/useAuth'
import { acceptStreamlinedMembership, getStreamlinedMembershipAcknowledgement } from './membershipAcknowledgement'
import { isLocalFeaturePreview } from './localFeaturePreview'
import { StreamlinedLoadingView } from './components/StreamlinedLoadingView'

// The server stores an adult SELF-DECLARATION, not verified age. Existing
// membership/RLS enforcement remains authoritative across both editions.
const policyLinkClass = 'text-[var(--theme-accent-readable)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--theme-focus-ring)]'

interface MembershipCheckProps {
  userId: string
  signOut: () => Promise<void>
  children: ReactNode
  unacceptedContent?: ReactNode
}

function MembershipCheck({ userId, signOut, children, unacceptedContent }: MembershipCheckProps) {
  const [status, setStatus] = useState<'checking' | 'required' | 'accepted' | 'failed'>('checking')
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [age, setAge] = useState<'adult' | 'underage' | null>(null)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const inputId = useId()
  const busy = status === 'checking' || saving || signingOut
  const canContinue = status === 'required' && age === 'adult' && termsAccepted && privacyAcknowledged && !busy

  useEffect(() => {
    const requestId = ++requestIdRef.current
    setStatus('checking')
    setError(null)
    void getStreamlinedMembershipAcknowledgement(userId).then(record => {
      if (requestId === requestIdRef.current) setStatus(record === null ? 'required' : 'accepted')
    }).catch(reason => {
      if (requestId !== requestIdRef.current) return
      setStatus('failed')
      setError(reason instanceof Error ? reason.message : 'Could not check your membership acknowledgement. Please retry.')
    })
    return () => { requestIdRef.current += 1 }
  }, [retry, userId])

  const continueToPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canContinue) return
    const requestId = ++requestIdRef.current
    setSaving(true)
    setError(null)
    try {
      await acceptStreamlinedMembership({ userId, adultDeclared: age === 'adult', termsAccepted, privacyAcknowledged })
      if (requestId === requestIdRef.current) setStatus('accepted')
    } catch (reason) {
      if (requestId === requestIdRef.current) setError(reason instanceof Error ? reason.message : 'Could not save your acknowledgement. Please retry.')
    } finally {
      if (requestId === requestIdRef.current) setSaving(false)
    }
  }

  const endSession = async () => {
    if (signingOut) return
    requestIdRef.current += 1
    setSigningOut(true)
    setError(null)
    try {
      await signOut()
    } catch {
      setError('Could not sign out. Please try again.')
      setStatus('failed')
    } finally {
      setSigningOut(false)
    }
  }

  if (status === 'accepted') return <>{children}</>
  if (unacceptedContent !== undefined) return <>{unacceptedContent}</>
  if (status === 'checking') return <StreamlinedLoadingView fullscreen message="Checking your membership…" />
  if (status === 'failed') return <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--bg-app)] p-6 text-[var(--text-primary)]">
    <div className="max-w-xl space-y-5">
      <h1 className="text-2xl font-semibold">Could not confirm your membership</h1>
      <p role="alert" className="text-sm leading-6 text-[var(--text-gold)]">{error}</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" disabled={busy} className="min-h-12" onClick={() => setRetry(value => value + 1)}>Retry membership check</Button>
        <Button type="button" variant="secondary" loading={signingOut} disabled={saving} className="min-h-12" onClick={() => void endSession()}>Sign out</Button>
      </div>
      <a href="/?view=settings&settingsSection=account" className={`${policyLinkClass} inline-flex min-h-12 items-center text-sm`}>Manage or delete my account</a>
    </div>
  </main>

  return <main className="h-[100dvh] overflow-y-auto overscroll-contain bg-[var(--bg-app)] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[var(--text-primary)] sm:px-6">
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">ShadowChat Streamlined</p>
        <h1 className="mt-3 text-2xl font-semibold">Before you continue</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">This preview is for approved members aged 18 and older. It shares your account and content with the full app.</p>
      </header>
      <form onSubmit={event => void continueToPreview(event)} className="space-y-5">
        <fieldset disabled={busy} className="rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[var(--bg-panel)] px-4 pb-2">
          <legend className="px-2 text-sm font-semibold">Are you 18 or older?</legend>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 py-3 text-sm">
            <input type="radio" name={`${inputId}-age`} checked={age === 'adult'} onChange={() => setAge('adult')} className="h-5 w-5 shrink-0 accent-[var(--theme-accent-readable)]" />
            I am 18 or older
          </label>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 py-3 text-sm">
            <input type="radio" name={`${inputId}-age`} checked={age === 'underage'} onChange={() => setAge('underage')} className="h-5 w-5 shrink-0 accent-[var(--theme-accent-readable)]" />
            I am under 18
          </label>
        </fieldset>
        {age === 'underage' && <p role="alert" className="rounded-[var(--radius-sm)] border border-[var(--border-panel)] p-4 text-sm leading-6 text-[var(--text-gold)]">You must be at least 18 to use this edition. Please sign out. You can still manage or delete your existing account using the link below.</p>}
        <div className="space-y-2">
          <label htmlFor={`${inputId}-terms`} className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-sm leading-6">
            <input id={`${inputId}-terms`} type="checkbox" checked={termsAccepted} disabled={busy || age === 'underage'} onChange={event => setTermsAccepted(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--theme-accent-readable)]" />
            <span>I agree to the <a href="/?legal=terms" target="_blank" rel="noreferrer" className={policyLinkClass}>Terms of use</a> and <a href="/?legal=safety" target="_blank" rel="noreferrer" className={policyLinkClass}>Community safety standards</a>.</span>
          </label>
          <label htmlFor={`${inputId}-privacy`} className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-sm leading-6">
            <input id={`${inputId}-privacy`} type="checkbox" checked={privacyAcknowledged} disabled={busy || age === 'underage'} onChange={event => setPrivacyAcknowledged(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--theme-accent-readable)]" />
            <span>I have read and acknowledge the <a href="/?legal=privacy" target="_blank" rel="noreferrer" className={policyLinkClass}>Privacy policy</a>, including the limitations of this preview.</span>
          </label>
        </div>
        <p className="text-xs leading-6 text-[var(--text-muted)]">This is your declaration that you are 18 or older, not an identity or age check. No date of birth is requested. We save the policy version, your acknowledgement and the time with your account so it applies across your devices.</p>
        {error && <p role="alert" className="text-sm text-[var(--text-gold)]">{error}</p>}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button type="submit" disabled={!canContinue} loading={saving} className="min-h-12">Continue to preview</Button>
          <Button type="button" variant="secondary" loading={signingOut} disabled={saving} className="min-h-12" onClick={() => void endSession()}>Sign out</Button>
        </div>
      </form>
      <a href="/?view=settings&settingsSection=account" className={`${policyLinkClass} inline-flex min-h-12 items-center text-sm`}>Manage or delete my account</a>
    </div>
  </main>
}

export function StreamlinedMembershipGate({ children, unacceptedContent }: { children: ReactNode; unacceptedContent?: ReactNode }) {
  const { user, signOut, loading } = useAuth()
  if (loading) return <StreamlinedLoadingView fullscreen message="Checking your membership…" />
  if (!user) return null
  // Removed from regular builds. AuthGuard, approved-account auth and content
  // RLS remain in force; this path does not create or accept a legal receipt.
  if (typeof __SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ !== 'undefined' && __SHADOWCHAT_LOCAL_FEATURE_PREVIEW__ === true && !loading && isLocalFeaturePreview()) return <>{children}</>
  // A different signed-in account must never inherit the previous account's
  // in-memory declaration when React keeps this gate mounted.
  return <MembershipCheck key={user.id} userId={user.id} signOut={signOut} unacceptedContent={unacceptedContent}>{children}</MembershipCheck>
}

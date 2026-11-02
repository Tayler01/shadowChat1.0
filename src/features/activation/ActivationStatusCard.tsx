import { CheckCircle2, Download, Sparkles, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import type { AppView } from '../../types/navigation'
import type { ActivationFirstActionKind } from './activationTypes'

const ACTION_RESUME_COPY: Record<ActivationFirstActionKind, string> = {
  group_message: 'Send your hello in General Chat to finish setup.',
  direct_message: 'Send a direct message to finish setup.',
  shadow_pin_heart: 'Heart a ShadowPin to finish setup.',
}

interface ActivationStatusCardProps {
  currentView: AppView
  complete: boolean
  selectedFirstActionKind: ActivationFirstActionKind | null
  busy: boolean
  error: string | null
  onContinue: () => void
  onReview: () => void
  onDismiss: () => void
  onInstall: () => void
  onLater: () => void
}

export function ActivationStatusCard({
  currentView, complete, selectedFirstActionKind, busy, error,
  onContinue, onReview, onDismiss, onInstall, onLater,
}: ActivationStatusCardProps) {
  const resumeCopy = selectedFirstActionKind
    ? ACTION_RESUME_COPY[selectedFirstActionKind]
    : 'Your setup is saved. Resume whenever you are ready.'
  const mobileCardBottom = currentView === 'chat' || currentView === 'dms'
    ? 'bottom-[calc(env(safe-area-inset-bottom)_+_var(--shadowchat-mobile-chat-footer-height,9.5rem)_+_var(--shadowchat-keyboard-inset,0px)_+_0.5rem)]'
    : 'bottom-[calc(env(safe-area-inset-bottom)_+_5.25rem)]'

  if (!complete) {
    return (
      <aside className={`fixed inset-x-3 ${mobileCardBottom} z-[65] mx-auto max-w-md rounded-[var(--radius-lg)] border border-[var(--border-glow)] bg-[var(--bg-panel-strong)] p-3 shadow-[var(--shadow-panel)] md:bottom-5 md:left-auto md:right-5 md:mx-0 md:w-[22rem]`} aria-label="Resume first-run setup">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]"><Sparkles className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><p className="font-semibold">Setup saved</p><p className="mt-0.5 text-xs leading-5 text-[var(--text-muted)]">{resumeCopy}</p></div>
        </div>
        {error && <p className="mt-2 text-xs text-red-200" role="alert">{error}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button type="button" size="sm" loading={busy} onClick={onContinue}>{selectedFirstActionKind ? 'Continue action' : 'Resume setup'}</Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={onReview}>Review setup</Button>
        </div>
      </aside>
    )
  }

  return (
    <aside className={`fixed inset-x-3 ${mobileCardBottom} z-[66] mx-auto max-w-md rounded-[var(--radius-xl)] border border-[var(--border-glow)] bg-[var(--bg-panel-strong)] p-4 shadow-[var(--shadow-cta)] md:bottom-5 md:left-auto md:right-5 md:mx-0 md:w-[23rem]`} role="status" aria-label="First-run setup complete">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]"><CheckCircle2 className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1"><p className="text-lg font-semibold">You&apos;re in.</p><p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">Your identity, preferences, and first real ShadowChat move are set.</p></div>
        <button type="button" disabled={busy} onClick={onDismiss} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)]" aria-label="Dismiss setup success"><X className="h-4 w-4" /></button>
      </div>
      {error && <p className="mt-2 text-xs text-red-200" role="alert">{error}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button type="button" loading={busy} onClick={onInstall}><Download className="mr-2 h-4 w-4" /> Install app</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onLater}>Maybe later</Button>
      </div>
    </aside>
  )
}

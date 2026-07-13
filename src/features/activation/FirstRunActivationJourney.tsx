import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Bell,
  Check,
  Heart,
  ImagePlus,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility'
import type { ComfortPresetId } from '../../lib/comfortPreferences'
import { cn } from '../../lib/utils'

export type ActivationJourneyVisibleStep = 'identity' | 'preferences' | 'first_action'
export type ActivationJourneyFirstAction = 'group_message' | 'direct_message' | 'shadow_pin_heart'

type ActivationProfile = {
  id: string
  username: string
  display_name: string
  status_message: string
  avatar_url?: string | null
  avatar_thumbnail_url?: string | null
  color?: string | null
}

export type ActivationIdentityInput = {
  displayName: string
  statusMessage: string
  avatarFile: File | null
}

export type FirstRunActivationJourneyProps = {
  open: boolean
  step: ActivationJourneyVisibleStep
  profile: ActivationProfile
  selectedPreset: ComfortPresetId
  notificationsSupported: boolean
  notificationsSubscribed: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onIdentity: (input: ActivationIdentityInput) => Promise<void>
  onPresetChange: (preset: Exclude<ComfortPresetId, 'custom'>) => void
  onEnableNotifications: () => Promise<void>
  onNotificationsLater: () => Promise<void>
  onFirstAction: (action: ActivationJourneyFirstAction) => Promise<void>
}

const PRESETS: Array<{
  id: Exclude<ComfortPresetId, 'custom'>
  label: string
  detail: string
}> = [
  { id: 'follow-device', label: 'Follow my phone', detail: 'Match device motion and contrast preferences.' },
  { id: 'calm', label: 'Calm', detail: 'Solid surfaces, quiet effects, and play-on-request media.' },
  { id: 'high-visibility', label: 'High visibility', detail: 'Stronger contrast, larger text, and larger controls.' },
  { id: 'large-touch', label: 'Large & easy to tap', detail: 'Roomier messages with 48 px shared controls.' },
]

const FIRST_ACTIONS: Array<{
  id: ActivationJourneyFirstAction
  label: string
  detail: string
  icon: typeof MessageCircle
}> = [
  { id: 'group_message', label: 'Say hello', detail: 'Open General Chat and send your first message.', icon: MessagesSquare },
  { id: 'direct_message', label: 'Start a DM', detail: 'Choose a member and begin a private conversation.', icon: MessageCircle },
  { id: 'shadow_pin_heart', label: 'Heart a Pin', detail: 'Explore ShadowPin and heart something you like.', icon: Heart },
]

const STEP_INDEX: Record<ActivationJourneyVisibleStep, number> = {
  identity: 0,
  preferences: 1,
  first_action: 2,
}

export function FirstRunActivationJourney({
  open,
  step,
  profile,
  selectedPreset,
  notificationsSupported,
  notificationsSubscribed,
  busy,
  error,
  onClose,
  onIdentity,
  onPresetChange,
  onEnableNotifications,
  onNotificationsLater,
  onFirstAction,
}: FirstRunActivationJourneyProps) {
  const [displayName, setDisplayName] = useState(profile.display_name || '')
  const [statusMessage, setStatusMessage] = useState(profile.status_message || '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const dialogRef = useDialogAccessibility<HTMLDivElement>({
    open,
    onClose,
    initialFocusRef: closeRef,
  })

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('')
      return
    }
    const url = URL.createObjectURL(avatarFile)
    setAvatarPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [avatarFile])

  if (!open) return null
  const stepIndex = STEP_INDEX[step]
  const trimmedDisplayName = displayName.trim()

  const handleAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setAvatarFile(file)
    event.target.value = ''
  }

  const content = (
    <div className="fixed inset-0 z-[140] bg-[var(--bg-app)] text-[var(--text-primary)]" data-testid="first-run-activation-journey">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-[var(--shadowchat-visual-viewport-height,100dvh)] min-h-0 w-full flex-col overflow-hidden"
      >
        <header className="shrink-0 border-b border-[var(--border-panel)] bg-[rgba(5,6,8,0.96)] px-3 pb-3 pt-[calc(env(safe-area-inset-top)_+_0.4rem)] backdrop-blur-md sm:px-5 sm:pt-4">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-[var(--theme-accent-readable)]">Welcome to ShadowChat</p>
              <h1 id={titleId} className="truncate text-xl font-semibold">Make it yours</h1>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-white/5"
              aria-label="Skip setup for now"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mx-auto mt-3 grid max-w-2xl grid-cols-3 gap-2" aria-label={`Step ${stepIndex + 1} of 3`}>
            {[0, 1, 2].map(index => (
              <span key={index} className={cn('h-1.5 rounded-full', index <= stepIndex ? 'bg-[var(--theme-accent)]' : 'bg-white/10')} />
            ))}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-[calc(env(safe-area-inset-bottom)_+_2rem)] sm:px-6">
          <div className="mx-auto max-w-2xl">
            {step === 'identity' && (
              <section className="space-y-5" aria-labelledby="activation-identity-title">
                <div>
                  <h2 id="activation-identity-title" className="text-2xl font-semibold">Start with your identity</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">Your display name is required. A photo and short status are optional and can change anytime.</p>
                </div>
                <div className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-white/[0.025] p-4">
                  <Avatar
                    src={avatarPreview || profile.avatar_thumbnail_url || profile.avatar_url || undefined}
                    alt={trimmedDisplayName || profile.username}
                    fallback={trimmedDisplayName || profile.username}
                    color={profile.color || undefined}
                    size="xl"
                  />
                  <label className={cn('inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--theme-accent-border-soft)] px-4 text-sm font-semibold text-[var(--theme-accent-readable)]', busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer')}>
                    <ImagePlus className="h-4 w-4" />
                    {avatarFile ? 'Change photo' : 'Add a photo'}
                    <input type="file" accept="image/*" onChange={handleAvatar} disabled={busy} className="sr-only" />
                  </label>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium">Display name</span>
                  <input
                    value={displayName}
                    onChange={event => setDisplayName(event.target.value)}
                    maxLength={80}
                    autoComplete="name"
                    disabled={busy}
                    className="obsidian-input min-h-12 w-full rounded-[var(--radius-md)] px-3 text-base"
                    placeholder="What should people call you?"
                    aria-required="true"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="flex justify-between gap-3 text-sm font-medium"><span>Status</span><span className="text-[var(--text-muted)]">Optional - {statusMessage.length}/280</span></span>
                  <textarea
                    value={statusMessage}
                    onChange={event => setStatusMessage(event.target.value)}
                    maxLength={280}
                    rows={4}
                    disabled={busy}
                    className="obsidian-input min-h-28 w-full resize-none rounded-[var(--radius-md)] p-3 text-base"
                    placeholder="A little about you"
                  />
                </label>
                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  loading={busy}
                  disabled={!trimmedDisplayName}
                  onClick={() => void onIdentity({ displayName: trimmedDisplayName, statusMessage: statusMessage.trim(), avatarFile })}
                >
                  Continue
                </Button>
              </section>
            )}

            {step === 'preferences' && (
              <section className="space-y-5" aria-labelledby="activation-preferences-title">
                <div>
                  <h2 id="activation-preferences-title" className="text-2xl font-semibold">Choose your experience</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">Comfort applies immediately on this device. Notifications are always your explicit choice.</p>
                </div>
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">Comfort preset</legend>
                  {selectedPreset === 'custom' && (
                    <div className="rounded-[var(--radius-md)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-softer)] p-3" role="status">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Custom settings active</p>
                      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">Your current device-specific Comfort settings will stay unchanged unless you choose a preset below.</p>
                    </div>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PRESETS.map(preset => {
                      const selected = selectedPreset === preset.id
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => onPresetChange(preset.id)}
                          disabled={busy}
                          aria-pressed={selected}
                          className={cn(
                            'min-h-[4.5rem] rounded-[var(--radius-md)] border p-3 text-left',
                            selected
                              ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)]'
                              : 'border-[var(--border-subtle)] bg-white/[0.025]'
                          )}
                        >
                          <span className="flex items-center justify-between gap-2 font-semibold"><span>{preset.label}</span>{selected && <Check className="h-4 w-4 text-[var(--theme-accent-readable)]" />}</span>
                          <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">{preset.detail}</span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
                <div className="rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-white/[0.025] p-4">
                  <div className="flex gap-3"><Bell className="mt-0.5 h-5 w-5 shrink-0 text-[var(--theme-accent-readable)]" /><div><h3 className="font-semibold">Notifications</h3><p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">The browser permission prompt appears only if you tap Turn on notifications.</p></div></div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button type="button" loading={busy} onClick={() => void onEnableNotifications()}>
                      <Bell className="mr-2 h-4 w-4" />
                      {notificationsSubscribed ? 'Notifications are on' : notificationsSupported ? 'Turn on notifications' : 'Continue without notifications'}
                    </Button>
                    <Button type="button" variant="secondary" disabled={busy} onClick={() => void onNotificationsLater()}>Not now</Button>
                  </div>
                </div>
              </section>
            )}

            {step === 'first_action' && (
              <section className="space-y-5" aria-labelledby="activation-first-action-title">
                <div>
                  <h2 id="activation-first-action-title" className="text-2xl font-semibold">Make your first move</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">Choose a real ShadowChat action. This setup finishes only after that action succeeds in its normal app surface.</p>
                </div>
                <div className="grid gap-3">
                  {FIRST_ACTIONS.map(action => {
                    const Icon = action.icon
                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void onFirstAction(action.id)}
                        className="flex min-h-[5rem] items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-white/[0.025] p-4 text-left hover:border-[var(--border-glow)] disabled:opacity-50"
                      >
                        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]"><Icon className="h-5 w-5" /></span>
                        <span className="min-w-0"><span className="block font-semibold">{action.label}</span><span className="mt-1 block text-sm leading-5 text-[var(--text-muted)]">{action.detail}</span></span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-softer)] p-3 text-sm text-[var(--text-secondary)]">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--theme-accent-readable)]" />
                  <p>Your first move is confirmed by the server after the message, DM, or heart is actually saved.</p>
                </div>
              </section>
            )}

            {error && <div className="mt-5 rounded-[var(--radius-md)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">{error}</div>}
            <button type="button" onClick={onClose} disabled={busy} className="mx-auto mt-6 flex min-h-12 items-center gap-2 px-4 text-sm text-[var(--text-muted)] disabled:opacity-50"><Sparkles className="h-4 w-4" /> Skip for now</button>
          </div>
        </main>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? content : createPortal(content, document.body)
}

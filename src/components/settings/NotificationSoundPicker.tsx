import { useEffect, useRef, useState } from 'react'
import { Check, Pause, Play, Volume2 } from 'lucide-react'
import { DMHubBottomSheet } from '../dms/hub/DMHubBottomSheet'
import { Button } from '../ui/Button'
import { useSoundEffects } from '../../hooks/useSoundEffects'
import {
  NOTIFICATION_SOUND_OPTIONS,
} from '../../features/notifications/notificationPresentationPreferences'
import type { NotificationSoundId } from '../../features/notifications/notificationEnvelopeV2'

type NotificationSoundPickerProps = {
  open: boolean
  title: string
  description: string
  value: NotificationSoundId
  onClose: () => void
  onApply: (soundId: NotificationSoundId) => Promise<boolean>
}

export function NotificationSoundPicker({
  open,
  title,
  description,
  value,
  onClose,
  onApply,
}: NotificationSoundPickerProps) {
  const { previewNotificationCue, stopNotificationCuePreview } = useSoundEffects()
  const [draft, setDraft] = useState(value)
  const [playing, setPlaying] = useState<NotificationSoundId | null>(null)
  const [saving, setSaving] = useState(false)
  const previewTimerRef = useRef<number | null>(null)

  const clearPreviewTimer = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }

  const stopPreview = () => {
    clearPreviewTimer()
    stopNotificationCuePreview()
    setPlaying(null)
  }

  useEffect(() => {
    if (!open) return
    setDraft(value)
    setSaving(false)
    return () => {
      clearPreviewTimer()
      stopNotificationCuePreview()
    }
  }, [open, stopNotificationCuePreview, value])

  const handlePreview = async (soundId: NotificationSoundId) => {
    if (playing === soundId) {
      stopPreview()
      return
    }
    stopPreview()
    const started = await previewNotificationCue(soundId)
    if (!started) return
    setPlaying(soundId)
    previewTimerRef.current = window.setTimeout(() => {
      setPlaying(null)
      previewTimerRef.current = null
    }, 1_200)
  }

  const handleClose = () => {
    if (saving) return
    stopPreview()
    onClose()
  }

  const handleApply = async () => {
    setSaving(true)
    stopPreview()
    try {
      const saved = await onApply(draft)
      if (saved) onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <DMHubBottomSheet
      open={open}
      onClose={handleClose}
      title={`${title} sound`}
      eyebrow="Notification sound"
      description={description}
      className="sm:max-w-lg"
      testId="notification-sound-picker"
    >
      <div
        role="radiogroup"
        aria-label={`${title} notification sound choices`}
        className="space-y-2"
      >
        {NOTIFICATION_SOUND_OPTIONS.map(sound => {
          const selected = sound.id === draft
          const canPreview = sound.id !== 'system_default' && sound.id !== 'silent'
          const isPlaying = playing === sound.id
          return (
            <div
              key={sound.id}
              className={`flex min-h-14 items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-[var(--dur-fast)] ${
                selected
                  ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] shadow-[0_0_0_1px_var(--theme-accent-border-soft)]'
                  : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)]'
              }`}
            >
              <label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="notification-sound"
                  value={sound.id}
                  checked={selected}
                  onChange={() => setDraft(sound.id)}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                    selected
                      ? 'border-[var(--border-glow)] bg-[var(--theme-accent)] text-[var(--theme-accent-text)]'
                      : 'border-[var(--border-subtle)] bg-[rgba(0,0,0,0.24)] text-transparent'
                  }`}
                >
                  <Check className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-[var(--text-primary)]">{sound.label}</span>
                  {(sound.id === 'system_default' || sound.id === 'silent') && (
                    <span className="mt-0.5 block text-xs leading-4 text-[var(--text-muted)]">
                      {sound.id === 'system_default'
                        ? 'Uses the sound controlled by your phone.'
                        : 'Delivers this alert without a sound.'}
                    </span>
                  )}
                </span>
              </label>
              {canPreview && (
                <button
                  type="button"
                  onClick={() => void handlePreview(sound.id)}
                  aria-label={`${isPlaying ? 'Stop' : 'Play'} ${sound.label} sample`}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.22)] text-[var(--text-gold)] transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-accent-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                >
                  {isPlaying
                    ? <Pause className="h-5 w-5" />
                    : <Play className="ml-0.5 h-5 w-5" />}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="sr-only" aria-live="polite">
        {playing
          ? `Playing ${NOTIFICATION_SOUND_OPTIONS.find(option => option.id === playing)?.label}`
          : ''}
      </p>

      <div className="sticky bottom-0 -mx-4 mt-4 flex gap-2 border-t border-[var(--border-panel)] bg-[var(--bg-panel-strong)] px-4 pb-[calc(env(safe-area-inset-bottom)_+_0.25rem)] pt-3 sm:-mx-5 sm:px-5">
        <Button
          type="button"
          variant="secondary"
          onClick={handleClose}
          disabled={saving}
          className="!min-h-11 flex-1"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => void handleApply()}
          loading={saving}
          className="!min-h-11 flex-1"
        >
          <Volume2 className="mr-2 h-4 w-4" />
          Use sound
        </Button>
      </div>
    </DMHubBottomSheet>
  )
}

import React, { useMemo, useRef } from 'react'
import { Bell, Copy, ExternalLink, Info, RotateCcw, Smartphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import { getClientPlatformInfo, type NotificationGuidance } from '../../lib/push'

const ANDROID_NOTIFICATION_TUTORIAL_SRC = '/tutorials/shadochat-notifications-android.mp4'

interface NotificationSetupModalProps {
  open: boolean
  guidance: NotificationGuidance
  guidanceText: string
  saving: boolean
  canInstall: boolean
  onClose: () => void
  onEnable: () => Promise<void>
  onInstall: () => Promise<void>
}

export const NotificationSetupModal: React.FC<NotificationSetupModalProps> = ({
  open,
  guidance,
  guidanceText,
  saving,
  canInstall,
  onClose,
  onEnable,
  onInstall,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const showAndroidTutorial = useMemo(() => getClientPlatformInfo().os === 'android', [])

  if (!open) return null

  const replayTutorial = () => {
    const video = videoRef.current
    if (!video) return

    video.currentTime = 0
    void video.play().catch(() => undefined)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(guidanceText)
      toast.success('Notification steps copied')
    } catch {
      toast.error('Could not copy the notification steps')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] px-4 backdrop-blur-md">
      <div className="popup-surface max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-[var(--radius-lg)] p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-glow)] bg-[rgba(255,255,255,0.04)] text-[var(--text-gold)]">
              <Bell className="h-5 w-5" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">
              {guidance.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {guidance.summary}
            </p>
          </div>

          <button
            onClick={onClose}
            className="popup-close rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--text-muted)]"
          >
            Close
          </button>
        </div>

        <div className={showAndroidTutorial ? 'grid gap-4 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,1fr)]' : ''}>
          {showAndroidTutorial && (
            <div className="min-w-0">
              <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-black shadow-[var(--shadow-panel)]">
                <div className="aspect-[9/16]">
                  <video
                    ref={videoRef}
                    src={ANDROID_NOTIFICATION_TUTORIAL_SRC}
                    className="h-full w-full bg-black object-cover"
                    muted
                    autoPlay
                    playsInline
                    preload="metadata"
                    controls
                    aria-label="Android notification setup video"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={replayTutorial}
                className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--text-gold)]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Replay
              </button>
            </div>
          )}

          <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <Info className="h-4 w-4 text-[var(--text-gold)]" />
              Setup Steps
            </div>
            <ol className="space-y-3 text-sm text-[var(--text-secondary)]">
              {guidance.steps.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] text-xs text-[var(--text-gold)]">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          {guidance.canRequestNow && (
            <Button onClick={() => void onEnable()} loading={saving}>
              <Bell className="mr-2 h-4 w-4" />
              Enable Notifications
            </Button>
          )}

          {guidance.requiresInstall && canInstall && (
            <Button onClick={() => void onInstall()} variant="secondary" loading={saving}>
              <Smartphone className="mr-2 h-4 w-4" />
              Install App
            </Button>
          )}

          <Button onClick={() => void handleCopy()} variant="ghost">
            <Copy className="mr-2 h-4 w-4" />
            Copy Steps
          </Button>
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-[var(--text-muted)]">
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Browsers do not allow websites to deep-link straight into OS notification settings, so Shadow Chat shows the exact platform steps and checks permission when you come back.
        </p>
      </div>
    </div>
  )
}

import React from 'react'
import { Bell, Copy, ExternalLink, Info, RefreshCw, Smartphone } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import type { NotificationGuidance } from '../../lib/push'

interface NotificationSetupModalProps {
  open: boolean
  guidance: NotificationGuidance
  guidanceText: string
  saving: boolean
  canInstall: boolean
  onClose: () => void
  onEnable: () => Promise<void>
  onRefresh: () => Promise<void>
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
  onRefresh,
  onInstall,
}) => {
  if (!open) return null

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
      <div className="popup-surface w-full max-w-xl rounded-[var(--radius-lg)] p-6">
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

          <Button onClick={() => void onRefresh()} variant="secondary" loading={saving}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Status
          </Button>

          <Button onClick={() => void handleCopy()} variant="ghost">
            <Copy className="mr-2 h-4 w-4" />
            Copy Steps
          </Button>
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-[var(--text-muted)]">
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Browsers do not allow websites to deep-link straight into OS notification settings, so Shadow Chat shows the exact platform steps and refreshes permission when you come back.
        </p>
      </div>
    </div>
  )
}

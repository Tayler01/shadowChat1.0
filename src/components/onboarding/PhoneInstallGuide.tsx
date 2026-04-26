import React, { useMemo, useState } from 'react'
import {
  CheckCircle2,
  Compass,
  Download,
  MoreVertical,
  Plus,
  Share2,
  Smartphone,
  X,
} from 'lucide-react'
import { Button } from '../ui/Button'

type PhonePlatform = 'ios' | 'android'

interface PhoneInstallGuideProps {
  open: boolean
  canInstall: boolean
  onClose: () => void
  onComplete: () => void
  onInstall: () => Promise<'accepted' | 'dismissed' | null>
}

const isLikelyIos = () => {
  if (typeof navigator === 'undefined') {
    return false
  }

  const platform = navigator.platform || ''
  const userAgent = navigator.userAgent || ''

  return (
    /iPad|iPhone|iPod/i.test(userAgent) ||
    (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

const getDefaultPlatform = (): PhonePlatform => {
  if (typeof navigator === 'undefined') {
    return 'ios'
  }

  return /Android/i.test(navigator.userAgent || '') ? 'android' : isLikelyIos() ? 'ios' : 'ios'
}

export function PhoneInstallGuide({
  open,
  canInstall,
  onClose,
  onComplete,
  onInstall,
}: PhoneInstallGuideProps) {
  const [platform, setPlatform] = useState<PhonePlatform>(() => getDefaultPlatform())
  const androidCanPrompt = platform === 'android' && canInstall

  const steps = useMemo(() => {
    if (platform === 'ios') {
      return [
        { icon: Compass, title: 'Use Safari', detail: 'Open Shadow Chat in Safari on your iPhone.' },
        { icon: Share2, title: 'Tap Share', detail: 'Look for the square with the arrow at the bottom.' },
        { icon: Plus, title: 'Add to Home Screen', detail: 'Scroll the sheet if you do not see it right away.' },
        { icon: CheckCircle2, title: 'Tap Add', detail: 'Open Shadow Chat from the new Home Screen icon.' },
      ]
    }

    if (androidCanPrompt) {
      return [
        { icon: Download, title: 'Tap Install now', detail: 'Chrome will show the app install sheet.' },
        { icon: CheckCircle2, title: 'Confirm Install', detail: 'Use the installed Shadow Chat icon after it appears.' },
      ]
    }

    return [
      { icon: Compass, title: 'Use Chrome', detail: 'Open Shadow Chat in Chrome on your Android phone.' },
      { icon: MoreVertical, title: 'Open the menu', detail: 'Tap the three dots near the address bar.' },
      { icon: Plus, title: 'Install app', detail: 'Choose Install app or Add to Home screen.' },
      { icon: CheckCircle2, title: 'Confirm Install', detail: 'Use the installed Shadow Chat icon after it appears.' },
    ]
  }, [androidCanPrompt, platform])

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(4,5,6,0.72)] p-3 backdrop-blur-md sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-install-guide-title"
        className="popup-surface flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="p-5 pb-0 sm:p-6 sm:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
                <Smartphone className="h-3.5 w-3.5" />
                Phone setup
              </div>
              <h2 id="phone-install-guide-title" className="text-2xl font-semibold leading-tight text-[var(--text-primary)]">
                Add Shadow Chat to your phone
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                Put it on the Home Screen now so it opens like an app every time.
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="popup-close flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
              aria-label="Close phone setup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-1">
            {[
              ['ios', 'iPhone'],
              ['android', 'Android'],
            ].map(([value, label]) => {
              const selected = platform === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPlatform(value as PhonePlatform)}
                  aria-pressed={selected}
                  className={`rounded-[var(--radius-sm)] px-3 py-2.5 text-sm font-medium transition-colors ${
                    selected
                      ? 'border border-[var(--border-glow)] bg-[rgba(215,170,70,0.12)] text-[var(--text-gold)]'
                      : 'border border-transparent text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5 overflow-y-auto px-5 sm:px-6">
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3.5"
              >
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]">
                  <step.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
                    {step.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {platform === 'ios' && (
            <p className="my-4 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.07)] p-3 text-sm leading-5 text-[var(--text-secondary)]">
              iPhone install must be done from Safari. Chrome and Edge on iPhone cannot show the install button.
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-3 border-t border-[var(--border-subtle)] bg-[rgba(10,11,12,0.82)] p-5 sm:grid-cols-2 sm:p-6">
          {androidCanPrompt ? (
            <Button onClick={() => void onInstall()} className="w-full justify-center">
              <Download className="mr-3 h-4 w-4" />
              Install Now
            </Button>
          ) : (
            <Button onClick={onComplete} className="w-full justify-center">
              <CheckCircle2 className="mr-3 h-4 w-4" />
              I Added It
            </Button>
          )}
          <Button onClick={onClose} variant="secondary" className="w-full justify-center">
            Skip for Now
          </Button>
        </div>
      </div>
    </div>
  )
}

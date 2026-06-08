import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bell,
  CheckCircle2,
  Compass,
  Download,
  MoreVertical,
  Plus,
  Share2,
  Smartphone,
} from 'lucide-react'
import { Button } from '../ui/Button'

type PhonePlatform = 'ios' | 'android'

type SetupStep = {
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
}

interface PhoneInstallGuideProps {
  open: boolean
  canInstall: boolean
  onClose: () => void
  onComplete: () => void
  onInstall: () => Promise<'accepted' | 'dismissed' | null>
}

const SHADOCHAT_URL = 'https://shadochat.online'

const tutorialVideos: Record<PhonePlatform, { label: string; src: string }> = {
  ios: {
    label: 'Phone setup video',
    src: '/tutorials/shadochat-setup-android.mp4',
  },
  android: {
    label: 'Android setup video',
    src: '/tutorials/shadochat-setup-android.mp4',
  },
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
  const [videoUnavailable, setVideoUnavailable] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const androidCanPrompt = platform === 'android' && canInstall
  const tutorial = tutorialVideos[platform]

  useEffect(() => {
    setVideoUnavailable(false)
  }, [platform])

  useEffect(() => {
    if (!open) return

    const video = videoRef.current
    if (!video) return

    video.currentTime = 0
    void video.play().catch(() => {
      // Muted autoplay can still be blocked in some embedded browser modes.
    })
  }, [open, platform])

  const steps = useMemo<SetupStep[]>(() => {
    if (platform === 'ios') {
      return [
        { icon: Compass, title: 'Open Safari', detail: `Go to ${SHADOCHAT_URL} in Safari on your iPhone.` },
        { icon: Share2, title: 'Tap Share', detail: 'Use the Share button in the Safari toolbar.' },
        { icon: Plus, title: 'Add to Home Screen', detail: 'Choose Add to Home Screen, keep Open as Web App on, then tap Add.' },
        { icon: Smartphone, title: 'Open the app icon', detail: 'Launch Shadow Chat from the new Home Screen icon before enabling notifications.' },
        { icon: Bell, title: 'Enable notifications', detail: 'In Shadow Chat, open Settings > Notifications & Audio, then tap Enable Notifications and allow the prompt.' },
      ]
    }

    if (androidCanPrompt) {
      return [
        { icon: Download, title: 'Tap Install Now', detail: 'Chrome will show the Shadow Chat install sheet.' },
        { icon: CheckCircle2, title: 'Confirm Install', detail: 'Use the installed Shadow Chat icon after it appears.' },
        { icon: Bell, title: 'Enable notifications', detail: 'Open Settings > Notifications & Audio, then tap Enable Notifications and allow the browser prompt.' },
      ]
    }

    return [
      { icon: Compass, title: 'Open Chrome', detail: `Go to ${SHADOCHAT_URL} in Chrome on your Android phone.` },
      { icon: MoreVertical, title: 'Open the menu', detail: 'Tap the three dots near the address bar.' },
      { icon: Plus, title: 'Install app', detail: 'Choose Add to Home screen or Install app, then follow the on-screen steps.' },
      { icon: Smartphone, title: 'Open the app icon', detail: 'Launch Shadow Chat from your Home Screen or app launcher.' },
      { icon: Bell, title: 'Enable notifications', detail: 'In Shadow Chat, open Settings > Notifications & Audio, then allow notifications when prompted.' },
    ]
  }, [androidCanPrompt, platform])

  if (!open) {
    return null
  }

  const renderStepCards = () => (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
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

      {platform === 'ios' ? (
        <p className="mt-3 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.07)] p-3 text-sm leading-5 text-[var(--text-secondary)]">
          iPhone setup must be done from Safari. If Add to Home Screen is hidden, scroll to the bottom of the Share sheet and edit actions to add it.
        </p>
      ) : (
        <p className="mt-3 rounded-[var(--radius-md)] border border-[rgba(215,170,70,0.16)] bg-[rgba(215,170,70,0.07)] p-3 text-sm leading-5 text-[var(--text-secondary)]">
          Android may say Add to Home screen or Install app. Notifications are requested after the app is installed and opened.
        </p>
      )}
    </>
  )

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center bg-[rgba(4,5,6,0.72)] p-0 backdrop-blur-md sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-install-guide-title"
        className="popup-surface flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-none sm:h-auto sm:max-h-[calc(100dvh-3rem)] sm:rounded-[var(--radius-lg)]"
      >
        <div className="shrink-0 p-4 pb-0 sm:p-6 sm:pb-0">
          <div className="min-w-0 text-center">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-gold)] sm:mb-3 sm:text-[11px]">
              <Smartphone className="h-3.5 w-3.5" />
              Phone setup
            </div>
            <h2 id="phone-install-guide-title" className="text-xl font-semibold leading-tight text-[var(--text-primary)] sm:text-2xl">
              Add Shadow Chat and turn on alerts
            </h2>
            <p className="mx-auto mt-1.5 max-w-lg text-xs leading-5 text-[var(--text-secondary)] sm:mt-2 sm:text-sm sm:leading-6">
              Install the web app first, open it from your Home Screen, then enable notifications from inside Shadow Chat.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-1 sm:mt-5">
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
                  className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm font-medium transition-colors sm:py-2.5 ${
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

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pt-3 sm:px-6 sm:pt-5">
          <div
            data-testid="phone-install-video-stage"
            className="flex min-h-0 flex-1 items-center justify-center"
          >
            <div className="aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden rounded-[calc(var(--radius-lg)+4px)] border border-[var(--border-glow)] bg-[linear-gradient(180deg,rgba(215,170,70,0.34),rgba(215,170,70,0.08))] p-1 shadow-[0_18px_46px_rgba(0,0,0,0.38),0_0_32px_rgba(215,170,70,0.12)]">
              <div className="h-full overflow-hidden rounded-[var(--radius-lg)] bg-black">
                <div className="relative h-full">
                  {!videoUnavailable ? (
                    <video
                      key={platform}
                      ref={videoRef}
                      src={tutorial.src}
                      className="pointer-events-none h-full w-full bg-black object-cover"
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="auto"
                      aria-label={tutorial.label}
                      onContextMenu={event => event.preventDefault()}
                      onError={() => setVideoUnavailable(true)}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,rgba(215,170,70,0.16),rgba(5,6,7,0.95)_44%,#000)] p-6 text-center">
                      <Smartphone className="h-10 w-10 text-[var(--text-gold)]" />
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Video preview is unavailable.</p>
                      <p className="text-xs leading-5 text-[var(--text-muted)]">Use the setup steps below.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <details className="shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3 sm:hidden">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">
              Setup steps
            </summary>
            <div
              data-testid="phone-install-scroll-details"
              className="mt-3 max-h-[24dvh] overflow-y-auto pr-1"
            >
              {renderStepCards()}
            </div>
          </details>

          <div
            data-testid="phone-install-scroll-details-desktop"
            className="hidden shrink-0 max-h-[28dvh] overflow-y-auto pr-1 sm:block"
          >
            {renderStepCards()}
          </div>
        </div>

        <div className="mt-3 grid shrink-0 gap-3 border-t border-[var(--border-subtle)] bg-[rgba(10,11,12,0.82)] p-4 sm:grid-cols-2 sm:p-6">
          {androidCanPrompt ? (
            <Button onClick={() => void onInstall()} className="w-full justify-center">
              <Download className="mr-3 h-4 w-4" />
              Install Now
            </Button>
          ) : (
            <Button onClick={onComplete} className="w-full justify-center">
              <CheckCircle2 className="mr-3 h-4 w-4" />
              I Finished Setup
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

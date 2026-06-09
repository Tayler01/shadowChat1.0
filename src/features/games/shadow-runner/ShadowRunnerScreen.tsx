import React from 'react'
import { ArrowLeft, Volume2, VolumeX } from 'lucide-react'
import { SHADOW_RUNNER_ASSETS } from './assets/manifest'

interface ShadowRunnerScreenProps {
  onExit?: () => void
  musicPlaying?: boolean
  audioBlocked?: boolean
  onToggleMusic?: () => void
}

type WebAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

type OrientationWindow = Window & typeof globalThis & {
  orientation?: number
}

const MENU_BUTTONS = [
  { id: 'start', label: 'Start', left: '12.2%', width: '21.6%' },
  { id: 'levels', label: 'Levels', left: '39%', width: '21.8%' },
  { id: 'options', label: 'Options', left: '65.8%', width: '21.6%' },
] as const

const STAR_OVERLAYS = [
  { left: '17.5%', top: '6.5%', size: '1rem', position: '0% 0%', delay: '0s' },
  { left: '20%', top: '15%', size: '0.82rem', position: '33.333% 0%', delay: '0.65s' },
  { left: '23.5%', top: '23%', size: '0.74rem', position: '100% 50%', delay: '2.15s' },
  { left: '27.5%', top: '6%', size: '1.15rem', position: '66.666% 0%', delay: '1.25s' },
  { left: '30.5%', top: '18%', size: '1rem', position: '100% 0%', delay: '1.85s' },
  { left: '34%', top: '11%', size: '0.86rem', position: '0% 50%', delay: '0.35s' },
  { left: '36.5%', top: '24%', size: '0.78rem', position: '33.333% 50%', delay: '2.45s' },
  { left: '42%', top: '13%', size: '1.08rem', position: '66.666% 0%', delay: '1.5s' },
  { left: '53%', top: '6%', size: '0.72rem', position: '100% 50%', delay: '2.8s' },
  { left: '62%', top: '9%', size: '1.25rem', position: '100% 0%', delay: '0.35s' },
  { left: '69%', top: '18%', size: '0.86rem', position: '0% 0%', delay: '2.2s' },
  { left: '75%', top: '18%', size: '1.15rem', position: '0% 50%', delay: '1.1s' },
  { left: '81%', top: '8%', size: '0.8rem', position: '66.666% 50%', delay: '2.6s' },
  { left: '86%', top: '12%', size: '0.9rem', position: '33.333% 50%', delay: '1.8s' },
  { left: '91%', top: '21%', size: '0.72rem', position: '100% 0%', delay: '3s' },
] as const

const SHADOW_RUNNER_STAGE_STYLE = {
  width: 'min(100vw, calc(100dvh * 1.777))',
  height: 'min(100dvh, calc(100vw / 1.777))',
} as React.CSSProperties

const SHADOW_RUNNER_MENU_STYLE = {
  aspectRatio: '1792 / 462',
} as React.CSSProperties

const SHADOW_RUNNER_IMAGE_SOURCES = [
  SHADOW_RUNNER_ASSETS.home.background,
  SHADOW_RUNNER_ASSETS.home.titleScroll,
  SHADOW_RUNNER_ASSETS.home.bottomMenuScroll,
  SHADOW_RUNNER_ASSETS.home.missionScrollStand,
  SHADOW_RUNNER_ASSETS.home.starSheet,
  SHADOW_RUNNER_ASSETS.home.torchStrip,
  SHADOW_RUNNER_ASSETS.home.bannerStand,
  SHADOW_RUNNER_ASSETS.home.bannerPennant,
  SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip,
] as const

const SHADOW_RUNNER_INLINE_STYLES = `
  @keyframes shadow-runner-star-shimmer {
    0%, 100% { opacity: 0.45; transform: scale(0.82) rotate(0deg); filter: brightness(1.15) drop-shadow(0 0 2px rgba(240,211,129,0.25)); }
    45% { opacity: 1; transform: scale(1.28) rotate(6deg); filter: brightness(1.65) drop-shadow(0 0 16px rgba(255,228,145,0.95)); }
  }

  @keyframes shadow-runner-float {
    0%, 100% { transform: translate3d(0, 0, 0); }
    50% { transform: translate3d(0, -5px, 0); }
  }

  .shadow-runner-star {
    animation: shadow-runner-star-shimmer 2.7s ease-in-out infinite;
  }

  .shadow-runner-float {
    animation: shadow-runner-float 4.8s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .shadow-runner-star,
    .shadow-runner-float {
      animation: none;
    }
  }
`

function isLandscapeViewport() {
  const viewport = window.visualViewport
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  const orientation = window.screen.orientation
  const legacyOrientation = (window as OrientationWindow).orientation

  return width > height
    || Math.abs(orientation?.angle ?? 0) === 90
    || Math.abs(legacyOrientation ?? 0) === 90
}

function useSpriteFrame(frameCount: number, intervalMs: number) {
  const [frame, setFrame] = React.useState(0)

  React.useEffect(() => {
    if (frameCount <= 1) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const interval = window.setInterval(() => {
      setFrame(current => (current + 1) % frameCount)
    }, intervalMs)

    return () => window.clearInterval(interval)
  }, [frameCount, intervalMs])

  return frame
}

function useRotateGate() {
  const [showRotateGate, setShowRotateGate] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return !isLandscapeViewport()
  })

  React.useEffect(() => {
    const updateGate = () => setShowRotateGate(!isLandscapeViewport())
    const viewport = window.visualViewport
    const orientation = window.screen.orientation

    updateGate()
    window.addEventListener('resize', updateGate)
    window.addEventListener('orientationchange', updateGate)
    viewport?.addEventListener('resize', updateGate)
    orientation?.addEventListener('change', updateGate)

    return () => {
      window.removeEventListener('resize', updateGate)
      window.removeEventListener('orientationchange', updateGate)
      viewport?.removeEventListener('resize', updateGate)
      orientation?.removeEventListener('change', updateGate)
    }
  }, [])

  return showRotateGate
}

function useImagePreload(sources: readonly string[]) {
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    let remaining = sources.length

    if (remaining === 0) {
      setReady(true)
      return
    }

    setReady(false)
    sources.forEach(source => {
      const image = new Image()
      const settle = () => {
        remaining -= 1
        if (!cancelled && remaining <= 0) {
          setReady(true)
        }
      }

      image.onload = settle
      image.onerror = settle
      image.decoding = 'async'
      image.src = source
    })

    return () => {
      cancelled = true
    }
  }, [sources])

  return ready
}

function spriteStripStyle(source: string, frame: number, frameCount: number): React.CSSProperties {
  const position = frameCount > 1 ? `${(frame / (frameCount - 1)) * 100}% 0%` : '0% 0%'

  return {
    backgroundImage: `url(${source})`,
    backgroundPosition: position,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${frameCount * 100}% 100%`,
    imageRendering: 'pixelated',
  }
}

export function ShadowRunnerScreen({
  onExit,
  musicPlaying = false,
  audioBlocked = false,
  onToggleMusic,
}: ShadowRunnerScreenProps) {
  const heroFrame = useSpriteFrame(8, 150)
  const torchFrame = useSpriteFrame(8, 105)
  const orientationGateActive = useRotateGate()
  const [forceStage, setForceStage] = React.useState(false)
  const assetsReady = useImagePreload(SHADOW_RUNNER_IMAGE_SOURCES)
  const showRotateGate = orientationGateActive && !forceStage
  const audioContextRef = React.useRef<AudioContext | null>(null)

  React.useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close()
      }
    }
  }, [])

  const playButtonChime = React.useCallback(() => {
    const AudioContextCtor = window.AudioContext ?? (window as WebAudioWindow).webkitAudioContext
    if (!AudioContextCtor) return

    const context = audioContextRef.current ?? new AudioContextCtor()
    audioContextRef.current = context

    if (context.state === 'suspended') {
      void context.resume()
    }

    const now = context.currentTime
    const notes = [523.25, 659.25, 783.99]

    notes.forEach((frequency, index) => {
      const start = now + index * 0.045
      const oscillator = context.createOscillator()
      const gain = context.createGain()

      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.09, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18)

      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.2)
    })
  }, [])

  return (
    <section className="relative h-full min-h-[100dvh] w-full overflow-hidden bg-[#02040a] text-[#f6e6bb]">
      <style>{SHADOW_RUNNER_INLINE_STYLES}</style>

      <div className={`${showRotateGate ? 'flex' : 'hidden'} shadow-runner-rotate-gate absolute inset-0 z-50 flex-col items-center justify-center bg-black px-8 text-center`}>
        <p className="text-2xl font-black uppercase tracking-[0.18em] text-[#f0d381]">Rotate Phone</p>
        <p className="mt-3 max-w-xs text-sm font-semibold uppercase tracking-[0.12em] text-[#d9c79f]">
          Shadow Runner plays sideways.
        </p>
        <button
          type="button"
          onClick={() => setForceStage(true)}
          className="mt-6 rounded-full border border-[#f0d381]/45 bg-[#2c2110]/70 px-5 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#f0d381] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          Continue
        </button>
      </div>

      <div className={`${showRotateGate ? 'hidden' : 'flex'} shadow-runner-landscape-stage absolute inset-0 items-center justify-center bg-black`}>
      {!assetsReady && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black px-6 text-center">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[#f0d381]">Loading</p>
        </div>
      )}

      <div
        className={`shadow-runner-playfield relative overflow-hidden transition-opacity duration-300 ${assetsReady ? 'opacity-100' : 'opacity-0'}`}
        style={SHADOW_RUNNER_STAGE_STYLE}
      >
      <img
        src={SHADOW_RUNNER_ASSETS.home.background}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_26%_24%,rgba(246,215,132,0.12),transparent_18%),linear-gradient(180deg,rgba(2,4,10,0.12),rgba(2,4,10,0.18)_48%,rgba(2,4,10,0.62))]" />

      {STAR_OVERLAYS.map(star => (
        <span
          key={`${star.left}-${star.top}`}
          aria-hidden="true"
          className="shadow-runner-star pointer-events-none absolute z-[2] block bg-no-repeat"
          style={{
            left: star.left,
            top: star.top,
            width: star.size,
            height: star.size,
            backgroundImage: `url(${SHADOW_RUNNER_ASSETS.home.starSheet})`,
            backgroundPosition: star.position,
            backgroundSize: '400% 300%',
            animationDelay: star.delay,
            imageRendering: 'pixelated',
          }}
        />
      ))}

      <img
        src={SHADOW_RUNNER_ASSETS.home.bannerStand}
        alt=""
        className="pointer-events-none absolute bottom-[22.5%] left-[8%] z-[3] w-[7.2%]"
        draggable={false}
      />
      <img
        src={SHADOW_RUNNER_ASSETS.home.bannerPennant}
        alt=""
        className="pointer-events-none absolute right-[3.5%] top-[6.5%] z-[3] w-[6%]"
        draggable={false}
      />

      <button
        type="button"
        aria-label="Back to Entertainment"
        onClick={onExit}
        className="absolute left-[3%] top-[4%] z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e8c46b]/40 bg-black/45 text-[#f3d88d] shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-[#f0d381]/70 hover:bg-[#2c2110]/75 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <button
        type="button"
        aria-label={musicPlaying ? 'Pause Castle Bard music' : 'Play Castle Bard music'}
        onClick={onToggleMusic}
        className="absolute right-[3%] top-[4%] z-20 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full border border-[#e8c46b]/40 bg-black/45 px-3 text-[#f3d88d] shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-[#f0d381]/70 hover:bg-[#2c2110]/75 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
      >
        {musicPlaying ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        {audioBlocked && <span className="hidden text-xs font-semibold sm:inline">Tap</span>}
      </button>

      <img
        src={SHADOW_RUNNER_ASSETS.home.titleScroll}
        alt="Shadow Runner"
        className="pointer-events-none absolute left-[29%] top-[4%] z-[5] w-[42%] drop-shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
        draggable={false}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[22.5%] left-[37%] z-[6] aspect-square w-[18%] drop-shadow-[0_28px_40px_rgba(0,0,0,0.72)]"
        style={{
          ...spriteStripStyle(SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip, heroFrame, 8),
        }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[23%] left-[17%] z-[4] aspect-square w-[7.2%] drop-shadow-[0_0_32px_rgba(238,143,34,0.5)]"
        style={{
          ...spriteStripStyle(SHADOW_RUNNER_ASSETS.home.torchStrip, torchFrame, 8),
        }}
      />

      <img
        src={SHADOW_RUNNER_ASSETS.home.missionScrollStand}
        alt=""
        className="shadow-runner-float pointer-events-none absolute bottom-[23%] left-[74%] z-[4] w-[6.4%] drop-shadow-[0_20px_35px_rgba(0,0,0,0.55)]"
        draggable={false}
      />

      <div
        className="absolute bottom-[4%] left-1/2 z-10 w-[48%] -translate-x-1/2"
        style={SHADOW_RUNNER_MENU_STYLE}
      >
        <img
          src={SHADOW_RUNNER_ASSETS.home.bottomMenuScroll}
          alt=""
          className="pointer-events-none h-full w-full select-none object-contain drop-shadow-[0_20px_45px_rgba(0,0,0,0.7)]"
          draggable={false}
        />
        {MENU_BUTTONS.map(button => (
          <button
            key={button.id}
            type="button"
            aria-label={`${button.label} button`}
            onClick={playButtonChime}
            className="absolute top-[21%] h-[58%] rounded-[0.45rem] border border-transparent bg-transparent transition hover:border-[#f0d381]/45 hover:bg-[#f0d381]/10 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/65 active:bg-[#f0d381]/20"
            style={{ left: button.left, width: button.width }}
          >
            <span className="sr-only">{button.label}</span>
          </button>
        ))}
      </div>
      </div>
      </div>
    </section>
  )
}

import circuitPickerBanner from './shadow-circuit/assets/branding/picker-banner.webp'
import { enterCircuitLandscape, leaveCircuitLandscape } from './shadow-circuit/ui/landscape'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Film, Gamepad2, Volume2, VolumeX } from 'lucide-react'
import { motion } from 'framer-motion'
import { createGameSoundtrackController, type GameSoundtrackController } from './gameSoundtrack'
import { ShadowWarScreen } from './shadow-war/ShadowWarScreen'
import { SHADOW_WAR_ASSETS } from './shadow-war/assets/manifest'
import { ShadowCheckersExperience } from './shadow-checkers/ShadowCheckersExperience'
import { SHADOW_CHECKERS_ASSETS } from './shadow-checkers/assets/manifest'
import { ShadowRunnerScreen } from './shadow-runner/ShadowRunnerScreen'
import { SHADOW_RUNNER_ASSETS } from './shadow-runner/assets/manifest'
import {
  SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY,
  readShadowRunnerAudioPreference,
} from './shadow-runner/audio'
import { ShadoTvScreen } from '../entertainment/shado-tv/ShadoTvScreen'
import { SHADO_TV_ASSETS } from '../entertainment/shado-tv/assets/manifest'
import { ShadowMysteryScreen } from '../entertainment/shadow-mystery/ShadowMysteryScreen'
import { SHADOW_MYSTERY_ASSETS } from '../entertainment/shadow-mystery/assets/manifest'
import { WillKirkScreen } from '../entertainment/will-kirk/WillKirkScreen'
import { WILL_KIRK_ASSETS } from '../entertainment/will-kirk/assets/manifest'
import { SHADO_LIVE_ASSETS } from '../entertainment/shado-live/assets/manifest'
import { SHADO_LIVE_PROTOTYPE_ENABLED, SHADO_LIVE_REAL_ENABLED, SHADOW_CIRCUIT_ENABLED } from '../../config/featureFlags'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import { useAppBadgeState } from '../../hooks/useAppBadgeState'
import { useComfortPreferences } from '../../hooks/useComfortPreferences'
import type { AppView } from '../../types/navigation'
import type { PlayExperience, PlayRouteAction } from '../../lib/appRouting'

interface GamesHomeProps {
  currentView: AppView
  onViewChange: (view: AppView) => void
  onImmersiveChange?: (immersive: boolean) => void
  initialExperience?: PlayExperience
  initialItem?: string
  onPlayRoute?: (action: PlayRouteAction, experience?: PlayExperience, item?: string) => void
}

type SelectedEntertainment = PlayExperience | null

const LazyShadowCircuit = SHADOW_CIRCUIT_ENABLED
  ? lazy(() => import('./shadow-circuit/ShadowCircuitScreen').then(module => ({ default: module.ShadowCircuitScreen })))
  : null

const LazyShadoLivePrototype = SHADO_LIVE_PROTOTYPE_ENABLED
  ? lazy(() => import('../entertainment/shado-live/ShadoLivePrototype').then(module => ({ default: module.ShadoLivePrototype })))
  : null

const LazyShadoLiveExperience = SHADO_LIVE_REAL_ENABLED
  ? lazy(() => import('../entertainment/shado-live/real').then(module => ({ default: module.ShadoLiveExperience })))
  : null

const SHADO_LIVE_ENABLED = SHADO_LIVE_REAL_ENABLED || SHADO_LIVE_PROTOTYPE_ENABLED

type ShadowRunnerOrientationLock =
  | 'any'
  | 'natural'
  | 'landscape'
  | 'portrait'
  | 'portrait-primary'
  | 'portrait-secondary'
  | 'landscape-primary'
  | 'landscape-secondary'

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: ShadowRunnerOrientationLock) => Promise<void>
  unlock?: () => void
}

function getLockableScreenOrientation() {
  if (typeof window === 'undefined') return

  return window.screen.orientation as LockableScreenOrientation | undefined
}

function readLocalPreviewEntertainment(): SelectedEntertainment {
  if (typeof window === 'undefined') return null

  const host = window.location.hostname
  const isLocalHost = host === '127.0.0.1' || host === 'localhost'
  if (!isLocalHost) return null

  const localPreview = new URLSearchParams(window.location.search).get('localPreview')
  if (localPreview === 'shadow-runner' || localPreview === 'shado-tv' || localPreview === 'shadow-mystery' || (SHADO_LIVE_ENABLED && localPreview === 'shado-live') || (SHADOW_CIRCUIT_ENABLED && localPreview === 'shadow-circuit')) {
    return localPreview
  }

  return null
}

async function requestShadowRunnerLandscapeMode() {
  if (typeof window === 'undefined') return

  try {
    if (!document.fullscreenElement && typeof document.documentElement.requestFullscreen === 'function') {
      await document.documentElement.requestFullscreen()
    }
  } catch {
    // Fullscreen is a best-effort Android browser assist; installed PWAs can still use orientation lock directly.
  }

  try {
    const orientation = getLockableScreenOrientation()
    if (typeof orientation?.lock !== 'function') return

    await orientation.lock('landscape')
  } catch {
    // Unsupported browsers fall back to the in-game rotate gate.
  }
}

function releaseShadowRunnerLandscapeMode() {
  if (typeof window === 'undefined') return

  try {
    getLockableScreenOrientation()?.unlock?.()
  } catch {
    // Unlock is best-effort; the portrait manifest remains the app-wide fallback.
  }

  try {
    if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => undefined)
    }
  } catch {
    // Exiting fullscreen is best-effort.
  }
}

function ExperienceUnreadBadge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span
      className="absolute right-3 top-3 z-20 inline-flex min-h-7 min-w-7 items-center justify-center rounded-full border border-[#f4d985]/65 bg-[#171108]/92 px-2 text-xs font-bold text-[#f4d985] shadow-[0_8px_24px_rgba(0,0,0,0.55)] backdrop-blur-sm"
      aria-label={`${count} unread ${label} ${count === 1 ? 'update' : 'updates'}`}
      data-testid={`play-unread-${label}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export function GamesHome({
  currentView,
  onViewChange,
  onImmersiveChange,
  initialExperience,
  initialItem,
  onPlayRoute,
}: GamesHomeProps) {
  const badgeState = useAppBadgeState()
  const { effectivePreferences, updatePreferences } = useComfortPreferences()
  const [selectedEntertainment, setSelectedEntertainment] = useState<SelectedEntertainment>(() => (
    initialExperience ?? readLocalPreviewEntertainment()
  ))
  const [musicPlaying, setMusicPlaying] = useState(false)
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [masterSoundEnabled, setMasterSoundEnabled] = useState(true)
  const soundtrackRef = useRef<GameSoundtrackController | null>(null)
  const currentMusicSourceRef = useRef<string | null>(null)
  const musicRequestedRef = useRef(false)
  const musicRequestIdRef = useRef(0)

  const getSoundtrack = useCallback(() => {
    soundtrackRef.current ??= createGameSoundtrackController(0.42)
    return soundtrackRef.current
  }, [])

  const playMusic = useCallback(async (source?: string) => {
    if (!source) return

    const requestId = ++musicRequestIdRef.current
    musicRequestedRef.current = true
    currentMusicSourceRef.current = source
    setMusicPlaying(false)
    setAudioBlocked(false)

    if (typeof document !== 'undefined' && document.hidden) {
      setMusicPlaying(false)
      setAudioBlocked(false)
      return
    }

    const soundtrack = getSoundtrack()
    soundtrack.setVolume(source === SHADOW_CHECKERS_ASSETS.music ? 0.11 : 0.42)
    const played = await soundtrack.play(source)
    if (requestId !== musicRequestIdRef.current || !musicRequestedRef.current) return

    setMusicPlaying(played)
    setAudioBlocked(!played)
  }, [getSoundtrack])

  const pauseMusic = useCallback((options: { closeContext?: boolean } = {}) => {
    musicRequestIdRef.current += 1
    musicRequestedRef.current = false
    currentMusicSourceRef.current = null
    soundtrackRef.current?.stop(options)
    setMusicPlaying(false)
    setAudioBlocked(false)
  }, [])

  const stopMusicForBackground = useCallback(() => {
    musicRequestIdRef.current += 1
    soundtrackRef.current?.stop({ closeContext: true })
    setMusicPlaying(false)
    setAudioBlocked(false)
  }, [])

  const openExperience = (experience: PlayExperience) => {
    setSelectedEntertainment(experience)
    onPlayRoute?.('push-experience', experience)
    onImmersiveChange?.(true)
  }

  const closeExperience = (experience: PlayExperience) => {
    if(experience==='shadow-circuit')leaveCircuitLandscape()
    setSelectedEntertainment(null)
    onPlayRoute?.('close-experience', experience)
    onImmersiveChange?.(false)
  }

  const enterShadowWar = () => {
    void playMusic(SHADOW_WAR_ASSETS.music)
    openExperience('shadow-war')
  }

  const exitShadowWar = () => {
    pauseMusic()
    setAudioBlocked(false)
    closeExperience('shadow-war')
  }

  const enterShadowCheckers = () => {
    if (effectivePreferences.gameMusic && masterSoundEnabled) void playMusic(SHADOW_CHECKERS_ASSETS.music)
    setAudioBlocked(false)
    openExperience('shadow-checkers')
  }

  const exitShadowCheckers = () => {
    pauseMusic()
    setAudioBlocked(false)
    closeExperience('shadow-checkers')
  }

  const enterShadowRunner = () => {
    void requestShadowRunnerLandscapeMode()

    if (readShadowRunnerAudioPreference(SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY, true)) {
      void playMusic(SHADOW_RUNNER_ASSETS.music)
    } else {
      pauseMusic()
    }
    setAudioBlocked(false)
    openExperience('shadow-runner')
  }

  const exitShadowRunner = () => {
    releaseShadowRunnerLandscapeMode()
    pauseMusic()
    setAudioBlocked(false)
    closeExperience('shadow-runner')
  }

  const enterShadoTv = () => {
    pauseMusic()
    setAudioBlocked(false)
    openExperience('shado-tv')
  }

  const exitShadoTv = () => {
    setAudioBlocked(false)
    closeExperience('shado-tv')
  }

  const enterShadowMystery = () => {
    pauseMusic()
    setAudioBlocked(false)
    openExperience('shadow-mystery')
  }

  const exitShadowMystery = () => {
    setAudioBlocked(false)
    closeExperience('shadow-mystery')
  }

  const enterWillKirk = () => {
    pauseMusic()
    setAudioBlocked(false)
    openExperience('will-kirk')
  }

  const exitWillKirk = () => {
    setAudioBlocked(false)
    closeExperience('will-kirk')
  }

  const enterShadoLive = () => {
    pauseMusic()
    setAudioBlocked(false)
    openExperience('shado-live')
  }

  const exitShadoLive = () => {
    setAudioBlocked(false)
    closeExperience('shado-live')
  }

  const toggleMusic = () => {
    if (selectedEntertainment === 'shadow-checkers') {
      if (!effectivePreferences.gameMusic) {
        updatePreferences({ gameMusic: true })
        if (masterSoundEnabled) void playMusic(SHADOW_CHECKERS_ASSETS.music)
      } else if (audioBlocked) {
        if (masterSoundEnabled) void playMusic(SHADOW_CHECKERS_ASSETS.music)
      } else {
        updatePreferences({ gameMusic: false })
        pauseMusic()
      }
      return
    }
    if (musicPlaying) {
      pauseMusic()
      return
    }
    const source = selectedEntertainment === 'shadow-runner'
      ? SHADOW_RUNNER_ASSETS.music
      : SHADOW_WAR_ASSETS.music
    void playMusic(source)
  }

  const toggleMasterSound = () => {
    if (masterSoundEnabled) pauseMusic()
    else if (effectivePreferences.gameMusic) void playMusic(SHADOW_CHECKERS_ASSETS.music)
    setMasterSoundEnabled(!masterSoundEnabled)
  }

  const playShadowRunnerMusic = useCallback(() => {
    void playMusic(SHADOW_RUNNER_ASSETS.music)
  }, [playMusic])

  useEffect(() => {
    onImmersiveChange?.(selectedEntertainment !== null)
  }, [onImmersiveChange, selectedEntertainment])

  useEffect(() => {
    setSelectedEntertainment(initialExperience ?? readLocalPreviewEntertainment())
  }, [initialExperience])

  useEffect(() => {
    if (selectedEntertainment !== 'shadow-checkers') return
    if (!masterSoundEnabled || !effectivePreferences.gameMusic) {
      if (musicRequestedRef.current) pauseMusic()
    } else if (!musicRequestedRef.current) {
      void playMusic(SHADOW_CHECKERS_ASSETS.music)
    }
  }, [selectedEntertainment, masterSoundEnabled, effectivePreferences.gameMusic, pauseMusic, playMusic])

  useEffect(() => {
    return () => {
      soundtrackRef.current?.dispose()
      soundtrackRef.current = null
      onImmersiveChange?.(false)
    }
  }, [onImmersiveChange])

  useEffect(() => {
    const resumeRequestedMusic = () => {
      if (!document.hidden && musicRequestedRef.current && currentMusicSourceRef.current) {
        void playMusic(currentMusicSourceRef.current)
      }
    }
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopMusicForBackground()
      } else resumeRequestedMusic()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', stopMusicForBackground)
    window.addEventListener('pageshow', resumeRequestedMusic)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', stopMusicForBackground)
      window.removeEventListener('pageshow', resumeRequestedMusic)
    }
  }, [stopMusicForBackground, playMusic])

  const pickerCardClass = 'group relative h-[8.25rem] w-full shrink-0 overflow-hidden rounded-[2rem] border border-[rgba(215,170,70,0.42)] bg-[#050403] text-left shadow-[0_24px_60px_rgba(0,0,0,0.48)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[rgba(239,202,114,0.68)] focus:outline-none focus:ring-2 focus:ring-[rgba(239,202,114,0.55)] md:h-[10rem]'
  const pickerCardContentClass = 'relative flex h-full items-center gap-4 px-5 py-4 md:px-8'
  const unreadForExperience = (experience: PlayExperience) => badgeState.gameDestinations
    .filter(destination => destination.experience === experience)
    .reduce((total, destination) => total + destination.unreadCount, 0)

  return (
    <>
      {selectedEntertainment === 'shadow-circuit' && LazyShadowCircuit ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <Suspense fallback={<div role="status" aria-live="polite" className="flex h-full flex-col items-center justify-center gap-5 bg-[#033516] p-6 text-[#efffe8]"><img src={circuitPickerBanner} alt="Shadow Circuit" className="w-full max-w-xl rounded-2xl border-4 border-[#adbaa6] shadow-2xl"/><p className="text-lg font-semibold">Powering up Shadow Circuit…</p><progress aria-label="Loading game" className="h-3 w-56 accent-green-400"/></div>}>
            <LazyShadowCircuit onExit={() => closeExperience('shadow-circuit')} />
          </Suspense>
        </div>
      ) : selectedEntertainment === 'shadow-runner' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <ShadowRunnerScreen
            onExit={exitShadowRunner}
            musicPlaying={musicPlaying}
            onPlayMusic={playShadowRunnerMusic}
            onPauseMusic={pauseMusic}
          />
        </div>
      ) : selectedEntertainment === 'shadow-war' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
        <ShadowWarScreen
          onExit={exitShadowWar}
          musicPlaying={musicPlaying}
          audioBlocked={audioBlocked}
          onToggleMusic={toggleMusic}
        />
        </div>
      ) : selectedEntertainment === 'shadow-checkers' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <ShadowCheckersExperience
            onExit={exitShadowCheckers}
            initialMatchId={initialItem}
            onMatchRoute={(action, matchId) => onPlayRoute?.(action, 'shadow-checkers', matchId)}
            musicPlaying={musicPlaying}
            audioBlocked={audioBlocked}
            onToggleMusic={toggleMusic}
            musicEnabled={effectivePreferences.gameMusic}
            masterSoundEnabled={masterSoundEnabled}
            onToggleMasterSound={toggleMasterSound}
            unreadMatchCounts={Object.fromEntries(
              badgeState.gameDestinations
                .filter(destination => destination.experience === 'shadow-checkers')
                .map(destination => [destination.itemId, destination.unreadCount])
            )}
          />
        </div>
      ) : selectedEntertainment === 'shado-tv' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <ShadoTvScreen
            onExit={exitShadoTv}
            initialVideoId={initialItem}
            onVideoRoute={(action, videoId) => onPlayRoute?.(action, 'shado-tv', videoId)}
          />
        </div>
      ) : selectedEntertainment === 'shadow-mystery' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <ShadowMysteryScreen
            onExit={exitShadowMystery}
            initialStoryId={initialItem}
            onStoryRoute={(action, storyId) => onPlayRoute?.(action, 'shadow-mystery', storyId)}
          />
        </div>
      ) : selectedEntertainment === 'will-kirk' ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <WillKirkScreen onExit={exitWillKirk} />
        </div>
      ) : selectedEntertainment === 'shado-live' && SHADO_LIVE_REAL_ENABLED && LazyShadoLiveExperience ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <Suspense fallback={<div className="grid h-full place-items-center bg-black text-sm text-[var(--text-muted)]">Opening Shado Live...</div>}>
            <LazyShadoLiveExperience
              onExit={exitShadoLive}
              initialRoomId={initialItem}
              onRoomRoute={(action, roomId) => onPlayRoute?.(
                action === 'open' ? 'push-item' : 'close-item',
                'shado-live',
                roomId,
              )}
              unreadRooms={badgeState.gameDestinations.filter(
                destination => destination.experience === 'shado-live'
              )}
            />
          </Suspense>
        </div>
      ) : selectedEntertainment === 'shado-live' && SHADO_LIVE_PROTOTYPE_ENABLED && LazyShadoLivePrototype ? (
        <div className="h-full min-h-0 overflow-hidden bg-black">
          <Suspense fallback={<div className="grid h-full place-items-center bg-black text-sm text-[var(--text-muted)]">Opening Shado Live preview...</div>}>
            <LazyShadoLivePrototype onExit={exitShadoLive} />
          </Suspense>
        </div>
      ) : (
        <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)_+_4.2rem)] text-sm md:pb-0"
    >
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="Entertainment"
        logo
        className="hidden md:flex"
      />

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 overflow-y-auto px-4 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)] md:p-6">
        {SHADOW_CIRCUIT_ENABLED && <button type="button" aria-label="Open Shadow Circuit" className={pickerCardClass} onClick={() => {
          void enterCircuitLandscape()
          pauseMusic({ closeContext: true })
          setAudioBlocked(false)
          openExperience('shadow-circuit')
        }}>
          <img src={circuitPickerBanner} alt="Shadow Circuit" className="absolute inset-0 h-full w-full object-cover object-center" loading="eager" decoding="async" width={1920} height={720}/>
        </button>}
        {SHADO_LIVE_ENABLED && <button
          type="button"
          aria-label={SHADO_LIVE_REAL_ENABLED ? 'Open Shado Live' : 'Open Shado Live prototype'}
          onClick={enterShadoLive}
          className={pickerCardClass}
        >
          <ExperienceUnreadBadge count={unreadForExperience('shado-live')} label="Shado Live" />
          <img
            src={SHADO_LIVE_ASSETS.pickerBanner}
            alt="Shado Live"
            className="absolute inset-0 h-full w-full object-cover object-center"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1920}
            height={720}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/10" />
          <span className="absolute bottom-2.5 right-3 rounded-full border border-[#d7aa46]/35 bg-black/70 px-2.5 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.14em] text-[#f0d381] backdrop-blur-sm md:bottom-3 md:right-4">
            {SHADO_LIVE_REAL_ENABLED ? 'Live audio beta' : 'Interactive preview'}
          </span>
        </button>}

        <button
          type="button"
          aria-label="Open Will & Kirk"
          onClick={enterWillKirk}
          className={pickerCardClass}
        >
          <img
            src={WILL_KIRK_ASSETS.pickerBanner}
            alt="Will & Kirk"
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1920}
            height={720}
          />
        </button>

        <button
          type="button"
          aria-label="Open Shadow Runner"
          onClick={enterShadowRunner}
          className={pickerCardClass}
        >
          <img
            src={SHADOW_RUNNER_ASSETS.pickerBanner}
            alt="Shadow Runner"
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1920}
            height={720}
          />
        </button>

        <button
          type="button"
          aria-label="Open Shado TV"
          onClick={enterShadoTv}
          className={pickerCardClass}
        >
          <img
            src={SHADO_TV_ASSETS.pickerBanner}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.86]"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1440}
            height={810}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.52)_54%,rgba(0,0,0,0.2)),radial-gradient(circle_at_76%_22%,rgba(215,170,70,0.28),transparent_34%)]" />
          <div className="absolute inset-x-6 top-4 h-px bg-gradient-to-r from-transparent via-[#f0d381]/55 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-[#8a6328]/60 to-transparent" />
          <div className={pickerCardContentClass}>
            <div className="min-w-0 flex-1">
              <img
                src={SHADO_TV_ASSETS.logoMarquee}
                alt="Shado TV"
                className="mx-auto h-auto w-full max-w-[21rem] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] md:mx-0 md:max-w-[23rem]"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                width={1400}
                height={560}
              />
            </div>
            <div className="hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-3 text-[#f0d381] md:block">
              <Film className="h-5 w-5" />
            </div>
          </div>
        </button>

        <button
          type="button"
          aria-label="Open Shadow Mystery"
          onClick={enterShadowMystery}
          className={pickerCardClass}
        >
          <img
            src={SHADOW_MYSTERY_ASSETS.pickerBanner}
            alt="Shadow Mystery"
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={1672}
            height={941}
          />
        </button>

        <button
          type="button"
          aria-label="Open Shadow War"
          onClick={enterShadowWar}
          className={pickerCardClass}
        >
          <ExperienceUnreadBadge count={unreadForExperience('shadow-war')} label="Shadow War" />
          <img
            src={SHADOW_WAR_ASSETS.pickerBattlefield}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.76]"
            loading="eager"
            decoding="async"
            fetchPriority="high"
            width={720}
            height={1280}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94),rgba(0,0,0,0.58)_52%,rgba(0,0,0,0.32)),radial-gradient(circle_at_78%_28%,rgba(215,170,70,0.24),transparent_34%)]" />
          <div className="absolute inset-x-6 top-4 h-px bg-gradient-to-r from-transparent via-[#f0d381]/55 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-[#8a6328]/60 to-transparent" />
          <div className={pickerCardContentClass}>
            <div className="min-w-0 flex-1">
              <img
                src={SHADOW_WAR_ASSETS.logo}
                alt="Shadow War"
                className="mx-auto h-auto w-full max-w-[30rem] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] md:mx-0"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                width={960}
                height={240}
              />
            </div>
            <div className="hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-3 text-[#f0d381] md:block">
              {musicPlaying ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </div>
          </div>
        </button>

        <button
          type="button"
          aria-label="Open Shadow Checkers"
          onClick={enterShadowCheckers}
          className={pickerCardClass}
        >
          <ExperienceUnreadBadge count={unreadForExperience('shadow-checkers')} label="Shadow Checkers" />
          <img
            src={SHADOW_CHECKERS_ASSETS.pickerArt}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-[0.86]"
            loading="lazy"
            decoding="async"
            width={720}
            height={1280}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.94),rgba(0,0,0,0.56)_52%,rgba(0,0,0,0.24)),radial-gradient(circle_at_78%_28%,rgba(215,170,70,0.24),transparent_34%)]" />
          <div className="absolute inset-x-6 top-4 h-px bg-gradient-to-r from-transparent via-[#f0d381]/55 to-transparent" />
          <div className="absolute inset-x-6 bottom-4 h-px bg-gradient-to-r from-transparent via-[#8a6328]/60 to-transparent" />
          <div className={pickerCardContentClass}>
            <div className="min-w-0 flex-1">
              <img
                src={SHADOW_CHECKERS_ASSETS.pickerLogo}
                alt="Shadow Checkers"
                className="mx-auto h-auto w-full max-w-[30rem] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.85)] md:mx-0"
                loading="lazy"
                decoding="async"
                width={960}
                height={320}
              />
            </div>
            <div className="hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] p-3 text-[#f0d381] md:block">
              <Gamepad2 className="h-5 w-5" />
            </div>
          </div>
        </button>

      </main>
        </motion.div>
      )}
    </>
  )
}

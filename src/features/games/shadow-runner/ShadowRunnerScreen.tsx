import React from 'react'
import { ArrowLeft, CheckCircle2, Lock, LogOut, Map, Music, Settings, Sword, Volume2, VolumeX, X } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { recordShadowRunnerLevelCompletion } from '../../../lib/supabase'
import { SHADOW_RUNNER_ASSETS } from './assets/manifest'
import {
  SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY,
  SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY,
  createShadowRunnerSfxController,
  readShadowRunnerAudioPreference,
  type ShadowRunnerSoundEvent,
  type ShadowRunnerSfxController,
  type ShadowRunnerSfxStatus,
  writeShadowRunnerAudioPreference,
} from './audio'
import {
  getShadowRunnerLevelConfig,
  SHADOW_RUNNER_CAMPAIGN_LEVELS,
  SHADOW_RUNNER_LEVEL_CONFIGS,
  type ShadowRunnerCampaignLevel,
  type ShadowRunnerPlayableLevelId,
} from './game/levels'
import { ShadowRunnerGame, type ShadowRunnerLevelCompletionSummary } from './ShadowRunnerGame'
import { ShadowRunnerScrollMenu, type ShadowRunnerScrollMenuAction } from './ShadowRunnerScrollMenu'

interface ShadowRunnerScreenProps {
  onExit?: () => void
  musicPlaying?: boolean
  onPlayMusic?: () => void
  onPauseMusic?: () => void
}

type OrientationWindow = Window & typeof globalThis & {
  orientation?: number
}

type ViewportOrientation = 'landscape' | 'portrait' | 'unknown'

const ORIENTATION_DIMENSION_TOLERANCE_PX = 2
const ORIENTATION_RECHECK_DELAYS_MS = [80, 180, 360, 700] as const

const MENU_BUTTONS = [
  { id: 'tutorial', label: 'Start Tutorial', labelLines: ['Start', 'Tutorial'], left: '14.4%', width: '18.6%' },
  { id: 'levels', label: 'Select Level', labelLines: ['Select', 'Level'], left: '40.7%', width: '18.6%' },
  { id: 'options', label: 'Options', labelLines: ['Options'], left: '66.9%', width: '18.6%' },
] as const

const SHADOW_RUNNER_PROGRESS_KEY = 'shadow-runner-campaign-progress-v1'

const SHADOW_RUNNER_MENU_SOUND_EVENTS: readonly ShadowRunnerSoundEvent[] = [
  'menu-click',
  'menu-back',
  'menu-denied',
  'level-select',
  'pause',
  'resume',
]

const SHADOW_RUNNER_GAMEPLAY_SOUND_EVENTS: readonly ShadowRunnerSoundEvent[] = [
  'jump',
  'double-jump',
  'land',
  'sword-swing',
  'enemy-hit',
  'stomp',
  'player-hurt',
  'life-lost',
  'respawn',
  'coin',
  'enemy-defeat',
  'level-complete',
  'route-failed',
]

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

const SHADOW_RUNNER_MAP_STAGE_STYLE = {
  width: '100vw',
  height: '100dvh',
} as React.CSSProperties

const SHADOW_RUNNER_MENU_STYLE = {
  width: '58%',
  height: '22.5%',
} as React.CSSProperties

const EMPTY_IMAGE_SOURCES = [] as const

const SHADOW_RUNNER_TITLE_IMAGE_SOURCES = [
  SHADOW_RUNNER_ASSETS.home.background,
  SHADOW_RUNNER_ASSETS.home.titleScroll,
  SHADOW_RUNNER_ASSETS.home.optionsScroll,
  SHADOW_RUNNER_ASSETS.home.optionsMenuButton,
  SHADOW_RUNNER_ASSETS.home.blankMenuScroll,
  SHADOW_RUNNER_ASSETS.home.blankMenuButton,
  SHADOW_RUNNER_ASSETS.home.missionScrollStand,
  SHADOW_RUNNER_ASSETS.home.starSheet,
  SHADOW_RUNNER_ASSETS.home.torchStrip,
  SHADOW_RUNNER_ASSETS.home.bannerStand,
  SHADOW_RUNNER_ASSETS.home.bannerPennant,
  SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip,
] as const

const SHADOW_RUNNER_MAP_IMAGE_SOURCES = [
  SHADOW_RUNNER_ASSETS.home.campaignMap,
  SHADOW_RUNNER_ASSETS.home.levelMapScrollPanel,
  SHADOW_RUNNER_ASSETS.home.levelThumbnailSquareFrame,
  ...SHADOW_RUNNER_CAMPAIGN_LEVELS.map(level => level.locationButton),
  ...SHADOW_RUNNER_CAMPAIGN_LEVELS.map(level => level.thumbnail),
] as const

const SHADOW_RUNNER_SHARED_GAMEPLAY_IMAGE_SOURCES = [
  SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip,
  SHADOW_RUNNER_ASSETS.hero.runStrip,
  SHADOW_RUNNER_ASSETS.hero.jumpAirStrip,
  SHADOW_RUNNER_ASSETS.hero.swordAttackStrip,
  SHADOW_RUNNER_ASSETS.enemies.clockworkSentryStrip,
  SHADOW_RUNNER_ASSETS.enemies.barrelRollerStrip,
  SHADOW_RUNNER_ASSETS.enemies.scrollThiefStrip,
  SHADOW_RUNNER_ASSETS.enemies.towerArcherStrip,
  SHADOW_RUNNER_ASSETS.enemies.candleJesterStrip,
  SHADOW_RUNNER_ASSETS.gameplay.hudPlaque,
  SHADOW_RUNNER_ASSETS.gameplay.healthBarFrame,
  SHADOW_RUNNER_ASSETS.gameplay.heartFull,
  SHADOW_RUNNER_ASSETS.gameplay.heartEmpty,
  SHADOW_RUNNER_ASSETS.gameplay.coinIcon,
  SHADOW_RUNNER_ASSETS.gameplay.levelCompleteBanner,
  SHADOW_RUNNER_ASSETS.gameplay.dpadControlButton,
  SHADOW_RUNNER_ASSETS.gameplay.swordControlButton,
  SHADOW_RUNNER_ASSETS.gameplay.jumpControlButton,
  SHADOW_RUNNER_ASSETS.gameplay.hitSpark,
  SHADOW_RUNNER_ASSETS.gameplay.coinSparkleStrip,
  SHADOW_RUNNER_ASSETS.level.terrainAtlas,
  SHADOW_RUNNER_ASSETS.level.tiltBridge256,
  SHADOW_RUNNER_ASSETS.level.coinStrip48,
  SHADOW_RUNNER_ASSETS.level.spikeRow64,
  SHADOW_RUNNER_ASSETS.level.eastGate96,
  SHADOW_RUNNER_ASSETS.level.landingDustStrip,
  SHADOW_RUNNER_ASSETS.level.swordSlashStrip,
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

  .shadow-runner-no-select,
  .shadow-runner-no-select * {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-user-drag: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    touch-action: none;
    user-select: none;
  }

  .shadow-runner-no-select {
    overscroll-behavior: none;
  }

  .shadow-runner-no-select ::selection {
    background: transparent;
    color: inherit;
  }

  @media (prefers-reduced-motion: reduce) {
    .shadow-runner-star,
    .shadow-runner-float {
      animation: none;
    }
  }
`

function normalizeOrientationAngle(angle?: number) {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return null
  return ((angle % 360) + 360) % 360
}

function getDimensionOrientation(width?: number, height?: number): ViewportOrientation {
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    return 'unknown'
  }

  if (width > height + ORIENTATION_DIMENSION_TOLERANCE_PX) return 'landscape'
  if (height > width + ORIENTATION_DIMENSION_TOLERANCE_PX) return 'portrait'
  return 'unknown'
}

function getViewportMediaOrientation(): ViewportOrientation {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'unknown'

  const landscape = window.matchMedia('(orientation: landscape)').matches
  const portrait = window.matchMedia('(orientation: portrait)').matches

  if (landscape && !portrait) return 'landscape'
  if (portrait && !landscape) return 'portrait'
  return 'unknown'
}

function getViewportDimensionOrientation(): ViewportOrientation {
  if (typeof window === 'undefined') return 'unknown'

  const viewport = window.visualViewport
  const documentElement = document.documentElement
  const orientations = [
    getDimensionOrientation(viewport?.width, viewport?.height),
    getDimensionOrientation(window.innerWidth, window.innerHeight),
    getDimensionOrientation(documentElement?.clientWidth, documentElement?.clientHeight),
  ]

  const landscapeCount = orientations.filter(orientation => orientation === 'landscape').length
  const portraitCount = orientations.filter(orientation => orientation === 'portrait').length

  if (landscapeCount > portraitCount) return 'landscape'
  if (portraitCount > landscapeCount) return 'portrait'
  return 'unknown'
}

function getScreenOrientationFallback(): ViewportOrientation {
  if (typeof window === 'undefined') return 'unknown'

  const orientation = window.screen.orientation
  const orientationType = orientation?.type ?? ''
  const orientationAngle = normalizeOrientationAngle(orientation?.angle)
  const legacyOrientation = normalizeOrientationAngle((window as OrientationWindow).orientation)

  if (orientationType.includes('landscape')) return 'landscape'
  if (orientationType.includes('portrait')) return 'portrait'

  if (orientationAngle === 90 || orientationAngle === 270) return 'landscape'
  if (orientationAngle === 0 || orientationAngle === 180) return 'portrait'

  if (legacyOrientation === 90 || legacyOrientation === 270) return 'landscape'
  if (legacyOrientation === 0 || legacyOrientation === 180) return 'portrait'

  return 'unknown'
}

function getCurrentViewportOrientation(): ViewportOrientation {
  const dimensionOrientation = getViewportDimensionOrientation()
  if (dimensionOrientation !== 'unknown') return dimensionOrientation

  const mediaOrientation = getViewportMediaOrientation()
  if (mediaOrientation !== 'unknown') return mediaOrientation

  return getScreenOrientationFallback()
}

function isLandscapeViewport() {
  return getCurrentViewportOrientation() === 'landscape'
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
    let animationFrame: number | null = null
    let settlingAnimationFrame: number | null = null
    const timeoutIds = new Set<number>()
    const viewport = window.visualViewport
    const orientation = window.screen.orientation
    const orientationQueries = typeof window.matchMedia === 'function'
      ? [
          window.matchMedia('(orientation: landscape)'),
          window.matchMedia('(orientation: portrait)'),
        ]
      : []

    const clearDeferredUpdates = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = null
      }

      if (settlingAnimationFrame !== null) {
        window.cancelAnimationFrame(settlingAnimationFrame)
        settlingAnimationFrame = null
      }

      timeoutIds.forEach(timeoutId => window.clearTimeout(timeoutId))
      timeoutIds.clear()
    }

    const updateGate = () => {
      setShowRotateGate(current => {
        const next = !isLandscapeViewport()
        return current === next ? current : next
      })
    }

    const scheduleGateUpdate = () => {
      clearDeferredUpdates()
      updateGate()

      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null
        updateGate()

        settlingAnimationFrame = window.requestAnimationFrame(() => {
          settlingAnimationFrame = null
          updateGate()
        })
      })

      ORIENTATION_RECHECK_DELAYS_MS.forEach(delay => {
        const timeoutId = window.setTimeout(() => {
          timeoutIds.delete(timeoutId)
          updateGate()
        }, delay)

        timeoutIds.add(timeoutId)
      })
    }

    const handleOrientationSignal = () => scheduleGateUpdate()

    const addMediaQueryListener = (query: MediaQueryList) => {
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', handleOrientationSignal)
        return
      }

      query.addListener?.(handleOrientationSignal)
    }

    const removeMediaQueryListener = (query: MediaQueryList) => {
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', handleOrientationSignal)
        return
      }

      query.removeListener?.(handleOrientationSignal)
    }

    scheduleGateUpdate()
    window.addEventListener('resize', handleOrientationSignal)
    window.addEventListener('orientationchange', handleOrientationSignal)
    window.addEventListener('pageshow', handleOrientationSignal)
    document.addEventListener('visibilitychange', handleOrientationSignal)
    viewport?.addEventListener('resize', handleOrientationSignal)
    viewport?.addEventListener('scroll', handleOrientationSignal)
    orientation?.addEventListener('change', handleOrientationSignal)
    orientationQueries.forEach(addMediaQueryListener)

    return () => {
      clearDeferredUpdates()
      window.removeEventListener('resize', handleOrientationSignal)
      window.removeEventListener('orientationchange', handleOrientationSignal)
      window.removeEventListener('pageshow', handleOrientationSignal)
      document.removeEventListener('visibilitychange', handleOrientationSignal)
      viewport?.removeEventListener('resize', handleOrientationSignal)
      viewport?.removeEventListener('scroll', handleOrientationSignal)
      orientation?.removeEventListener('change', handleOrientationSignal)
      orientationQueries.forEach(removeMediaQueryListener)
    }
  }, [])

  return showRotateGate
}

function useImagePreload(sources: readonly string[]) {
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false

    if (sources.length === 0) {
      setReady(true)
      return
    }

    setReady(false)
    void Promise.all(sources.map(preloadShadowRunnerImage)).then(() => {
      if (!cancelled) setReady(true)
    })

    return () => {
      cancelled = true
    }
  }, [sources])

  return ready
}

function getShadowRunnerRouteImageSources(levelId: ShadowRunnerPlayableLevelId) {
  const level = getShadowRunnerLevelConfig(levelId)
  const routeSources = [
    ...SHADOW_RUNNER_SHARED_GAMEPLAY_IMAGE_SOURCES,
    level.backgroundAsset,
    level.id === 'level-2' ? SHADOW_RUNNER_ASSETS.levels.lanternMarketBackground : undefined,
    level.id === 'level-3' ? SHADOW_RUNNER_ASSETS.levels.ivyViaductTerrainHazards : undefined,
    level.id === 'level-4' ? SHADOW_RUNNER_ASSETS.levels.bellTowerPropsHazards : undefined,
    level.id === 'level-5' ? SHADOW_RUNNER_ASSETS.levels.candleFairPropsHazards : undefined,
    level.id === 'level-5' ? SHADOW_RUNNER_ASSETS.levels.candleFairTerrainReadable : undefined,
    level.id === 'level-4' || level.id === 'level-5' ? SHADOW_RUNNER_ASSETS.levels.moonheartCrestStrip : undefined,
    level.id === 'level-4' || level.id === 'level-5' ? SHADOW_RUNNER_ASSETS.levels.boostAuraStrip : undefined,
  ].filter((source): source is string => Boolean(source))

  return Array.from(new Set(routeSources))
}

function preloadShadowRunnerImage(source: string) {
  return new Promise<void>(resolve => {
    const image = new Image()
    let settled = false
    function settle() {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      resolve()
    }
    const timeout = window.setTimeout(settle, 3600)
    image.onload = settle
    image.onerror = settle
    image.decoding = 'async'
    image.src = source
  })
}

function useShadowRunnerInteractionLock(rootRef: React.RefObject<HTMLElement>) {
  React.useEffect(() => {
    const containsTarget = (event: Event) => {
      const root = rootRef.current
      const target = event.target
      return Boolean(root && target instanceof Node && root.contains(target))
    }

    const preventInsideGame = (event: Event) => {
      if (!containsTarget(event)) return
      event.preventDefault()
    }

    const clearGameSelection = () => {
      const root = rootRef.current
      const selection = window.getSelection()
      if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return

      const anchorInGame = selection.anchorNode ? root.contains(selection.anchorNode) : false
      const focusInGame = selection.focusNode ? root.contains(selection.focusNode) : false
      if (anchorInGame || focusInGame) {
        selection.removeAllRanges()
      }
    }

    document.addEventListener('contextmenu', preventInsideGame, true)
    document.addEventListener('selectstart', preventInsideGame, true)
    document.addEventListener('dragstart', preventInsideGame, true)
    document.addEventListener('selectionchange', clearGameSelection)

    return () => {
      document.removeEventListener('contextmenu', preventInsideGame, true)
      document.removeEventListener('selectstart', preventInsideGame, true)
      document.removeEventListener('dragstart', preventInsideGame, true)
      document.removeEventListener('selectionchange', clearGameSelection)
    }
  }, [rootRef])
}

interface ShadowRunnerCampaignProgress {
  completedLevels: string[]
}

const EMPTY_SHADOW_RUNNER_PROGRESS: ShadowRunnerCampaignProgress = {
  completedLevels: [],
}

function readShadowRunnerProgress(): ShadowRunnerCampaignProgress {
  if (typeof window === 'undefined') return EMPTY_SHADOW_RUNNER_PROGRESS

  try {
    const raw = window.localStorage.getItem(SHADOW_RUNNER_PROGRESS_KEY)
    if (!raw) return EMPTY_SHADOW_RUNNER_PROGRESS

    const parsed = JSON.parse(raw) as Partial<ShadowRunnerCampaignProgress>
    if (!Array.isArray(parsed.completedLevels)) return EMPTY_SHADOW_RUNNER_PROGRESS

    return {
      completedLevels: parsed.completedLevels.filter((level): level is string => typeof level === 'string'),
    }
  } catch {
    return EMPTY_SHADOW_RUNNER_PROGRESS
  }
}

function writeShadowRunnerProgress(progress: ShadowRunnerCampaignProgress) {
  window.localStorage.setItem(SHADOW_RUNNER_PROGRESS_KEY, JSON.stringify(progress))
}

function isCampaignLevelCompleted(progress: ShadowRunnerCampaignProgress, levelId: string) {
  return progress.completedLevels.includes(levelId)
}

function isShadowRunnerPlayableLevelId(levelId: string): levelId is ShadowRunnerPlayableLevelId {
  return Object.prototype.hasOwnProperty.call(SHADOW_RUNNER_LEVEL_CONFIGS, levelId)
}

function getShadowRunnerCompletionSyncLevelIds(progress: ShadowRunnerCampaignProgress) {
  const levelIds = new Set(
    progress.completedLevels.filter(isShadowRunnerPlayableLevelId)
  )

  if ([...levelIds].some(levelId => levelId.startsWith('level-'))) {
    levelIds.add('tutorial')
  }

  return [...levelIds]
}

function isCampaignLevelUnlocked(progress: ShadowRunnerCampaignProgress, level: ShadowRunnerCampaignLevel) {
  if (level.levelNumber === 1) return true
  return isCampaignLevelCompleted(progress, `level-${level.levelNumber - 1}`)
}

function getCampaignLevelState(progress: ShadowRunnerCampaignProgress, level: ShadowRunnerCampaignLevel) {
  const completed = isCampaignLevelCompleted(progress, level.id)
  const unlocked = isCampaignLevelUnlocked(progress, level)
  const playable = unlocked && Boolean(level.playableLevelId)

  return {
    completed,
    unlocked,
    playable,
    statusLabel: completed
      ? 'Cleared'
      : !unlocked
        ? 'Locked'
        : playable
          ? 'Ready'
          : 'In Build',
  }
}

function getCampaignLevelRequirement(level: ShadowRunnerCampaignLevel) {
  if (level.levelNumber <= 1) return 'First route available'
  return `Clear Level ${level.levelNumber - 1} to unlock`
}

function markCampaignLevelComplete(
  progress: ShadowRunnerCampaignProgress,
  levelId: ShadowRunnerPlayableLevelId,
): ShadowRunnerCampaignProgress {
  const completedLevels = new Set(progress.completedLevels)
  completedLevels.add(levelId)

  if (levelId.startsWith('level-')) {
    completedLevels.add('tutorial')
  }

  if (completedLevels.size === progress.completedLevels.length) {
    return progress
  }

  const nextProgress = {
    completedLevels: [...completedLevels],
  }
  writeShadowRunnerProgress(nextProgress)
  return nextProgress
}

function getNextPlayableLevelId(levelId: ShadowRunnerPlayableLevelId): ShadowRunnerPlayableLevelId | undefined {
  if (levelId === 'tutorial') return 'level-1'

  const campaignLevel = SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.playableLevelId === levelId)
  if (!campaignLevel) return undefined

  return SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.levelNumber === campaignLevel.levelNumber + 1)?.playableLevelId
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

function MenuButtonIcon({ id }: { id: typeof MENU_BUTTONS[number]['id'] }) {
  if (id === 'tutorial') return <Sword className="h-[34%] w-[34%] stroke-[3]" aria-hidden="true" />
  if (id === 'levels') return <Map className="h-[34%] w-[34%] stroke-[3]" aria-hidden="true" />
  return <Settings className="h-[34%] w-[34%] stroke-[3]" aria-hidden="true" />
}

interface ShadowRunnerLevelMapProps {
  progress: ShadowRunnerCampaignProgress
  onBack: () => void
  onPlayLevel: (levelId: ShadowRunnerPlayableLevelId) => void
  onSoundEvent?: (event: ShadowRunnerSoundEvent) => void
}

interface ShadowRunnerLevelDetailPopupProps {
  level: ShadowRunnerCampaignLevel
  progress: ShadowRunnerCampaignProgress
  onClose: () => void
  onPlayLevel: (levelId: ShadowRunnerPlayableLevelId) => void
  onSoundEvent?: (event: ShadowRunnerSoundEvent) => void
}

function ShadowRunnerLevelDetailPopup({
  level,
  progress,
  onClose,
  onPlayLevel,
  onSoundEvent,
}: ShadowRunnerLevelDetailPopupProps) {
  const state = getCampaignLevelState(progress, level)
  const primaryLabel = state.completed ? 'Replay' : state.playable ? 'Start' : state.unlocked ? 'In Build' : 'Locked'
  const primaryDisabled = !state.playable || !level.playableLevelId
  const statusClassName = state.completed
    ? 'border-[#6f5b23]/80 bg-[rgba(240,211,129,0.92)] text-[#171006]'
    : state.playable
      ? 'border-[#744f1d]/80 bg-[rgba(48,29,13,0.9)] text-[#f0d381]'
      : 'border-[#5a5548]/70 bg-[rgba(17,17,17,0.86)] text-[#d7c192]'

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 px-[max(0.65rem,env(safe-area-inset-left))] py-3 backdrop-blur-[1px]">
      <div className="relative aspect-[1500/844] w-[min(94vw,54rem)] max-h-[88dvh] drop-shadow-[0_28px_70px_rgba(0,0,0,0.78)]">
        <img
          src={SHADOW_RUNNER_ASSETS.home.levelMapScrollPanel}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />

        <button
          type="button"
          aria-label="Close level details"
          onClick={() => {
            onSoundEvent?.('menu-back')
            onClose()
          }}
          className="absolute right-[17.2%] top-[15.5%] z-10 inline-flex h-[6.2%] aspect-square items-center justify-center rounded-full border border-[#2b1a08]/70 bg-[#1b1208]/78 text-[#f6e6bb] shadow-[0_8px_18px_rgba(0,0,0,0.42)] transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/70"
        >
          <X className="h-[52%] w-[52%] stroke-[3]" aria-hidden="true" />
        </button>

        <div className="absolute left-[22.6%] top-[28.2%] aspect-square w-[19%]">
          <div className="absolute inset-[14%] overflow-hidden rounded-[0.58rem] bg-[#0a0e15] shadow-[inset_0_0_26px_rgba(0,0,0,0.64)]">
            <img
              src={level.thumbnail}
              alt=""
              className={`h-full w-full object-cover ${state.unlocked ? '' : 'grayscale brightness-[0.42] contrast-[0.9]'}`}
              draggable={false}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_58%,rgba(0,0,0,0.38))]" />
          </div>
          <img
            src={SHADOW_RUNNER_ASSETS.home.levelThumbnailSquareFrame}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-contain drop-shadow-[0_12px_28px_rgba(0,0,0,0.42)]"
            draggable={false}
          />
        </div>

        <div className="absolute left-[44.7%] top-[24.7%] flex h-[39.5%] w-[33.8%] flex-col overflow-hidden text-[#160f07]">
          <div className="flex items-start gap-2.5">
            <div className="min-w-0">
              <p className="text-[0.48rem] font-black uppercase leading-none tracking-[0.2em] text-[#4c2c10] min-[740px]:text-[0.56rem] min-[930px]:text-[0.64rem]">
                Level {level.levelNumber}
              </p>
              <h2 className="mt-1 text-[0.64rem] font-black uppercase leading-[0.98] text-[#130d06] drop-shadow-[0_1px_0_rgba(255,238,178,0.55)] min-[740px]:text-[0.76rem] min-[930px]:text-[0.92rem]">
                {level.title}
              </h2>
            </div>
            <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-1 text-[0.42rem] font-black uppercase leading-none tracking-[0.12em] shadow-[0_4px_10px_rgba(0,0,0,0.18)] min-[740px]:px-2 min-[740px]:text-[0.5rem] ${statusClassName}`}>
              {state.statusLabel}
            </span>
          </div>

          <div className="mt-2.5 grid gap-1.5 text-[0.5rem] font-black uppercase leading-[1.12] text-[#231608] min-[740px]:text-[0.56rem] min-[930px]:text-[0.64rem]">
            <p>{level.objective}</p>
            <p className="text-[#573614]">{level.routeType} - Tier {level.difficultyTier}/10</p>
            <p className="text-[#573614]">{level.difficultyLabel}</p>
            <p className="max-w-[22rem] text-[#38220d]">{state.unlocked ? level.mechanicPreview : getCampaignLevelRequirement(level)}</p>
          </div>
        </div>

        <div className="absolute left-[35.5%] top-[69.4%] flex h-[11.6%] w-[37%] items-center gap-[5.6%]">
          <button
            type="button"
            disabled={primaryDisabled}
            onClick={() => {
              if (level.playableLevelId) {
                onSoundEvent?.('level-select')
                onPlayLevel(level.playableLevelId)
              }
            }}
            className={`relative isolate h-full w-[47%] overflow-hidden text-[0.52rem] font-black uppercase tracking-[0.12em] text-[#130d06] transition focus:outline-none focus:ring-2 focus:ring-[#f0d381]/70 min-[740px]:text-[0.62rem] min-[930px]:text-[0.74rem] ${
              primaryDisabled ? 'cursor-default opacity-[0.58] grayscale' : 'active:scale-[0.98]'
            }`}
          >
            <img
              src={SHADOW_RUNNER_ASSETS.home.blankMenuButton}
              alt=""
              className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-fill"
              draggable={false}
            />
            <span className="inline-flex h-full w-full items-center justify-center gap-1">
              {state.playable ? <Sword className="h-4 w-4 stroke-[3]" aria-hidden="true" /> : <Lock className="h-4 w-4 stroke-[3]" aria-hidden="true" />}
              {primaryLabel}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSoundEvent?.('menu-back')
              onClose()
            }}
            className="relative isolate h-full w-[47%] overflow-hidden text-[0.52rem] font-black uppercase tracking-[0.12em] text-[#130d06] transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#f0d381]/70 min-[740px]:text-[0.62rem] min-[930px]:text-[0.74rem]"
          >
            <img
              src={SHADOW_RUNNER_ASSETS.home.blankMenuButton}
              alt=""
              className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-fill"
              draggable={false}
            />
            <span className="inline-flex h-full w-full items-center justify-center">Return</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function ShadowRunnerLevelMap({ progress, onBack, onPlayLevel, onSoundEvent }: ShadowRunnerLevelMapProps) {
  const [selectedLevelId, setSelectedLevelId] = React.useState<string | null>(null)
  const routeSegments = SHADOW_RUNNER_CAMPAIGN_LEVELS.slice(0, -1).map((level, index) => ({
    from: level,
    to: SHADOW_RUNNER_CAMPAIGN_LEVELS[index + 1],
    unlocked: isCampaignLevelUnlocked(progress, SHADOW_RUNNER_CAMPAIGN_LEVELS[index + 1]),
  }))
  const selectedLevel = selectedLevelId
    ? SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.id === selectedLevelId)
    : undefined

  return (
    <div
      className="shadow-runner-playfield relative overflow-hidden"
      style={SHADOW_RUNNER_MAP_STAGE_STYLE}
    >
      <img
        src={SHADOW_RUNNER_ASSETS.home.campaignMap}
        alt=""
        className="absolute inset-0 h-full w-full object-fill"
        draggable={false}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_17%_13%,rgba(246,215,132,0.1),transparent_18%),linear-gradient(90deg,rgba(0,0,0,0.2),transparent_14%,transparent_86%,rgba(0,0,0,0.22)),linear-gradient(180deg,rgba(2,4,10,0.08),rgba(2,4,10,0.24))]" />

      <button
        type="button"
        aria-label="Back to Shadow Runner menu"
        onClick={() => {
          onSoundEvent?.('menu-back')
          onBack()
        }}
        className="absolute left-[max(0.8rem,env(safe-area-inset-left))] top-[max(0.7rem,env(safe-area-inset-top))] z-30 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e8c46b]/40 bg-black/50 text-[#f3d88d] shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-[#f0d381]/70 hover:bg-[#2c2110]/75 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>

      <div className="pointer-events-none absolute left-1/2 top-[3.5%] z-20 -translate-x-1/2 rounded border border-[#6b4a20]/60 bg-[#e3bf72]/90 px-4 py-1 text-[0.62rem] font-black uppercase tracking-[0.22em] text-[#171006] shadow-[0_10px_24px_rgba(0,0,0,0.34)] min-[740px]:text-xs">
        Level Map
      </div>

      <svg
        className="pointer-events-none absolute inset-0 z-10 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {routeSegments.map(segment => (
          <g key={`${segment.from.id}-${segment.to.id}`}>
            <line
              x1={segment.from.mapPosition.left}
              y1={segment.from.mapPosition.top}
              x2={segment.to.mapPosition.left}
              y2={segment.to.mapPosition.top}
              stroke="rgba(12,8,4,0.82)"
              strokeWidth="1.45"
              strokeLinecap="round"
              strokeDasharray="0.25 1.85"
            />
            <line
              x1={segment.from.mapPosition.left}
              y1={segment.from.mapPosition.top}
              x2={segment.to.mapPosition.left}
              y2={segment.to.mapPosition.top}
              stroke={segment.unlocked ? '#f0d381' : 'rgba(226,204,151,0.42)'}
              strokeWidth="0.62"
              strokeLinecap="round"
              strokeDasharray="0.25 1.85"
            />
          </g>
        ))}
      </svg>

      <div className="pointer-events-none absolute inset-0 z-20">
        {SHADOW_RUNNER_CAMPAIGN_LEVELS.map(level => {
          const state = getCampaignLevelState(progress, level)

          return (
            <button
              key={level.id}
              type="button"
              aria-label={`${level.title} details, ${state.statusLabel}`}
              onClick={() => {
                onSoundEvent?.(state.unlocked ? 'menu-click' : 'menu-denied')
                setSelectedLevelId(level.id)
              }}
              className={`group pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition focus:outline-none focus:ring-2 focus:ring-[#f0d381]/65 ${
                state.unlocked ? 'cursor-pointer active:scale-95' : 'cursor-pointer'
              }`}
              style={{
                left: `${level.mapPosition.left}%`,
                top: `${level.mapPosition.top}%`,
              }}
            >
              <img
                src={level.locationButton}
                alt=""
                className={`h-auto w-[clamp(4.75rem,11.4vw,7.4rem)] drop-shadow-[0_13px_24px_rgba(0,0,0,0.55)] transition ${
                  state.unlocked
                    ? 'brightness-100'
                    : 'grayscale brightness-[0.36] contrast-[0.82] opacity-90'
                } ${state.playable ? 'group-active:scale-95' : ''}`}
                draggable={false}
              />
              {state.completed ? (
                <CheckCircle2 className="absolute right-[9%] top-[10%] h-[clamp(0.95rem,2.4vw,1.25rem)] w-[clamp(0.95rem,2.4vw,1.25rem)] rounded-full bg-[#171006] p-0.5 text-[#f0d381] shadow-[0_5px_12px_rgba(0,0,0,0.45)]" />
              ) : !state.playable ? (
                <Lock className="absolute right-[10%] top-[12%] h-[clamp(0.95rem,2.4vw,1.25rem)] w-[clamp(0.95rem,2.4vw,1.25rem)] rounded-full bg-[#171717]/94 p-0.5 text-[#d7c192] shadow-[0_5px_12px_rgba(0,0,0,0.45)]" />
              ) : null}
            </button>
          )
        })}
      </div>

      {selectedLevel && (
        <ShadowRunnerLevelDetailPopup
          level={selectedLevel}
          progress={progress}
          onClose={() => setSelectedLevelId(null)}
          onPlayLevel={onPlayLevel}
          onSoundEvent={onSoundEvent}
        />
      )}
    </div>
  )
}

export function ShadowRunnerScreen({
  onExit,
  musicPlaying = false,
  onPlayMusic,
  onPauseMusic,
}: ShadowRunnerScreenProps) {
  const { user, refreshProfile } = useAuth()
  const rootRef = React.useRef<HTMLElement | null>(null)
  const heroFrame = useSpriteFrame(8, 150)
  const torchFrame = useSpriteFrame(8, 105)
  const orientationGateActive = useRotateGate()
  const [screen, setScreen] = React.useState<'title' | 'levels' | 'loading' | 'play'>('title')
  const [activeLevelId, setActiveLevelId] = React.useState<ShadowRunnerPlayableLevelId>('tutorial')
  const [routeLoadProgress, setRouteLoadProgress] = React.useState(0)
  const [sfxStatus, setSfxStatus] = React.useState<ShadowRunnerSfxStatus | null>(null)
  const [campaignProgress, setCampaignProgress] = React.useState(readShadowRunnerProgress)
  const [titleOptionsOpen, setTitleOptionsOpen] = React.useState(false)
  const [musicEnabled, setMusicEnabled] = React.useState(() => readShadowRunnerAudioPreference(SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY, true))
  const [soundEffectsEnabled, setSoundEffectsEnabled] = React.useState(() => readShadowRunnerAudioPreference(SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY, true))
  const sfxControllerRef = React.useRef<ShadowRunnerSfxController | null>(null)
  const syncedCompletionKeysRef = React.useRef<Set<string>>(new Set())
  const assetsReady = useImagePreload(SHADOW_RUNNER_TITLE_IMAGE_SOURCES)
  const mapAssetsReady = useImagePreload(screen === 'levels' ? SHADOW_RUNNER_MAP_IMAGE_SOURCES : EMPTY_IMAGE_SOURCES)
  const showRotateGate = orientationGateActive

  useShadowRunnerInteractionLock(rootRef)

  React.useEffect(() => {
    syncedCompletionKeysRef.current.clear()
  }, [user?.id])

  React.useEffect(() => {
    const controller = createShadowRunnerSfxController()
    sfxControllerRef.current = controller
    setSfxStatus(controller.getStatus())

    const statusInterval = window.setInterval(() => {
      setSfxStatus(controller.getStatus())
    }, 650)

    void controller.preload(SHADOW_RUNNER_MENU_SOUND_EVENTS).then(() => {
      setSfxStatus(controller.getStatus())
    })
    const gameplayWarmup = window.setTimeout(() => {
      void controller.preload(SHADOW_RUNNER_GAMEPLAY_SOUND_EVENTS).then(() => {
        setSfxStatus(controller.getStatus())
      })
    }, 450)

    return () => {
      window.clearInterval(statusInterval)
      window.clearTimeout(gameplayWarmup)
      controller.dispose()
      sfxControllerRef.current = null
    }
  }, [])

  React.useEffect(() => {
    writeShadowRunnerAudioPreference(SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY, musicEnabled)
  }, [musicEnabled])

  React.useEffect(() => {
    writeShadowRunnerAudioPreference(SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY, soundEffectsEnabled)
  }, [soundEffectsEnabled])

  React.useEffect(() => {
    if (screen === 'play' || screen === 'loading') {
      onPauseMusic?.()
      return
    }

    if (musicEnabled) {
      onPlayMusic?.()
    } else {
      onPauseMusic?.()
    }
  }, [musicEnabled, onPauseMusic, onPlayMusic, screen])

  const playShadowRunnerSound = React.useCallback((event: ShadowRunnerSoundEvent) => {
    sfxControllerRef.current?.play(event, soundEffectsEnabled)
    setSfxStatus(sfxControllerRef.current?.getStatus() ?? null)
  }, [soundEffectsEnabled])

  const playButtonChime = React.useCallback(() => {
    playShadowRunnerSound('menu-click')
  }, [playShadowRunnerSound])

  const toggleSoundEffects = React.useCallback(() => {
    setSoundEffectsEnabled(current => !current)
  }, [])

  const toggleMusicPreference = React.useCallback(() => {
    playButtonChime()
    if (musicEnabled && !musicPlaying) {
      onPlayMusic?.()
      return
    }

    setMusicEnabled(current => {
      const next = !current
      if (next) {
        onPlayMusic?.()
      } else {
        onPauseMusic?.()
      }
      return next
    })
  }, [musicEnabled, musicPlaying, onPauseMusic, onPlayMusic, playButtonChime])

  const startPlayableRoute = React.useCallback((levelId: ShadowRunnerPlayableLevelId) => {
    playShadowRunnerSound('level-select')
    setActiveLevelId(levelId)
    setRouteLoadProgress(0)
    setScreen('loading')
  }, [playShadowRunnerSound])

  React.useEffect(() => {
    if (screen !== 'loading') return

    let cancelled = false

    const run = async () => {
      const sources = getShadowRunnerRouteImageSources(activeLevelId)
      const imageWeight = sources.length > 0 ? 0.72 / sources.length : 0.72
      setRouteLoadProgress(0.06)

      for (let index = 0; index < sources.length; index += 1) {
        if (cancelled) return
        await preloadShadowRunnerImage(sources[index])
        if (!cancelled) {
          setRouteLoadProgress(Math.min(0.78, 0.06 + (index + 1) * imageWeight))
        }
      }

      await sfxControllerRef.current?.preload(SHADOW_RUNNER_GAMEPLAY_SOUND_EVENTS)
      if (cancelled) return
      setSfxStatus(sfxControllerRef.current?.getStatus() ?? null)
      setRouteLoadProgress(0.94)

      await new Promise<void>(resolve => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => resolve())
        })
      })

      if (!cancelled) {
        setRouteLoadProgress(1)
        setScreen('play')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [activeLevelId, screen])

  const handleMenuButton = React.useCallback((buttonId: typeof MENU_BUTTONS[number]['id']) => {
    if (buttonId === 'tutorial') {
      startPlayableRoute('tutorial')
      return
    }

    playButtonChime()

    if (buttonId === 'levels') {
      setScreen('levels')
      return
    }

    if (buttonId === 'options') {
      setTitleOptionsOpen(true)
    }
  }, [playButtonChime, startPlayableRoute])

  const playCampaignLevel = React.useCallback((levelId: ShadowRunnerPlayableLevelId) => {
    startPlayableRoute(levelId)
  }, [startPlayableRoute])

  React.useEffect(() => {
    if (!user?.id) return

    const syncLevelIds = getShadowRunnerCompletionSyncLevelIds(campaignProgress)
    if (syncLevelIds.length === 0) return

    let cancelled = false

    const syncCompletions = async () => {
      let recordedAny = false

      for (const levelId of syncLevelIds) {
        const syncKey = `${user.id}:${levelId}`
        if (syncedCompletionKeysRef.current.has(syncKey)) continue

        syncedCompletionKeysRef.current.add(syncKey)
        try {
          await recordShadowRunnerLevelCompletion({ levelId })
          recordedAny = true
        } catch {
          syncedCompletionKeysRef.current.delete(syncKey)
        }
      }

      if (recordedAny && !cancelled) {
        await refreshProfile().catch(() => undefined)
      }
    }

    void syncCompletions()

    return () => {
      cancelled = true
    }
  }, [campaignProgress, refreshProfile, user?.id])

  const handleLevelComplete = React.useCallback((levelId: ShadowRunnerPlayableLevelId, summary: ShadowRunnerLevelCompletionSummary) => {
    setCampaignProgress(current => markCampaignLevelComplete(current, levelId))

    if (!user?.id) return

    const levelsToRecord: ShadowRunnerPlayableLevelId[] = levelId === 'tutorial'
      ? ['tutorial']
      : ['tutorial', levelId]

    void Promise.all(
      levelsToRecord.map(completedLevelId => recordShadowRunnerLevelCompletion({
        levelId: completedLevelId,
        score: completedLevelId === levelId ? summary.score : null,
        coinsCollected: completedLevelId === levelId ? summary.coinsCollected : null,
        totalCoins: completedLevelId === levelId ? summary.totalCoins : null,
        enemiesDefeated: completedLevelId === levelId ? summary.enemiesDefeated : null,
        totalEnemies: completedLevelId === levelId ? summary.totalEnemies : null,
      }))
    )
      .then(() => refreshProfile())
      .catch(() => undefined)
  }, [refreshProfile, user?.id])

  const titleMusicLabel = !musicEnabled ? 'Music Off' : musicPlaying ? 'Music On' : 'Start Music'

  const titleOptionsActions = React.useMemo<ShadowRunnerScrollMenuAction[]>(() => [
    {
      id: 'close',
      label: 'Close',
      icon: <X className="h-4 w-4 stroke-[3]" />,
      onClick: () => {
        playShadowRunnerSound('menu-back')
        setTitleOptionsOpen(false)
      },
    },
    {
      id: 'music',
      label: titleMusicLabel,
      icon: musicPlaying ? <Music className="h-4 w-4 stroke-[3]" /> : <Music className="h-4 w-4 stroke-[3]" />,
      onClick: toggleMusicPreference,
    },
    {
      id: 'sound-effects',
      label: soundEffectsEnabled ? 'Sound On' : 'Sound Off',
      icon: soundEffectsEnabled ? <Volume2 className="h-4 w-4 stroke-[3]" /> : <VolumeX className="h-4 w-4 stroke-[3]" />,
      onClick: () => {
        playButtonChime()
        toggleSoundEffects()
      },
    },
    {
      id: 'exit',
      label: 'Exit Game',
      icon: <LogOut className="h-4 w-4 stroke-[3]" />,
      tone: 'danger',
      onClick: () => {
        playShadowRunnerSound('menu-back')
        onExit?.()
      },
    },
  ], [musicPlaying, onExit, playButtonChime, playShadowRunnerSound, soundEffectsEnabled, titleMusicLabel, toggleMusicPreference, toggleSoundEffects])

  return (
    <section
      ref={rootRef}
      className="shadow-runner-no-select relative h-full min-h-[100dvh] w-full overflow-hidden bg-[#02040a] text-[#f6e6bb]"
      onContextMenu={event => event.preventDefault()}
      onDragStart={event => event.preventDefault()}
      onSelect={event => event.preventDefault()}
    >
      <style>{SHADOW_RUNNER_INLINE_STYLES}</style>

      <div className={`${showRotateGate ? 'flex' : 'hidden'} shadow-runner-rotate-gate absolute inset-0 z-50 flex-col items-center justify-center bg-black px-8 text-center`}>
        <p className="text-2xl font-black uppercase tracking-[0.18em] text-[#f0d381]">Rotate Phone</p>
        <p className="mt-3 max-w-xs text-sm font-semibold uppercase tracking-[0.12em] text-[#d9c79f]">
          Shadow Runner plays sideways.
        </p>
      </div>

      <div className={`${showRotateGate ? 'hidden' : 'flex'} shadow-runner-landscape-stage absolute inset-0 items-center justify-center bg-black`}>
        {screen === 'loading' ? (
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#02040a] px-6 text-center">
            <img
              src={SHADOW_RUNNER_ASSETS.home.background}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-65"
              draggable={false}
            />
            <div className="absolute inset-0 bg-black/58" />
            <div className="relative z-10 w-[min(58vw,28rem)] text-[#150e07] drop-shadow-[0_22px_60px_rgba(0,0,0,0.75)]">
              <div className="relative h-24 min-[740px]:h-28">
                <img
                  src={SHADOW_RUNNER_ASSETS.home.optionsMenuButton}
                  alt=""
                  className="absolute inset-0 h-full w-full object-fill"
                  draggable={false}
                />
                <div className="absolute inset-x-[12%] inset-y-[18%] flex flex-col items-center justify-center">
                  <p className="text-[0.58rem] font-black uppercase tracking-[0.2em] text-[#5a3818] min-[740px]:text-[0.68rem]">
                    Preparing Route
                  </p>
                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] min-[740px]:text-sm">
                    {getShadowRunnerLevelConfig(activeLevelId).title}
                  </p>
                  <div className="mt-3 h-2 w-[78%] overflow-hidden rounded-full border border-[#5b3714]/60 bg-[#180d04]/55">
                    <div
                      className="h-full rounded-full bg-[#d8a33e] shadow-[0_0_10px_rgba(245,207,105,0.65)] transition-[width] duration-200"
                      style={{ width: `${Math.round(routeLoadProgress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[0.48rem] font-black uppercase tracking-[0.1em] text-[#5a3818] min-[740px]:text-[0.56rem]">
                    Assets {Math.round(routeLoadProgress * 100)}% {sfxStatus ? `- SFX ${sfxStatus.loaded}/${sfxStatus.total}` : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : screen === 'play' ? (
          <ShadowRunnerGame
            levelId={activeLevelId}
            soundEffectsEnabled={soundEffectsEnabled}
            onToggleSoundEffects={toggleSoundEffects}
            onSoundEvent={playShadowRunnerSound}
            onBackToTitle={() => setScreen('title')}
            onBackToMap={() => setScreen('levels')}
            nextLevelId={getNextPlayableLevelId(activeLevelId)}
            onPlayLevel={playCampaignLevel}
            onLevelComplete={handleLevelComplete}
          />
        ) : screen === 'levels' ? (
          !mapAssetsReady ? (
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#02040a] px-6 text-center">
              <img
                src={SHADOW_RUNNER_ASSETS.home.background}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-55"
                draggable={false}
              />
              <div className="absolute inset-0 bg-black/62" />
              <div className="relative z-10 w-[min(52vw,23rem)] text-[#150e07] drop-shadow-[0_22px_60px_rgba(0,0,0,0.75)]">
                <div className="relative h-20 min-[740px]:h-24">
                  <img
                    src={SHADOW_RUNNER_ASSETS.home.optionsMenuButton}
                    alt=""
                    className="absolute inset-0 h-full w-full object-fill"
                    draggable={false}
                  />
                  <div className="absolute inset-x-[12%] inset-y-[18%] flex flex-col items-center justify-center">
                    <p className="text-[0.58rem] font-black uppercase tracking-[0.2em] text-[#5a3818] min-[740px]:text-[0.68rem]">
                      Charting Routes
                    </p>
                    <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] min-[740px]:text-sm">
                      Campaign Map
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <ShadowRunnerLevelMap
              progress={campaignProgress}
              onBack={() => {
                setScreen('title')
              }}
              onPlayLevel={playCampaignLevel}
              onSoundEvent={playShadowRunnerSound}
            />
          )
        ) : (
          <>
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
                className="pointer-events-none absolute bottom-[27.5%] left-[8%] z-[3] w-[7.2%]"
                draggable={false}
              />
              <img
                src={SHADOW_RUNNER_ASSETS.home.bannerPennant}
                alt=""
                className="pointer-events-none absolute right-[3.5%] top-[6.5%] z-[3] w-[6%]"
                draggable={false}
              />

              <img
                src={SHADOW_RUNNER_ASSETS.home.titleScroll}
                alt="Shadow Runner"
                className="pointer-events-none absolute left-[29%] top-[4%] z-[5] w-[42%] drop-shadow-[0_24px_60px_rgba(0,0,0,0.6)]"
                draggable={false}
              />

              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[27.5%] left-[37%] z-[6] aspect-square w-[18%] drop-shadow-[0_28px_40px_rgba(0,0,0,0.72)]"
                style={{
                  ...spriteStripStyle(SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip, heroFrame, 8),
                }}
              />

              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-[28%] left-[17%] z-[4] aspect-square w-[7.2%] drop-shadow-[0_0_32px_rgba(238,143,34,0.5)]"
                style={{
                  ...spriteStripStyle(SHADOW_RUNNER_ASSETS.home.torchStrip, torchFrame, 8),
                }}
              />

              <img
                src={SHADOW_RUNNER_ASSETS.home.missionScrollStand}
                alt=""
                className="shadow-runner-float pointer-events-none absolute bottom-[26.4%] left-[74%] z-[4] w-[6.4%] drop-shadow-[0_20px_35px_rgba(0,0,0,0.55)]"
                draggable={false}
              />

              <div
                className="absolute bottom-[4%] left-1/2 z-10 -translate-x-1/2"
                style={SHADOW_RUNNER_MENU_STYLE}
              >
                <img
                  src={SHADOW_RUNNER_ASSETS.home.blankMenuScroll}
                  alt=""
                  className="pointer-events-none h-full w-full select-none object-fill drop-shadow-[0_20px_45px_rgba(0,0,0,0.7)]"
                  draggable={false}
                />
                {MENU_BUTTONS.map(button => (
                  <button
                    key={button.id}
                    type="button"
                    aria-label={`${button.label} button`}
                    onClick={() => handleMenuButton(button.id)}
                    className="absolute top-[23%] h-[54%] overflow-hidden rounded-[0.42rem] border border-transparent bg-transparent text-[#140e07] transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#f0d381]/65"
                    style={{ left: button.left, width: button.width }}
                  >
                    <img
                      src={SHADOW_RUNNER_ASSETS.home.blankMenuButton}
                      alt=""
                      className="pointer-events-none absolute inset-0 h-full w-full object-fill"
                      draggable={false}
                    />
                      <span className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-0.5 drop-shadow-[0_1px_0_rgba(255,239,183,0.55)]">
                        <MenuButtonIcon id={button.id} />
                      <span className="flex flex-col items-center text-[0.45rem] font-black uppercase leading-[0.9] tracking-[0.06em] min-[740px]:text-[0.54rem] min-[980px]:text-[0.66rem]">
                        {button.labelLines.map(line => (
                          <span key={line}>{line}</span>
                        ))}
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              {titleOptionsOpen && (
                <ShadowRunnerScrollMenu
                  title="Options"
                  subtitle="Private Build"
                  actions={titleOptionsActions}
                />
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

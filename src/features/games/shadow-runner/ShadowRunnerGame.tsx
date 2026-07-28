import React from 'react'
import {
  ChevronRight,
  Home,
  Map,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import { SHADOW_RUNNER_ASSETS } from './assets/manifest'
import type { ShadowRunnerSoundEvent } from './audio'
import { createShadowRunnerInputState, type ShadowRunnerAction } from './game/input'
import {
  getShadowRunnerLevelConfig,
  getShadowRunnerLevelEnemies,
  type ShadowRunnerPlayableLevelId,
} from './game/levels'
import { SHADOW_RUNNER_MAX_HEALTH, type ShadowRunnerHudState } from './game/simulation'
import { ShadowRunnerScrollMenu, type ShadowRunnerScrollMenuAction } from './ShadowRunnerScrollMenu'

export interface ShadowRunnerLevelCompletionSummary {
  score: number
  coinsCollected: number
  totalCoins: number
  enemiesDefeated: number
  totalEnemies: number
  fullClear: boolean
  perfectRoute: boolean
}

interface ShadowRunnerGameProps {
  levelId: ShadowRunnerPlayableLevelId
  soundEffectsEnabled?: boolean
  onBackToTitle?: () => void
  onBackToMap?: () => void
  nextLevelId?: ShadowRunnerPlayableLevelId
  onPlayLevel?: (levelId: ShadowRunnerPlayableLevelId) => void
  onLevelComplete?: (levelId: ShadowRunnerPlayableLevelId, summary: ShadowRunnerLevelCompletionSummary) => void
  onToggleSoundEffects?: () => void
  onSoundEvent?: (event: ShadowRunnerSoundEvent) => void
}

function createDefaultHud(levelId: ShadowRunnerPlayableLevelId): ShadowRunnerHudState {
  const level = getShadowRunnerLevelConfig(levelId)
  const enemy = getShadowRunnerLevelEnemies(level)[0]

  return {
    lives: 3,
    maxLives: 3,
    health: SHADOW_RUNNER_MAX_HEALTH,
    maxHealth: SHADOW_RUNNER_MAX_HEALTH,
    enemyHealth: enemy?.health ?? 0,
    enemyMaxHealth: enemy?.maxHealth ?? 0,
    levelId: level.id,
    levelTitle: level.title,
    levelSubtitle: level.subtitle,
    completionLine: level.completionLine,
    coins: 0,
    totalCoins: level.coins.length,
    score: 0,
    boostActive: false,
    boostRemainingMs: 0,
    boostGuardCharges: 0,
    shieldActive: false,
    shieldRemainingMs: 0,
    shieldGuardCharges: 0,
    chronoActive: false,
    chronoRemainingMs: 0,
    chronoTimeScale: 1,
    surgeActive: false,
    surgeRemainingMs: 0,
    surgeGuardCharges: 0,
    wraithlightActive: false,
    wraithlightRemainingMs: 0,
    mirrorWardActive: false,
    mirrorWardRemainingMs: 0,
    mirrorWardCharges: 0,
    galeMantleActive: false,
    galeMantleRemainingMs: 0,
    galeMantleSpeedMultiplier: 1,
    galeMantleFallDamageCap: null,
    sunsteelEdgeActive: false,
    sunsteelEdgeRemainingMs: 0,
    sunsteelEdgeCharges: 0,
    sunsteelStrikeActive: false,
    sunsteelStrike: {
      attackDamageBonus: 0,
      guardDamage: 0,
      reachBonus: 0,
    },
    dawnfireAegisActive: false,
    dawnfireAegisRemainingMs: 0,
    dawnfireAegis: {
      attackDamageBonus: 0,
      guardDamage: 0,
      damageResistanceMultiplier: 1,
    },
    aetherStepActive: false,
    aetherStepRemainingMs: 0,
    aetherStepSpeedMultiplier: 1,
    aetherStepExtraAirJumps: 0,
    aetherStepPreventsFallDamage: false,
    moonShards: 0,
    totalMoonShards: level.moonShardPickups?.length ?? 0,
    moonShardGateOpen: (level.moonShardPickups?.length ?? 0) === 0,
    objectiveLabel: level.objectiveLabel ?? 'Objectives',
    objectiveItems: 0,
    totalObjectiveItems: level.objectivePickups?.length ?? 0,
    objectiveGateOpen: (level.objectivePickups?.length ?? 0) === 0,
    masteryLabel: level.masteryLabel ?? 'Mastery',
    masteryItems: 0,
    totalMasteryItems: level.masteryPickups?.length ?? 0,
    enemiesDefeated: 0,
    totalEnemies: getShadowRunnerLevelEnemies(level).length,
    fullClear: false,
    perfectRoute: false,
    objective: level.objective,
    defeated: false,
    outOfLives: false,
  }
}

const SHADOW_RUNNER_GAME_STYLES = `
  .shadow-runner-no-select,
  .shadow-runner-no-select * {
    -webkit-touch-callout: none;
    -webkit-user-drag: none;
    -webkit-user-select: none;
    touch-action: none;
    user-select: none;
  }

  .shadow-runner-game-stage canvas {
    display: block;
    height: 100%;
    width: 100%;
    -webkit-touch-callout: none;
    -webkit-user-drag: none;
    -webkit-user-select: none;
    image-rendering: pixelated;
    touch-action: none;
    user-select: none;
  }

  .shadow-runner-touch-button {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    height: var(--shadow-runner-action-size);
    touch-action: none;
    user-select: none;
    width: var(--shadow-runner-action-size);
  }

  .shadow-runner-touch-button[data-control-size="large"] {
    --shadow-runner-action-size: var(--shadow-runner-action-large);
  }

  .shadow-runner-dpad {
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    height: var(--shadow-runner-dpad-size);
    touch-action: none;
    user-select: none;
    width: var(--shadow-runner-dpad-size);
  }
`

type ShadowRunnerPhaserGameHandle = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void
  scene?: {
    pause: (key: string) => void
    resume: (key: string) => void
  }
}

type DirectionPadAction = 'left' | 'right' | 'crouch'

interface MovementPointerOrigin {
  pointerId: number
  x: number
  y: number
}

interface MovementPointerState extends MovementPointerOrigin {
  crouchTapIntent: boolean
  crouchGesture: boolean
  maxDistance: number
}

function HealthAndLives({
  health,
  maxHealth,
  lives,
  maxLives,
}: {
  health: number
  maxHealth: number
  lives: number
  maxLives: number
}) {
  const healthPercent = maxHealth > 0 ? Math.max(0, Math.min(100, (health / maxHealth) * 100)) : 0

  return (
    <span
      aria-label={`Lives ${lives} of ${maxLives}, health ${health} of ${maxHealth}`}
      className="flex w-full items-center justify-center gap-1.5"
    >
      <span className="flex shrink-0 items-center gap-[1px]">
        {Array.from({ length: maxLives }, (_item, index) => (
          <img
            key={index}
            src={index < lives ? SHADOW_RUNNER_ASSETS.gameplay.heartFull : SHADOW_RUNNER_ASSETS.gameplay.heartEmpty}
            data-heart-state={index < lives ? 'full' : 'empty'}
            alt=""
            aria-hidden="true"
            className="h-[clamp(0.72rem,2.2vw,1.05rem)] w-auto object-contain drop-shadow-[0_2px_0_rgba(0,0,0,0.42)]"
            draggable={false}
          />
        ))}
      </span>
      <span className="relative h-[0.72rem] min-w-12 flex-1 overflow-hidden rounded-full border border-[#f0d381]/55 bg-[#180907]/88 shadow-inner min-[740px]:h-[0.8rem]">
        <span
          aria-hidden="true"
          className="absolute inset-y-[1px] left-[1px] rounded-full bg-gradient-to-r from-[#8f1f1f] via-[#d34a2f] to-[#f0a14a] transition-[width] duration-200"
          style={{ width: `${healthPercent}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[0.38rem] font-black leading-none tracking-[0.02em] text-[#fff3cf] drop-shadow-[0_1px_1px_#210604] min-[740px]:text-[0.44rem]">
          {health}/{maxHealth}
        </span>
      </span>
    </span>
  )
}

function getMovementZoneAction(
  element: HTMLElement,
  origin: MovementPointerOrigin,
  event: Pick<React.PointerEvent<HTMLElement>, 'clientX' | 'clientY'>,
): DirectionPadAction | null {
  const rect = element.getBoundingClientRect()
  const dx = event.clientX - origin.x
  const dy = event.clientY - origin.y
  const deadZone = clampNumber(Math.min(rect.width, rect.height) * 0.055, 12, 24)

  if (Math.abs(dx) < deadZone && Math.abs(dy) < deadZone) return null
  if (dy > deadZone && dy >= Math.abs(dx) * 0.72) return 'crouch'
  if (dx < -deadZone) return 'left'
  if (dx > deadZone) return 'right'
  return null
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

interface DirectionPadProps {
  onActionChange: (action: ShadowRunnerAction, pressed: boolean) => void
  onCrouchToggle: () => void
}

function isCrouchTapTarget(dpad: HTMLElement | null, event: Pick<React.PointerEvent<HTMLElement>, 'clientX' | 'clientY'>) {
  if (!dpad) return false

  const rect = dpad.getBoundingClientRect()
  if (
    event.clientX < rect.left
    || event.clientX > rect.right
    || event.clientY < rect.top
    || event.clientY > rect.bottom
  ) {
    return false
  }

  const relativeX = (event.clientX - rect.left) / rect.width
  const relativeY = (event.clientY - rect.top) / rect.height

  return relativeY >= 0.54 && relativeX >= 0.22 && relativeX <= 0.78
}

function MovementTouchZone({ onActionChange, onCrouchToggle }: DirectionPadProps) {
  const activeActionRef = React.useRef<DirectionPadAction | null>(null)
  const pointerOriginRef = React.useRef<MovementPointerState | null>(null)
  const dpadRef = React.useRef<HTMLDivElement | null>(null)

  const setActiveAction = React.useCallback((nextAction: DirectionPadAction | null) => {
    const previousAction = activeActionRef.current
    if (previousAction === nextAction) return

    if (previousAction) {
      onActionChange(previousAction, false)
    }

    activeActionRef.current = nextAction

    if (nextAction) {
      onActionChange(nextAction, true)
    }
  }, [onActionChange])

  const updatePointerTravel = React.useCallback((event: Pick<React.PointerEvent<HTMLElement>, 'clientX' | 'clientY'>) => {
    const origin = pointerOriginRef.current
    if (!origin) return 0

    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y
    const distance = Math.hypot(dx, dy)
    origin.maxDistance = Math.max(origin.maxDistance, distance)
    return distance
  }, [])

  const press = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some synthetic or browser-generated pointer events have no active pointer to capture.
    }
    pointerOriginRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      crouchTapIntent: isCrouchTapTarget(dpadRef.current, event),
      crouchGesture: false,
      maxDistance: 0,
    }
    setActiveAction(null)
  }, [setActiveAction])

  const move = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const origin = pointerOriginRef.current
    if (!origin || origin.pointerId !== event.pointerId) return
    event.preventDefault()
    updatePointerTravel(event)
    const nextAction = getMovementZoneAction(event.currentTarget, origin, event)

    if (nextAction === 'crouch') {
      origin.crouchGesture = true
      setActiveAction(null)
      return
    }

    setActiveAction(nextAction)
  }, [setActiveAction, updatePointerTravel])

  const release = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const origin = pointerOriginRef.current
    event.preventDefault()
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Keep mobile controls responsive even when capture state is browser-dependent.
    }

    if (origin?.pointerId === event.pointerId) {
      updatePointerTravel(event)
      const activeAction = activeActionRef.current
      const tapDistanceLimit = clampNumber(Math.min(event.currentTarget.clientWidth, event.currentTarget.clientHeight) * 0.035, 8, 18)
      if (origin.crouchGesture || (origin.crouchTapIntent && origin.maxDistance <= tapDistanceLimit && activeAction !== 'left' && activeAction !== 'right')) {
        onCrouchToggle()
      }
      pointerOriginRef.current = null
    }

    setActiveAction(null)
  }, [onCrouchToggle, setActiveAction, updatePointerTravel])

  const loseCapture = React.useCallback(() => {
    pointerOriginRef.current = null
    setActiveAction(null)
  }, [setActiveAction])

  React.useEffect(() => () => {
    pointerOriginRef.current = null
    setActiveAction(null)
  }, [setActiveAction])

  return (
    <div
      role="group"
      aria-label="Movement controls"
      onPointerDown={press}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={loseCapture}
      onContextMenu={event => event.preventDefault()}
      className="absolute bottom-0 left-0 top-0 w-[52%]"
    >
      <div
        ref={dpadRef}
        className="shadow-runner-dpad pointer-events-none absolute bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-[max(0.65rem,env(safe-area-inset-left))] isolate rounded-full text-[#f8eac0] drop-shadow-[0_16px_28px_rgba(0,0,0,0.58)]"
        style={{
          '--shadow-runner-dpad-size': 'clamp(6.12rem, 25.5svh, 8.08rem)',
        } as React.CSSProperties}
      >
        <img
          src={SHADOW_RUNNER_ASSETS.gameplay.dpadControlButton}
          alt=""
          aria-hidden="true"
          className="absolute inset-[-8%] z-0 h-[116%] w-[116%] object-contain opacity-[0.86]"
          draggable={false}
        />
      </div>
    </div>
  )
}

interface TouchButtonProps {
  action: ShadowRunnerAction
  ariaLabel: string
  asset: string
  onActionChange: (action: ShadowRunnerAction, pressed: boolean) => void
  size?: 'regular' | 'large'
}

function TouchButton({
  action,
  ariaLabel,
  asset,
  onActionChange,
  size = 'regular',
}: TouchButtonProps) {
  const press = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some synthetic or browser-generated pointer events have no active pointer to capture.
    }
    onActionChange(action, true)
  }, [action, onActionChange])

  const release = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Keep mobile controls responsive even when capture state is browser-dependent.
    }
    onActionChange(action, false)
  }, [action, onActionChange])

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => onActionChange(action, false)}
      onContextMenu={event => event.preventDefault()}
      data-control-size={size}
      className="shadow-runner-touch-button relative isolate inline-flex items-center justify-center rounded-full text-[#f8eac0] drop-shadow-[0_16px_28px_rgba(0,0,0,0.58)] transition active:scale-95"
    >
      <img
        src={asset}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-[-8%] z-0 h-[116%] w-[116%] object-contain opacity-[0.86]"
        draggable={false}
      />
    </button>
  )
}

export function ShadowRunnerGame({
  levelId,
  soundEffectsEnabled = true,
  onBackToTitle,
  onBackToMap,
  nextLevelId,
  onPlayLevel,
  onLevelComplete,
  onToggleSoundEffects,
  onSoundEvent,
}: ShadowRunnerGameProps) {
  const gameMountRef = React.useRef<HTMLDivElement | null>(null)
  const gameRef = React.useRef<ShadowRunnerPhaserGameHandle | null>(null)
  const inputRef = React.useRef(createShadowRunnerInputState())
  const onSoundEventRef = React.useRef(onSoundEvent)
  onSoundEventRef.current = onSoundEvent
  const levelConfig = React.useMemo(() => getShadowRunnerLevelConfig(levelId), [levelId])
  const { isReducedMotion } = useComfortPreferences()
  const reducedMotionRef = React.useRef(isReducedMotion)
  reducedMotionRef.current = isReducedMotion
  const [hud, setHud] = React.useState<ShadowRunnerHudState>(() => createDefaultHud(levelId))
  const [ready, setReady] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [pauseOpen, setPauseOpen] = React.useState(false)
  const [confirmExit, setConfirmExit] = React.useState<null | 'title'>(null)
  const [restartToken, setRestartToken] = React.useState(0)
  const [routeIntroVisible, setRouteIntroVisible] = React.useState(true)
  const [finaleBeatIndex, setFinaleBeatIndex] = React.useState(0)
  const [finaleComplete, setFinaleComplete] = React.useState(false)
  const completionReportedRef = React.useRef(false)
  const menuOpen = pauseOpen || confirmExit !== null
  const overlayOpen = menuOpen || hud.defeated || hud.outOfLives
  const routeIntroLine = levelConfig.introLine ?? hud.objective

  const clearPressedActions = React.useCallback(() => {
    inputRef.current = createShadowRunnerInputState()
  }, [])

  React.useEffect(() => {
    let disposed = false
    let game: ShadowRunnerPhaserGameHandle | null = null

    setReady(false)
    setLoadError(null)
    setHud(createDefaultHud(levelId))
    setFinaleBeatIndex(0)
    setFinaleComplete(false)
    completionReportedRef.current = false

    void import('./game/createShadowRunnerPhaserGame')
      .then(({ createShadowRunnerPhaserGame }) => {
        if (disposed || !gameMountRef.current) return

        game = createShadowRunnerPhaserGame({
          parent: gameMountRef.current,
          input: inputRef,
          levelId,
          onHudChange: setHud,
          onReady: () => {
            if (!disposed) setReady(true)
          },
          onSoundEvent: event => onSoundEventRef.current?.(event),
          reducedMotion: reducedMotionRef.current,
        }) as ShadowRunnerPhaserGameHandle
        gameRef.current = game
      })
      .catch(error => {
        if (disposed) return
        setLoadError(error instanceof Error ? error.message : 'Unable to start Shadow Runner')
      })

    return () => {
      disposed = true
      inputRef.current = createShadowRunnerInputState()
      game?.destroy(true)
      gameRef.current = null
    }
  }, [levelId, restartToken])

  React.useEffect(() => {
    setRouteIntroVisible(true)
    if (!ready) return

    const timer = window.setTimeout(() => setRouteIntroVisible(false), 2800)
    return () => window.clearTimeout(timer)
  }, [levelId, ready, restartToken])

  React.useEffect(() => {
    const finale = levelConfig.finale
    if (!hud.defeated || !finale || finaleComplete) return

    const beat = finale.beats[finaleBeatIndex]
    if (!beat) {
      setFinaleComplete(true)
      return
    }
    if (isReducedMotion) return
    const timer = window.setTimeout(
      () => {
        if (finaleBeatIndex >= finale.beats.length - 1) {
          setFinaleComplete(true)
        } else {
          setFinaleBeatIndex(current => current + 1)
        }
      },
      beat.durationMs,
    )
    return () => window.clearTimeout(timer)
  }, [finaleBeatIndex, finaleComplete, hud.defeated, isReducedMotion, levelConfig.finale])

  React.useEffect(() => {
    if (!hud.defeated || completionReportedRef.current) return
    completionReportedRef.current = true
    onLevelComplete?.(levelId, {
      score: hud.score,
      coinsCollected: hud.coins,
      totalCoins: hud.totalCoins,
      enemiesDefeated: hud.enemiesDefeated,
      totalEnemies: hud.totalEnemies,
      fullClear: hud.fullClear,
      perfectRoute: hud.perfectRoute,
    })
  }, [hud.coins, hud.defeated, hud.enemiesDefeated, hud.fullClear, hud.perfectRoute, hud.score, hud.totalCoins, hud.totalEnemies, levelId, onLevelComplete])

  React.useEffect(() => {
    const game = gameRef.current
    if (!game?.scene) return

    if (overlayOpen) {
      clearPressedActions()
      game.scene.pause('ShadowRunnerLevelScene')
    } else {
      game.scene.resume('ShadowRunnerLevelScene')
    }
  }, [clearPressedActions, overlayOpen])

  const setAction = React.useCallback((action: ShadowRunnerAction, pressed: boolean) => {
    if (overlayOpen) return

    const state = inputRef.current
    const wasPressed = state[action]

    if (pressed && !wasPressed) {
      if (action === 'jump') {
        state.crouch = false
        state.jumpPresses += 1
      } else if (action === 'attack') {
        state.attackPresses += 1
      }
    }

    state[action] = pressed
  }, [overlayOpen])

  const toggleCrouch = React.useCallback(() => {
    if (overlayOpen) return

    const state = inputRef.current
    state.crouch = !state.crouch
  }, [overlayOpen])

  const openPauseMenu = React.useCallback(() => {
    clearPressedActions()
    setConfirmExit(null)
    onSoundEvent?.('pause')
    setPauseOpen(true)
  }, [clearPressedActions, onSoundEvent])

  const handlePausePress = React.useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    openPauseMenu()
  }, [openPauseMenu])

  const closePauseMenu = React.useCallback(() => {
    onSoundEvent?.('resume')
    setConfirmExit(null)
    setPauseOpen(false)
  }, [onSoundEvent])

  const restartLevel = React.useCallback(() => {
    clearPressedActions()
    setConfirmExit(null)
    setPauseOpen(false)
    onSoundEvent?.('level-select')
    setRestartToken(current => current + 1)
  }, [clearPressedActions, onSoundEvent])

  const advanceFinale = React.useCallback(() => {
    const finale = levelConfig.finale
    if (!finale) return
    onSoundEvent?.('menu-click')
    if (finaleBeatIndex >= finale.beats.length - 1) {
      setFinaleComplete(true)
    } else {
      setFinaleBeatIndex(current => current + 1)
    }
  }, [finaleBeatIndex, levelConfig.finale, onSoundEvent])

  const pauseActions = React.useMemo<ShadowRunnerScrollMenuAction[]>(() => [
    {
      id: 'resume',
      label: 'Resume',
      icon: <Play className="h-4 w-4 stroke-[3]" />,
      onClick: closePauseMenu,
    },
    {
      id: 'sound-effects',
      label: soundEffectsEnabled ? 'Sound On' : 'Sound Off',
      icon: soundEffectsEnabled ? <Volume2 className="h-4 w-4 stroke-[3]" /> : <VolumeX className="h-4 w-4 stroke-[3]" />,
      onClick: () => {
        onSoundEvent?.('menu-click')
        onToggleSoundEffects?.()
      },
    },
    {
      id: 'main-menu',
      label: 'Quit Level',
      icon: <Home className="h-4 w-4 stroke-[3]" />,
      onClick: () => {
        onSoundEvent?.('menu-back')
        setConfirmExit('title')
      },
    },
  ], [closePauseMenu, onSoundEvent, onToggleSoundEffects, soundEffectsEnabled])

  const confirmActions = React.useMemo<ShadowRunnerScrollMenuAction[]>(() => [
    {
      id: 'stay',
      label: 'Stay',
      icon: <Play className="h-4 w-4 stroke-[3]" />,
      onClick: () => {
        onSoundEvent?.('menu-back')
        setConfirmExit(null)
      },
    },
    {
      id: 'confirm',
      label: 'Main Menu',
      icon: <Home className="h-4 w-4 stroke-[3]" />,
      tone: 'danger',
      onClick: () => {
        onSoundEvent?.('menu-back')
        setConfirmExit(null)
        setPauseOpen(false)
        onBackToTitle?.()
      },
    },
  ], [onBackToTitle, onSoundEvent])

  const routeFailedActions = React.useMemo<ShadowRunnerScrollMenuAction[]>(() => [
    {
      id: 'try-again',
      label: 'Retry',
      icon: <RotateCcw className="h-4 w-4 stroke-[3]" />,
      onClick: restartLevel,
    },
    {
      id: 'main-menu',
      label: 'Main Menu',
      icon: <Home className="h-4 w-4 stroke-[3]" />,
      onClick: () => {
        onSoundEvent?.('menu-back')
        onBackToTitle?.()
      },
    },
  ], [onBackToTitle, onSoundEvent, restartLevel])

  const levelCompleteActions = React.useMemo<ShadowRunnerScrollMenuAction[]>(() => {
    const returnToMap = onBackToMap ?? onBackToTitle
    const actions: ShadowRunnerScrollMenuAction[] = [
      {
        id: 'return-map',
        label: 'Return to Map',
        icon: <Map className="h-4 w-4 stroke-[3]" />,
        onClick: () => {
          onSoundEvent?.('menu-back')
          returnToMap?.()
        },
      },
    ]

    if (nextLevelId && onPlayLevel) {
      actions.push({
        id: 'next-route',
        label: 'Next Route',
        icon: <ChevronRight className="h-4 w-4 stroke-[3]" />,
        onClick: () => {
          onSoundEvent?.('level-select')
          onPlayLevel(nextLevelId)
        },
      })
      return actions
    }

    actions.unshift({
      id: 'restart',
      label: 'Retry Route',
      icon: <RotateCcw className="h-4 w-4 stroke-[3]" />,
      onClick: restartLevel,
    })
    return actions
  }, [nextLevelId, onBackToMap, onBackToTitle, onPlayLevel, onSoundEvent, restartLevel])

  return (
    <div
      className="shadow-runner-no-select relative h-full w-full overflow-hidden bg-[#02040a] text-[#f6e6bb]"
      onContextMenu={event => event.preventDefault()}
    >
      <style>{SHADOW_RUNNER_GAME_STYLES}</style>

      <div
        ref={gameMountRef}
        aria-label="Shadow Runner playable level"
        className="shadow-runner-game-stage absolute inset-0"
      />

      {(!ready || loadError) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/88 px-6 text-center">
          <div className="rounded-lg border border-[#f0d381]/35 bg-[#120d07]/88 px-5 py-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)]">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f0d381]">
              {loadError ? 'Game Error' : 'Loading Level'}
            </p>
            {loadError && (
              <p className="mt-2 max-w-sm text-xs font-semibold text-[#d9c79f]">{loadError}</p>
            )}
          </div>
        </div>
      )}

      {ready && routeIntroVisible && !overlayOpen && (
        <div className="pointer-events-none absolute left-1/2 top-[17%] z-20 w-[min(76vw,36rem)] -translate-x-1/2 text-center text-[#150e07] drop-shadow-[0_18px_38px_rgba(0,0,0,0.58)]">
          <div className="relative h-16 min-[740px]:h-[4.6rem]">
            <img
              src={SHADOW_RUNNER_ASSETS.home.optionsMenuButton}
              alt=""
              className="absolute inset-0 h-full w-full object-fill"
              draggable={false}
            />
            <div className="absolute inset-x-[11%] inset-y-[20%] flex flex-col items-center justify-center overflow-hidden">
              <p className="text-[0.48rem] font-black uppercase leading-none tracking-[0.18em] text-[#5a3818] min-[740px]:text-[0.58rem]">
                Mission
              </p>
              <p className="mt-1 line-clamp-2 text-[0.56rem] font-black uppercase leading-[1.08] tracking-[0.06em] min-[740px]:text-[0.6rem] min-[930px]:text-[0.66rem]">
                {routeIntroLine}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 px-[max(0.85rem,env(safe-area-inset-left))] pt-[max(0.7rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto relative mx-auto h-12 w-[min(58vw,31rem)] min-w-[17.5rem] max-w-[calc(100vw-7rem)] text-[#f6e6bb] drop-shadow-[0_12px_32px_rgba(0,0,0,0.55)] min-[740px]:h-14">
          <img
            src={SHADOW_RUNNER_ASSETS.gameplay.hudPlaque}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-fill"
            draggable={false}
          />
          <div className="absolute inset-y-[21%] left-[14.5%] flex w-[30%] items-center justify-center">
            <HealthAndLives
              health={hud.health}
              maxHealth={hud.maxHealth}
              lives={hud.lives}
              maxLives={hud.maxLives}
            />
          </div>
          <div
            aria-label={`Coins collected ${hud.coins}`}
            className="absolute inset-y-[21%] left-[52.5%] flex w-[12%] items-center justify-center gap-1 text-[0.68rem] font-black uppercase tracking-[0.08em] text-[#f0d381] min-[740px]:text-[0.78rem]"
          >
            <img
              src={SHADOW_RUNNER_ASSETS.gameplay.coinIcon}
              alt=""
              aria-hidden="true"
              className="h-[clamp(0.85rem,2.35vw,1.28rem)] w-auto object-contain"
              draggable={false}
            />
            <span>{hud.coins}</span>
          </div>
          <div
            aria-label={`Score ${hud.score}`}
            className="absolute inset-y-[21%] left-[70%] flex w-[16%] items-center justify-center text-[0.68rem] font-black uppercase tracking-[0.08em] text-[#f0d381] min-[740px]:text-[0.78rem]"
          >
            {hud.score}
          </div>
        </div>

        <div className="pointer-events-none mx-auto mt-1 flex max-w-[min(94vw,52rem)] flex-wrap items-center justify-center gap-1">
        {hud.boostActive && (
          <div
            aria-label={`Moonheart boost ${Math.ceil(hud.boostRemainingMs / 1000)} seconds remaining`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#e8c46b]/45 bg-[#130912]/78 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.12em] text-[#f0d381] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <img
              src={SHADOW_RUNNER_ASSETS.levels.moonheartCrestStrip}
              alt=""
              aria-hidden="true"
              className="h-5 w-5 object-none object-left"
              draggable={false}
            />
            <span>{Math.ceil(hud.boostRemainingMs / 1000)}s</span>
            {hud.boostGuardCharges > 0 && <span className="text-[#f8e8ad]">Guard {hud.boostGuardCharges}</span>}
          </div>
        )}

        {hud.shieldActive && (
          <div
            aria-label={`Shield ward ${Math.ceil(hud.shieldRemainingMs / 1000)} seconds remaining`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#8ad7ff]/45 bg-[#07121c]/78 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.12em] text-[#bdeaff] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span>Shield</span>
            <span>{Math.ceil(hud.shieldRemainingMs / 1000)}s</span>
            {hud.shieldGuardCharges > 0 && <span className="text-[#f8e8ad]">Guard {hud.shieldGuardCharges}</span>}
          </div>
        )}

        {hud.chronoActive && (
          <div
            aria-label={`Chrono Lantern ${Math.ceil(hud.chronoRemainingMs / 1000)} seconds remaining`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#70e8ff]/45 bg-[#06121a]/82 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.12em] text-[#9fefff] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.chronoLanternStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Chrono</span>
            <span>{Math.ceil(hud.chronoRemainingMs / 1000)}s</span>
          </div>
        )}

        {hud.surgeActive && (
          <div
            aria-label={`Shadow Surge ${Math.ceil(hud.surgeRemainingMs / 1000)} seconds remaining`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#a9efff]/45 bg-[#06101a]/82 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.12em] text-[#d7f7ff] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.shadowSurgeSigilStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Surge</span>
            <span>{Math.ceil(hud.surgeRemainingMs / 1000)}s</span>
            {hud.surgeGuardCharges > 0 && <span className="text-[#f8e8ad]">Guard {hud.surgeGuardCharges}</span>}
          </div>
        )}

        {hud.wraithlightActive && (
          <div
            aria-label={`Wraithlight ${Math.ceil(hud.wraithlightRemainingMs / 1000)} seconds remaining`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#75ffd2]/45 bg-[#061712]/82 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.12em] text-[#b9ffe8] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.wraithlightLanternStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Wraithlight</span>
            <span>{Math.ceil(hud.wraithlightRemainingMs / 1000)}s</span>
          </div>
        )}

        {hud.mirrorWardActive && (
          <div
            aria-label={`Mirror Ward ${hud.mirrorWardCharges} reflection charges`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#e7f8ff]/50 bg-[#07141a]/82 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.12em] text-[#e7f8ff] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.mirrorWardStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Mirror</span>
            <span>{hud.mirrorWardCharges}</span>
          </div>
        )}

        {hud.galeMantleActive && (
          <div
            aria-label={`Gale Mantle ${Math.ceil(hud.galeMantleRemainingMs / 1000)} seconds remaining`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#9be8ff]/50 bg-[#07141a]/84 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.1em] text-[#d8f7ff] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.galeMantleStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Gale</span>
            <span>{Math.ceil(hud.galeMantleRemainingMs / 1000)}s</span>
          </div>
        )}

        {hud.sunsteelEdgeActive && (
          <div
            aria-label={`Sunsteel Edge ${hud.sunsteelEdgeCharges} charged attacks`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#ffc84f]/55 bg-[#1a1005]/84 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.1em] text-[#ffe8a3] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.sunsteelEdgeStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Sunsteel</span>
            <span>{hud.sunsteelEdgeCharges}</span>
          </div>
        )}

        {hud.dawnfireAegisActive && (
          <div
            aria-label={`Dawnfire Aegis ${Math.ceil(hud.dawnfireAegisRemainingMs / 1000)} seconds remaining`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#ffbd52]/55 bg-[#1b0c05]/86 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.1em] text-[#ffe4a0] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.dawnfireAegisStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Dawnfire</span>
            <span>{Math.ceil(hud.dawnfireAegisRemainingMs / 1000)}s</span>
          </div>
        )}

        {hud.aetherStepActive && (
          <div
            aria-label={`Aether Step ${Math.ceil(hud.aetherStepRemainingMs / 1000)} seconds remaining`}
            className="pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border border-[#8ff8ff]/55 bg-[#04151b]/86 px-2.5 text-[0.52rem] font-black uppercase tracking-[0.1em] text-[#d5fbff] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem]"
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.aetherStepStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Aether</span>
            <span>{Math.ceil(hud.aetherStepRemainingMs / 1000)}s</span>
          </div>
        )}

        {hud.totalObjectiveItems > 0 && (
          <div
            aria-label={`${hud.objectiveLabel} ${hud.objectiveItems} of ${hud.totalObjectiveItems}; ${hud.masteryLabel} ${hud.masteryItems} of ${hud.totalMasteryItems}`}
            className={`pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border px-2.5 text-[0.52rem] font-black uppercase tracking-[0.1em] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem] ${
              hud.objectiveGateOpen
                ? 'border-[#f0d381]/55 bg-[#191006]/82 text-[#f8e8ad]'
                : 'border-[#75ffd2]/45 bg-[#061712]/82 text-[#b9ffe8]'
            }`}
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${
                  hud.levelId === 'level-10'
                    ? SHADOW_RUNNER_ASSETS.levels.relayFlameStrip
                    : hud.levelId === 'level-9'
                    ? SHADOW_RUNNER_ASSETS.levels.watchfireCrestStrip
                    : SHADOW_RUNNER_ASSETS.levels.relaySealStrip
                })`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>{hud.objectiveLabel} {hud.objectiveItems}/{hud.totalObjectiveItems}</span>
            <span className="text-[#7fe9d0]">{hud.masteryLabel} {hud.masteryItems}/{hud.totalMasteryItems}</span>
          </div>
        )}

        {hud.totalMoonShards > 0 && (
          <div
            aria-label={`Moon Shards ${hud.moonShards} of ${hud.totalMoonShards}`}
            className={`pointer-events-none flex h-7 w-fit items-center gap-1.5 rounded border px-2.5 text-[0.52rem] font-black uppercase tracking-[0.12em] shadow-[0_10px_24px_rgba(0,0,0,0.42)] backdrop-blur-sm min-[740px]:h-8 min-[740px]:text-[0.6rem] ${
              hud.moonShardGateOpen
                ? 'border-[#f0d381]/55 bg-[#191006]/82 text-[#f8e8ad]'
                : 'border-[#9be6ff]/45 bg-[#06121a]/82 text-[#bdeaff]'
            }`}
          >
            <span
              aria-hidden="true"
              className="h-5 w-5 bg-contain bg-left bg-no-repeat [image-rendering:pixelated]"
              style={{
                backgroundImage: `url(${SHADOW_RUNNER_ASSETS.levels.moonShardRelicStrip})`,
                backgroundSize: '400% 100%',
              }}
            />
            <span>Shards</span>
            <span>{hud.moonShards}/{hud.totalMoonShards}</span>
          </div>
        )}
        </div>

        <button
          type="button"
          aria-label="Open pause menu"
          onPointerDown={handlePausePress}
          onClick={event => event.preventDefault()}
          className="pointer-events-auto absolute right-[max(0.85rem,env(safe-area-inset-right))] top-[max(0.7rem,env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e8c46b]/40 bg-black/48 text-[#f3d88d] shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-[#f0d381]/70 hover:bg-[#2c2110]/75 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
        >
          <Pause className="h-5 w-5" />
        </button>
      </div>

      <div className={`absolute inset-0 z-20 transition-opacity ${overlayOpen ? 'pointer-events-none opacity-35' : 'pointer-events-auto opacity-100'}`}>
        <MovementTouchZone onActionChange={setAction} onCrouchToggle={toggleCrouch} />
      </div>

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-end px-[max(0.65rem,env(safe-area-inset-left))] pb-[max(0.45rem,env(safe-area-inset-bottom))] transition-opacity ${overlayOpen ? 'opacity-35' : 'opacity-100'}`}>
        <div
          className="pointer-events-auto relative h-[calc(var(--shadow-runner-action-large)*1.86)] w-[calc(var(--shadow-runner-action-large)*2.02)]"
          style={{
            '--shadow-runner-action-size': 'clamp(6.12rem, 25.5svh, 8.08rem)',
            '--shadow-runner-action-large': 'clamp(6.12rem, 25.5svh, 8.08rem)',
          } as React.CSSProperties}
        >
          <div className="absolute right-0 top-0">
            <TouchButton action="attack" ariaLabel="Sword attack" asset={SHADOW_RUNNER_ASSETS.gameplay.swordControlButton} onActionChange={setAction} size="large" />
          </div>
          <div className="absolute bottom-0 left-0">
            <TouchButton action="jump" ariaLabel="Jump" asset={SHADOW_RUNNER_ASSETS.gameplay.jumpControlButton} onActionChange={setAction} size="large" />
          </div>
        </div>
      </div>

      {pauseOpen && !confirmExit && (
        <ShadowRunnerScrollMenu
          title="Pause"
          subtitle={hud.levelTitle}
          actions={pauseActions}
        />
      )}

      {confirmExit && (
        <ShadowRunnerScrollMenu
          title="Quit Level?"
          subtitle="Return to Shadow Runner menu"
          actions={confirmActions}
        />
      )}

      {hud.outOfLives && !menuOpen && (
        <ShadowRunnerScrollMenu
          title="Route Failed"
          subtitle="The east gate is still waiting"
          actions={routeFailedActions}
        />
      )}

      {hud.defeated && levelConfig.finale && !finaleComplete && !menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Dawn Relay Spire finale"
          className="shadow-runner-no-select absolute inset-0 z-50 overflow-hidden bg-black text-white"
        >
          <img
            src={levelConfig.finale.asset}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(1,4,8,0.08),rgba(1,4,8,0.25)_42%,rgba(1,4,8,0.94)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 px-[max(1.25rem,env(safe-area-inset-left))] pb-[max(1.1rem,env(safe-area-inset-bottom))] pt-24 text-center drop-shadow-[0_4px_18px_rgba(0,0,0,0.9)]">
            <p className="text-[0.58rem] font-black uppercase tracking-[0.2em] text-[#ffd76d] min-[740px]:text-xs">
              {levelConfig.finale.beats[finaleBeatIndex]?.eyebrow}
            </p>
            <h2 className="mt-1 text-xl font-black uppercase leading-tight tracking-[0.08em] text-[#fff5cf] min-[740px]:text-3xl">
              {levelConfig.finale.beats[finaleBeatIndex]?.title}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-xs font-semibold leading-relaxed text-[#f6e6bb] min-[740px]:text-sm">
              {levelConfig.finale.beats[finaleBeatIndex]?.body}
            </p>
            <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
              {levelConfig.finale.beats.map((beat, index) => (
                <span
                  key={beat.title}
                  className={`h-1.5 w-6 rounded-full ${
                    index <= finaleBeatIndex ? 'bg-[#ffd76d]' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={advanceFinale}
              className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded border border-[#ffd76d]/70 bg-black/58 px-5 text-[0.65rem] font-black uppercase tracking-[0.14em] text-[#fff1bd] backdrop-blur-sm transition hover:bg-black/76 focus:outline-none focus:ring-2 focus:ring-[#ffd76d]/70"
            >
              {finaleBeatIndex >= levelConfig.finale.beats.length - 1 ? 'View Results' : 'Continue'}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {hud.defeated && (!levelConfig.finale || finaleComplete) && !menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Level Complete"
          className="shadow-runner-no-select absolute inset-0 z-40 flex items-center justify-center bg-black/58 px-4 text-[#150e07] backdrop-blur-[2px]"
        >
          <div className="relative flex w-[min(66vw,30rem)] min-w-[20rem] flex-col items-center">
            <div className="relative aspect-[650/187] w-full">
              <img
                src={SHADOW_RUNNER_ASSETS.gameplay.levelCompleteBanner}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-fill drop-shadow-[0_22px_60px_rgba(0,0,0,0.78)]"
                draggable={false}
              />
              <div className="absolute inset-x-[13%] top-[27%] text-center">
                <p className="text-[0.54rem] font-black uppercase tracking-[0.16em] text-[#5a3818] min-[740px]:text-[0.66rem]">{hud.levelTitle}</p>
                <p className="mt-0.5 text-sm font-black uppercase leading-none tracking-[0.16em] min-[740px]:text-xl">
                  {hud.perfectRoute ? 'Perfect Route' : hud.fullClear ? 'Full Clear' : 'Level Complete'}
                </p>
                <p className="mt-1 text-[0.56rem] font-black uppercase tracking-[0.1em] text-[#3a2611] min-[740px]:text-xs">
                  {hud.completionLine}
                </p>
                <p className="mt-0.5 text-[0.48rem] font-black uppercase tracking-[0.08em] text-[#3a2611] min-[740px]:text-[0.58rem]">
                  Coins {hud.coins}/{hud.totalCoins} - Enemies {hud.enemiesDefeated}/{hud.totalEnemies} - Score {hud.score}
                </p>
              </div>
            </div>

            <div className="mt-[-0.35rem] grid w-[76%] grid-cols-2 gap-1.5 min-[740px]:gap-2">
              {levelCompleteActions.map(action => (
                <button
                  key={action.id}
                  type="button"
                  onClick={action.onClick}
                  className="relative h-10 overflow-hidden rounded-[0.34rem] bg-transparent text-[#150e07] transition active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#f0d381]/65"
                >
                  <img
                    src={SHADOW_RUNNER_ASSETS.home.optionsMenuButton}
                    alt=""
                    className="pointer-events-none absolute inset-0 h-full w-full object-fill"
                    draggable={false}
                  />
                  <span className="relative z-10 flex h-full min-w-0 items-center justify-center gap-1 px-2 drop-shadow-[0_1px_0_rgba(255,239,183,0.5)]">
                    <span aria-hidden="true">{action.icon}</span>
                    <span className="min-w-0 truncate whitespace-nowrap text-[0.52rem] font-black uppercase leading-none tracking-[0.06em] min-[740px]:text-[0.6rem]">
                      {action.label}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

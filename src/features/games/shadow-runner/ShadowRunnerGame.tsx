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
import { SHADOW_RUNNER_ASSETS } from './assets/manifest'
import type { ShadowRunnerSoundEvent } from './audio'
import { createShadowRunnerInputState, type ShadowRunnerAction } from './game/input'
import {
  getShadowRunnerLevelConfig,
  getShadowRunnerLevelEnemies,
  type ShadowRunnerPlayableLevelId,
} from './game/levels'
import type { ShadowRunnerHudState } from './game/simulation'
import { ShadowRunnerScrollMenu, type ShadowRunnerScrollMenuAction } from './ShadowRunnerScrollMenu'

interface ShadowRunnerGameProps {
  levelId: ShadowRunnerPlayableLevelId
  soundEffectsEnabled?: boolean
  onBackToTitle?: () => void
  onBackToMap?: () => void
  nextLevelId?: ShadowRunnerPlayableLevelId
  onPlayLevel?: (levelId: ShadowRunnerPlayableLevelId) => void
  onLevelComplete?: (levelId: ShadowRunnerPlayableLevelId) => void
  onToggleSoundEffects?: () => void
  onSoundEvent?: (event: ShadowRunnerSoundEvent) => void
}

function createDefaultHud(levelId: ShadowRunnerPlayableLevelId): ShadowRunnerHudState {
  const level = getShadowRunnerLevelConfig(levelId)
  const enemy = getShadowRunnerLevelEnemies(level)[0]

  return {
    lives: 3,
    maxLives: 3,
    health: 3,
    maxHealth: 3,
    enemyHealth: enemy?.health ?? 0,
    enemyMaxHealth: enemy?.maxHealth ?? 0,
    levelId: level.id,
    levelTitle: level.title,
    levelSubtitle: level.subtitle,
    completionLine: level.completionLine,
    coins: 0,
    totalCoins: level.coins.length,
    score: 0,
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

function LifePips({ current, max }: { current: number; max: number }) {
  return (
    <span
      aria-label={`Lives ${current} of ${max}`}
      className="flex items-center justify-center gap-1"
    >
      {Array.from({ length: max }, (_item, index) => (
        <img
          key={index}
          src={index < current ? SHADOW_RUNNER_ASSETS.gameplay.heartFull : SHADOW_RUNNER_ASSETS.gameplay.heartEmpty}
          alt=""
          aria-hidden="true"
          className="h-[clamp(1rem,3vw,1.55rem)] w-auto object-contain drop-shadow-[0_2px_0_rgba(0,0,0,0.42)]"
          draggable={false}
        />
      ))}
    </span>
  )
}

function getMovementZoneAction(
  element: HTMLElement,
  event: Pick<React.PointerEvent<HTMLElement>, 'clientX' | 'clientY'>,
): DirectionPadAction {
  const rect = element.getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height

  if (y > 0.7) return 'crouch'
  return x < 0.5 ? 'left' : 'right'
}

interface DirectionPadProps {
  onActionChange: (action: ShadowRunnerAction, pressed: boolean) => void
}

function MovementTouchZone({ onActionChange }: DirectionPadProps) {
  const activeActionRef = React.useRef<DirectionPadAction | null>(null)

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

  const press = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Some synthetic or browser-generated pointer events have no active pointer to capture.
    }
    setActiveAction(getMovementZoneAction(event.currentTarget, event))
  }, [setActiveAction])

  const move = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!activeActionRef.current) return
    event.preventDefault()
    setActiveAction(getMovementZoneAction(event.currentTarget, event))
  }, [setActiveAction])

  const release = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // Keep mobile controls responsive even when capture state is browser-dependent.
    }
    setActiveAction(null)
  }, [setActiveAction])

  React.useEffect(() => () => setActiveAction(null), [setActiveAction])

  return (
    <div
      role="group"
      aria-label="Movement controls"
      onPointerDown={press}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => setActiveAction(null)}
      onContextMenu={event => event.preventDefault()}
      className="absolute bottom-0 left-0 top-0 w-[52%]"
    >
      <div
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
  const levelConfig = React.useMemo(() => getShadowRunnerLevelConfig(levelId), [levelId])
  const [hud, setHud] = React.useState<ShadowRunnerHudState>(() => createDefaultHud(levelId))
  const [ready, setReady] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [pauseOpen, setPauseOpen] = React.useState(false)
  const [confirmExit, setConfirmExit] = React.useState<null | 'title'>(null)
  const [restartToken, setRestartToken] = React.useState(0)
  const [routeIntroVisible, setRouteIntroVisible] = React.useState(true)
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
          onSoundEvent,
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
  }, [levelId, onSoundEvent, restartToken])

  React.useEffect(() => {
    setRouteIntroVisible(true)
    const timer = window.setTimeout(() => setRouteIntroVisible(false), 2800)
    return () => window.clearTimeout(timer)
  }, [levelId, restartToken])

  React.useEffect(() => {
    if (!hud.defeated || completionReportedRef.current) return
    completionReportedRef.current = true
    onLevelComplete?.(levelId)
  }, [hud.defeated, levelId, onLevelComplete])

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
        state.jumpPresses += 1
      } else if (action === 'attack') {
        state.attackPresses += 1
      }
    }

    state[action] = pressed
  }, [overlayOpen])

  const openPauseMenu = React.useCallback(() => {
    clearPressedActions()
    setConfirmExit(null)
    onSoundEvent?.('pause')
    setPauseOpen(true)
  }, [clearPressedActions, onSoundEvent])

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
        <div className="pointer-events-none absolute left-1/2 top-[17%] z-20 w-[min(58vw,28rem)] -translate-x-1/2 text-center text-[#150e07] drop-shadow-[0_18px_38px_rgba(0,0,0,0.58)]">
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
              <p className="mt-1 line-clamp-2 text-[0.6rem] font-black uppercase leading-[1.08] tracking-[0.08em] min-[740px]:text-[0.72rem]">
                {routeIntroLine}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-[max(0.85rem,env(safe-area-inset-left))] pt-[max(0.7rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto relative mx-auto h-12 w-[min(58vw,31rem)] min-w-[17.5rem] max-w-[calc(100vw-7rem)] text-[#f6e6bb] drop-shadow-[0_12px_32px_rgba(0,0,0,0.55)] min-[740px]:h-14">
          <img
            src={SHADOW_RUNNER_ASSETS.gameplay.hudPlaque}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-fill"
            draggable={false}
          />
          <div className="absolute inset-y-[21%] left-[14.5%] flex w-[30%] items-center justify-center">
            <LifePips current={hud.lives} max={hud.maxLives} />
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

        <button
          type="button"
          aria-label="Open pause menu"
          onClick={openPauseMenu}
          className="pointer-events-auto absolute right-[max(0.85rem,env(safe-area-inset-right))] top-[max(0.7rem,env(safe-area-inset-top))] inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e8c46b]/40 bg-black/48 text-[#f3d88d] shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-[#f0d381]/70 hover:bg-[#2c2110]/75 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
        >
          <Pause className="h-5 w-5" />
        </button>
      </div>

      <div className={`absolute inset-0 z-20 transition-opacity ${overlayOpen ? 'pointer-events-none opacity-35' : 'pointer-events-auto opacity-100'}`}>
        <MovementTouchZone onActionChange={setAction} />
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

      {hud.defeated && !menuOpen && (
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
                <p className="mt-0.5 text-sm font-black uppercase leading-none tracking-[0.16em] min-[740px]:text-xl">Level Complete</p>
                <p className="mt-1 text-[0.56rem] font-black uppercase tracking-[0.1em] text-[#3a2611] min-[740px]:text-xs">
                  {hud.completionLine}
                </p>
                <p className="mt-0.5 text-[0.48rem] font-black uppercase tracking-[0.08em] text-[#3a2611] min-[740px]:text-[0.58rem]">
                  Coins {hud.coins} of {hud.totalCoins} - Score {hud.score}
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

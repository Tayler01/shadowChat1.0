import React from 'react'
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  Home,
  LogOut,
  Music,
  Pause,
  Play,
  RotateCcw,
  Sword,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { SHADOW_RUNNER_ASSETS } from './assets/manifest'
import { createShadowRunnerInputState, type ShadowRunnerAction } from './game/input'
import type { ShadowRunnerHudState } from './game/simulation'
import { ShadowRunnerScrollMenu, type ShadowRunnerScrollMenuAction } from './ShadowRunnerScrollMenu'

interface ShadowRunnerGameProps {
  musicPlaying?: boolean
  audioBlocked?: boolean
  soundEffectsEnabled?: boolean
  onBackToTitle?: () => void
  onExitToEntertainment?: () => void
  onToggleMusic?: () => void
  onToggleSoundEffects?: () => void
}

const DEFAULT_HUD: ShadowRunnerHudState = {
  health: 3,
  maxHealth: 3,
  enemyHealth: 3,
  enemyMaxHealth: 3,
  coins: 0,
  totalCoins: 7,
  score: 0,
  objective: 'Reach the east gate',
  defeated: false,
}

const SHADOW_RUNNER_GAME_STYLES = `
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
    touch-action: none;
    user-select: none;
  }
`

type ShadowRunnerPhaserGameHandle = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void
  scene?: {
    pause: (key: string) => void
    resume: (key: string) => void
  }
}

function HealthPips({ current, max }: { current: number; max: number }) {
  return (
    <span
      aria-label={`Health ${current} of ${max}`}
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

interface TouchButtonProps {
  action: ShadowRunnerAction
  ariaLabel: string
  children: React.ReactNode
  onActionChange: (action: ShadowRunnerAction, pressed: boolean) => void
  size?: 'regular' | 'large'
}

function TouchButton({
  action,
  ariaLabel,
  children,
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
      className={`shadow-runner-touch-button inline-flex items-center justify-center rounded-full border border-[#f0d381]/45 bg-black/50 text-[#f6e6bb] shadow-[0_14px_34px_rgba(0,0,0,0.5)] backdrop-blur-md transition active:scale-95 active:border-[#f0d381]/80 active:bg-[#4a3418]/80 ${size === 'large' ? 'h-16 w-16' : 'h-14 w-14'}`}
    >
      {children}
    </button>
  )
}

export function ShadowRunnerGame({
  musicPlaying = false,
  audioBlocked = false,
  soundEffectsEnabled = true,
  onBackToTitle,
  onExitToEntertainment,
  onToggleMusic,
  onToggleSoundEffects,
}: ShadowRunnerGameProps) {
  const gameMountRef = React.useRef<HTMLDivElement | null>(null)
  const gameRef = React.useRef<ShadowRunnerPhaserGameHandle | null>(null)
  const inputRef = React.useRef(createShadowRunnerInputState())
  const [hud, setHud] = React.useState<ShadowRunnerHudState>(DEFAULT_HUD)
  const [ready, setReady] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [pauseOpen, setPauseOpen] = React.useState(false)
  const [confirmExit, setConfirmExit] = React.useState<null | 'title' | 'entertainment'>(null)
  const [restartToken, setRestartToken] = React.useState(0)
  const menuOpen = pauseOpen || confirmExit !== null
  const overlayOpen = menuOpen || hud.defeated

  const clearPressedActions = React.useCallback(() => {
    inputRef.current = createShadowRunnerInputState()
  }, [])

  React.useEffect(() => {
    let disposed = false
    let game: ShadowRunnerPhaserGameHandle | null = null

    setReady(false)
    setLoadError(null)
    setHud(DEFAULT_HUD)

    void import('./game/createShadowRunnerPhaserGame')
      .then(({ createShadowRunnerPhaserGame }) => {
        if (disposed || !gameMountRef.current) return

        game = createShadowRunnerPhaserGame({
          parent: gameMountRef.current,
          input: inputRef,
          onHudChange: setHud,
          onReady: () => {
            if (!disposed) setReady(true)
          },
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
  }, [restartToken])

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
    setPauseOpen(true)
  }, [clearPressedActions])

  const closePauseMenu = React.useCallback(() => {
    setConfirmExit(null)
    setPauseOpen(false)
  }, [])

  const restartLevel = React.useCallback(() => {
    clearPressedActions()
    setConfirmExit(null)
    setPauseOpen(false)
    setRestartToken(current => current + 1)
  }, [clearPressedActions])

  const pauseActions = React.useMemo<ShadowRunnerScrollMenuAction[]>(() => [
    {
      id: 'resume',
      label: 'Resume',
      icon: <Play className="h-4 w-4 stroke-[3]" />,
      onClick: closePauseMenu,
    },
    {
      id: 'music',
      label: musicPlaying ? 'Music On' : audioBlocked ? 'Start Music' : 'Music Off',
      icon: <Music className="h-4 w-4 stroke-[3]" />,
      onClick: () => onToggleMusic?.(),
    },
    {
      id: 'sound-effects',
      label: soundEffectsEnabled ? 'Sound On' : 'Sound Off',
      icon: soundEffectsEnabled ? <Volume2 className="h-4 w-4 stroke-[3]" /> : <VolumeX className="h-4 w-4 stroke-[3]" />,
      onClick: () => onToggleSoundEffects?.(),
    },
    {
      id: 'main-menu',
      label: 'Main Menu',
      icon: <Home className="h-4 w-4 stroke-[3]" />,
      onClick: () => setConfirmExit('title'),
    },
    {
      id: 'exit',
      label: 'Exit',
      icon: <LogOut className="h-4 w-4 stroke-[3]" />,
      tone: 'danger',
      onClick: () => setConfirmExit('entertainment'),
    },
  ], [audioBlocked, closePauseMenu, musicPlaying, onToggleMusic, onToggleSoundEffects, soundEffectsEnabled])

  const confirmActions = React.useMemo<ShadowRunnerScrollMenuAction[]>(() => [
    {
      id: 'stay',
      label: 'Stay',
      icon: <Play className="h-4 w-4 stroke-[3]" />,
      onClick: () => setConfirmExit(null),
    },
    {
      id: 'confirm',
      label: confirmExit === 'title' ? 'Main Menu' : 'Exit',
      icon: confirmExit === 'title' ? <Home className="h-4 w-4 stroke-[3]" /> : <LogOut className="h-4 w-4 stroke-[3]" />,
      tone: 'danger',
      onClick: () => {
        closePauseMenu()
        if (confirmExit === 'title') {
          onBackToTitle?.()
          return
        }
        onExitToEntertainment?.()
      },
    },
  ], [closePauseMenu, confirmExit, onBackToTitle, onExitToEntertainment])

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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-[max(0.85rem,env(safe-area-inset-left))] pt-[max(0.7rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto relative mx-auto h-12 w-[min(58vw,31rem)] min-w-[17.5rem] max-w-[calc(100vw-7rem)] text-[#f6e6bb] drop-shadow-[0_12px_32px_rgba(0,0,0,0.55)] min-[740px]:h-14">
          <img
            src={SHADOW_RUNNER_ASSETS.gameplay.hudPlaque}
            alt=""
            className="pointer-events-none absolute inset-0 h-full w-full object-fill"
            draggable={false}
          />
          <div className="absolute inset-y-[21%] left-[14.5%] flex w-[30%] items-center justify-center">
            <HealthPips current={hud.health} max={hud.maxHealth} />
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

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-[max(1rem,env(safe-area-inset-left))] pb-[max(0.85rem,env(safe-area-inset-bottom))] transition-opacity ${overlayOpen ? 'opacity-35' : 'opacity-100'}`}>
        <div className="pointer-events-auto flex items-end gap-2">
          <TouchButton action="left" ariaLabel="Move left" onActionChange={setAction}>
            <ChevronLeft className="h-7 w-7" />
          </TouchButton>
          <TouchButton action="right" ariaLabel="Move right" onActionChange={setAction}>
            <ChevronRight className="h-7 w-7" />
          </TouchButton>
          <TouchButton action="crouch" ariaLabel="Crouch" onActionChange={setAction}>
            <ArrowDown className="h-6 w-6" />
          </TouchButton>
        </div>

        <div className="pointer-events-auto flex items-end gap-3">
          <TouchButton action="jump" ariaLabel="Jump" onActionChange={setAction} size="large">
            <ChevronsUp className="h-8 w-8" />
          </TouchButton>
          <TouchButton action="attack" ariaLabel="Sword attack" onActionChange={setAction} size="large">
            <Sword className="h-8 w-8" />
          </TouchButton>
        </div>
      </div>

      {pauseOpen && !confirmExit && (
        <ShadowRunnerScrollMenu
          title="Pause"
          subtitle="Level One"
          actions={pauseActions}
        />
      )}

      {confirmExit && (
        <ShadowRunnerScrollMenu
          title={confirmExit === 'title' ? 'Leave Level?' : 'Exit Game?'}
          subtitle={confirmExit === 'title' ? 'Return to title screen' : 'Return to entertainment'}
          actions={confirmActions}
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
                <p className="text-sm font-black uppercase leading-none tracking-[0.18em] min-[740px]:text-xl">Level Complete</p>
                <p className="mt-1 text-[0.58rem] font-black uppercase tracking-[0.12em] text-[#3a2611] min-[740px]:text-xs">
                  {hud.coins}/{hud.totalCoins} coins - {hud.score} score
                </p>
              </div>
            </div>

            <div className="mt-[-0.35rem] grid w-[86%] grid-cols-3 gap-2">
              {[
                { id: 'restart', label: 'Restart', icon: <RotateCcw className="h-4 w-4 stroke-[3]" />, onClick: restartLevel },
                { id: 'main-menu', label: 'Main', icon: <Home className="h-4 w-4 stroke-[3]" />, onClick: onBackToTitle },
                { id: 'exit', label: 'Exit', icon: <LogOut className="h-4 w-4 stroke-[3]" />, onClick: onExitToEntertainment },
              ].map(action => (
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
                  <span className="relative z-10 flex h-full items-center justify-center gap-1.5 px-2 drop-shadow-[0_1px_0_rgba(255,239,183,0.5)]">
                    <span aria-hidden="true">{action.icon}</span>
                    <span className="truncate text-[0.54rem] font-black uppercase leading-none tracking-[0.08em] min-[740px]:text-[0.64rem]">
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

import React from 'react'
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUp,
  CircleDot,
  Home,
  LogOut,
  Music,
  Pause,
  Play,
  Sword,
  Volume2,
  VolumeX,
} from 'lucide-react'
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
      className="flex items-center gap-1"
    >
      {Array.from({ length: max }, (_item, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`h-2.5 w-2.5 border border-[#f0d381]/60 ${index < current ? 'bg-[#f0d381]' : 'bg-[#4b1821]'}`}
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
  const menuOpen = pauseOpen || confirmExit !== null

  const clearPressedActions = React.useCallback(() => {
    inputRef.current = createShadowRunnerInputState()
  }, [])

  React.useEffect(() => {
    let disposed = false
    let game: ShadowRunnerPhaserGameHandle | null = null

    setReady(false)
    setLoadError(null)

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
  }, [])

  React.useEffect(() => {
    const game = gameRef.current
    if (!game?.scene) return

    if (menuOpen) {
      clearPressedActions()
      game.scene.pause('ShadowRunnerLevelScene')
    } else {
      game.scene.resume('ShadowRunnerLevelScene')
    }
  }, [clearPressedActions, menuOpen])

  const setAction = React.useCallback((action: ShadowRunnerAction, pressed: boolean) => {
    if (menuOpen) return

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
  }, [menuOpen])

  const openPauseMenu = React.useCallback(() => {
    clearPressedActions()
    setConfirmExit(null)
    setPauseOpen(true)
  }, [clearPressedActions])

  const closePauseMenu = React.useCallback(() => {
    setConfirmExit(null)
    setPauseOpen(false)
  }, [])

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

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-[max(0.85rem,env(safe-area-inset-left))] pt-[max(0.7rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex min-w-0 max-w-[58vw] items-center gap-2 rounded-lg border border-[#f0d381]/30 bg-black/48 px-3 py-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#f0d381] shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <HealthPips current={hud.health} max={hud.maxHealth} />
          <span className="h-4 w-px bg-[#f0d381]/30" />
          <span className="whitespace-nowrap">{hud.coins}/{hud.totalCoins}</span>
          <span className="h-4 w-px bg-[#f0d381]/30" />
          <span className="whitespace-nowrap">{hud.score}</span>
          <span className="hidden truncate text-[#d9c79f] sm:inline">{hud.defeated ? 'Gate Reached' : hud.objective}</span>
        </div>

        <button
          type="button"
          aria-label="Open pause menu"
          onClick={openPauseMenu}
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e8c46b]/40 bg-black/48 text-[#f3d88d] shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition hover:border-[#f0d381]/70 hover:bg-[#2c2110]/75 focus:outline-none focus:ring-2 focus:ring-[#f0d381]/55"
        >
          <Pause className="h-5 w-5" />
        </button>
      </div>

      <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-[max(1rem,env(safe-area-inset-left))] pb-[max(0.85rem,env(safe-area-inset-bottom))] transition-opacity ${menuOpen ? 'opacity-35' : 'opacity-100'}`}>
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

      <div className="pointer-events-none absolute right-[max(1rem,env(safe-area-inset-right))] top-20 z-20 hidden rounded-lg border border-[#f0d381]/28 bg-black/42 px-3 py-2 text-[0.66rem] font-black uppercase tracking-[0.12em] text-[#d9c79f] shadow-[0_10px_28px_rgba(0,0,0,0.42)] backdrop-blur-md sm:flex">
        <CircleDot className="mr-2 h-4 w-4 text-[#f0d381]" />
        {hud.enemyHealth}/{hud.enemyMaxHealth}
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
    </div>
  )
}

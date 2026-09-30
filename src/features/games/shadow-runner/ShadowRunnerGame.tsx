import React from 'react'
import {
  ChevronRight,
  Home,
  Map,
  BookOpen,
  Play,
  RotateCcw,
  Volume2,
} from 'lucide-react'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import type { ShadowRunnerSoundEvent } from './audio'
import { createShadowRunnerInputState, releaseShadowRunnerInputs, setShadowRunnerAction, type ShadowRunnerAction } from './game/input'
import { RunnerControls } from './components/RunnerControls'
import { RunnerHud } from './components/RunnerHud'
import { RunnerDialog } from './components/RunnerDialog'
import { RunnerFinale } from './components/RunnerFinale'
import { SHADOW_RUNNER_STORY } from './game/campaignStory'
import { getShadowRunnerCampaignMoment, getShadowRunnerDiscoveredMoments } from './game/campaignMoments'
import type { ShadowRunnerRuntimeLoadProgress } from './game/runtimeLoading'
import './shadowRunner.css'
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
  objectiveItems?: number
  totalObjectiveItems?: number
  masteryItems?: number
  totalMasteryItems?: number
}

interface ShadowRunnerGameProps {
  levelId: ShadowRunnerPlayableLevelId
  suspended?: boolean
  soundEffectsEnabled?: boolean
  soundEffectsAllowed?: boolean
  onBackToTitle?: () => void
  onBackToMap?: () => void
  nextLevelId?: ShadowRunnerPlayableLevelId
  onPlayLevel?: (levelId: ShadowRunnerPlayableLevelId) => void
  onLevelComplete?: (levelId: ShadowRunnerPlayableLevelId, summary: ShadowRunnerLevelCompletionSummary) => void
  onToggleSoundEffects?: () => void
  onSoundEvent?: (event: ShadowRunnerSoundEvent) => void
  discoveredStoryIds?: readonly string[]
  onStoryDiscover?: (levelId: ShadowRunnerPlayableLevelId, momentId: string) => void
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

type ShadowRunnerPhaserGameHandle = {
  destroy: (removeCanvas: boolean, noReturn?: boolean) => void
  setPaused: (paused: boolean) => void
  setReducedMotion: (reducedMotion: boolean) => void
  scale?: { refresh: () => void }
}

export function ShadowRunnerGame({
  levelId,
  suspended = false,
  soundEffectsEnabled = true,
  soundEffectsAllowed = true,
  onBackToTitle,
  onBackToMap,
  nextLevelId,
  onPlayLevel,
  onLevelComplete,
  onToggleSoundEffects,
  onSoundEvent,
  discoveredStoryIds = [],
  onStoryDiscover,
}: ShadowRunnerGameProps) {
  const gameMountRef = React.useRef<HTMLDivElement | null>(null)
  const gameRef = React.useRef<ShadowRunnerPhaserGameHandle | null>(null)
  const inputRef = React.useRef(createShadowRunnerInputState())
  const onSoundEventRef = React.useRef(onSoundEvent)
  onSoundEventRef.current = onSoundEvent
  const story = SHADOW_RUNNER_STORY[levelId]
  const [crouched, setCrouched] = React.useState(false)
  const [journalOpen, setJournalOpen] = React.useState(false)
  const [sessionStoryIds, setSessionStoryIds] = React.useState<string[]>([])
  const [noticeMomentId, setNoticeMomentId] = React.useState<string | null>(null)
  const storyCallbackRef = React.useRef(onStoryDiscover)
  storyCallbackRef.current = onStoryDiscover
  const knownStoryRef = React.useRef(discoveredStoryIds)
  knownStoryRef.current = discoveredStoryIds
  const journalMoments = getShadowRunnerDiscoveredMoments([...discoveredStoryIds, ...sessionStoryIds]).filter(moment => moment.levelId === levelId)
  const noticeMoment = noticeMomentId ? getShadowRunnerCampaignMoment(levelId, noticeMomentId) : undefined
  const levelConfig = React.useMemo(() => getShadowRunnerLevelConfig(levelId), [levelId])
  const { isReducedMotion } = useComfortPreferences()
  const reducedMotionRef = React.useRef(isReducedMotion)
  reducedMotionRef.current = isReducedMotion
  const [hud, setHud] = React.useState<ShadowRunnerHudState>(() => createDefaultHud(levelId))
  const [ready, setReady] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [loadProgress, setLoadProgress] = React.useState<ShadowRunnerRuntimeLoadProgress | null>(null)
  const [pauseOpen, setPauseOpen] = React.useState(false)
  const [confirmExit, setConfirmExit] = React.useState<null | 'title'>(null)
  const [restartToken, setRestartToken] = React.useState(0)
  const [routeIntroVisible, setRouteIntroVisible] = React.useState(true)
  const [finaleBeatIndex, setFinaleBeatIndex] = React.useState(0)
  const [finaleComplete, setFinaleComplete] = React.useState(false)
  const completionReportedRef = React.useRef(false)
  const readyRef = React.useRef(false)
  const sceneUiReady = ready && !loadError
  const menuOpen = pauseOpen || confirmExit !== null || journalOpen
  const overlayOpen = suspended || !sceneUiReady || routeIntroVisible || menuOpen || hud.defeated || hud.outOfLives

  const clearPressedActions = React.useCallback(() => {
    releaseShadowRunnerInputs(inputRef.current)
    setCrouched(false)
  }, [])

  React.useEffect(() => {
    let disposed = false
    let game: ShadowRunnerPhaserGameHandle | null = null

    inputRef.current = createShadowRunnerInputState()
    setCrouched(false)
    setReady(false)
    readyRef.current = false
    setLoadError(null)
    setLoadProgress(null)
    setSessionStoryIds([])
    setNoticeMomentId(null)
    setHud(createDefaultHud(levelId))
    setFinaleBeatIndex(0)
    setFinaleComplete(false)
    completionReportedRef.current = false

    const startupDeadline = window.setTimeout(() => {
      if (disposed || readyRef.current) return
      disposed = true
      game?.destroy(true)
      game = null
      gameRef.current = null
      setLoadError('The route could not finish loading. Check your connection and try again.')
    }, 40000)

    void import('./game/createShadowRunnerPhaserGame')
      .then(({ createShadowRunnerPhaserGame }) => {
        if (disposed || !gameMountRef.current) return

        game = createShadowRunnerPhaserGame({
          parent: gameMountRef.current,
          input: inputRef,
          levelId,
          onHudChange: state => { if (!disposed) setHud(state) },
          onReady: () => {
            if (!disposed) {
              window.clearTimeout(startupDeadline)
              readyRef.current = true
              setReady(true)
            }
          },
          onLoadError: error => {
            if (disposed) return
            window.clearTimeout(startupDeadline)
            setLoadError(error.message)
          },
          onLoadProgress: progress => { if (!disposed) setLoadProgress(progress) },
          onStoryMoment: id => {
            if (disposed || !getShadowRunnerCampaignMoment(levelId, id)) return
            setSessionStoryIds(current => current.includes(id) ? current : [...current, id])
            if (!knownStoryRef.current.includes(id)) setNoticeMomentId(id)
            storyCallbackRef.current?.(levelId, id)
          },
          onSoundEvent: event => onSoundEventRef.current?.(event),
          reducedMotion: reducedMotionRef.current,
        }) as ShadowRunnerPhaserGameHandle
        gameRef.current = game
      })
      .catch(error => {
        if (disposed) return
        window.clearTimeout(startupDeadline)
        setLoadError(error instanceof Error ? error.message : 'Unable to start Shadow Runner')
      })

    return () => {
      disposed = true
      window.clearTimeout(startupDeadline)
      readyRef.current = false
      inputRef.current = createShadowRunnerInputState()
      game?.destroy(true)
      gameRef.current = null
    }
  }, [levelId, restartToken])

  React.useEffect(() => {
    setRouteIntroVisible(restartToken === 0)
  }, [levelId, restartToken])

  React.useEffect(() => {
    if (!readyRef.current || hud.levelId !== levelId || !hud.defeated || completionReportedRef.current) return
    completionReportedRef.current = true
    onLevelComplete?.(levelId, {
      score: hud.score,
      coinsCollected: hud.coins,
      totalCoins: hud.totalCoins,
      enemiesDefeated: hud.enemiesDefeated,
      totalEnemies: hud.totalEnemies,
      fullClear: hud.fullClear,
      perfectRoute: hud.perfectRoute,
      objectiveItems: hud.objectiveItems,
      totalObjectiveItems: hud.totalObjectiveItems,
      masteryItems: hud.masteryItems,
      totalMasteryItems: hud.totalMasteryItems,
    })
  }, [hud.coins, hud.defeated, hud.enemiesDefeated, hud.fullClear, hud.perfectRoute, hud.score, hud.totalCoins, hud.totalEnemies, hud.objectiveItems, hud.totalObjectiveItems, hud.masteryItems, hud.totalMasteryItems, hud.levelId, levelId, onLevelComplete])

  React.useEffect(() => {
    const game = gameRef.current
    if (!game) return
    if (overlayOpen) clearPressedActions()
    game.setPaused(overlayOpen)
  }, [clearPressedActions, overlayOpen, ready])

  React.useEffect(() => {
    gameRef.current?.setReducedMotion(isReducedMotion)
  }, [isReducedMotion, ready])

  React.useEffect(() => {
    if (!noticeMomentId || overlayOpen) return
    const timer = window.setTimeout(() => setNoticeMomentId(null), 6500)
    return () => window.clearTimeout(timer)
  }, [noticeMomentId, overlayOpen])

  React.useEffect(() => {
    if (!suspended && ready) gameRef.current?.scale?.refresh()
  }, [suspended, ready])

  const setAction = React.useCallback((action: ShadowRunnerAction, pressed: boolean) => {
    if (overlayOpen && pressed) return
    setShadowRunnerAction(inputRef.current, action, pressed)
    if (action === 'jump' && pressed) setCrouched(false)
  }, [overlayOpen])

  const toggleCrouch = React.useCallback(() => {
    if (overlayOpen) return

    const state = inputRef.current
    state.crouch = !state.crouch
    setCrouched(state.crouch)
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
    setJournalOpen(false)
    setPauseOpen(false)
  }, [onSoundEvent])

  React.useEffect(() => {
    const pauseForInterruption = () => {
      clearPressedActions()
      if (!readyRef.current || loadError) return
      setPauseOpen(true)
    }
    const onVisibility = () => { if (document.hidden) pauseForInterruption() }
    const onResize = () => { if (window.innerHeight > window.innerWidth) pauseForInterruption() }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !event.repeat && !overlayOpen) {
        event.preventDefault()
        pauseForInterruption()
      }
    }
    window.addEventListener('blur', pauseForInterruption)
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('blur', pauseForInterruption)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
    }
  }, [clearPressedActions, overlayOpen, loadError])

  const restartLevel = React.useCallback(() => {
    clearPressedActions()
    setConfirmExit(null)
    setPauseOpen(false)
    onSoundEvent?.('level-select')
    setJournalOpen(false)
    setRouteIntroVisible(false)
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
      id: 'journal',
      label: 'Courier journal',
      icon: <BookOpen className="h-4 w-4" />,
      onClick: () => setJournalOpen(true),
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
  ], [closePauseMenu, onSoundEvent])

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
      className="runner-game relative h-full w-full overflow-hidden bg-[#02040a] text-[#f6e6bb]"
    >


      <div
        onContextMenu={event => event.preventDefault()}
        ref={gameMountRef}
        aria-label="Shadow Runner playable level"
        className="shadow-runner-game-stage absolute inset-0"
      />

      {(!ready || loadError) && !suspended && (
        <RunnerDialog title={loadError ? 'Route unavailable' : 'Loading route'} eyebrow={levelConfig.title}>
          <p role="status">{loadError ?? 'Preparing the city.'}</p>
          {!loadError && loadProgress && <progress className="runner-load-progress" aria-label="Route loading" value={loadProgress.progress} max={1} />}
          <div className="runner-dialog-actions">
            {loadError && <button type="button" className="runner-command" onClick={restartLevel}><RotateCcw size={18} />Retry</button>}
            <button type="button" className="runner-command secondary" onClick={onBackToMap ?? onBackToTitle}><Map size={18} />Return to Map</button>
          </div>
        </RunnerDialog>
      )}

      {sceneUiReady && routeIntroVisible && !menuOpen && !hud.defeated && !hud.outOfLives && !suspended && (
        <RunnerDialog title={levelConfig.title} eyebrow={story.act} image={story.transitionAsset ?? levelConfig.backgroundAsset}>
          <p className="runner-delivery">{story.delivery}</p>
          <p>{story.briefing}</p>
          <div className="runner-dialog-actions">
            <button type="button" className="runner-command" onClick={() => setRouteIntroVisible(false)}><Play size={18} />Begin delivery</button>
            <button type="button" className="runner-command secondary" onClick={onBackToMap ?? onBackToTitle}><Map size={18} />Return to Map</button>
          </div>
        </RunnerDialog>
      )}

      <RunnerHud hud={hud} onPause={openPauseMenu} paused={overlayOpen} />
      {!overlayOpen && <RunnerControls crouched={crouched} igniteReady={hud.deliveryState === 'ready' || hud.deliveryState === 'igniting'}
        disabled={hud.deliveryState === 'igniting'} onAction={setAction} onToggleCrouch={toggleCrouch} />}
      {!overlayOpen && noticeMoment && <button type="button" className="runner-discovery" title="Courier journal"
        onClick={() => { setJournalOpen(true); setNoticeMomentId(null) }}><BookOpen size={17} aria-hidden="true" /><span>{noticeMoment.title}</span></button>}

      {sceneUiReady && journalOpen && !suspended && (
        <RunnerDialog title="Courier journal" eyebrow={levelConfig.title} onClose={() => setJournalOpen(false)}>
          <p className="runner-delivery">{story.delivery}</p><p>{story.briefing}</p>
          {journalMoments.map(moment => <article className="runner-journal-entry" key={moment.id}><h3>{moment.title}</h3><p>{moment.body}</p></article>)}
          <dl className="runner-results-grid">
            <div><dt>Coins</dt><dd>{hud.coins}/{hud.totalCoins}</dd></div>
            <div><dt>Enemies</dt><dd>{hud.enemiesDefeated}/{hud.totalEnemies}</dd></div>
            {hud.totalMasteryItems > 0 && <div><dt>{hud.masteryLabel}</dt><dd>{hud.masteryItems}/{hud.totalMasteryItems}</dd></div>}
          </dl>
        </RunnerDialog>
      )}

      {sceneUiReady && pauseOpen && !confirmExit && !journalOpen && !suspended && (
        <ShadowRunnerScrollMenu
          title="Pause"
          subtitle={hud.levelTitle}
          actions={pauseActions}
          onClose={closePauseMenu}
        >
          <label className="runner-option runner-pause-sound"><Volume2 size={18} aria-hidden="true" />
            <span>Sound effects{!soundEffectsAllowed && <small>Off in Comfort</small>}</span><input type="checkbox" checked={soundEffectsEnabled && soundEffectsAllowed}
              disabled={!onToggleSoundEffects || !soundEffectsAllowed} onChange={onToggleSoundEffects} />
          </label>
        </ShadowRunnerScrollMenu>
      )}

      {sceneUiReady && confirmExit && !suspended && (
        <ShadowRunnerScrollMenu
          title="Quit Level?"
          subtitle="Return to Shadow Runner menu"
          actions={confirmActions}
          onClose={() => setConfirmExit(null)}
        />
      )}

      {sceneUiReady && hud.outOfLives && !menuOpen && !suspended && (
        <ShadowRunnerScrollMenu
          title="Route Failed"
          subtitle={story.failure}
          actions={routeFailedActions}
        />
      )}

      {sceneUiReady && hud.defeated && levelConfig.finale && !finaleComplete && !menuOpen && !suspended && (
        <RunnerFinale finale={levelConfig.finale} beatIndex={finaleBeatIndex}
          reducedMotion={isReducedMotion} onAdvance={advanceFinale}
          onComplete={() => setFinaleComplete(true)} />
      )}

      {sceneUiReady && hud.defeated && (!levelConfig.finale || finaleComplete) && !menuOpen && !suspended && (
        <RunnerDialog title={hud.perfectRoute ? 'Perfect Route' : hud.fullClear ? 'Full Clear' : 'Level Complete'} eyebrow={levelConfig.title}>
          <p className="runner-delivery">{hud.completionLine}</p><p>{story.dispatch}</p>
          <dl className="runner-results-grid">
            <div><dt>Score</dt><dd>{hud.score.toLocaleString()}</dd></div>
            <div><dt>Coins</dt><dd>{hud.coins}/{hud.totalCoins}</dd></div>
            <div><dt>Enemies</dt><dd>{hud.enemiesDefeated}/{hud.totalEnemies}</dd></div>
            {hud.totalMasteryItems > 0 && <div><dt>{hud.masteryLabel}</dt><dd>{hud.masteryItems}/{hud.totalMasteryItems}</dd></div>}
          </dl>
          <p className="runner-note">{hud.perfectRoute ? 'Every coin, opponent and relic. No lives lost.' : hud.fullClear ? 'Every coin, opponent and relic recovered.' : 'The message arrived. The hidden routes are still waiting.'}</p>
          {levelConfig.finale && <button type="button" className="runner-command secondary" onClick={() => { setFinaleBeatIndex(0); setFinaleComplete(false) }}><Play size={18} />Replay ending</button>}
          <div className="runner-dialog-actions">{levelCompleteActions.map(action => (
            <button key={action.id} type="button" className={action.id === 'next-route' ? 'runner-command' : 'runner-command secondary'} onClick={action.onClick}>{action.icon}{action.label}</button>
          ))}</div>
        </RunnerDialog>
      )}
    </div>
  )
}

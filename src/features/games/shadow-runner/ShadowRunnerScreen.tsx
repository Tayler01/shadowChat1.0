import React from 'react'
import { useLandscapeGate as useRotateGate } from '../shared/useLandscapeGate'
import { ArrowLeft, LogOut, Music, RotateCcw, Volume2 } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import { SHADOW_RUNNER_ASSETS } from './assets/manifest'
import {
  SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY, SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY,
  createShadowRunnerSfxController, readShadowRunnerAudioPreference, writeShadowRunnerAudioPreference,
  type ShadowRunnerSoundEvent, type ShadowRunnerSfxController,
} from './audio'
import { SHADOW_RUNNER_CAMPAIGN_LEVELS, type ShadowRunnerPlayableLevelId } from './game/levels'
import { loadShadowRunnerImages } from './loading'
import { useShadowRunnerProgress } from './useShadowRunnerProgress'
import { ShadowRunnerGame } from './ShadowRunnerGame'
import { RunnerDialog } from './components/RunnerDialog'
import { RunnerDialogSuspensionContext } from './components/runnerDialogSuspension'
import { RunnerCampaign } from './components/RunnerCampaign'
import { RunnerTitle } from './components/RunnerTitle'
import { RunnerSaveStatus } from './components/RunnerSaveStatus'

interface ShadowRunnerScreenProps {
  onExit?: () => void
  musicPlaying?: boolean
  onPlayMusic?: () => void
  onPauseMusic?: () => void
}

const EMPTY_IMAGE_SOURCES = [] as const
const TITLE_IMAGE_SOURCES = [
  SHADOW_RUNNER_ASSETS.rebuild.eastGateMoonriseBackground,
  SHADOW_RUNNER_ASSETS.hero.menuIdleCapeStrip,
] as const
const MENU_SOUND_EVENTS: readonly ShadowRunnerSoundEvent[] = ['menu-click', 'menu-back', 'menu-denied', 'level-select', 'pause', 'resume']
const GAMEPLAY_SOUND_EVENTS: readonly ShadowRunnerSoundEvent[] = ['jump', 'double-jump', 'land', 'sword-swing', 'enemy-hit', 'stomp', 'player-hurt', 'life-lost', 'respawn', 'coin', 'enemy-defeat', 'level-complete', 'route-failed']

function useSpriteFrame(frameCount: number, intervalMs: number, active: boolean) {
  const [frame, setFrame] = React.useState(0)
  const { isReducedMotion } = useComfortPreferences()

  React.useEffect(() => {
    if (frameCount <= 1 || isReducedMotion || !active) return

    let interval: number | undefined
    const update = () => {
      window.clearInterval(interval)
      if (!document.hidden) interval = window.setInterval(() => {
        setFrame(current => (current + 1) % frameCount)
      }, intervalMs)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', update)
    }
  }, [active, frameCount, intervalMs, isReducedMotion])

  return frame
}

function useImagePreload(sources: readonly string[]) {
  const [result, setResult] = React.useState<{ sources: readonly string[]; ready: boolean; error: string | null }>({ sources, ready: false, error: null })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    const controller = new AbortController()
    setResult({ sources, ready: sources.length === 0, error: null })
    void loadShadowRunnerImages(sources, { signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) setResult({ sources, ready: true, error: null })
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ sources, ready: false, error: error instanceof Error ? error.message : 'Required images could not load.' })
    })
    return () => controller.abort()
  }, [sources, attempt])

  return {
    ready: result.sources === sources && result.ready,
    error: result.sources === sources ? result.error : null,
    retry: () => setAttempt(value => value + 1),
  }
}


function getNextPlayableLevelId(levelId: ShadowRunnerPlayableLevelId): ShadowRunnerPlayableLevelId | undefined {
  if (levelId === 'tutorial') return 'level-1'

  const campaignLevel = SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.playableLevelId === levelId)
  if (!campaignLevel) return undefined

  return SHADOW_RUNNER_CAMPAIGN_LEVELS.find(level => level.levelNumber === campaignLevel.levelNumber + 1)?.playableLevelId
}


function ShadowRunnerLoadingStatus({ title, error, onRetry, onBack }: {
  title: string
  error: string | null
  onRetry: () => void
  onBack: () => void
}) {
  return (
    <RunnerDialog title={error ? 'Unable to load' : title}>
      <p role={error ? 'alert' : 'status'}>{error ?? 'Preparing the courier road.'}</p>
      <div className="runner-dialog-actions">
        {error && <button type="button" className="runner-command" onClick={onRetry}><RotateCcw size={18} />Retry</button>}
        <button type="button" className="runner-command secondary" onClick={onBack}><ArrowLeft size={18} />Back</button>
      </div>
    </RunnerDialog>
  )
}

export function ShadowRunnerScreen(props: ShadowRunnerScreenProps) {
  const { user, loading } = useAuth()
  if (loading && !user) return (
    <div className="relative h-full min-h-[100dvh] bg-black">
      <ShadowRunnerLoadingStatus title="Restoring account" error={null} onRetry={() => undefined} onBack={() => props.onExit?.()} />
    </div>
  )
  // An account switch ends the route and disposes the previous owner's queue.
  return <ShadowRunnerAccountSession key={user?.id ?? 'guest'} {...props} ownerId={user?.id ?? null} />
}

function ShadowRunnerAccountSession({ ownerId, onExit, musicPlaying = false, onPlayMusic, onPauseMusic }: ShadowRunnerScreenProps & { ownerId: string | null }) {
  const { effectivePreferences, isReducedMotion } = useComfortPreferences()
  const orientationGateActive = useRotateGate()
  const [screen, setScreen] = React.useState<'title' | 'levels' | 'play'>('title')
  const [activeLevelId, setActiveLevelId] = React.useState<ShadowRunnerPlayableLevelId>('tutorial')
  const [titleOptionsOpen, setTitleOptionsOpen] = React.useState(false)
  const [saveDetailsOpen, setSaveDetailsOpen] = React.useState(false)
  const heroFrame = useSpriteFrame(8, 150, screen === 'title' && !titleOptionsOpen)
  const campaignProgress = useShadowRunnerProgress(ownerId)
  const [musicEnabled, setMusicEnabled] = React.useState(() => readShadowRunnerAudioPreference(SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY, true))
  const [soundEffectsEnabled, setSoundEffectsEnabled] = React.useState(() => readShadowRunnerAudioPreference(SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY, true))
  const effectiveSoundEffectsEnabled = soundEffectsEnabled && effectivePreferences.gameSfx
  const sfxControllerRef = React.useRef<ShadowRunnerSfxController | null>(null)
  const titleAssets = useImagePreload(screen === 'title' ? TITLE_IMAGE_SOURCES : EMPTY_IMAGE_SOURCES)
  const showRotateGate = orientationGateActive

  React.useEffect(() => {
    if (!effectiveSoundEffectsEnabled) return
    const controller = createShadowRunnerSfxController()
    sfxControllerRef.current = controller
    void controller.preload(MENU_SOUND_EVENTS)
    return () => { controller.dispose(); sfxControllerRef.current = null }
  }, [effectiveSoundEffectsEnabled])

  React.useEffect(() => {
    if (screen === 'play' && effectiveSoundEffectsEnabled) void sfxControllerRef.current?.preload(GAMEPLAY_SOUND_EVENTS)
  }, [screen, effectiveSoundEffectsEnabled])
  React.useEffect(() => { writeShadowRunnerAudioPreference(SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY, musicEnabled) }, [musicEnabled])
  React.useEffect(() => { writeShadowRunnerAudioPreference(SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY, soundEffectsEnabled) }, [soundEffectsEnabled])

  React.useEffect(() => {
    if (screen === 'play' || !musicEnabled || !effectivePreferences.gameMusic) onPauseMusic?.()
    else onPlayMusic?.()
  }, [musicEnabled, effectivePreferences.gameMusic, onPauseMusic, onPlayMusic, screen])

  const playSound = React.useCallback((event: ShadowRunnerSoundEvent) => {
    sfxControllerRef.current?.play(event, effectiveSoundEffectsEnabled)
  }, [effectiveSoundEffectsEnabled])
  const toggleSoundEffects = React.useCallback(() => {
    if (effectivePreferences.gameSfx) setSoundEffectsEnabled(current => !current)
  }, [effectivePreferences.gameSfx])
  const startRoute = React.useCallback((id: ShadowRunnerPlayableLevelId) => {
    playSound('level-select')
    setTitleOptionsOpen(false)
    setActiveLevelId(id)
    setScreen('play')
  }, [playSound])
  const showSaveStatus = saveDetailsOpen || screen !== 'play' || Boolean(campaignProgress.syncError || campaignProgress.storageError || campaignProgress.pendingCount)

  return (
    <RunnerDialogSuspensionContext.Provider value={showRotateGate}>
    <section className="runner-session" data-runner-reduced-motion={isReducedMotion}>
      <div className="runner-session-stage">
        {showRotateGate && <RunnerDialog title="Rotate Phone" eyebrow="Shadow Runner" suspended={false}>
          <p>Turn your phone sideways to continue.</p>
          <div className="runner-dialog-actions">
            {screen === 'play' && <button type="button" className="runner-command" onClick={() => setScreen('levels')}><ArrowLeft size={18} />Return to Map</button>}
            <button type="button" className="runner-command secondary" onClick={onExit}><LogOut size={18} />Exit game</button>
          </div>
        </RunnerDialog>}
        <div className={showRotateGate ? 'runner-session-content hidden' : 'runner-session-content'}>
          {screen === 'play' ? (
            <ShadowRunnerGame key={activeLevelId} levelId={activeLevelId} soundEffectsEnabled={effectiveSoundEffectsEnabled} soundEffectsAllowed={effectivePreferences.gameSfx} suspended={showRotateGate || saveDetailsOpen}
              onToggleSoundEffects={toggleSoundEffects} onSoundEvent={playSound}
              discoveredStoryIds={campaignProgress.discoveredStoryIds} onStoryDiscover={campaignProgress.discover}
              onBackToTitle={() => setScreen('title')} onBackToMap={() => setScreen('levels')}
              nextLevelId={getNextPlayableLevelId(activeLevelId)} onPlayLevel={startRoute}
              onLevelComplete={campaignProgress.complete} />
          ) : screen === 'levels' ? (
            <RunnerCampaign progress={campaignProgress} onBack={() => { playSound('menu-back'); setScreen('title') }} onPlayLevel={startRoute} />
          ) : !titleAssets.ready ? (
            <ShadowRunnerLoadingStatus title="Loading Shadow Runner" error={titleAssets.error} onRetry={titleAssets.retry} onBack={() => onExit?.()} />
          ) : (
            <RunnerTitle completedLevels={campaignProgress.completedLevels} heroFrame={heroFrame} onPlay={startRoute}
              onMap={() => { playSound('menu-click'); setScreen('levels') }}
              onOptions={() => { playSound('menu-click'); setTitleOptionsOpen(true) }} onExit={onExit} />
          )}
        </div>
        {titleOptionsOpen && <RunnerDialog title="Options" eyebrow="Shadow Runner" onClose={() => setTitleOptionsOpen(false)}>
          <label className="runner-option"><Music size={20} /><span>Music{!effectivePreferences.gameMusic && <small>Off in Comfort</small>}</span>
            <input type="checkbox" checked={musicEnabled && effectivePreferences.gameMusic} disabled={!effectivePreferences.gameMusic}
              onChange={event => { setMusicEnabled(event.target.checked); if (event.target.checked) onPlayMusic?.(); else onPauseMusic?.() }} /></label>
          {musicEnabled && effectivePreferences.gameMusic && !musicPlaying && <button type="button" className="runner-command secondary" onClick={onPlayMusic}><Music size={18} />Start Music</button>}
          <label className="runner-option"><Volume2 size={20} /><span>Sound effects{!effectivePreferences.gameSfx && <small>Off in Comfort</small>}</span>
            <input type="checkbox" checked={effectiveSoundEffectsEnabled} disabled={!effectivePreferences.gameSfx} onChange={toggleSoundEffects} /></label>
          <div className="runner-dialog-actions"><button type="button" className="runner-command secondary" onClick={onExit}><LogOut size={18} />Exit Game</button></div>
        </RunnerDialog>}
      </div>
      {showSaveStatus && <RunnerSaveStatus progress={campaignProgress} onDetailsChange={setSaveDetailsOpen} onRetry={() => { void campaignProgress.retry() }} />}
    </section>
    </RunnerDialogSuspensionContext.Provider>
  )
}

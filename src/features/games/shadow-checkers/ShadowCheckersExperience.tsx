import React from 'react'
import { Bot, ChevronLeft, Swords, Users } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { SHADOW_CHECKERS_ASSETS } from './assets/manifest'
import { SHADOW_CHECKERS_AI_LEVELS, type ShadowCheckersAiDifficulty } from './engine/checkersAi'
import type { ShadowCheckersScreenProps } from './ShadowCheckersScreen'
import { ShadowCheckersSoloScreen } from './ShadowCheckersSoloScreen'
import { useLandscapeGate } from '../shared/useLandscapeGate'

const LazyShadowCheckersScreen = React.lazy(() => import('./ShadowCheckersScreen').then(module => ({ default: module.ShadowCheckersScreen })))

type ExperienceMode = 'choose' | 'solo-setup' | 'solo' | 'multiplayer'

export type ShadowCheckersExperienceProps = ShadowCheckersScreenProps

const levelDetails: Record<ShadowCheckersAiDifficulty, string> = {
  rookie: 'Learns the board one move at a time.',
  casual: 'A relaxed opponent that sees simple replies.',
  challenger: 'Plans combinations and punishes loose pieces.',
  master: 'Searches deepest for the strongest mobile play.',
}

export function ShadowCheckersExperience(props: ShadowCheckersExperienceProps) {
  const [mode, setMode] = React.useState<ExperienceMode>(props.initialMatchId ? 'multiplayer' : 'choose')
  const [difficulty, setDifficulty] = React.useState<ShadowCheckersAiDifficulty>('casual')
  const rotateGate = useLandscapeGate()
  const rootRef = React.useRef<HTMLDivElement>(null)
  const orientationLocked = React.useRef(false)
  const landscapeRequest = React.useRef(0)

  React.useEffect(() => {
    if (props.initialMatchId) setMode('multiplayer')
  }, [props.initialMatchId])

  const requestLandscape = React.useCallback(async () => {
    const root = rootRef.current
    if (!root || (document.fullscreenElement && document.fullscreenElement !== root)) return
    const request = ++landscapeRequest.current
    const orientation = window.screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> }
    if (!document.fullscreenElement && root.requestFullscreen) {
      await root.requestFullscreen().catch(() => {})
    }
    if (request !== landscapeRequest.current || rootRef.current !== root) {
      if (!root.isConnected && document.fullscreenElement === root) void document.exitFullscreen?.().catch(() => {})
      return
    }
    if (orientation?.lock) {
      await orientation.lock('landscape').then(() => {
        if (request === landscapeRequest.current && rootRef.current === root) orientationLocked.current = true
        else if (!root.isConnected && (!document.fullscreenElement || document.fullscreenElement === root)) orientation.unlock?.()
      }).catch(() => {})
    }
  }, [])

  React.useEffect(() => {
    const root = rootRef.current
    void requestLandscape()
    return () => {
      landscapeRequest.current += 1
      if (orientationLocked.current && (!document.fullscreenElement || document.fullscreenElement === root)) window.screen.orientation?.unlock?.()
      orientationLocked.current = false
      if (root && document.fullscreenElement === root) void document.exitFullscreen?.().catch(() => {})
    }
  }, [requestLandscape])

  let content: React.ReactNode
  if (mode === 'multiplayer') {
    content = <React.Suspense fallback={<div role="status" className="flex h-full items-center justify-center bg-black text-sm text-[#d9c79f]">Opening multiplayer tables…</div>}><LazyShadowCheckersScreen {...props} onExit={() => props.initialMatchId ? props.onExit?.() : setMode('choose')} /></React.Suspense>
  } else if (mode === 'solo') {
    content = (
      <ShadowCheckersSoloScreen
        difficulty={difficulty}
        onLeaveMode={() => setMode('choose')}
        musicPlaying={props.musicPlaying}
        musicEnabled={props.musicEnabled}
        masterSoundEnabled={props.masterSoundEnabled}
        audioBlocked={props.audioBlocked}
        onToggleMasterSound={props.onToggleMasterSound}
        onToggleMusic={props.onToggleMusic}
      />
    )
  } else content = (
    <>
      {rotateGate && (
        <div className="absolute inset-0 z-[150] flex flex-col items-center justify-center gap-3 bg-black px-8 text-center" role="dialog" aria-modal="true" aria-label="Rotate phone to play">
          <img src={SHADOW_CHECKERS_ASSETS.logo} alt="Shadow Checkers" className="h-16 max-w-[min(60vw,22rem)] object-contain" />
          <p className="font-serif text-2xl text-[#f0d381]">Rotate your phone</p>
          <p className="max-w-sm text-sm text-[#d9c79f]">Turn sideways to enter the study and choose your contest.</p>
          <button type="button" onClick={() => void requestLandscape()} className="min-h-11 rounded-lg border border-[#f0d381]/60 bg-[linear-gradient(180deg,#e7c873,#8d5c19)] px-5 font-semibold text-[#120d08]">Enter landscape</button>
          <button type="button" onClick={props.onExit} className="min-h-11 px-4 text-sm text-[#d9c79f]">Back to entertainment</button>
        </div>
      )}

      <img src={SHADOW_CHECKERS_ASSETS.background} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-55" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(215,170,70,0.20),transparent_36%),linear-gradient(90deg,rgba(0,0,0,.94),rgba(0,0,0,.42)_50%,rgba(0,0,0,.9))]" />

      <main className={cn('relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-[max(1rem,env(safe-area-inset-left))] py-[max(.55rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]', rotateGate && 'invisible')}>
        <section className="grid h-full max-h-[34rem] w-full max-w-5xl grid-cols-[minmax(7.5rem,.72fr)_minmax(0,1.45fr)] items-center gap-[clamp(.45rem,2vw,2.2rem)] overflow-hidden rounded-[1.3rem] border border-[#b9934c]/35 bg-black/72 p-[clamp(.55rem,1.8vw,1.25rem)] shadow-[0_28px_90px_rgba(0,0,0,.78)] backdrop-blur-sm">
          <div className="flex min-w-0 flex-col items-center text-center">
            <img src={SHADOW_CHECKERS_ASSETS.logo} alt="Shadow Checkers" className="max-h-[clamp(4.2rem,28vh,10rem)] w-full max-w-sm object-contain" />
            <p className="mt-1 max-w-xs text-[clamp(.72rem,2.2vh,.95rem)] leading-snug text-[#d9c79f]">Choose a human rival or face the study's computer opponent.</p>
            <button type="button" onClick={props.onExit} className="mt-3 inline-flex min-h-11 items-center gap-2 px-3 text-sm text-[#d9c79f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]"><ChevronLeft className="h-4 w-4" />Entertainment</button>
          </div>

          {mode === 'choose' ? (
            <div className="grid min-h-0 grid-cols-2 gap-3" aria-label="Choose game mode">
              <button type="button" onClick={() => setMode('solo-setup')} className="group flex min-h-36 flex-col justify-between rounded-[1.1rem] border border-[#d7aa46]/48 bg-[linear-gradient(145deg,rgba(84,58,21,.72),rgba(0,0,0,.88))] p-4 text-left shadow-xl transition hover:-translate-y-0.5 hover:border-[#f0d381] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]">
                <Bot className="h-8 w-8 text-[#f0d381]" />
                <span><strong className="block font-serif text-[clamp(1.15rem,4vh,1.8rem)] text-[#f6e0a2]">Play Computer</strong><span className="mt-1 block text-xs leading-snug text-[#d9c79f]">Instant private game with four difficulty levels.</span></span>
              </button>
              <button type="button" onClick={() => setMode('multiplayer')} className="group flex min-h-36 flex-col justify-between rounded-[1.1rem] border border-[#b9934c]/35 bg-[linear-gradient(145deg,rgba(33,37,44,.75),rgba(0,0,0,.9))] p-4 text-left shadow-xl transition hover:-translate-y-0.5 hover:border-[#f0d381] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]">
                <Users className="h-8 w-8 text-[#f0d381]" />
                <span><strong className="block font-serif text-[clamp(1.15rem,4vh,1.8rem)] text-[#f6e0a2]">Play a Person</strong><span className="mt-1 block text-xs leading-snug text-[#d9c79f]">Invite someone or join a live Shadow table.</span></span>
              </button>
            </div>
          ) : (
            <div className="flex min-h-0 flex-col">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#b9a16f]">Solo contest</p><h1 className="font-serif text-[clamp(1.1rem,4vh,1.8rem)] text-[#f6e0a2]">Choose Difficulty</h1></div>
                <button type="button" onClick={() => setMode('choose')} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm text-[#d9c79f]"><ChevronLeft className="h-4 w-4" />Modes</button>
              </div>
              <div className="grid min-h-0 grid-cols-2 gap-2" role="radiogroup" aria-label="Computer difficulty">
                {SHADOW_CHECKERS_AI_LEVELS.map(level => (
                  <button key={level.id} type="button" role="radio" aria-checked={difficulty === level.id} onClick={() => setDifficulty(level.id)} className={cn('min-h-11 rounded-[.8rem] border p-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381]', difficulty === level.id ? 'border-[#f0d381] bg-[#d7aa46]/20 shadow-[0_0_22px_rgba(215,170,70,.16)]' : 'border-[#b9934c]/28 bg-black/55')}>
                    <span className="flex items-center justify-between gap-2"><strong className="text-sm text-[#f6e0a2]">{level.label}</strong><span className="text-[10px] uppercase tracking-wider text-[#b9a16f]">Depth {level.maxDepth}</span></span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-[#c7b58e]">{levelDetails[level.id]}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setMode('solo')} className="mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-[.8rem] border border-[#f0d381]/60 bg-[linear-gradient(180deg,#e7c873,#8d5c19)] px-5 text-sm font-bold text-[#120d08] shadow-[0_14px_32px_rgba(215,170,70,.25)]"><Swords className="h-4 w-4" />Enter the Study</button>
            </div>
          )}
        </section>
      </main>
    </>
  )

  return <div ref={rootRef} className="relative flex h-full min-h-0 flex-col overflow-hidden bg-black text-[#f6e0a2]">{content}</div>
}

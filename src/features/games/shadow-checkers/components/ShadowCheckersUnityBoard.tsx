import './checkers-camera.css'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import type { CameraDelta } from '../../shadow-circuit/input/cameraGesture'
import { ShadowCheckersCameraSurface } from './ShadowCheckersCameraSurface'
import { useComfortPreferences } from '../../../../hooks/useComfortPreferences'
import { ShadowCheckersBoard, type ShadowCheckersBoardProps } from './ShadowCheckersBoard'
import { chooseSquare, makeUnitySnapshot, parseSquareEvent, UNITY_BRIDGE_VERSION, UNITY_FRAME_URL } from '../unity/bridge'
import { SHADOW_CHECKERS_ASSETS } from '../assets/manifest'

export interface ShadowCheckersBoardControls {
  openCameraHelp: () => void
  toggleAccessibleBoard: () => void
  resetCamera: () => void
}

export const ShadowCheckersUnityBoard = forwardRef<ShadowCheckersBoardControls, ShadowCheckersBoardProps & { fill?: boolean; paused?: boolean; masterSoundEnabled?: boolean; onPresentationComplete?: (state: ShadowCheckersBoardProps['state']) => void }>(function ShadowCheckersUnityBoard(props, controlsRef) {
  const { isReducedMotion, effectivePreferences } = useComfortPreferences()
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failure, setFailure] = useState(false)
  const [accessible, setAccessible] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [tactical, setTactical] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [cinematic, setCinematic] = useState('')
  const [cameraHelp, setCameraHelp] = useState(false)
  useImperativeHandle(controlsRef, () => ({
    openCameraHelp: () => setCameraHelp(true),
    toggleAccessibleBoard: () => { setAccessible(current => !current); setCameraHelp(false); restart() },
    resetCamera: () => camera('reset'),
  }))
  const sequence = useRef(0)
  const submitted = useRef<string | null>(null)
  const latest = useRef(props)
  latest.current = props
  const snapshot = useMemo(() => makeUnitySnapshot(props, String(++sequence.current), isReducedMotion, effectivePreferences.contrast === 'high', props.masterSoundEnabled !== false && effectivePreferences.gameSfx, props.masterSoundEnabled !== false && (effectivePreferences.gameMusic || effectivePreferences.gameSfx)),
    // Callback identities are kept in latest; snapshot changes track rendered state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.state, props.viewerSlot, props.selectedPieceId, props.legalMoves, props.helperMoves, props.highlightedMove, props.disabled, props.showHints, props.boardSkin, props.masterSoundEnabled, isReducedMotion, effectivePreferences.contrast, effectivePreferences.gameMusic, effectivePreferences.gameSfx])
  const latestSnapshot = useRef(snapshot)
  latestSnapshot.current = snapshot

  useEffect(() => { submitted.current = null }, [props.state, props.disabled])

  useEffect(() => {
    if (accessible) return
    let disposed = false
    let loaded = false
    let failed = false
    const fail = () => { failed = true; setReady(false); setCinematic(''); setFailure(true) }
    const post = (type: string, value: unknown) => frame.current?.contentWindow?.postMessage({ version: UNITY_BRIDGE_VERSION, type, value }, window.location.origin)
    const receive = (event: MessageEvent) => {
      if (disposed || failed || event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      if (!event.data || event.data.version !== UNITY_BRIDGE_VERSION) return
      if (event.data.type === 'ready') {
        loaded = true
        setReady(true)
        post('paused', document.hidden || Boolean(latest.current.paused))
        post('snapshot', latestSnapshot.current)
      } else if (event.data.type === 'presented' && event.data.revision === latestSnapshot.current.revision) {
        latest.current.onPresentationComplete?.(latest.current.state)
      } else if(event.data.type === 'cinematic' && typeof event.data.busy === 'boolean') {
        setCinematic(event.data.busy && typeof event.data.stage === 'string' ? event.data.stage : '')
      } else if (event.data.type === 'progress' && typeof event.data.value === 'number') {
        setProgress(Math.max(0, Math.min(100, Math.round(event.data.value * 100))))
      } else if (event.data.type === 'error') fail()
      else {
        if (document.hidden || latest.current.paused) return
        const position = parseSquareEvent(event.data, latestSnapshot.current.revision)
        if (!position || submitted.current) return
        const legal = latest.current.legalMoves.some(move => {
          const end = move.path[move.path.length - 1]
          return end.row === position.row && end.col === position.col
        })
        if (legal && !latest.current.disabled) submitted.current = latestSnapshot.current.revision
        try {
          if (chooseSquare(latest.current, position) !== 'move') submitted.current = null
        } catch (error) {
          submitted.current = null
          throw error
        }
      }
    }
    const visibility = () => post('paused', document.hidden || Boolean(latest.current.paused))
    window.addEventListener('message', receive)
    document.addEventListener('visibilitychange', visibility)
    const timeout = window.setTimeout(() => { if (!disposed && !loaded && !failed) fail() }, 120_000)
    // Fast Refresh can reattach this effect without replacing the running
    // iframe. Recover its ready state before the startup watchdog expires.
    post('requestReady', null)
    return () => {
      disposed = true
      window.clearTimeout(timeout)
      window.removeEventListener('message', receive)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [accessible, attempt])

  useEffect(() => {
    if (ready && !accessible) frame.current?.contentWindow?.postMessage({ version: UNITY_BRIDGE_VERSION, type: 'snapshot', value: snapshot }, window.location.origin)
  }, [snapshot, ready, accessible])
  useEffect(() => {
    if(ready && !accessible) frame.current?.contentWindow?.postMessage({version:UNITY_BRIDGE_VERSION,type:'paused',value:document.hidden || Boolean(props.paused)},window.location.origin)
  }, [props.paused,ready,accessible])

  useEffect(() => {
    // Results remain reachable when Unity is unavailable or the user chooses
    // the immediate, accessible board. Never guess an animation duration.
    if (accessible || failure) latest.current.onPresentationComplete?.(props.state)
  }, [accessible, failure, props.state])

  const camera = (value: string) => {
    frame.current?.contentWindow?.postMessage({ version: UNITY_BRIDGE_VERSION, type: 'camera', value }, window.location.origin)
    if (value === 'tactical') setTactical(current => !current)
    if (value === 'reset') setTactical(false)
  }
  const moveCamera = useCallback((value: CameraDelta) => {
    if (!ready || cinematic || props.paused || document.hidden) return
    frame.current?.contentWindow?.postMessage({ version: UNITY_BRIDGE_VERSION, type: 'cameraGesture', value }, window.location.origin)
    setTactical(false)
  }, [ready, cinematic, props.paused])
  const restart = () => { setFailure(false); setReady(false); setProgress(0); setTactical(false); setCinematic(''); setAttempt(current => current + 1) }
  const handleStudyKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!immersive) return
    if (event.key === 'Escape') { event.preventDefault(); setImmersive(false) }
    if (event.key === 'Tab') {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'))
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }
  const buttonClass = 'min-h-11 min-w-11 rounded-lg border border-[#b9934c]/25 bg-black/35 px-2.5 text-xs text-[#e6d2a8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381] disabled:opacity-40'
  return (
    <div className={`${immersive ? 'fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col bg-black p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]' : props.fill ? 'relative flex h-full min-h-0 w-full flex-col' : 'relative mx-auto w-full max-w-[42rem]'}${!ready ? ' z-30' : ''}`} data-checkers-renderer={accessible ? 'accessible' : 'unity'} role={immersive ? 'dialog' : undefined} aria-modal={immersive || undefined} aria-label={immersive ? 'Shadow Checkers study' : undefined} onKeyDown={handleStudyKeys}>
      {accessible ? <div className="mx-auto min-h-0 w-full flex-1 pt-12" style={props.fill ? { maxWidth: 'calc(100dvh - 112px)' } : undefined}><ShadowCheckersBoard {...props} boardSkin="classic" /></div> : (
        <div className={immersive || props.fill ? 'relative min-h-0 flex-1 overflow-hidden bg-black' : 'relative aspect-square overflow-hidden rounded-xl bg-black'}>
          <ShadowCheckersCameraSurface disabled={!ready || Boolean(cinematic) || Boolean(props.paused) || cameraHelp} onChange={moveCamera} onReset={() => camera('reset')} />
          <div className="checkers-player-viewport">
          {!failure && <iframe key={attempt} ref={frame} src={UNITY_FRAME_URL} title="Shadow Checkers 3D board"
            className="absolute inset-0 h-full w-full border-0" allow="fullscreen" tabIndex={-1} data-ready={ready ? 'true' : undefined} />}
          {ready && cinematic === 'intro' && <button type="button" onClick={() => camera('reset')} className={`${buttonClass} absolute bottom-3 right-3 bg-black/80`}>Skip room reveal</button>}
          {ready && cinematic === 'kinging' && <p role="status" className="pointer-events-none absolute inset-x-0 top-3 text-center font-serif text-lg tracking-widest text-[#f0d381]">Crowned</p>}
          {(!ready || failure) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-6 pb-20 text-center" role="status" aria-live="polite">
              <img src={SHADOW_CHECKERS_ASSETS.logo} alt="Shadow Checkers" className="h-[clamp(2.5rem,16vh,5rem)] max-w-[min(55vw,18rem)] object-contain" />
              <p className="font-serif text-xl text-[#f6e0a2]">{failure ? 'The 3D table could not load' : 'Preparing your table'}</p>
              {!failure && <><progress max={100} value={progress} aria-label="Loading 3D table" className="h-1.5 w-40 accent-[#d7aa46]" /><span className="text-xs text-[#b9a16f]">{progress}% · first visit may take a moment</span></>}
              {failure && <><p className="text-sm text-[#b9a16f]">Retry the table or use accessible controls to keep playing.</p><button type="button" className={buttonClass} onClick={restart}>Retry 3D table</button></>}
            </div>
          )}
          </div>
        </div>
      )}
      {cameraHelp && !accessible && <section className="checkers-camera-help" aria-label="Camera help panel" onKeyDown={event => { if(event.key === 'Escape'){event.stopPropagation();setCameraHelp(false)} }}>
        <div className="flex items-center justify-between gap-3"><h3 className="font-serif text-lg text-[#f0d381]">Around the table</h3><button type="button" className={buttonClass} aria-label="Close camera help" onClick={() => setCameraHelp(false)}><X size={18}/></button></div>
        <p>Drag over the left side of the room to look left, right, up or down. Spread two fingers to move closer; pinch together to pull back.</p>
        <p>Tap pieces on the board to play. With a keyboard, focus the left area and use arrows, + / −, or Home to reset.</p>
        <div className="flex gap-2"><button type="button" className={buttonClass} disabled={!ready || Boolean(props.paused)} aria-label="Reset table camera" onClick={() => { camera('reset');setCameraHelp(false) }}>Reset view</button><button type="button" className={buttonClass} disabled={!ready || Boolean(props.paused)} aria-pressed={tactical} onClick={() => {camera('tactical');setCameraHelp(false)}}>Overhead</button></div>
      </section>}
      <p className="sr-only" aria-live="polite">{props.state.winner ? 'Match complete.' : props.disabled ? 'Watching the table.' : 'Your turn. Select a piece, then its destination. Use Accessible board for keyboard controls.'}</p>
    </div>
  )
})

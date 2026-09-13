import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useComfortPreferences } from '../../../../hooks/useComfortPreferences'
import { ShadowCheckersBoard, type ShadowCheckersBoardProps } from './ShadowCheckersBoard'
import { chooseSquare, makeUnitySnapshot, parseSquareEvent, UNITY_BRIDGE_VERSION, UNITY_FRAME_URL } from '../unity/bridge'

export function ShadowCheckersUnityBoard(props: ShadowCheckersBoardProps & { fill?: boolean; paused?: boolean }) {
  const { isReducedMotion, effectivePreferences, updatePreferences } = useComfortPreferences()
  const frame = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState(0)
  const [failure, setFailure] = useState(false)
  const [accessible, setAccessible] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [tactical, setTactical] = useState(false)
  const [immersive, setImmersive] = useState(false)
  const [cinematic, setCinematic] = useState('')
  const sequence = useRef(0)
  const submitted = useRef<string | null>(null)
  const latest = useRef(props)
  latest.current = props
  const snapshot = useMemo(() => makeUnitySnapshot(props, String(++sequence.current), isReducedMotion, effectivePreferences.contrast === 'high', effectivePreferences.gameSfx),
    // Callback identities are kept in latest; snapshot changes track rendered state only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.state, props.viewerSlot, props.selectedPieceId, props.legalMoves, props.helperMoves, props.highlightedMove, props.disabled, props.showHints, props.boardSkin, isReducedMotion, effectivePreferences.contrast, effectivePreferences.gameSfx])
  const latestSnapshot = useRef(snapshot)
  latestSnapshot.current = snapshot

  useEffect(() => { submitted.current = null }, [props.state, props.disabled])

  useEffect(() => {
    if (accessible) return
    let disposed = false
    let loaded = false
    const post = (type: string, value: unknown) => frame.current?.contentWindow?.postMessage({ version: UNITY_BRIDGE_VERSION, type, value }, window.location.origin)
    const receive = (event: MessageEvent) => {
      if (disposed || event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      if (!event.data || event.data.version !== UNITY_BRIDGE_VERSION) return
      if (event.data.type === 'ready') {
        loaded = true
        setReady(true)
        post('snapshot', latestSnapshot.current)
        post('paused', document.hidden || Boolean(latest.current.paused))
      } else if(event.data.type === 'cinematic' && typeof event.data.busy === 'boolean') {
        setCinematic(event.data.busy && typeof event.data.stage === 'string' ? event.data.stage : '')
      } else if (event.data.type === 'progress' && typeof event.data.value === 'number') {
        setProgress(Math.max(0, Math.min(100, Math.round(event.data.value * 100))))
      } else if (event.data.type === 'error') setFailure(true)
      else {
        const position = parseSquareEvent(event.data, latestSnapshot.current.revision)
        if (!position || submitted.current) return
        const legal = latest.current.legalMoves.some(move => {
          const end = move.path[move.path.length - 1]
          return end.row === position.row && end.col === position.col
        })
        if (legal && !latest.current.disabled) submitted.current = latestSnapshot.current.revision
        chooseSquare(latest.current, position)
      }
    }
    const visibility = () => post('paused', document.hidden || Boolean(latest.current.paused))
    window.addEventListener('message', receive)
    document.addEventListener('visibilitychange', visibility)
    const timeout = window.setTimeout(() => { if (!disposed && !loaded) setFailure(true) }, 120_000)
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

  const camera = (value: string) => {
    frame.current?.contentWindow?.postMessage({ version: UNITY_BRIDGE_VERSION, type: 'camera', value }, window.location.origin)
    if (value === 'tactical') setTactical(current => !current)
    if (value === 'reset') setTactical(false)
  }
  const restart = () => { setFailure(false); setReady(false); setProgress(0); setTactical(false); setAttempt(current => current + 1) }
  const handleStudyKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!immersive) return
    if (event.key === 'Escape') { event.preventDefault(); setImmersive(false) }
    if (event.key === 'Tab') {
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const first = controls[0], last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  }
  const buttonClass = 'min-h-11 min-w-11 rounded-lg border border-[#b9934c]/25 bg-black/35 px-2.5 text-xs text-[#e6d2a8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f0d381] disabled:opacity-40'
  return (
    <div className={immersive ? 'fixed inset-0 z-[100] flex h-[100dvh] w-screen flex-col bg-[#030609] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]' : props.fill ? 'relative flex h-full min-h-0 w-full flex-col' : 'relative mx-auto w-full max-w-[42rem]'} data-checkers-renderer={accessible ? 'accessible' : 'unity'} role={immersive ? 'dialog' : undefined} aria-modal={immersive || undefined} aria-label={immersive ? 'Shadow Checkers study' : undefined} onKeyDown={handleStudyKeys}>
      {accessible ? <div className="mx-auto min-h-0 w-full flex-1" style={props.fill ? { maxWidth: 'calc(100dvh - 112px)' } : undefined}><ShadowCheckersBoard {...props} boardSkin="classic" /></div> : (
        <div className={immersive || props.fill ? 'relative min-h-0 flex-1 overflow-hidden bg-[#030609]' : 'relative aspect-square overflow-hidden rounded-xl bg-[#030609]'}>
          <iframe key={attempt} ref={frame} src={UNITY_FRAME_URL} title="Shadow Checkers 3D board"
            className="absolute inset-0 h-full w-full border-0" allow="fullscreen" tabIndex={-1} data-ready={ready ? 'true' : undefined} />
          {ready && cinematic === 'intro' && <button type="button" onClick={() => camera('reset')} className={`${buttonClass} absolute bottom-3 right-3 bg-black/80`}>Skip room reveal</button>}
          {ready && cinematic === 'kinging' && <p role="status" className="pointer-events-none absolute inset-x-0 top-3 text-center font-serif text-lg tracking-widest text-[#f0d381]">Crowned</p>}
          {(!ready || failure) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#060b10] p-6 text-center" role="status" aria-live="polite">
              <span className="text-[10px] uppercase tracking-[.3em] text-[#b9934c]">Shadow Checkers</span>
              <p className="font-serif text-xl text-[#f6e0a2]">{failure ? 'The 3D table could not load' : 'Preparing your table'}</p>
              {!failure && <><progress max={100} value={progress} aria-label="Loading 3D table" className="h-1.5 w-40 accent-[#d7aa46]" /><span className="text-xs text-[#b9a16f]">{progress}% · first visit may take a moment</span></>}
              {failure && <><p className="text-sm text-[#b9a16f]">Retry the table or use accessible controls to keep playing.</p><button type="button" className={buttonClass} onClick={restart}>Retry 3D table</button></>}
            </div>
          )}
        </div>
      )}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5 px-2 py-1" aria-label="Board view controls">
        {!accessible && <div className="flex gap-1.5">
          <button type="button" className={buttonClass} disabled={!ready} aria-label="Rotate table left" onClick={() => camera('left')}>↶</button>
          <button type="button" className={buttonClass} disabled={!ready} aria-label="Rotate table right" onClick={() => camera('right')}>↷</button>
          <button type="button" className={buttonClass} disabled={!ready} aria-pressed={tactical} onClick={() => camera('tactical')}>Overhead</button>
            <button type="button" className={buttonClass} disabled={!ready} aria-label="Reset table camera" onClick={() => camera('reset')}>Reset</button>
            <button type="button" className={buttonClass} aria-label="Study sound" aria-pressed={effectivePreferences.gameSfx} onClick={() => updatePreferences({gameSfx: !effectivePreferences.gameSfx})}>Sound {effectivePreferences.gameSfx ? 'on' : 'off'}</button>
        </div>}
        {!props.fill && <button type="button" className={buttonClass} aria-pressed={immersive} onClick={() => setImmersive(current => !current)}>{immersive ? 'Return to match' : 'Enter study'}</button>}
        <button type="button" className={buttonClass} aria-pressed={accessible} onClick={() => { setAccessible(current => !current); restart() }}>{accessible ? 'Return to 3D' : 'Accessible board'}</button>
      </div>
      <p className="sr-only" aria-live="polite">{props.state.winner ? 'Match complete.' : props.disabled ? 'Watching the table.' : 'Your turn. Select a piece, then its destination. Use Accessible board for keyboard controls.'}</p>
    </div>
  )
}

import React from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, ChevronsUp, Flame, Sword } from 'lucide-react'
import type { ShadowRunnerAction } from '../game/input'

export function RunnerActionButton({ action, label, disabled = false, onAction, children }: {
  action: ShadowRunnerAction
  label: string
  disabled?: boolean
  onAction: (action: ShadowRunnerAction, pressed: boolean) => void
  children: React.ReactNode
}) {
  const pointerRef = React.useRef<number | null>(null)
  const [pressed, setPressed] = React.useState(false)
  const release = React.useCallback(() => {
    pointerRef.current = null
    setPressed(false)
    onAction(action, false)
  }, [action, onAction])
  React.useEffect(() => () => onAction(action, false), [action, onAction])
  React.useEffect(() => {
    if (disabled) release()
  }, [disabled, release])
  return (
    <button type="button" className="runner-control" aria-label={label} title={label} data-pressed={pressed} disabled={disabled}
      onPointerDown={event => {
        if (disabled || pointerRef.current !== null || event.button > 0) return
        event.preventDefault()
        pointerRef.current = event.pointerId
        try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic pointer events may not own capture. */ }
        setPressed(true)
        onAction(action, true)
      }}
      onPointerUp={event => { if (pointerRef.current === event.pointerId) release() }}
      onPointerCancel={event => { if (pointerRef.current === event.pointerId) release() }}
      onLostPointerCapture={event => { if (pointerRef.current === event.pointerId) release() }}
      onKeyDown={event => {
        if (disabled) return
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        if (event.repeat) return
        setPressed(true)
        onAction(action, true)
      }}
      onKeyUp={event => {
        if (event.key !== ' ' && event.key !== 'Enter') return
        event.preventDefault()
        release()
      }}
      onBlur={release}
      onClick={event => {
        if (disabled || event.detail !== 0) return
        onAction(action, true)
        onAction(action, false)
      }}
      onContextMenu={event => event.preventDefault()}
    >{children}</button>
  )
}

export function RunnerControls({ crouched, igniteReady = false, disabled = false, onAction, onToggleCrouch }: {
  crouched: boolean
  igniteReady?: boolean
  disabled?: boolean
  onAction: (action: ShadowRunnerAction, pressed: boolean) => void
  onToggleCrouch: () => void
}) {
  return (
    <div className="runner-controls">
      <div role="group" aria-label="Movement controls" className="runner-movement">
        <RunnerActionButton action="left" label="Move left" disabled={disabled} onAction={onAction}><ArrowLeft aria-hidden="true" /></RunnerActionButton>
        <RunnerActionButton action="right" label="Move right" disabled={disabled} onAction={onAction}><ArrowRight aria-hidden="true" /></RunnerActionButton>
      </div>
      <div role="group" aria-label="Action controls" className="runner-actions">
        <button type="button" className="runner-control runner-crouch" aria-label="Crouch" title="Crouch" aria-pressed={crouched}
          disabled={disabled} onClick={() => { if (!disabled) onToggleCrouch() }}><ArrowDownToLine aria-hidden="true" /></button>
        <RunnerActionButton action="attack" label={igniteReady ? 'Ignite relay' : 'Sword attack'} disabled={disabled} onAction={onAction}>
          {igniteReady ? <Flame aria-hidden="true" /> : <Sword aria-hidden="true" />}
        </RunnerActionButton>
        <RunnerActionButton action="jump" label="Jump" disabled={disabled} onAction={onAction}><ChevronsUp aria-hidden="true" /></RunnerActionButton>
      </div>
    </div>
  )
}

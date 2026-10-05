import { useEffect, useRef } from 'react'
import { CameraGesture, type CameraDelta } from '../../shadow-circuit/input/cameraGesture'

export function ShadowCheckersCameraSurface({ disabled, onChange, onReset }: {
  disabled: boolean; onChange: (delta: CameraDelta) => void; onReset: () => void
}) {
  const gesture = useRef(new CameraGesture())
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => { gesture.current.clear() }, [disabled])
  useEffect(() => {
    const current = gesture.current
    const clear = () => current.clear()
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', clear)
    return () => { clear(); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear) }
  }, [])
  useEffect(() => {
    const element = surface.current
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      if (!disabled) onChange({ zoomRatio: Math.exp(Math.max(-100, Math.min(100, event.deltaY)) * .002) })
    }
    element?.addEventListener('wheel', wheel, { passive: false })
    return () => element?.removeEventListener('wheel', wheel)
  }, [disabled, onChange])
  return <div ref={surface} className="checkers-camera-surface" role="group" tabIndex={disabled ? -1 : 0}
    aria-disabled={disabled} aria-label="Camera: drag left or right to orbit, up or down to tilt; pinch to zoom. Arrow keys move, plus and minus zoom, Home resets."
    onPointerDown={event => {
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return
      if (gesture.current.start(event.pointerId, { x: event.clientX, y: event.clientY })) {
        event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault()
      }
    }}
    onPointerMove={event => {
      if (disabled) return
      const rect = event.currentTarget.getBoundingClientRect()
      const delta = gesture.current.move(event.pointerId, { x: event.clientX, y: event.clientY }, rect.width, rect.height)
      if (delta) { onChange({ ...delta, turn: (delta.turn ?? 0) * -.45, tilt: (delta.tilt ?? 0) * -.65 }); event.preventDefault() }
    }}
    onPointerUp={event => gesture.current.end(event.pointerId)}
    onPointerCancel={event => gesture.current.end(event.pointerId)}
    onLostPointerCapture={event => gesture.current.end(event.pointerId)}
    onContextMenu={event => event.preventDefault()}
    onKeyDown={event => {
      if (disabled) return
      const keys: Record<string, CameraDelta> = { ArrowLeft: { turn: .04 }, ArrowRight: { turn: -.04 }, ArrowUp: { tilt: .025 }, ArrowDown: { tilt: -.025 }, '+': { zoomRatio: .96 }, '=': { zoomRatio: .96 }, '-': { zoomRatio: 1.04 } }
      if (event.key === 'Home') { onReset(); event.preventDefault(); event.stopPropagation() }
      else if (keys[event.key]) { onChange(keys[event.key]); event.preventDefault(); event.stopPropagation() }
    }} />
}

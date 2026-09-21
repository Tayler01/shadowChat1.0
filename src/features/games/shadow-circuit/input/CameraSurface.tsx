import { useEffect, useRef } from 'react'
import { CameraGesture, type CameraDelta } from './cameraGesture.ts'

export function CameraSurface({ onChange, onReset, leftHanded }: {
  onChange: (delta: CameraDelta) => void; onReset: () => void; leftHanded: boolean
}) {
  const gesture = useRef(new CameraGesture())
  const surface = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const current = gesture.current
    return () => current.clear()
  }, [])
  // A non-passive listener prevents desktop wheel zoom from scrolling the host.
  useEffect(() => {
    const element = surface.current
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      onChange({ zoomRatio: Math.exp(Math.max(-100,Math.min(100,event.deltaY))*.002) })
    }
    element?.addEventListener('wheel',wheel,{passive:false})
    return () => element?.removeEventListener('wheel',wheel)
  }, [onChange])
  return <div ref={surface} className={`circuit-camera-surface ${leftHanded?'circuit-camera-surface-right':''}`}
    role="group" tabIndex={0} aria-label="Camera: drag to rotate and tilt; pinch to zoom. Keyboard: arrows, plus, minus; Home to reset."
    onPointerDown={event=>{
      if(event.pointerType==='mouse'&&event.button!==0)return
      if(!gesture.current.start(event.pointerId,{x:event.clientX,y:event.clientY}))return
      event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault()
    }}
    onPointerMove={event=>{
      const rect=event.currentTarget.getBoundingClientRect()
      const delta=gesture.current.move(event.pointerId,{x:event.clientX,y:event.clientY},rect.width,rect.height)
      if(delta){onChange(delta);event.preventDefault()}
    }}
    onPointerUp={event=>gesture.current.end(event.pointerId)}
    onPointerCancel={event=>gesture.current.end(event.pointerId)}
    onLostPointerCapture={event=>gesture.current.end(event.pointerId)}
    onContextMenu={event=>event.preventDefault()}
    onKeyUp={event=>{if(event.key.startsWith('Arrow'))event.stopPropagation()}}
    onKeyDown={event=>{
      const delta:Record<string,CameraDelta>={ArrowLeft:{turn:-.04},ArrowRight:{turn:.04},ArrowUp:{tilt:-.025},ArrowDown:{tilt:.025},'+':{zoomRatio:.96},'=':{zoomRatio:.96},'-':{zoomRatio:1.04}}
      if(event.key==='Home'){onReset();event.preventDefault();event.stopPropagation()}
      else if(delta[event.key]){onChange(delta[event.key]);event.preventDefault();event.stopPropagation()}
    }}/>
}

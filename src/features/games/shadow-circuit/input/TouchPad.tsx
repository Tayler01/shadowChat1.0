import {useRef,useState} from 'react'
import {ArrowBigUp,ArrowBigRight,ArrowBigDown,ArrowBigLeft,Move} from 'lucide-react'
import {padSector} from './intentBuffer.ts'
import type {Direction} from '../core/types.ts'
export type PadIntent={phase:'start'|'steer'|'end'|'cancel';pointer:number;direction:Direction|null}
export function TouchPad({onIntent}:{onIntent:(intent:PadIntent)=>void}){
  const pointer=useRef<number|null>(null),direction=useRef<Direction|null>(null)
  const [active,setActive]=useState<Direction|null>(null)
  const select=(next:Direction|null)=>{direction.current=next;setActive(next)}
  const labels=['Move up','Move right','Move down','Move left']
  const end=(cancel=false)=>{if(pointer.current===null)return;onIntent({phase:cancel?'cancel':'end',pointer:pointer.current,direction:null});pointer.current=null;select(null)}
  return <div className="circuit-pad" role="group" aria-label="Movement controls"
    onPointerDown={event=>{
      if(pointer.current!==null||(event.pointerType==='mouse'&&event.button!==0))return
      const rect=event.currentTarget.getBoundingClientRect()
      const next=padSector((event.clientX-rect.left-rect.width/2)/(rect.width/2),(event.clientY-rect.top-rect.height/2)/(rect.height/2),null)
      pointer.current=event.pointerId;select(next);event.currentTarget.setPointerCapture(event.pointerId)
      onIntent({phase:'start',pointer:event.pointerId,direction:next});event.preventDefault()
    }}
    onPointerMove={event=>{
      if(pointer.current!==event.pointerId)return
      const rect=event.currentTarget.getBoundingClientRect()
      const next=padSector((event.clientX-rect.left-rect.width/2)/(rect.width/2),(event.clientY-rect.top-rect.height/2)/(rect.height/2),direction.current)
      if(next!==direction.current){select(next);onIntent({phase:'steer',pointer:event.pointerId,direction:next})}
      event.preventDefault()
    }} onPointerUp={event=>{if(pointer.current===event.pointerId)end()}} onPointerCancel={event=>{if(pointer.current===event.pointerId)end(true)}} onLostPointerCapture={event=>{if(pointer.current===event.pointerId)end(true)}} onContextMenu={e=>e.preventDefault()}>
    {[ArrowBigUp,ArrowBigRight,ArrowBigDown,ArrowBigLeft].map((Icon,i)=><button key={i}
      className={`circuit-direction circuit-direction-${i} ${active===i?'circuit-direction-held':''}`}
      aria-label={labels[i]} aria-pressed={active===i}
      onClick={event=>{if(event.detail===0){onIntent({phase:'start',pointer:-2,direction:i as Direction});onIntent({phase:'end',pointer:-2,direction:null})}}}>
      <Icon size={30} fill="currentColor" strokeWidth={1.5}/>
    </button>)}
    <span className="circuit-pad-center" aria-hidden="true"><Move size={24}/></span>
  </div>
}

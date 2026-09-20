import { MOVE_TICKS, TICK_MS, type Actor } from '../core/types.ts'

export type Motion = { cell:number; from:number; start:number; duration:number; angle:number; fromAngle:number; turnStart:number }
export function trackMotion(previous:Motion|undefined,actor:Actor,tick:number,time:number):Motion {
  const angle=Math.PI-actor.direction*Math.PI/2
  if(!previous)return {cell:actor.cell,from:actor.cell,start:time,duration:0,angle,fromAngle:angle,turnStart:time}
  const moving=previous.cell!==actor.cell
  return {cell:actor.cell,from:moving?previous.cell:previous.from,start:moving?time:previous.start,
    duration:moving?Math.max(MOVE_TICKS,actor.readyAt-tick+1)*TICK_MS:previous.duration,
    angle,fromAngle:angle!==previous.angle?sampleAngle(previous,time):previous.fromAngle,turnStart:angle!==previous.angle?time:previous.turnStart}
}
function sampleAngle(motion:Motion,time:number){
  const delta=Math.atan2(Math.sin(motion.angle-motion.fromAngle),Math.cos(motion.angle-motion.fromAngle))
  return motion.fromAngle+delta*Math.max(0,Math.min(1,(time-motion.turnStart)/80))
}
export function sampleMotion(motion:Motion,width:number,time:number,reduced=false){
  const x=motion.cell%width,z=Math.floor(motion.cell/width),fromX=motion.from%width,fromZ=Math.floor(motion.from/width)
  // Teleports and restored checkpoints must never sweep through intervening walls.
  const phase=reduced||Math.abs(x-fromX)+Math.abs(z-fromZ)!==1||!motion.duration?1:Math.max(0,Math.min(1,(time-motion.start)/motion.duration))
  return {x:fromX+(x-fromX)*phase,z:fromZ+(z-fromZ)*phase,angle:reduced?motion.angle:sampleAngle(motion,time)}
}

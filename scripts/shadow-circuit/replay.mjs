import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { AUTHORED_LEVELS } from '../../src/features/games/shadow-circuit/content/authoredLevels.ts'
import { createState, playerOf, step, snapshot, restore } from '../../src/features/games/shadow-circuit/core/simulation.ts'
export function expandRoute(text) {
  return text.trim().split(/\s+/).flatMap(token=>{
    const match=/^([NESW])(\d{1,3})$/.exec(token)
    if(!match||+match[2]<1||+match[2]>500)throw new Error(`Invalid route token: ${token}`)
    return Array(+match[2]).fill('NESW'.indexOf(match[1]))
  })
}
export function replay(level,route) {
  let state=createState(level);const events=new Set();const trace=[]
  for(const direction of expandRoute(route.steps)) {
    for(let tick=0;tick<4;tick++) {state=step(level,state,tick===0?direction:null);for(const event of state.events)events.add(event.type)}
    // Exercise the actual resume format on every movement boundary.
    state=restore(level,snapshot(state));trace.push({cell:playerOf(state).cell,tick:state.tick,outcome:state.outcome})
  }
  const failures=[]
  const exit=route.expectedExit[1]*level.width+route.expectedExit[0]
  if(state.outcome!=='won'||state.chips!==0||playerOf(state).cell!==exit)failures.push('Expected a clean exit with every required chip')
  for(const event of route.expectedEvents)if(!events.has(event))failures.push(`Missing expected event: ${event}`)
  return {levelId:level.id,status:failures.length?'FAIL':'PASS_AUTHORED_DEVELOPMENT',failures,moves:state.moves,ticks:state.elapsed,trace,legacyCompatibility:'NOT_VERIFIED'}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const input=process.argv[2]??'tools/shadow-circuit/authored-solutions.json'
  const routes=JSON.parse(readFileSync(input,'utf8')).routes
  const results=routes.map(route=>{
    const level=AUTHORED_LEVELS.find(level=>level.id===route.levelId)
    if(!level)throw new Error(`Unknown authored chamber: ${route.levelId}`)
    return replay(level,route)
  })
  mkdirSync('output/shadow-circuit/p03',{recursive:true})
  writeFileSync('output/shadow-circuit/p03/authored-replays.json',JSON.stringify({input,results},null,2))
  console.log(JSON.stringify(results.map(({trace,...result})=>({...result,traceLength:trace.length})),null,2))
  if(results.some(result=>result.status==='FAIL'))process.exitCode=1
}

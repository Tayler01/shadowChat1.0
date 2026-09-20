import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { parseLegacyDat, normalizeLegacyLevel } from '../../src/features/games/shadow-circuit/content/legacyDat.ts'
import { createState, step, playerOf, canEnter, neighbor, snapshot, restore } from '../../src/features/games/shadow-circuit/core/simulation.ts'

const bytes=readFileSync('tools/shadow-circuit/private-originals/CHIPS.DAT')
const hash=createHash('sha256').update(bytes).digest('hex')
assert.equal(hash,'b0a68f21642447385512e0ed9386a4a13a4f7e9a38f909da772104d8e6b5c1fb')
const level=normalizeLegacyLevel(parseLegacyDat(bytes).levels[0],hash,'mscc-original')
let state=createState(level);const trace=[],events=[],directions=[]
// Lesson 1 has no autonomous actors or hazardous terrain. Reach the nearest
// accessible collectible, retaining the actual simulation's key/door state.
for(let target=0;target<40&&state.outcome==='playing';target++){
  const player=playerOf(state),queue=[{cell:player.cell,path:[]}],seen=new Set([player.cell]);let route
  for(let index=0;index<queue.length;index++){
    const node=queue[index],tile=state.top[node.cell]
    if(node.path.length&&(tile===2||(tile>=100&&tile<=103)||(tile===21&&state.chips===0))){route=node.path;break}
    for(let d=0;d<4;d++)if(canEnter(level,state,{...player,cell:node.cell},d)){
      const cell=neighbor(level,node.cell,d)
      if(!seen.has(cell)){seen.add(cell);queue.push({cell,path:[...node.path,d]})}
    }
  }
  assert.ok(route,'No reachable objective remains')
  for(const direction of route){
    const expected=neighbor(level,playerOf(state).cell,direction)
    for(let tick=0;tick<4;tick++){
      state=step(level,state,tick===0?direction:null)
      for(const event of state.events)if(event.type!=='move')events.push({...event,keys:[...state.keys]})
    }
    assert.equal(playerOf(state).cell,expected,'Door route overconsumed a key')
    state=restore(level,snapshot(state));directions.push(direction)
    trace.push({cell:expected,keys:state.keys,chips:state.chips,outcome:state.outcome})
  }
}
assert.equal(state.outcome,'won');assert.equal(state.chips,0)
assert.equal(events.filter(e=>e.type==='door').length,8)
assert.deepEqual(state.keys,[0,0,1,0])
writeFileSync('output/shadow-circuit/original-review/lesson1-route.json',JSON.stringify({sourceHash:hash,levelId:level.id,directions,trace,events,scope:'Development-engine route; not an original-executable timing oracle'},null,2))
console.log(JSON.stringify({level:level.title,outcome:state.outcome,moves:state.moves,chips:state.chips,keys:state.keys,doorsOpened:events.filter(e=>e.type==='door').length}))

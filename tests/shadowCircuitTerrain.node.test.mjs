import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {decodeStaticGlb} from '../src/features/games/shadow-circuit/renderer/staticGlb.ts'
import {authoredLevel} from '../src/features/games/shadow-circuit/content/authoredLevels.ts'
import {createState,step,playerOf,canEnter} from '../src/features/games/shadow-circuit/core/simulation.ts'
import {tileVisual} from '../src/features/games/shadow-circuit/renderer/tileVisual.ts'

const model=id=>decodeStaticGlb(Uint8Array.from(gunzipSync(readFileSync(`src/features/games/shadow-circuit/assets/classic/${id}.glbz`))).buffer)
const greenPoints=id=>model(id).filter(p=>p.color[1]>.4&&p.color[0]<.1&&p.color[2]<.1).flatMap(p=>Array.from({length:p.positions.length/3},(_,i)=>[p.positions[i*3],p.positions[i*3+2]]))
for(const [tile,direction,dx,dz] of [[13,2,0,1],[18,0,0,-1],[19,1,1,0],[20,3,-1,0]]){
  test(`force tile ${tile}: exported arrow tip matches actual simulation direction`,()=>{
    assert.equal(tileVisual(tile),`force-${tile}`)
    const points=greenPoints(`terrain-force-${tile}`)
    assert.ok(points.length>0)
    const leading=Math.max(...points.map(([x,z])=>x*dx+z*dz))
    const tip=points.filter(([x,z])=>x*dx+z*dz>leading-.016)
    assert.ok(Math.max(...tip.map(([x,z])=>Math.abs(-x*dz+z*dx)))<.085,'The arrow nose must be centered on the movement-facing end')
    assert.ok(Math.max(...points.map(([x,z])=>Math.abs(-x*dz+z*dx)))>.27,'Arrow wings must remain visible')
    const level=authoredLevel('force-audit','force-audit',['#####','#...#','#.P.#','#...#','#####'],'')
    const center=12;level.top[center]=tile
    let state=createState(level);state.started=true
    state=step(level,state,(direction+2)%4)
    assert.equal(playerOf(state).cell,center+dx+dz*5)
  })
}
test('random-force model advertises all four directions',()=>{
  const points=greenPoints('terrain-force-50')
  for(const [dx,dz] of [[0,1],[0,-1],[1,0],[-1,0]]){
    const leading=Math.max(...points.map(([x,z])=>x*dx+z*dz))
    assert.ok(leading>.34)
    const tip=points.filter(([x,z])=>x*dx+z*dz>leading-.01)
    assert.ok(tip.every(([x,z])=>Math.abs(-x*dz+z*dx)<.05))
  }
})
test('exit is upright blue; teleporter is a low cyan disc, not a second square portal',()=>{
  assert.equal(tileVisual(21),'exit');assert.equal(tileVisual(41),'teleport')
  const exit=model('terrain-exit'),teleport=model('terrain-teleport')
  const height=parts=>Math.max(...parts.flatMap(p=>p.positions.filter((_,i)=>i%3===1)))
  assert.ok(height(exit)>.9);assert.ok(height(teleport)<.2)
  const blue=exit.filter(p=>p.color[2]>.5&&p.color[1]<.2)
  assert.ok(blue.some(p=>p.positions.some((y,i)=>i%3===1&&y>.1&&y<.15)),'Exit must also have a blue floor mark for overhead views')
  assert.ok(teleport.some(p=>p.color[1]>.4&&p.color[2]>.5&&p.color[0]<.05),'Cyan rather than dark blue')
})
test('thin walls and corner-ice barriers occupy the same blocked edges as the simulation',()=>{
  for(const [tile,blocked] of [[6,[0]],[7,[3]],[8,[2]],[9,[1]],[48,[1,2]],[26,[1,2]],[27,[2,3]],[28,[0,3]],[29,[0,1]]]){
    const level=authoredLevel('edge-audit','edge-audit',['#####','#...#','#.P.#','#...#','#####'],'')
    level.top[12]=tile
    const state=createState(level),actor=playerOf(state)
    const vertices=model(`terrain-${tileVisual(tile)}`).flatMap(p=>Array.from({length:p.indices.length/3},(_,i)=>[0,1,2].map(axis=>[0,1,2].reduce((sum,j)=>sum+p.positions[p.indices[i*3+j]*3+axis],0)/3))).filter(p=>p[1]>.20)
    for(const [direction,dx,dz] of [[0,0,-1],[1,1,0],[2,0,1],[3,-1,0]]){
      const visible=vertices.some(([x,,z])=>x*dx+z*dz>.42&&Math.abs(-x*dz+z*dx)<.3)
      assert.equal(visible,blocked.includes(direction),`tile ${tile}, edge ${direction}`)
      assert.equal(canEnter(level,state,actor,direction),!visible)
    }
  }
})

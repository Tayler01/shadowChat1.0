import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { authoredLevel, AUTHORED_LEVELS } from '../src/features/games/shadow-circuit/content/authoredLevels.ts'
import { parseLegacyDat, normalizeLegacyLevel } from '../src/features/games/shadow-circuit/content/legacyDat.ts'
import { createState, step, playerOf, snapshot, restore, canEnter, enemyChoices } from '../src/features/games/shadow-circuit/core/simulation.ts'
import { SimulationClock } from '../src/features/games/shadow-circuit/core/clock.ts'
import { IntentBuffer, padSector } from '../src/features/games/shadow-circuit/input/intentBuffer.ts'
import { screenDirection } from '../src/features/games/shadow-circuit/core/types.ts'

const corridor = (middle, title = 'fixture') => authoredLevel(title, title, ['#'.repeat(middle.length), middle, '#'.repeat(middle.length)], '')
function advance(level, state, direction, ticks = 4) { for (let i = 0; i < ticks; i++) state = step(level, state, direction); return state }

test('authored chambers are distinct, bounded and have one explorer', () => {
  assert.equal(new Set(AUTHORED_LEVELS.map(l => l.id)).size, AUTHORED_LEVELS.length)
  for (const level of AUTHORED_LEVELS) { assert.equal(level.top.length, level.width * level.height); assert.equal(level.actors.filter(a => a.kind === 'player').length, 1) }
})
test('an idle level does not start time or actors', () => {
  const level = corridor('#P.ce.E#'); let state = createState(level)
  for (let i = 0; i < 200; i++) state = step(level, state, null)
  assert.equal(state.started, false); assert.equal(state.elapsed, 0); assert.equal(state.tick, 0)
})
test('blocked input does not start countdown', () => {
  const level = corridor('#P#cSE#'); const state = advance(level, createState(level), 1, 80)
  assert.equal(state.started, false); assert.equal(state.elapsed, 0)
})
test('chip, socket and exit produce one immutable completion', () => {
  const level = corridor('#PcSE#'); const state = advance(level, createState(level), 1, 12)
  assert.equal(state.outcome, 'won'); assert.equal(state.chips, 0); assert.equal(state.moves, 3)
  assert.equal(step(level, state, 3), state)
})
test('socket uses required metadata instead of visible item count', () => {
  const level = corridor('#PcSE#'); level.requiredChips = 2
  const state = advance(level, createState(level), 1, 20)
  assert.equal(state.chips, 1); assert.equal(state.outcome, 'playing'); assert.equal(state.moves, 1)
})
for (const [name, key, door, remains] of [['blue',100,22,0], ['red',101,23,0], ['green',102,24,1], ['yellow',103,25,0]]) {
  test(`${name} key and matching door inventory lifetime`, () => {
    const level = corridor('#PKDE#'); level.top[level.width + 2] = key; level.top[level.width + 3] = door
    const state = advance(level, createState(level), 1, 8)
    assert.equal(state.keys[key - 100], remains); assert.equal(playerOf(state).cell, level.width + 3)
  })
}
test('wrong key cannot open another door', () => {
  const level = corridor('#PKDE#'); level.top[level.width + 3] = 23
  const state = advance(level, createState(level), 1, 8)
  assert.equal(playerOf(state).cell, level.width + 2); assert.equal(state.keys[0], 1)
})
test('every key opens only its own lock; failure preserves the key and lock',()=>{
  for(let key=0;key<4;key++)for(let door=0;door<4;door++){
    const level=corridor('#P..E#');level.top[level.width+2]=22+door
    const initial=createState(level);initial.keys[key]=1
    const state=advance(level,initial,1)
    assert.equal(playerOf(state).cell,level.width+(key===door?2:1),`${key}/${door}`)
    assert.equal(state.keys[key],key===door&&key!==2?0:1)
    assert.equal(state.top[level.width+2],key===door?0:22+door)
  }
})
test('green key opens successive doors; other colors need another key after restore',()=>{
  for(let color=0;color<4;color++){
    const level=corridor('#P...E#');level.top[level.width+2]=100+color;level.top[level.width+3]=22+color;level.top[level.width+4]=22+color
    let state=advance(level,createState(level),1,8);state=restore(level,snapshot(state));state=advance(level,state,1)
    assert.equal(playerOf(state).cell,level.width+(color===2?4:3))
    assert.equal(state.keys[color],color===2?1:0)
  }
})
test('MS monsters and blocks traverse keys without collecting or erasing them',()=>{
  const level=corridor('#P...E#')
  for(const kind of ['block','bug','fireball','ball','tank','glider','teeth','walker','blob','paramecium'])for(let color=0;color<4;color++){
    const state=createState(level);state.top[level.width+3]=100+color
    const actor={id:9,kind,cell:level.width+2,previous:level.width+2,direction:1,readyAt:0,alive:true}
    assert.equal(canEnter(level,state,actor,1),true,`${kind}/${color}`)
    state.top[level.width+3]=22+color;assert.equal(canEnter(level,state,actor,1),false)
  }
  const pushing=corridor('#PB..E#');pushing.top[pushing.width+3]=100
  let state=advance(pushing,createState(pushing),1)
  assert.equal(state.top[pushing.width+3],100);assert.equal(state.keys[0],0)
  state=advance(pushing,state,1);assert.equal(state.keys[0],1)
})
test('block fills water and reveals underlying dirt', () => {
  const level = corridor('#PB~.E#'); const state = advance(level, createState(level), 1)
  assert.equal(state.top[level.width + 3], 11); assert.equal(state.actors.find(a => a.kind === 'block').alive, false)
})
test('covered key remains when a block moves', () => {
  const level = corridor('#PB..E#'); level.top[level.width + 2] = 100
  const state = advance(level, createState(level), 1)
  assert.equal(state.keys[0], 1)
})
for (const [name, tile, boot] of [['water',3,104], ['fire',4,105]]) {
  test(`${name} kills without boots and is passable with matching boots`, () => {
    const level = corridor('#P..E#'); level.top[level.width + 2] = tile
    assert.equal(advance(level, createState(level), 1).outcome, 'dead')
    level.top[level.width + 2] = boot; level.top[level.width + 3] = tile
    assert.equal(advance(level, createState(level), 1, 8).outcome, 'playing')
  })
}
test('thief removes boots without destroying keys', () => {
  const level = corridor('#P..E#'); level.top[level.width + 2] = 33
  const initial = createState(level, 1, { timerOff:false, undo:false, pocketKeys:true })
  const state = advance(level, initial, 1)
  assert.deepEqual(state.boots, [false,false,false,false]); assert.deepEqual(state.keys,[99,99,1,99]); assert.equal(state.assisted,true)
})
test('bomb consumes itself and ends attempt atomically', () => {
  const level = corridor('#P!.E#'); const state = advance(level,createState(level),1)
  assert.equal(state.outcome,'dead'); assert.equal(state.top[level.width+2],0)
})
test('all thin-wall entry and departure edges are enforced', () => {
  const level = authoredLevel('edges','edges',['.....','.....','..P..','.....','.....'],'')
  for (const [tile, direction] of [[6,0],[7,3],[8,2],[9,1]]) {
    const state = createState(level); const player = playerOf(state); state.top[player.cell] = tile
    assert.equal(canEnter(level,state,player,direction),false)
    state.top[player.cell]=0
    const offsets=[-5,1,5,-1]; state.top[player.cell+offsets[direction]]=[8,7,6,9][direction]
    assert.equal(canEnter(level,state,player,direction),false)
  }
})
test('force floors keep moving after input release; suction boots stop forcing', () => {
  const level = corridor('#P>...E#'); let state=advance(level,createState(level),1)
  state=advance(level,state,null); assert.equal(playerOf(state).cell,level.width+3)
  state=createState(level);state.boots[3]=true;state=advance(level,state,1);state=advance(level,state,null)
  assert.equal(playerOf(state).cell,level.width+2)
})
test('ice bounces at a blocked end and skates permit stopping', () => {
  const level=corridor('#Pii#E#');let state=advance(level,createState(level),1,4)
  state=advance(level,state,null,8);assert.equal(playerOf(state).cell,level.width+2)
  state=createState(level);state.boots[2]=true;state=advance(level,state,1);state=advance(level,state,null,12);assert.equal(playerOf(state).cell,level.width+2)
})
test('green button toggles both wall states', () => {
  const level=corridor('#P...E#');level.top[level.width+2]=35;level.top[level.width+3]=37;level.top[level.width+4]=38
  const state=advance(level,createState(level),1);assert.equal(state.top[level.width+3],38);assert.equal(state.top[level.width+4],37)
})
test('trap holds until its wired brown button is occupied', () => {
  const level=authoredLevel('trap','trap',['#######','#P...E#','#B....#','#######'],'');level.top[8]=43;level.top[15]=39;level.traps=[{button:15,target:8}]
  assert.equal(advance(level,createState(level),1).moves,1)
  level.traps=[];assert.equal(advance(level,createState(level),1).moves,0)
})
test('timer expires on active ticks and never advances a dead run', () => {
  const level=corridor('#P....E#');level.timeLimit=1
  let state=advance(level,createState(level),1);state=advance(level,state,null,20)
  assert.equal(state.outcome,'dead');assert.equal(state.elapsed,20);assert.match(state.reason,/Time/)
})
test('enemy priority contracts for each facing are independent cardinal expectations', () => {
  const level=authoredLevel('enemies','enemies',['.....','.....','..P..','.....','.....'],'')
  const offsets={bug:[3,0,1,2],paramecium:[1,0,3,2],fireball:[0,1,3,2],glider:[0,3,1,2],ball:[0,2],tank:[0]}
  for(const [kind,relative] of Object.entries(offsets)) for(let d=0;d<4;d++) {
    const state=createState(level);const actor={id:9,kind,cell:6,previous:6,direction:d,readyAt:0,alive:true}
    assert.deepEqual(enemyChoices(state,actor,level),relative.map(n=>(n+d)%4),`${kind}/${d}`)
  }
})
test('teeth target the player on the dominant axis', () => {
  const level=authoredLevel('teeth','teeth',['.....','.....','..P..','.....','.....'],'');const state=createState(level)
  assert.deepEqual(enemyChoices(state,{id:8,kind:'teeth',cell:2,previous:2,direction:0,readyAt:0,alive:true},level),[2,1])
})
test('blob and blocked walker preserve deterministic RNG through restore', () => {
  const level=corridor('#P....E#')
  for(const kind of ['blob','walker']) {
    const state=createState(level,12345);const restored=restore(level,snapshot(state));const actor={id:9,kind,cell:level.width+2,previous:level.width+2,direction:0,readyAt:0,alive:true}
    assert.deepEqual(enemyChoices(state,actor,level),enemyChoices(restored,actor,level));assert.equal(state.rng,restored.rng)
  }
})
test('snapshot validates identity, duplicate actor IDs and bounds', () => {
  const level=AUTHORED_LEVELS[0];const s=createState(level)
  assert.deepEqual(restore(level,snapshot(s)),s)
  for(const patch of [{contentHash:'wrong'}, {top:[]}, {tick:-1}, {actors:[...s.actors,{...s.actors[0]}]}]) assert.throws(()=>restore(level,JSON.stringify({...s,...patch})))
})
test('corrupt checkpoints reject unknown actors, missing assists, invalid counters and dead live players',()=>{
  const level=AUTHORED_LEVELS[0];const state=createState(level)
  for(const patch of [
    {actors:[null]}, {actors:[{...state.actors[0],kind:'unknown'}]},
    {actors:[{...state.actors[0],previous:-1}]}, {actors:[{...state.actors[0],alive:false}]},
    {assists:{}}, {moves:-1}, {rng:0}, {nextActorId:0}, {elapsed:1}, {reason:null},
  ])assert.throws(()=>restore(level,JSON.stringify({...state,...patch})),/incompatible or damaged/)
  assert.throws(()=>restore(level,'null'),/incompatible or damaged/)
})
test('30/60/120 Hz frame schedules produce identical simulation', () => {
  const level=corridor('#P........................E#');const results=[]
  for(const hz of [30,60,120]) {
    const clock=new SimulationClock();let state=createState(level)
    clock.advance(0)
    for(let frame=1;frame<=hz*2;frame++) { const result=clock.advance(frame*1000/hz);assert.equal(result.stalled,false);for(let i=0;i<result.ticks;i++)state=step(level,state,1) }
    results.push(snapshot(state))
  }
  assert.equal(results[0],results[1]);assert.equal(results[1],results[2])
})
test('stall pauses without catch-up',()=>{const c=new SimulationClock();c.advance(0);assert.deepEqual(c.advance(5000),{ticks:0,stalled:true});assert.deepEqual(c.advance(5100),{ticks:0,stalled:false})})
test('pointer ownership, tap, release and cancellation do not leave movement stuck',()=>{
  const i=new IntentBuffer();assert.equal(i.press(1,0),true);assert.equal(i.press(2,1),false);i.release(1);assert.equal(i.take(),0);assert.equal(i.take(),null)
  i.press(2,1);assert.equal(i.take(),1);assert.equal(i.take(),1);i.clear();assert.equal(i.take(),null)
})
test('fresh diagonals remain neutral; previous sector has hysteresis',()=>{assert.equal(padSector(.7,.7,null),null);assert.equal(padSector(.7,.7,1),1);assert.equal(padSector(-.8,.1,null),3);assert.equal(padSector(2,0,1),null)})
test('screen arrows map deterministically at all four camera headings',()=>{for(let heading=0;heading<4;heading++)assert.deepEqual([0,1,2,3].map(d=>screenDirection(d,heading)),[heading,(heading+1)%4,(heading+2)%4,(heading+3)%4])})
for(const name of ['synthetic-corridor','synthetic-wiring']) test(`DAT ${name} preserves source structure and rejects truncation`,()=>{
  const bytes=readFileSync(`docs/shadow-circuit-build/resources/fixtures/${name}.dat`);const pack=parseLegacyDat(bytes)
  assert.equal(pack.levels.length,1);assert.equal(pack.levels[0].upper.length,1024);assert.equal(pack.levels[0].lower.length,1024)
  const hash=createHash('sha256').update(bytes).digest('hex');const level=normalizeLegacyLevel(pack.levels[0],hash)
  assert.equal(level.actors.filter(a=>a.kind==='player').length,1)
  for(let cut=0;cut<bytes.length;cut++) assert.throws(()=>parseLegacyDat(bytes.subarray(0,cut)))
  assert.throws(()=>parseLegacyDat(Buffer.concat([bytes,Buffer.from([0])])) )
})

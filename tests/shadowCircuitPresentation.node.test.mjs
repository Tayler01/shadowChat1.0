import test from 'node:test'
import assert from 'node:assert/strict'
import { trackMotion, sampleMotion } from '../src/features/games/shadow-circuit/renderer/actorMotion.ts'
import { CircuitAudio } from '../src/features/games/shadow-circuit/audio/circuitAudio.ts'
const actor={id:1,kind:'bug',cell:11,previous:11,direction:1,readyAt:0,alive:true}
test('tile motion reaches each corner exactly without diagonal cutting, at 30 and 60 Hz',()=>{
  for(const fps of [30,60]){
    let motion=trackMotion(undefined,actor,0,0)
    motion=trackMotion(motion,{...actor,cell:12,readyAt:4},1,0)
    for(let t=0;t<200;t+=1000/fps){const p=sampleMotion(motion,10,t);assert.equal(p.z,1);assert.ok(p.x>=1&&p.x<=2)}
    assert.equal(sampleMotion(motion,10,200).x,2)
    motion=trackMotion(motion,{...actor,cell:22,direction:2,readyAt:8},5,200)
    assert.deepEqual(sampleMotion(motion,10,300),{x:2,z:1.5,angle:0})
  }
})
test('teleports snap and blocked readyAt changes do not replay movement',()=>{
  let motion=trackMotion(undefined,actor,0,0)
  motion=trackMotion(motion,{...actor,cell:12,readyAt:4},1,0)
  motion=trackMotion(motion,{...actor,cell:12,readyAt:8},5,200)
  assert.equal(sampleMotion(motion,10,220).x,2)
  motion=trackMotion(motion,{...actor,cell:99,readyAt:9},6,220)
  assert.equal(sampleMotion(motion,10,220).x,9)
  assert.equal(sampleMotion(motion,10,220).z,9)
})
test('music is gesture gated, independent of SFX, and releases every voice on pause/dispose',async()=>{
  const original=globalThis.AudioContext
  let context
  class FakeContext {
    currentTime=0;state='suspended';destination={};nodes=[]
    constructor(){context=this}
    resume(){this.state='running';return Promise.resolve()}
    suspend(){this.state='suspended';return Promise.resolve()}
    close(){this.state='closed';return Promise.resolve()}
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}}}
    createOscillator(){const node={frequency:{setValueAtTime(){}},connect(){},disconnect(){this.disconnected=true},start(){this.started=true},stop(){},disconnected:false};this.nodes.push(node);return node}
  }
  globalThis.AudioContext=FakeContext
  const audio=new CircuitAudio()
  try{
    audio.configure({music:true,sfx:false});assert.equal(context,undefined)
    await audio.unlock({music:true,sfx:false});assert.ok(context.nodes.length>=2)
    const count=context.nodes.length;audio.play([{type:'chip',cell:0}]);assert.equal(context.nodes.length,count)
    audio.configure({music:false,sfx:true});assert.ok(context.nodes.every(n=>n.disconnected))
    audio.play([{type:'chip',cell:0}]);assert.equal(context.nodes.length,count+1)
    audio.pause();assert.equal(context.state,'suspended');assert.ok(context.nodes.every(n=>n.disconnected))
    await audio.unlock({music:true,sfx:true});context.currentTime=.3
    await new Promise(resolve=>setTimeout(resolve,35));assert.ok(context.nodes.length>count+1)
    audio.dispose();assert.equal(context.state,'closed');assert.ok(context.nodes.every(n=>n.disconnected))
  }finally{audio.dispose();globalThis.AudioContext=original}
})

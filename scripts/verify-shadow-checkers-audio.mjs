import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import vm from 'node:vm'
const script=await readFile(new URL('../public/games/shadow-checkers/unity/study-audio.js',import.meta.url),'utf8')
const starts=[],contexts=[]
let release
const pending=new Promise(resolve=>{release=resolve})
class Context {
  state='running';destination={}
  constructor(){contexts.push(this)}
  createGain(){return {gain:{value:0},connect(){},disconnect(){}}}
  createBufferSource(){return {playbackRate:{value:1},connect(){},disconnect(){},start(){starts.push(this)},stop(){this.stopped=true;this.onended?.()}}}
  decodeAudioData(data){return Promise.resolve({id:new Uint8Array(data)[0]})}
  resume(){this.state='running';return Promise.resolve()}
  suspend(){this.state='suspended';return Promise.resolve()}
  close(){this.state='closed';return Promise.resolve()}
}
const runtime={window:{AudioContext:Context},Math,fetch:async path=>{await pending;const id=path.includes('fireplace')?9:path.includes('slide')?8:Number(path.match(/place-(\d)/)[1]);return {ok:true,arrayBuffer:async()=>new Uint8Array([id]).buffer}}}
vm.runInNewContext(script,runtime)
const audio=runtime.window.ShadowStudyAudio
const settle=()=>new Promise(resolve=>setImmediate(resolve))
audio.configure(true,false)
audio.configure(false,false)
release();await settle();await settle()
assert.equal(starts.length,0,'A completed background fetch must not start sound after mute')
audio.configure(true,false);await settle();await settle()
assert.equal(starts.filter(s=>s.loop&&!s.stopped).length,1)
for(let i=0;i<12;i++){audio.play('place');starts.at(-1).onended()}
const contacts=starts.filter(s=>!s.loop)
assert.equal(contacts.length,12)
for(let i=1;i<contacts.length;i++)assert.notEqual(contacts[i].buffer.id,contacts[i-1].buffer.id,'Consecutive placements must use distinct recordings')
audio.configure(true,true)
assert.equal(contexts.at(-1).state,'suspended')
assert.ok(starts.filter(s=>s.loop).every(s=>s.stopped))
const count=starts.length;audio.play('crown');assert.equal(starts.length,count)
audio.dispose();assert.equal(contexts.at(-1).state,'closed')
await audio.unlock();assert.equal(starts.length,count)
console.log('Study audio passed: mute during load, single ambience loop, nonrepeating contacts, pause and disposal.')

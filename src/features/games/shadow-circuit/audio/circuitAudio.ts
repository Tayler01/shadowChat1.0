import type { CircuitEvent } from '../core/types.ts'
import { parseMidi, type MidiSong } from './midi.ts'
import { fetchAsset } from '../content/fetchAsset.ts'

// Original 16-bar Circuit Steps score, authored for this game.
const MELODY=[76,0,79,83,81,79,76,74,72,0,76,79,78,76,74,71,69,0,72,76,74,72,71,67,71,74,78,81,79,78,74,0,76,79,83,86,83,81,79,76,72,76,79,84,83,79,76,74,69,72,76,79,78,76,72,71,71,74,78,81,79,74,71,0]
const ROOTS=[52,48,45,47,52,48,45,47]
type AudioOptions={sfx:boolean;music:boolean}
export class CircuitAudio {
  private context:AudioContext|null=null
  private voices=new Map<OscillatorNode,{gain:GainNode;music:boolean}>()
  private options:AudioOptions={sfx:false,music:false}
  private generation=0
  private active=false
  private timer:ReturnType<typeof setInterval>|null=null
  private beat=0
  private nextNote=0
  private song:MidiSong|null=null
  private songIndex=0
  private songStart=0
  private songPosition=0
  private recording:AudioBuffer|null=null
  private recordingBytes:Promise<ArrayBuffer>|null=null
  private recordingNode:AudioBufferSourceNode|null=null
  private recordingGain:GainNode|null=null
  private recordingStart=0
  private recordingPosition=0
  private recordingGeneration=0
  private download:AbortController|null=null
  private decoding=false
  private originalSelected=false
  loadMidi(bytes:ArrayBuffer){this.stopMusic();this.download?.abort();this.recordingGeneration++;this.originalSelected=false;this.recording=null;this.recordingBytes=null;this.decoding=false;this.song=parseMidi(bytes);this.songIndex=0;this.songPosition=0;if(this.active)this.startMusic()}
  loadRecording(asset:{url:string;sha256:string;bytes:number}){
    this.stopMusic();this.download?.abort();this.download=new AbortController();this.recordingGeneration++
    this.originalSelected=true;this.recording=null;this.recordingPosition=0;this.decoding=false
    this.recordingBytes=fetchAsset(asset,this.download.signal)
    // A failed download leaves music silent instead of substituting a different composition.
    void this.recordingBytes.catch(()=>undefined)
    if(this.active)this.startMusic()
  }
  async unlock(options:AudioOptions) {
    this.configure(options);this.active=true
    if(!options.sfx&&!options.music)return
    const generation=this.generation
    try {const Constructor=globalThis.AudioContext??(globalThis as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext;this.context??=new Constructor();await this.context.resume();if(generation!==this.generation){await this.context?.suspend();return}this.startMusic()}catch{/* Audio never gates simulation. */}
  }
  configure(options:AudioOptions){
    this.options=options
    for(const [voice,info] of this.voices)if(info.music?!options.music:!options.sfx)this.stopVoice(voice)
    if(!options.music)this.stopMusic()
    else if(this.active)this.startMusic()
  }
  private tone(frequency:number,time:number,duration:number,volume:number,type:OscillatorType,music:boolean){
    const context=this.context;if(!context||this.voices.size>=64)return
    const voice=context.createOscillator(),gain=context.createGain()
    voice.type=type;voice.frequency.setValueAtTime(frequency,time)
    gain.gain.setValueAtTime(0,time);gain.gain.linearRampToValueAtTime(volume,time+.012);gain.gain.exponentialRampToValueAtTime(.0001,time+duration)
    voice.connect(gain);gain.connect(context.destination);this.voices.set(voice,{gain,music})
    voice.onended=()=>{this.voices.delete(voice);voice.disconnect();gain.disconnect()}
    voice.start(time);voice.stop(time+duration+.01)
  }
  private startMusic(){
    if(this.timer!==null||!this.active||!this.options.music||this.context?.state!=='running')return
    if(this.originalSelected){
      if(this.recordingNode||this.decoding)return
      const context=this.context,generation=this.recordingGeneration
      if(!this.recording){
        if(!this.recordingBytes)return
        this.decoding=true
        void this.recordingBytes.then(bytes=>context.decodeAudioData(bytes.slice(0))).then(buffer=>{
          if(generation!==this.recordingGeneration)return
          this.recording=buffer;this.decoding=false;this.startMusic()
        }).catch(()=>{if(generation===this.recordingGeneration)this.decoding=false})
        return
      }
      const source=context.createBufferSource(),gain=context.createGain()
      source.buffer=this.recording;source.loop=true;gain.gain.value=.45
      source.connect(gain);gain.connect(context.destination)
      this.recordingNode=source;this.recordingGain=gain;this.recordingStart=context.currentTime-this.recordingPosition
      source.start(0,this.recordingPosition%this.recording.duration)
      return
    }
    this.nextNote=this.context.currentTime+.03
    this.songStart=this.nextNote-this.songPosition
    const schedule=()=>{
      const context=this.context;if(!context||context.state!=='running')return
      if(this.song){
        if(context.currentTime-this.songStart>=this.song.duration){this.songStart+=this.song.duration;this.songIndex=0}
        while(this.songIndex<this.song.notes.length&&this.songStart+this.song.notes[this.songIndex].time<context.currentTime+.12){
          const note=this.song.notes[this.songIndex++],time=this.songStart+note.time
          if(time<context.currentTime-.1)continue
          const wave:OscillatorType=note.channel===9?'triangle':note.program>=80&&note.program<88?'square':note.program>=32&&note.program<40?'sine':'triangle'
          this.tone(440*2**((note.key-69)/12),Math.max(context.currentTime,time),Math.min(12,note.duration),note.velocity*(wave==='square'?.012:.032),wave,true)
        }
        return
      }
      if(this.nextNote<context.currentTime)this.nextNote=context.currentTime+.02
      while(this.nextNote<context.currentTime+.12){
        const note=MELODY[this.beat%MELODY.length],root=ROOTS[Math.floor(this.beat/8)%ROOTS.length]
        const hz=(n:number)=>440*2**((n-69)/12)
        if(note)this.tone(hz(note),this.nextNote,.22,.022,'triangle',true)
        if(this.beat%2===0)this.tone(hz(root),this.nextNote,.42,.027,'sine',true)
        if(this.beat%4===2)this.tone(hz(root+19),this.nextNote,.3,.01,'triangle',true)
        this.beat++;this.nextNote+=60/108/2
      }
    }
    schedule();this.timer=setInterval(schedule,25)
  }
  play(events:CircuitEvent[]) {
    const context=this.context
    if(!context||context.state!=='running'||!this.options.sfx||!this.active)return
    const frequencies:Record<CircuitEvent['type'],number>={move:115,bump:75,chip:880,key:660,boot:520,door:330,push:95,button:440,teleport:1100,death:145,win:1046}
    for(const event of events)this.tone(frequencies[event.type],context.currentTime,.18,event.type==='move'?.012:.04,event.type==='move'?'sine':'triangle',false)
  }
  private stopVoice(voice:OscillatorNode){const info=this.voices.get(voice);try{voice.stop()}catch{/* Already ended. */}voice.disconnect();info?.gain.disconnect();this.voices.delete(voice)}
  private stopMusic(){
    if(this.recordingNode){
      if(this.context&&this.recording)this.recordingPosition=Math.max(0,this.context.currentTime-this.recordingStart)%this.recording.duration
      this.recordingNode.stop();this.recordingNode.disconnect();this.recordingGain?.disconnect();this.recordingNode=null;this.recordingGain=null
    }
    if(this.timer!==null){clearInterval(this.timer);if(this.song&&this.context)this.songPosition=Math.max(0,this.context.currentTime-this.songStart)%this.song.duration}this.timer=null;for(const [voice,info] of this.voices)if(info.music)this.stopVoice(voice)
  }
  pause(){this.generation++;this.active=false;this.stopMusic();for(const voice of this.voices.keys())this.stopVoice(voice);void this.context?.suspend().catch(()=>undefined)}
  dispose(){this.pause();this.download?.abort();this.recordingGeneration++;this.recording=null;this.recordingBytes=null;void this.context?.close().catch(()=>undefined);this.context=null}
}

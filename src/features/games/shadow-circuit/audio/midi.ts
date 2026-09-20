export type MidiNote={time:number;duration:number;key:number;velocity:number;program:number;channel:number}
export type MidiSong={notes:MidiNote[];duration:number}
/** Standard MIDI files, formats 0/1 with PPQN timing, tempo changes and running status. */
export function parseMidi(buffer:ArrayBuffer):MidiSong{
  const data=new Uint8Array(buffer),view=new DataView(buffer)
  const fail=()=>{throw new Error('Choose a valid MIDI music file (format 0 or 1).')}
  if(data.length<14||data.length>2_000_000)fail()
  const tag=(at:number)=>String.fromCharCode(...data.slice(at,at+4))
  if(tag(0)!=='MThd'||view.getUint32(4)!==6||view.getUint16(8)>1)fail()
  const tracks=view.getUint16(10),division=view.getUint16(12)
  if(!tracks||tracks>128||!division||(division&0x8000))fail()
  type Event={tick:number;order:number;kind:'tempo'|'on'|'off'|'program'|'pedal';channel:number;a:number;b:number}
  const events:Event[]=[];let offset=14,order=0,lastTick=0
  for(let track=0;track<tracks;track++){
    if(offset+8>data.length||tag(offset)!=='MTrk')fail()
    const end=offset+8+view.getUint32(offset+4);offset+=8
    if(end>data.length)fail()
    let tick=0,running=0
    const read=()=>{if(offset>=end)fail();return data[offset++]}
    const variable=()=>{let n=0;for(let i=0;i<4;i++){const b=read();n=(n<<7)|(b&127);if(!(b&128))return n}return fail() as never}
    while(offset<end){
      tick+=variable();lastTick=Math.max(lastTick,tick)
      let status=read()
      if(status<128){if(!running)fail();offset--;status=running}else if(status<240)running=status
      if(status===255){const type=read(),length=variable();if(offset+length>end)fail();if(type===81&&length===3)events.push({tick,order:order++,kind:'tempo',channel:0,a:(data[offset]<<16)|(data[offset+1]<<8)|data[offset+2],b:0});offset+=length;running=0;continue}
      if(status===240||status===247){const length=variable();offset+=length;if(offset>end)fail();running=0;continue}
      if(status>=240)fail()
      const kind=status>>4,channel=status&15,a=read(),b=kind===12||kind===13?0:read()
      if(a>127||b>127)fail()
      const type=kind===9&&b?'on':kind===8||kind===9?'off':kind===12?'program':kind===11&&a===64?'pedal':null
      if(type)events.push({tick,order:order++,kind:type,channel,a,b})
      if(events.length>250000)fail()
    }
  }
  events.sort((a,b)=>a.tick-b.tick||a.order-b.order)
  const notes:MidiNote[]=[],programs=Array(16).fill(0),pedals=Array(16).fill(false)
  const active=new Map<string,MidiNote[]>(),sustained=new Map<number,MidiNote[]>()
  let tick=0,time=0,tempo=500000
  const finish=(note:MidiNote)=>{note.duration=Math.max(.025,time-note.time);notes.push(note)}
  for(const event of events){
    time+=(event.tick-tick)*tempo/division/1e6;tick=event.tick
    const key=`${event.channel}:${event.a}`
    if(event.kind==='tempo'){if(event.a>0)tempo=event.a}
    else if(event.kind==='program')programs[event.channel]=event.a
    else if(event.kind==='pedal'){
      pedals[event.channel]=event.b>=64
      if(!pedals[event.channel]){for(const note of sustained.get(event.channel)??[])finish(note);sustained.delete(event.channel)}
    }else if(event.kind==='on'){
      const list=active.get(key)??[];list.push({time,duration:0,key:event.a,velocity:event.b/127,program:programs[event.channel],channel:event.channel});active.set(key,list)
    }else{
      const list=active.get(key),note=list?.shift()
      if(note){if(pedals[event.channel]){const held=sustained.get(event.channel)??[];held.push(note);sustained.set(event.channel,held)}else finish(note)}
    }
  }
  time+=(lastTick-tick)*tempo/division/1e6
  for(const list of [...active.values(),...sustained.values()])for(const note of list)finish(note)
  notes.sort((a,b)=>a.time-b.time)
  if(!notes.length||!Number.isFinite(time)||time>7200)fail()
  return {notes,duration:notes.reduce((end,note)=>Math.max(end,note.time+note.duration),time)+.3}
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {parseMidi} from '../src/features/games/shadow-circuit/audio/midi.ts'
test('MIDI preserves tempo and running-status note durations',()=>{
  const events=[0,255,81,3,7,161,32,0,144,60,100,96,60,0,0,255,47,0]
  const file=Uint8Array.from([77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,events.length,...events])
  const song=parseMidi(file.buffer)
  assert.equal(song.notes.length,1);assert.equal(song.notes[0].key,60);assert.equal(song.notes[0].time,0);assert.equal(song.notes[0].duration,.5)
  assert.throws(()=>parseMidi(file.buffer.slice(0,-2)))
})

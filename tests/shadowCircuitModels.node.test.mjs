import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { decodeStaticGlb } from '../src/features/games/shadow-circuit/renderer/staticGlb.ts'

const folder='src/features/games/shadow-circuit/assets/classic'
for(const name of readdirSync(folder).filter(name=>name.endsWith('.glbz')))test(`runtime model decodes with valid geometry: ${name}`,()=>{
  const bytes=Uint8Array.from(gunzipSync(readFileSync(`${folder}/${name}`))).buffer
  const parts=decodeStaticGlb(bytes)
  assert.ok(parts.length>0)
  assert.ok(parts.every(p=>p.indices.length>0&&p.positions.length===p.normals.length))
  assert.throws(()=>decodeStaticGlb(bytes.slice(0,-1)))
  const damaged=bytes.slice(0);new DataView(damaged).setUint32(4,3,true)
  assert.throws(()=>decodeStaticGlb(damaged),/damaged/)
})

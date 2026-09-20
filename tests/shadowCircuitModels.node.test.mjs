import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import {createHash} from 'node:crypto'
import { decodeStaticGlb } from '../src/features/games/shadow-circuit/renderer/staticGlb.ts'

const folder='src/features/games/shadow-circuit/assets/classic'
test('published model manifest matches every local runtime model byte for byte',()=>{
  const manifest=JSON.parse(readFileSync('src/features/games/shadow-circuit/content/assetManifest.json','utf8'))
  assert.equal(manifest.models.length,61)
  for(const model of manifest.models){
    const bytes=readFileSync(`${folder}/${model.id}.glbz`)
    assert.equal(bytes.length,model.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'),model.sha256)
  }
  for(const [name,asset] of Object.entries(manifest.original)){
    const bytes=readFileSync(`assets-source/shadow-circuit/original-authorized/${name}`)
    assert.equal(bytes.length,asset.bytes)
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256)
  }
})
for(const name of readdirSync(folder).filter(name=>name.endsWith('.glbz')))test(`runtime model decodes with valid geometry: ${name}`,()=>{
  const bytes=Uint8Array.from(gunzipSync(readFileSync(`${folder}/${name}`))).buffer
  const parts=decodeStaticGlb(bytes)
  assert.ok(parts.length>0)
  assert.ok(parts.every(p=>p.indices.length>0&&p.positions.length===p.normals.length))
  assert.throws(()=>decodeStaticGlb(bytes.slice(0,-1)))
  const damaged=bytes.slice(0);new DataView(damaged).setUint32(4,3,true)
  assert.throws(()=>decodeStaticGlb(damaged),/damaged/)
})

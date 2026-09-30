import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('..', import.meta.url))
const runtime = 'public/games/shadow-runner/level-assets'
const archive = 'source-assets/shadow-runner/optimized-atlases'
const atlases = [
  'terrain/stone-ruins-terrain-v1.png',
  'level-3/terrain/ivy-viaduct-terrain-hazards-v1-transparent.png',
  'level-4/props/bell-tower-archives-props-hazards-v1-transparent.png',
  'level-5/props/candle-fair-props-hazards-v1-transparent.png',
  'level-5/terrain/candle-fair-terrain-v2-transparent.png',
  'level-8/props/courier-catacombs-terrain-props-v1-transparent.png',
  'level-9/props/captain-gate-terrain-props-v1-transparent.png',
  'level-10/props/dawn-relay-spire-terrain-machinery-v1-transparent.png',
]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

async function visiblePixels(bytes) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.channels, 4)
  // WebP omits invisible RGB under zero alpha; every visible channel must remain exact.
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] === 0) data.fill(0, offset, offset + 3)
  }
  return { data, width: info.width, height: info.height }
}

const records = []
for (const relative of atlases) {
  const source = `${archive}/${relative}`
  const originalRuntime = `${runtime}/${relative}`
  const output = originalRuntime.replace(/\.png$/, '.webp')
  await mkdir(path.dirname(path.join(root, source)), { recursive: true })
  // Keep the published PNG as immutable provenance, including its original alpha.
  try { await copyFile(path.join(root, originalRuntime), path.join(root, source), constants.COPYFILE_EXCL) }
  catch (error) { if (!['EEXIST', 'ENOENT'].includes(error.code)) throw error }
  const original = await readFile(path.join(root, source))
  try {
    const current = await readFile(path.join(root, originalRuntime))
    assert.equal(hash(current), hash(original), `Runtime PNG differs from archived source: ${relative}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const encoded = await sharp(original).webp({ lossless: true, effort: 6 }).toBuffer()
  const before = await visiblePixels(original)
  const after = await visiblePixels(encoded)
  assert.equal(after.width, before.width, relative)
  assert.equal(after.height, before.height, relative)
  assert.ok(after.data.equals(before.data), `Visible pixel mismatch: ${relative}`)
  assert.ok(encoded.length < original.length, `No compression benefit: ${relative}`)
  await writeFile(path.join(root, output), encoded)
  records.push({ source, originalRuntime, output, width: after.width, height: after.height,
    originalBytes: original.length, bytes: encoded.length, sourceSha256: hash(original),
    sha256: hash(encoded), visibleRgbaSha256: hash(after.data), encoding: 'lossless-webp' })
}
await writeFile(path.join(root, archive, 'manifest.json'), `${JSON.stringify(records, null, 2)}\n`)
console.log(JSON.stringify({ atlases: records.length,
  originalBytes: records.reduce((sum, item) => sum + item.originalBytes, 0),
  bytes: records.reduce((sum, item) => sum + item.bytes, 0),
  savedBytes: records.reduce((sum, item) => sum + item.originalBytes - item.bytes, 0),
  note: 'Original PNGs are preserved outside public; retire runtime copies only after hash verification.' }))

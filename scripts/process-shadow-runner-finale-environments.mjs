import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('..', import.meta.url))
const sourceRoot = path.join(root, 'source-assets/shadow-runner/rebuild')
const outputRoot = path.join(root, 'public/games/shadow-runner/rebuild')
const manifestPath = path.join(sourceRoot, 'processed-manifest.json')
const definitions = [
  { name: 'captain-gate', sizes: [['background', 1536, 864], ['thumbnail', 320, 180]] },
  { name: 'dawn-relay-spire', sizes: [['background', 1536, 864], ['thumbnail', 320, 180]] },
  { name: 'watch-banner', sizes: [['', 128, 448]], transparent: true },
  { name: 'relay-hanging-cage', sizes: [['', 80, 400]], transparent: true },
]
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

export async function prepareFinaleEnvironments(existing = []) {
  const sourceNames = new Set(definitions.map(item => `${item.name}-master.png`))
  const records = existing.filter(record => !sourceNames.has(record.source))
  await mkdir(outputRoot, { recursive: true })
  for (const item of definitions) {
    const source = `${item.name}-master.png`
    const original = await readFile(path.join(sourceRoot, source))
    const metadata = await sharp(original).metadata()
    if (item.transparent) assert.ok(metadata.hasAlpha, `${source} requires real alpha`)
    for (const [suffix, width, height] of item.sizes) {
      const filename = `${item.name}${suffix ? `-${suffix}` : ''}.webp`
      const pipeline = item.transparent ? sharp(original).trim({ threshold: 4 }) : sharp(original)
      const bytes = await pipeline.resize(width, height, {
        fit: item.transparent ? 'contain' : 'cover', background: '#00000000', kernel: 'lanczos3',
      }).webp(item.transparent ? { lossless: true, effort: 6 } : { quality: 82, effort: 6 }).toBuffer()
      assert.ok(bytes.length <= 300_000, `${filename} exceeds the per-image budget`)
      await writeFile(path.join(outputRoot, filename), bytes)
      records.push({ filename, width, height, bytes: bytes.length, sha256: hash(bytes), source,
        sourceWidth: metadata.width, sourceHeight: metadata.height, sourceSha256: hash(original) })
    }
  }
  return records
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const records = await prepareFinaleEnvironments(JSON.parse(await readFile(manifestPath, 'utf8')))
  await writeFile(manifestPath, `${JSON.stringify(records, null, 2)}\n`)
  const added = records.filter(record => definitions.some(item => record.source === `${item.name}-master.png`))
  console.log(JSON.stringify({ assets: added.map(({ filename, bytes }) => ({ filename, bytes })), totalBytes: added.reduce((sum, record) => sum + record.bytes, 0) }))
}

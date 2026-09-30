import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { prepareFinaleEnvironments } from './process-shadow-runner-finale-environments.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'source-assets/shadow-runner/rebuild')
const output = path.join(root, 'public/games/shadow-runner/rebuild')
await mkdir(output, { recursive: true })
const assets = ['east-gate-moonrise', 'moonlit-causeway', 'lantern-market', 'ivy-viaduct', 'bell-tower', 'candle-fair', 'clockmaker-yard', 'courier-catacombs', 'broken-crown', 'relay-ignition']
const manifest = []
for (const name of assets) {
  const original = await readFile(path.join(source, `${name}-master.png`))
  const master = await sharp(original).metadata()
  const sizes = [['background', 1536, 864], ...(['broken-crown', 'relay-ignition'].includes(name) ? [] : [['thumbnail', 320, 180]])]
  for (const [suffix, width, height] of sizes) {
    const filename = `${name}-${suffix}.webp`
    const bytes = await sharp(original).resize(width, height, { fit: 'cover', kernel: 'lanczos3' })
      .webp({ quality: suffix === 'background' ? 86 : 82, effort: 6 }).toBuffer()
    await writeFile(path.join(output, filename), bytes)
    manifest.push({ filename, width, height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), source: `${name}-master.png`, sourceWidth: master.width, sourceHeight: master.height, sourceSha256: createHash('sha256').update(original).digest('hex') })
  }
}
const walkwaySource = await readFile(path.join(source, 'silver-courier-walkway-master.png'))
const walkwayMaster = await sharp(walkwaySource).metadata()
if (!walkwayMaster.hasAlpha) throw new Error('Walkway master must contain real transparency')
// Reviewed alpha bounds. Crop only transparent margins; retain all original artwork.
const walkway = await sharp(walkwaySource).extract({ left: 66, top: 250, width: 2030, height: 262 })
  .resize(1024, 132, { kernel: 'lanczos3' }).webp({ lossless: true, effort: 6 }).toBuffer()
const walkwayName = 'silver-courier-walkway.webp'
await writeFile(path.join(output, walkwayName), walkway)
manifest.push({ filename: walkwayName, width: 1024, height: 132, bytes: walkway.length,
  sha256: createHash('sha256').update(walkway).digest('hex'), source: 'silver-courier-walkway-master.png',
  sourceWidth: walkwayMaster.width, sourceHeight: walkwayMaster.height,
  sourceSha256: createHash('sha256').update(walkwaySource).digest('hex') })
const waypostSource = await readFile(path.join(source, 'courier-waypost-master.png'))
const waypostMaster = await sharp(waypostSource).metadata()
if (!waypostMaster.hasAlpha) throw new Error('Waypost master must contain real transparency')
const { data: alphaPixels, info: alphaInfo } = await sharp(waypostSource).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
let left = alphaInfo.width, top = alphaInfo.height, right = -1, bottom = -1
for (let y = 0; y < alphaInfo.height; y++) {
  for (let x = 0; x < alphaInfo.width; x++) {
    // Discard nearly invisible generated matte specks, not the lantern's real silhouette.
    if (alphaPixels[(y * alphaInfo.width + x) * 4 + 3] > 4) {
      left = Math.min(left, x); top = Math.min(top, y)
      right = Math.max(right, x); bottom = Math.max(bottom, y)
    }
  }
}
if (right < left) throw new Error('Empty waypost artwork')
const waypost = await sharp(waypostSource).extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
  .resize(64, 176, { fit: 'contain', background: '#00000000', kernel: 'lanczos3' }).webp({ lossless: true, effort: 6 }).toBuffer()
await writeFile(path.join(output, 'courier-waypost.webp'), waypost)
manifest.push({ filename: 'courier-waypost.webp', width: 64, height: 176, bytes: waypost.length,
  sha256: createHash('sha256').update(waypost).digest('hex'), source: 'courier-waypost-master.png',
  sourceWidth: waypostMaster.width, sourceHeight: waypostMaster.height,
  sourceSha256: createHash('sha256').update(waypostSource).digest('hex') })
for (const item of [
  { name: 'relay-masonry', crop: { left: 84, top: 350, width: 1368, height: 364 }, height: 272 },
  { name: 'captain-masonry', crop: { left: 58, top: 366, width: 1420, height: 310 }, height: 224 },
]) {
  const original = await readFile(path.join(source, `${item.name}-master.png`))
  const master = await sharp(original).metadata()
  // Reviewed interiors remove surrounding glow, not the solid block artwork.
  const bytes = await sharp(original).extract(item.crop).resize(1024, item.height, { kernel: 'lanczos3' })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 }).toBuffer()
  await writeFile(path.join(output, `${item.name}.webp`), bytes)
  manifest.push({ filename: `${item.name}.webp`, width: 1024, height: item.height, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'), source: `${item.name}-master.png`,
    sourceWidth: master.width, sourceHeight: master.height,
    sourceSha256: createHash('sha256').update(original).digest('hex') })
}
const lanternSource = await readFile(path.join(source, 'catacomb-hanging-lantern-master.png'))
const lanternMaster = await sharp(lanternSource).metadata()
if (!lanternMaster.hasAlpha) throw new Error('Hanging lantern must contain real transparency')
const lantern = await sharp(lanternSource).trim({ threshold: 4 }).resize(72, 404, {
  fit: 'contain', background: '#00000000', kernel: 'lanczos3',
}).webp({ lossless: true, effort: 6 }).toBuffer()
await writeFile(path.join(output, 'catacomb-hanging-lantern.webp'), lantern)
manifest.push({ filename: 'catacomb-hanging-lantern.webp', width: 72, height: 404, bytes: lantern.length,
  sha256: createHash('sha256').update(lantern).digest('hex'), source: 'catacomb-hanging-lantern-master.png',
  sourceWidth: lanternMaster.width, sourceHeight: lanternMaster.height,
  sourceSha256: createHash('sha256').update(lanternSource).digest('hex') })
const completeManifest = await prepareFinaleEnvironments(manifest)
await writeFile(path.join(source, 'processed-manifest.json'), `${JSON.stringify(completeManifest, null, 2)}\n`)
console.log(JSON.stringify(completeManifest, null, 2))

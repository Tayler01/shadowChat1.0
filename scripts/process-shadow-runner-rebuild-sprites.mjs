import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export async function prepareRelayLancer({ publish = false } = {}) {
  const filename = 'relay-lancer-v2-6f-256x128.png'
  const output = path.join(root, publish ? 'public/games/shadow-runner/level-assets/level-10/enemies' : 'output/shadow-runner')
  const sourcePath = 'source-assets/shadow-runner/rebuild/relay-lancer-grid-master.png'
  const source = await readFile(path.join(root, sourcePath))
  const metadata = await sharp(source).metadata()
  assert.equal(metadata.hasAlpha, true, 'Never publish a baked checkerboard sprite draft')
  assert.deepEqual([metadata.width, metadata.height], [1536, 1024])
  const frameWidth = 256, frameHeight = 128, scale = 80 / 350
  // Reviewed per-pose regions and body anchors. Weapon bounds must not recenter a torso.
  const poses = [
    { x: 0, y: 0, width: 512, height: 512, bodyX: 240, feetY: 478 },
    { x: 512, y: 0, width: 512, height: 512, bodyX: 770, feetY: 475 },
    { x: 1024, y: 0, width: 512, height: 512, bodyX: 1280, feetY: 477 },
    { x: 0, y: 512, width: 576, height: 512, bodyX: 240, feetY: 943 },
    { x: 576, y: 512, width: 448, height: 512, bodyX: 770, feetY: 943 },
    { x: 1024, y: 512, width: 512, height: 512, bodyX: 1280, feetY: 949 },
  ]
  const composites = []
  const frames = []
  for (const [index, pose] of poses.entries()) {
    const { data, info } = await sharp(source).extract({ left: pose.x, top: pose.y, width: pose.width, height: pose.height }).raw().toBuffer({ resolveWithObject: true })
    let left = info.width, right = -1, top = info.height, bottom = -1
    let corePixels = 0
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] < 128) continue
      corePixels++
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
    assert(corePixels > 5000, `Frame${index} has no substantial intact body`)
    const feetY = Math.max(pose.feetY, pose.y + bottom + 1)
    // Crop only outside the reviewed silhouette plus edge margin; retain generated alpha.
    left = Math.max(0, left - 8); right = Math.min(info.width - 1, right + 8)
    top = Math.max(0, top - 8); bottom = Math.min(info.height - 1, bottom + 8)
    const crop = { left: pose.x + left, top: pose.y + top, width: right - left + 1, height: bottom - top + 1 }
    const width = Math.round(crop.width * scale), height = Math.round(crop.height * scale)
    const targetX = Math.round(frameWidth / 2 + (crop.left - pose.bodyX) * scale)
    const targetY = Math.round(frameHeight + (crop.top - feetY) * scale)
    // Preserve every opaque sole pixel; only the soft margin extends below the frame.
    const visibleHeight = Math.min(height, frameHeight - targetY)
    assert(targetX >= 0 && targetY >= 0 && targetX + width <= frameWidth && visibleHeight > 0, `Frame${index} exceeds its logical cell`)
    const input = await sharp(source).extract(crop).resize(width, height, { kernel: 'lanczos3' })
      .extract({ left: 0, top: 0, width, height: visibleHeight }).png().toBuffer()
    composites.push({ input, left: index * frameWidth + targetX, top: targetY })
    frames.push({ index, pose, feetY, crop, targetX, targetY, width, height: visibleHeight, corePixels })
  }
  const bytes = await sharp({ create: { width: frameWidth * poses.length, height: frameHeight, channels: 4, background: '#00000000' } })
    .composite(composites).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, filename), bytes)
  const report = { source: sourcePath, sourceSha256: createHash('sha256').update(source).digest('hex'), filename, frameWidth, frameHeight, scale, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), frames }
  await writeFile(path.join(root, 'source-assets/shadow-runner/rebuild/relay-lancer-preparation.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ output: path.join(output, filename), bytes: bytes.length, frames }, null, 2))
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareRelayLancer({ publish: process.argv.includes('--publish') })
}

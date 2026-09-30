import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { connectedAlpha } from './shadow-runner-sprite-frame-audit.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ARCHIVE = 'source-assets/shadow-runner/rebuild'
const RECOVERY = `${ARCHIVE}/recovered-enemies-v2`
const hash = data => createHash('sha256').update(data).digest('hex')
const check = (value, message) => { if (!value) throw new Error(message) }
const pose = (name, components, x, y) => ({ name, components, anchor: { x, y } })

// Component IDs use deterministic row-major, 8-connected alpha > 0 on the pinned source.
// They select complete original pixels, not rectangular crops containing neighboring poses.
export const RECOVERED_ENEMY_JOBS = [
  {
    key: 'prism-caster', level: 10,
    sourceSha256: '62f717baa5a735cb02f03cff959a6f0ec950cc40868c9045952674562c2ac712',
    legacySha256: '78e288a36191ee1343242d6e581a8df046d40b6d20afd3c58a87e1c4f6241976',
    sourceScale: 118 / 391, frameWidth: 256, frameHeight: 128,
    scale: 0.8, body: { width: 44, height: 72, offsetX: 42, offsetY: 56 },
    targetAnchor: { x: 128, y: 123 }, anchorKind: 'torso center X and supporting foot/robe tip Y',
    review: 'Separate projectile belongs to cast-release, floating diamonds to their original pose; low debris at x1248 belongs to defeated, not hit. Torso X does not follow effect bounds.',
    poses: [
      pose('hover-a', [1, 11], 157, 703),
      pose('hover-b', [2, 7, 13], 404, 700),
      pose('cast-charge', [3, 20, 30], 612, 709),
      pose('cast-release', [8, 17, 19, 21, 22, 24, 26, 27, 29, 31, 34], 834, 708),
      pose('hit', [4, 5, 6, 9, 10, 12, 14, 15, 16, 18, 25, 28, 32, 33, 35, 36, 37, 38, 42, 46], 1182, 712),
      pose('defeated', [23, 39, 40, 41, 43, 44, 45, 47, 48], 1414, 711),
    ],
  },
  {
    key: 'gearwing-drone', level: 10,
    sourceSha256: '3b6dfac1899d37572291ac99b73a8d215fa04747d0019b41aa6a7f2f47545ed7',
    legacySha256: '30be76e24cf43d529836444f4d437f4ec7460f3de13ac9f9b02e6dfa7889fda9',
    sourceScale: 118 / 330, frameWidth: 256, frameHeight: 192,
    scale: 0.76, body: { width: 56, height: 44, offsetX: 36, offsetY: 44 },
    targetAnchor: { x: 128, y: 130 }, anchorKind: 'reviewed central chassis, excluding wings, beak and effects',
    review: 'Full poses are separated by transparent corridors. Whole-component containment is required even for these ROIs. Extra 64px vertical padding retains source scale and lets chassis center match the unchanged world collision-body center.',
    poses: [
      { name: 'flight-folded', roi: [0, 0, 228, 1024], anchor: { x: 142, y: 514 } },
      { name: 'flight-raised', roi: [228, 0, 282, 1024], anchor: { x: 392, y: 516 } },
      { name: 'dive-charge', roi: [510, 0, 281, 1024], anchor: { x: 692, y: 561 } },
      { name: 'dive-release', roi: [791, 0, 289, 1024], anchor: { x: 988, y: 567 } },
      { name: 'hit', roi: [1080, 0, 211, 1024], anchor: { x: 1198, y: 539 } },
      { name: 'defeated', roi: [1291, 0, 245, 1024], anchor: { x: 1418, y: 585 } },
    ],
  },
  {
    key: 'storm-grenadier', level: 9,
    sourceSha256: '85fd1cd29d666a1327d21c17dd79ddc6e448fca316779045ed6f15448128dd40',
    legacySha256: 'b90db4ae0578ddd580c9265d8b645b31e344145664e33d92e3d657bd171f2461',
    sourceScale: 118 / 394, frameWidth: 256, frameHeight: 128,
    scale: 0.78, body: { width: 44, height: 70, offsetX: 42, offsetY: 58 },
    targetAnchor: { x: 128, y: 123 }, anchorKind: 'torso center X and supporting sole Y',
    review: 'The airborne grenade and fuse at x954..1098 belong entirely to throw-release. Its bounding rectangle overlaps hit horizontally, so components are isolated before cropping. No reconstructed or invented pixels.',
    poses: [
      pose('walk-a', [4], 125, 699), pose('walk-b', [5], 375, 698),
      pose('throw-windup', [11], 635, 698), pose('throw-release', [1, 2, 3], 869, 698),
      pose('hit', [6, 7, 8, 9, 10, 12, 13, 15], 1148, 698), pose('defeated', [14], 1395, 703),
    ],
  },
  {
    key: 'sentry-sovereign', level: 10, legacyFrameSize: 192,
    sourceSha256: '413234ace17bd18e18ade15ae04aca1f2daaf04a4e75e62e15cf1edd6ceaf09b',
    legacySha256: 'c9a4f172108dc4c96bddb3fb9e29583270d8e7847f2ee6b57b3e8463cd06da96',
    sourceScale: 178 / 436, frameWidth: 384, frameHeight: 192,
    scale: 0.82, body: { width: 84, height: 118, offsetX: 54, offsetY: 68 },
    targetAnchor: { x: 192, y: 185 }, anchorKind: 'torso center X and sole/contact Y; slam uses ice-obscured ground contact, defeated uses resting gear contact',
    review: 'All ten large pose components are disconnected. Broad axe, shield, cape and ice remain intact even where their bounding rectangles overlap another pose. Slam contact Y930 excludes tallest ice spikes and permits their11px below-contact fringe. Defeated gear touches ground at Y965; it is not a locomotion sole landmark.',
    poses: [
      pose('guard', [1], 174, 463), pose('march', [11], 478, 463), pose('shield', [4], 766, 468),
      pose('axe-sweep', [14, 22, 23, 24, 25], 1019, 468),
      pose('orb-cast', [2, 3, 5, 6, 7, 8, 9, 10, 12, 13, 15, 16, 17, 18, 19, 20, 21], 1358, 468),
      pose('sprint', [37, 38, 39, 40, 41, 42, 43, 44, 49, 53, 56, 57, 58, 62, 63, 64, 65, 66, 67, 69, 76, 77, 114, 116], 229, 924),
      pose('ice-slam', [27, 71, 78, 81, 83, 84, 87, 89, 90, 91, 92, 93, 95, 96, 98, 99, 100, 101, 102, 103, 104, 105, 106, 108, 109, 111, 113, 117, 118, 119, 120, 121, 123, 124, 126, 127, 128, 129, 132, 135, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 150, 151, 152, 156, 157, 158, 159], 516, 930),
      pose('hit', [35, 36, 45, 46, 47, 48, 50, 51, 52, 54, 55, 60, 61, 70, 79, 86, 97, 110, 134, 136, 148, 153, 154, 155], 804, 932),
      pose('enraged', [26, 28, 29, 30, 31, 32, 33, 34, 59, 149], 1060, 934),
      pose('defeated', [68, 72, 73, 74, 75, 80, 82, 85, 88, 94, 107, 112, 115, 122, 125, 130, 131, 133], 1365, 965),
    ],
  },
]

export function recommendedCatalog(job) {
  const legacySize = job.legacyFrameSize ?? 128
  return { frameCount: job.poses.length, frameWidth: job.frameWidth, frameSize: job.frameHeight,
    scale: job.scale, body: { ...job.body, offsetX: job.body.offsetX + (job.frameWidth - legacySize) / 2,
      offsetY: job.body.offsetY + job.frameHeight - legacySize } }
}

export function worldBodyRect({ frameWidth, frameSize, scale, body }) {
  return { left: (body.offsetX - frameWidth / 2) * scale,
    top: (body.offsetY - frameSize) * scale, width: body.width * scale, height: body.height * scale }
}

export function selectOwnedComponents(data, width, height, poses) {
  const { labels, components } = connectedAlpha(data, width, height, 0)
  const owners = new Map()
  const selections = poses.map((entry, index) => {
    let ids = entry.components
    if (entry.roi) {
      const [x, y, w, h] = entry.roi
      check([x, y, w, h].every(Number.isInteger) && x >= 0 && y >= 0 && w > 0 && h > 0
        && x + w <= width && y + h <= height, 'Invalid ownership ROI')
      ids = components.filter(c => c.left >= x && c.top >= y
        && c.left + c.width <= x + w && c.top + c.height <= y + h).map(c => c.id)
    }
    check(ids?.length, `Empty component ownership: ${entry.name}`)
    for (const id of ids) {
      check(Number.isInteger(id) && components[id - 1]?.id === id, `Unknown component ${id}`)
      check(!owners.has(id), `Duplicate component ownership: ${id}`)
      owners.set(id, index)
    }
    return ids.map(id => components[id - 1])
  })
  check(owners.size === components.length, 'Unowned source alpha/component; review the full source instead of truncating it')
  return { labels, components, owners, selections }
}

export function isolatePose(data, width, selection, labels) {
  const ids = new Set(selection.map(c => c.id))
  const left = Math.min(...selection.map(c => c.left)), top = Math.min(...selection.map(c => c.top))
  const right = Math.max(...selection.map(c => c.left + c.width)), bottom = Math.max(...selection.map(c => c.top + c.height))
  const bounds = { left, top, width: right - left, height: bottom - top }
  const rgba = Buffer.alloc(bounds.width * bounds.height * 4)
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const from = y * width + x
    if (ids.has(labels[from])) data.copy(rgba, ((y - top) * bounds.width + x - left) * 4, from * 4, from * 4 + 4)
  }
  return { rgba, bounds }
}

export function placementFor(job, entry, bounds) {
  const width = Math.max(1, Math.round(bounds.width * job.sourceScale))
  const height = Math.max(1, Math.round(bounds.height * job.sourceScale))
  const left = Math.round(job.targetAnchor.x - (entry.anchor.x - bounds.left) * width / bounds.width)
  const top = Math.round(job.targetAnchor.y - (entry.anchor.y - bounds.top) * height / bounds.height)
  check(left >= 1 && top >= 1 && left + width < job.frameWidth && top + height < job.frameHeight,
    `Clipped pose ${job.key}/${entry.name}; add padding rather than cropping or silently scaling`)
  return { left, top, width, height, transformedAnchor: {
    x: left + (entry.anchor.x - bounds.left) * width / bounds.width,
    y: top + (entry.anchor.y - bounds.top) * height / bounds.height } }
}

export async function recoverJob(job, sourceBytes) {
  check(hash(sourceBytes) === job.sourceSha256, `${job.key}: source hash changed; ownership review required`)
  const decoded = await sharp(sourceBytes).raw().toBuffer({ resolveWithObject: true })
  const { data, info } = decoded
  check(info.channels === 4 && info.width === 1536 && info.height === 1024, 'Expected original RGBA source dimensions')
  check(data.some((value, index) => index % 4 === 3 && value === 0), 'Source has no transparent alpha')
  const owned = selectOwnedComponents(data, info.width, info.height, job.poses)
  const recovered = []
  for (const [index, entry] of job.poses.entries()) {
    const components = owned.selections[index]
    const { rgba, bounds } = isolatePose(data, info.width, components, owned.labels)
    const raw = { width: bounds.width, height: bounds.height, channels: 4 }
    const crop = await sharp(rgba, { raw }).png().toBuffer()
    const placement = placementFor(job, entry, bounds)
    const scaled = await sharp(rgba, { raw }).resize(placement.width, placement.height, { kernel: 'nearest' }).png().toBuffer()
    const frame = await sharp({ create: { width: job.frameWidth, height: job.frameHeight, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: scaled, left: placement.left, top: placement.top }]).png().toBuffer()
    recovered.push({ crop, frame, metadata: { name: entry.name, frame: index + 1, sourceBounds: bounds,
      sourceAnchor: entry.anchor, sourceComponents: components, sourceVisiblePixels: components.reduce((sum, c) => sum + c.pixels, 0),
      placement, cropSha256: hash(crop), frameSha256: hash(frame) } })
  }
  const strip = await sharp({ create: { width: job.frameWidth * recovered.length, height: job.frameHeight, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(recovered.map((frame, index) => ({ input: frame.frame,
    left: index * job.frameWidth, top: 0 }))).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
  const catalog = recommendedCatalog(job)
  const metadata = { schemaVersion: 1, key: job.key, sourceSha256: job.sourceSha256, legacySha256: job.legacySha256,
    sourceDimensions: { width: info.width, height: info.height }, segmentation: '8-connected alpha > 0; every source component owned exactly once',
    sourceScale: job.sourceScale, sourceVisiblePixels: owned.components.reduce((sum, c) => sum + c.pixels, 0),
    anchorKind: job.anchorKind, targetAnchor: job.targetAnchor, review: job.review, recommendedCatalog: catalog,
    legacyWorldBodyRect: worldBodyRect({ frameWidth: job.legacyFrameSize ?? 128, frameSize: job.legacyFrameSize ?? 128, scale: job.scale, body: job.body }),
    recommendedWorldBodyRect: worldBodyRect(catalog), frames: recovered.map(frame => frame.metadata), stripSha256: hash(strip),
    stripBytes: strip.length, decodedRgbaBytes: job.frameWidth * job.frameHeight * recovered.length * 4 }
  return { strip, recovered, metadata }
}

async function preserveFile(filename, bytes) {
  await mkdir(path.dirname(filename), { recursive: true })
  try { await writeFile(filename, bytes, { flag: 'wx' }) }
  catch (error) {
    if (error.code !== 'EEXIST') throw error
    check(hash(await readFile(filename)) === hash(bytes), `Refusing to overwrite different preserved file: ${filename}`)
  }
}

async function contactSheet(job, result, legacy, filename) {
  const legacySize = job.legacyFrameSize ?? 128, legacyColumns = Math.min(6, job.poses.length)
  const legacyRows = Math.ceil(job.poses.length / legacyColumns)
  const composites = [], track = job.frameWidth + 32, width = Math.max(track * 3, legacySize * legacyColumns)
  const rowHeight = 230, rows = Math.ceil(job.poses.length / 3)
  const body = recommendedCatalog(job).body
  for (let i = 0; i < result.recovered.length; i += 1) {
    const left = (i % 3) * track, top = Math.floor(i / 3) * rowHeight
    const overlay = Buffer.from(`<svg width="${job.frameWidth}" height="${job.frameHeight}"><rect x="${body.offsetX}" y="${body.offsetY}" width="${body.width}" height="${body.height}" fill="none" stroke="#5cf08c"/><path d="M${job.targetAnchor.x - 5} ${job.targetAnchor.y}h10 M${job.targetAnchor.x} ${job.targetAnchor.y - 5}v10" stroke="#ff6873"/></svg>`)
    const frame = await sharp(result.recovered[i].frame).composite([{ input: overlay }]).png().toBuffer()
    composites.push({ input: frame, left, top: top + 25 })
    composites.push({ input: Buffer.from(`<svg width="${track}" height="24"><text x="8" y="18" font-size="14" fill="white">${i + 1}: ${job.poses[i].name}</text></svg>`), left, top })
  }
  for (let index = 0; index < job.poses.length; index += 1) composites.push({ input: await sharp(legacy)
    .extract({ left: index * legacySize, top: 0, width: legacySize, height: legacySize }).png().toBuffer(),
    left: index % legacyColumns * legacySize, top: rowHeight * rows + 30 + Math.floor(index / legacyColumns) * legacySize })
  composites.push({ input: Buffer.from('<svg width="800" height="24"><text x="8" y="18" font-size="14" fill="white">Legacy v1 below; candidate above. Green = unchanged world body, red = reviewed anchor.</text></svg>'), left: 0, top: rowHeight * rows })
  await sharp({ create: { width, height: rowHeight * rows + 40 + legacyRows * legacySize, channels: 4, background: '#252b30' } })
    .composite(composites).png().toFile(filename)
}

export async function prepareRecoveredEnemies({ publish = false, verify = false, level } = {}) {
  check(!(publish && verify), 'Choose publish or verify')
  check(level === undefined || [9, 10].includes(level), 'Only recovery levels9 and10 are supported')
  const output = path.join(ROOT, 'output', 'playwright', 'runner-recovered-enemies-v2')
  const reports = []
  if (!verify) await mkdir(output, { recursive: true })
  for (const job of RECOVERED_ENEMY_JOBS) {
    if (level !== undefined && job.level !== level) continue
    const count = job.poses.length, legacySize = job.legacyFrameSize ?? 128
    const sourcePath = `source-assets/shadow-runner/level-assets/level-${job.level}/${job.key}-v1-${count}f-transparent.png`
    const sourceArchivePath = `${RECOVERY}/original-${job.key}-v1-${count}f-transparent.png`
    const legacyPath = `public/games/shadow-runner/level-assets/level-${job.level}/enemies/${job.key}-v1-${count}f-${legacySize}.png`
    const archivePath = `${ARCHIVE}/legacy-${job.key}-v1-${count}f-${legacySize}.png`
    const runtimePath = `public/games/shadow-runner/level-assets/level-${job.level}/enemies/${job.key}-v2-${count}f-${job.frameWidth}x${job.frameHeight}.png`
    const source = await readFile(path.join(ROOT, sourcePath))
    // After integration v1 may be removed from public; the immutable archive remains authoritative.
    const legacy = await readFile(path.join(ROOT, archivePath)).catch(error => {
      if (error.code !== 'ENOENT') throw error
      return readFile(path.join(ROOT, legacyPath))
    })
    check(hash(legacy) === job.legacySha256, `${job.key}: unexpected legacy runtime hash`)
    const result = await recoverJob(job, source)
    const metadata = { ...result.metadata, sourcePath, sourceArchivePath, archivePath, runtimePath }
    const metadataBytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`)
    const metadataPath = path.join(ROOT, RECOVERY, `${job.key}.json`)
    if (verify) {
      check(hash(await readFile(path.join(ROOT, archivePath))) === job.legacySha256, `${job.key}: legacy preservation copy differs`)
      check(hash(await readFile(path.join(ROOT, sourceArchivePath))) === job.sourceSha256, `${job.key}: original preservation copy differs`)
      check(hash(await readFile(path.join(ROOT, runtimePath))) === hash(result.strip), `${job.key}: runtime derivative differs`)
      check(hash(await readFile(metadataPath)) === hash(metadataBytes), `${job.key}: recovery metadata differs`)
      for (const frame of result.recovered) check(hash(await readFile(path.join(ROOT, RECOVERY, `${job.key}-${frame.metadata.frame}-${frame.metadata.name}.png`))) === hash(frame.crop), `${job.key}: source crop differs`)
    } else {
      await writeFile(path.join(output, `${job.key}-v2.png`), result.strip)
      await contactSheet(job, result, legacy, path.join(output, `${job.key}-comparison.png`))
      await writeFile(path.join(output, `${job.key}.json`), metadataBytes)
      const marks = result.recovered.map(({ metadata: m }) => {
        const b = m.sourceBounds, a = m.sourceAnchor
        return `<rect x="${b.left}" y="${b.top}" width="${b.width}" height="${b.height}" fill="none" stroke="#5cf08c"/><text x="${b.left}" y="${b.top - 8}" fill="white" font-size="16">${m.frame}: ${m.name}</text><path d="M${a.x - 8} ${a.y}h16 M${a.x} ${a.y - 8}v16" stroke="#ff6873"/>`
      }).join('')
      await sharp(source).flatten({ background: '#252b30' }).composite([{ input: Buffer.from(`<svg width="1536" height="1024">${marks}</svg>`) }])
        .png().toFile(path.join(output, `${job.key}-source-ownership.png`))
    }
    if (publish) {
      await preserveFile(path.join(ROOT, sourceArchivePath), source)
      await preserveFile(path.join(ROOT, archivePath), legacy)
      await preserveFile(path.join(ROOT, runtimePath), result.strip)
      await preserveFile(metadataPath, metadataBytes)
      for (const frame of result.recovered) await preserveFile(path.join(ROOT, RECOVERY, `${job.key}-${frame.metadata.frame}-${frame.metadata.name}.png`), frame.crop)
    }
    check(hash(await readFile(path.join(ROOT, sourcePath))) === job.sourceSha256, 'Source changed during recovery')
    reports.push(metadata)
  }
  if (!verify) await writeFile(path.join(output, 'report.json'), `${JSON.stringify({ mode: publish ? 'derivatives-only' : 'candidate-only',
    pipelineSha256: hash(await readFile(fileURLToPath(import.meta.url))), reports,
    segmentationHelperSha256: hash(await readFile(new URL('./shadow-runner-sprite-frame-audit.mjs', import.meta.url))), sharpVersion: sharp.versions.sharp,
    acceptanceGaps: ['Catalog integration requires main review.', 'No browser, animation playback, combat, flip or physical-phone acceptance.',
      'Anatomical anchors are manually reviewed, not automatic semantic detection.', 'Nearest-neighbor reduction may omit subpixel source specks; lossless isolated source crops preserve all alpha.'] }, null, 2)}\n`)
  return reports
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  check(args.length <= 1 && args.every(arg => ['--publish', '--check'].includes(arg)), 'Usage: node scripts/process-shadow-runner-recovered-enemies.mjs [--publish|--check]')
  const reports = await prepareRecoveredEnemies({ publish: args.includes('--publish'), verify: args.includes('--check') })
  console.log(JSON.stringify({ mode: args[0] ?? 'candidate', jobs: reports.map(report => ({ key: report.key,
    frames: report.frames.length, sha256: report.stripSha256, catalog: report.recommendedCatalog })) }, null, 2))
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { RECOVERED_ENEMY_JOBS, recommendedCatalog, worldBodyRect, selectOwnedComponents,
  isolatePose, placementFor, recoverJob } from '../scripts/process-shadow-runner-recovered-enemies.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const sourceBytes = job => readFile(new URL(`../source-assets/shadow-runner/level-assets/level-${job.level}/${job.key}-v1-${job.poses.length}f-transparent.png`, import.meta.url))
const pixels = (width, height, points) => {
  const data = Buffer.alloc(width * height * 4)
  for (const [x, y, alpha = 255] of points) data.set([40, 80, 120, alpha], (y * width + x) * 4)
  return data
}

test('scope is the four reviewed originals, never main Lancer or generated alternates', () => {
  assert.deepEqual(RECOVERED_ENEMY_JOBS.map(j => j.key), ['prism-caster', 'gearwing-drone', 'storm-grenadier', 'sentry-sovereign'])
  assert.deepEqual(RECOVERED_ENEMY_JOBS.map(j => j.poses.length), [6, 6, 6, 10])
  for (const job of RECOVERED_ENEMY_JOBS) {
    assert.match(job.sourceSha256, /^[a-f0-9]{64}$/)
    assert.match(job.legacySha256, /^[a-f0-9]{64}$/)
  }
})

test('compensating frame offsets retain exact world-space collision rectangle and scale', () => {
  for (const job of RECOVERED_ENEMY_JOBS) {
    const oldSize = job.legacyFrameSize ?? 128
    const old = worldBodyRect({ frameWidth: oldSize, frameSize: oldSize, scale: job.scale, body: job.body })
    assert.deepEqual(worldBodyRect(recommendedCatalog(job)), old)
  }
  assert.deepEqual(recommendedCatalog(RECOVERED_ENEMY_JOBS[1]).body, { width: 56, height: 44, offsetX: 100, offsetY: 108 })
  assert.deepEqual(recommendedCatalog(RECOVERED_ENEMY_JOBS[3]).body, { width: 84, height: 118, offsetX: 150, offsetY: 68 })
})

test('explicit ownership preserves faint alpha and rejects duplicate, unknown and missing components', () => {
  const data = pixels(5, 2, [[0, 0, 1], [4, 1]])
  const poses = [{ name: 'first', components: [1] }, { name: 'second', components: [2] }]
  assert.equal(selectOwnedComponents(data, 5, 2, poses).owners.size, 2)
  assert.throws(() => selectOwnedComponents(data, 5, 2, [...poses, poses[0]]), /Duplicate/)
  assert.throws(() => selectOwnedComponents(data, 5, 2, [poses[0]]), /Unowned/)
  assert.throws(() => selectOwnedComponents(data, 5, 2, [{ components: [3] }]), /Unknown/)
})

test('ROI cannot silently split a connected pose or assign it twice', () => {
  const data = pixels(6, 3, [[2, 1], [3, 1]])
  assert.throws(() => selectOwnedComponents(data, 6, 3, [{ roi: [0, 0, 3, 3] }]), /Empty|Unowned/)
  assert.throws(() => selectOwnedComponents(data, 6, 3, [{ roi: [0, 0, 6, 3] }, { roi: [0, 0, 6, 3] }]), /Duplicate/)
  assert.throws(() => selectOwnedComponents(data, 6, 3, [{ roi: [-1, 0, 6, 3] }]), /Invalid/)
})

test('isolating a component excludes a different pose inside its overlapping bounding rectangle', () => {
  const data = pixels(7, 7, [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0],
    [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [4, 4]])
  const owned = selectOwnedComponents(data, 7, 7, [{ components: [1] }, { components: [2] }])
  const isolated = isolatePose(data, 7, owned.selections[0], owned.labels)
  assert.deepEqual(isolated.bounds, { left: 0, top: 0, width: 7, height: 7 })
  assert.equal(isolated.rgba[(4 * 7 + 4) * 4 + 3], 0)
  assert.equal(isolated.rgba[3], 255)
})

test('placement rejects clipping rather than auto-fitting or silently deleting art', () => {
  const job = { key: 'test', sourceScale: 1, frameWidth: 10, frameHeight: 10, targetAnchor: { x: 5, y: 9 } }
  assert.throws(() => placementFor(job, { name: 'tall', anchor: { x: 1, y: 20 } }, { left: 0, top: 0, width: 3, height: 20 }), /Clipped/)
})

for (const job of RECOVERED_ENEMY_JOBS) {
  test(`${job.key}: pinned source, whole ownership, intact dominant poses, no clipping and genuine alpha`, async () => {
    const source = await sourceBytes(job)
    const original = await sharp(source).raw().toBuffer({ resolveWithObject: true })
    const before = hash(source)
    const result = await recoverJob(job, source)
    assert.equal(hash(source), before)
    assert.deepEqual(result.metadata.legacyWorldBodyRect, result.metadata.recommendedWorldBodyRect)
    assert.equal(result.recovered.length, job.poses.length)
    assert.equal(result.metadata.frames.reduce((sum, frame) => sum + frame.sourceVisiblePixels, 0), result.metadata.sourceVisiblePixels)
    for (const frame of result.recovered) {
      assert.ok(Math.max(...frame.metadata.sourceComponents.map(c => c.pixels)) > 10000)
      const raw = await sharp(frame.frame).raw().toBuffer({ resolveWithObject: true })
      assert.equal(raw.info.channels, 4)
      assert.equal(raw.info.width, job.frameWidth)
      assert.equal(raw.info.height, job.frameHeight)
      let visible = 0, transparent = 0
      for (let y = 0; y < raw.info.height; y += 1) for (let x = 0; x < raw.info.width; x += 1) {
        const alpha = raw.data[(y * raw.info.width + x) * 4 + 3]
        if (alpha) visible += 1
        else transparent += 1
        if (x === 0 || y === 0 || x === raw.info.width - 1 || y === raw.info.height - 1) assert.equal(alpha, 0)
      }
      assert.ok(visible > 1000)
      assert.ok(transparent > visible)
      assert.ok(Math.abs(frame.metadata.placement.transformedAnchor.x - job.targetAnchor.x) <= 0.5)
      assert.ok(Math.abs(frame.metadata.placement.transformedAnchor.y - job.targetAnchor.y) <= 0.5)
      const crop = await sharp(frame.crop).raw().toBuffer()
      assert.equal(crop.filter((alpha, index) => index % 4 === 3 && alpha > 0).length, frame.metadata.sourceVisiblePixels)
      const bounds = frame.metadata.sourceBounds
      for (let y = 0; y < bounds.height; y += 1) for (let x = 0; x < bounds.width; x += 1) {
        const index = (y * bounds.width + x) * 4
        if (!crop[index + 3]) continue
        const sourceIndex = ((y + bounds.top) * original.info.width + x + bounds.left) * 4
        assert.equal(crop.readUInt32LE(index), original.data.readUInt32LE(sourceIndex))
      }
    }
    await assert.rejects(recoverJob({ ...job, sourceSha256: '0'.repeat(64) }, source), /source hash changed/)
  })
}

test('known broken components are now wholly owned by their actual attack or defeated pose', () => {
  const [caster, , grenadier, sovereign] = RECOVERED_ENEMY_JOBS
  assert.ok(caster.poses[3].components.includes(8) && caster.poses[3].components.includes(24))
  assert.ok(caster.poses[5].components.includes(45))
  assert.ok(grenadier.poses[3].components.includes(1) && grenadier.poses[4].components.includes(8))
  assert.ok(sovereign.poses[3].components.includes(14))
  assert.ok(sovereign.poses[6].components.includes(27))
  assert.ok(sovereign.poses[9].components.includes(80))
})

test('Drone aligns chassis to unchanged body center rather than bottommost wing or effect', () => {
  const job = RECOVERED_ENEMY_JOBS[1], catalog = recommendedCatalog(job)
  assert.equal(job.targetAnchor.x, catalog.body.offsetX + catalog.body.width / 2)
  assert.equal(job.targetAnchor.y, catalog.body.offsetY + catalog.body.height / 2)
  assert.equal(job.sourceScale, 118 / 330)
})

test('processor has no browser, generation, catalog/manifest editing or original-pipeline invocation', async () => {
  const source = await readFile(new URL('../scripts/process-shadow-runner-recovered-enemies.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]playwright|imagegen|runtimeCatalog\.ts|assets\/manifest\.ts|execSync|spawn\(/)
  assert.match(source, /flag: 'wx'/)
  assert.match(source, /Refusing to overwrite different preserved file/)
})

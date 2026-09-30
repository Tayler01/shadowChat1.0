import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { getShadowRunnerRuntimeManifest, SHADOW_RUNNER_ENEMY_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'

const Body = jest.requireActual('phaser/src/physics/arcade/Body')

test('wider lancer weapon cells preserve the original centered physical body', () => {
  const runtime = SHADOW_RUNNER_ENEMY_RUNTIME['relay-lancer']
  const width = runtime.frameWidth!, height = runtime.frameSize ?? 128
  const sprite = { x: 500, y: 616, angle: 0, width, height, displayWidth: width, displayHeight: height,
    displayOriginX: width / 2, displayOriginY: height, scaleX: 1, scaleY: 1,
    frame: { realWidth: width, realHeight: height } }
  const body = new Body({ defaults: {} }, sprite)
  sprite.scaleX = runtime.scale; sprite.scaleY = runtime.scale
  body.setSize(runtime.body.width, runtime.body.height)
  body.setOffset(runtime.body.offsetX, runtime.body.offsetY)
  body.updateFromGameObject()
  expect(body.width).toBeCloseTo(43)
  expect(body.height).toBeCloseTo(68.8)
  expect(body.left + body.width / 2).toBeCloseTo(500)
  expect(body.bottom).toBeCloseTo(616)
  const sheet = getShadowRunnerRuntimeManifest(SHADOW_RUNNER_LEVEL_CONFIGS['level-10']).find(asset => asset.key === 'relay-lancer')!
  expect(sheet).toMatchObject({ type: 'spritesheet', frameWidth: 256, frameHeight: 128, frameCount: 6 })
})

test('all six prepared poses are intact, substantial, foot-anchored and isolated', async () => {
  const bytes = fs.readFileSync(path.join(process.cwd(), 'public', SHADOW_RUNNER_ASSETS.enemies.relayLancerStrip))
  const record = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'source-assets/shadow-runner/rebuild/relay-lancer-preparation.json'), 'utf8'))
  const source = fs.readFileSync(path.join(process.cwd(), record.source))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(record.sha256)
  expect(createHash('sha256').update(source).digest('hex')).toBe(record.sourceSha256)
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect([info.width, info.height]).toEqual([1536, 128])
  for (let frame = 0; frame < 6; frame++) {
    let core = 0, bottom = -1, edgePixels = 0, torsoCore = 0
    for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
      const alpha = data[(y * info.width + frame * 256 + x) * 4 + 3]
      if (x < 8 || x >= 248) edgePixels += alpha > 0 ? 1 : 0
      if (alpha < 128) continue
      core++; bottom = y
      if (x >= 103 && x < 153 && y >= 48) torsoCore++
    }
    expect(core).toBeGreaterThan(1500)
    expect(torsoCore).toBeGreaterThan(900)
    expect(bottom).toBeGreaterThanOrEqual(126)
    expect(edgePixels).toBe(0)
  }
  expect(record.frames).toHaveLength(6)
  expect(record.scale).toBeCloseTo(80 / 350)
})

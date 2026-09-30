import path from 'node:path'
import sharp from 'sharp'
import Phaser from 'phaser'
import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, type ShadowRunnerPlayableLevelId } from '../src/features/games/shadow-runner/game/levels'
import { getShadowRunnerRuntimeManifest } from '../src/features/games/shadow-runner/game/runtimeCatalog'
import { getShadowRunnerDistrictDepth, getShadowRunnerDepthPropX, SHADOW_RUNNER_CATACOMB_LANTERN, SHADOW_RUNNER_DEPTH_ASSETS, SHADOW_RUNNER_WATCH_BANNER, SHADOW_RUNNER_RELAY_CAGE } from '../src/features/games/shadow-runner/game/runtimeDistrictDepth'
import {
  getShadowRunnerOpeningBackdropLayout,
  getShadowRunnerOpeningBackdropX,
  getShadowRunnerWalkwayPatches,
  SHADOW_RUNNER_OPENING_WALKWAY,
  usesShadowRunnerOpeningArt,
  usesShadowRunnerDepthBackdrop,
} from '../src/features/games/shadow-runner/game/runtimeOpeningArt'

jest.mock('phaser', () => {
  class Image {
    width = 1536
    height = 864
    displayWidth = 1536
    displayHeight = 864
    originX = 0.5
    originY = 0.5
    alpha = 1
    data = new Map()
    constructor(public x: number, public y: number, public texture: string, public frame?: string) {}
    setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this }
    setAlpha(value: number) { this.alpha = value; return this }
    setDepth() { return this }
    setDisplaySize(w: number, h: number) { this.displayWidth = w; this.displayHeight = h; return this }
    setPosition(x: number, y: number) { this.x = x; this.y = y; return this }
    setScrollFactor() { return this }
    setData(key: string, value: unknown) { this.data.set(key, value); return this }
    getTopLeft(v: { set: (x: number, y: number) => void }) { v.set(this.x - this.displayWidth * this.originX, this.y - this.displayHeight * this.originY) }
  }
  class Rectangle extends Image {
    constructor(x: number, y: number, width: number, height: number) { super(x, y, ''); this.setDisplaySize(width, height) }
  }
  return { __esModule: true, default: {
    Scene: class { events = new (jest.requireActual('eventemitter3'))() },
    Game: class { constructor(public config: { scene: unknown[] }) {} },
    GameObjects: { Image, Rectangle },
    Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
    Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
    Loader: { Events: jest.requireActual('phaser/src/loader/events') },
  } }
})

const openingLevels = [SHADOW_RUNNER_LEVEL_CONFIGS.tutorial, SHADOW_RUNNER_LEVEL_CONFIGS['level-1']]
const openingPlatforms = openingLevels.flatMap(level => level.platforms)

function runtime(levelId: ShadowRunnerPlayableLevelId = 'tutorial', reducedMotion = false) {
  const onLoadError = jest.fn()
  const onReady = jest.fn()
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), input: { current: createShadowRunnerInputState() }, levelId, reducedMotion, onHudChange: jest.fn(), onLoadError, onReady })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  const source = document.createElement('img')
  source.width = 1024
  source.height = 132
  const cached = new Map<string, { refresh: jest.Mock; getContext: () => { drawImage: jest.Mock; imageSmoothingEnabled: boolean } }>()
  scene.textures = {
    exists: (key: string) => key === SHADOW_RUNNER_OPENING_WALKWAY.textureKey || cached.has(key),
    get: () => ({ getSourceImage: () => source, has: () => false }),
    getFrame: () => ({ height: 400 }),
    createCanvas: jest.fn((key: string) => {
      const context = { drawImage: jest.fn(), imageSmoothingEnabled: true }
      const texture = { refresh: jest.fn(), getContext: () => context }
      cached.set(key, texture)
      return texture
    }),
  }
  scene.cameras = { main: { scrollX: 0, shakeEffect: { reset: jest.fn() }, flashEffect: { reset: jest.fn() } } }
  scene.physics = { world: { pause: jest.fn(), resume: jest.fn() } }
  scene.sys = { isActive: () => false, isPaused: () => false }
  scene.add = {
    image: jest.fn((x, y, key, frame) => new (Phaser.GameObjects.Image as any)(x, y, key, frame)),
    rectangle: jest.fn((x, y, width, height) => new (Phaser.GameObjects.Rectangle as any)(x, y, width, height)),
  }
  const StaticBody = jest.requireActual('phaser/src/physics/arcade/StaticBody')
  const world = { defaults: {}, staticTree: { remove: jest.fn(), insert: jest.fn() } }
  const colliders: any[] = []
  scene.platforms = { add: (object: any) => { object.body = new StaticBody(world, object); colliders.push(object) } }
  return { scene, game, source, cached, colliders, onLoadError, onReady }
}

describe('Opening walkway raster composition', () => {
  test.each(openingPlatforms)('$id $width x $height keeps uniform stone scale and covers the authored rectangle', platform => {
    const patches = getShadowRunnerWalkwayPatches(platform.width, platform.height)
    let area = 0
    for (const { source, destination } of patches) {
      expect(destination.width / source.width).toBe(0.5)
      expect(destination.height / source.height).toBe(0.5)
      expect(source.x).toBeGreaterThanOrEqual(0)
      expect(source.y).toBeGreaterThanOrEqual(0)
      expect(source.x + source.width).toBeLessThanOrEqual(1024)
      expect(source.y + source.height).toBeLessThanOrEqual(64)
      expect(destination.x + destination.width).toBeLessThanOrEqual(platform.width)
      expect(destination.y + destination.height).toBeLessThanOrEqual(platform.height)
      area += destination.width * destination.height
    }
    expect(area).toBe(platform.width * platform.height)
  })

  test('short, narrow and multi-panel widths clip source pixels instead of squeezing caps or courses', () => {
    for (const width of [1, 7, 29, 30, 148, 500, 690, 4000]) {
      const patches = getShadowRunnerWalkwayPatches(width, 12)
      expect(patches.reduce((sum, patch) => sum + patch.destination.width * patch.destination.height, 0)).toBe(width * 12)
      expect(patches.every(patch => patch.destination.width / patch.source.width === 0.5)).toBe(true)
    }
    expect(() => getShadowRunnerWalkwayPatches(0, 20)).toThrow()
    expect(() => getShadowRunnerWalkwayPatches(20, Number.POSITIVE_INFINITY)).toThrow()
    expect(() => getShadowRunnerWalkwayPatches(20.5, 20)).toThrow()
  })

  test('actual alpha reaches contact within 3 pixels and stays solid through every platform body', async () => {
    const file = path.join(process.cwd(), 'public', SHADOW_RUNNER_ASSETS.rebuild.silverCourierWalkway)
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height, info.channels]).toEqual([1024, 132, 4])
    for (const platform of openingPlatforms) {
      const pixels = new Uint8Array(platform.width * platform.height)
      const coverage = new Uint8Array(pixels.length)
      for (const { source, destination: d } of getShadowRunnerWalkwayPatches(platform.width, platform.height)) {
        for (let y = d.y; y < d.y + d.height; y++) {
          for (let x = d.x; x < d.x + d.width; x++) {
            const sx = Math.floor(source.x + (x - d.x + 0.5) / 0.5)
            const sy = Math.floor(source.y + (y - d.y + 0.5) / 0.5)
            const index = y * platform.width + x
            pixels[index] = data[(sy * info.width + sx) * 4 + 3]
            coverage[index]++
          }
        }
      }
      expect(coverage.every(count => count === 1)).toBe(true)
      let worstTop = 0
      let minBodyAlpha = 255
      for (let x = 0; x < platform.width; x++) {
        let top = 0
        while (top < platform.height && pixels[top * platform.width + x] < 240) top++
        worstTop = Math.max(worstTop, top)
        for (let y = 3; y < platform.height; y++) minBodyAlpha = Math.min(minBodyAlpha, pixels[y * platform.width + x])
      }
      expect(worstTop).toBeLessThanOrEqual(3)
      expect(minBodyAlpha).toBeGreaterThanOrEqual(240)
    }
  })

  test.each(openingLevels)('$id creates one image per static collider without altering any body bounds', level => {
    const { scene, colliders, cached } = runtime(level.id)
    const before = JSON.stringify(level.platforms)
    level.platforms.forEach(platform => scene.createStaticPlatform(platform))
    expect(JSON.stringify(level.platforms)).toBe(before)
    expect(scene.add.image).toHaveBeenCalledTimes(level.platforms.length)
    expect(colliders.map(({ body }) => ({ x: body.left, y: body.top, width: body.width, height: body.height })))
      .toEqual(level.platforms.map(({ x, y, width, height }) => ({ x, y, width, height })))
    level.platforms.forEach((platform, index) => {
      const image = scene.add.image.mock.results[index].value
      expect([image.x - image.displayWidth / 2, image.y - image.displayHeight / 2]).toEqual([platform.x, platform.y])
      expect([image.displayWidth, image.displayHeight]).toEqual([platform.width, platform.height])
    })
    for (const texture of cached.values()) {
      expect(texture.refresh).toHaveBeenCalledTimes(1)
      expect(texture.getContext().imageSmoothingEnabled).toBe(false)
    }
  })

  test('same-size platforms share a baked texture and canvas draw calls exactly follow raster patches', () => {
    const { scene, source, cached } = runtime()
    const key = scene.createOpeningPlatformTexture(690, 72)
    expect(scene.createOpeningPlatformTexture(690, 72)).toBe(key)
    expect(scene.textures.createCanvas).toHaveBeenCalledTimes(1)
    expect(cached.get(key)!.getContext().drawImage.mock.calls).toEqual(getShadowRunnerWalkwayPatches(690, 72).map(({ source: s, destination: d }) => [source, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height]))
  })

  test('later terrain art meets the same unmodified Phaser body after contact calibration', () => {
    const { scene, colliders } = runtime('level-6')
    const platform = SHADOW_RUNNER_LEVEL_CONFIGS['level-6'].platforms[0]
    scene.textures.exists = () => true
    scene.textures.get = () => ({ has: () => true })
    scene.textures.getFrame = () => ({ height: 220 })
    scene.createStaticPlatform(platform)
    const image = scene.add.image.mock.results[0].value
    const scale = image.displayHeight / 220
    const top = image.y - image.displayHeight / 2
    expect(top + 50 * scale).toBeCloseTo(platform.y, 8)
    expect(top + 214 * scale).toBeCloseTo(platform.y + platform.height, 8)
    const body = colliders[0].body
    expect([body.left, body.top, body.width, body.height]).toEqual([platform.x, platform.y, platform.width, platform.height])
  })

  test('hidden surfaces stay hidden and later routes retain their existing terrain path', () => {
    const hidden = { ...openingPlatforms[0], hidden: true }
    const { scene, colliders } = runtime()
    scene.createStaticPlatform(hidden)
    expect(scene.add.image).not.toHaveBeenCalled()
    expect(scene.textures.createCanvas).not.toHaveBeenCalled()
    expect(colliders).toHaveLength(1)
    for (const level of Object.values(SHADOW_RUNNER_LEVEL_CONFIGS).filter(level => !usesShadowRunnerOpeningArt(level.id))) {
      expect(getShadowRunnerRuntimeManifest(level).some(asset => asset.key === SHADOW_RUNNER_OPENING_WALKWAY.textureKey)).toBe(false)
      const { scene: later } = runtime(level.id)
      later.textures.exists = () => true
      later.textures.get = () => ({ has: () => true })
      later.createStaticPlatform(level.platforms[0])
      expect(later.textures.createCanvas).not.toHaveBeenCalled()
      expect(later.add.image.mock.calls[0][2]).not.toContain('silver-courier')
    }
  })

  test('bad source dimensions or failed canvas creation fail startup rather than claiming readiness', () => {
    for (const failure of ['dimensions', 'canvas']) {
      const { scene, source, onReady, onLoadError } = runtime()
      if (failure === 'dimensions') source.width = 512
      else scene.textures.createCanvas.mockReturnValue(null)
      scene.createLevelScene = () => scene.createStaticPlatform(openingPlatforms[0])
      scene.create()
      scene.events.emit('create')
      expect(onLoadError).toHaveBeenCalledTimes(1)
      expect(onReady).not.toHaveBeenCalled()
    }
  })
})

describe('Bounded opening panorama depth', () => {
  test.each([[960, 540], [740, 390], [932, 430], [540, 540], [1920, 540]])('%s x %s preserves aspect and covers all edges throughout camera travel', (width, height) => {
    const layout = getShadowRunnerOpeningBackdropLayout(1536, 864, width, height)
    expect(layout.width / layout.height).toBeCloseTo(1536 / 864)
    for (const distance of [-1000, 0, 1, 50, 500, 1000, 5000]) {
      const x = getShadowRunnerOpeningBackdropX(layout, distance, 1000, false)
      expect(x).toBeLessThanOrEqual(-12)
      expect(x + layout.width).toBeGreaterThanOrEqual(width + 12)
      expect(layout.y).toBeLessThanOrEqual(-12)
      expect(layout.y + layout.height).toBeGreaterThanOrEqual(height + 12)
    }
    expect(getShadowRunnerOpeningBackdropX(layout, 0, 1000, false) - getShadowRunnerOpeningBackdropX(layout, 1000, 1000, false)).toBe(48)
    expect(getShadowRunnerOpeningBackdropX(layout, 1000, 1000, true)).toBe(layout.x)
    expect(getShadowRunnerOpeningBackdropX(layout, 1000, 0, false)).toBe(layout.x)
    expect(() => getShadowRunnerOpeningBackdropLayout(0, 864, width, height)).toThrow()
  })

  test('live reduced motion freezes the current picture without a jump, including paused briefing startup', () => {
    const { scene, game } = runtime('level-1')
    scene.createBackground()
    expect(scene.add.image).toHaveBeenCalledTimes(1 + scene.districtDepth.length)
    scene.cameras.main.scrollX = 400
    scene.updateOpeningBackdrop()
    const before = scene.openingBackdrop.x
    game.setReducedMotion(true)
    scene.cameras.main.scrollX = 1960
    scene.updateOpeningBackdrop()
    expect(scene.openingBackdrop.x).toBe(before)
    game.setReducedMotion(false)
    scene.updateOpeningBackdrop()
    expect(scene.openingBackdrop.x).toBeLessThan(before)
    const { scene: quiet } = runtime('tutorial', true)
    quiet.createBackground()
    expect(quiet.openingBackdrop.x).toBe(quiet.openingBackdropLayout.x)
    quiet.cameras.main.scrollX = 600
    quiet.updateOpeningBackdrop()
    expect(quiet.openingBackdrop.x).toBe(quiet.openingBackdropLayout.x)
    const x = scene.openingBackdrop.x
    scene.cameras.main.scrollX = 0
    scene.update()
    expect(scene.openingBackdrop.x).toBe(x)
  })

  test.each(['tutorial', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'level-7', 'level-8', 'level-9', 'level-10'] as const)('%s new district art has bounded depth without changing terrain eligibility', levelId => {
    const { scene } = runtime(levelId)
    expect(usesShadowRunnerDepthBackdrop(levelId)).toBe(true)
    scene.createBackground()
    expect(scene.openingBackdrop.displayWidth).toBeGreaterThan(960)
    scene.cameras.main.scrollX = SHADOW_RUNNER_LEVEL_CONFIGS[levelId].worldWidth - 960
    scene.updateOpeningBackdrop()
    expect(scene.openingBackdrop.x).toBeLessThanOrEqual(-12)
    expect(scene.openingBackdrop.x + scene.openingBackdrop.displayWidth).toBeGreaterThanOrEqual(972)
    expect(usesShadowRunnerOpeningArt(levelId)).toBe(['tutorial', 'level-1'].includes(levelId))
  })

  test('unknown districts do not silently opt into decorative camera travel', () => {
    expect(usesShadowRunnerDepthBackdrop('unreleased')).toBe(false)
    expect(getShadowRunnerDistrictDepth('unreleased')).toEqual([])
  })
})

describe.each([
  { levelId: 'level-9' as const, count: 14, nearRate: 0.28, texture: SHADOW_RUNNER_WATCH_BANNER, background: SHADOW_RUNNER_ASSETS.rebuild.captainGateBackground, dimensions: [128, 448] },
  { levelId: 'level-10' as const, count: 16, nearRate: 0.24, texture: SHADOW_RUNNER_RELAY_CAGE, background: SHADOW_RUNNER_ASSETS.rebuild.dawnRelaySpireBackground, dimensions: [80, 400] },
] as const)('$levelId authored architectural depth', ({ levelId, count, nearRate, texture, background, dimensions }) => {
  test('only its district loads the exact generated prop, once', () => {
    for (const level of Object.values(SHADOW_RUNNER_LEVEL_CONFIGS)) {
      const assets = getShadowRunnerRuntimeManifest(level)
      expect(assets.filter(asset => asset.key === texture)).toHaveLength(level.id === levelId ? 1 : 0)
      if (level.id === levelId) {
        expect(assets.find(asset => asset.key === texture)?.url).toBe(SHADOW_RUNNER_DEPTH_ASSETS[texture])
        expect(assets.find(asset => asset.key === 'shadow-runner-bg')?.url).toBe(background)
      }
    }
  })

  test('both layers cover the entire authored route without colliders or per-frame allocation', () => {
    const { scene, colliders } = runtime(levelId)
    scene.createBackground()
    const props = getShadowRunnerDistrictDepth(levelId)
    expect(props).toHaveLength(count)
    expect(new Set(props.map(prop => prop.id)).size).toBe(count)
    expect(new Set(props.map(prop => prop.parallax))).toEqual(new Set([0.14, nearRate]))
    for (let cameraX = 0; cameraX <= SHADOW_RUNNER_LEVEL_CONFIGS[levelId].worldWidth - 960; cameraX += 120) {
      scene.cameras.main.scrollX = cameraX
      scene.updateOpeningBackdrop()
      for (const rate of [0.14, nearRate]) {
        expect(props.some(prop => prop.parallax === rate && getShadowRunnerDepthPropX(prop, cameraX) > 0 && getShadowRunnerDepthPropX(prop, cameraX) < 960)).toBe(true)
      }
      for (const { config, image } of scene.districtDepth) {
        expect(image.x).toBe(getShadowRunnerDepthPropX(config, cameraX))
        expect(image.y + image.displayHeight).toBeLessThanOrEqual(228)
        expect(image.alpha).toBeLessThanOrEqual(0.55)
      }
    }
    expect(scene.add.image).toHaveBeenCalledTimes(count + 1)
    expect(colliders).toEqual([])
  })

  test('live Comfort and pause freeze the decorations without changing their current position', () => {
    const { scene, game } = runtime(levelId)
    scene.createBackground()
    scene.cameras.main.scrollX = 1000
    scene.updateOpeningBackdrop()
    const positions = () => scene.districtDepth.map(({ image }: any) => image.x)
    const before = positions()
    game.setReducedMotion(true)
    scene.cameras.main.scrollX = 7000
    scene.updateOpeningBackdrop()
    expect(positions()).toEqual(before)
    game.setReducedMotion(false)
    scene.updateOpeningBackdrop()
    expect(positions()).not.toEqual(before)
    const paused = positions()
    scene.cameras.main.scrollX = 8000
    scene.update()
    expect(positions()).toEqual(paused)
    const { scene: quiet } = runtime(levelId, true)
    quiet.createBackground()
    const initial = quiet.districtDepth.map(({ image }: any) => image.x)
    quiet.cameras.main.scrollX = 18000
    quiet.updateOpeningBackdrop()
    expect(quiet.districtDepth.map(({ image }: any) => image.x)).toEqual(initial)
  })

  test('runtime prop has true transparency and a visible silhouette within its authored frame', async () => {
    const { data, info } = await sharp(path.join(process.cwd(), 'public', SHADOW_RUNNER_DEPTH_ASSETS[texture])).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual(dimensions)
    let transparent = 0, visible = 0
    for (let offset = 3; offset < data.length; offset += 4) {
      if (data[offset] === 0) transparent++
      if (data[offset] > 200) visible++
    }
    expect(transparent).toBeGreaterThan(info.width * info.height * 0.25)
    expect(visible).toBeGreaterThan(info.width * info.height * 0.08)
    expect(data[3]).toBe(0)
    expect(data[(info.width - 1) * 4 + 3]).toBe(0)
  })
})

describe('Catacombs separate lantern depth', () => {
  test('only Catacombs loads the generated lantern, once, alongside its new panorama', () => {
    for (const level of Object.values(SHADOW_RUNNER_LEVEL_CONFIGS)) {
      const assets = getShadowRunnerRuntimeManifest(level)
      expect(assets.filter(asset => asset.key === SHADOW_RUNNER_CATACOMB_LANTERN)).toHaveLength(level.id === 'level-8' ? 1 : 0)
      if (level.id === 'level-8') {
        expect(assets.find(asset => asset.key === SHADOW_RUNNER_CATACOMB_LANTERN)?.url).toBe(SHADOW_RUNNER_ASSETS.rebuild.catacombHangingLantern)
        expect(assets.find(asset => asset.key === 'shadow-runner-bg')?.url).toBe(SHADOW_RUNNER_ASSETS.rebuild.courierCatacombsBackground)
      } else expect(getShadowRunnerDistrictDepth(level.id).some(prop => prop.texture === SHADOW_RUNNER_CATACOMB_LANTERN)).toBe(false)
    }
  })

  test('two bounded non-colliding layers have distinct camera rates and cover the full route', () => {
    const { scene, colliders } = runtime('level-8')
    scene.createBackground()
    const props = getShadowRunnerDistrictDepth('level-8')
    expect(props).toHaveLength(11)
    expect(new Set(props.map(prop => prop.id)).size).toBe(props.length)
    expect(new Set(props.map(prop => prop.parallax))).toEqual(new Set([0.16, 0.28]))
    expect(scene.add.image).toHaveBeenCalledTimes(12)
    expect(colliders).toEqual([])
    for (let cameraX = 0; cameraX <= 15240; cameraX += 120) {
      scene.cameras.main.scrollX = cameraX
      scene.updateOpeningBackdrop()
      for (const rate of [0.16, 0.28]) {
        expect(props.some(prop => prop.parallax === rate && getShadowRunnerDepthPropX(prop, cameraX) > 0 && getShadowRunnerDepthPropX(prop, cameraX) < 960)).toBe(true)
      }
      for (const { config, image } of scene.districtDepth) {
        expect(image.x).toBe(getShadowRunnerDepthPropX(config, cameraX))
        expect(image.originY).toBe(0)
        expect(image.y + image.displayHeight).toBeLessThanOrEqual(252)
        expect(image.alpha).toBeLessThanOrEqual(0.65)
      }
    }
    expect(scene.add.image).toHaveBeenCalledTimes(12)
    expect(colliders).toEqual([])
  })

  test('live Comfort and pause freeze both layers in place; quiet startup has no decorative travel', () => {
    const { scene, game } = runtime('level-8')
    scene.createBackground()
    scene.cameras.main.scrollX = 1100
    scene.updateOpeningBackdrop()
    const positions = () => scene.districtDepth.map(({ image }: any) => image.x)
    const before = positions()
    game.setReducedMotion(true)
    scene.cameras.main.scrollX = 7000
    scene.updateOpeningBackdrop()
    expect(positions()).toEqual(before)
    game.setReducedMotion(false)
    scene.updateOpeningBackdrop()
    expect(positions()).not.toEqual(before)
    const paused = positions()
    scene.cameras.main.scrollX = 10000
    scene.update()
    expect(positions()).toEqual(paused)
    const { scene: quiet } = runtime('level-8', true)
    quiet.createBackground()
    const initial = quiet.districtDepth.map(({ image }: any) => image.x)
    quiet.cameras.main.scrollX = 15000
    quiet.updateOpeningBackdrop()
    expect(quiet.districtDepth.map(({ image }: any) => image.x)).toEqual(initial)
  })

  test('runtime lantern preserves a real transparent background and a visible nonempty silhouette', async () => {
    const { data, info } = await sharp(path.join(process.cwd(), 'public', SHADOW_RUNNER_ASSETS.rebuild.catacombHangingLantern)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([72, 404])
    let transparent = 0, visible = 0
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] === 0) transparent++
      if (data[index] > 200) visible++
    }
    expect(transparent).toBeGreaterThan(info.width * info.height * 0.4)
    expect(visible).toBeGreaterThan(info.width * info.height * 0.08)
    expect(data[3]).toBe(0)
    expect(data[(info.width - 1) * 4 + 3]).toBe(0)
  })
})

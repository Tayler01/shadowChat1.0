import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { createShadowRunnerInputState } from '../src/features/games/shadow-runner/game/input'
import { SHADOW_RUNNER_LEVEL_CONFIGS, SHADOW_RUNNER_TUTORIAL_LEVEL, type ShadowRunnerLevelConfig } from '../src/features/games/shadow-runner/game/levels'
import { getShadowRunnerRuntimeManifest, getShadowRunnerRouteRuntimeAssets, SHADOW_RUNNER_ENEMY_RUNTIME, type ShadowRunnerRuntimeAsset } from '../src/features/games/shadow-runner/game/runtimeCatalog'
import { getShadowRunnerRuntimeLoadProgress, isShadowRunnerRuntimeAssetReady, queueShadowRunnerRuntimeAssets } from '../src/features/games/shadow-runner/game/runtimeLoading'

jest.mock('phaser', () => ({
  __esModule: true,
  default: {
    Scene: class { events = new (jest.requireActual('eventemitter3'))() },
    Game: class { constructor(public config: { scene: unknown[] }) {} },
    Scale: { FIT: 'fit', CENTER_BOTH: 'both' },
    Loader: { Events: jest.requireActual('phaser/src/loader/events') },
    Scenes: { Events: jest.requireActual('phaser/src/scene/events') },
  },
}))

const levels = Object.values(SHADOW_RUNNER_LEVEL_CONFIGS)
const keys = (level: ShadowRunnerLevelConfig) => getShadowRunnerRuntimeManifest(level).map(asset => asset.key)
const emptyLevel = { ...SHADOW_RUNNER_TUTORIAL_LEVEL, platforms: [], tiltPlatforms: [], coins: [], spikes: [], enemies: [], requiredEnemyIds: [] }

function makeScene(level: ShadowRunnerLevelConfig) {
  const onLoadProgress = jest.fn()
  const onLoadError = jest.fn()
  const onReady = jest.fn()
  const game = createShadowRunnerPhaserGame({ parent: document.createElement('div'), levelId: level.id, input: { current: createShadowRunnerInputState() }, onHudChange: jest.fn(), onLoadProgress, onLoadError, onReady })
  const scene = (game as unknown as { config: { scene: any[] } }).config.scene[0]
  const Events = jest.requireActual('eventemitter3')
  scene.load = new Events()
  scene.load.image = jest.fn()
  scene.load.spritesheet = jest.fn()
  scene.physics = { world: { pause: jest.fn(), resume: jest.fn() } }
  scene.sys = { isActive: () => true, isPaused: () => false, pause: jest.fn(), resume: jest.fn() }
  const textures = new Map<string, Set<string>>()
  scene.textures = { exists: (key: string) => textures.has(key), get: (key: string) => ({ has: (frame: string) => textures.get(key)?.has(String(frame)), add: (frame: string) => textures.get(key)?.add(frame) }) }
  const finishAsset = (asset: ShadowRunnerRuntimeAsset) => {
    textures.set(asset.key, new Set(asset.type === 'image' ? ['__BASE'] : Array.from({ length: asset.frameCount }, (_, frame) => String(frame))))
    scene.load.emit('filecomplete', asset.key, asset.type)
  }
  return { scene, game, textures, finishAsset, onLoadProgress, onLoadError, onReady }
}

describe('Shadow Runner explicit per-level runtime manifest', () => {
  test.each(levels)('$id selects unique descriptors for only authored enemy types', level => {
    const manifest = getShadowRunnerRuntimeManifest(level)
    expect(new Set(manifest.map(asset => asset.key)).size).toBe(manifest.length)
    expect(new Set(manifest.map(asset => asset.url)).size).toBe(manifest.length)
    expect(getShadowRunnerRouteRuntimeAssets(level)).toEqual(manifest.map(asset => asset.url))
    const enemyKinds = new Set((level.enemies ?? (level.enemy ? [level.enemy] : [])).map(enemy => enemy.kind))
    for (const [kind, runtime] of Object.entries(SHADOW_RUNNER_ENEMY_RUNTIME)) {
      expect(manifest.some(asset => asset.key === runtime.textureKey)).toBe(enemyKinds.has(kind as keyof typeof SHADOW_RUNNER_ENEMY_RUNTIME))
    }
    expect(manifest.some(asset => asset.url === SHADOW_RUNNER_ASSETS.rebuild.silverCourierWalkway)).toBe(level.id === 'tutorial' || level.id === 'level-1')
    expect(manifest.some(asset => asset.url === level.finale?.asset)).toBe(false)
    for (const beat of level.finale?.beats ?? []) {
      expect(manifest.some(asset => asset.url === beat.asset)).toBe(false)
    }
  })

  test('tutorial adds only its training sentry to the opening stone art, with no power or hazard sheets', () => {
    const manifest = getShadowRunnerRuntimeManifest(SHADOW_RUNNER_TUTORIAL_LEVEL)
    expect(manifest.filter(asset => asset.key.endsWith('-terrain-atlas')).map(asset => asset.key)).toEqual(['shadow-runner-terrain-atlas'])
    expect(keys(SHADOW_RUNNER_TUTORIAL_LEVEL)).toContain('clockwork-sentry')
    for (const key of ['shadow-runner-boost-aura', 'shadow-runner-tilt-bridge', 'shadow-runner-spike-row']) {
      expect(keys(SHADOW_RUNNER_TUTORIAL_LEVEL)).not.toContain(key)
    }
    expect(keys(SHADOW_RUNNER_TUTORIAL_LEVEL)).toContain('shadow-runner-courier-waypost')
    expect(keys(SHADOW_RUNNER_TUTORIAL_LEVEL)).toContain('shadow-runner-story-oath')
    expect(manifest).toHaveLength(17)
  })

  test('shield-only and arrow-only dependencies retain their atlas frames', () => {
    expect(keys({ ...emptyLevel, shieldPickups: [{ id: 'shield', x: 10, y: 10 }] })).toContain('shadow-runner-candle-terrain-atlas')
    expect(keys({ ...emptyLevel, arrowVolleys: [{ id: 'arrow', x: 0, y: 0, width: 100, height: 100, direction: -1, spawnX: 90, laneY: 50 }] })).toContain('shadow-runner-bell-terrain-atlas')
    expect(keys(emptyLevel)).not.toContain('shadow-runner-candle-terrain-atlas')
    expect(keys(emptyLevel)).not.toContain('shadow-runner-bell-terrain-atlas')
  })

  test('phase, moving, spectral, crawl and sealed-arena terrain dependencies are explicit', () => {
    const rect = { id: 'platform', x: 0, y: 0, width: 100, height: 40 }
    expect(keys({ ...emptyLevel, phasePlatforms: [{ ...rect, terrainSet: 'relay', solidDurationMs: 1000, warningDurationMs: 100, intangibleDurationMs: 200 }] })).toContain('shadow-runner-relay-terrain-atlas')
    expect(keys({ ...emptyLevel, movingPlatforms: [{ ...rect, terrainSet: 'captain', endY: 100, speed: 100, pauseMs: 100 }] })).toContain('shadow-runner-captain-terrain-atlas')
    expect(keys({ ...emptyLevel, spectralPlatforms: [{ ...rect, terrainSet: 'spectral' }] })).toContain('shadow-runner-catacomb-terrain-atlas')
    expect(keys({ ...emptyLevel, crouchGates: [rect] })).toContain('shadow-runner-bell-terrain-atlas')
    expect(keys({ ...emptyLevel, encounters: [{ ...rect, enemyIds: [], sealed: true }] })).toContain('shadow-runner-catacomb-terrain-atlas')
    expect(keys({ ...emptyLevel, platforms: [{ ...rect, terrainSet: 'candleBright' }] })).toEqual(expect.arrayContaining(['shadow-runner-candle-readable-terrain-atlas', 'shadow-runner-candle-terrain-atlas']))
  })

  test('every selected URL exists and every sprite descriptor matches its actual bitmap', async () => {
    const unique = new Map(levels.flatMap(level => getShadowRunnerRuntimeManifest(level)).map(asset => [asset.key + asset.url, asset]))
    for (const asset of unique.values()) {
      const file = path.join(process.cwd(), 'public', asset.url)
      expect(statSync(file).size).toBeGreaterThan(0)
      const metadata = await sharp(file).metadata()
      expect(metadata.width).toBeGreaterThan(0)
      expect(metadata.height).toBeGreaterThan(0)
      if (asset.type === 'spritesheet') {
        expect({ key: asset.key, width: metadata.width, height: metadata.height })
          .toEqual({ key: asset.key, width: asset.frameWidth * asset.frameCount, height: asset.frameHeight })
      }
    }
  })

  test('network bytes selected for tutorial exclude the four unrelated district atlases', () => {
    const manifest = getShadowRunnerRuntimeManifest(SHADOW_RUNNER_TUTORIAL_LEVEL)
    const unrelated = [SHADOW_RUNNER_ASSETS.levels.ivyViaductTerrainHazards, SHADOW_RUNNER_ASSETS.levels.bellTowerPropsHazards, SHADOW_RUNNER_ASSETS.levels.candleFairPropsHazards, SHADOW_RUNNER_ASSETS.levels.candleFairTerrainReadable]
    const bytes = (url: string) => statSync(path.join(process.cwd(), 'public', url)).size
    expect(manifest.some(asset => unrelated.includes(asset.url as typeof unrelated[number]))).toBe(false)
    // Exclusion is the contract; lossless compression must not fail a minimum-size assertion.
    for (const url of unrelated) expect(bytes(url)).toBeGreaterThan(0)
    expect(manifest.reduce((total, asset) => total + bytes(asset.url), 0)).toBeLessThan(4 * 1024 * 1024)
  })
})

describe('Shadow Runner manifest-driven Phaser loading', () => {
  test.each(levels)('$id queues exactly its shared manifest and never animates an absent frame', level => {
    const { scene, finishAsset, textures, onLoadError } = makeScene(level)
    const manifest = getShadowRunnerRuntimeManifest(level)
    scene.preload()
    expect(scene.load.image.mock.calls).toEqual(manifest.filter(asset => asset.type === 'image').map(asset => [asset.key, asset.url]))
    expect(scene.load.spritesheet.mock.calls).toEqual(manifest.flatMap(asset => asset.type === 'spritesheet' ? [[asset.key, asset.url, { frameWidth: asset.frameWidth, frameHeight: asset.frameHeight }]] : []))
    manifest.forEach(finishAsset)
    scene.load.emit('complete')
    expect(onLoadError).not.toHaveBeenCalled()
    scene.registerTerrainFrames()
    const frame = (key: string, index: number) => {
      if (!textures.get(key)?.has(String(index))) throw new Error(`Missing animation frame ${key}:${index}`)
      return { key, frame: index }
    }
    scene.anims = {
      create: jest.fn(({ frames }) => frames.forEach((entry: { key: string; frame: number }) => frame(entry.key, entry.frame))),
      generateFrameNumbers: (key: string, { start, end }: { start: number; end: number }) => Array.from({ length: end - start + 1 }, (_, i) => frame(key, start + i)),
    }
    expect(() => scene.createAnimations()).not.toThrow()
    const graphics: any = new Proxy({}, { get: (_target, key) => key === 'generateTexture' ? (texture: string) => { textures.set(texture, new Set(['__BASE'])) } : () => graphics })
    scene.make = { graphics: () => graphics }
    scene.createTextures()
    for (const runtime of Object.values(SHADOW_RUNNER_ENEMY_RUNTIME)) {
      expect(textures.has(runtime.textureKey)).toBe(manifest.some(asset => asset.key === runtime.textureKey))
    }
  })

  test('progress counts successful decoded files and reaches 100 percent only on scene readiness', () => {
    const level = SHADOW_RUNNER_TUTORIAL_LEVEL
    const { scene, finishAsset, onLoadProgress, onReady } = makeScene(level)
    const manifest = getShadowRunnerRuntimeManifest(level)
    scene.preload()
    expect(onLoadProgress).toHaveBeenLastCalledWith({ loaded: 0, total: manifest.length, progress: 0, phase: 'loading' })
    finishAsset(manifest[0])
    expect(onLoadProgress).toHaveBeenLastCalledWith(expect.objectContaining({ loaded: 1 }))
    manifest.forEach(finishAsset)
    scene.load.emit('complete')
    expect(onLoadProgress).toHaveBeenLastCalledWith({ loaded: manifest.length, total: manifest.length, progress: 0.99, phase: 'loading' })
    scene.createLevelScene = jest.fn()
    scene.create()
    scene.events.emit('create')
    expect(onLoadProgress).toHaveBeenLastCalledWith({ loaded: manifest.length, total: manifest.length, progress: 1, phase: 'ready' })
    expect(onReady).toHaveBeenCalledTimes(1)
    scene.events.emit('destroy')
    const count = onLoadProgress.mock.calls.length
    scene.load.emit('filecomplete', manifest[0].key)
    expect(onLoadProgress).toHaveBeenCalledTimes(count)
    expect(scene.load.listenerCount('filecomplete')).toBe(0)
  })

  test('every required asset failure prevents readiness and 100 percent, without late progress', () => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
    for (const asset of getShadowRunnerRuntimeManifest(level)) {
      const { scene, onLoadProgress, onLoadError, onReady } = makeScene(level)
      scene.preload()
      scene.load.emit('loaderror', { key: asset.key })
      const count = onLoadProgress.mock.calls.length
      scene.load.emit('filecomplete', asset.key)
      scene.load.emit('complete')
      scene.create()
      scene.events.emit('create')
      expect(onLoadError).toHaveBeenCalledTimes(1)
      expect(onLoadProgress).toHaveBeenCalledTimes(count)
      expect(onLoadProgress).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'failed' }))
      expect(onLoadProgress.mock.calls[onLoadProgress.mock.calls.length - 1][0].progress).toBeLessThan(1)
      expect(onReady).not.toHaveBeenCalled()
    }
  })

  test('a missing late spritesheet frame fails validation, even when frame zero exists', () => {
    const asset = getShadowRunnerRuntimeManifest(SHADOW_RUNNER_TUTORIAL_LEVEL).find(asset => asset.key === 'shadow-runner-run')!
    expect(isShadowRunnerRuntimeAssetReady(asset, { exists: () => true, get: () => ({ has: frame => frame !== '5' }) })).toBe(false)
  })

  test('cached manifests can complete without duplicate queue keys or filecomplete events', () => {
    const level = SHADOW_RUNNER_TUTORIAL_LEVEL
    const { scene, finishAsset, onLoadProgress, onLoadError } = makeScene(level)
    getShadowRunnerRuntimeManifest(level).forEach(finishAsset)
    scene.preload()
    scene.load.emit('complete')
    expect(onLoadError).not.toHaveBeenCalled()
    expect(onLoadProgress).toHaveBeenLastCalledWith(expect.objectContaining({ loaded: getShadowRunnerRuntimeManifest(level).length }))
  })

  test('queue helper preserves non-square geometry and progress ignores unrelated completions', () => {
    const asset: ShadowRunnerRuntimeAsset = { key: 'sheet', url: '/sheet.png', type: 'spritesheet', frameWidth: 119, frameHeight: 145, frameCount: 4 }
    const loader = { image: jest.fn(), spritesheet: jest.fn() }
    queueShadowRunnerRuntimeAssets(loader, [asset])
    expect(loader.spritesheet).toHaveBeenCalledWith('sheet', '/sheet.png', { frameWidth: 119, frameHeight: 145 })
    expect(getShadowRunnerRuntimeLoadProgress([asset], new Set(['unrelated']), 'failed')).toEqual({ loaded: 0, total: 1, progress: 0, phase: 'failed' })
    expect(getShadowRunnerRuntimeLoadProgress([], new Set(), 'loading').progress).toBe(0)
    const source = readFileSync(path.join(process.cwd(), 'src/features/games/shadow-runner/game/createShadowRunnerPhaserGame.ts'), 'utf8')
    expect(source).not.toContain('this.load.image(')
    expect(source).not.toContain('this.load.spritesheet(')
  })
})

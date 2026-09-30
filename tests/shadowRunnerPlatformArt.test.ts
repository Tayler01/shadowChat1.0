import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import ts from 'typescript'
import { getShadowRunnerPlatformArtLayout, SHADOW_RUNNER_PLATFORM_CONTACTS, SHADOW_RUNNER_RELAY_MASONRY, usesShadowRunnerRelayMasonry, SHADOW_RUNNER_CAPTAIN_MASONRY, usesShadowRunnerCaptainMasonry } from '../src/features/games/shadow-runner/game/runtimePlatformArt'
import { getShadowRunnerRuntimeManifest, SHADOW_RUNNER_TERRAIN_RUNTIME } from '../src/features/games/shadow-runner/game/runtimeCatalog'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { getShadowRunnerWalkwayPatches } from '../src/features/games/shadow-runner/game/runtimeOpeningArt'
import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest'

function cropTables() {
  const crops = new Map<string, { x: number; y: number; width: number; height: number }>()
  for (const file of ['createShadowRunnerPhaserGame.ts', 'runtimeCatalog.ts']) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(process.cwd(), 'src/features/games/shadow-runner/game', file), 'utf8'), ts.ScriptTarget.Latest, true)
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(source).endsWith('TERRAIN_CROPS') && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        for (const property of node.initializer.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) continue
          const crop = Object.fromEntries(property.initializer.properties.map(field => {
            if (!ts.isPropertyAssignment(field) || !ts.isNumericLiteral(field.initializer)) throw new Error('Expected literal crop')
            return [field.name.getText(source), Number(field.initializer.text)]
          })) as { x: number; y: number; width: number; height: number }
          const id = (property.name as ts.StringLiteral).text
          // The readable Candle table intentionally replaces the legacy fallback.
          crops.set(`terrain-${id}`, crop)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return crops
}

describe('platform art contact alignment', () => {
  test.each([
    { levelId: 'level-10' as const, selects: usesShadowRunnerRelayMasonry, count: 40, art: SHADOW_RUNNER_RELAY_MASONRY, asset: SHADOW_RUNNER_ASSETS.rebuild.relayMasonry },
    { levelId: 'level-9' as const, selects: usesShadowRunnerCaptainMasonry, count: 5, art: SHADOW_RUNNER_CAPTAIN_MASONRY, asset: SHADOW_RUNNER_ASSETS.rebuild.captainMasonry },
  ])('$levelId steps and cover use uniformly scaled solid custom masonry', async ({ levelId, selects, count, art, asset }) => {
    const level = SHADOW_RUNNER_LEVEL_CONFIGS[levelId]
    const platforms = level.platforms.filter(selects)
    expect(platforms).toHaveLength(count)
    const { data, info } = await sharp(path.join(process.cwd(), 'public', asset)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([art.width, art.height])
    for (const platform of platforms) {
      const coverage = new Uint8Array(platform.width * platform.height)
      let minAlpha = 255
      for (const { source: s, destination: d } of getShadowRunnerWalkwayPatches(platform.width, platform.height, art)) {
        expect(d.width / s.width).toBe(art.scale)
        expect(d.height / s.height).toBe(art.scale)
        expect(s.x).toBeGreaterThanOrEqual(0)
        expect(s.y).toBeGreaterThanOrEqual(0)
        expect(s.x + s.width).toBeLessThanOrEqual(info.width)
        expect(s.y + s.height).toBeLessThanOrEqual(info.height)
        for (let y = d.y; y < d.y + d.height; y++) for (let x = d.x; x < d.x + d.width; x++) {
          const sx = Math.floor(s.x + (x - d.x + 0.5) / art.scale)
          const sy = Math.floor(s.y + (y - d.y + 0.5) / art.scale)
          minAlpha = Math.min(minAlpha, data[(sy * info.width + sx) * 4 + 3])
          coverage[y * platform.width + x]++
        }
      }
      expect(coverage.every(count => count === 1)).toBe(true)
      expect(minAlpha).toBeGreaterThanOrEqual(240)
    }
    for (const current of Object.values(SHADOW_RUNNER_LEVEL_CONFIGS)) {
      expect(getShadowRunnerRuntimeManifest(current).some(item => item.key === art.textureKey)).toBe(current.id === levelId)
    }
  })

  test.each([18, 42, 54, 76, 86, 160])('aligns the stone surface and underside for a %ipx body', height => {
    const contact = { top: 50, bottom: 214 }
    const result = getShadowRunnerPlatformArtLayout({ height }, 220, contact)!
    const scale = result.displayHeight / 220
    const top = height / 2 + result.offsetY - result.displayHeight / 2
    expect(top + contact.top * scale).toBeCloseTo(0, 8)
    expect(top + contact.bottom * scale).toBeCloseTo(height, 8)
  })

  test('preserves hanging chains above a platform instead of treating them as floor', () => {
    const contact = SHADOW_RUNNER_PLATFORM_CONTACTS['shadow-runner-candle-readable-terrain-atlas']['terrain-candle-hanging-shelf']
    const result = getShadowRunnerPlatformArtLayout({ height: 54 }, 307, contact)!
    expect(result.displayHeight).toBeGreaterThan(100)
    expect(27 + result.offsetY - result.displayHeight / 2).toBeLessThan(-50)
  })

  test('anchors both Captain bridge aliases to the deck rather than the upper rail', () => {
    const crops = cropTables()
    const frames = SHADOW_RUNNER_PLATFORM_CONTACTS['shadow-runner-captain-terrain-atlas']
    const deck = frames['terrain-captain-counterweight-bridge']
    expect(deck).toEqual({ top: 147, bottom: 178 })
    expect(frames['terrain-captain-chain-bridge']).toEqual(deck)
    expect(crops.get('terrain-captain-chain-bridge')).toEqual(crops.get('terrain-captain-counterweight-bridge'))
    // The authored tilt art is 66px high. Row 101 is a decorative rail 16.68px above the deck.
    expect((deck.top - 101) * 66 / 182).toBeCloseTo(16.6813, 4)
  })

  test.each([
    undefined, { top: -1, bottom: 30 }, { top: 10, bottom: 10 },
    { top: 20, bottom: 19 }, { top: 0, bottom: 101 }, { top: NaN, bottom: 90 },
  ])('rejects missing or invalid contact metadata: %p', contact => {
    expect(getShadowRunnerPlatformArtLayout({ height: 50 }, 100, contact)).toBeNull()
  })

  test('calibrations stay inside their shipped atlas frames and meet visible surfaces', async () => {
    const crops = cropTables()
    for (const [texture, frames] of Object.entries(SHADOW_RUNNER_PLATFORM_CONTACTS)) {
      const terrain = Object.values(SHADOW_RUNNER_TERRAIN_RUNTIME).find(item => item.textureKey === texture)!
      for (const [frame, contact] of Object.entries(frames)) {
        const crop = crops.get(frame)!
        expect(crop).toBeDefined()
        expect(getShadowRunnerPlatformArtLayout({ height: 76 }, crop.height, contact)).not.toBeNull()
        const { data, info } = await sharp(path.join(process.cwd(), 'public', terrain.asset!)).extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        let occupied = 0
        const firstX = Math.floor(info.width * 0.1)
        const lastX = Math.ceil(info.width * 0.9)
        for (let x = firstX; x < lastX; x += 1) {
          if (data[(contact.top * info.width + x) * 4 + 3] >= 128) occupied += 1
        }
        expect(occupied / (lastX - firstX)).toBeGreaterThanOrEqual(0.78)
      }
    }
  })
})

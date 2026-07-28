import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import ts from 'typescript'

import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest.ts'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicRoot = path.join(repoRoot, 'public')
const runnerPublicRoot = path.join(publicRoot, 'games', 'shadow-runner')
const runtimeCatalogPath = path.join(
  repoRoot,
  'src',
  'features',
  'games',
  'shadow-runner',
  'game',
  'runtimeCatalog.ts',
)

function flattenAssetUrls(value) {
  if (typeof value === 'string') {
    return [value]
  }

  return Object.values(value).flatMap(flattenAssetUrls)
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? walkFiles(entryPath) : [entryPath]
    })
}

function toPublicUrl(filePath) {
  return `/${path.relative(publicRoot, filePath).replace(/\\/g, '/')}`
}

const LEVEL_NINE_DIMENSIONS = new Map([
  [SHADOW_RUNNER_ASSETS.levels.captainGateBackground, [1920, 1080]],
  [SHADOW_RUNNER_ASSETS.levels.captainGateProps, [1536, 1024]],
  [SHADOW_RUNNER_ASSETS.levels.captainGateThumbnail160, [160, 90]],
  [SHADOW_RUNNER_ASSETS.levels.captainGateThumbnail320, [320, 180]],
  [SHADOW_RUNNER_ASSETS.enemies.gatePikemanStrip, [768, 128]],
  [SHADOW_RUNNER_ASSETS.enemies.stormGrenadierStrip, [768, 128]],
  [SHADOW_RUNNER_ASSETS.enemies.watchCaptainStrip, [1024, 128]],
  [SHADOW_RUNNER_ASSETS.levels.galeMantleStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.sunsteelEdgeStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.watchfireCrestStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.captainsOrdersStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.stormBombStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.captainGateLocationButton, [256, 256]],
])

function fromPublicUrl(url) {
  return path.join(publicRoot, url.slice(1))
}

function readCropTable(tableName) {
  const sourceFile = ts.createSourceFile(
    runtimeCatalogPath,
    readFileSync(runtimeCatalogPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  let table

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === tableName &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      table = Object.fromEntries(node.initializer.properties.map((property) => {
        assert.ok(ts.isPropertyAssignment(property), `${tableName} must use property assignments`)
        const cropName = property.name.getText(sourceFile).replace(/^['"]|['"]$/g, '')
        assert.ok(
          ts.isObjectLiteralExpression(property.initializer),
          `${tableName}.${cropName} must be an object literal`,
        )
        const crop = Object.fromEntries(property.initializer.properties.map((field) => {
          assert.ok(ts.isPropertyAssignment(field), `${tableName}.${cropName} must use numeric fields`)
          assert.ok(
            ts.isNumericLiteral(field.initializer),
            `${tableName}.${cropName}.${field.name.getText(sourceFile)} must be numeric`,
          )
          return [field.name.getText(sourceFile), Number(field.initializer.text)]
        }))
        return [cropName, crop]
      }))
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  assert.ok(table, `${tableName} is missing from runtimeCatalog.ts`)
  return table
}

async function assertCropBounds(assetUrl, crops) {
  const metadata = await sharp(fromPublicUrl(assetUrl)).metadata()
  assert.ok(metadata.width && metadata.height, `${assetUrl} must have readable dimensions`)

  for (const [name, crop] of Object.entries(crops)) {
    assert.ok(crop.width > 0 && crop.height > 0, `${name} must have positive dimensions`)
    assert.ok(crop.x >= 0 && crop.y >= 0, `${name} must start inside its atlas`)
    assert.ok(crop.x + crop.width <= metadata.width, `${name} exceeds atlas width`)
    assert.ok(crop.y + crop.height <= metadata.height, `${name} exceeds atlas height`)
  }
}

test('Shadow Runner public assets exactly match its runtime manifest', () => {
  const runtimeUrls = flattenAssetUrls(SHADOW_RUNNER_ASSETS).sort()
  const uniqueRuntimeUrls = [...new Set(runtimeUrls)]

  assert.equal(uniqueRuntimeUrls.length, runtimeUrls.length, 'runtime asset URLs must be unique')
  assert.ok(runtimeUrls.length > 0, 'runtime asset manifest must not be empty')

  for (const url of runtimeUrls) {
    assert.match(url, /^\/games\/shadow-runner\//)
    const assetPath = path.resolve(publicRoot, url.slice(1))
    const publicPrefix = `${runnerPublicRoot}${path.sep}`
    assert.ok(assetPath.startsWith(publicPrefix), `runtime asset escapes Shadow Runner public root: ${url}`)
    assert.ok(existsSync(assetPath), `runtime asset is missing: ${url}`)
    assert.ok(statSync(assetPath).isFile(), `runtime asset is not a file: ${url}`)
  }

  const servedUrls = walkFiles(runnerPublicRoot).map(toPublicUrl).sort()
  assert.deepEqual(
    servedUrls,
    runtimeUrls,
    'public/games/shadow-runner must contain runtime assets only; preserve source material under source-assets/shadow-runner',
  )
})

test('Shadow Runner Level 9 assets have their authored runtime dimensions', async () => {
  for (const [url, [expectedWidth, expectedHeight]] of LEVEL_NINE_DIMENSIONS) {
    const metadata = await sharp(fromPublicUrl(url)).metadata()
    assert.equal(metadata.width, expectedWidth, `${url} has an unexpected width`)
    assert.equal(metadata.height, expectedHeight, `${url} has an unexpected height`)
  }
})

test('Shadow Runner animation strips have transparent, nonempty frames', async () => {
  const stripPattern = /-(\d+)f-(\d+)(?:x(\d+))?\.(?:png|webp)$/i
  const stripUrls = flattenAssetUrls(SHADOW_RUNNER_ASSETS)
    .filter(url => stripPattern.test(url))

  assert.ok(stripUrls.length > 0, 'runtime manifest must contain animation strips')

  for (const url of stripUrls) {
    const match = url.match(stripPattern)
    assert.ok(match, `${url} must expose strip geometry in its filename`)
    const frameCount = Number(match[1])
    const frameWidth = Number(match[2])
    const frameHeight = Number(match[3] ?? match[2])
    const image = sharp(fromPublicUrl(url))
    const metadata = await image.metadata()
    assert.equal(metadata.width, frameCount * frameWidth, `${url} has an invalid strip width`)
    assert.equal(metadata.height, frameHeight, `${url} has an invalid strip height`)
    assert.equal(metadata.hasAlpha, true, `${url} must preserve transparency`)

    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      let visiblePixels = 0
      let transparentPixels = 0

      for (let y = 0; y < frameHeight; y += 1) {
        for (let x = 0; x < frameWidth; x += 1) {
          const pixelOffset = (
            y * info.width +
            frameIndex * frameWidth +
            x
          ) * info.channels
          const alpha = data[pixelOffset + 3]
          if (alpha > 0) visiblePixels += 1
          if (alpha < 255) transparentPixels += 1
        }
      }

      assert.ok(visiblePixels > 0, `${url} frame ${frameIndex} is empty`)
      assert.ok(transparentPixels > 0, `${url} frame ${frameIndex} has no transparent pixels`)
    }
  }
})

test('Shadow Runner terrain crops stay inside their runtime atlases', async () => {
  await assertCropBounds(
    SHADOW_RUNNER_ASSETS.levels.courierCatacombsProps,
    readCropTable('CATACOMB_TERRAIN_CROPS'),
  )
  await assertCropBounds(
    SHADOW_RUNNER_ASSETS.levels.captainGateProps,
    readCropTable('CAPTAIN_GATE_TERRAIN_CROPS'),
  )
})

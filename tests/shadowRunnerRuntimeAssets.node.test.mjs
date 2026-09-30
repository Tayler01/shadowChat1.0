import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

test('lossless terrain atlases preserve every visible source pixel and archive provenance', async () => {
  const archive = 'source-assets/shadow-runner/optimized-atlases/'
  const runtime = 'public/games/shadow-runner/level-assets/'
  const records = JSON.parse(readFileSync(path.join(repoRoot, archive, 'manifest.json'), 'utf8'))
  assert.equal(records.length, 8)
  assert.equal(new Set(records.map(record => record.output)).size, 8)
  const urls = new Set(flattenAssetUrls(SHADOW_RUNNER_ASSETS))
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  let savedBytes = 0
  for (const record of records) {
    assert.ok(record.source.startsWith(archive) && !record.source.includes('..'))
    assert.equal(record.originalRuntime, runtime + record.source.slice(archive.length))
    assert.equal(record.output, record.originalRuntime.replace(/\.png$/, '.webp'))
    assert.ok(urls.has(record.output.replace(/^public/, '')), record.output)
    assert.equal(existsSync(path.join(repoRoot, record.originalRuntime)), false, 'Do not deploy duplicate PNGs')
    const source = readFileSync(path.join(repoRoot, record.source))
    const output = readFileSync(path.join(repoRoot, record.output))
    assert.equal(hash(source), record.sourceSha256)
    assert.equal(hash(output), record.sha256)
    assert.equal(source.length, record.originalBytes)
    assert.equal(output.length, record.bytes)
    assert.equal(record.encoding, 'lossless-webp')
    assert.ok(output.length < source.length)
    const original = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const encoded = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    for (const decoded of [original, encoded]) {
      assert.deepEqual([decoded.info.width, decoded.info.height, decoded.info.channels], [record.width, record.height, 4])
      for (let pixel = 0; pixel < decoded.data.length; pixel += 4) {
        if (decoded.data[pixel + 3] === 0) decoded.data.fill(0, pixel, pixel + 3)
      }
    }
    assert.ok(original.data.equals(encoded.data), `Visible pixel mismatch: ${record.output}`)
    assert.equal(hash(encoded.data), record.visibleRgbaSha256)
    savedBytes += source.length - output.length
  }
  assert.ok(savedBytes > 5_000_000, `Expected meaningful deploy savings, got ${savedBytes}`)
})

test('rebuild art retains source provenance, optimized bounds and genuine terrain transparency', async () => {
  const sourceRoot = path.join(repoRoot, 'source-assets/shadow-runner/rebuild')
  const records = JSON.parse(readFileSync(path.join(sourceRoot, 'processed-manifest.json'), 'utf8'))
  const art = [SHADOW_RUNNER_ASSETS.rebuild, SHADOW_RUNNER_ASSETS.storyLandmarks, SHADOW_RUNNER_ASSETS.districtDepth]
  assert.deepEqual(records.map(item => `/games/shadow-runner/rebuild/${item.filename}`).sort(), art.flatMap(Object.values).sort())
  for (const record of records) {
    const bytes = readFileSync(path.join(runnerPublicRoot, 'rebuild', record.filename))
    const original = readFileSync(path.join(sourceRoot, record.source))
    const image = await sharp(bytes).metadata()
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, record.filename)
    assert.equal(createHash('sha256').update(original).digest('hex'), record.sourceSha256, record.source)
    assert.deepEqual([image.width, image.height, bytes.length], [record.width, record.height, record.bytes])
    assert.ok(bytes.length <= 300_000, `${record.filename} exceeds its reviewed per-image budget`)
    if (record.filename.includes('waypost')) {
      assert.equal(image.hasAlpha, true, 'Waypost must not ship a baked checkerboard')
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const alpha = []
      for (let index = 3; index < data.length; index += info.channels) alpha.push(data[index])
      assert.ok(alpha.filter(value => value === 0).length > info.width * info.height / 4)
      assert.ok(alpha.some(value => value >= 250), 'Waypost needs a visible opaque core')
      const occupiedRows = Array.from({ length: info.height }, (_, y) =>
        Array.from({ length: info.width }, (_, x) => data[(y * info.width + x) * 4 + 3]).some(value => value > 128))
      assert.ok(occupiedRows.findIndex(Boolean) <= 2, 'Waypost top must not be buried in a padded frame')
      assert.ok(occupiedRows.lastIndexOf(true) >= info.height - 3, 'Waypost feet must meet the bottom-origin anchor')
      assert.ok(occupiedRows.filter(Boolean).length >= info.height * 0.9, 'Waypost cannot shrink inside its own frame')
    }
    if (record.filename.includes('walkway')) {
      assert.equal(image.hasAlpha, true)
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      let transparent = 0
      let opaque = 0
      for (let index = 3; index < data.length; index += info.channels) {
        if (data[index] === 0) transparent += 1
        if (data[index] >= 250) opaque += 1
      }
      assert.ok(transparent > 0 && opaque > info.width * info.height / 2, 'Terrain needs real alpha and a substantial opaque body')
    }
  }
})
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
  [SHADOW_RUNNER_ASSETS.enemies.stormGrenadierStrip, [1536, 128]],
  [SHADOW_RUNNER_ASSETS.enemies.watchCaptainStrip, [1024, 128]],
  [SHADOW_RUNNER_ASSETS.levels.galeMantleStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.sunsteelEdgeStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.watchfireCrestStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.captainsOrdersStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.stormBombStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.captainGateLocationButton, [256, 256]],
])

const LEVEL_TEN_DIMENSIONS = new Map([
  [SHADOW_RUNNER_ASSETS.levels.dawnRelaySpireBackground, [1920, 1080]],
  [SHADOW_RUNNER_ASSETS.levels.dawnRelaySpireProps, [1536, 1024]],
  [SHADOW_RUNNER_ASSETS.levels.dawnRelaySpireThumbnail160, [160, 90]],
  [SHADOW_RUNNER_ASSETS.levels.dawnRelaySpireThumbnail320, [320, 180]],
  [SHADOW_RUNNER_ASSETS.enemies.relayLancerStrip, [1536, 128]],
  [SHADOW_RUNNER_ASSETS.enemies.prismCasterStrip, [1536, 128]],
  [SHADOW_RUNNER_ASSETS.enemies.gearwingDroneStrip, [1536, 192]],
  [SHADOW_RUNNER_ASSETS.enemies.sentrySovereignStrip, [3840, 192]],
  [SHADOW_RUNNER_ASSETS.levels.dawnfireAegisStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.aetherStepStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.relayFlameStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.lastDispatchStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.relayOrbStrip, [256, 64]],
  [SHADOW_RUNNER_ASSETS.levels.dawnRestoredEnding, [1920, 1080]],
  [SHADOW_RUNNER_ASSETS.levels.dawnRelaySpireLocationButtonV2, [256, 256]],
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

test('Shadow Runner Level 10 assets have their authored runtime dimensions', async () => {
  for (const [url, [expectedWidth, expectedHeight]] of LEVEL_TEN_DIMENSIONS) {
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
  await assertCropBounds(
    SHADOW_RUNNER_ASSETS.levels.dawnRelaySpireProps,
    readCropTable('DAWN_RELAY_TERRAIN_CROPS'),
  )
})

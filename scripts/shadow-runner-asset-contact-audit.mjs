import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import ts from 'typescript'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const game = 'src/features/games/shadow-runner/game/'
const runtimeFile = `${game}createShadowRunnerPhaserGame.ts`
const catalogFile = `${game}runtimeCatalog.ts`
const output = path.resolve(root, process.argv.find(arg => arg.startsWith('--output='))?.slice(9)
  ?? 'output/shadow-runner/asset-contact-audit.json')
const screenshotSummary = 'output/playwright/runner-rebuild-campaign-art-pass1/summary.json'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const round = value => Number(value.toFixed(3))
const sources = new Map()

async function source(file) {
  if (!sources.has(file)) {
    const text = await readFile(path.join(root, file), 'utf8')
    sources.set(file, { text, ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), sha256: sha(text) })
  }
  return sources.get(file)
}

function literal(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.map(property => {
    assert(ts.isPropertyAssignment(property), 'Crop tables must remain literal property assignments')
    return [property.name.text, literal(property.initializer)]
  }))
  throw new Error(`Nonliteral crop expression: ${node.getText()}`)
}

function location(ast, node) {
  return { file: ast.fileName, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 }
}

async function cropTable(file, name) {
  const { ast } = await source(file)
  let declaration
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert(declaration, `Missing crop table ${name}`)
  return declaration.initializer.properties.map(property => ({
    id: property.name.text, crop: literal(property.initializer), source: location(ast, property),
  }))
}

function distribution(values) {
  const sorted = values.filter(value => value !== null).sort((a, b) => a - b)
  if (!sorted.length) return { min: null, p50: null, p90: null, max: null, emptyColumns: values.length }
  const at = fraction => sorted[Math.floor((sorted.length - 1) * fraction)]
  return { min: round(sorted[0]), p50: round(at(0.5)), p90: round(at(0.9)), max: round(sorted[sorted.length - 1]), emptyColumns: values.length - sorted.length }
}

function alphaEdges(data, width, height, threshold) {
  const top = Array(width).fill(null)
  const bottom = Array(width).fill(null)
  const rowCoverage = Array(height).fill(0)
  let pixels = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < threshold) continue
      if (top[x] === null) top[x] = y
      bottom[x] = y
      rowCoverage[y] += 1
      pixels += 1
    }
  }
  const central = top.slice(Math.floor(width * 0.1), Math.ceil(width * 0.9))
  const firstRow = fraction => {
    const row = rowCoverage.findIndex(count => count >= width * fraction)
    return row < 0 ? null : row
  }
  const emptyColumnRuns = []
  let runStart = null
  for (let x = 0; x <= width; x += 1) {
    if (x < width && top[x] === null) runStart ??= x
    else if (runStart !== null) {
      emptyColumnRuns.push({ from: runStart, to: x - 1, width: x - runStart, internal: runStart > 0 && x < width })
      runStart = null
    }
  }
  const left = top.findIndex(y => y !== null)
  const right = width - 1 - [...top].reverse().findIndex(y => y !== null)
  return {
    threshold, occupiedFraction: round(pixels / (width * height)),
    bounds: pixels ? { left, right, top: distribution(top).min, bottom: distribution(bottom).max } : null,
    emptyColumnRuns, topBorderCoverage: round(rowCoverage[0] / width), bottomBorderCoverage: round(rowCoverage[height - 1] / width),
    top: distribution(top), central80Top: distribution(central), bottom: distribution(bottom),
    firstRowWith50PercentCoverage: firstRow(0.5), firstRowWith80PercentCoverage: firstRow(0.8),
    topByColumn: top, bottomByColumn: bottom,
  }
}

function selfTest() {
  const pixels = Buffer.alloc(4 * 4 * 5)
  for (let y = 2; y < 5; y += 1) for (let x = 0; x < 4; x += 1) pixels[(y * 4 + x) * 4 + 3] = 255
  const edges = alphaEdges(pixels, 4, 5, 128)
  assert.deepEqual(edges.topByColumn, [2, 2, 2, 2])
  assert.equal(edges.firstRowWith80PercentCoverage, 2)
  assert.equal(edges.occupiedFraction, 0.6)
  assert.deepEqual(edges.bounds, { left: 0, right: 3, top: 2, bottom: 4 })
  pixels[(1 * 4 + 0) * 4 + 3] = 8
  assert.equal(alphaEdges(pixels, 4, 5, 8).top.min, 1)
  assert.equal(alphaEdges(pixels, 4, 5, 128).top.min, 2)
  assert.equal(distribution([null, 3, 2]).emptyColumns, 1)
  assert.equal(distribution([null]).max, null)
  for (let y = 0; y < 5; y += 1) pixels[(y * 4 + 2) * 4 + 3] = 0
  assert.deepEqual(alphaEdges(pixels, 4, 5, 128).emptyColumnRuns, [{ from: 2, to: 2, width: 1, internal: true }])
  assert.equal(contactGap(50, 86, 220, 86, 0), 19.545454545454547)
  assert.equal(contactGap(0, 18, 100, 66, -12), -36)
}

function contactGap(sourceY, bodyHeight, cropHeight, displayHeight, visualOffsetY) {
  return (bodyHeight - displayHeight) / 2 + visualOffsetY + sourceY * displayHeight / cropHeight
}

// Only local pure config/catalog modules are loaded. Phaser and the app are never imported.
function loadConfigs() {
  const require = createRequire(import.meta.url)
  const previous = require.extensions['.ts']
  const loaded = new Map()
  require.extensions['.ts'] = (module, filename) => {
    assert(filename.startsWith(path.join(root, 'src', 'features', 'games', 'shadow-runner') + path.sep))
    const text = readFileSync(filename, 'utf8')
    loaded.set(path.relative(root, filename).replaceAll('\\', '/'), sha(text))
    module._compile(ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename)
  }
  try {
    return {
      levels: Object.values(require(path.join(root, game, 'levels.ts')).SHADOW_RUNNER_LEVEL_CONFIGS),
      catalog: require(path.join(root, catalogFile)),
      platformArt: require(path.join(root, game, 'runtimePlatformArt.ts')),
      loaded,
    }
  } finally {
    if (previous) require.extensions['.ts'] = previous
    else delete require.extensions['.ts']
  }
}

async function main() {
  selfTest()
  const { levels, catalog, platformArt, loaded } = loadConfigs()
  const runtime = await source(runtimeFile)
  // Fail rather than silently publishing measurements for a changed rendering contract.
  for (const expected of ['const visualY = centerY + (artLayout?.offsetY ?? options.visualOffsetY ?? 0)', 'visual.setDisplaySize(displayWidth, displayHeight)',
    'contact && options.displayHeight === undefined',
    'displayWidth: platform.width + 22',
    'displayHeight: Math.max(62, platform.height + 30)', 'displayHeight: contact ? undefined : Math.max(56, platform.height + 28)']) {
    assert(runtime.text.includes(expected), `Rendering contract changed; inspect audit model: ${expected}`)
  }
  const tableSets = [
    ['stone', runtimeFile, 'TERRAIN_CROPS'], ['ivy', runtimeFile, 'IVY_TERRAIN_CROPS'],
    ['bell', runtimeFile, 'BELL_TERRAIN_CROPS'], ['candle', runtimeFile, 'CANDLE_TERRAIN_CROPS'],
    ['candleBright', runtimeFile, 'CANDLE_READABLE_TERRAIN_CROPS'], ['clock', runtimeFile, 'CLOCK_TERRAIN_CROPS'],
    ['moon', runtimeFile, 'MOON_TERRAIN_CROPS'], ['catacomb', catalogFile, 'CATACOMB_TERRAIN_CROPS'],
    ['captain', catalogFile, 'CAPTAIN_GATE_TERRAIN_CROPS'], ['relay', catalogFile, 'DAWN_RELAY_TERRAIN_CROPS'],
  ]
  const atlases = []
  const frames = []
  for (const [terrainSet, file, table] of tableSets) {
    const terrain = catalog.SHADOW_RUNNER_TERRAIN_RUNTIME[terrainSet]
    const assetPath = path.join(root, 'public', terrain.asset)
    const bytes = await readFile(assetPath)
    const metadata = await sharp(bytes).metadata()
    const atlasPixels = await sharp(bytes).ensureAlpha().raw().toBuffer()
    const alphaAt = (x, y) => x < 0 || y < 0 || x >= metadata.width || y >= metadata.height ? 0 : atlasPixels[(y * metadata.width + x) * 4 + 3]
    const atlas = { terrainSet, textureKey: terrain.textureKey, asset: `public${terrain.asset}`, sha256: sha(bytes), width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha, table }
    atlases.push(atlas)
    for (const frame of await cropTable(file, table)) {
      const { x: left, y: top, width, height } = frame.crop
      assert(left >= 0 && top >= 0 && left + width <= metadata.width && top + height <= metadata.height, `${frame.id} out of bounds`)
      const { data, info } = await sharp(bytes).extract({ left, top, width, height }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      assert.equal(info.channels, 4)
      const edges = Object.fromEntries([1, 8, 128, 250].map(threshold => [threshold, alphaEdges(data, width, height, threshold)]))
      const outsideBorderOpaquePixels = {
        top: Array.from({ length: width }, (_, x) => alphaAt(left + x, top - 1)).filter(alpha => alpha >= 128).length,
        bottom: Array.from({ length: width }, (_, x) => alphaAt(left + x, top + height)).filter(alpha => alpha >= 128).length,
        left: Array.from({ length: height }, (_, y) => alphaAt(left - 1, top + y)).filter(alpha => alpha >= 128).length,
        right: Array.from({ length: height }, (_, y) => alphaAt(left + width, top + y)).filter(alpha => alpha >= 128).length,
      }
      frames.push({ ...frame, terrainSet, textureKey: terrain.textureKey, asset: atlas.asset, edges,
        outsideBorderOpaquePixels, fullyOpaque: data.every((value, index) => index % 4 !== 3 || value === 255), uses: [] })
    }
  }
  const configLocations = new Map()
  for (const file of loaded.keys()) {
    if (!file.endsWith('.ts')) continue
    const { ast } = await source(file)
    const visit = node => {
      if (ts.isObjectLiteralExpression(node)) {
        const id = node.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(ast) === 'id')
        if (id && ts.isStringLiteral(id.initializer)) {
          const entries = configLocations.get(id.initializer.text) ?? []
          entries.push(location(ast, node))
          configLocations.set(id.initializer.text, entries)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(ast)
  }
  const usages = []
  for (const level of levels) {
    for (const collection of ['platforms', 'spectralPlatforms', 'phasePlatforms', 'tiltPlatforms', 'movingPlatforms']) {
      for (const rect of level[collection] ?? []) {
        const terrainSet = rect.terrainSet ?? 'stone'
        const terrain = catalog.getShadowRunnerTerrainRuntime(terrainSet)
        const frameId = rect.visualId ?? rect.id
        let frame = frames.find(entry => entry.textureKey === terrain.textureKey && entry.id === frameId)
        let fallback = false
        if (!frame && collection === 'platforms' && ['candle', 'candleBright', 'candleShelf'].includes(terrainSet)) {
          frame = frames.find(entry => entry.terrainSet === 'candle' && entry.id === frameId)
          fallback = Boolean(frame)
        }
        const opening = collection === 'platforms' && ['tutorial', 'level-1'].includes(level.id) && !rect.hidden
        const relayMasonry = collection === 'platforms' && platformArt.usesShadowRunnerRelayMasonry(rect)
        const captainMasonry = collection === 'platforms' && platformArt.usesShadowRunnerCaptainMasonry(rect)
        const usage = {
          levelId: level.id, collection, id: rect.id, terrainSet, frameId, configurationSources: configLocations.get(rect.id) ?? [],
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          status: rect.hidden ? 'hidden' : collection === 'tiltPlatforms' ? 'rotated-deck-contact-not-modeled' : opening ? 'opening-raster-composite-not-atlas' : relayMasonry || captainMasonry ? 'district-masonry-composite-not-atlas' : frame ? 'measured' : 'non-atlas-fallback',
        }
        usages.push(usage)
        if (usage.status !== 'measured') continue
        let displayWidth = rect.width
        let displayHeight = rect.height
        let visualOffsetY = 0
        if (collection === 'phasePlatforms' || collection === 'movingPlatforms') {
          displayWidth += 22
          displayHeight = Math.max(collection === 'phasePlatforms' ? 62 : 56, rect.height + (collection === 'phasePlatforms' ? 30 : 28))
          visualOffsetY = -10
        }
        if (collection === 'platforms' || collection === 'spectralPlatforms' || collection === 'movingPlatforms') {
          const contact = platformArt.SHADOW_RUNNER_PLATFORM_CONTACTS[frame.textureKey]?.[`terrain-${frame.id}`]
          const layout = platformArt.getShadowRunnerPlatformArtLayout(rect, frame.crop.height, contact)
          if (layout) {
            displayHeight = layout.displayHeight
            visualOffsetY = layout.offsetY
            usage.semanticContact = contact
          }
        }
        const scaleY = displayHeight / frame.crop.height
        const scaleX = displayWidth / frame.crop.width
        const imageTop = rect.y + (rect.height - displayHeight) / 2 + visualOffsetY
        const imageLeft = rect.x + (rect.width - displayWidth) / 2
        const gap = y => y === null ? null : round(imageTop - rect.y + y * scaleY)
        usage.asset = frame.asset
        usage.cropSource = frame.source
        usage.crop = frame.crop
        usage.candleFallback = fallback
        usage.display = { width: displayWidth, height: displayHeight, imageLeft, imageTop, visualOffsetY, scaleX: round(scaleX), scaleY: round(scaleY), aspectDistortionXOverY: round(scaleX / scaleY), rotation: 'zero-rotation reference' }
        usage.contactGapWorldPx = Object.fromEntries([1, 8, 128, 250].map(threshold => [threshold, {
          ...Object.fromEntries(Object.entries(frame.edges[threshold].central80Top).map(([key, value]) => [key, key === 'emptyColumns' ? value : gap(value)])),
          firstAny: gap(frame.edges[threshold].top.min), firstRow50Percent: gap(frame.edges[threshold].firstRowWith50PercentCoverage),
          firstRow80Percent: gap(frame.edges[threshold].firstRowWith80PercentCoverage),
        }]))
        usage.transparentColumnRunsWorldPx = frame.edges[128].emptyColumnRuns.map(run => ({
          ...run, x: round(imageLeft + run.from * scaleX), width: round(run.width * scaleX),
        }))
        if (collection === 'tiltPlatforms') usage.rotationCaveat = 'Runtime rotates visual, not rectangle. Actual per-column contact changes with the tween; these gaps use zero rotation only.'
        if (collection === 'spectralPlatforms') usage.visibilityCaveat = 'Alpha 0.2 until powered; source alpha is measured before scene opacity.'
        frame.uses.push({ levelId: level.id, collection, id: rect.id })
      }
    }
  }
  let captures = []
  let captureSource = null
  try {
    const bytes = await readFile(path.join(root, screenshotSummary))
    const summary = JSON.parse(bytes)
    captureSource = { file: screenshotSummary, sha256: sha(bytes), startedAt: summary.startedAt, scope: summary.scope }
    captures = summary.results.map(result => {
      const player = result.start?.player
      const supports = usages.filter(usage => usage.levelId === result.levelId && usage.collection === 'platforms'
        && player && player.x >= usage.rect.x && player.x <= usage.rect.x + usage.rect.width && Math.abs(player.bodyBottom - usage.rect.y) <= 1)
      return { profile: result.profile, levelId: result.levelId, screenshot: `output/playwright/runner-rebuild-campaign-art-pass1/${result.profile}-${result.levelId}-play.png`,
        player: player && { x: player.x, y: player.y, bodyBottom: player.bodyBottom, velocityY: player.velocityY }, surface: result.surface,
        supports: supports.map(usage => {
          if (usage.status !== 'measured') return { id: usage.id, status: usage.status }
          const frame = frames.find(entry => entry.asset === usage.asset && entry.id === usage.frameId)
          const sourceX = Math.min(frame.crop.width - 1, Math.max(0, Math.floor((player.x - usage.display.imageLeft) / usage.display.width * frame.crop.width)))
          return { id: usage.id, sourceX, atlasX: frame.crop.x + sourceX, crop: frame.crop, cropSource: frame.source,
            edgeAtPlayerColumn: Object.fromEntries([1, 8, 128, 250].map(threshold => {
              const y = frame.edges[threshold].topByColumn[sourceX]
              return [threshold, { sourceY: y, atlasY: y === null ? null : frame.crop.y + y, gapWorldPx: y === null ? null : round(contactGap(y, usage.rect.height, frame.crop.height, usage.display.height, usage.display.visualOffsetY)) }]
            })) }
        }),
      }
    })
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const terrainSummary = Object.keys(catalog.SHADOW_RUNNER_TERRAIN_RUNTIME).map(terrainSet => {
    const staticUses = usages.filter(usage => usage.status === 'measured' && usage.collection === 'platforms' && usage.terrainSet === terrainSet)
    const ranked = [...staticUses].sort((a, b) => b.contactGapWorldPx[128].p90 - a.contactGapWorldPx[128].p90)
    const summarize = usage => ({
      levelId: usage.levelId, id: usage.id, frameId: usage.frameId, rect: usage.rect, crop: usage.crop, source: usage.cropSource,
      gaps: usage.contactGapWorldPx[128], aspectDistortionXOverY: usage.display.aspectDistortionXOverY,
    })
    const irregularPropFrames = ['captain-barricade', 'captain-cover-plinth', 'captain-recovery-step', 'relay-cover-pylon', 'relay-recovery-stair']
    const frameTerrain = terrainSet === 'candleShelf' ? 'candleBright' : terrainSet === 'spectral' ? 'catacomb' : terrainSet
    const sourceFrames = frames.filter(frame => frame.terrainSet === frameTerrain)
    return {
      terrainSet, measuredStaticCount: staticUses.length,
      worstStaticByCentralP90: ranked.slice(0, 3).map(summarize),
      worstStaticExcludingIrregularPropFrames: ranked.filter(usage => !irregularPropFrames.includes(usage.frameId)).slice(0, 1).map(summarize),
      worstRawCropByCentralP90: [...sourceFrames].sort((a, b) => b.edges[128].central80Top.p90 - a.edges[128].central80Top.p90).slice(0, 1).map(frame => ({
        id: frame.id, crop: frame.crop, source: frame.source, bounds: frame.edges[128].bounds,
        central80Top: frame.edges[128].central80Top, platformUseCount: frame.uses.length,
      })),
    }
  })
  assert.equal(atlases.length, 10)
  assert(frames.length > 80, 'Unexpectedly incomplete crop inventory')
  assert.equal(usages.length, levels.reduce((sum, level) => sum + ['platforms', 'spectralPlatforms', 'phasePlatforms', 'tiltPlatforms', 'movingPlatforms'].reduce((count, key) => count + (level[key]?.length ?? 0), 0), 0))
  const report = {
    generatedAt: new Date().toISOString(), workspace: root,
    method: {
      thresholds: { 1: 'any nonzero alpha', 8: 'faint visible edge', 128: 'half opaque contact proxy', 250: 'near-opaque edge' },
      units: 'Crop edge coordinates are zero-based source pixels. Positive contact gaps put visible art BELOW collision top; negative gaps put art ABOVE collision top. World units are not screenshot CSS pixels.',
      contactFormula: '(rect.height - displayHeight) / 2 + visualOffsetY + sourceEdgeY * displayHeight / crop.height',
      central80: 'Exclude outer 10% on each side; p50/p90 of per-column first alpha, not a semantic stone detector. Fully transparent columns counted separately.',
      outsideBorderOpaquePixels: 'Count alpha >=128 exactly one pixel outside each authored crop. Continuation is a clipping-review signal, not automatically a defect: adjacent objects or deliberate interior crops can also contribute.',
      scope: 'Every registered terrain atlas crop including non-load-bearing props; every static/spectral/phase/tilt/moving platform config. Hidden/opening-composite/procedural fallback uses explicitly classified.',
      limitations: ['Alpha cannot distinguish stone from opaque leaves, chains, ornament or baked backgrounds.', 'Crouch-gate multi-image composition, prop placement, rotated tilt runtime contact and opening composite pixels are not modeled as platform rectangles.', 'Screenshot positions are pre-existing evidence, not a new browser run. Contact gaps project CURRENT source art layout at those positions; they do not claim the old screenshots visually contain this layout.', 'No collision/art/config/browser modifications by this audit. No claim of route acceptance.'],
      selfTests: 'passed: synthetic padding, thresholds, bounds, empty-column runs, scale and offset',
    },
    sources: [...sources].map(([file, value]) => ({ file, sha256: value.sha256 })),
    counts: { atlases: atlases.length, frames: frames.length, levels: levels.length, platformUses: usages.length, measuredUses: usages.filter(usage => usage.status === 'measured').length },
    terrainSummary, captures, captureSource, atlases, usages, frames,
  }
  await mkdir(path.dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ output, counts: report.counts,
    worstStaticCentralP90: terrainSummary.map(summary => ({ terrainSet: summary.terrainSet, id: summary.worstStaticByCentralP90[0]?.id, gap: summary.worstStaticByCentralP90[0]?.gaps.p90 })),
    capturedStartColumnGapWorldPx: captures.filter(capture => capture.profile === 'android').map(capture => ({ levelId: capture.levelId, gap: capture.supports[0]?.edgeAtPlayerColumn?.[128]?.gapWorldPx })),
  }, null, 2))
}

await main()

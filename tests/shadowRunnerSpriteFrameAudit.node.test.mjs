import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readEnemyJobs, frameRects, connectedAlpha, analyzeFrameCuts, frameBodyMetrics, boundaryContacts,
  BASELINE_COMMIT, HISTORICAL_SCOPE, readBaselineFile, loadHistoricalDefinition, readHistoricalAsset } from '../scripts/shadow-runner-sprite-frame-audit.mjs'

function pixels(width, height, rects) {
  const data = Buffer.alloc(width * height * 4)
  for (const rect of rects) for (let y = rect.top; y < rect.top + rect.height; y += 1) {
    for (let x = rect.left; x < rect.left + rect.width; x += 1) data[(y * width + x) * 4 + 3] = rect.alpha ?? 255
  }
  return data
}

test('pipeline extraction parses enemy arguments without executing pipeline side effects', () => {
  const jobs = readEnemyJobs(`throw Error('must never execute'); makeGridStrip({sourceName:'x.png',outputDirectory:'enemies',columns:6,rows:1,frameSize:128}); makeStrip({outputDirectory:'props'});`)
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].sourceName, 'x.png')
  assert.equal(jobs[0].columns, 6)
})

test('all historical bodies come from the pinned catalog, never current rectangular v2 offsets', async () => {
  const baseline = await loadHistoricalDefinition()
  assert.equal(baseline.commit, 'aefb1e5ca291a75d45e17ceefaf7ee66ad76d5c2')
  const expected = { 'gate-pikeman': [128, 39, 48], 'storm-grenadier': [128, 42, 58],
    'watch-captain': [128, 40, 50], 'relay-lancer': [128, 39, 48], 'prism-caster': [128, 42, 56],
    'gearwing-drone': [128, 36, 44], 'sentry-sovereign': [192, 54, 68] }
  let seen = 0
  for (const [, runtime] of baseline.catalog) {
    if (!expected[runtime.textureKey]) continue
    seen++
    const job = baseline.pipelines.flatMap(pipeline => pipeline.jobs).find(job => job.sourceName.startsWith(`${runtime.textureKey}-v1-`))
    assert.deepEqual([job.frameSize, runtime.body.offsetX, runtime.body.offsetY], expected[runtime.textureKey])
    assert.equal(runtime.frameSize, undefined)
    assert.equal(runtime.frameCount, undefined)
    assert.equal(runtime.frameWidth, undefined)
  }
  assert.equal(seen, 7)
  assert.equal(baseline.catalog.find(([, runtime]) => runtime.textureKey === 'relay-lancer')[1].scale, 0.86)
})

test('historical L9 uneven boundaries and all four L10 equal grids survive current recipe removal', async () => {
  const baseline = await loadHistoricalDefinition()
  const [l9, l10] = baseline.pipelines.map(pipeline => pipeline.jobs)
  assert.equal(l9.length, 3)
  assert.ok(l9.every(job => job.frameBoundaries.length === job.frameCount - 1))
  assert.deepEqual(l9.map(job => job.frameBoundaries), [[247, 480, 725, 1085, 1295], [241, 480, 745, 1060, 1274], [184, 379, 581, 812, 1022, 1199, 1347]])
  assert.deepEqual(l10.map(job => [job.columns, job.rows]), [[6, 1], [6, 1], [6, 1], [5, 2]])
  assert.equal([...l9, ...l10].reduce((count, job) => count + (job.frameCount ?? job.columns * job.rows), 0), 48)
  assert.ok([...l9, ...l10].every(job => job.line > 0))
})

test('historical scope cannot be mistaken for current repaired-v2 acceptance', () => {
  assert.match(HISTORICAL_SCOPE, /HISTORICAL V1 BASELINE ONLY/)
  assert.ok(HISTORICAL_SCOPE.includes(BASELINE_COMMIT))
  assert.match(HISTORICAL_SCOPE, /not a current v2/)
})

test('Git object reader rejects path injection, current refs and arbitrary files', async () => {
  for (const invalid of ['HEAD:scripts/process-shadow-runner-level9-assets.mjs', '../package.json', '--help',
    'src/features/games/shadow-runner/game/../../runtimeCatalog.ts', 'package.json']) {
    await assert.rejects(readBaselineFile(invalid), /Invalid historical baseline path/)
  }
})

test('archive precedence is hash-guarded; corrupt archive cannot silently fall back to public', async () => {
  const v1 = Buffer.from('historical original'), v2 = Buffer.from('changed current asset')
  const readPinned = async () => v1
  const archive = 'source-assets/shadow-runner/rebuild/legacy-example.png'
  const publicPath = 'public/games/shadow-runner/level-assets/level-10/enemies/example-v1.png'
  let reads = 0
  const asset = await readHistoricalAsset(publicPath, [archive, publicPath], async () => { reads++; return v1 }, readPinned)
  assert.equal(reads, 1)
  assert.equal(asset.path, archive)
  assert.equal(asset.storage, 'preserved-archive')
  reads = 0
  await assert.rejects(readHistoricalAsset(publicPath, [archive, publicPath], async () => { reads++; return v2 }, readPinned), /differs from pinned v1/)
  assert.equal(reads, 1)
})

test('missing archive permits only matching original v1, never changed pixels or swallowed read errors', async () => {
  const v1 = Buffer.from('v1'), missing = Object.assign(new Error('missing'), { code: 'ENOENT' })
  const pinned = async () => v1
  const result = await readHistoricalAsset('original', ['archive', 'original'], async name => {
    if (name === 'archive') throw missing
    return v1
  }, pinned)
  assert.equal(result.path, 'original')
  await assert.rejects(readHistoricalAsset('original', ['archive'], async () => { throw missing }, pinned), /Missing preserved v1/)
  await assert.rejects(readHistoricalAsset('original', ['archive'], async () => { throw new Error('denied') }, pinned), /denied/)
})

test('all five replaced runtime archives hash-match immutable original v1 Git blobs', async () => {
  const baseline = await loadHistoricalDefinition()
  const repaired = new Set(['relay-lancer', 'prism-caster', 'gearwing-drone', 'sentry-sovereign', 'storm-grenadier'])
  let count = 0
  for (const { level, jobs } of baseline.pipelines) for (const job of jobs) {
    const name = job.sourceName.replace(/-v\d+-.*$/, '')
    if (!repaired.has(name)) continue
    const asset = await readHistoricalAsset(`public/games/shadow-runner/level-assets/level-${level}/enemies/${job.outputName}`,
      [`source-assets/shadow-runner/rebuild/legacy-${job.outputName}`])
    assert.equal(asset.storage, 'preserved-archive')
    count++
  }
  assert.equal(count, 5)
})

test('grid coordinates reproduce rounding, explicit boundaries and multiple rows', () => {
  assert.deepEqual(frameRects(10, 8, { columns: 3, rows: 2 }).map(rect => [rect.left, rect.top, rect.width, rect.height]),
    [[0, 0, 3, 4], [3, 0, 4, 4], [7, 0, 3, 4], [0, 4, 3, 4], [3, 4, 4, 4], [7, 4, 3, 4]])
  assert.equal(frameRects(10, 8, { frameCount: 2, frameBoundaries: [3] })[1].left, 3)
  for (const bad of [{ columns: 0 }, { frameCount: 2, frameBoundaries: [7, 3] }, { frameCount: 2, frameBoundaries: [11] }]) {
    assert.throws(() => frameRects(10, 8, bad))
  }
})

test('a split body passes nonempty-frame checks but fails connected-component cut evidence', () => {
  const data = pixels(20, 10, [{ left: 7, top: 2, width: 6, height: 6 }])
  const audit = analyzeFrameCuts(data, 20, 10, frameRects(20, 10, { columns: 2 }), { minComponentPixels: 1, minPiecePixels: 1 })
  assert.ok(audit.frames.every(frame => frame.pixels > 0))
  assert.equal(audit.splitComponents.length, 1)
  assert.deepEqual(audit.splitComponents[0].pieces.map(piece => piece.pixels), [18, 18])
  assert.equal(audit.splitComponents[0].spillPixels, 18)
})

test('separate poses and alpha-threshold noise do not imply a crossing component', () => {
  const data = pixels(20, 10, [{ left: 2, top: 2, width: 4, height: 4 }, { left: 12, top: 2, width: 4, height: 4 },
    { left: 6, top: 3, width: 6, height: 1, alpha: 12 }])
  const audit = analyzeFrameCuts(data, 20, 10, frameRects(20, 10, { columns: 2 }), { minComponentPixels: 1, minPiecePixels: 1 })
  assert.equal(audit.splitComponents.length, 0)
  assert.equal(connectedAlpha(data, 20, 10).components.length, 2)
})

test('component analysis catches horizontal row cuts as well as column cuts', () => {
  const data = pixels(10, 10, [{ left: 3, top: 2, width: 3, height: 6 }])
  const audit = analyzeFrameCuts(data, 10, 10, frameRects(10, 10, { columns: 1, rows: 2 }), { minComponentPixels: 1, minPiecePixels: 1 })
  assert.equal(audit.splitComponents.length, 1)
})

test('boundary contacts distinguish a thin joined weapon from a broad silhouette cut without semantic guessing', () => {
  const rects = frameRects(20, 10, { columns: 2 })
  const tip = pixels(20, 10, [{ left: 8, top: 4, width: 4, height: 1 }])
  const torso = pixels(20, 10, [{ left: 8, top: 2, width: 4, height: 6 }])
  assert.equal(boundaryContacts(tip, 20, rects)[0].crossingPixels, 1)
  assert.equal(boundaryContacts(torso, 20, rects)[0].crossingPixels, 6)
  assert.deepEqual(boundaryContacts(torso, 20, rects)[0].runs, [{ start: 2, end: 7 }])
})

test('anchor and scale metrics remain explicitly non-anatomical and preserve disconnected islands', () => {
  const data = pixels(20, 20, [{ left: 8, top: 8, width: 4, height: 8 }, { left: 0, top: 0, width: 4, height: 4 }])
  const metric = frameBodyMetrics(data, 20, { scale: 0.5, body: { offsetX: 6, offsetY: 6, width: 8, height: 14 } })
  assert.equal(metric.worldBodyHeight, 7)
  assert.equal(metric.worldDominantHeight, 4)
  assert.equal(metric.worldBottomGapProxy, 2)
  assert.equal(metric.worldCenterOffsetProxy, 0)
  assert.equal(metric.significantIslands.length, 2)
  assert.equal(metric.inkInsideBodyPercent, 100 * 32 / 48)
  assert.match(metric.proxyCaveat, /not an anatomical/)
})

test('audit executes only fixed local git show reads, never processors, browser, generation or state mutation', async () => {
  const source = await readFile(new URL('../scripts/shadow-runner-sprite-frame-audit.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /from ['"]playwright|__shadowRunner|spawn\(|imagegen|\.evaluate\(|shell: true|['"](?:fetch|checkout|reset|push)['"]/)
  assert.equal([...source.matchAll(/execFileAsync\(/g)].length, 1)
  assert.match(source, /execFileAsync\('git', \['--no-pager', 'show', `\$\{BASELINE_COMMIT\}:\$\{filename\}`\]/)
  assert.doesNotMatch(source, /readFile\(path\.join\(ROOT, (?:catalogPath|pipeline)\)\)/)
  assert.match(source, /output\/playwright/)
  assert.match(source, /Never overwrite a prior audit/)
  assert.match(source, /currentAssetsAudited: false/)
})

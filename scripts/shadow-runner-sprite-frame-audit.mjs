import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'
import ts from 'typescript'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const check = (condition, message) => { if (!condition) throw new Error(message) }
const execFileAsync = promisify(execFile)
export const BASELINE_COMMIT = 'aefb1e5ca291a75d45e17ceefaf7ee66ad76d5c2'
export const HISTORICAL_SCOPE = `HISTORICAL V1 BASELINE ONLY at ${BASELINE_COMMIT}; not a current v2 asset audit or gameplay/collision acceptance.`

export async function readBaselineFile(filename) {
  check(/^(scripts\/process-shadow-runner-level(?:9|10)-assets\.mjs|src\/features\/games\/shadow-runner\/game\/runtimeCatalog\.ts|(?:source-assets|public\/games)\/shadow-runner\/level-assets\/level-(?:9|10)\/(?:enemies\/)?[a-z0-9-]+\.png)$/.test(filename), 'Invalid historical baseline path')
  try {
    // Local immutable object reads only: no checkout, fetch, shell or processor execution.
    const { stdout } = await execFileAsync('git', ['--no-pager', 'show', `${BASELINE_COMMIT}:${filename}`],
      { cwd: ROOT, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024, windowsHide: true })
    return stdout
  } catch (error) {
    throw new Error(`Historical baseline object unavailable: ${BASELINE_COMMIT}:${filename}. No current-file fallback or remote fetch.`, { cause: error })
  }
}

export async function loadHistoricalDefinition() {
  const catalogPath = 'src/features/games/shadow-runner/game/runtimeCatalog.ts'
  const catalogBytes = await readBaselineFile(catalogPath)
  const catalog = runtimeCatalog(catalogBytes.toString())
  const pipelines = []
  for (const level of [9, 10]) {
    const filename = `scripts/process-shadow-runner-level${level}-assets.mjs`
    const bytes = await readBaselineFile(filename)
    const jobs = readEnemyJobs(bytes.toString(), filename)
    check(jobs.length === (level === 9 ? 3 : 4), 'Historical enemy recipe count changed')
    pipelines.push({ level, filename, sha256: hash(bytes), jobs })
  }
  return { commit: BASELINE_COMMIT, catalogPath, catalogSha256: hash(catalogBytes), catalog, pipelines }
}

export async function readHistoricalAsset(baselinePath, candidates, readLocal = filename => readFile(path.join(ROOT, filename)), readPinned = readBaselineFile) {
  const expectedSha256 = hash(await readPinned(baselinePath))
  for (const filename of candidates) {
    let bytes
    try { bytes = await readLocal(filename) }
    catch (error) { if (error.code === 'ENOENT') continue; throw error }
    check(hash(bytes) === expectedSha256, `Historical asset differs from pinned v1 baseline: ${filename}`)
    return { bytes, path: filename, baselinePath, sha256: expectedSha256,
      storage: filename.startsWith('source-assets/shadow-runner/rebuild/') ? 'preserved-archive' : 'hash-verified-original-v1' }
  }
  throw new Error(`Missing preserved v1 asset: ${baselinePath}; checked ${candidates.join(', ')}`)
}

function literal(node) {
  if (ts.isStringLiteral(node)) return node.text
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal)
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment)
    .map(property => [property.name.text, literal(property.initializer)]))
  return undefined
}

export function readEnemyJobs(source, filename = 'pipeline.mjs') {
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const jobs = []
  const visit = node => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && ['makeStrip', 'makeGridStrip'].includes(node.expression.text) && node.arguments.length === 1
      && ts.isObjectLiteralExpression(node.arguments[0])) {
      const job = literal(node.arguments[0])
      if (job.outputDirectory === 'enemies') jobs.push({ ...job, method: node.expression.text,
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 })
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return jobs
}

export function frameRects(width, height, job) {
  check(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0, 'Invalid image dimensions')
  const columns = job.columns ?? job.frameCount
  const rows = job.rows ?? 1
  const count = job.frameCount ?? columns * rows
  check([columns, rows, count].every(value => Number.isSafeInteger(value) && value > 0)
    && count <= columns * rows, 'Invalid frame grid')
  const xs = job.frameBoundaries ? [0, ...job.frameBoundaries, width]
    : Array.from({ length: columns + 1 }, (_, i) => Math.round(width * i / columns))
  check(xs.length === columns + 1 && xs.every((x, i) => Number.isInteger(x) && x >= 0 && x <= width
    && (i === 0 || x > xs[i - 1])), 'Invalid frame boundaries')
  return Array.from({ length: count }, (_, index) => {
    const column = index % columns, row = Math.floor(index / columns)
    const top = Math.round(height * row / rows), bottom = Math.round(height * (row + 1) / rows)
    return { index, left: xs[column], top, width: xs[column + 1] - xs[column], height: bottom - top }
  })
}

export function connectedAlpha(data, width, height, threshold = 12) {
  check(data.length === width * height * 4 && width > 0 && height > 0, 'Expected RGBA pixels')
  const labels = new Int32Array(width * height)
  const stack = new Int32Array(width * height)
  const components = []
  for (let seed = 0; seed < labels.length; seed += 1) {
    if (labels[seed] || data[seed * 4 + 3] <= threshold) continue
    const id = components.length + 1
    let size = 1, pixels = 0, left = width, right = -1, top = height, bottom = -1
    labels[seed] = id
    stack[0] = seed
    while (size) {
      const pos = stack[--size], x = pos % width, y = Math.floor(pos / width)
      pixels += 1
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
          const next = yy * width + xx
          if (labels[next] || data[next * 4 + 3] <= threshold) continue
          labels[next] = id
          stack[size++] = next
        }
      }
    }
    components.push({ id, pixels, left, top, width: right - left + 1, height: bottom - top + 1 })
  }
  return { labels, components }
}

export function analyzeFrameCuts(data, width, height, rects, { minComponentPixels = 64, minPiecePixels = 8 } = {}) {
  const { labels, components } = connectedAlpha(data, width, height)
  const distributions = new Map()
  const frames = rects.map(rect => {
    const counts = new Map()
    let pixels = 0, left = width, top = height, right = -1, bottom = -1
    for (let y = rect.top; y < rect.top + rect.height; y += 1) {
      for (let x = rect.left; x < rect.left + rect.width; x += 1) {
        const id = labels[y * width + x]
        if (!id) continue
        pixels += 1
        left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
        counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    for (const [id, count] of counts) {
      if (!distributions.has(id)) distributions.set(id, [])
      distributions.get(id).push({ frame: rect.index + 1, pixels: count })
    }
    return { frame: rect.index + 1, rect, pixels,
      bounds: pixels ? { left, top, width: right - left + 1, height: bottom - top + 1 } : null }
  })
  const significant = components.filter(component => component.pixels >= minComponentPixels).map(component => {
    const pieces = (distributions.get(component.id) ?? []).sort((a, b) => b.pixels - a.pixels)
    const split = pieces.filter(piece => piece.pixels >= minPiecePixels).length > 1
    return { ...component, pieces, split, primaryFrame: pieces[0]?.frame,
      spillPixels: component.pixels - (pieces[0]?.pixels ?? 0) }
  })
  return { threshold: 12, minComponentPixels, minPiecePixels, frames,
    significantComponents: significant, splitComponents: significant.filter(component => component.split),
    boundaryContacts: boundaryContacts(data, width, rects) }
}

export function boundaryContacts(data, width, rects) {
  const cuts = []
  for (const a of rects) for (const b of rects) {
    let axis, position, start, end
    if (a.left + a.width === b.left && a.top === b.top && a.height === b.height) {
      axis = 'x'; position = b.left; start = a.top; end = start + a.height
    } else if (a.top + a.height === b.top && a.left === b.left && a.width === b.width) {
      axis = 'y'; position = b.top; start = a.left; end = start + a.width
    } else continue
    const crossing = []
    for (let p = start; p < end; p += 1) {
      const before = axis === 'x' ? p * width + position - 1 : (position - 1) * width + p
      const after = axis === 'x' ? p * width + position : position * width + p
      if (data[before * 4 + 3] > 12 && data[after * 4 + 3] > 12) crossing.push(p)
    }
    const runs = []
    for (const p of crossing) {
      if (runs.length && runs.at(-1).end === p - 1) runs.at(-1).end = p
      else runs.push({ start: p, end: p })
    }
    cuts.push({ frames: [a.index + 1, b.index + 1], axis, position, crossingPixels: crossing.length, runs })
  }
  return cuts
}

export function frameBodyMetrics(data, size, runtime) {
  const { components } = connectedAlpha(data, size, size)
  const sorted = components.sort((a, b) => b.pixels - a.pixels)
  const dominant = sorted[0] ?? null
  const pixels = sorted.reduce((sum, component) => sum + component.pixels, 0)
  const body = runtime.body
  const baseline = body.offsetY + body.height
  let inkInsideBody = 0
  for (let y = Math.max(0, body.offsetY); y < Math.min(size, baseline); y += 1) {
    for (let x = Math.max(0, body.offsetX); x < Math.min(size, body.offsetX + body.width); x += 1) {
      if (data[(y * size + x) * 4 + 3] > 12) inkInsideBody += 1
    }
  }
  return { pixels, dominant, significantIslands: sorted.filter(component => component.pixels >= Math.max(16, (dominant?.pixels ?? 0) * 0.01)),
    inkInsideBodyPercent: pixels ? 100 * inkInsideBody / pixels : null,
    worldBodyHeight: body.height * runtime.scale,
    worldDominantHeight: dominant ? dominant.height * runtime.scale : null,
    worldBottomGapProxy: dominant ? (baseline - dominant.top - dominant.height) * runtime.scale : null,
    worldCenterOffsetProxy: dominant ? (dominant.left + dominant.width / 2 - body.offsetX - body.width / 2) * runtime.scale : null,
    proxyCaveat: 'Largest alpha component is not an anatomical body/foot landmark; weapons, effects and fragments can affect it.' }
}

function runtimeCatalog(source) {
  const ast = ts.createSourceFile('runtimeCatalog.ts', source, ts.ScriptTarget.Latest, true)
  for (const statement of ast.statements.filter(ts.isVariableStatement)) {
    const declaration = statement.declarationList.declarations.find(item => item.name.getText(ast) === 'SHADOW_RUNNER_ENEMY_RUNTIME')
    if (declaration) return Object.entries(literal(declaration.initializer))
  }
  throw new Error('Enemy runtime catalog not found')
}

function markRect(data, width, height, rect, color) {
  const left = Math.max(0, Math.round(rect.left)), right = Math.min(width - 1, Math.round(rect.left + rect.width - 1))
  const top = Math.max(0, Math.round(rect.top)), bottom = Math.min(height - 1, Math.round(rect.top + rect.height - 1))
  const pixel = (x, y) => { for (let c = 0; c < 4; c += 1) data[(y * width + x) * 4 + c] = color[c] }
  for (let x = left; x <= right; x += 1) { pixel(x, top); pixel(x, bottom) }
  for (let y = top; y <= bottom; y += 1) { pixel(left, y); pixel(right, y) }
}

async function images(source, runtime, job, rects, out, analysis, body) {
  const marked = Buffer.from(source.data)
  for (const rect of rects) markRect(marked, source.info.width, source.info.height, rect, [255, 70, 100, 255])
  await sharp(marked, { raw: source.info }).png().toFile(path.join(out, 'source-cuts.png'))
  const count = rects.length, columns = Math.min(5, count), cell = job.frameSize + 12
  const tiles = [], fullComponents = []
  for (let index = 0; index < count; index += 1) {
    const tile = await sharp(runtime).extract({ left: index * job.frameSize, top: 0, width: job.frameSize, height: job.frameSize })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    markRect(tile.data, job.frameSize, job.frameSize,
      { left: body.body.offsetX, top: body.body.offsetY, width: body.body.width, height: body.body.height }, [40, 220, 190, 255])
    tiles.push({ input: await sharp(tile.data, { raw: tile.info }).png().toBuffer(),
      left: (index % columns) * cell + 6, top: Math.floor(index / columns) * cell + 6 })
  }
  const contact = await sharp({ create: { width: columns * cell, height: Math.ceil(count / columns) * cell, channels: 4, background: '#24272c' } })
    .composite(tiles).png().toBuffer()
  await sharp(contact).resize({ width: columns * cell * 2, kernel: 'nearest' }).png().toFile(path.join(out, 'runtime-bodies.png'))
  // Diagnostic crops preserve complete connected components, not proposed replacement frames.
  const components = analysis.significantComponents.filter(component => component.pixels >= 1000)
    .sort((a, b) => b.pixels - a.pixels).slice(0, count).sort((a, b) => a.primaryFrame - b.primaryFrame || a.left - b.left)
  for (const component of components) {
    const crop = await sharp(source.data, { raw: source.info })
      .extract({ left: component.left, top: component.top, width: component.width, height: component.height })
      .resize(260, 260, { fit: 'contain', background: '#24272c', kernel: 'nearest' }).png().toBuffer()
    const i = fullComponents.length
    fullComponents.push({ input: crop, left: (i % columns) * 272 + 6, top: Math.floor(i / columns) * 272 + 6 })
  }
  if (fullComponents.length) await sharp({ create: { width: columns * 272, height: Math.ceil(fullComponents.length / columns) * 272,
    channels: 4, background: '#24272c' } }).composite(fullComponents).png().toFile(path.join(out, 'source-components.png'))
  return components.map(component => ({ componentId: component.id, primaryFrame: component.primaryFrame, split: component.split }))
}

export async function main(argv = process.argv.slice(2)) {
  const arg = argv[0] ?? '--run-name=sprite-frame-audit-historical-aefb1e5c'
  check(argv.length <= 1 && /^--run-name=[a-z0-9][a-z0-9._-]{0,70}$/.test(arg), 'Use --run-name=<safe-name>')
  const baseline = await loadHistoricalDefinition()
  const output = path.join(ROOT, 'output/playwright', arg.slice('--run-name='.length))
  await mkdir(path.dirname(output), { recursive: true })
  await mkdir(output) // Never overwrite a prior audit or any source/runtime asset.
  const report = { scope: HISTORICAL_SCOPE, artifactKind: 'historical-v1-baseline', baselineCommit: BASELINE_COMMIT,
    currentAssetsAudited: false, currentV2Verification: 'node scripts/process-shadow-runner-recovered-enemies.mjs --check',
    catalogObject: `${BASELINE_COMMIT}:${baseline.catalogPath}`,
    startedAt: new Date().toISOString(), output, catalogSha256: baseline.catalogSha256, jobs: [], notes: [
      'Connected components crossing cells prove pixel splitting, not that every detached component is an erroneous fragment.',
      'Touching neighboring poses can share a component. Boundary-contact runs and visual inspection distinguish a tip contact from a torso cut.',
      'Bottom/center metrics are alpha-component proxies, not anatomical foot or torso detection.',
      'Only output/playwright artifacts are written. Pinned historical Git blobs are read locally and parsed, never executed. Current processors/catalog are not read.',
      'Source and v1 runtime pixels must hash-match the same pinned commit. Archives take precedence; a corrupt archive is an error, never a fallback to current art.',
      'Current v2 whole-pose recovery is a separate --check verification. Historical splits in this report do not describe current v2 derivatives.',
    ] }
  for (const { level, filename: pipeline, sha256: pipelineSha256, jobs } of baseline.pipelines) {
    for (const job of jobs) {
      const name = job.sourceName.replace(/-v\d+-.*$/, '')
      check(/^[a-z0-9-]+$/.test(name) && path.basename(job.sourceName) === job.sourceName
        && path.basename(job.outputName) === job.outputName, 'Unsafe asset filename')
      const entry = baseline.catalog.find(([, runtime]) => runtime.textureKey === name)
      check(entry, `Missing runtime metadata for ${name}`)
      const [kind, body] = entry
      const baselineSourcePath = `source-assets/shadow-runner/level-assets/level-${level}/${job.sourceName}`
      const baselineRuntimePath = `public/games/shadow-runner/level-assets/level-${level}/enemies/${job.outputName}`
      const sourceAsset = await readHistoricalAsset(baselineSourcePath,
        [`source-assets/shadow-runner/rebuild/recovered-enemies-v2/original-${job.sourceName}`, baselineSourcePath])
      const runtimeAsset = await readHistoricalAsset(baselineRuntimePath,
        [`source-assets/shadow-runner/rebuild/legacy-${job.outputName}`, baselineRuntimePath])
      const { path: sourcePath, bytes: sourceBytes } = sourceAsset
      const { path: runtimePath, bytes: runtimeBytes } = runtimeAsset
      const source = await sharp(sourceBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const rects = frameRects(source.info.width, source.info.height, job)
      // This baseline catalog predates dimension fields; its processor recipe owns the frame layout.
      check((body.frameCount === undefined || rects.length === body.frameCount)
        && (body.frameSize === undefined || job.frameSize === body.frameSize), 'Pipeline/runtime frame mismatch')
      const analysis = analyzeFrameCuts(source.data, source.info.width, source.info.height, rects)
      const runtimeMetadata = await sharp(runtimeBytes).metadata()
      check(runtimeMetadata.width === rects.length * job.frameSize && runtimeMetadata.height === job.frameSize, 'Unexpected runtime strip dimensions')
      const runtimeFrames = []
      for (let index = 0; index < rects.length; index += 1) {
        const frame = await sharp(runtimeBytes).extract({ left: index * job.frameSize, top: 0, width: job.frameSize, height: job.frameSize })
          .ensureAlpha().raw().toBuffer()
        runtimeFrames.push({ frame: index + 1, ...frameBodyMetrics(frame, job.frameSize, body) })
      }
      const out = path.join(output, name)
      await mkdir(out)
      const componentContactOrder = await images(source, runtimeBytes, job, rects, out, analysis, body)
      const unionWidth = Math.max(...analysis.frames.map(frame => frame.bounds?.width ?? 0))
      const unionHeight = Math.max(...analysis.frames.map(frame => frame.bounds?.height ?? 0))
      const gutter = job.frameSize >= 192 ? 7 : 5
      const stable = hash(await readFile(path.join(ROOT, sourcePath))) === hash(sourceBytes)
        && hash(await readFile(path.join(ROOT, runtimePath))) === hash(runtimeBytes)
      check(stable, `Historical asset changed during audit: ${name}`)
      report.jobs.push({ level, name, kind, pipeline, pipelineSha256, pipelineObject: `${BASELINE_COMMIT}:${pipeline}`, job,
        baseline: `HISTORICAL V1 ONLY: ${BASELINE_COMMIT} recipes, catalog and hash-verified original pixels. Current v2 is NOT audited.`,
        sourceObject: `${BASELINE_COMMIT}:${baselineSourcePath}`, runtimeObject: `${BASELINE_COMMIT}:${baselineRuntimePath}`,
        sourceStorage: sourceAsset.storage, runtimeStorage: runtimeAsset.storage,
        frameDimensionsSource: `${BASELINE_COMMIT}:${pipeline}:${job.line}`,
        sourcePath, sourceSha256: hash(sourceBytes), runtimePath, runtimeSha256: hash(runtimeBytes),
        stableDuringRead: stable, sourceDimensions: { width: source.info.width, height: source.info.height },
        unionWidth, unionHeight, pipelineScale: Math.min((job.frameSize - 2 * gutter) / unionWidth, (job.frameSize - 2 * gutter) / unionHeight),
        runtime: body, ...analysis, runtimeFrames, componentContactOrder })
    }
  }
  report.catalogStableDuringRead = hash(await readBaselineFile(baseline.catalogPath)) === baseline.catalogSha256
  report.finishedAt = new Date().toISOString()
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  const lines = ['# Shadow Runner Historical V1 Sprite Frame Audit', '', report.scope, '',
    `Pinned recipes and catalog: ${BASELINE_COMMIT}. Current v2 derivatives are excluded; verify them separately with \`${report.currentV2Verification}\`.`, '',
    'Frames are one-based. Red lines show source cuts; green rectangles show runtime collision bodies.', '',
    '| Strip | Frames | Split components | Affected cells | Frame reads stable |', '| --- | ---: | ---: | --- | --- |']
  for (const job of report.jobs) {
    const cells = [...new Set(job.splitComponents.flatMap(component => component.pieces.map(piece => piece.frame)))].sort((a, b) => a - b)
    lines.push(`| ${job.name} | ${job.frames.length} | ${job.splitComponents.length} | ${cells.join(', ') || 'none'} | ${job.stableDuringRead} |`)
  }
  for (const job of report.jobs) lines.push('', `## ${job.name}`, '',
    `[Source cuts](${job.name}/source-cuts.png) | [Complete-component crops](${job.name}/source-components.png) | [Runtime bodies](${job.name}/runtime-bodies.png)`, '',
    `${job.baseline} Pipeline: ${job.pipelineObject}, line ${job.job.line}. Source SHA256: ${job.sourceSha256}. Runtime SHA256: ${job.runtimeSha256}.`, '',
    `Common scale ${job.pipelineScale.toFixed(4)} from max cut bounds ${job.unionWidth}x${job.unionHeight}. Runtime body height ${job.runtimeFrames[0].worldBodyHeight.toFixed(2)}px.`, '',
    'Complete-component crops are diagnostic source rectangles, not reviewed pose crops or replacement assets. Detached weapons/effects need visual interpretation.')
  lines.push('', ...report.notes.map(note => `- ${note}`), '')
  await writeFile(path.join(output, 'report.md'), lines.join('\n'))
  console.log(JSON.stringify({ output, baselineCommit: BASELINE_COMMIT, currentAssetsAudited: false, jobs: report.jobs.map(job => ({ name: job.name, splits: job.splitComponents.length,
    frames: job.frames.length, stable: job.stableDuringRead })) }, null, 2))
  return report
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()

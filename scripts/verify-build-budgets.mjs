import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_BUILD_BUDGETS = Object.freeze({
  // Current default build: about 1.19 MB raw / 318 kB gzip. These caps leave
  // modest release headroom without allowing the removed vendor-ui bucket back.
  initialRawBytes: 1_250_000,
  initialGzipBytes: 335_000,
  eagerJavaScriptRawBytes: 525_000,
  eagerJavaScriptGzipBytes: 160_000,
  regularJavaScriptRawBytes: 525_000,
  regularJavaScriptGzipBytes: 160_000,

  // Phaser 3 is a deliberately lazy game-engine dependency. It must never be
  // preloaded by index.html and is the only JavaScript chunk allowed above the
  // regular cap.
  phaserRawBytes: 1_550_000,
  phaserGzipBytes: 365_000,

  // Runtime-only public assets keep the deploy near 75 MiB. Preserve source
  // material outside public/ and keep enough headroom for intentional releases.
  deployRawBytes: 100_000_000,
})

const PHASER_CHUNK_PATTERN = /^vendor-phaser-[A-Za-z0-9_-]+\.js$/

export function extractInitialAssetPaths(indexHtml) {
  const assetPaths = new Set(['index.html'])
  const tags = indexHtml.match(/<(?:script|link)\b[^>]*>/gi) ?? []

  for (const tag of tags) {
    const tagName = /^<([a-z]+)/i.exec(tag)?.[1]?.toLowerCase()

    if (tagName === 'script') {
      const type = getAttribute(tag, 'type')?.toLowerCase()
      if (type === 'module') {
        addLocalAssetPath(assetPaths, getAttribute(tag, 'src'))
      }
      continue
    }

    const relValues = (getAttribute(tag, 'rel') ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    if (relValues.includes('modulepreload') || relValues.includes('stylesheet')) {
      addLocalAssetPath(assetPaths, getAttribute(tag, 'href'))
    }
  }

  return [...assetPaths].sort()
}

export function verifyBuildBudgets({
  distDir = path.resolve('dist'),
  budgets = DEFAULT_BUILD_BUDGETS,
  log = console.log,
} = {}) {
  const resolvedDistDir = path.resolve(distDir)
  const indexPath = path.join(resolvedDistDir, 'index.html')
  const manifestPath = path.join(resolvedDistDir, '.vite', 'manifest.json')

  if (!existsSync(indexPath)) {
    throw new Error(`Build budget check requires ${indexPath}`)
  }

  if (!existsSync(manifestPath)) {
    throw new Error('Build budget check requires Vite build.manifest to be enabled')
  }

  const initialPaths = extractInitialAssetPaths(readFileSync(indexPath, 'utf8'))
  const initialAssets = initialPaths.map((relativePath) => measureAsset(resolvedDistDir, relativePath))
  const initialJavaScript = initialAssets.filter((asset) => asset.extension === '.js')
  const allFiles = walkFiles(resolvedDistDir)
  const allJavaScript = allFiles
    .filter((filePath) => path.extname(filePath).toLowerCase() === '.js')
    .map((filePath) => measureFile(resolvedDistDir, filePath))
  const phaserAssets = allJavaScript.filter((asset) => PHASER_CHUNK_PATTERN.test(path.basename(asset.relativePath)))
  const regularJavaScript = allJavaScript.filter((asset) => !PHASER_CHUNK_PATTERN.test(path.basename(asset.relativePath)))
  const deployRawBytes = allFiles.reduce((total, filePath) => total + statSync(filePath).size, 0)
  const initialRawBytes = sumBy(initialAssets, 'rawBytes')
  const initialGzipBytes = sumBy(initialAssets, 'gzipBytes')
  const failures = []

  checkLimit(failures, 'Initial HTML/preload payload (raw)', initialRawBytes, budgets.initialRawBytes)
  checkLimit(failures, 'Initial HTML/preload payload (gzip)', initialGzipBytes, budgets.initialGzipBytes)
  checkAssetLimits(
    failures,
    'Eager JavaScript',
    initialJavaScript,
    budgets.eagerJavaScriptRawBytes,
    budgets.eagerJavaScriptGzipBytes,
  )
  checkAssetLimits(
    failures,
    'Regular JavaScript',
    regularJavaScript,
    budgets.regularJavaScriptRawBytes,
    budgets.regularJavaScriptGzipBytes,
  )

  if (phaserAssets.length !== 1) {
    failures.push(`Expected exactly one lazy Phaser chunk, found ${phaserAssets.length}`)
  } else {
    const phaserAsset = phaserAssets[0]
    if (initialPaths.includes(phaserAsset.relativePath)) {
      failures.push(`Lazy Phaser exception became eager: ${phaserAsset.relativePath}`)
    }
    checkLimit(failures, `${phaserAsset.relativePath} (raw)`, phaserAsset.rawBytes, budgets.phaserRawBytes)
    checkLimit(failures, `${phaserAsset.relativePath} (gzip)`, phaserAsset.gzipBytes, budgets.phaserGzipBytes)
  }

  checkLimit(failures, 'Total deploy payload (raw)', deployRawBytes, budgets.deployRawBytes)

  if (failures.length > 0) {
    throw new Error(`Build budget check failed:\n- ${failures.join('\n- ')}`)
  }

  const largestEagerJavaScript = largestByRawBytes(initialJavaScript)
  const phaserAsset = phaserAssets[0]
  log('Build budgets passed:')
  log(`  Initial HTML/preloads: ${initialAssets.length} files, ${formatBytes(initialRawBytes)} raw / ${formatBytes(initialGzipBytes)} gzip`)
  if (largestEagerJavaScript) {
    log(`  Largest eager JavaScript: ${largestEagerJavaScript.relativePath}, ${formatBytes(largestEagerJavaScript.rawBytes)} raw / ${formatBytes(largestEagerJavaScript.gzipBytes)} gzip`)
  }
  if (phaserAsset) {
    log(`  Lazy Phaser exception: ${phaserAsset.relativePath}, ${formatBytes(phaserAsset.rawBytes)} raw / ${formatBytes(phaserAsset.gzipBytes)} gzip`)
  }
  log(`  Total deploy payload: ${allFiles.length} files, ${formatBytes(deployRawBytes)} raw`)

  return {
    deployRawBytes,
    initialAssetPaths: initialPaths,
    initialGzipBytes,
    initialRawBytes,
    largestEagerJavaScript,
    phaserAsset,
  }
}

function addLocalAssetPath(assetPaths, reference) {
  if (!reference || /^(?:[a-z]+:)?\/\//i.test(reference) || reference.startsWith('data:')) {
    return
  }

  const parsed = new URL(reference, 'https://shadowchat.invalid/')
  const relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
  if (relativePath) {
    assetPaths.add(relativePath)
  }
}

function getAttribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`\\s${escapedName}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+)))?`, 'i').exec(tag)
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : undefined
}

function measureAsset(distDir, relativePath) {
  const resolvedPath = path.resolve(distDir, relativePath)
  const distPrefix = `${path.resolve(distDir)}${path.sep}`

  if (resolvedPath !== path.resolve(distDir) && !resolvedPath.startsWith(distPrefix)) {
    throw new Error(`Initial asset escapes dist: ${relativePath}`)
  }

  if (!existsSync(resolvedPath) || !statSync(resolvedPath).isFile()) {
    throw new Error(`Initial asset is missing from dist: ${relativePath}`)
  }

  return measureFile(distDir, resolvedPath)
}

function measureFile(distDir, filePath) {
  const content = readFileSync(filePath)
  return {
    extension: path.extname(filePath).toLowerCase(),
    gzipBytes: gzipSync(content, { level: 9 }).length,
    rawBytes: content.length,
    relativePath: path.relative(distDir, filePath).replace(/\\/g, '/'),
  }
}

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? walkFiles(entryPath) : [entryPath]
    })
}

function checkAssetLimits(failures, label, assets, rawLimit, gzipLimit) {
  for (const asset of assets) {
    checkLimit(failures, `${label} ${asset.relativePath} (raw)`, asset.rawBytes, rawLimit)
    checkLimit(failures, `${label} ${asset.relativePath} (gzip)`, asset.gzipBytes, gzipLimit)
  }
}

function checkLimit(failures, label, actual, limit) {
  if (actual > limit) {
    failures.push(`${label}: ${formatBytes(actual)} exceeds ${formatBytes(limit)}`)
  }
}

function largestByRawBytes(assets) {
  return assets.reduce((largest, asset) => !largest || asset.rawBytes > largest.rawBytes ? asset : largest, undefined)
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + item[key], 0)
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  try {
    verifyBuildBudgets()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}

import assert from 'node:assert/strict'
import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest.ts'

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const publicRoot = path.join(repoRoot, 'public')
const runnerPublicRoot = path.join(publicRoot, 'games', 'shadow-runner')

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

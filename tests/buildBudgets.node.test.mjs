import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DEFAULT_BUILD_BUDGETS,
  extractInitialAssetPaths,
  verifyBuildBudgets,
} from '../scripts/verify-build-budgets.mjs'

test('extractInitialAssetPaths returns only resources fetched by the initial document', () => {
  const html = `
    <script src="/comfort-bootstrap.js"></script>
    <script type="module" src="/assets/index.js"></script>
    <link rel="modulepreload" href="/assets/vendor.js">
    <link rel="stylesheet" href="/assets/index.css">
    <link rel="manifest" href="/manifest.webmanifest">
  `

  assert.deepEqual(extractInitialAssetPaths(html), [
    'assets/index.css',
    'assets/index.js',
    'assets/vendor.js',
    'comfort-bootstrap.js',
    'index.html',
  ])
})

test('verifyBuildBudgets keeps Phaser and optional LiveKit exceptions lazy', () => {
  const distDir = mkdtempSync(path.join(tmpdir(), 'shadowchat-build-budget-'))

  try {
    mkdirSync(path.join(distDir, '.vite'), { recursive: true })
    mkdirSync(path.join(distDir, 'assets'), { recursive: true })
    writeFileSync(path.join(distDir, '.vite', 'manifest.json'), '{}')
    writeFileSync(path.join(distDir, 'assets', 'index.js'), 'console.log("entry")')
    writeFileSync(path.join(distDir, 'assets', 'index.css'), 'body{color:#fff}')
    writeFileSync(path.join(distDir, 'assets', 'vendor-phaser-test.js'), 'console.log("lazy game engine")')
    writeFileSync(path.join(distDir, 'assets', 'vendor-livekit-test.js'), 'console.log("lazy live audio")')
    writeFileSync(
      path.join(distDir, 'index.html'),
      '<script type="module" src="/assets/index.js"></script><link rel="stylesheet" href="/assets/index.css">',
    )

    const result = verifyBuildBudgets({ distDir, budgets: DEFAULT_BUILD_BUDGETS, log() {} })
    assert.equal(result.phaserAsset.relativePath, 'assets/vendor-phaser-test.js')
    assert.equal(result.liveKitAsset.relativePath, 'assets/vendor-livekit-test.js')

    writeFileSync(
      path.join(distDir, 'index.html'),
      '<script type="module" src="/assets/index.js"></script><link rel="modulepreload" href="/assets/vendor-phaser-test.js">',
    )

    assert.throws(
      () => verifyBuildBudgets({ distDir, budgets: DEFAULT_BUILD_BUDGETS, log() {} }),
      /Lazy Phaser exception became eager/,
    )

    writeFileSync(
      path.join(distDir, 'index.html'),
      '<script type="module" src="/assets/index.js"></script><link rel="modulepreload" href="/assets/vendor-livekit-test.js">',
    )

    assert.throws(
      () => verifyBuildBudgets({ distDir, budgets: DEFAULT_BUILD_BUDGETS, log() {} }),
      /Lazy LiveKit exception became eager/,
    )
  } finally {
    rmSync(distDir, { recursive: true, force: true })
  }
})

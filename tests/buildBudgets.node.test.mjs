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

test('Babylon exception rejects preload, transitive eager import, duplicate chunks and excess size', () => {
  const distDir = mkdtempSync(path.join(tmpdir(), 'shadowchat-babylon-budget-'))
  try {
    mkdirSync(path.join(distDir,'.vite'),{recursive:true});mkdirSync(path.join(distDir,'assets'),{recursive:true})
    const file=(name,text)=>writeFileSync(path.join(distDir,name),text)
    file('index.html','<script type="module" src="/assets/index.js"></script>')
    file('assets/index.js','entry');file('assets/vendor-phaser-test.js','phaser');file('assets/vendor-babylon-test.js','babylon')
    file('.vite/manifest.json',JSON.stringify({'index.html':{file:'assets/index.js',isEntry:true,dynamicImports:['scene']},scene:{file:'assets/vendor-babylon-test.js'}}))
    assert.equal(verifyBuildBudgets({distDir,log(){}}).babylonAsset.relativePath,'assets/vendor-babylon-test.js')
    file('index.html','<script type="module" src="/assets/index.js"></script><link rel="modulepreload" href="/assets/vendor-babylon-test.js">')
    assert.throws(()=>verifyBuildBudgets({distDir,log(){}}),/Lazy Babylon exception became eager/)
    file('index.html','<script type="module" src="/assets/index.js"></script>')
    file('.vite/manifest.json',JSON.stringify({'index.html':{file:'assets/index.js',isEntry:true,imports:['shared']},shared:{file:'assets/shared.js',imports:['scene']},scene:{file:'assets/vendor-babylon-test.js'}}))
    assert.throws(()=>verifyBuildBudgets({distDir,log(){}}),/Lazy Babylon exception became eager/)
    file('.vite/manifest.json','{}')
    assert.throws(()=>verifyBuildBudgets({distDir,budgets:{...DEFAULT_BUILD_BUDGETS,babylonRawBytes:1},log(){}}),/vendor-babylon.*exceeds/)
    file('assets/vendor-babylon-second.js','duplicate')
    assert.throws(()=>verifyBuildBudgets({distDir,log(){}}),/at most one lazy Babylon/)
  } finally { rmSync(distDir,{recursive:true,force:true}) }
})

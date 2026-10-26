import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const verifier = path.resolve('scripts/verify-paused-feature-build.mjs')

const verifyAssets = async (assets, run) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'shadowchat-build-guard-'))
  try {
    await mkdir(path.join(directory, 'dist', 'assets'), { recursive: true })
    await Promise.all(Object.entries(assets).map(([name, content]) =>
      writeFile(path.join(directory, 'dist', 'assets', name), content)))
    const env = { ...process.env }
    for (const name of Object.keys(env)) {
      if (name.startsWith('VITE_FEATURE_')) delete env[name]
    }
    run(spawnSync(process.execPath, [verifier], { cwd: directory, env, encoding: 'utf8' }))
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('shadowchat-build-guard-'))
    await rm(directory, { recursive: true, force: true })
  }
}

test('allows the phone installation onboarding chunk', async () => {
  await verifyAssets({ 'PhoneInstallOnboarding-example.js': 'export const open = true' }, result => {
    assert.equal(result.status, 0, result.stderr)
  })
})

test('still rejects paused Boards chunks', async () => {
  await verifyAssets({ 'ArtBoard-example.js': 'export const open = true' }, result => {
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Boards and News: emitted paused chunk/)
  })
})

test('still detects paused feature code in shared chunks', async () => {
  await verifyAssets({ 'index-example.js': 'get_board_badge_counts()' }, result => {
    assert.equal(result.status, 1)
    assert.match(result.stderr, /get_board_badge_counts/)
  })
})

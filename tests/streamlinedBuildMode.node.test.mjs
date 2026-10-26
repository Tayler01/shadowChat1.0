import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { loadConfigFromFile } from 'vite'

const configFile = path.resolve('apps/streamlined/vite.config.ts')
const verifier = path.resolve('scripts/verify-streamlined-build.mjs')
const requiredModules = ['src/components/chat/MessageInput.tsx', 'src/components/chat/ChatImageRadialHeart.tsx', 'src/components/dms/DirectMessagesView.tsx', 'src/features/shadow-pin/ShadowPin.tsx', 'src/features/moderation/ModerationReportProvider.tsx']

for (const mode of ['production', 'development', 'local-preview']) {
  test(`Vite mode ${mode} selects only its explicit output and compile flag`, async () => {
    const loaded = await loadConfigFromFile({ command: 'build', mode }, configFile)
    const enabled = mode === 'local-preview'
    assert.equal(loaded.config.define.__SHADOWCHAT_LOCAL_FEATURE_PREVIEW__, JSON.stringify(enabled))
    assert.equal(loaded.config.build.outDir, path.resolve('apps/streamlined', enabled ? 'dist-local-preview' : 'dist'))
    assert.equal(loaded.config.preview.host, '127.0.0.1')
  })
}

async function fixture({ outputLocal = false, markerLocal = outputLocal, runtimeLocal = outputLocal, htmlLocal = outputLocal, modules = requiredModules }, verifyLocal) {
  const directory = await mkdtemp(path.join(tmpdir(), 'shadowchat-streamlined-mode-'))
  try {
    const root = path.join(directory, 'apps/streamlined', outputLocal ? 'dist-local-preview' : 'dist')
    await mkdir(path.join(root, '.vite'), { recursive: true })
    await mkdir(path.join(root, 'assets'), { recursive: true })
    await writeFile(path.join(directory, 'apps/streamlined/shared-overrides.json'), '{}')
    await Promise.all([
      writeFile(path.join(root, '.vite/streamlined-build-mode.json'), JSON.stringify({ edition: 'streamlined', localFeaturePreview: markerLocal, releaseEligible: !markerLocal })),
      writeFile(path.join(root, '.vite/manifest.json'), JSON.stringify({ 'index.html': { file: 'assets/main.js' } })),
      writeFile(path.join(root, '.vite/streamlined-modules.json'), JSON.stringify(modules)),
      writeFile(path.join(root, 'index.html'), `<meta name="shadowchat-local-feature-preview" content="${htmlLocal ? 'enabled' : 'disabled'}">`),
      writeFile(path.join(root, 'assets/main.js'), runtimeLocal ? 'document.querySelector(\'meta[name="shadowchat-local-feature-preview"][content="enabled"]\')' : 'console.log("normal release")'),
    ])
    return spawnSync(process.execPath, [verifier, ...(verifyLocal ? ['--local-preview'] : [])], { cwd: directory, encoding: 'utf8' })
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()))
    assert.ok(path.basename(directory).startsWith('shadowchat-streamlined-mode-'))
    await rm(directory, { recursive: true, force: true })
  }
}

test('verifies a normal artifact with the local runtime absent', async () => {
  const result = await fixture({}, false)
  assert.equal(result.status, 0, result.stderr)
})

test('rejects duplicate module identities that split shared React providers', async () => {
  const result = await fixture({ modules: [...requiredModules, 'src/hooks/useAuth.tsx', 'src/hooks/useAuth.tsx'] }, false)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Duplicate module identities/)
})
test('verifies a deliberately selected local artifact as ineligible for release', async () => {
  const result = await fixture({ outputLocal: true }, true)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /not a release artifact/)
})
test('normal verification never silently selects the separate local output', async () => {
  const result = await fixture({ outputLocal: true }, false)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /ENOENT/)
})
test('rejects enabled local metadata copied into the release directory', async () => {
  const result = await fixture({ markerLocal: true, runtimeLocal: true, htmlLocal: true }, false)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Local preview marker does not match/)
})
test('rejects enabled runtime code even if release metadata is falsely disabled', async () => {
  const result = await fixture({ runtimeLocal: true }, false)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /local feature preview runtime entered the release artifact/)
})
test('rejects the wrong HTML mode marker', async () => {
  const result = await fixture({ htmlLocal: true }, false)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /HTML marker is missing or incorrect/)
})
test('rejects a local artifact without its runtime host guard', async () => {
  const result = await fixture({ outputLocal: true, runtimeLocal: false }, true)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /runtime guard is missing/)
})

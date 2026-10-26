import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const STREAMLINED_SITE_ID = '9debf31e-c599-4488-9783-bf1a7bc42b8a'
export function validateStreamlinedReleaseSource({ mode, head, main, dirty, siteId }) {
  assert.equal(siteId, STREAMLINED_SITE_ID, 'Only the dedicated streamlined site is allowed')
  assert.equal(mode.edition, 'streamlined')
  assert.equal(mode.localFeaturePreview, false, 'A local membership-bypass preview must never be published')
  assert.equal(mode.releaseEligible, true)
  assert.equal(dirty.trim(), '', 'Commit the reviewed release source before preparing a deployment')
  assert.equal(head, main, 'Release source must match origin/main; fetch immediately before preparation')
  assert.equal(mode.sourceCommit, head, 'Build metadata is stale; rebuild the exact committed release source')
  assert.equal(mode.sourceDirty, false, 'Rebuild after committing or reverting all source changes')
}

export function prepareStreamlinedNetlify(root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')) {
const build = path.join(root, 'apps/streamlined/dist')
const mode = JSON.parse(readFileSync(path.join(build, '.vite/streamlined-build-mode.json'), 'utf8'))
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const main = git(['rev-parse', 'HEAD'])
validateStreamlinedReleaseSource({ mode, head: main, main: git(['rev-parse', 'origin/main']), dirty: git(['status', '--porcelain']), siteId: STREAMLINED_SITE_ID })
const generated = path.join(root, '.netlify')
mkdirSync(generated, { recursive: true })
const staging = mkdtempSync(path.join(generated, 'streamlined-release-'))
cpSync(build, path.join(staging, 'public'), { recursive: true })
cpSync(path.join(root, 'netlify.streamlined.toml'), path.join(staging, 'netlify.toml'))
mkdirSync(path.join(staging, 'functions'), { recursive: true })
// An explicit endpoint allowlist avoids copying the full app's scheduled janitor.
cpSync(path.join(root, 'netlify/functions/shadow-pin-media.mjs'), path.join(staging, 'functions/shadow-pin-media.mjs'))
cpSync(path.join(root, 'netlify/functions/_shared'), path.join(staging, 'functions/_shared'), { recursive: true })
mkdirSync(path.join(staging, 'public/.well-known'), { recursive: true })
const receipt = {
  edition: 'streamlined', sourceCommit: main,
  siteId: STREAMLINED_SITE_ID,
  origin: 'https://shadowchat-streamlined.netlify.app',
  preparedAt: new Date().toISOString(),
  functionNames: ['shadow-pin-media'], scheduledFunctions: [],
}
writeFileSync(path.join(staging, 'public/.well-known/shadowchat-health.json'), `${JSON.stringify(receipt, null, 2)}\n`)
return { ...receipt, staging, published: false }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(prepareStreamlinedNetlify(), null, 2))
}

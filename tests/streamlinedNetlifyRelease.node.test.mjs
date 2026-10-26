import assert from 'node:assert/strict'
import test from 'node:test'
import { validateStreamlinedReleaseSource, STREAMLINED_SITE_ID } from '../scripts/prepare-streamlined-netlify.mjs'

const valid = { mode: { edition: 'streamlined', localFeaturePreview: false, releaseEligible: true, sourceCommit: 'abc', sourceDirty: false }, head: 'abc', main: 'abc', dirty: '', siteId: STREAMLINED_SITE_ID }
test('release preparation requires the exact clean main build and dedicated target', () => {
  assert.doesNotThrow(() => validateStreamlinedReleaseSource(valid))
  for (const invalid of [
    { ...valid, mode: { ...valid.mode, localFeaturePreview: true } },
    { ...valid, mode: { ...valid.mode, sourceCommit: 'old' } },
    { ...valid, mode: { ...valid.mode, sourceDirty: true } },
    { ...valid, main: 'newer' },
    { ...valid, dirty: ' M src/App.tsx' },
    { ...valid, siteId: 'a0f92bf0-42cf-4a1d-bc0a-5d9c1e673205' },
  ]) assert.throws(() => validateStreamlinedReleaseSource(invalid))
})

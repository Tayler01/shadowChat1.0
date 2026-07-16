import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const verifier = read('scripts/verify-shado-live-real-browser.mjs')
const packageJson = JSON.parse(read('package.json'))

test('real Shado Live verifier is gated and uses deterministic browser contracts', () => {
  assert.match(verifier, /VITE_FEATURE_SHADO_LIVE_REAL=true/)
  assert.match(verifier, /pixel-chromium/)
  assert.match(verifier, /iphone-webkit/)
  assert.match(verifier, /vendor-livekit-/)
  assert.match(verifier, /\/functions\/v1\/shado-live-session/)
  assert.match(verifier, /\/functions\/v1\/shado-live-command/)
  assert.match(verifier, /\/functions\/v1\/shado-live-reconcile/)
  assert.match(verifier, /url\.pathname\.startsWith\('\/rest\/v1\/rpc\/'\)/)
  assert.match(verifier, /name === 'list_my_shado_live_rooms'/)
  assert.match(verifier, /All Supabase RPC and Edge Function calls were route-fulfilled in memory/)
  assert.equal(packageJson.scripts['qa:shado-live:real'], 'node scripts/verify-shado-live-real-browser.mjs')
})

test('real verifier protects camera, recording, routing, Catch-Up, and mobile geometry', () => {
  assert.match(verifier, /getDisplayMedia/)
  assert.match(verifier, /MediaRecorder/)
  assert.match(verifier, /displayCaptureCalls === 0/)
  assert.match(verifier, /recordingCalls === 0/)
  assert.match(verifier, /searchParams\.get\('experience'\) === 'shado-live'/)
  assert.match(verifier, /name: 'Catch-Up'/)
  assert.match(verifier, /assertKeyboardGeometry/)
  assert.match(verifier, /assertStageGeometry/)
})

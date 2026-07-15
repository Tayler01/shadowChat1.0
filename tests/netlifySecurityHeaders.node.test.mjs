import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const getHeaderBlock = (config, path) => {
  const blocks = config.split('[[headers]]').slice(1)
  return blocks.find(block => new RegExp(`^\\s*for\\s*=\\s*"${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'm').test(block)) || ''
}

test('Netlify ships safe immediate browser headers while CSP remains report-only', () => {
  const config = read('netlify.toml')
  const block = getHeaderBlock(config, '/*')

  assert.ok(block, 'expected a global Netlify headers block')
  assert.match(block, /X-Content-Type-Options\s*=\s*"nosniff"/)
  assert.match(block, /X-Frame-Options\s*=\s*"DENY"/)
  assert.match(block, /Referrer-Policy\s*=\s*"strict-origin-when-cross-origin"/)
  assert.match(block, /Permissions-Policy\s*=\s*"[^"]*geolocation=\(self\)[^"]*"/)
  assert.match(block, /Permissions-Policy\s*=\s*"[^"]*microphone=\(self\)[^"]*"/)
  assert.doesNotMatch(block, /^\s*Content-Security-Policy\s*=/m)

  const policy = block.match(/Content-Security-Policy-Report-Only\s*=\s*"([^"]+)"/)?.[1] || ''
  assert.ok(policy, 'expected a report-only Content Security Policy')

  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ]) {
    assert.ok(policy.includes(directive), `expected CSP directive: ${directive}`)
  }

  for (const requiredSource of [
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://api.open-meteo.com',
    'https://geocoding-api.open-meteo.com',
    'https://api.weather.gov',
    'https://api.rainviewer.com',
    'https://tile.openstreetmap.org',
    'https://tilecache.rainviewer.com',
    'https://*.ingest.sentry.io',
    'https://www.youtube.com',
    'https://player.vimeo.com',
    'https://player.mediadelivery.net',
    'https://assets.pinterest.com',
    'https://platform.x.com',
    'https://platform.twitter.com',
    'https://www.instagram.com',
  ]) {
    assert.ok(policy.includes(requiredSource), `expected CSP source: ${requiredSource}`)
  }
})

test('Netlify serves the web app manifest with its registered MIME type', () => {
  const config = read('netlify.toml')
  const block = getHeaderBlock(config, '/manifest.webmanifest')

  assert.ok(block, 'expected a manifest-specific Netlify headers block')
  assert.match(block, /Content-Type\s*=\s*"application\/manifest\+json; charset=utf-8"/)
})

test('Netlify requires service-worker update checks to revalidate sw.js', () => {
  const config = read('netlify.toml')
  const block = getHeaderBlock(config, '/sw.js')

  assert.ok(block, 'expected a service-worker-specific Netlify headers block')
  assert.match(block, /Cache-Control\s*=\s*"no-cache"/)
})

test('Netlify preserves Sharp as a native external function dependency', () => {
  const config = read('netlify.toml')

  assert.match(config, /\[functions\][\s\S]*?node_bundler\s*=\s*"esbuild"/)
  assert.match(config, /\[functions\][\s\S]*?external_node_modules\s*=\s*\["semver",\s*"sharp"\]/)
})

test('mobile metadata permits zoom and does not force portrait orientation', () => {
  const html = read('index.html')
  const manifest = JSON.parse(read('public/manifest.webmanifest'))
  const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]+)"\s*\/>/)?.[1] || ''

  assert.ok(viewport.includes('width=device-width'))
  assert.ok(viewport.includes('initial-scale=1.0'))
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no/i)
  assert.equal(Object.hasOwn(manifest, 'orientation'), false)
})

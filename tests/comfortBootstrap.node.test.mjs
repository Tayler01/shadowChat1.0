import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../public/comfort-bootstrap.js', import.meta.url), 'utf8')
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const storageKey = 'shadowchat:comfort-preferences:v1'

test('loads the self-hosted comfort bootstrap before the React app module', () => {
  const bootstrapIndex = indexHtml.indexOf('src="/comfort-bootstrap.js"')
  const appIndex = indexHtml.indexOf('src="/src/main.tsx"')
  assert.ok(bootstrapIndex >= 0)
  assert.ok(appIndex > bootstrapIndex)
})

const runBootstrap = ({ stored = null, activeQueries = [], storageThrows = false } = {}) => {
  const attributes = new Map()
  const context = {
    window: {
      localStorage: {
        getItem(key) {
          if (storageThrows) throw new Error('SecurityError')
          return key === storageKey ? stored : null
        },
      },
      matchMedia(query) {
        return { matches: activeQueries.includes(query) }
      },
    },
    document: {
      documentElement: {
        setAttribute(name, value) {
          attributes.set(name, value)
        },
      },
    },
  }
  runInNewContext(source, context, { filename: 'comfort-bootstrap.js' })
  return { attributes: Object.fromEntries(attributes), snapshot: context.window.__shadowchatComfortBootstrap }
}

test('pre-paint bootstrap resolves system preferences before applying attributes', () => {
  const result = runBootstrap({
    stored: JSON.stringify({ preset: 'follow-device' }),
    activeQueries: ['(prefers-reduced-motion: reduce)', '(forced-colors: active)'],
  })
  assert.equal(result.attributes['data-comfort-motion'], 'reduced')
  assert.equal(result.attributes['data-comfort-transparency'], 'solid')
  assert.equal(result.attributes['data-comfort-contrast'], 'high')
  assert.equal(result.attributes['data-comfort-text-scale'], '100')
  assert.equal(result.snapshot.storageKey, storageKey)
  assert.deepEqual({ ...result.snapshot.attributes }, result.attributes)
})

test('pre-paint bootstrap falls back safely when storage is blocked or malformed', () => {
  for (const input of [
    { storageThrows: true },
    { stored: '{broken json' },
  ]) {
    const result = runBootstrap(input)
    assert.equal(result.attributes['data-comfort-preset'], 'follow-device')
    assert.equal(result.attributes['data-comfort-motion'], 'full')
    assert.equal(result.attributes['data-comfort-transparency'], 'glass')
    assert.equal(result.attributes['data-comfort-contrast'], 'standard')
    assert.equal(result.attributes['data-comfort-ui-sounds'], 'on')
  }
})

test('calm preset produces a complete sensory-off contract without app code', () => {
  const result = runBootstrap({ stored: JSON.stringify({ preset: 'calm' }) })
  assert.equal(Object.keys(result.attributes).length, 14)
  assert.equal(result.attributes['data-comfort-motion'], 'none')
  assert.equal(result.attributes['data-comfort-transparency'], 'solid')
  assert.equal(result.attributes['data-comfort-autoplay'], 'never')
  assert.equal(result.attributes['data-comfort-ui-sounds'], 'off')
  assert.equal(result.attributes['data-comfort-celebration-sounds'], 'off')
  assert.equal(result.attributes['data-comfort-game-music'], 'off')
  assert.equal(result.attributes['data-comfort-game-sfx'], 'off')
  assert.equal(result.attributes['data-comfort-haptics'], 'off')
})

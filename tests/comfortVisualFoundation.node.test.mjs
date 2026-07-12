import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'src', 'index.css'), 'utf8')
const button = fs.readFileSync(path.join(root, 'src', 'components', 'ui', 'Button.tsx'), 'utf8')
const groupMessages = fs.readFileSync(path.join(root, 'src', 'components', 'chat', 'MessageList.tsx'), 'utf8')
const directMessages = fs.readFileSync(path.join(root, 'src', 'components', 'dms', 'DirectMessagesView.tsx'), 'utf8')

test('comfort visual attributes have explicit CSS contracts', () => {
  for (const selector of [
    "data-comfort-motion='reduced'",
    "data-comfort-motion='none'",
    "data-comfort-transparency='solid'",
    "data-comfort-contrast='high'",
    "data-comfort-text-scale='100'",
    "data-comfort-text-scale='115'",
    "data-comfort-text-scale='130'",
    "data-comfort-touch-target='large'",
    "data-comfort-density='compact'",
    "data-comfort-density='comfortable'",
    "data-comfort-density='spacious'",
  ]) {
    assert.match(css, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('reduced motion preserves essential progress and reduced transparency removes blur', () => {
  assert.match(css, /data-comfort-motion='reduced'[\s\S]*?animation-duration:\s*80ms\s*!important/)
  assert.match(css, /data-comfort-motion='none'[\s\S]*?animation-duration:\s*1ms\s*!important/)
  assert.match(css, /data-comfort-motion='none'[\s\S]*?\.animate-spin/)
  assert.match(css, /data-comfort-transparency='solid'[\s\S]*?backdrop-filter:\s*none\s*!important/)
  assert.match(css, /--theme-backdrop-image:\s*none/)
  assert.match(css, /background-attachment:\s*scroll\s*!important/)
})

test('shared buttons opt into the 48px comfort target without changing defaults', () => {
  assert.match(css, /--comfort-control-min-size:\s*0px/)
  assert.match(css, /data-comfort-touch-target='large'[\s\S]*?--comfort-control-min-size:\s*3rem/)
  assert.match(button, /comfort-button/)
  assert.match(button, /min-h-\[var\(--comfort-control-min-size\)\]/)
})

test('density controls real General Chat and DM message spacing', () => {
  assert.match(css, /--comfort-message-gap:\s*0\.75rem/)
  assert.match(css, /data-comfort-density='compact'[\s\S]*?--comfort-message-gap:\s*0\.45rem/)
  assert.match(css, /data-comfort-density='spacious'[\s\S]*?--comfort-message-gap:\s*1\.05rem/)
  assert.match(css, /\.comfort-message-row\[data-message-grouped='true'\]/)
  assert.match(groupMessages, /className="comfort-message-row/)
  assert.match(groupMessages, /data-message-grouped=/)
  assert.match(directMessages, /comfort-message-stack/)
})

test('focus visibility and Windows forced-colors support remain global', () => {
  assert.match(css, /:focus-visible/)
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/)
  assert.match(css, /outline-color:\s*Highlight\s*!important/)
})

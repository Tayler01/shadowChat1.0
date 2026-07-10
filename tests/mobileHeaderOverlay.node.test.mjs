import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const roomTools = readFileSync(
  new URL('../src/components/chat/GeneralChatRoomTools.tsx', import.meta.url),
  'utf8',
)

test('General Chat tools expand inline to the left without a selector popup', () => {
  assert.doesNotMatch(roomTools, /createPortal\(/)
  assert.doesNotMatch(roomTools, /popup-surface/)
  assert.match(roomTools, /ChevronLeft, ChevronRight/)
  assert.match(roomTools, /role="group"/)
  assert.match(roomTools, /right-\[calc\(100%\+0\.2rem\)\]/)
  assert.match(roomTools, /'Collapse General Chat tools' : 'Expand General Chat tools'/)
  assert.match(
    roomTools,
    /dataset\.shadowchatKeyboard === 'open'[\s\S]*setExpanded\(false\)/,
  )
  assert.match(
    css,
    /\.room-tools-inline-rail\s*\{[^}]*animation:\s*room-tools-inline-enter/s,
  )
})

test('General Chat room tools use the themed focus ring instead of the browser outline', () => {
  assert.equal(roomTools.match(/room-tools-control/g)?.length, 1)
  assert.match(
    css,
    /--theme-focus-ring:\s*rgb\(var\(--theme-accent-rgb\) \/ 0\.24\);/,
  )
  assert.match(
    css,
    /\.room-tools-control:focus\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*0 0 0 2px var\(--theme-focus-ring\);/s,
  )
})

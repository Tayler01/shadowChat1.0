import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const roomTools = readFileSync(
  new URL('../src/components/chat/GeneralChatRoomTools.tsx', import.meta.url),
  'utf8',
)

test('General Chat room tools escape header clipping and stay inside the viewport', () => {
  assert.match(
    roomTools,
    /createPortal\(/,
  )
  assert.match(
    roomTools,
    /Math\.max\(triggerRect\.right - width, viewportLeft \+ ROOM_TOOLS_EDGE_PADDING\)/,
  )
  assert.match(
    roomTools,
    /popup-surface fixed z-\[100\]/,
  )
  assert.match(
    roomTools,
    /dataset\.shadowchatKeyboard === 'open'[\s\S]*setOpen\(false\)/,
  )
})

test('General Chat room tools use the themed focus ring instead of the browser outline', () => {
  assert.equal(roomTools.match(/room-tools-control/g)?.length, 2)
  assert.match(
    css,
    /--theme-focus-ring:\s*rgb\(var\(--theme-accent-rgb\) \/ 0\.24\);/,
  )
  assert.match(
    css,
    /\.room-tools-control:focus\s*\{[^}]*outline:\s*none;[^}]*box-shadow:\s*0 0 0 2px var\(--theme-focus-ring\);/s,
  )
})

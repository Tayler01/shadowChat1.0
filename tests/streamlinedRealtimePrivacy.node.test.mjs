import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const overrideRoot = 'apps/streamlined/src-overrides'
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const file = path.join(directory, entry.name)
  return entry.isDirectory() ? files(file) : /\.tsx?$/.test(file) ? [file] : []
})

test('streamlined private transport cannot use client Broadcast or Presence publication', () => {
  const violations = []
  for (const file of files(overrideRoot)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const typingFile = file.replaceAll('\\','/').endsWith('/hooks/useTyping.ts')
    const hasLegacyTyping = source.text.includes('const useLegacyTyping =')
    const guardedLegacyTyping = typingFile && hasLegacyTyping
      && /export const useTyping = PRIVATE_REALTIME_ENABLED \? useAuthorizedTyping : useLegacyTyping/.test(source.text)
      && /import \{ PRIVATE_REALTIME_ENABLED \} from '\.\.\/\.\.\/\.\.\/\.\.\/src\/lib\/privateRealtimeChannels'/.test(source.text)
    if (hasLegacyTyping) {
      assert.ok(guardedLegacyTyping, 'Legacy typing is permitted only behind the explicit build-time private selector')
      const flags = readFileSync('src/lib/privateRealtimeChannels.ts','utf8')
      assert.match(flags, /export const PRIVATE_REALTIME_ENABLED = VITE_PRIVATE_REALTIME_ENABLED === 'true'/)
    }
    const visit = node => {
      // The flag-off branch is required during the coordinated client transition.
      // Runtime compatibility tests separately prove that the private selection
      // never joins, receives or publishes on the legacy typing topic.
      if (guardedLegacyTyping && ts.isVariableDeclaration(node) && node.name.getText(source) === 'useLegacyTyping') return
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'useLegacyTyping') violations.push(file + ': private path calls legacy typing')
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'type' && ts.isStringLiteral(node.initializer) && node.initializer.text === 'broadcast') violations.push(`${file}: Broadcast payload`)
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        if (node.expression.name.text === 'track') violations.push(`${file}: Presence publisher`)
        if (node.expression.name.text === 'on' && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === 'broadcast') violations.push(`${file}: member Broadcast listener`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(violations, [])
})

test('General, DM and typing retain canonical authorized database transports', () => {
  for (const [file, table] of [['hooks/useMessages.tsx', 'messages'], ['hooks/useDirectMessages.tsx', 'dm_messages'], ['hooks/useTyping.ts', 'typing_states']]) {
    const source = readFileSync(path.join(overrideRoot, file), 'utf8')
    assert.match(source, /['"]postgres_changes['"]/, file)
    assert.ok(source.includes(`table: '${table}'`), `${file}: canonical ${table} subscription`)
  }
})

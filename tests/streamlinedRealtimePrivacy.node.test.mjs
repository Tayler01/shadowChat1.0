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

test('streamlined member content cannot use client Broadcast or Presence publication', () => {
  const violations = []
  for (const file of files(overrideRoot)) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    const visit = node => {
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

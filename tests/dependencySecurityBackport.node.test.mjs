import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

test('constrained Zod collections reject oversized input before allocating per-item issues', () => {
  const { z } = require('zod')
  let visited = 0
  const schema = z.array(z.preprocess(value => { visited++; return value }, z.string())).max(2)
  assert.deepEqual(schema.parse(['photo', 'voice']), ['photo', 'voice'])
  visited = 0
  const result = schema.safeParse(Array(20_000).fill(42))
  assert.equal(result.success, false)
  assert.equal(visited, 0)
  assert.equal(result.error.issues.length, 1)
})

test('the installed selector parser includes the security backport and handles the advisory-sized selector', () => {
  const version = require('postcss-selector-parser/package.json').version
  const [major, minor, patch] = version.split('.').map(Number)
  assert.ok(major > 7 || (major === 7 && (minor > 1 || (minor === 1 && patch >= 6))) || (major === 6 && (minor > 1 || (minor === 1 && patch >= 5))), `Unpatched selector-parser ${version}`)
  const result = spawnSync(process.execPath, ['-e', `
    const parser = require('postcss-selector-parser');
    const input = '.a'.repeat(200000);
    const start = performance.now();
    const ast = parser().astSync(input);
    if (ast.first.nodes.length !== 200000) process.exit(2);
    process.stdout.write(JSON.stringify({ inputBytes: input.length, elapsedMs: Math.round(performance.now() - start) }));
  `], { encoding: 'utf8', timeout: 10_000 })
  assert.equal(result.error, undefined, `Selector parsing exceeded its isolated 10-second budget: ${result.error?.message}`)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(JSON.parse(result.stdout).inputBytes, 400000)
})

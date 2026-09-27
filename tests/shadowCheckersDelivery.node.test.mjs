import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { gzipSync, brotliCompressSync } from 'node:zlib'

test('Changing delivery compression versions the cache URL even when Unity reuses the filename', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'checkers-delivery-'))
  try {
    await mkdir(path.join(root, 'Build'))
    const names = ['same.loader.js', 'same.data.unityweb', 'same.framework.js.unityweb', 'same.wasm.unityweb']
    const payload = Buffer.from('Identical uncompressed Unity content')
    for (const name of names) await writeFile(path.join(root, 'Build', name), gzipSync(payload))
    await writeFile(path.join(root, 'index.html'), names.map(name => `"Build/${name}"`).join('\n'))
    const run = () => execFileSync(process.execPath, ['scripts/package-shadow-checkers-unity.mjs', root], { stdio: 'pipe' })
    run()
    const before = JSON.parse(await readFile(path.join(root, 'build-manifest.json'), 'utf8'))
    await writeFile(path.join(root, 'Build', names[3]), brotliCompressSync(payload))
    run()
    const after = JSON.parse(await readFile(path.join(root, 'build-manifest.json'), 'utf8'))
    assert.equal(before.codeUrl.split('?')[0], after.codeUrl.split('?')[0])
    assert.notEqual(before.codeUrl, after.codeUrl)
    assert.equal(before.dataUrl, after.dataUrl)
    const index = await readFile(path.join(root, 'index.html'), 'utf8')
    assert(index.includes(after.codeUrl))
    assert(!index.includes(before.codeUrl))
    assert.equal((index.match(/\?v=/g) || []).length, 4)
    run()
    assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), index)
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(tmpdir()))
    assert(path.basename(root).startsWith('checkers-delivery-'))
    await rm(root, { recursive: true, force: true })
  }
})

import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { processShadowPinVideoPoster } from '../netlify/functions/_shared/shadow-pin-media.mjs'

async function fixture({ failure, rowPatch = {} } = {}) {
  const original = await sharp({ create: { width: 2160, height: 3840, channels: 3, background: '#cf9f38' } })
    .jpeg({ quality: 92 }).toBuffer()
  let row = { id: 'pin', creator_id: 'alice', media_type: 'video', provider: 'bunny_stream',
    provider_asset_id: 'video', image_path: 'alice/poster.jpg', image_url: 'https://fixture.test/original',
    thumbnail_path: 'alice/poster.jpg', medium_path: 'alice/poster.jpg',
    thumbnail_url: 'https://fixture.test/original', medium_url: 'https://fixture.test/original',
    processing_status: 'processing', deleted_at: null, ...rowPatch }
  const files = new Map(), removed = [], downloads = []
  let uploads = 0
  const store = {
    download: async path => { downloads.push(path); return { data: new Blob([original]) } },
    upload: async (path, bytes, options) => {
      uploads++
      if (failure === 'second-upload' && uploads === 2) return { error: new Error('Upload failed') }
      assert.equal(options.contentType, 'image/webp')
      assert.equal(options.upsert, false)
      files.set(path, bytes)
      return {}
    },
    getPublicUrl: path => ({ data: { publicUrl: `https://fixture.test/${path}` } }),
    remove: async paths => { removed.push(...paths); paths.forEach(path => files.delete(path)); return {} },
  }
  const admin = { storage: { from: bucket => { assert.equal(bucket, 'shadow-pin'); return store } },
    from: table => {
      assert.equal(table, 'shadow_pin_images')
      const filters = []
      let update
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push(valueRow => valueRow[key] === value); return query },
        is: (key, value) => { filters.push(valueRow => valueRow[key] === value); return query },
        update: patch => { update = patch; return query },
        maybeSingle: async () => {
          if (update && failure === 'replacement') row = { ...row, image_path: 'alice/new-poster.jpg' }
          if (update && failure === 'deletion') row = { ...row, deleted_at: '2026-10-30T00:00:00Z' }
          if (!filters.every(matches => matches(row))) return { data: null }
          if (update) {
            row = { ...row, ...update }
            if (failure === 'response-lost') return { error: new Error('Response lost after commit') }
            if (failure === 'response-lost-deleted') {
              row.deleted_at = '2026-10-30T00:00:00Z'
              return { error: new Error('Response lost after commit') }
            }
            if (failure === 'response-lost-replaced') {
              row.provider_asset_id = 'replacement-video'
              return { error: new Error('Response lost after commit') }
            }
          }
          return { data: { ...row } }
        },
      }
      return query
    },
  }
  return { admin, original, files, removed, downloads, row: () => row,
    run: (extra = {}) => processShadowPinVideoPoster({ admin, userId: 'alice', id: 'pin', expectedBunnyVideoId: 'video', ...extra }) }
}

test('custom video posters get real bounded WebP derivatives without changing video state or original', async () => {
  const fx = await fixture()
  const result = await fx.run()
  assert.equal(result.processing_status, 'processing')
  assert.equal(result.image_path, 'alice/poster.jpg')
  assert.equal(result.image_url, 'https://fixture.test/original')
  const thumb = await sharp(fx.files.get(result.thumbnail_path)).metadata()
  const medium = await sharp(fx.files.get(result.medium_path)).metadata()
  assert.deepEqual([thumb.format, thumb.width, thumb.height], ['webp', 640, 1138])
  assert.deepEqual([medium.format, medium.width, medium.height], ['webp', 900, 1600])
  assert.ok(fx.files.get(result.thumbnail_path).length < fx.original.length)
  assert.deepEqual(fx.downloads, ['alice/poster.jpg'])
  await fx.run()
  assert.equal(fx.files.size, 2, 'Repeated completion does not create another derivative set')
})

for (const failure of ['second-upload', 'replacement', 'deletion']) {
  test(`${failure}: partial or stale poster derivatives are removed`, async () => {
    const fx = await fixture({ failure })
    await assert.rejects(fx.run)
    assert.equal(fx.files.size, 0)
    assert.equal(fx.removed.length, 2)
    assert.equal(fx.row().thumbnail_path, 'alice/poster.jpg')
  })
}

test('a lost publication response preserves the committed derivatives', async () => {
  const fx = await fixture({ failure: 'response-lost' })
  const result = await fx.run()
  assert.equal(fx.files.size, 2)
  assert.equal(fx.removed.length, 0)
  assert.equal(result.thumbnail_path, fx.row().thumbnail_path)
})

for (const failure of ['response-lost-deleted', 'response-lost-replaced']) {
  test(`${failure}: preserve referenced files but reject the stale caller session`, async () => {
    const fx = await fixture({ failure })
    await assert.rejects(fx.run, /Response lost after commit/)
    assert.equal(fx.files.size, 2)
    assert.equal(fx.removed.length, 0)
    assert.equal(fx.row().processing_status, 'processing')
  })
}

for (const image_path of ['bob/private.jpg', 'alice/../bob.jpg', 'alice/unsafe\\poster.jpg', 'https://attacker.test/poster.jpg', 'bunny:video:poster']) {
  test(`rejects non-owned or malformed source before Storage access: ${image_path}`, async () => {
    const fx = await fixture({ rowPatch: { image_path } })
    await assert.rejects(fx.run, /does not belong/)
    assert.deepEqual(fx.downloads, [])
    assert.equal(fx.files.size, 0)
  })
}

test('mismatched provider session cannot process or choose an arbitrary source URL', async () => {
  const fx = await fixture()
  await assert.rejects(() => fx.run({ expectedBunnyVideoId: 'other', sourceUrl: 'https://attacker.test/image' }), /does not match/)
  assert.deepEqual(fx.downloads, [])
})

function uploadRuntime(dependencies) {
  const file = 'src/features/shadow-pin/api/shadowPinApi.ts'
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const names = ['createShadowPinVideoUpload', 'markShadowPinVideoUploadFailed']
  const declarations = source.statements.filter(statement => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text))
  assert.equal(declarations.length, names.length)
  const javascript = ts.transpileModule(declarations.map(statement => statement.getText(source)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  return new Function(...Object.keys(dependencies), `${javascript}; return createShadowPinVideoUpload;`)(...Object.values(dependencies))
}

test('actual upload flow derives the canonical custom poster before TUS and returns completed variants', async () => {
  const events = []
  const run = uploadRuntime({
    validateShadowPinVideoFile: () => undefined,
    readVideoMetadata: async () => ({}), createVideoPosterFile: async () => ({ type: 'image/jpeg', size: 100 }),
    uploadShadowPinImage: async () => ({ path: 'alice/poster.jpg', publicUrl: 'https://fixture.test/original' }),
    callShadowPinVideoFunction: async payload => {
      events.push(payload.action)
      return payload.action === 'create-upload'
        ? { image: { id: 'pin' }, bunnyVideoId: 'video' }
        : { image: { id: 'pin', thumbnail_path: 'alice/derived/thumbnail.webp' } }
    },
    callShadowPinMediaFunction: async payload => {
      events.push(payload.action)
      assert.deepEqual(payload, { action: 'process-video-poster', id: 'pin', expectedBunnyVideoId: 'video' })
    },
    uploadBunnyTusFile: async () => { events.push('tus') },
    attachViewerImageHeart: value => value,
  })
  const result = await run('category', 'Fixture', '', { name: 'fixture.mp4', size: 1000, type: 'video/mp4' })
  assert.deepEqual(events, ['create-upload', 'process-video-poster', 'tus', 'complete-upload'])
  assert.equal(result.thumbnail_path, 'alice/derived/thumbnail.webp')
})

test('poster failure marks only its exact still-live video session failed and prevents TUS', async () => {
  const filters = [], events = []
  const query = {
    update: () => query,
    eq: (key, value) => { filters.push([key, value]); return query },
    is: (key, value) => { filters.push([key, value]); return query },
  }
  const run = uploadRuntime({
    validateShadowPinVideoFile: () => undefined,
    readVideoMetadata: async () => ({}), createVideoPosterFile: async () => ({ type: 'image/jpeg', size: 100 }),
    uploadShadowPinImage: async () => ({ path: 'alice/poster.jpg', publicUrl: 'https://fixture.test/original' }),
    callShadowPinVideoFunction: async () => ({ image: { id: 'pin' }, bunnyVideoId: 'video' }),
    callShadowPinMediaFunction: async () => { throw new Error('Cover changed') },
    uploadBunnyTusFile: async () => { events.push('tus') },
    getWorkingClient: async () => ({ from: () => query }),
    attachViewerImageHeart: value => value,
  })
  await assert.rejects(() => run('category', 'Fixture', '', { name: 'fixture.mp4', size: 1000, type: 'video/mp4' }), /Cover changed/)
  assert.deepEqual(events, [])
  assert.deepEqual(filters, [['id', 'pin'], ['provider_asset_id', 'video'], ['deleted_at', null]])
})

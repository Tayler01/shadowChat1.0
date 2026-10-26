import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import ts from 'typescript'
import {
  createDerivatives,
  MAX_IMAGE_BYTES,
  processShadowPinDraftImage,
  processShadowPinRow,
  fetchRemoteImage,
  authenticateAuthorization,
} from '../netlify/functions/_shared/shadow-pin-media.mjs'

// Execute the actual isolated declarations without starting an Edge server,
// loading a whole React tree, or substituting a second sanitizer implementation.
function runtimeDeclarations(file, names) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const declarations = source.statements.filter(statement =>
    (ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text))
    || (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(source)))))
  assert.equal(declarations.length, names.length, `Missing runtime declarations in ${file}`)
  const javascript = ts.transpileModule(declarations.map(statement => statement.getText(source)).join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  return new Function('URL', `${javascript}\nreturn { ${names.join(', ')} };`)(URL)
}

for (const file of ['src/features/shadow-pin/ShadowPin.tsx', 'apps/streamlined/src-overrides/features/shadow-pin/ShadowPin.tsx']) {
  const embed = runtimeDeclarations(file, [
    'EXTERNAL_RICH_EMBED_SCRIPT_URLS', 'isExternalRichEmbedProvider', 'escapeHtmlAttribute',
    'getExternalRichEmbedPermalink', 'getExternalRichEmbedMarkup', 'getExternalRichEmbedSrcDoc',
  ])
  test(`${file}: rich embeds ignore malicious stored HTML and retain official provider rendering`, () => {
    for (const [provider, sourceUrl, canonical, script] of [
      ['x', 'https://twitter.com/member/status/123456789', 'https://x.com/i/status/123456789', 'https://platform.x.com/widgets.js'],
      ['instagram', 'https://www.instagram.com/member/reel/AbC12/', 'https://www.instagram.com/reel/AbC12/', 'https://www.instagram.com/embed.js'],
    ]) {
      for (const html of [
        '<blockquote class="twitter-tweet instagram-media"><script>attackerMarker()</script ></blockquote>',
        '<blockquote class="twitter-tweet instagram-media"><scr<script>ipt>attackerMarker()</script></blockquote>',
        '<blockquote class="twitter-tweet instagram-media" onclick="attackerMarker()"><img src=x onerror="attackerMarker()"></blockquote>',
        '<blockquote class="twitter-tweet instagram-media"><svg onload="attackerMarker()"></svg></blockquote>',
      ]) {
        const doc = embed.getExternalRichEmbedSrcDoc({ provider, source_url: sourceUrl, provider_payload: { preview: { oembed: { html } } } })
        assert.ok(doc.includes(canonical), 'Canonical permalink retained')
        assert.ok(doc.includes(`src="${script}"`), 'Official provider script retained')
        assert.ok(!doc.includes('attackerMarker') && !doc.includes('onerror='))
        assert.equal((doc.match(/<script\b/g) || []).length, 2, 'Only the two application-owned scripts remain')
      }
    }
  })
  test(`${file}: rich embeds reject wrong hosts, credentials and executable URL schemes`, () => {
    for (const sourceUrl of [
      'https://x.com.evil.test/status/123456789', 'https://evilx.com/status/123456789',
      'javascript://x.com/%0AattackerMarker()', 'ftp://x.com/status/123456789',
      'https://attacker:secret@x.com/status/123456789',
    ]) assert.equal(embed.getExternalRichEmbedSrcDoc({ provider: 'x', source_url: sourceUrl }), '', sourceUrl)
  })
  test(`${file}: valid X profile and list timelines retain the official timeline renderer`, () => {
    for (const sourceUrl of ['https://x.com/Interior', 'https://twitter.com/i/lists/123456789']) {
      const doc = embed.getExternalRichEmbedSrcDoc({
        provider: 'x', source_url: sourceUrl,
        provider_payload: { oembed: { html: '<a class="twitter-timeline" onclick="attackerMarker()" href="https://evil.test">Injected</a>' } },
      })
      assert.ok(doc.includes(`class="twitter-timeline"`))
      assert.ok(doc.includes(`href="${sourceUrl}"`))
      assert.ok(doc.includes('https://platform.x.com/widgets.js'))
      assert.ok(!doc.includes('attackerMarker') && !doc.includes('evil.test'))
    }
  })
}

test('Bunny playback classification requires an HTTPS provider hostname boundary', () => {
  const { isBunnyEmbed } = runtimeDeclarations('src/features/entertainment/shado-tv/ShadoTvStreamFrame.tsx', ['isBunnyEmbed'])
  for (const url of ['https://mediadelivery.net/embed/1/2', 'https://iframe.mediadelivery.net/embed/1/2']) assert.equal(isBunnyEmbed(url), true)
  for (const url of ['https://evilmediadelivery.net/embed/1/2', 'https://mediadelivery.net.evil.test/embed/1/2', 'http://iframe.mediadelivery.net/embed/1/2', 'https://user:pass@iframe.mediadelivery.net/embed/1/2']) assert.equal(isBunnyEmbed(url), false)
})

for (const [file, name] of [
  ['netlify/functions/_shared/shadow-pin-media.mjs', 'decodeHtmlValue'],
  ['supabase/functions/link-preview/index.ts', 'decodeHtml'],
  ['supabase/functions/shadow-pin-video/index.ts', 'decodeHtml'],
  ['services/news-scraper/src/index.mjs', 'stripHtml'],
]) {
  test(`${file}: metadata entities decode once, preserving literal encoded text`, () => {
    const decode = runtimeDeclarations(file, [name])[name]
    assert.equal(decode('A &amp; B &quot;quoted&quot; &#39; &lt;tag&gt;'), 'A & B "quoted" \' <tag>')
    assert.equal(decode('&amp;lt; &amp;quot; &amp;#39;'), '&lt; &quot; &#39;')
  })
}

test('ShadowPin rejects SVG/HTML bytes before selecting an image decoder', async () => {
  for (const bytes of [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>',
    '<html><body>not an image</body></html>',
  ]) {
    await assert.rejects(() => createDerivatives(Buffer.from(bytes)), /image bytes are supported/)
  }
})

test('legacy member-media imports download with caller authority and never anonymously fetch the object', async () => {
  const previous = process.env.SUPABASE_URL
  process.env.SUPABASE_URL = 'https://fixture.supabase.co'
  const calls = []
  const userClient = { storage: { from: bucket => ({ download: async objectPath => {
    calls.push({ bucket, objectPath })
    return { data: new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), error: null }
  } }) } }
  try {
    const source = 'https://fixture.supabase.co/storage/v1/object/public/chat-uploads/bob/photo.jpg'
    const result = await fetchRemoteImage(source, userClient)
    assert.equal(result.contentType, 'image/jpeg')
    assert.deepEqual(calls, [{ bucket: 'chat-uploads', objectPath: 'bob/photo.jpg' }])
    await assert.rejects(() => fetchRemoteImage(source), /Authenticated media access/)
    const denied = { storage: { from: () => ({ download: async () => ({ error: new Error('RLS denied') }) }) } }
    await assert.rejects(() => fetchRemoteImage(source, denied), /no longer have access/)
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_URL
    else process.env.SUPABASE_URL = previous
  }
})

test('a forged owned Pin row cannot make the service role download another creator object', async () => {
  const query = { select: () => query, eq: () => query, is: () => query,
    maybeSingle: async () => ({ data: { id: 'pin', creator_id: 'alice', image_path: 'bob/private.jpg' } }) }
  const admin = { from: () => query, get storage() { throw new Error('service-role download must not run') } }
  await assert.rejects(() => processShadowPinRow({ admin, targetType: 'image', id: 'pin', userId: 'alice' }), /does not belong/)
})

test('a valid Auth token is insufficient for deleted or deleting members to run privileged media work', async () => {
  const admin = { auth: { getUser: async () => ({ data: { user: { id: 'alice' } } }) }, rpc: async () => ({ data: false }) }
  assert.equal(await authenticateAuthorization('Bearer still-valid-jwt', admin), null)
  admin.rpc = async () => ({ data: true })
  assert.deepEqual(await authenticateAuthorization('Bearer active-jwt', admin), { id: 'alice' })
})

test('ShadowPin enforces actual image bytes instead of trusting declared size', async () => {
  const bytes = Buffer.alloc(MAX_IMAGE_BYTES + 1)
  Buffer.from([0xff, 0xd8, 0xff]).copy(bytes)
  await assert.rejects(() => createDerivatives(bytes), /15MB or smaller/)
})

test('ShadowPin still creates usable thumbnails for every supported raster format', async () => {
  for (const format of ['jpeg', 'png', 'webp', 'gif']) {
    const original = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#cf9f38' } })
      .toFormat(format).toBuffer()
    const result = await createDerivatives(original)
    const thumbnail = await sharp(result.thumbnail).metadata()
    const medium = await sharp(result.medium).metadata()
    assert.deepEqual({ width: result.width, height: result.height }, { width: 16, height: 12 })
    assert.equal(thumbnail.format, 'webp')
    assert.equal(medium.format, 'webp')
  }
})

test('a foreign draft path is rejected before any service-role read', async () => {
  const admin = new Proxy({}, { get: () => { throw new Error('unexpected service-role access') } })
  await assert.rejects(() => processShadowPinDraftImage({
    admin, userId: 'alice', draftId: 'alice-draft', storagePath: 'bob/private/original.png',
    contentType: 'image/png', sizeBytes: 1,
  }), /Draft storage path is invalid/)
})

test('an unavailable draft is rejected before Storage downloads', async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) }
  const admin = {
    from: () => query,
    get storage() { throw new Error('unexpected Storage read') },
  }
  await assert.rejects(() => processShadowPinDraftImage({
    admin, userId: 'alice', draftId: 'missing', storagePath: 'alice/missing/original.png',
    contentType: 'image/png', sizeBytes: 1,
  }), /Creator draft is unavailable/)
})

import assert from 'node:assert/strict'
import { BUNNY_PRIVATE_MEDIA_TTL_SECONDS, signBunnyPrivateMedia } from './bunny-private-media.ts'

const videoId = '32d140e2-e4f4-4eec-9d53-20371e9be607'
const config = {
  libraryId: '759', videoId, pullZoneUrl: 'https://fixture.b-cdn.net',
  tokenSecurityKey: 'test-token-security-key-only', nowSeconds: 1_700_000_000,
}

// Fixed results independently calculated with Node crypto from Bunny's published
// embed SHA256 and current Advanced HS256 signer (no IP/query parameters).
// https://github.com/BunnyWay/BunnyCDN.TokenAuthentication/blob/master/nodejs/token.js
const embedToken = '76eee1a9bf9c8ee305d4d68426c87727e43e7bcb8fed928287b68a5f87e8a0ca'
const cdnToken = 'HS256-GlCUG7nBTafQGXVMXEEtwHQqqcihu-nfqU-A5L9b1LY'
const directory = `/${videoId}/`
const prefix = `${config.pullZoneUrl}/bcdn_token=${cdnToken}&token_path=${encodeURIComponent(directory)}&expires=1700000300`

Deno.test('Bunny embed token matches the SHA256 vector and only uses the fixed player origin', async () => {
  const result = await signBunnyPrivateMedia(config, { kind: 'embed' })
  assert.deepEqual(result, {
    url: `https://player.mediadelivery.net/embed/759/${videoId}?token=${embedToken}&expires=1700000300`,
    expiresAt: 1_700_000_300_000,
  })
  assert.equal(result.url.includes(config.tokenSecurityKey), false)
  assert.equal(BUNNY_PRIVATE_MEDIA_TTL_SECONDS, 300)
})

Deno.test('Bunny CDN directory token matches the current HMAC vector and covers exactly one video directory', async () => {
  for (const fileName of ['playlist.m3u8', 'play_720p.mp4', 'thumbnail.jpg', 'thumbnail_5.jpg', 'preview.webp', 'preview_hq.mp4', 'custom-image.png']) {
    const result = await signBunnyPrivateMedia(config, { kind: 'cdn', fileName })
    assert.deepEqual(result, { url: `${prefix}${directory}${fileName}`, expiresAt: 1_700_000_300_000 })
    assert.equal(result.url.includes(config.tokenSecurityKey), false)
    const tokenParameters = new URLSearchParams(new URL(result.url).pathname.split('/')[1])
    assert.equal(tokenParameters.get('token_path'), directory)
    assert.equal(tokenParameters.get('expires'), '1700000300')
    assert.equal(tokenParameters.get('bcdn_token'), cdnToken)
  }
})

Deno.test('relative HLS child playlists and segments retain the path token', async () => {
  const playlist = await signBunnyPrivateMedia(config, { kind: 'cdn', fileName: 'playlist.m3u8' })
  const rendition = new URL('720p/video.m3u8', playlist.url)
  const segment = new URL('segment-00001.ts', rendition)
  assert.equal(rendition.href, `${prefix}${directory}720p/video.m3u8`)
  assert.equal(segment.href, `${prefix}${directory}720p/segment-00001.ts`)
  assert.equal(new URL('../playlist.m3u8', rendition).href, playlist.url)
})

Deno.test('a different video or expiry receives a different token', async () => {
  const other = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
  for (const resource of [{ kind: 'embed' }, { kind: 'cdn', fileName: 'playlist.m3u8' }] as const) {
    const baseline = await signBunnyPrivateMedia(config, resource)
    const changedVideo = await signBunnyPrivateMedia({ ...config, videoId: other }, resource)
    const changedTime = await signBunnyPrivateMedia({ ...config, nowSeconds: config.nowSeconds + 1 }, resource)
    assert.notEqual(changedVideo.url.replaceAll(other, videoId).replaceAll(encodeURIComponent(`/${other}/`), encodeURIComponent(directory)), baseline.url)
    assert.notEqual(changedTime.url.replaceAll('1700000301', '1700000300'), baseline.url)
    assert.equal(changedTime.expiresAt - baseline.expiresAt, 1000)
  }
})

Deno.test('configured custom CDN origins are used exactly and a single trailing slash is normalized', async () => {
  const result = await signBunnyPrivateMedia({ ...config, pullZoneUrl: 'https://media.example.com/' }, { kind: 'cdn', fileName: 'thumbnail.jpg' })
  assert.equal(new URL(result.url).origin, 'https://media.example.com')
  assert.equal(result.url.startsWith('https://media.example.com/bcdn_token='), true)
})

Deno.test('Bunny signer rejects unsafe or normalized CDN authorities without echoing inputs', async () => {
  for (const pullZoneUrl of [
    '', 'http://fixture.b-cdn.net', '//fixture.b-cdn.net', 'https://fixture.b-cdn.net/other',
    'https://fixture.b-cdn.net/path/..', 'https://fixture.b-cdn.net/%2e%2e',
    'https://fixture.b-cdn.net:8443', 'https://fixture.b-cdn.net:443',
    'https://user:private-value@fixture.b-cdn.net', 'https://fixture.b-cdn.net?token=secret-value',
    'https://fixture.b-cdn.net#secret-value', 'https://127.0.0.1', 'https://[::1]',
    'https://localhost', 'https://service.local', 'https://service.internal',
    'https://fixture.b-cdn.net\\other', 'https://fixture.b-cdn.net\n',
  ]) {
    await assert.rejects(() => signBunnyPrivateMedia({ ...config, pullZoneUrl }, { kind: 'cdn', fileName: 'thumbnail.jpg' }), {
      message: 'Bunny media origin is not configured correctly.',
    })
  }
})

Deno.test('Bunny signer rejects traversal, query injection, URLs, unbounded names and non-media files', async () => {
  for (const fileName of [
    '../thumbnail.jpg', '/thumbnail.jpg', '..\\thumbnail.jpg', '%2e%2e%2fthumbnail.jpg',
    'thumbnail.jpg?token=foo', 'thumbnail.jpg#foo', 'https://other.example/thumbnail.jpg',
    'thumbnail..jpg', 'name\n.jpg', 'a'.repeat(200) + '.jpg', '.jpg', 'key.json', 'original',
  ]) {
    await assert.rejects(() => signBunnyPrivateMedia(config, { kind: 'cdn', fileName }), { message: 'Invalid Bunny media file.' })
  }
})

Deno.test('Bunny signer rejects malformed library and asset identities', async () => {
  for (const libraryId of ['', '0', '0759', '../759', '759?other=1', '759/path', '-1']) {
    await assert.rejects(() => signBunnyPrivateMedia({ ...config, libraryId }, { kind: 'embed' }), { message: 'Invalid Bunny media identity.' })
  }
  for (const badId of ['', videoId + '/..', videoId + '?x=1', videoId.replaceAll('-', ''), 'https://video.example']) {
    await assert.rejects(() => signBunnyPrivateMedia({ ...config, videoId: badId }, { kind: 'embed' }), { message: 'Invalid Bunny media identity.' })
  }
})

Deno.test('Bunny signer rejects missing/malformed signing keys with a fixed secret-free error', async () => {
  for (const tokenSecurityKey of ['', 'short', config.tokenSecurityKey + '\n', 'x'.repeat(513)]) {
    await assert.rejects(() => signBunnyPrivateMedia({ ...config, tokenSecurityKey }, { kind: 'embed' }), {
      message: 'Bunny media token security key is not configured correctly.',
    })
  }
})

Deno.test('Bunny signer accepts only safe epoch-second clocks and has no caller-controlled TTL', async () => {
  for (const nowSeconds of [NaN, Infinity, -1, 1.25, 1_700_000_000_000, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(() => signBunnyPrivateMedia({ ...config, nowSeconds }, { kind: 'embed' }), { message: 'Invalid Bunny media signing time.' })
  }
  const result = await signBunnyPrivateMedia({ ...config, expiresIn: 86_400 } as typeof config, { kind: 'embed' })
  assert.equal(result.expiresAt, (config.nowSeconds + 300) * 1000)
})

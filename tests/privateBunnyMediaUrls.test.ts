import { isBunnyMediaCandidate, resolveBunnyMediaSource } from '../src/lib/privateBunnyMediaUrls'

jest.mock('./mocks/env', () => ({ VITE_BUNNY_STREAM_CDN_ORIGIN: 'https://video.example.test' }))
const asset = '10000000-0000-0000-0000-000000000001'
const source = `https://private.b-cdn.net/${asset}/play_720p.mp4`
const now = 1_000_000
const expiresAt = now + 300_000
const cdnUrl = `https://private.b-cdn.net/bcdn_token=HS256-valid&token_path=%2F${asset}%2F&expires=1300/${asset}/play_720p.mp4`
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(now) })
afterEach(() => jest.restoreAllMocks())

test('recognizes exact Bunny hosts and custom configured CDN only', () => {
  expect(isBunnyMediaCandidate(source)).toBe(true)
  expect(isBunnyMediaCandidate(`https://video.example.test/${asset}/play.mp4`)).toBe(true)
  expect(isBunnyMediaCandidate('https://notmediadelivery.net/embed/123/id')).toBe(false)
  expect(isBunnyMediaCandidate('https://private.b-cdn.net.attacker.test/file')).toBe(false)
})
test('uses server expiration and a signed resource matching the requested asset', async () => {
  const invoke = jest.fn().mockResolvedValue({ data: { ok: true, managed: true, url: cdnUrl, expiresAt }, error: null })
  expect(await resolveBunnyMediaSource(source, invoke)).toEqual({ url: cdnUrl, expiresAt })
  expect(invoke).toHaveBeenCalledWith({ action: 'resolve-private-media', sourceUrl: source })
})
test.each([
  { error: new Error('denied'), data: null },
  { error: null, data: { ok: true, managed: true, url: source, expiresAt } },
  { error: null, data: { ok: true, managed: true, url: cdnUrl.replace('private.b-cdn.net', 'attacker.test'), expiresAt } },
  { error: null, data: { ok: true, managed: true, url: cdnUrl, expiresAt: now + 600_000 } },
  { error: null, data: { ok: true, managed: true, url: cdnUrl, expiresAt: now - 1 } },
])('never falls back to unsigned media after denied/invalid signing: %#', async result => {
  await expect(resolveBunnyMediaSource(source, async () => result)).rejects.toThrow()
})
test('explicit server external classification preserves unrelated provider content', async () => {
  expect(await resolveBunnyMediaSource(source, async () => ({ data: { ok: true, managed: false }, error: null }))).toEqual({ url: source, expiresAt: null })
})
test('validates embed identity and signature expiration', async () => {
  const original = `https://iframe.mediadelivery.net/embed/123/${asset}`
  const signed = `https://player.mediadelivery.net/embed/123/${asset}?token=${'a'.repeat(64)}&expires=1300`
  expect(await resolveBunnyMediaSource(original, async () => ({ data: { ok: true, managed: true, url: signed, expiresAt }, error: null }))).toEqual({ url: signed, expiresAt })
})

jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
import {
  invalidatePrivateMediaUrls,
  parsePrivateMediaUrl,
  requiresPrivateMediaUrl,
  resolvePrivateMediaUrl,
} from '../src/lib/privateMediaUrls'
import { getWorkingClient } from '../apps/streamlined/src-overrides/lib/supabase'
import { PERSONAL_BLOCKS_CHANGED_EVENT } from '../src/lib/personalBlocking'

jest.mock('./mocks/env', () => ({
  VITE_PRIVATE_MEDIA_ENABLED: 'true',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
}))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({
  getWorkingClient: jest.fn(),
  supabase: { auth: { onAuthStateChange: jest.fn() } },
}))

const original = 'https://example.supabase.co/storage/v1/object/public/chat-uploads/alice/photo.png'
const sign = jest.fn()
const invoke = jest.fn()
const getSession = jest.fn()
const from = jest.fn(() => ({ createSignedUrl: sign }))
const session = (id = 'alice', token = `${id}-token`) => ({
  user: { id }, access_token: token, expires_at: Math.floor(Date.now() / 1000) + 3600,
})

beforeEach(() => {
  invalidatePrivateMediaUrls()
  from.mockClear()
  sign.mockReset().mockImplementation(async path => ({
    data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/chat-uploads/${path}?token=signed-${sign.mock.calls.length}` }, error: null,
  }))
  getSession.mockReset().mockResolvedValue({ data: { session: session() }, error: null })
  invoke.mockReset()
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ auth: { getSession }, storage: { from }, functions: { invoke } })
})

afterEach(() => { jest.restoreAllMocks() })

test('parses legacy public object URLs, encoded filenames and image transforms', () => {
  expect(parsePrivateMediaUrl(original)).toEqual({ bucket: 'chat-uploads', path: 'alice/photo.png' })
  expect(parsePrivateMediaUrl('https://example.supabase.co/storage/v1/render/image/public/shadow-pin/images/a%20b.png?width=480&height=854&quality=76&resize=contain')).toEqual({
    bucket: 'shadow-pin', path: 'images/a b.png', transform: { width: 480, height: 854, quality: 76, resize: 'contain' },
  })
})

test.each([
  'https://attacker.supabase.co/storage/v1/object/public/chat-uploads/alice/photo.png',
  'https://example.supabase.co.attacker.test/storage/v1/object/public/chat-uploads/alice/photo.png',
  'https://example.supabase.co/storage/v1/object/public/avatars/alice/photo.png',
  'blob:http://localhost/image',
])('never asks our backend to sign unrelated media: %s', async url => {
  expect(requiresPrivateMediaUrl(url)).toBe(false)
  expect(await resolvePrivateMediaUrl(url)).toBe(url)
  expect(getSession).not.toHaveBeenCalled()
})

test.each([
  'https://user:secret@example.supabase.co/storage/v1/object/public/chat-uploads/alice/photo.png',
  'https://example.supabase.co/storage/v1/object/public/chat-uploads/alice/%2f..%2fbob/photo.png',
  'https://example.supabase.co/storage/v1/object/public/chat-uploads/alice/%00.png',
  'https://example.supabase.co/storage/v1/render/image/public/chat-uploads/alice/photo.png?width=999999',
])('fails closed for malformed member URLs: %s', async url => {
  expect(requiresPrivateMediaUrl(url)).toBe(true)
  await expect(resolvePrivateMediaUrl(url)).rejects.toThrow()
  expect(sign).not.toHaveBeenCalled()
})

test('deduplicates requests and keeps bearer URLs in an expiring session-scoped cache', async () => {
  const urls = await Promise.all([resolvePrivateMediaUrl(original), resolvePrivateMediaUrl(original)])
  expect(urls[0]).toBe(urls[1])
  expect(sign).toHaveBeenCalledTimes(1)
  expect(sign).toHaveBeenCalledWith('alice/photo.png', 600, {})
  await resolvePrivateMediaUrl(original)
  expect(sign).toHaveBeenCalledTimes(1)
  const later = Date.now() + 571_000
  jest.spyOn(Date, 'now').mockReturnValue(later)
  await resolvePrivateMediaUrl(original)
  expect(sign).toHaveBeenCalledTimes(2)
})

test('signs again after an account/token change and after a personal block', async () => {
  await resolvePrivateMediaUrl(original)
  getSession.mockResolvedValue({ data: { session: session('bob') }, error: null })
  await resolvePrivateMediaUrl(original)
  expect(sign).toHaveBeenCalledTimes(2)
  getSession.mockResolvedValue({ data: { session: session('bob', 'refreshed-bob-token') }, error: null })
  await resolvePrivateMediaUrl(original)
  expect(sign).toHaveBeenCalledTimes(3)
  window.dispatchEvent(new Event(PERSONAL_BLOCKS_CHANGED_EVENT))
  await resolvePrivateMediaUrl(original)
  expect(sign).toHaveBeenCalledTimes(4)
})

test('Bunny renews against its five-minute provider expiration and invalidates on block', async () => {
  const asset = '10000000-0000-0000-0000-000000000001'
  const source = `https://private.b-cdn.net/${asset}/play.mp4`
  const now = 1_000_000
  const clock = jest.spyOn(Date, 'now').mockReturnValue(now)
  invoke.mockImplementation(async () => {
    const expires = Math.floor(Date.now() / 1000) + 300
    return { error: null, data: { ok: true, managed: true, expiresAt: expires * 1000,
      url: `https://private.b-cdn.net/bcdn_token=HS256-valid&token_path=%2F${asset}%2F&expires=${expires}/${asset}/play.mp4` } }
  })
  expect(requiresPrivateMediaUrl(source)).toBe(true)
  await Promise.all([resolvePrivateMediaUrl(source), resolvePrivateMediaUrl(source)])
  expect(invoke).toHaveBeenCalledTimes(1)
  clock.mockReturnValue(now + 271_000)
  await resolvePrivateMediaUrl(source)
  expect(invoke).toHaveBeenCalledTimes(2)
  window.dispatchEvent(new Event(PERSONAL_BLOCKS_CHANGED_EVENT))
  invoke.mockResolvedValue({ data: null, error: new Error('blocked') })
  await expect(resolvePrivateMediaUrl(source)).rejects.toThrow('no longer have access')
  expect(sign).not.toHaveBeenCalled()
})

test('does not expose a public fallback after authentication or RLS denial', async () => {
  getSession.mockResolvedValueOnce({ data: { session: null }, error: null })
  await expect(resolvePrivateMediaUrl(original)).rejects.toThrow('Sign in')
  expect(sign).not.toHaveBeenCalled()
  sign.mockResolvedValue({ data: null, error: new Error('403') })
  await expect(resolvePrivateMediaUrl(original)).rejects.toThrow('no longer have access')
})

test('a response completed after access invalidation cannot repopulate the cache', async () => {
  let finish: (value: unknown) => void = () => undefined
  sign.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const result = resolvePrivateMediaUrl(original)
  for (let i = 0; i < 8 && !sign.mock.calls.length; i += 1) await Promise.resolve()
  expect(sign).toHaveBeenCalledTimes(1)
  invalidatePrivateMediaUrls()
  finish({ data: { signedUrl: original.replace('/public/', '/sign/') + '?token=late' }, error: null })
  await expect(result).rejects.toThrow('Media access changed')
})

test('transforms and download requests use authenticated Storage signing options', async () => {
  const url = original.replace('/object/public/', '/render/image/public/') + '?width=480&resize=contain'
  await resolvePrivateMediaUrl(url, { download: 'photo.png' })
  expect(sign).toHaveBeenCalledWith('alice/photo.png', 600, { transform: { width: 480, resize: 'contain' }, download: 'photo.png' })
})

test.each([
  original,
  original.replace('example.supabase.co', 'evil.example'),
  original.replace('/public/', '/sign/').replace('photo.png', 'other.png') + '?token=wrong',
])('rejects unexpected signing responses: %s', async signedUrl => {
  sign.mockResolvedValue({ data: { signedUrl }, error: null })
  await expect(resolvePrivateMediaUrl(original)).rejects.toThrow('invalid URL')
})

jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
import { webcrypto } from 'node:crypto'
import { prepareMessageMedia } from '../src/lib/privateMediaCopies'
import { getWorkingClient } from '../apps/streamlined/src-overrides/lib/supabase'

jest.mock('./mocks/env', () => ({ VITE_PRIVATE_MEDIA_ENABLED: 'true', VITE_SUPABASE_URL: 'https://example.supabase.co' }))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ getWorkingClient: jest.fn(), supabase: { auth: { onAuthStateChange: jest.fn() } } }))
const copy = jest.fn()
const info = jest.fn()
const getSession = jest.fn()
const from = jest.fn(() => ({ copy, info }))
const url = (bucket: string, path: string) => `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}`
const base = { senderId: 'alice', clientMessageId: 'message-1', messageType: 'image', content: '' }

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto })
  copy.mockReset().mockResolvedValue({ data: {}, error: null })
  info.mockReset().mockResolvedValue({ data: { name: 'copy' }, error: null })
  from.mockClear()
  getSession.mockReset().mockResolvedValue({ data: { session: { user: { id: 'alice' }, access_token: 'alice-token' } }, error: null })
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ auth: { getSession }, storage: { from } })
})

test('forwards another member attachment through actor-authorized Storage.copy into an independent sender object', async () => {
  const result = await prepareMessageMedia({ ...base, fileUrl: url('chat-uploads', 'bob/picture.jpg') })
  expect(from).toHaveBeenCalledWith('chat-uploads')
  expect(copy).toHaveBeenCalledWith('bob/picture.jpg', expect.stringMatching(/^alice\/forwarded\/message-1\/[a-f0-9]{64}\.jpg$/), { destinationBucket: 'chat-uploads' })
  expect(result.fileUrl).toMatch(/object\/public\/chat-uploads\/alice\/forwarded\/message-1\//)
})

test('copies even the sender own Pin so later original removal cannot break the message', async () => {
  await prepareMessageMedia({ ...base, fileUrl: url('shadow-pin', 'alice/pin.png') })
  expect(copy).toHaveBeenCalledTimes(1)
})

test('normal uploads stay in place and signed inputs become durable token-free references', async () => {
  const original = url('chat-uploads', 'alice/image.jpg')
  expect((await prepareMessageMedia({ ...base, fileUrl: original.replace('/public/', '/sign/') + '?token=secret' })).fileUrl).toBe(original)
  expect(copy).not.toHaveBeenCalled()
})

test('copies file, thumbnail and voice source while deduplicating identical source URLs', async () => {
  const fileUrl = url('message-media', 'bob/voice.webm')
  const result = await prepareMessageMedia({ ...base, messageType: 'audio', content: fileUrl, fileUrl,
    thumbnailUrl: url('chat-uploads', 'bob/cover.webp') })
  expect(copy).toHaveBeenCalledTimes(2)
  expect(result.content).toBe(result.fileUrl)
  expect(result.thumbnailUrl).toContain('/alice/forwarded/')
})

test('a denied source cannot fall back to its legacy public URL', async () => {
  copy.mockResolvedValue({ error: new Error('row-level security denied') })
  await expect(prepareMessageMedia({ ...base, fileUrl: url('chat-uploads', 'bob/secret.jpg') })).rejects.toThrow('denied')
  expect(info).not.toHaveBeenCalled()
})

test('an interrupted copy reuses only an existing actor-readable deterministic destination', async () => {
  copy.mockResolvedValue({ error: { statusCode: '409', message: 'exists' } })
  const request = { ...base, fileUrl: url('shadow-pin', 'bob/pin.jpg') }
  expect((await prepareMessageMedia(request)).fileUrl).toContain('/alice/forwarded/')
  info.mockResolvedValue({ data: null, error: new Error('not found') })
  await expect(prepareMessageMedia(request)).rejects.toMatchObject({ statusCode: '409' })
})

test('account changes and expired sessions cannot send copies as the former member', async () => {
  getSession.mockResolvedValue({ data: { session: { user: { id: 'bob' }, access_token: 'bob-token' } } })
  await expect(prepareMessageMedia({ ...base, fileUrl: url('chat-uploads', 'bob/picture.jpg') })).rejects.toThrow('Sign in')
  expect(copy).not.toHaveBeenCalled()
})

test('external attachments never reach our storage copy endpoint', async () => {
  const fileUrl = 'https://example.org/picture.jpg'
  expect((await prepareMessageMedia({ ...base, fileUrl })).fileUrl).toBe(fileUrl)
  expect(getSession).not.toHaveBeenCalled()
  expect(copy).not.toHaveBeenCalled()
})

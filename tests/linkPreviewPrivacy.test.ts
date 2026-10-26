jest.mock('../src/lib/supabase', () => jest.requireMock('../apps/streamlined/src-overrides/lib/supabase'))
import { fetchLinkPreview } from '../apps/streamlined/src-overrides/lib/linkPreview'
import { ensureSession, getWorkingClient } from '../apps/streamlined/src-overrides/lib/supabase'

jest.mock('./mocks/env', () => ({ VITE_PRIVATE_MEDIA_ENABLED: 'true', VITE_SUPABASE_URL: 'https://example.supabase.co' }))
jest.mock('../apps/streamlined/src-overrides/lib/supabase', () => ({ ensureSession: jest.fn(), getWorkingClient: jest.fn(), supabase: { auth: { onAuthStateChange: jest.fn() } } }))
let accountId = 'alice'
const getSession = jest.fn(async () => ({ data: { session: { user: { id: accountId } } }, error: null }))
const invoke = jest.fn()

beforeEach(() => {
  accountId = 'alice'
  localStorage.clear()
  invoke.mockReset().mockImplementation(async () => ({ data: { preview: { url: 'https://site.test/post', image: `https://example.supabase.co/storage/v1/object/public/message-media/${accountId}/link-previews/post.jpg` } } }))
  ;(ensureSession as jest.Mock).mockResolvedValue(true)
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ auth: { getSession }, functions: { invoke } })
})

test('cached third-party previews cannot reuse another account private thumbnail', async () => {
  const first = await fetchLinkPreview('https://site.test/account-preview')
  accountId = 'bob'
  const second = await fetchLinkPreview('https://site.test/account-preview')
  expect(first?.image).toContain('/alice/')
  expect(second?.image).toContain('/bob/')
  expect(invoke).toHaveBeenCalledTimes(2)
})

test('signout cannot retrieve an earlier cached preview', async () => {
  await fetchLinkPreview('https://site.test/signout-preview')
  ;(ensureSession as jest.Mock).mockResolvedValue(false)
  expect(await fetchLinkPreview('https://site.test/signout-preview')).toBeNull()
})

test('member storage URLs are never sent to metadata fetchers or persisted in preview cache', async () => {
  expect(await fetchLinkPreview('https://example.supabase.co/storage/v1/object/sign/chat-uploads/alice/private.jpg?token=secret')).toBeNull()
  expect(invoke).not.toHaveBeenCalled()
  expect(Object.keys(localStorage)).toHaveLength(0)
})

test('legacy global preview caches are ignored and re-fetched into the current member namespace', async () => {
  const url = 'https://site.test/legacy-preview'
  localStorage.setItem(`shadowchat:link-preview:v2:${encodeURIComponent(url)}`, JSON.stringify({ preview: { url, image: 'https://old.test/unsafe.jpg' }, expiresAt: Date.now() + 100000 }))
  expect((await fetchLinkPreview(url))?.image).toContain('/alice/')
  expect(invoke).toHaveBeenCalledTimes(1)
})

const ensureSession = jest.fn()
const getSessionWithTimeout = jest.fn()
const getWorkingClient = jest.fn()
const fetchMock = jest.fn()

jest.mock('../src/lib/supabase', () => ({
  SUPABASE_ANON_KEY: 'anon-test-key',
  SUPABASE_URL: 'https://example.supabase.co',
  ensureSession: (...args: unknown[]) => ensureSession(...args),
  getSessionWithTimeout: (...args: unknown[]) => getSessionWithTimeout(...args),
  getWorkingClient: (...args: unknown[]) => getWorkingClient(...args),
}))

import { invokeAuthenticatedEdgeFunction } from '../src/lib/edgeFunctions'

const edgeResponse = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  json: jest.fn().mockResolvedValue(body),
  text: jest.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
}) as unknown as Response

const session = (accessToken: string) => ({ data: { session: { access_token: accessToken } } })

beforeEach(() => {
  jest.resetAllMocks()
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    writable: true,
    value: fetchMock,
  })
  ensureSession.mockResolvedValue(true)
  getWorkingClient.mockResolvedValue({ id: 'client' })
  getSessionWithTimeout.mockResolvedValue(session('current-token'))
})

test('authenticated Edge calls succeed without refreshing a healthy session', async () => {
  fetchMock.mockResolvedValue(edgeResponse(200, { ok: true }))

  await expect(invokeAuthenticatedEdgeFunction('klipy-gifs', { query: 'hello' })).resolves.toEqual({ ok: true })

  expect(ensureSession).toHaveBeenCalledTimes(1)
  expect(ensureSession).toHaveBeenCalledWith(false)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({
    Authorization: 'Bearer current-token',
    apikey: 'anon-test-key',
  }))
})

test('a rejected stale token forces one refresh and retries with the new token', async () => {
  getSessionWithTimeout
    .mockResolvedValueOnce(session('stale-token'))
    .mockResolvedValueOnce(session('fresh-token'))
  fetchMock
    .mockResolvedValueOnce(edgeResponse(401, { code: 'UNAUTHORIZED_ASYMMETRIC_JWT', message: 'Invalid JWT' }))
    .mockResolvedValueOnce(edgeResponse(200, { ok: true }))

  await expect(invokeAuthenticatedEdgeFunction('openai-chat', { messages: [] })).resolves.toEqual({ ok: true })

  expect(ensureSession.mock.calls).toEqual([[false], [true]])
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer stale-token' }))
  expect(fetchMock.mock.calls[1][1]?.headers).toEqual(expect.objectContaining({ Authorization: 'Bearer fresh-token' }))
})

test.each([403, 429, 500])('status %s is surfaced without retrying or refreshing', async status => {
  fetchMock.mockResolvedValue(edgeResponse(status, { error: `failure-${status}` }))

  await expect(invokeAuthenticatedEdgeFunction('openai-chat', { messages: [] })).rejects.toThrow(`failure-${status}`)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(ensureSession).toHaveBeenCalledTimes(1)
})

test('a second 401 is returned after exactly one refresh retry', async () => {
  getSessionWithTimeout
    .mockResolvedValueOnce(session('stale-token'))
    .mockResolvedValueOnce(session('fresh-token'))
  fetchMock
    .mockResolvedValueOnce(edgeResponse(401, { error: 'Invalid or expired session' }))
    .mockResolvedValueOnce(edgeResponse(401, { error: 'Invalid or expired session' }))

  await expect(invokeAuthenticatedEdgeFunction('openai-chat', {})).rejects.toThrow('Invalid or expired session')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(ensureSession.mock.calls).toEqual([[false], [true]])
})

test('a failed forced refresh stops before a second request', async () => {
  ensureSession.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  fetchMock.mockResolvedValue(edgeResponse(401, { error: 'Invalid or expired session' }))

  await expect(invokeAuthenticatedEdgeFunction('klipy-gifs', {})).rejects.toThrow('Authentication required')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

test('network and abort failures preserve the original error without retrying', async () => {
  const abortError = new DOMException('The operation was aborted', 'AbortError')
  fetchMock.mockRejectedValue(abortError)

  await expect(invokeAuthenticatedEdgeFunction('klipy-gifs', {}, { signal: new AbortController().signal })).rejects.toBe(abortError)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(ensureSession).toHaveBeenCalledTimes(1)
})

test('the caller body and abort signal are preserved across an auth retry', async () => {
  getSessionWithTimeout
    .mockResolvedValueOnce(session('stale-token'))
    .mockResolvedValueOnce(session('fresh-token'))
  const controller = new AbortController()
  const body = { query: 'cats', page: 2 }
  fetchMock
    .mockResolvedValueOnce(edgeResponse(401, { error: 'Invalid JWT' }))
    .mockResolvedValueOnce(edgeResponse(200, { gifs: [] }))

  await invokeAuthenticatedEdgeFunction('klipy-gifs', body, { signal: controller.signal })

  for (const [, init] of fetchMock.mock.calls) {
    expect(init?.body).toBe(JSON.stringify(body))
    expect(init?.signal).toBe(controller.signal)
  }
})

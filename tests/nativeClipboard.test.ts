import { act, renderHook } from '@testing-library/react'
import { recoverNativeClipboardVideos } from '../src/lib/nativeClipboard'
import { NATIVE_APP_MESSAGE_EVENT } from '../src/lib/nativeAppBridge'
import { useNativeVideoPaste } from '../src/hooks/useNativeVideoPaste'
import { createNativeClipboardController, CLIPBOARD_CHUNK_BYTES } from '../apps/mobile/src/lib/nativeClipboardController'

const requestId = '11111111-1111-4111-8111-111111111111'
const dispatch = (record: Record<string, unknown>) => window.dispatchEvent(new CustomEvent(NATIVE_APP_MESSAGE_EVENT, { detail: { version: 1, ...record } }))
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

beforeEach(() => {
  window.__SHADOWCHAT_NATIVE_APP__ = true
  window.__SHADOWCHAT_NATIVE_CLIPBOARD__ = true
  window.ReactNativeWebView = { postMessage: jest.fn() }
})
afterEach(() => {
  delete window.__SHADOWCHAT_NATIVE_APP__
  delete window.__SHADOWCHAT_NATIVE_CLIPBOARD__
  delete window.ReactNativeWebView
  jest.useRealTimers()
})
const lastRequest = () => JSON.parse((window.ReactNativeWebView!.postMessage as jest.Mock).mock.calls[0][0])

test('movie bytes use pull chunks and become a regular File; release follows completion', async () => {
  const pending = recoverNativeClipboardVideos('composer', new AbortController().signal)
  const request = lastRequest()
  dispatch({ ...request, type: 'clipboard_manifest', files: [{ name: 'clip.mov', type: 'video/quicktime', size: 5 }] })
  expect(window.ReactNativeWebView!.postMessage).toHaveBeenLastCalledWith(JSON.stringify({ version: 1, type: 'clipboard_next', requestId: request.requestId, scope: 'composer', index: 0, offset: 0 }))
  dispatch({ ...request, type: 'clipboard_chunk', index: 0, offset: 0, data: btoa('movie') })
  const files = await pending
  expect(files).toHaveLength(1)
  expect(files[0]).toMatchObject({ name: 'clip.mov', type: 'video/quicktime', size: 5 })
  const calls = (window.ReactNativeWebView!.postMessage as jest.Mock).mock.calls
  expect(JSON.parse(calls[calls.length - 1][0]).type).toBe('clipboard_cancel')
})

test('scope mismatch is ignored and cancellation releases bytes/listeners before late completion', async () => {
  const controller = new AbortController()
  const pending = recoverNativeClipboardVideos('composer', controller.signal)
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  const request = lastRequest()
  dispatch({ ...request, scope: 'other', type: 'clipboard_manifest', files: [{ name: 'clip.mov', type: 'video/quicktime', size: 5 }] })
  expect(window.ReactNativeWebView!.postMessage).toHaveBeenCalledTimes(1)
  controller.abort()
  dispatch({ ...request, type: 'clipboard_manifest', files: [{ name: 'clip.mov', type: 'video/quicktime', size: 5 }] })
  await rejected
  expect(window.ReactNativeWebView!.postMessage).toHaveBeenCalledTimes(2)
})

test('oversized manifest never requests file bytes', async () => {
  const pending = recoverNativeClipboardVideos('composer', new AbortController().signal)
  const rejected = expect(pending).rejects.toThrow('64 MB')
  dispatch({ ...lastRequest(), type: 'clipboard_manifest', files: [{ name: 'clip.mov', type: 'video/quicktime', size: 64 * 1024 * 1024 + 1 }] })
  await rejected
  expect((window.ReactNativeWebView!.postMessage as jest.Mock).mock.calls.map(call => JSON.parse(call[0]).type)).toEqual(['clipboard_begin', 'clipboard_cancel'])
})

test('incomplete native chunk is rejected and cleaned up', async () => {
  const pending = recoverNativeClipboardVideos('composer', new AbortController().signal)
  const rejected = expect(pending).rejects.toThrow('incomplete')
  const request = lastRequest()
  dispatch({ ...request, type: 'clipboard_manifest', files: [{ name: 'clip.mov', type: 'video/quicktime', size: 5 }] })
  dispatch({ ...request, type: 'clipboard_chunk', index: 0, offset: 0, data: btoa('x') })
  await rejected
})

test('native controller reads only exact-origin requests and permits one chunk in flight', async () => {
  const publish = jest.fn()
  let resolveChunk!: (value: string) => void
  const clipboard = { begin: jest.fn().mockResolvedValue([{ name: 'clip.mov', type: 'video/quicktime', size: CLIPBOARD_CHUNK_BYTES + 1 }]), readChunk: jest.fn(() => new Promise<string>(resolve => { resolveChunk = resolve })), release: jest.fn().mockResolvedValue(undefined) }
  const controller = createNativeClipboardController({ origin: 'https://shadochat.online', clipboard, publish })
  const send = (type: string, extra = {}, url = 'https://shadochat.online/?nativeApp=1') => controller.handle(JSON.stringify({ version: 1, type, requestId, scope: 'composer', ...extra }), url)
  expect(send('clipboard_begin', {}, 'https://shadochat.online.evil.test')).toBe(false)
  expect(clipboard.begin).not.toHaveBeenCalled()
  send('clipboard_begin'); await flush()
  send('clipboard_next', { index: 0, offset: 0 })
  send('clipboard_next', { index: 0, offset: 0 })
  expect(clipboard.readChunk).toHaveBeenCalledTimes(1)
  resolveChunk(btoa('x'.repeat(CLIPBOARD_CHUNK_BYTES))); await flush()
  send('clipboard_next', { index: 0, offset: 0 })
  expect(clipboard.readChunk).toHaveBeenCalledTimes(1)
  send('clipboard_next', { index: 0, offset: CLIPBOARD_CHUNK_BYTES })
  expect(clipboard.readChunk).toHaveBeenCalledTimes(2)
  controller.reset()
  resolveChunk(btoa('x')); await flush()
  expect(publish.mock.calls.map(call => call[0].type)).toEqual(['clipboard_manifest', 'clipboard_chunk'])
  expect(clipboard.release).toHaveBeenCalledWith(requestId)
})

test('native cancellation before provider completion cannot publish a late manifest', async () => {
  let resolveBegin!: (value: { name: string; type: string; size: number }[]) => void
  const clipboard = { begin: jest.fn(() => new Promise<{ name: string; type: string; size: number }[]>(resolve => { resolveBegin = resolve })), readChunk: jest.fn(), release: jest.fn().mockResolvedValue(undefined) }
  const publish = jest.fn()
  const controller = createNativeClipboardController({ origin: 'https://shadochat.online', clipboard, publish })
  controller.handle(JSON.stringify({ version: 1, type: 'clipboard_begin', requestId, scope: 'a' }), 'https://shadochat.online')
  controller.reset()
  resolveBegin([{ name: 'clip.mov', type: 'video/quicktime', size: 5 }]); await flush()
  expect(publish).not.toHaveBeenCalled()
  expect(clipboard.release).toHaveBeenCalledWith(requestId)
})

test('native expiry releases the transfer and a second composer receives a clear busy error', async () => {
  jest.useFakeTimers()
  const clipboard = { begin: jest.fn().mockResolvedValue([{ name: 'clip.mov', type: 'video/quicktime', size: 5 }]), readChunk: jest.fn(), release: jest.fn().mockResolvedValue(undefined) }
  const publish = jest.fn()
  const controller = createNativeClipboardController({ origin: 'https://shadochat.online', clipboard, publish })
  const send = (id: string, scope: string) => controller.handle(JSON.stringify({ version: 1, type: 'clipboard_begin', requestId: id, scope }), 'https://shadochat.online')
  send(requestId, 'first'); await flush()
  send('22222222-2222-4222-8222-222222222222', 'second')
  expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'clipboard_error', scope: 'second', error: expect.stringContaining('Wait') }))
  expect(clipboard.begin).toHaveBeenCalledTimes(1)
  jest.advanceTimersByTime(120_000)
  expect(clipboard.release).toHaveBeenCalledWith(requestId)
  expect(publish).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'clipboard_error', scope: 'first', error: expect.stringContaining('timed out') }))
})

test('changing account/chat A to B to A cancels and cannot stage the first A result', async () => {
  const stage = jest.fn(() => 1)
  const { result, rerender, unmount } = renderHook(({ scope }) => useNativeVideoPaste(scope, stage), { initialProps: { scope: 'account:chat-a' } })
  act(() => { expect(result.current.recoverVideoPaste()).toBe(true) })
  const request = lastRequest()
  rerender({ scope: 'account:chat-b' })
  rerender({ scope: 'account:chat-a' })
  await act(async () => {
    dispatch({ ...request, type: 'clipboard_manifest', files: [{ name: 'clip.mov', type: 'video/quicktime', size: 5 }] })
    dispatch({ ...request, type: 'clipboard_chunk', index: 0, offset: 0, data: btoa('movie') })
    await flush()
  })
  expect(stage).not.toHaveBeenCalled()
  act(() => { result.current.recoverVideoPaste() })
  unmount()
  const calls = (window.ReactNativeWebView!.postMessage as jest.Mock).mock.calls
  expect(JSON.parse(calls[calls.length - 1][0]).type).toBe('clipboard_cancel')
})

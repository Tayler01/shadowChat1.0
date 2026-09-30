import { loadShadowRunnerImages } from '../src/features/games/shadow-runner/loading'
import { createShadowRunnerSfxController, SHADOW_RUNNER_SOUND_LOAD_TIMEOUT_MS } from '../src/features/games/shadow-runner/audio'

const drain = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve() }

describe('Shadow Runner required image loading', () => {
  const NativeImage = global.Image
  let images: FakeImage[]
  class FakeImage {
    src = ''
    decoding = ''
    naturalWidth = 64
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    constructor() { images.push(this) }
    removeAttribute() { this.src = '' }
  }
  beforeEach(() => { images = []; global.Image = FakeImage as unknown as typeof Image; jest.useFakeTimers() })
  afterEach(() => { global.Image = NativeImage; jest.useRealTimers() })

  it('loads deduplicated required images in bounded parallel batches with real progress', async () => {
    const progress = jest.fn()
    const task = loadShadowRunnerImages(['a', 'b', 'c', 'd', 'e', 'a'], { signal: new AbortController().signal, onProgress: progress })
    expect(images.map(image => image.src)).toEqual(['a', 'b', 'c', 'd'])
    images[0].onload?.()
    await drain()
    expect(images[4].src).toBe('e')
    for (const image of images.slice(1)) image.onload?.()
    await task
    expect(progress).toHaveBeenLastCalledWith(5, 5)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('reports a failed image, cancels siblings and allows a fresh retry', async () => {
    const task = loadShadowRunnerImages(['a', 'broken'], { signal: new AbortController().signal })
    const rejected = expect(task).rejects.toThrow('Required image could not load: broken')
    images[1].onerror?.()
    await rejected
    expect(images[0].src).toBe('')
    const retry = loadShadowRunnerImages(['a', 'broken'], { signal: new AbortController().signal })
    images[2].onload?.()
    images[3].onload?.()
    await retry
  })

  it('treats timeouts as errors, never readiness or 100 percent progress', async () => {
    const progress = jest.fn()
    const task = loadShadowRunnerImages(['hung'], { signal: new AbortController().signal, timeoutMs: 50, onProgress: progress })
    const rejected = expect(task).rejects.toThrow('timed out')
    await jest.advanceTimersByTimeAsync(51)
    await rejected
    expect(progress).toHaveBeenLastCalledWith(0, 1)
    expect(images[0].onload).toBeNull()
  })

  it('cancels an old route without progressing or loading the rest of the batch', async () => {
    const controller = new AbortController()
    const progress = jest.fn()
    const task = loadShadowRunnerImages(['a', 'b', 'c'], { signal: controller.signal, concurrency: 1, onProgress: progress })
    const rejected = expect(task).rejects.toThrow('cancelled')
    controller.abort()
    await rejected
    expect(images).toHaveLength(1)
    expect(progress).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('rejects an empty decoded image', async () => {
    const task = loadShadowRunnerImages(['empty'], { signal: new AbortController().signal })
    const rejected = expect(task).rejects.toThrow('was empty')
    images[0].naturalWidth = 0
    images[0].onload?.()
    await rejected
  })
})

describe('Shadow Runner optional sound timeouts', () => {
  const originalAudioContext = window.AudioContext
  const originalFetch = global.fetch
  let controller: ReturnType<typeof createShadowRunnerSfxController>
  let decode: jest.Mock
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    decode = jest.fn().mockResolvedValue({})
    window.AudioContext = jest.fn().mockImplementation(() => ({ decodeAudioData: decode, close: jest.fn().mockResolvedValue(undefined), state: 'running' })) as unknown as typeof AudioContext
  })
  afterEach(() => {
    controller?.dispose()
    window.AudioContext = originalAudioContext
    global.fetch = originalFetch
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('bounds a fetch that never settles and clears the loading slot for retry', async () => {
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => undefined))
    controller = createShadowRunnerSfxController()
    const task = controller.preload(['jump'])
    expect(controller.getStatus().loading).toBe(1)
    await jest.advanceTimersByTimeAsync(SHADOW_RUNNER_SOUND_LOAD_TIMEOUT_MS + 1)
    await task
    expect(controller.getStatus()).toMatchObject({ loading: 0, loaded: 0 })
    expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true)
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    const retry = controller.preload(['jump'])
    await jest.advanceTimersByTimeAsync(1)
    await retry
    expect(controller.getStatus().loaded).toBe(1)
  })

  it('bounds decode and does not install a late decoded buffer', async () => {
    let resolveDecode!: (value: object) => void
    decode.mockImplementation(() => new Promise(resolve => { resolveDecode = resolve }))
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    controller = createShadowRunnerSfxController()
    const task = controller.preload(['jump'])
    await drain()
    await jest.advanceTimersByTimeAsync(SHADOW_RUNNER_SOUND_LOAD_TIMEOUT_MS + 1)
    await task
    resolveDecode({})
    await drain()
    expect(controller.getStatus()).toMatchObject({ loading: 0, loaded: 0 })
  })

  it('aborts pending fetches when the controller is disposed', async () => {
    global.fetch = jest.fn().mockImplementation(() => new Promise(() => undefined))
    controller = createShadowRunnerSfxController()
    const task = controller.preload(['jump', 'land'])
    controller.dispose()
    await jest.advanceTimersByTimeAsync(1)
    await task
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.mocked(global.fetch).mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(controller.getStatus().loading).toBe(0)
  })
})

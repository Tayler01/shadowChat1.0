import {
  createGameSoundtrackController,
  GAME_SOUNDTRACK_LOAD_TIMEOUT_MS,
  type GameSoundtrackController,
} from '../src/features/games/gameSoundtrack'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function drain() {
  for (let index = 0; index < 20; index += 1) await Promise.resolve()
}

const decodedBuffer = () => ({ length: 8, numberOfChannels: 2, sampleRate: 44100 }) as AudioBuffer
const response = (body = Promise.resolve(new ArrayBuffer(8)), ok = true) => ({
  ok,
  arrayBuffer: jest.fn(() => body),
}) as unknown as Response

class MockBufferSource {
  buffer: AudioBuffer | null = null
  loop = false
  connect = jest.fn()
  disconnect = jest.fn()
  start = jest.fn()
  stop = jest.fn()
}

describe('game soundtrack bounded lifecycle', () => {
  const originalAudioContext = Object.getOwnPropertyDescriptor(window, 'AudioContext')
  const originalWebkitAudioContext = Object.getOwnPropertyDescriptor(window, 'webkitAudioContext')
  const originalFetch = globalThis.fetch
  let controller: GameSoundtrackController
  let contexts: MockAudioContext[]
  let hidden: boolean
  let initialState: AudioContextState
  let resumeWork: () => Promise<void>
  let decode: jest.Mock<Promise<AudioBuffer>, [ArrayBuffer]>
  let fetchMock: jest.Mock<ReturnType<typeof fetch>, Parameters<typeof fetch>>

  class MockAudioContext {
    state = initialState
    currentTime = 2
    destination = {}
    sources: MockBufferSource[] = []
    gainNode = { gain: { value: 1, setTargetAtTime: jest.fn() }, connect: jest.fn(), disconnect: jest.fn() }
    createGain = jest.fn(() => this.gainNode)
    createBufferSource = jest.fn(() => {
      const source = new MockBufferSource()
      this.sources.push(source)
      return source
    })
    decodeAudioData = decode
    resume = jest.fn(async () => {
      await resumeWork()
      if (this.state !== 'closed') this.state = 'running'
    })
    close = jest.fn(async () => { this.state = 'closed' })

    constructor() { contexts.push(this) }
  }

  const signalAt = (index = 0) => fetchMock.mock.calls[index][1]?.signal as AbortSignal
  const retainedBuffers = () => contexts.flatMap(context => context.sources)
    .filter(source => source.buffer !== null)

  beforeEach(() => {
    jest.useFakeTimers()
    hidden = false
    contexts = []
    initialState = 'running'
    resumeWork = () => Promise.resolve()
    decode = jest.fn<Promise<AudioBuffer>, [ArrayBuffer]>()
      .mockImplementation(async () => decodedBuffer())
    fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockImplementation(async () => response())
    globalThis.fetch = fetchMock
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: MockAudioContext })
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined })
    jest.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    controller = createGameSoundtrackController()
  })

  afterEach(async () => {
    controller.dispose()
    await drain()
    expect(jest.getTimerCount()).toBe(0)
    if (originalAudioContext) Object.defineProperty(window, 'AudioContext', originalAudioContext)
    else Reflect.deleteProperty(window, 'AudioContext')
    if (originalWebkitAudioContext) {
      Object.defineProperty(window, 'webkitAudioContext', originalWebkitAudioContext)
    } else Reflect.deleteProperty(window, 'webkitAudioContext')
    globalThis.fetch = originalFetch
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it('keeps the looping Web Audio path and default gain', async () => {
    const decoded = decodedBuffer()
    decode.mockResolvedValueOnce(decoded)

    await expect(controller.play('a.mp3')).resolves.toBe(true)

    const context = contexts[0]
    const source = context.sources[0]
    expect(context.gainNode.gain.value).toBe(0.42)
    expect(context.gainNode.connect).toHaveBeenCalledWith(context.destination)
    expect(source.buffer).toBe(decoded)
    expect(source.loop).toBe(true)
    expect(source.connect).toHaveBeenCalledWith(context.gainNode)
    expect(source.start).toHaveBeenCalledTimes(1)
    expect(signalAt().aborted).toBe(false)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('preserves upstream volume controls across bounded audio-context lifetimes', async () => {
    controller.setVolume(0.25)
    expect(contexts).toHaveLength(0)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    const first = contexts[0]
    expect(first.gainNode.gain.value).toBe(0.25)
    controller.setVolume(2)
    expect(first.gainNode.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 2, 0.15)
    controller.setVolume(-1)
    expect(first.gainNode.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 2, 0.15)
    controller.stop({ closeContext: true })
    controller.setVolume(0.6)
    await expect(controller.play('b.mp3')).resolves.toBe(true)
    expect(contexts).toHaveLength(2)
    expect(contexts[1].gainNode.gain.value).toBe(0.6)
    expect(first.close).toHaveBeenCalledTimes(1)
    expect(first.sources[0].buffer).toBeNull()
    expect(retainedBuffers()).toHaveLength(1)
  })

  it('preserves a caller-specified volume', async () => {
    controller.dispose()
    controller = createGameSoundtrackController(0.25)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(contexts[0].gainNode.gain.value).toBe(0.25)
  })

  it('does not restart, refetch or decode an already active source', async () => {
    await controller.play('a.mp3')
    const source = contexts[0].sources[0]

    await expect(controller.play('a.mp3')).resolves.toBe(true)
    await expect(controller.play('a.mp3')).resolves.toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(contexts[0].sources).toHaveLength(1)
    expect(source.start).toHaveBeenCalledTimes(1)
    expect(source.stop).not.toHaveBeenCalled()
  })

  it.each(['fetch', 'decode'] as const)('shares overlapping same-source calls during %s', async stage => {
    const fetching = deferred<Response>()
    const decoding = deferred<AudioBuffer>()
    if (stage === 'fetch') fetchMock.mockReturnValueOnce(fetching.promise)
    else decode.mockReturnValueOnce(decoding.promise)

    const first = controller.play('a.mp3')
    await drain()
    const second = controller.play('a.mp3')
    expect(second).toBe(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(signalAt().aborted).toBe(false)

    if (stage === 'fetch') fetching.resolve(response())
    else decoding.resolve(decodedBuffer())
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(true)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(contexts[0].sources).toHaveLength(1)
  })

  it.each(['fetch', 'decode'] as const)('ignores late A %s completion after B has started', async stage => {
    const fetching = deferred<Response>()
    const decoding = deferred<AudioBuffer>()
    if (stage === 'fetch') fetchMock.mockReturnValueOnce(fetching.promise)
    else decode.mockReturnValueOnce(decoding.promise)
    const first = controller.play('a.mp3')
    await drain()

    await expect(controller.play('b.mp3')).resolves.toBe(true)
    await expect(first).resolves.toBe(false)
    expect(signalAt().aborted).toBe(true)
    const current = contexts[0].sources[0]
    const currentBuffer = current.buffer
    const staleResponse = response()
    if (stage === 'fetch') fetching.resolve(staleResponse)
    else decoding.resolve(decodedBuffer())
    await drain()

    expect(staleResponse.arrayBuffer).not.toHaveBeenCalled()
    expect(contexts[0].sources).toHaveLength(1)
    expect(current.buffer).toBe(currentBuffer)
    expect(current.stop).not.toHaveBeenCalled()
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['a.mp3', 'b.mp3', 'a.mp3'])
    expect(decode).toHaveBeenCalledTimes(stage === 'fetch' ? 2 : 3)
  })

  it('does not let stale same-URL cleanup remove a newer A request in an A/B/A race', async () => {
    const oldA = deferred<AudioBuffer>()
    const newA = deferred<AudioBuffer>()
    decode.mockReturnValueOnce(oldA.promise).mockReturnValueOnce(newA.promise)
    const first = controller.play('a.mp3')
    await drain()
    const middle = controller.play('b.mp3')
    const latest = controller.play('a.mp3')
    await drain()
    await expect(first).resolves.toBe(false)
    await expect(middle).resolves.toBe(false)

    oldA.resolve(decodedBuffer())
    await drain()
    expect(controller.play('a.mp3')).toBe(latest)
    expect(contexts[0].sources).toHaveLength(0)
    const expected = decodedBuffer()
    newA.resolve(expected)
    await expect(latest).resolves.toBe(true)
    expect(contexts[0].sources[0].buffer).toBe(expected)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it.each(['fetch', 'body', 'decode'] as const)('stops promptly during %s and ignores late completion', async stage => {
    const fetching = deferred<Response>()
    const body = deferred<ArrayBuffer>()
    const decoding = deferred<AudioBuffer>()
    const staleResponse = response(stage === 'body' ? body.promise : undefined)
    fetchMock.mockReturnValueOnce(stage === 'fetch' ? fetching.promise : Promise.resolve(staleResponse))
    if (stage === 'decode') decode.mockReturnValueOnce(decoding.promise)
    const playing = controller.play('a.mp3')
    await drain()

    controller.stop()
    await expect(playing).resolves.toBe(false)
    expect(signalAt().aborted).toBe(true)
    expect(contexts[0].close).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
    fetching.resolve(staleResponse)
    body.resolve(new ArrayBuffer(8))
    decoding.resolve(decodedBuffer())
    await drain()

    expect(retainedBuffers()).toHaveLength(0)
    expect(contexts[0].sources).toHaveLength(0)
    expect(decode).toHaveBeenCalledTimes(stage === 'decode' ? 1 : 0)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('retains at most the current track and releases source buffer references on switch and stop', async () => {
    await controller.play('a.mp3')
    const first = contexts[0].sources[0]
    const nextFetch = deferred<Response>()
    fetchMock.mockReturnValueOnce(nextFetch.promise)
    const next = controller.play('b.mp3')

    expect(first.stop).toHaveBeenCalledTimes(1)
    expect(first.disconnect).toHaveBeenCalledTimes(1)
    expect(first.buffer).toBeNull()
    expect(retainedBuffers()).toHaveLength(0)
    nextFetch.resolve(response())
    await expect(next).resolves.toBe(true)
    expect(retainedBuffers()).toHaveLength(1)

    await controller.play('c.mp3')
    expect(retainedBuffers()).toHaveLength(1)
    await controller.play('a.mp3')
    expect(retainedBuffers()).toHaveLength(1)
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['a.mp3', 'b.mp3', 'c.mp3', 'a.mp3'])
    controller.stop()
    controller.stop()
    expect(retainedBuffers()).toHaveLength(0)
    expect(contexts[0].close).not.toHaveBeenCalled()
    await controller.play('a.mp3')
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(decode).toHaveBeenCalledTimes(5)
    expect(contexts).toHaveLength(1)
  })

  it.each(['fetch', 'decode', 'active'] as const)('disposes during %s without resurrection or more contexts', async stage => {
    const fetching = deferred<Response>()
    const decoding = deferred<AudioBuffer>()
    if (stage === 'fetch') fetchMock.mockReturnValueOnce(fetching.promise)
    if (stage === 'decode') decode.mockReturnValueOnce(decoding.promise)
    const playing = controller.play('a.mp3')
    await drain()
    if (stage === 'active') await expect(playing).resolves.toBe(true)

    controller.dispose()
    controller.dispose()
    if (stage !== 'active') {
      await expect(playing).resolves.toBe(false)
      expect(signalAt().aborted).toBe(true)
    }
    expect(contexts[0].close).toHaveBeenCalledTimes(1)
    expect(contexts[0].gainNode.disconnect).toHaveBeenCalledTimes(1)
    expect(retainedBuffers()).toHaveLength(0)
    fetching.resolve(response())
    decoding.resolve(decodedBuffer())
    await drain()

    await expect(controller.play('a.mp3')).resolves.toBe(false)
    await expect(controller.play('b.mp3')).resolves.toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(contexts).toHaveLength(1)
    expect(contexts[0].sources).toHaveLength(stage === 'active' ? 1 : 0)
    expect(retainedBuffers()).toHaveLength(0)
  })

  it('honors closeContext and creates a fresh context only for the next explicit play', async () => {
    await controller.play('a.mp3')
    const oldContext = contexts[0]
    controller.stop({ closeContext: false })
    expect(oldContext.close).not.toHaveBeenCalled()
    controller.stop({ closeContext: true })
    controller.stop({ closeContext: true })
    expect(oldContext.close).toHaveBeenCalledTimes(1)
    expect(oldContext.gainNode.disconnect).toHaveBeenCalledTimes(1)

    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(contexts).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(retainedBuffers()).toHaveLength(1)
  })

  it('does not use a late decode from a closed context after a fresh play', async () => {
    const decoding = deferred<AudioBuffer>()
    decode.mockReturnValueOnce(decoding.promise)
    const first = controller.play('a.mp3')
    await drain()
    controller.stop({ closeContext: true })
    await expect(first).resolves.toBe(false)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    decoding.resolve(decodedBuffer())
    await drain()
    expect(contexts).toHaveLength(2)
    expect(contexts[0].sources).toHaveLength(0)
    expect(contexts[1].sources).toHaveLength(1)
    expect(retainedBuffers()).toHaveLength(1)
  })

  it.each(['fetch', 'body', 'decode', 'resume'] as const)('bounds a stalled %s even if it ignores abort', async stage => {
    const fetching = deferred<Response>()
    const body = deferred<ArrayBuffer>()
    const decoding = deferred<AudioBuffer>()
    const resuming = deferred<void>()
    if (stage === 'fetch') fetchMock.mockReturnValueOnce(fetching.promise)
    if (stage === 'body') fetchMock.mockResolvedValueOnce(response(body.promise))
    if (stage === 'decode') decode.mockReturnValueOnce(decoding.promise)
    if (stage === 'resume') {
      initialState = 'suspended'
      resumeWork = () => resuming.promise
    }
    const playing = controller.play('a.mp3')
    await drain()
    await jest.advanceTimersByTimeAsync(GAME_SOUNDTRACK_LOAD_TIMEOUT_MS)
    await expect(playing).resolves.toBe(false)
    if (stage !== 'resume') expect(signalAt().aborted).toBe(true)
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)

    fetching.resolve(response())
    body.resolve(new ArrayBuffer(8))
    decoding.resolve(decodedBuffer())
    resuming.resolve(undefined)
    await drain()
    expect(retainedBuffers()).toHaveLength(0)
    expect(contexts[0].sources).toHaveLength(0)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(contexts).toHaveLength(2)
  })

  it.each(['fetch', 'http', 'body', 'decode', 'resume', 'start'] as const)('handles %s errors and permits a clean retry', async stage => {
    const error = new Error('test failure')
    if (stage === 'fetch') fetchMock.mockRejectedValueOnce(error)
    if (stage === 'http') fetchMock.mockResolvedValueOnce(response(undefined, false))
    if (stage === 'body') fetchMock.mockResolvedValueOnce(response(Promise.reject(error)))
    if (stage === 'decode') decode.mockRejectedValueOnce(error)
    if (stage === 'resume') {
      initialState = 'suspended'
      resumeWork = jest.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined)
    }
    if (stage === 'start') {
      decode.mockImplementationOnce(async () => {
        contexts[0].createBufferSource.mockImplementationOnce(() => {
          const source = new MockBufferSource()
          source.start.mockImplementationOnce(() => { throw error })
          contexts[0].sources.push(source)
          return source
        })
        return decodedBuffer()
      })
    }

    await expect(controller.play('a.mp3')).resolves.toBe(false)
    expect(retainedBuffers()).toHaveLength(0)
    expect(contexts[0].close).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
  })

  it.each(['resolve', 'reject'] as const)('ignores a late decode %s after stop while a new source plays', async outcome => {
    const decoding = deferred<AudioBuffer>()
    decode.mockReturnValueOnce(decoding.promise)
    const first = controller.play('a.mp3')
    await drain()
    controller.stop()
    await expect(first).resolves.toBe(false)
    await controller.play('b.mp3')
    const current = contexts[0].sources[0]
    if (outcome === 'resolve') decoding.resolve(decodedBuffer())
    else decoding.reject(new Error('late decode failure'))
    await drain()
    expect(current.stop).not.toHaveBeenCalled()
    expect(retainedBuffers()).toEqual([current])
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('does not create a context or fetch while hidden or for an empty URL', async () => {
    await expect(controller.play('')).resolves.toBe(false)
    hidden = true
    await expect(controller.play('a.mp3')).resolves.toBe(false)
    expect(contexts).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['fetch', 'decode', 'active'] as const)('cancels on hidden during %s and never resumes on visibility alone', async stage => {
    const fetching = deferred<Response>()
    const decoding = deferred<AudioBuffer>()
    if (stage === 'fetch') fetchMock.mockReturnValueOnce(fetching.promise)
    if (stage === 'decode') decode.mockReturnValueOnce(decoding.promise)
    const playing = controller.play('a.mp3')
    await drain()
    if (stage === 'active') await expect(playing).resolves.toBe(true)

    hidden = true
    document.dispatchEvent(new Event('visibilitychange'))
    if (stage !== 'active') await expect(playing).resolves.toBe(false)
    expect(contexts[0].close).toHaveBeenCalledTimes(1)
    expect(retainedBuffers()).toHaveLength(0)
    hidden = false
    document.dispatchEvent(new Event('visibilitychange'))
    fetching.resolve(response())
    decoding.resolve(decodedBuffer())
    await drain()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(contexts).toHaveLength(1)
    expect(retainedBuffers()).toHaveLength(0)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(contexts).toHaveLength(2)
  })

  it.each(['initial resume', 'fetch', 'body', 'decode', 'final resume'] as const)(
    'checks hidden after %s even without a visibility event', async stage => {
      const fetching = deferred<Response>()
      const body = deferred<ArrayBuffer>()
      const decoding = deferred<AudioBuffer>()
      const resuming = deferred<void>()
      if (stage === 'initial resume') {
        initialState = 'suspended'
        resumeWork = () => resuming.promise
      }
      if (stage === 'fetch') fetchMock.mockReturnValueOnce(fetching.promise)
      if (stage === 'body') fetchMock.mockResolvedValueOnce(response(body.promise))
      if (stage === 'decode' || stage === 'final resume') decode.mockReturnValueOnce(decoding.promise)
      const playing = controller.play('a.mp3')
      await drain()
      if (stage === 'final resume') {
        contexts[0].state = 'suspended'
        resumeWork = () => resuming.promise
        decoding.resolve(decodedBuffer())
        await drain()
        expect(contexts[0].resume).toHaveBeenCalledTimes(1)
      }

      hidden = true
      fetching.resolve(response())
      body.resolve(new ArrayBuffer(8))
      decoding.resolve(decodedBuffer())
      resuming.resolve(undefined)
      await expect(playing).resolves.toBe(false)
      expect(contexts[0].sources).toHaveLength(0)
      expect(retainedBuffers()).toHaveLength(0)
      hidden = false
      await expect(controller.play('a.mp3')).resolves.toBe(true)
      expect(contexts).toHaveLength(2)
    },
  )

  it.each(['initial', 'final'] as const)('settles stop while the %s resume is pending', async phase => {
    const resuming = deferred<void>()
    const decoding = deferred<AudioBuffer>()
    resumeWork = () => resuming.promise
    if (phase === 'initial') initialState = 'suspended'
    else decode.mockReturnValueOnce(decoding.promise)
    const playing = controller.play('a.mp3')
    await drain()
    if (phase === 'final') {
      contexts[0].state = 'suspended'
      decoding.resolve(decodedBuffer())
      await drain()
    }
    expect(contexts[0].resume).toHaveBeenCalledTimes(1)
    controller.stop()
    await expect(playing).resolves.toBe(false)
    resuming.resolve(undefined)
    await drain()
    expect(contexts[0].sources).toHaveLength(0)
    expect(retainedBuffers()).toHaveLength(0)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(decode).toHaveBeenCalledTimes(phase === 'initial' ? 1 : 2)
  })

  it.each(['suspended', 'interrupted'])('resumes a %s active source without recreating or decoding it', async state => {
    await controller.play('a.mp3')
    expect(controller.isPlaying()).toBe(true)
    contexts[0].state = state as AudioContextState
    expect(controller.isPlaying()).toBe(false)
    const resuming = deferred<void>()
    resumeWork = () => resuming.promise
    const first = controller.play('a.mp3')
    expect(controller.play('a.mp3')).toBe(first)
    resuming.resolve(undefined)
    await expect(first).resolves.toBe(true)
    expect(controller.isPlaying()).toBe(true)
    expect(contexts[0].sources).toHaveLength(1)
    expect(contexts[0].sources[0].start).toHaveBeenCalledTimes(1)
    expect(contexts[0].sources[0].stop).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(decode).toHaveBeenCalledTimes(1)
  })

  it('does not report success when resume leaves the context interrupted', async () => {
    await controller.play('a.mp3')
    contexts[0].state = 'interrupted' as AudioContextState
    contexts[0].resume.mockImplementationOnce(async () => undefined)
    await expect(controller.play('a.mp3')).resolves.toBe(false)
    expect(controller.isPlaying()).toBe(false)
    expect(retainedBuffers()).toHaveLength(0)
  })

  it('a same-source gesture retries a pending autoplay resume without another fetch', async () => {
    initialState = 'suspended'
    const resuming = deferred<void>()
    resumeWork = jest.fn().mockReturnValueOnce(resuming.promise).mockImplementationOnce(async () => {
      resuming.resolve(undefined)
    })
    const first = controller.play('a.mp3')
    await drain()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(controller.play('a.mp3')).toBe(first)
    await expect(first).resolves.toBe(true)
    expect(contexts[0].resume).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(contexts[0].sources).toHaveLength(1)
  })

  it('stops on pagehide and unregisters both lifecycle listeners on dispose', async () => {
    const removeDocumentListener = jest.spyOn(document, 'removeEventListener')
    const removeWindowListener = jest.spyOn(window, 'removeEventListener')
    await controller.play('a.mp3')
    window.dispatchEvent(new Event('pagehide'))
    expect(contexts[0].close).toHaveBeenCalledTimes(1)
    expect(retainedBuffers()).toHaveLength(0)
    controller.dispose()
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    expect(removeWindowListener).toHaveBeenCalledWith('pagehide', expect.any(Function))
  })

  it('releases buffers even if stopping or disconnecting a node throws', async () => {
    await controller.play('a.mp3')
    const source = contexts[0].sources[0]
    source.stop.mockImplementation(() => { throw new Error('already stopped') })
    source.disconnect.mockImplementation(() => { throw new Error('already disconnected') })
    expect(() => controller.stop()).not.toThrow()
    expect(source.buffer).toBeNull()
    expect(retainedBuffers()).toHaveLength(0)
  })

  it.each(['throws', 'rejects'] as const)('handles a context close that %s', async failure => {
    await controller.play('a.mp3')
    if (failure === 'throws') contexts[0].close.mockImplementationOnce(() => { throw new Error('closed') })
    else contexts[0].close.mockRejectedValueOnce(new Error('closed'))
    expect(() => controller.stop({ closeContext: true })).not.toThrow()
    await drain()
    expect(retainedBuffers()).toHaveLength(0)
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(contexts).toHaveLength(2)
  })

  it('returns false without an AudioContext and still supports webkitAudioContext', async () => {
    controller.dispose()
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined })
    controller = createGameSoundtrackController()
    await expect(controller.play('a.mp3')).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
    controller.dispose()
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: MockAudioContext })
    controller = createGameSoundtrackController()
    await expect(controller.play('a.mp3')).resolves.toBe(true)
    expect(contexts).toHaveLength(1)
  })
})

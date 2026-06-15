type GameSoundtrackWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

interface StopOptions {
  closeContext?: boolean
}

export interface GameSoundtrackController {
  play: (source: string) => Promise<boolean>
  stop: (options?: StopOptions) => void
  dispose: () => void
}

export function createGameSoundtrackController(volume = 0.42): GameSoundtrackController {
  const AudioContextCtor = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as GameSoundtrackWindow).webkitAudioContext
  let context: AudioContext | null = null
  let gain: GainNode | null = null
  let activeSource: AudioBufferSourceNode | null = null
  let disposed = false
  let playRequestId = 0
  const buffers = new Map<string, AudioBuffer>()
  const loading = new Map<string, Promise<AudioBuffer | null>>()

  const getContext = () => {
    if (disposed || !AudioContextCtor) return null

    if (!context || context.state === 'closed') {
      context = new AudioContextCtor()
      gain = context.createGain()
      gain.gain.value = volume
      gain.connect(context.destination)
    }

    return context
  }

  const stopSource = () => {
    const source = activeSource
    activeSource = null

    if (!source) return

    try {
      source.stop()
    } catch {
      // Already stopped sources throw in some browsers.
    }

    try {
      source.disconnect()
    } catch {
      // Disconnect is best-effort cleanup.
    }
  }

  const closeContext = () => {
    const audioContext = context
    context = null
    gain = null

    if (audioContext && audioContext.state !== 'closed') {
      void audioContext.close().catch(() => undefined)
    }
  }

  const loadBuffer = (source: string) => {
    const cached = buffers.get(source)
    if (cached) return Promise.resolve(cached)

    const existing = loading.get(source)
    if (existing) return existing

    const task = (async () => {
      const audioContext = getContext()
      if (!audioContext) return null

      const response = await fetch(source)
      if (!response.ok) {
        throw new Error(`Unable to load game soundtrack: ${source}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
      buffers.set(source, decoded)
      return decoded
    })()
      .catch(error => {
        console.warn('[Games] Soundtrack preload failed', source, error)
        return null
      })
      .finally(() => {
        loading.delete(source)
      })

    loading.set(source, task)
    return task
  }

  const play = async (source: string) => {
    if (!source || disposed) return false
    if (typeof document !== 'undefined' && document.hidden) return false

    const requestId = ++playRequestId
    const audioContext = getContext()
    if (!audioContext || !gain) return false

    try {
      if (audioContext.state === 'suspended') {
        await audioContext.resume()
      }

      const buffer = await loadBuffer(source)
      if (!buffer || disposed || requestId !== playRequestId) return false
      if (typeof document !== 'undefined' && document.hidden) return false

      const playbackContext = getContext()
      if (!playbackContext || !gain) return false

      if (playbackContext.state === 'suspended') {
        await playbackContext.resume()
      }

      if (disposed || requestId !== playRequestId) return false

      stopSource()
      const nextSource = playbackContext.createBufferSource()
      nextSource.buffer = buffer
      nextSource.loop = true
      nextSource.connect(gain)
      nextSource.start()
      activeSource = nextSource
      return true
    } catch (error) {
      console.warn('[Games] Soundtrack playback failed', source, error)
      return false
    }
  }

  const stop = (options: StopOptions = {}) => {
    playRequestId += 1
    stopSource()

    if (options.closeContext) {
      closeContext()
    }
  }

  const dispose = () => {
    disposed = true
    stop({ closeContext: true })
    buffers.clear()
    loading.clear()
  }

  return {
    play,
    stop,
    dispose,
  }
}

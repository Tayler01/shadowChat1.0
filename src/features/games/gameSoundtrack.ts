type GameSoundtrackWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

interface StopOptions {
  closeContext?: boolean
}

export interface GameSoundtrackController {
  setVolume: (value: number) => void
  isPlaying: () => boolean
  play: (source: string) => Promise<boolean>
  stop: (options?: StopOptions) => void
  dispose: () => void
}

export const GAME_SOUNDTRACK_LOAD_TIMEOUT_MS = 30_000

export function createGameSoundtrackController(volume = 0.42): GameSoundtrackController {
  const AudioContextCtor = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as GameSoundtrackWindow).webkitAudioContext
  let context: AudioContext | null = null
  let gain: GainNode | null = null
  let activeSource: AudioBufferSourceNode | null = null
  let activeSourceUrl: string | null = null
  let buffer: AudioBuffer | null = null
  let disposed = false
  let playRequestId = 0
  let pending: {
    source: string
    controller: AbortController
    promise: Promise<boolean>
  } | null = null

  const isHidden = () => typeof document !== 'undefined' && document.hidden

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
    activeSourceUrl = null
    buffer = null

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

    source.buffer = null
  }

  const closeContext = () => {
    const audioContext = context
    const audioGain = gain
    context = null
    gain = null

    try {
      audioGain?.disconnect()
    } catch {
      // Disconnect is best-effort cleanup.
    }

    try {
      if (audioContext && audioContext.state !== 'closed') {
        void audioContext.close().catch(() => undefined)
      }
    } catch {
      // Closing an already interrupted context is best-effort.
    }
  }

  const stop = (options: StopOptions = {}) => {
    playRequestId += 1
    const request = pending
    pending = null
    request?.controller.abort()
    stopSource()

    if (options.closeContext) {
      closeContext()
    }
  }

  const play = (source: string): Promise<boolean> => {
    if (!source || disposed) return Promise.resolve(false)
    if (isHidden()) {
      stop({ closeContext: true })
      return Promise.resolve(false)
    }

    if (pending?.source === source && !pending.controller.signal.aborted) {
      // A previous autoplay resume can remain pending until a real gesture.
      // Retry synchronously in that gesture without duplicating the load.
      if (context && context.state !== 'running' && context.state !== 'closed') {
        void context.resume().catch(() => undefined)
      }
      return pending.promise
    }

    const reuseActiveSource = activeSourceUrl === source && activeSource !== null
      && context?.state !== 'closed'
    if (reuseActiveSource && context?.state === 'running') return Promise.resolve(true)

    // Keep only the selected soundtrack, never a history of decoded tracks.
    if (!reuseActiveSource) stop()

    const requestId = ++playRequestId
    const controller = new AbortController()
    const isCurrent = () => !disposed && !controller.signal.aborted
      && requestId === playRequestId && !isHidden() && context?.state !== 'closed'
    let cancel!: () => void
    const cancelled = new Promise<boolean>(resolve => {
      cancel = () => resolve(false)
      controller.signal.addEventListener('abort', cancel, { once: true })
    })
    const timeout = setTimeout(() => {
      console.warn('[Games] Soundtrack load timed out', source)
      controller.abort()
    }, GAME_SOUNDTRACK_LOAD_TIMEOUT_MS)

    const task = (async () => {
      const audioContext = getContext()
      if (!audioContext || !gain) return false

      // Safari also exposes `interrupted` after device audio interruptions.
      if (audioContext.state !== 'running') {
        await audioContext.resume()
      }
      if (!isCurrent() || audioContext.state !== 'running') return false
      if (reuseActiveSource) return true

      const response = await fetch(source, { signal: controller.signal })
      if (!isCurrent()) return false
      if (!response.ok) {
        throw new Error(`Unable to load game soundtrack: ${source}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      if (!isCurrent()) return false

      // Decode cannot be aborted. Never retain its late result after cancellation.
      await audioContext.decodeAudioData(arrayBuffer).then(decoded => {
        if (isCurrent()) buffer = decoded
      })
      if (!isCurrent() || !buffer) return false

      if (audioContext.state !== 'running') {
        await audioContext.resume()
      }
      if (!isCurrent() || audioContext.state !== 'running') return false

      const nextSource = audioContext.createBufferSource()
      activeSource = nextSource
      activeSourceUrl = source
      nextSource.buffer = buffer
      nextSource.loop = true
      nextSource.connect(gain)
      nextSource.start()
      return true
    })().catch(error => {
      if (isCurrent()) console.warn('[Games] Soundtrack playback failed', source, error)
      return false
    })

    // Settle callers even when a browser's resume/decode or fetch ignores abort.
    const promise = Promise.race([task, cancelled])
      .then(played => {
        const playing = played && isCurrent()
        if (!playing && requestId === playRequestId) stop({ closeContext: true })
        return playing
      })
      .finally(() => {
        clearTimeout(timeout)
        controller.signal.removeEventListener('abort', cancel)
        if (pending?.controller === controller) pending = null
      })
    pending = { source, controller, promise }
    return promise
  }

  const handlePageHide = () => stop({ closeContext: true })
  const handleVisibilityChange = () => {
    if (isHidden()) handlePageHide()
  }

  const dispose = () => {
    disposed = true
    stop({ closeContext: true })
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', handlePageHide)
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', handlePageHide)

  return {
    isPlaying: () => !disposed && !isHidden() && activeSource !== null && context?.state === 'running',
    setVolume: (value: number) => {
      volume = Math.max(0, Math.min(1, value))
      if (gain && context) gain.gain.setTargetAtTime(volume, context.currentTime, 0.15)
    },
    play,
    stop,
    dispose,
  }
}

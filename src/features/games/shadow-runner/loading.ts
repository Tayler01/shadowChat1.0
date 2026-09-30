export class ShadowRunnerImageLoadError extends Error {
  constructor(public readonly source: string, reason: string) {
    super(`Required image ${reason}: ${source.split('/').pop()}`)
    this.name = 'ShadowRunnerImageLoadError'
  }
}

function loadImage(source: string, signal: AbortSignal, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Image loading cancelled')); return }
    const image = new Image()
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      signal.removeEventListener('abort', abort)
      if (error) { image.removeAttribute('src'); reject(error) } else resolve()
    }
    const abort = () => finish(new Error('Image loading cancelled'))
    const timer = setTimeout(() => finish(new ShadowRunnerImageLoadError(source, 'timed out')), timeoutMs)
    signal.addEventListener('abort', abort, { once: true })
    image.onload = () => image.naturalWidth > 0 ? finish() : finish(new ShadowRunnerImageLoadError(source, 'was empty'))
    image.onerror = () => finish(new ShadowRunnerImageLoadError(source, 'could not load'))
    image.decoding = 'async'
    image.src = source
  })
}

export async function loadShadowRunnerImages(sources: readonly string[], options: {
  signal: AbortSignal
  onProgress?: (loaded: number, total: number) => void
  concurrency?: number
  timeoutMs?: number
}) {
  const unique = [...new Set(sources)]
  const controller = new AbortController()
  const abort = () => controller.abort()
  options.signal.addEventListener('abort', abort, { once: true })
  let index = 0
  let loaded = 0
  try {
    if (options.signal.aborted) throw new Error('Image loading cancelled')
    options.onProgress?.(0, unique.length)
    await Promise.all(Array.from({ length: Math.min(unique.length, Math.max(1, options.concurrency ?? 4)) }, async () => {
      while (index < unique.length) {
        if (controller.signal.aborted) throw new Error('Image loading cancelled')
        const source = unique[index++]
        await loadImage(source, controller.signal, options.timeoutMs ?? 8000)
        if (controller.signal.aborted) throw new Error('Image loading cancelled')
        loaded += 1
        options.onProgress?.(loaded, unique.length)
      }
    }))
  } finally {
    controller.abort()
    options.signal.removeEventListener('abort', abort)
  }
}

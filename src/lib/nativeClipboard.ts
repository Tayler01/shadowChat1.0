import { isNativeAppWebView, NATIVE_APP_MESSAGE_EVENT } from './nativeAppBridge'

const MAX_BYTES = 64 * 1024 * 1024
const CHUNK_BYTES = 192 * 1024
type Metadata = { name: string; type: string; size: number }

export const canRecoverNativeVideoPaste = () => isNativeAppWebView() && window.__SHADOWCHAT_NATIVE_CLIPBOARD__ === true

declare global {
  interface Window { __SHADOWCHAT_NATIVE_CLIPBOARD__?: boolean }
}

export function recoverNativeClipboardVideos(scope: string, signal: AbortSignal): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    let files: Metadata[] | null = null
    let fileIndex = 0
    let offset = 0
    let chunks: Uint8Array<ArrayBuffer>[] = []
    let completedFiles: File[] = []
    let finished = false
    let timer = 0
    const post = (type: string, extra: Record<string, unknown> = {}) => window.ReactNativeWebView?.postMessage(JSON.stringify({ version: 1, type, requestId, scope, ...extra }))
    const finish = (error?: Error) => {
      if (finished) return
      finished = true
      window.clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      window.removeEventListener(NATIVE_APP_MESSAGE_EVENT, handle)
      post('clipboard_cancel')
      chunks = []
      const result = completedFiles
      completedFiles = []
      if (error) reject(error)
      else resolve(result)
    }
    const abort = () => finish(new DOMException('Video paste cancelled.', 'AbortError'))
    const next = () => post('clipboard_next', { index: fileIndex, offset })
    const handle = (event: Event) => {
      const record = (event as CustomEvent<Record<string, unknown>>).detail
      if (!record || record.version !== 1 || record.requestId !== requestId || record.scope !== scope) return
      if (record.type === 'clipboard_error') { finish(new Error(typeof record.error === 'string' ? record.error : 'Video paste failed. Use Attach files.')); return }
      try {
        if (record.type === 'clipboard_manifest') {
          if (files) return
          const metadata = record.files as Metadata[]
          if (!Array.isArray(metadata) || metadata.length < 1 || metadata.length > 3 || metadata.some(file => !file || typeof file.name !== 'string' || file.name.length > 200 || typeof file.type !== 'string' || !file.type.startsWith('video/') || !Number.isSafeInteger(file.size) || file.size <= 0) || metadata.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) throw new Error('This clipboard video is invalid or exceeds 64 MB.')
          files = metadata
          next()
        } else if (record.type === 'clipboard_chunk' && files) {
          if (record.index !== fileIndex || record.offset !== offset) return
          const expected = Math.min(CHUNK_BYTES, files[fileIndex].size - offset)
          if (typeof record.data !== 'string' || record.data.length !== Math.ceil(expected / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(record.data)) throw new Error('This clipboard video was incomplete.')
          const decoded = atob(record.data)
          if (decoded.length !== expected) throw new Error('This clipboard video was incomplete.')
          const chunk = new Uint8Array(decoded.length)
          for (let i = 0; i < decoded.length; i++) chunk[i] = decoded.charCodeAt(i)
          chunks.push(chunk)
          offset += chunk.byteLength
          if (offset === files[fileIndex].size) {
            const file = files[fileIndex]
            completedFiles.push(new File(chunks, file.name, { type: file.type }))
            chunks = []
            fileIndex++
            offset = 0
          }
          if (fileIndex === files.length) finish()
          else next()
        }
      } catch (error) { finish(error instanceof Error ? error : new Error('Video paste failed.')) }
    }
    if (!canRecoverNativeVideoPaste() || !window.ReactNativeWebView) { reject(new Error('Use Attach files to choose this video.')); return }
    if (signal.aborted) { reject(new DOMException('Video paste cancelled.', 'AbortError')); return }
    signal.addEventListener('abort', abort, { once: true })
    window.addEventListener(NATIVE_APP_MESSAGE_EVENT, handle)
    timer = window.setTimeout(() => finish(new Error('Video paste timed out. Use Attach files.')), 120_000)
    post('clipboard_begin')
  })
}

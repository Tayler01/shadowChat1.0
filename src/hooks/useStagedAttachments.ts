import { useCallback, useEffect, useRef, useState } from 'react'
import { classifyComposerFile, MAX_STAGED_ATTACHMENTS, type ComposerFileKind } from '../lib/composerAttachments'
import { createClientMessageId } from '../lib/optimisticMessages'
import { enqueuePendingUploadCleanup, retryPendingUploadCleanup } from '../lib/pendingUploadCleanup'

export type AttachmentStageStatus = 'staged' | 'uploading' | 'sending' | 'failed'

export interface AttachmentStageView {
  id: string
  clientMessageId: string
  sendAttempted: boolean
  file: File
  kind: ComposerFileKind
  previewUrl: string | null
  status: AttachmentStageStatus
  progress: number
  error: string | null
}

type AttachmentStage<TUploaded> = AttachmentStageView & {
  uploaded?: TUploaded
  cleanupScopeKey?: string
  cleanupNamespace?: string
}

export interface StagedAttachmentOptions<TUploaded> {
  scopeKey: string
  maxFiles?: number
  validate: (file: File) => void
  upload: (file: File, options: { signal: AbortSignal; onProgress: (percent: number) => void }) => Promise<TUploaded>
  send: (uploaded: TUploaded, file: File, clientMessageId: string) => Promise<boolean>
  cleanup?: (uploaded: TUploaded) => Promise<void>
  cleanupPath?: (uploaded: TUploaded) => string
  cleanupScopeKey?: string
  cleanupNamespace?: string
  cleanupPersisted?: (path: string) => Promise<void>
  errorMessage?: (error: unknown, file: File) => string
}

let nextAttachmentId = 0
const makeId = () => `attachment-${Date.now()}-${++nextAttachmentId}`
const getPreviewUrl = (file: File, kind: ComposerFileKind) =>
  (kind === 'image' || kind === 'video') && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(file)
    : null

export function useStagedAttachments<TUploaded>(options: StagedAttachmentOptions<TUploaded>) {
  const [items, setItems] = useState<AttachmentStage<TUploaded>[]>([])
  const itemsRef = useRef<AttachmentStage<TUploaded>[]>([])
  const controllersRef = useRef(new Map<string, AbortController>())
  const sendingRef = useRef(new Set<string>())
  const mountedRef = useRef(true)
  const scopeRef = useRef(options.scopeKey)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const update = useCallback((change: (current: AttachmentStage<TUploaded>[]) => AttachmentStage<TUploaded>[]) => {
    const next = change(itemsRef.current)
    itemsRef.current = next
    if (mountedRef.current) setItems(next)
  }, [])

  const cleanupDefinite = useCallback((item: AttachmentStage<TUploaded>, uploaded: TUploaded, config: StagedAttachmentOptions<TUploaded>) => {
    if (!config.cleanup) return
    void config.cleanup(uploaded).catch(() => {
      const path = config.cleanupPath?.(uploaded)
      if (path && item.cleanupScopeKey && item.cleanupNamespace) {
        enqueuePendingUploadCleanup(item.cleanupScopeKey, item.cleanupNamespace, path)
      }
    })
  }, [])

  const release = useCallback((item: AttachmentStage<TUploaded>, config: StagedAttachmentOptions<TUploaded>) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
    // An attempted send may have committed remotely despite a timeout/error.
    if (!item.sendAttempted && item.uploaded !== undefined) cleanupDefinite(item, item.uploaded, config)
  }, [cleanupDefinite])

  const addFiles = useCallback((files: File[]): { accepted: number; errors: string[] } => {
    const errors: string[] = []
    const accepted: AttachmentStage<TUploaded>[] = []
    const config = optionsRef.current
    const maxFiles = config.maxFiles ?? MAX_STAGED_ATTACHMENTS
    for (const file of files) {
      if (itemsRef.current.length + accepted.length >= maxFiles) {
        errors.push(`You can attach up to ${maxFiles} files at once.`)
        break
      }
      try {
        config.validate(file)
        const { kind } = classifyComposerFile(file)
        accepted.push({ id: makeId(), clientMessageId: createClientMessageId(), sendAttempted: false, cleanupScopeKey: config.cleanupScopeKey, cleanupNamespace: config.cleanupNamespace, file, kind, previewUrl: getPreviewUrl(file, kind), status: 'staged', progress: 0, error: null })
      } catch (error) {
        errors.push(config.errorMessage?.(error, file) || (error instanceof Error ? error.message : 'Unsupported attachment'))
      }
    }
    if (accepted.length > 0) update(current => [...current, ...accepted])
    return { accepted: accepted.length, errors }
  }, [update])

  const remove = useCallback((id: string) => {
    const item = itemsRef.current.find(candidate => candidate.id === id)
    if (!item || item.status === 'sending') return
    controllersRef.current.get(id)?.abort()
    controllersRef.current.delete(id)
    update(current => current.filter(candidate => candidate.id !== id))
    release(item, optionsRef.current)
  }, [release, update])

  const cancel = useCallback((id: string) => {
    controllersRef.current.get(id)?.abort()
  }, [])

  const sendOne = useCallback(async (id: string, send?: StagedAttachmentOptions<TUploaded>['send']): Promise<boolean> => {
    if (sendingRef.current.has(id)) return false
    const initial = itemsRef.current.find(item => item.id === id)
    if (!initial) return false
    const scope = scopeRef.current
    const config = optionsRef.current
    sendingRef.current.add(id)
    let uploaded = initial.uploaded
    const controller = new AbortController()
    controllersRef.current.set(id, controller)
    try {
      if (uploaded === undefined) {
        update(current => current.map(item => item.id === id ? { ...item, status: 'uploading', progress: 0, error: null } : item))
        uploaded = await config.upload(initial.file, {
          signal: controller.signal,
          onProgress: percent => {
            if (scope !== scopeRef.current || controller.signal.aborted) return
            update(current => current.map(item => item.id === id ? { ...item, progress: Math.max(0, Math.min(100, percent)) } : item))
          },
        })
        if (scope !== scopeRef.current || controller.signal.aborted) {
          cleanupDefinite(initial, uploaded, config)
          if (scope === scopeRef.current && itemsRef.current.some(item => item.id === id)) {
            update(current => current.map(item => item.id === id ? { ...item, status: 'failed', progress: 0, error: 'Upload canceled. You can retry.' } : item))
          }
          return false
        }
        const completedUpload = uploaded
        update(current => current.map(item => item.id === id ? { ...item, uploaded: completedUpload } : item))
      }
      if (scope !== scopeRef.current || controller.signal.aborted) return false
      update(current => current.map(item => item.id === id ? { ...item, status: 'sending', progress: 100, error: null } : item))
      update(current => current.map(item => item.id === id ? { ...item, sendAttempted: true } : item))
      const sent = await (send ?? config.send)(uploaded, initial.file, initial.clientMessageId)
      if (!sent) {
        update(current => current.map(item => item.id === id ? { ...item, status: 'failed', error: 'Message was not sent. Try again.' } : item))
        return false
      }
      update(current => current.filter(item => item.id !== id))
      if (initial.previewUrl) URL.revokeObjectURL(initial.previewUrl)
      return true
    } catch (error) {
      if (scope === scopeRef.current && itemsRef.current.some(item => item.id === id)) {
        const message = controller.signal.aborted ? 'Upload canceled. You can retry.' : config.errorMessage?.(error, initial.file) || (error instanceof Error ? error.message : 'Attachment failed')
        update(current => current.map(item => item.id === id ? { ...item, status: 'failed', error: message } : item))
      }
      return false
    } finally {
      sendingRef.current.delete(id)
      controllersRef.current.delete(id)
    }
  }, [cleanupDefinite, update])

  const sendAll = useCallback(async (send?: StagedAttachmentOptions<TUploaded>['send']) => {
    for (const item of [...itemsRef.current]) {
      if (!(await sendOne(item.id, send))) return false
    }
    return true
  }, [sendOne])

  useEffect(() => {
    if (scopeRef.current === options.scopeKey) return
    const old = itemsRef.current
    const config = optionsRef.current
    scopeRef.current = options.scopeKey
    controllersRef.current.forEach(controller => controller.abort())
    controllersRef.current.clear()
    itemsRef.current = []
    setItems([])
    old.forEach(item => {
      // A send in flight has an uncertain remote outcome; do not remove its object.
      if (sendingRef.current.has(item.id) && item.status === 'sending') {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
      } else release(item, config)
    })
  }, [options.scopeKey, release])

  useEffect(() => {
    const { cleanupScopeKey, cleanupNamespace, cleanupPersisted } = optionsRef.current
    if (!cleanupScopeKey || !cleanupNamespace || !cleanupPersisted) return
    let active = true
    const retry = () => { void retryPendingUploadCleanup(cleanupScopeKey, cleanupNamespace, cleanupPersisted, () => active) }
    retry()
    window.addEventListener('online', retry)
    return () => {
      active = false
      window.removeEventListener('online', retry)
    }
  }, [options.cleanupScopeKey, options.cleanupNamespace, options.cleanupPersisted])

  useEffect(() => {
    mountedRef.current = true
    const controllers = controllersRef.current
    return () => {
      mountedRef.current = false
      scopeRef.current = `unmounted:${scopeRef.current}`
      controllers.forEach(controller => controller.abort())
      itemsRef.current.forEach(item => release(item, optionsRef.current))
      itemsRef.current = []
    }
  }, [release])

  return {
    items: (scopeRef.current === options.scopeKey ? items : []) as AttachmentStageView[],
    addFiles,
    remove,
    cancel,
    retry: sendOne,
    sendAll,
    busy: scopeRef.current === options.scopeKey && items.some(item => item.status === 'uploading' || item.status === 'sending'),
  }
}

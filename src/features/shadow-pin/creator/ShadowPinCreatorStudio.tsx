import {
  useCallback,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Film,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  RotateCcw,
  Save,
  Upload,
  X,
} from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../../../hooks/useAuth'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import { cn } from '../../../lib/utils'
import { useShadowPinCategories } from '../hooks/useShadowPinCategories'
import type { ShadowPinImage } from '../types'
import {
  createCreatorDraft,
  deleteCreatorDraft,
  listCreatorDrafts,
  publishCreatorDraft,
  inspectCreatorVideoFile,
  stageCreatorDraftMedia,
  syncCreatorDraftStatus,
  updateCreatorDraft,
} from './creatorApi'
import {
  CREATOR_STEPS,
  createInitialCreatorState,
  creatorFileMatchesFingerprint,
  creatorReducer,
  inferCreatorSourceKind,
  shouldPreferLocalCreatorDraft,
  validateCreatorStep,
  type ShadowPinCreatorAction,
  type ShadowPinCreatorStep,
} from './creatorModel'
import {
  clearCreatorLocalDraft,
  loadCreatorLocalDraft,
  saveCreatorLocalDraft,
} from './creatorLocalStore'
import type { ShadowPinCreatorAsset, ShadowPinCreatorDraftBundle } from './creatorTypes'
import { validateShadowPinFile } from '../api/shadowPinApi'
import {
  enterCreatorStudioHistory,
  replaceCreatorStudioHistory,
  requestCreatorStudioClose,
} from './creatorHistory'

export type ShadowPinCreatorStudioProps = {
  open: boolean
  initialCategoryId?: string
  initialMediaUrl?: string
  initialTitle?: string
  targetImage?: ShadowPinImage | null
  onClose: () => void
  onPublished: (image: ShadowPinImage) => void | Promise<void>
}

const STEP_LABELS: Record<ShadowPinCreatorStep, string> = {
  media: 'Media',
  details: 'Details',
  preview: 'Preview',
  publish: 'Publish',
}

const sourceKey = (values: ReturnType<typeof createInitialCreatorState>['values']) => JSON.stringify({
  kind: inferCreatorSourceKind(values),
  url: values.sourceUrl.trim(),
  file: values.fileFingerprint,
})

const isAssetReady = (asset: ShadowPinCreatorAsset | null) => (
  asset?.state === 'ready' || asset?.state === 'publish_ready'
)

const statusLabel = (operation: ReturnType<typeof createInitialCreatorState>['operation']) => ({
  idle: '',
  restoring: 'Restoring draft',
  saving: 'Saving draft',
  saved: 'Draft saved',
  uploading: 'Uploading media',
  processing: 'Processing media',
  publishing: 'Publishing Pin',
  published: 'Pin published',
  failed: 'Draft needs attention',
}[operation])

const youtubePreview = (value: string) => {
  try {
    const url = new URL(value)
    const id = url.hostname.includes('youtu.be')
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') || url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1]
    return id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : ''
  } catch {
    return ''
  }
}

function MediaPreview({
  objectUrl,
  sourceUrl,
  fileType,
  asset,
  title,
}: {
  objectUrl: string
  sourceUrl: string
  fileType: string
  asset: ShadowPinCreatorAsset | null
  title: string
}) {
  const previewUrl = objectUrl || asset?.playbackUrl || asset?.previewUrl || sourceUrl
  const posterUrl = asset?.previewUrl || youtubePreview(sourceUrl)
  const video = fileType.startsWith('video/') || Boolean(asset?.playbackUrl) || /\.(mp4|mov|m4v|webm)(?:$|\?)/i.test(previewUrl)

  if (!previewUrl && !posterUrl) {
    return (
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-panel)] bg-[rgba(255,255,255,0.025)] text-[var(--text-muted)]">
        <div className="text-center"><ImageIcon className="mx-auto mb-2 h-8 w-8" /><p>Choose media to preview it here.</p></div>
      </div>
    )
  }

  if (video) {
    return <video src={previewUrl} poster={posterUrl || undefined} controls playsInline preload="metadata" className="aspect-[4/5] max-h-[58dvh] w-full rounded-[var(--radius-lg)] bg-black object-contain" aria-label={title || 'Draft video preview'} />
  }

  return <img src={posterUrl || previewUrl} alt={title || 'Draft Pin preview'} className="aspect-[4/5] max-h-[58dvh] w-full rounded-[var(--radius-lg)] bg-black/30 object-contain" />
}

export function ShadowPinCreatorStudio({
  open,
  initialCategoryId = '',
  initialMediaUrl = '',
  initialTitle = '',
  targetImage = null,
  onClose,
  onPublished,
}: ShadowPinCreatorStudioProps) {
  const { user } = useAuth()
  const categoriesState = useShadowPinCategories()
  const [state, dispatch] = useReducer(
    creatorReducer,
    { categoryId: initialCategoryId, targetImageId: targetImage?.id ?? null },
    seed => createInitialCreatorState(seed.categoryId, seed.targetImageId)
  )
  const [asset, setAsset] = useState<ShadowPinCreatorAsset | null>(null)
  const [availableDrafts, setAvailableDrafts] = useState<ShadowPinCreatorDraftBundle[]>([])
  const [objectUrl, setObjectUrl] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [mediaInspecting, setMediaInspecting] = useState(false)
  const [mediaInspectionError, setMediaInspectionError] = useState<string | null>(null)
  const [recoveryPending, setRecoveryPending] = useState(false)
  const [draftSwitching, setDraftSwitching] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const saveTimerRef = useRef<number | null>(null)
  const savePromiseRef = useRef<{
    contextToken: number
    requestToken: number
    promise: Promise<ShadowPinCreatorDraftBundle>
  } | null>(null)
  const stagedSourceKeyRef = useRef('')
  const uploadAbortRef = useRef<AbortController | null>(null)
  const restoredRef = useRef(false)
  const stateRef = useRef(state)
  const saveContextTokenRef = useRef(0)
  const saveRequestTokenRef = useRef(0)
  const restoreRequestTokenRef = useRef(0)
  const closeInFlightRef = useRef(false)
  const closeRequestTokenRef = useRef(0)
  const popstateCloseRef = useRef<() => void>(() => undefined)
  const titleId = useId()
  const { isReducedMotion } = useComfortPreferences()
  stateRef.current = state

  const applyAsyncAction = useCallback((action: ShadowPinCreatorAction) => {
    stateRef.current = creatorReducer(stateRef.current, action)
    dispatch(action)
  }, [])

  useEffect(() => {
    if (open) return
    restoredRef.current = false
    restoreRequestTokenRef.current += 1
    saveContextTokenRef.current += 1
    saveRequestTokenRef.current += 1
    closeRequestTokenRef.current += 1
    closeInFlightRef.current = false
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    savePromiseRef.current = null
    stagedSourceKeyRef.current = ''
    setAsset(null)
    setAvailableDrafts([])
    setTagsText('')
    setMediaInspecting(false)
    setMediaInspectionError(null)
    setRecoveryPending(false)
    setDraftSwitching(false)
    dispatch({ type: 'reset', categoryId: initialCategoryId, targetImageId: targetImage?.id ?? null })
  }, [initialCategoryId, open, targetImage?.id])

  useEffect(() => {
    if (!open) return
    enterCreatorStudioHistory()
    const handlePopState = () => popstateCloseRef.current()
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [open])

  useEffect(() => {
    if (!state.values.file) {
      setObjectUrl('')
      return
    }
    const next = URL.createObjectURL(state.values.file)
    setObjectUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [state.values.file])

  useEffect(() => {
    if (!open || !user?.id || restoredRef.current) return
    restoredRef.current = true
    const restoreRequestToken = ++restoreRequestTokenRef.current
    setRecoveryPending(true)
    dispatch({ type: 'restore-started' })
    const storedLocal = initialMediaUrl ? null : loadCreatorLocalDraft(user.id)
    const local = storedLocal?.targetImageId === (targetImage?.id ?? null) ? storedLocal : null
    const targetValues = targetImage ? {
      categoryId: targetImage.category_id || initialCategoryId,
      title: targetImage.title,
      description: targetImage.description || '',
      tags: targetImage.tags || [],
      sourceMode: targetImage.source_type === 'url_import' || targetImage.source_type === 'external_embed' ? 'url' as const : 'file' as const,
      sourceUrl: targetImage.source_url || '',
      keepExistingMedia: true,
    } : initialMediaUrl ? {
      categoryId: initialCategoryId,
      title: initialTitle,
      description: '',
      tags: [],
      sourceMode: 'url' as const,
      sourceUrl: initialMediaUrl,
      keepExistingMedia: false,
    } : null
    if (local) {
      applyAsyncAction({
        type: 'restored',
        values: local.values,
        step: local.step,
        recovered: true,
        clientMutationId: local.clientMutationId,
        targetImageId: local.targetImageId,
        dirtyRevision: local.dirtyRevision,
        savedRevision: local.savedRevision,
        updatedAt: local.updatedAt,
      })
      setTagsText(local.values.tags.join(', '))
    }
    void listCreatorDrafts()
      .then(drafts => {
        if (restoreRequestToken !== restoreRequestTokenRef.current) return
        const activeDrafts = drafts.filter(bundle => (
          bundle.draft.state !== 'published' &&
          bundle.draft.state !== 'abandoned' &&
          bundle.draft.targetImageId === (targetImage?.id ?? null)
        ))
        setAvailableDrafts(activeDrafts)
        const selected = initialMediaUrl
          ? undefined
          : (local?.draftId
              ? activeDrafts.find(bundle => bundle.draft.id === local.draftId)
              : local
                ? undefined
                : activeDrafts[0])
        if (!selected) {
          const values = local?.values ?? targetValues ?? { categoryId: initialCategoryId }
          applyAsyncAction({
            type: 'restored',
            values,
            step: local?.step,
            recovered: Boolean(local),
            clientMutationId: local?.clientMutationId,
            targetImageId: local?.targetImageId ?? targetImage?.id ?? null,
            dirtyRevision: local?.dirtyRevision,
            savedRevision: local?.savedRevision,
            updatedAt: local?.updatedAt,
          })
          if (targetValues) setTagsText(targetValues.tags.join(', '))
          return
        }
        const serverValues = {
          categoryId: selected.draft.categoryId || initialCategoryId,
          title: selected.draft.title,
          description: selected.draft.description,
          tags: selected.draft.tags,
          sourceMode: selected.draft.sourceKind === 'image_url' || selected.draft.sourceKind === 'external_video' ? 'url' as const : 'file' as const,
          sourceUrl: selected.asset?.sourceUrl || local?.values.sourceUrl || '',
          fileFingerprint: local?.draftId === selected.draft.id ? local.values.fileFingerprint : null,
          keepExistingMedia: local?.draftId === selected.draft.id
            ? Boolean(local.values.keepExistingMedia || selected.asset)
            : Boolean(selected.asset),
        }
        const useLocal = Boolean(local && shouldPreferLocalCreatorDraft(local, selected.draft))
        const restoredValues = useLocal && local
          ? {
              ...serverValues,
              ...local.values,
              keepExistingMedia: Boolean(local.values.keepExistingMedia || selected.asset),
            }
          : serverValues
        applyAsyncAction({
          type: 'restored',
          values: restoredValues,
          draft: selected.draft,
          step: local?.step,
          recovered: true,
          clientMutationId: selected.draft.clientMutationId,
          targetImageId: selected.draft.targetImageId,
          dirtyRevision: useLocal ? local?.dirtyRevision : undefined,
          savedRevision: useLocal ? local?.savedRevision : undefined,
          updatedAt: useLocal ? local?.updatedAt : selected.draft.updatedAt,
        })
        setTagsText(restoredValues.tags.join(', '))
        setAsset(selected.asset)
        if (selected.asset) stagedSourceKeyRef.current = sourceKey({ ...createInitialCreatorState().values, ...restoredValues })
      })
      .catch(error => {
        if (restoreRequestToken !== restoreRequestTokenRef.current) return
        applyAsyncAction({ type: 'operation', operation: 'failed', error: error instanceof Error ? error.message : 'Draft recovery is unavailable.' })
      })
      .finally(() => {
        if (restoreRequestToken === restoreRequestTokenRef.current) setRecoveryPending(false)
      })
  }, [applyAsyncAction, initialCategoryId, initialMediaUrl, initialTitle, open, targetImage, user?.id])

  useEffect(() => {
    if (!targetImage || asset) return
    setAsset({
      id: `existing:${targetImage.id}`,
      draftId: '',
      generation: 0,
      assetKind: targetImage.media_type === 'video' ? 'video' : targetImage.media_type === 'external_video' ? 'external_video' : 'image',
      provider: targetImage.provider || null,
      state: 'publish_ready',
      storagePath: targetImage.image_path || null,
      posterPath: targetImage.thumbnail_path || targetImage.medium_path || null,
      previewUrl: targetImage.medium_url || targetImage.thumbnail_url || targetImage.image_url,
      playbackUrl: targetImage.video_playback_url || null,
      hlsUrl: targetImage.video_hls_url || null,
      embedUrl: targetImage.video_embed_url || null,
      mimeType: targetImage.image_content_type || null,
      sizeBytes: targetImage.image_size_bytes || targetImage.video_size_bytes || null,
      width: targetImage.image_width || null,
      height: targetImage.image_height || null,
      durationSeconds: targetImage.duration_seconds || null,
      sourceUrl: targetImage.source_url || null,
      providerAssetId: targetImage.provider_asset_id || null,
      errorCode: null,
      errorMessage: null,
    })
    stagedSourceKeyRef.current = sourceKey({
      ...createInitialCreatorState().values,
      categoryId: targetImage.category_id || initialCategoryId,
      sourceMode: targetImage.source_type === 'url_import' || targetImage.source_type === 'external_embed' ? 'url' : 'file',
      sourceUrl: targetImage.source_url || '',
      keepExistingMedia: true,
    })
  }, [asset, initialCategoryId, targetImage])

  useEffect(() => {
    if (!open || !user?.id) return
    saveCreatorLocalDraft(user.id, state)
  }, [open, state, user?.id])

  const saveNow = useCallback(async () => {
    const contextToken = saveContextTokenRef.current
    if (savePromiseRef.current?.contextToken === contextToken) {
      return savePromiseRef.current.promise
    }
    const snapshot = stateRef.current
    const requestedRevision = snapshot.dirtyRevision
    const requestToken = ++saveRequestTokenRef.current
    const draftKey = snapshot.draft?.id ?? `new:${snapshot.clientMutationId}`
    applyAsyncAction({ type: 'operation', operation: 'saving', error: null })
    const save = (snapshot.draft
      ? updateCreatorDraft(snapshot.draft, snapshot.values)
      : createCreatorDraft(snapshot.values, snapshot.targetImageId, snapshot.clientMutationId))
      .then(bundle => {
        const current = stateRef.current
        const currentDraftKey = current.draft?.id ?? `new:${current.clientMutationId}`
        if (
          contextToken !== saveContextTokenRef.current ||
          requestToken !== saveRequestTokenRef.current ||
          currentDraftKey !== draftKey
        ) return bundle
        setAsset(current => bundle.asset ?? current)
        applyAsyncAction({ type: 'draft-saved', draft: bundle.draft, savedRevision: requestedRevision })
        return bundle
      })
      .catch(error => {
        if (contextToken === saveContextTokenRef.current && requestToken === saveRequestTokenRef.current) {
          applyAsyncAction({ type: 'operation', operation: 'failed', error: error instanceof Error ? error.message : 'Unable to save this draft.' })
        }
        throw error
      })
      .finally(() => {
        if (
          savePromiseRef.current?.contextToken === contextToken &&
          savePromiseRef.current.requestToken === requestToken
        ) savePromiseRef.current = null
      })
    savePromiseRef.current = { contextToken, requestToken, promise: save }
    return save
  }, [applyAsyncAction])

  const flushCurrentDraft = useCallback(async () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
    if (user?.id) saveCreatorLocalDraft(user.id, stateRef.current)
    const contextToken = saveContextTokenRef.current
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = stateRef.current
        const hasUnsavedPrefill = !current.draft && Boolean(
          current.values.sourceUrl.trim() ||
          current.values.fileFingerprint ||
          current.values.keepExistingMedia ||
          current.values.title.trim() ||
          current.values.description.trim()
        )
        if (
          current.dirtyRevision <= current.savedRevision &&
          !savePromiseRef.current &&
          !hasUnsavedPrefill
        ) return true
        await saveNow()
        if (contextToken !== saveContextTokenRef.current) return false
        if (user?.id) saveCreatorLocalDraft(user.id, stateRef.current)
      }
      return stateRef.current.dirtyRevision <= stateRef.current.savedRevision
    } catch {
      // The persisted dirty snapshot is the reliable retry queue when the
      // network is unavailable during Back, close, or a draft switch.
      return false
    }
  }, [saveNow, user?.id])

  useEffect(() => {
    if (!open || recoveryPending || draftSwitching || state.operation === 'restoring' || state.dirtyRevision <= state.savedRevision) return
    if (state.values.sourceMode === 'file'
      ? !state.values.fileFingerprint && !state.values.keepExistingMedia
      : !state.values.sourceUrl.trim()) return
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => { void saveNow().catch(() => undefined) }, 700)
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [draftSwitching, open, recoveryPending, saveNow, state.dirtyRevision, state.operation, state.savedRevision, state.values.categoryId, state.values.fileFingerprint, state.values.keepExistingMedia, state.values.sourceMode, state.values.sourceUrl])

  const stageMedia = useCallback(async () => {
    // Staging is revision guarded on the server. Drain any in-flight or
    // scheduled metadata save first so the media request cannot race a newer
    // draft revision and fail after the user presses Continue.
    const flushed = await flushCurrentDraft()
    const current = stateRef.current
    if (!flushed || !current.draft) {
      throw new Error('Save this draft before staging its media.')
    }
    const bundle = { draft: current.draft, asset }
    const currentValues = current.values
    const currentKey = sourceKey(currentValues)
    if (currentValues.keepExistingMedia && asset) {
      if (isAssetReady(asset)) return { draft: bundle.draft, asset: bundle.asset ?? asset }
      const synced = await syncCreatorDraftStatus(bundle.draft)
      setAsset(current => synced.asset ?? current)
      return synced
    }
    if (isAssetReady(asset) && stagedSourceKeyRef.current === currentKey) return { draft: bundle.draft, asset }
    uploadAbortRef.current?.abort()
    const controller = new AbortController()
    uploadAbortRef.current = controller
    dispatch({ type: 'operation', operation: inferCreatorSourceKind(currentValues).includes('upload') ? 'uploading' : 'processing', progress: 0, error: null })
    try {
      const staged = await stageCreatorDraftMedia(bundle.draft, currentValues, {
        signal: controller.signal,
        onProgress: progress => dispatch({ type: 'operation', operation: 'uploading', progress }),
      })
      setAsset(current => staged.asset ?? current)
      stagedSourceKeyRef.current = currentKey
      applyAsyncAction({ type: 'draft-saved', draft: staged.draft, savedRevision: current.dirtyRevision })
      return staged
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') {
        dispatch({ type: 'operation', operation: 'failed', error: error instanceof Error ? error.message : 'Unable to stage media.' })
      }
      throw error
    } finally {
      if (uploadAbortRef.current === controller) uploadAbortRef.current = null
    }
  }, [applyAsyncAction, asset, flushCurrentDraft])

  const openAvailableDraft = async (bundle: ShadowPinCreatorDraftBundle) => {
    if (bundle.draft.id === stateRef.current.draft?.id || draftSwitching) return
    setDraftSwitching(true)
    uploadAbortRef.current?.abort()
    uploadAbortRef.current = null
    const flushed = await flushCurrentDraft()
    if (!flushed) {
      setDraftSwitching(false)
      return
    }
    saveContextTokenRef.current += 1
    saveRequestTokenRef.current += 1
    savePromiseRef.current = null
    const values = {
      categoryId: bundle.draft.categoryId || initialCategoryId,
      title: bundle.draft.title,
      description: bundle.draft.description,
      tags: bundle.draft.tags,
      sourceMode: bundle.draft.sourceKind === 'image_url' || bundle.draft.sourceKind === 'external_video' ? 'url' as const : 'file' as const,
      sourceUrl: bundle.asset?.sourceUrl || '',
      fileFingerprint: null,
      keepExistingMedia: Boolean(bundle.asset),
    }
    applyAsyncAction({
      type: 'restored',
      values,
      draft: bundle.draft,
      step: 'media',
      recovered: true,
      clientMutationId: bundle.draft.clientMutationId,
      targetImageId: bundle.draft.targetImageId,
      updatedAt: bundle.draft.updatedAt,
    })
    setTagsText(bundle.draft.tags.join(', '))
    setAsset(bundle.asset)
    stagedSourceKeyRef.current = bundle.asset
      ? sourceKey({ ...createInitialCreatorState().values, ...values })
      : ''
    setDraftSwitching(false)
  }

  const goTo = async (nextStep: ShadowPinCreatorStep) => {
    const currentIndex = CREATOR_STEPS.indexOf(state.step)
    const nextIndex = CREATOR_STEPS.indexOf(nextStep)
    if (nextIndex > currentIndex) {
      if (mediaInspectionError) {
        dispatch({ type: 'operation', operation: 'failed', error: mediaInspectionError })
        return
      }
      const errors = validateCreatorStep(state.step, state.values)
      if (errors.length > 0) {
        dispatch({ type: 'operation', operation: 'failed', error: errors[0] })
        return
      }
      if (state.step === 'details') {
        try { await stageMedia() } catch { return }
      }
    }
    dispatch({ type: 'set-step', step: nextStep })
  }

  const saveAndExit = useCallback(async () => {
    if (closeInFlightRef.current) return
    closeInFlightRef.current = true
    const closeRequestToken = ++closeRequestTokenRef.current
    await flushCurrentDraft()
    if (closeRequestToken !== closeRequestTokenRef.current) return
    requestCreatorStudioClose(onClose)
  }, [flushCurrentDraft, onClose])

  popstateCloseRef.current = () => {
    if (closeInFlightRef.current) {
      closeRequestTokenRef.current += 1
      onClose()
      return
    }
    closeInFlightRef.current = true
    void flushCurrentDraft().finally(onClose)
  }
  const dialogRef = useDialogAccessibility<HTMLDivElement>({
    open,
    onClose: () => { void saveAndExit() },
    initialFocusRef: closeRef,
  })

  const discard = async () => {
    if (!window.confirm('Discard this ShadowPin draft and its staged media?')) return
    uploadAbortRef.current?.abort()
    if (state.draft) {
      try { await deleteCreatorDraft(state.draft, asset) } catch (error) {
        dispatch({ type: 'operation', operation: 'failed', error: error instanceof Error ? error.message : 'Unable to discard draft.' })
        return
      }
    }
    if (user?.id) clearCreatorLocalDraft(user.id)
    dispatch({ type: 'reset', categoryId: initialCategoryId })
    setAsset(null)
    setTagsText('')
    replaceCreatorStudioHistory()
    onClose()
  }

  const retryProcessing = async () => {
    if (!state.draft) return
    dispatch({ type: 'operation', operation: 'processing', error: null })
    try {
      const bundle = await syncCreatorDraftStatus(state.draft)
      setAsset(current => bundle.asset ?? current)
      applyAsyncAction({ type: 'draft-saved', draft: bundle.draft, savedRevision: state.dirtyRevision })
    } catch (error) {
      dispatch({ type: 'operation', operation: 'failed', error: error instanceof Error ? error.message : 'Unable to refresh processing.' })
    }
  }

  const publish = async () => {
    const errors = validateCreatorStep('publish', state.values)
    if (errors.length || !state.publishConfirmed) {
      dispatch({ type: 'operation', operation: 'failed', error: errors[0] || 'Confirm that this Pin is ready to publish.' })
      return
    }
    let bundle: ShadowPinCreatorDraftBundle
    try {
      bundle = await stageMedia()
      if (!isAssetReady(bundle.asset)) {
        bundle = await syncCreatorDraftStatus(bundle.draft)
        setAsset(current => bundle.asset ?? current)
      }
      if (!isAssetReady(bundle.asset)) throw new Error('Media is still processing. Refresh its status before publishing.')
      dispatch({ type: 'operation', operation: 'publishing', error: null })
      const result = await publishCreatorDraft(bundle.draft, bundle.asset)
      dispatch({ type: 'operation', operation: 'published', progress: 100 })
      if (user?.id) clearCreatorLocalDraft(user.id)
      replaceCreatorStudioHistory()
      await onPublished(result.image)
      onClose()
    } catch (error) {
      dispatch({ type: 'operation', operation: 'failed', error: error instanceof Error ? error.message : 'Unable to publish this Pin.' })
    }
  }

  useEffect(() => () => {
    uploadAbortRef.current?.abort()
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
  }, [])

  if (!open) return null
  const stepIndex = CREATOR_STEPS.indexOf(state.step)
  const busy = recoveryPending || draftSwitching || mediaInspecting || ['restoring', 'saving', 'uploading', 'processing', 'publishing'].includes(state.operation)
  const fileNeedsReselection = state.values.sourceMode === 'file' && !state.values.file && Boolean(state.values.fileFingerprint)
  const previewFileType = state.values.file?.type || state.values.fileFingerprint?.type || asset?.mimeType || ''

  const studio = (
    <div className="fixed inset-0 z-[138] bg-[var(--bg-app)] text-[var(--text-primary)]" data-testid="shadow-pin-creator-studio">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-[var(--shadowchat-visual-viewport-height,100dvh)] w-full flex-col overflow-hidden">
        <header className="shrink-0 border-b border-[var(--border-panel)] bg-[rgba(5,6,8,0.96)] px-2 pb-2 pt-[calc(env(safe-area-inset-top)_+_0.35rem)] backdrop-blur-md sm:px-4 sm:pt-3">
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <button ref={closeRef} type="button" onClick={() => void saveAndExit()} className="inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-white/5" aria-label="Save draft and exit Creator Studio"><X className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1">
              <p className="text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[var(--theme-accent-readable)]">ShadowPin</p>
              <h1 id={titleId} className="truncate text-lg font-semibold">Creator Studio</h1>
            </div>
            <button type="button" onClick={() => void saveAndExit()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-secondary)] disabled:opacity-50"><Save className="h-4 w-4" /> Save & exit</button>
          </div>
          <nav className="mx-auto mt-2 grid max-w-3xl grid-cols-4 gap-1" aria-label="Creator Studio steps">
            {CREATOR_STEPS.map((step, index) => (
              <button key={step} type="button" onClick={() => void goTo(step)} disabled={busy || index > stepIndex + 1} className={cn('min-h-11 rounded-full px-2 text-xs font-semibold transition-colors', state.step === step ? 'border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]' : index < stepIndex ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)] disabled:opacity-55')} aria-current={state.step === step ? 'step' : undefined}>{index + 1}. {STEP_LABELS[step]}</button>
            ))}
          </nav>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 pb-[calc(env(safe-area-inset-bottom)_+_6rem)] sm:px-5" data-testid={`creator-step-${state.step}`}>
          <div className="mx-auto max-w-3xl">
            <fieldset disabled={busy} className="contents" aria-label="Creator Studio editor" aria-busy={busy}>
            {state.step === 'media' && availableDrafts.length > 1 && (
              <section className="mb-4 rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-white/[0.025] p-3" aria-labelledby="creator-drafts-title">
                <div className="flex items-center justify-between gap-3">
                  <div><h2 id="creator-drafts-title" className="text-sm font-semibold">Your drafts</h2><p className="text-xs text-[var(--text-muted)]">Resume saved work or anything that needs attention.</p></div>
                  <span className="rounded-full border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-muted)]">{availableDrafts.length}</span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {availableDrafts.map(bundle => {
                    const selected = bundle.draft.id === state.draft?.id
                    const needsAttention = bundle.draft.state === 'failed' || Boolean(bundle.draft.lastErrorMessage)
                    return (
                      <button
                        key={bundle.draft.id}
                        type="button"
                        onClick={() => void openAvailableDraft(bundle)}
                        disabled={busy || selected}
                        className={cn('min-h-14 rounded-[var(--radius-md)] border px-3 py-2 text-left', selected ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)]' : 'border-[var(--border-subtle)] bg-black/10')}
                        aria-pressed={selected}
                      >
                        <span className="block truncate text-sm font-semibold">{bundle.draft.title || 'Untitled Pin'}</span>
                        <span className={cn('mt-0.5 block text-xs', needsAttention ? 'text-amber-200' : 'text-[var(--text-muted)]')}>
                          {needsAttention ? 'Needs attention' : bundle.draft.state.replace(/_/g, ' ')} - {new Date(bundle.draft.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
            {state.recovered && <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-softer)] px-3 py-2 text-sm text-[var(--text-secondary)]">Recovered your latest draft. Your selected file stays on this device and may need to be reselected.</div>}
            {state.step === 'media' && (
              <section className="space-y-5" aria-labelledby="creator-media-title">
                <div><h2 id="creator-media-title" className="text-2xl font-semibold">Choose your media</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Start with an image, short video, or public media URL.</p></div>
                <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-md)] bg-white/[0.035] p-1">
                  <button type="button" onClick={() => { setMediaInspectionError(null); dispatch({ type: 'set-value', key: 'sourceMode', value: 'file' }) }} className={cn('min-h-12 rounded-[var(--radius-sm)] text-sm', state.values.sourceMode === 'file' && 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]')}><Upload className="mr-2 inline h-4 w-4" />Upload</button>
                  <button type="button" onClick={() => { setMediaInspectionError(null); dispatch({ type: 'set-value', key: 'sourceMode', value: 'url' }) }} className={cn('min-h-12 rounded-[var(--radius-sm)] text-sm', state.values.sourceMode === 'url' && 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]')}><LinkIcon className="mr-2 inline h-4 w-4" />URL</button>
                </div>
                {state.values.sourceMode === 'file' ? (
                  <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--theme-accent-border-soft)] bg-white/[0.025] p-5 text-center">
                    {previewFileType.startsWith('video/') ? <Film className="h-8 w-8 text-[var(--theme-accent-readable)]" /> : <ImageIcon className="h-8 w-8 text-[var(--theme-accent-readable)]" />}
                    <span className="font-medium">{state.values.file?.name || state.values.fileFingerprint?.name || 'Choose an image or short video'}</span>
                    <span className="text-xs text-[var(--text-muted)]">Images up to 15 MB. Videos up to 150 MB and 60 seconds.</span>
                    <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={event => {
                      const nextFile = event.target.files?.[0] ?? null
                      if (nextFile && fileNeedsReselection && !creatorFileMatchesFingerprint(nextFile, state.values.fileFingerprint)) {
                        dispatch({ type: 'operation', operation: 'failed', error: `Choose ${state.values.fileFingerprint?.name} to resume, or select Use different media first.` })
                        event.target.value = ''
                        return
                      }
                      if (nextFile) {
                        try {
                          validateShadowPinFile(nextFile)
                        } catch (error) {
                          const message = error instanceof Error ? error.message : 'Choose a supported media file.'
                          setMediaInspectionError(message)
                          dispatch({ type: 'operation', operation: 'failed', error: message })
                          event.target.value = ''
                          return
                        }
                      }
                      setMediaInspectionError(null)
                      dispatch({ type: 'set-file', file: nextFile })
                      if (nextFile?.type.startsWith('video/')) {
                        setMediaInspecting(true)
                        void inspectCreatorVideoFile(nextFile)
                          .catch(error => {
                            const message = error instanceof Error ? error.message : 'Unable to inspect this video.'
                            setMediaInspectionError(message)
                            dispatch({ type: 'operation', operation: 'failed', error: message })
                          })
                          .finally(() => setMediaInspecting(false))
                      }
                    }} />
                  </label>
                ) : (
                  <label className="block space-y-2"><span className="text-sm font-medium">Public media URL</span><input value={state.values.sourceUrl} onChange={event => { setMediaInspectionError(null); dispatch({ type: 'set-value', key: 'sourceUrl', value: event.target.value }); dispatch({ type: 'set-value', key: 'keepExistingMedia', value: false }) }} className="obsidian-input min-h-12 w-full rounded-[var(--radius-md)] px-3 text-base" placeholder="https://youtube.com/shorts/..." inputMode="url" autoCapitalize="none" /></label>
                )}
                {targetImage && !state.values.file && !state.values.sourceUrl && <p className="rounded-[var(--radius-sm)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-softer)] p-3 text-sm text-[var(--text-secondary)]">Choose replacement media. Your current Pin stays unchanged until the new version is fully published.</p>}
                {mediaInspecting && <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className={cn('h-4 w-4', !isReducedMotion && 'animate-spin')} /> Checking video duration</p>}
                {fileNeedsReselection && <div className="rounded-[var(--radius-sm)] border border-amber-300/25 bg-amber-400/10 p-3 text-sm text-amber-100"><p>Reselect {state.values.fileFingerprint?.name} to resume its upload. The file itself is never stored in localStorage.</p><button type="button" onClick={() => dispatch({ type: 'set-file', file: null })} className="mt-2 min-h-12 rounded-full border border-amber-200/25 px-3 font-semibold">Use different media</button></div>}
                <MediaPreview objectUrl={objectUrl} sourceUrl={state.values.sourceUrl} fileType={previewFileType} asset={asset} title={state.values.title} />
              </section>
            )}

            {state.step === 'details' && (
              <section className="space-y-5" aria-labelledby="creator-details-title">
                <div><h2 id="creator-details-title" className="text-2xl font-semibold">Shape the story</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Choose where it belongs and add details people can discover.</p></div>
                <label className="block space-y-2"><span className="text-sm font-medium">Category</span><select value={state.values.categoryId} onChange={event => dispatch({ type: 'set-value', key: 'categoryId', value: event.target.value })} className="obsidian-input min-h-12 w-full rounded-[var(--radius-md)] px-3 text-base"><option value="">Choose a category</option>{categoriesState.categories.map(category => <option key={category.id} value={category.id}>{category.title}</option>)}</select></label>
                <label className="block space-y-2"><span className="flex justify-between text-sm font-medium"><span>Title</span><span className="text-[var(--text-muted)]">{state.values.title.length}/80</span></span><input value={state.values.title} maxLength={80} onChange={event => dispatch({ type: 'set-value', key: 'title', value: event.target.value })} className="obsidian-input min-h-12 w-full rounded-[var(--radius-md)] px-3 text-base" placeholder="Give this Pin a clear title" /></label>
                <label className="block space-y-2"><span className="flex justify-between text-sm font-medium"><span>Description</span><span className="text-[var(--text-muted)]">{state.values.description.length}/500</span></span><textarea value={state.values.description} maxLength={500} onChange={event => dispatch({ type: 'set-value', key: 'description', value: event.target.value })} className="obsidian-input min-h-32 w-full resize-none rounded-[var(--radius-md)] p-3 text-base" placeholder="Add context, credits, or the story behind it" /></label>
                <label className="block space-y-2"><span className="text-sm font-medium">Tags</span><input value={tagsText} onChange={event => { setTagsText(event.target.value); dispatch({ type: 'set-value', key: 'tags', value: event.target.value.split(',') }) }} className="obsidian-input min-h-12 w-full rounded-[var(--radius-md)] px-3 text-base" placeholder="folklore, travel, behind-the-scenes" /><span className="text-xs text-[var(--text-muted)]">Up to 8 comma-separated tags.</span></label>
              </section>
            )}

            {state.step === 'preview' && (
              <section className="space-y-5" aria-labelledby="creator-preview-title">
                <div><h2 id="creator-preview-title" className="text-2xl font-semibold">Preview your Pin</h2><p className="mt-1 text-sm text-[var(--text-muted)]">This is how the media and details will feel in ShadowPin.</p></div>
                <div className="mx-auto max-w-lg rounded-[var(--radius-xl)] border border-[var(--border-panel)] bg-white/[0.025] p-3 shadow-[var(--shadow-panel)]"><MediaPreview objectUrl={objectUrl} sourceUrl={state.values.sourceUrl} fileType={previewFileType} asset={asset} title={state.values.title} /><div className="p-2 pt-4"><h3 className="text-xl font-semibold">{state.values.title}</h3>{state.values.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">{state.values.description}</p>}<div className="mt-3 flex flex-wrap gap-2">{state.values.tags.map(tag => <span key={tag} className="rounded-full border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text-muted)]">#{tag}</span>)}</div></div></div>
                {asset && !isAssetReady(asset) && <button type="button" onClick={() => void retryProcessing()} className="mx-auto flex min-h-11 items-center gap-2 rounded-full border border-[var(--theme-accent-border-soft)] px-4 text-sm text-[var(--theme-accent-readable)]"><RotateCcw className="h-4 w-4" /> Refresh processing status</button>}
              </section>
            )}

            {state.step === 'publish' && (
              <section className="space-y-5" aria-labelledby="creator-publish-title">
                <div><h2 id="creator-publish-title" className="text-2xl font-semibold">Ready for the spotlight?</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Publishing makes this Pin visible and may notify members who follow ShadowPin updates.</p></div>
                <div className="grid gap-4 rounded-[var(--radius-xl)] border border-[var(--border-panel)] bg-white/[0.025] p-4 sm:grid-cols-[9rem,1fr]"><MediaPreview objectUrl={objectUrl} sourceUrl={state.values.sourceUrl} fileType={previewFileType} asset={asset} title={state.values.title} /><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-accent-readable)]">{categoriesState.categories.find(category => category.id === state.values.categoryId)?.title || 'ShadowPin'}</p><h3 className="mt-1 text-xl font-semibold">{state.values.title}</h3><p className="mt-2 text-sm text-[var(--text-secondary)]">{state.values.description || 'No description'}</p></div></div>
                <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-softer)] p-4"><input type="checkbox" checked={state.publishConfirmed} onChange={event => dispatch({ type: 'publish-confirmed', confirmed: event.target.checked })} className="mt-1 h-5 w-5 accent-[var(--theme-accent)]" /><span><span className="block font-semibold">I am ready to publish this Pin</span><span className="mt-1 block text-sm text-[var(--text-muted)]">I reviewed the media, category, title, and description.</span></span></label>
                <Button type="button" size="lg" className="w-full" loading={state.operation === 'publishing'} disabled={!state.publishConfirmed || busy} onClick={() => void publish()}><Check className="mr-2 h-5 w-5" /> Publish Pin</Button>
              </section>
            )}
            </fieldset>

            {state.error && <div className="mt-5 rounded-[var(--radius-md)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100" role="alert">{state.error}</div>}
          </div>
        </main>

        <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border-panel)] bg-[rgba(5,6,8,0.96)] px-3 pb-[calc(env(safe-area-inset-bottom)_+_0.45rem)] pt-2 backdrop-blur-md">
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            {stepIndex > 0 ? <Button type="button" variant="secondary" onClick={() => void goTo(CREATOR_STEPS[stepIndex - 1])} disabled={busy}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button> : <button type="button" onClick={() => void discard()} disabled={busy} className="min-h-11 px-3 text-sm text-red-300/75">Discard</button>}
            <div className="min-w-0 flex-1 text-center text-xs text-[var(--text-muted)]" aria-live="polite">{statusLabel(state.operation)}{state.operation === 'uploading' && state.progress > 0 ? ` ${state.progress}%` : ''}</div>
            {stepIndex < CREATOR_STEPS.length - 1 && <Button type="button" onClick={() => void goTo(CREATOR_STEPS[stepIndex + 1])} disabled={busy}>Continue <ArrowRight className="ml-1 h-4 w-4" /></Button>}
          </div>
        </footer>
        {busy && <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)_+_0.25rem)] z-20 flex justify-center" aria-hidden="true"><span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-panel)] bg-[var(--bg-panel-strong)] px-3 py-1.5 text-xs text-[var(--text-secondary)] shadow-[var(--shadow-panel)]"><Loader2 className={cn('h-3.5 w-3.5', !isReducedMotion && 'animate-spin')} /> {statusLabel(state.operation)}</span></div>}
      </div>
    </div>
  )

  return typeof document === 'undefined' ? studio : createPortal(studio, document.body)
}

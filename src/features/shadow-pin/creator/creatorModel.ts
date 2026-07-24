import type { ShadowPinCreatorDraft, ShadowPinCreatorSourceKind } from './creatorTypes'

export const CREATOR_STEPS = ['media', 'details', 'preview', 'publish'] as const
export type ShadowPinCreatorStep = typeof CREATOR_STEPS[number]

export type CreatorFileFingerprint = {
  name: string
  size: number
  type: string
  lastModified: number
}

export type ShadowPinCreatorValues = {
  categoryId: string
  title: string
  description: string
  tags: string[]
  sourceMode: 'file' | 'url'
  sourceUrl: string
  file: File | null
  fileFingerprint: CreatorFileFingerprint | null
  keepExistingMedia: boolean
}

export type CreatorOperation =
  | 'idle'
  | 'restoring'
  | 'saving'
  | 'saved'
  | 'uploading'
  | 'processing'
  | 'publishing'
  | 'published'
  | 'failed'

export type ShadowPinCreatorState = {
  clientMutationId: string
  targetImageId: string | null
  step: ShadowPinCreatorStep
  values: ShadowPinCreatorValues
  draft: ShadowPinCreatorDraft | null
  operation: CreatorOperation
  progress: number
  error: string | null
  recovered: boolean
  publishConfirmed: boolean
  dirtyRevision: number
  savedRevision: number
  updatedAt: string
}

export type ShadowPinCreatorAction =
  | { type: 'restore-started' }
  | { type: 'restored'; values: Partial<ShadowPinCreatorValues>; draft?: ShadowPinCreatorDraft | null; step?: ShadowPinCreatorStep; recovered?: boolean; clientMutationId?: string; targetImageId?: string | null; dirtyRevision?: number; savedRevision?: number; updatedAt?: string }
  | { type: 'set-value'; key: keyof ShadowPinCreatorValues; value: ShadowPinCreatorValues[keyof ShadowPinCreatorValues] }
  | { type: 'set-file'; file: File | null }
  | { type: 'set-step'; step: ShadowPinCreatorStep }
  | { type: 'operation'; operation: CreatorOperation; error?: string | null; progress?: number }
  | { type: 'draft-saved'; draft: ShadowPinCreatorDraft; savedRevision: number }
  | { type: 'draft-status-synced'; draft: ShadowPinCreatorDraft }
  | { type: 'publish-confirmed'; confirmed: boolean }
  | { type: 'reset'; categoryId?: string; targetImageId?: string | null }

export const createCreatorClientMutationId = () => (
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
        const random = Math.floor(Math.random() * 16)
        return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16)
      })
)

export const createInitialCreatorState = (categoryId = '', targetImageId: string | null = null): ShadowPinCreatorState => ({
  clientMutationId: createCreatorClientMutationId(),
  targetImageId,
  step: 'media',
  values: {
    categoryId,
    title: '',
    description: '',
    tags: [],
    sourceMode: 'file',
    sourceUrl: '',
    file: null,
    fileFingerprint: null,
    keepExistingMedia: false,
  },
  draft: null,
  operation: 'idle',
  progress: 0,
  error: null,
  recovered: false,
  publishConfirmed: false,
  dirtyRevision: 0,
  savedRevision: 0,
  updatedAt: new Date().toISOString(),
})

export const fingerprintCreatorFile = (file: File): CreatorFileFingerprint => ({
  name: file.name,
  size: file.size,
  type: file.type,
  lastModified: file.lastModified,
})

export const creatorFileMatchesFingerprint = (
  file: File,
  fingerprint: CreatorFileFingerprint | null
) => Boolean(
  fingerprint &&
  file.name === fingerprint.name &&
  file.size === fingerprint.size &&
  file.type === fingerprint.type &&
  file.lastModified === fingerprint.lastModified
)

const normalizeTags = (tags: string[]) => Array.from(new Set(tags
  .map(tag => tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
  .filter(Boolean)))

export const inferCreatorSourceKind = (values: ShadowPinCreatorValues): ShadowPinCreatorSourceKind => {
  if (values.sourceMode === 'file') {
    return values.file?.type.startsWith('video/') || values.fileFingerprint?.type.startsWith('video/')
      ? 'video_upload'
      : 'image_upload'
  }

  try {
    const parsed = new URL(values.sourceUrl)
    const url = `${parsed.hostname}${parsed.pathname}${parsed.search}`
    return /(^|\.)(youtube\.com|youtu\.be|x\.com|twitter\.com|pinterest\.com|pin\.it|instagram\.com)$/i.test(parsed.hostname) || /\.(mp4|m4v|mov|webm)(?:$|\?)/i.test(url)
      ? 'external_video'
      : 'image_url'
  } catch {
    return 'image_url'
  }
}

export const validateCreatorStep = (
  step: ShadowPinCreatorStep,
  values: ShadowPinCreatorValues
): string[] => {
  const errors: string[] = []
  if (step === 'media' || step === 'preview' || step === 'publish') {
    if (values.sourceMode === 'file' && !values.file && !values.fileFingerprint && !values.keepExistingMedia) {
      errors.push('Choose an image or short video.')
    }
    if (values.sourceMode === 'url') {
      try {
        const url = new URL(values.sourceUrl.trim())
        if (url.protocol !== 'http:' && url.protocol !== 'https:') errors.push('Use a public http or https URL.')
      } catch {
        errors.push('Enter a valid media URL.')
      }
    }
  }
  if (step === 'details' || step === 'preview' || step === 'publish') {
    if (!values.categoryId) errors.push('Choose a category.')
    if (!values.title.trim()) errors.push('Add a title.')
    if (values.title.trim().length > 80) errors.push('Keep the title under 80 characters.')
    if (values.description.length > 500) errors.push('Keep the description under 500 characters.')
    const normalizedTags = normalizeTags(values.tags)
    if (normalizedTags.length > 8) errors.push('Use no more than 8 tags.')
    if (normalizedTags.some(tag => tag.length > 30)) errors.push('Keep each tag under 30 characters.')
  }
  return errors
}

export const creatorReducer = (
  state: ShadowPinCreatorState,
  action: ShadowPinCreatorAction
): ShadowPinCreatorState => {
  switch (action.type) {
    case 'restore-started':
      return { ...state, operation: 'restoring', error: null }
    case 'restored':
      return {
        ...state,
        clientMutationId: action.draft?.clientMutationId || action.clientMutationId || state.clientMutationId,
        targetImageId: action.draft?.targetImageId ?? action.targetImageId ?? state.targetImageId,
        values: { ...state.values, ...action.values, file: action.values.file ?? null },
        draft: action.draft === undefined ? state.draft : action.draft,
        step: action.step ?? state.step,
        recovered: action.recovered ?? state.recovered,
        operation: 'idle',
        dirtyRevision: action.dirtyRevision ?? action.draft?.revision ?? state.dirtyRevision,
        savedRevision: action.savedRevision ?? action.draft?.revision ?? state.savedRevision,
        updatedAt: action.updatedAt ?? action.draft?.updatedAt ?? state.updatedAt,
      }
    case 'set-value':
      return {
        ...state,
        values: {
          ...state.values,
          [action.key]: action.key === 'tags'
            ? normalizeTags(action.value as string[])
            : action.value,
        },
        dirtyRevision: state.dirtyRevision + 1,
        updatedAt: new Date().toISOString(),
        publishConfirmed: false,
        error: null,
      }
    case 'set-file':
      return {
        ...state,
        values: {
          ...state.values,
          file: action.file,
          fileFingerprint: action.file ? fingerprintCreatorFile(action.file) : null,
          sourceMode: 'file',
          keepExistingMedia: false,
        },
        dirtyRevision: state.dirtyRevision + 1,
        updatedAt: new Date().toISOString(),
        publishConfirmed: false,
        error: null,
      }
    case 'set-step':
      return { ...state, step: action.step, updatedAt: new Date().toISOString(), error: null }
    case 'operation':
      return {
        ...state,
        operation: action.operation,
        error: action.error === undefined ? state.error : action.error,
        progress: action.progress === undefined ? state.progress : Math.max(0, Math.min(100, action.progress)),
      }
    case 'draft-saved':
      return {
        ...state,
        clientMutationId: action.draft.clientMutationId || state.clientMutationId,
        targetImageId: action.draft.targetImageId,
        draft: action.draft,
        operation: 'saved',
        savedRevision: Math.max(state.savedRevision, action.savedRevision),
        updatedAt: state.dirtyRevision > action.savedRevision
          ? state.updatedAt
          : action.draft.updatedAt || state.updatedAt,
        error: null,
      }
    case 'draft-status-synced':
      return {
        ...state,
        draft: action.draft,
        updatedAt: state.dirtyRevision > state.savedRevision
          ? state.updatedAt
          : action.draft.updatedAt || state.updatedAt,
      }
    case 'publish-confirmed':
      return { ...state, publishConfirmed: action.confirmed }
    case 'reset':
      return createInitialCreatorState(action.categoryId, action.targetImageId ?? null)
    default:
      return state
  }
}

export type CreatorLocalDraft = {
  draftId: string | null
  targetImageId: string | null
  clientMutationId: string
  step: ShadowPinCreatorStep
  values: Omit<ShadowPinCreatorValues, 'file'>
  dirtyRevision: number
  savedRevision: number
  updatedAt: string
}

export const creatorLocalDraftHasUnsyncedChanges = (draft: CreatorLocalDraft) => (
  draft.dirtyRevision > draft.savedRevision
)

const creatorTimestamp = (value: string) => {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export const shouldPreferLocalCreatorDraft = (
  local: CreatorLocalDraft,
  server: ShadowPinCreatorDraft
) => (
  local.draftId === server.id && (
    creatorLocalDraftHasUnsyncedChanges(local) ||
    creatorTimestamp(local.updatedAt) > creatorTimestamp(server.updatedAt)
  )
)

export const serializeCreatorLocalDraft = (state: ShadowPinCreatorState): CreatorLocalDraft => {
  const hasLocalOnlyWork = !state.draft && Boolean(
    state.values.sourceUrl.trim() ||
    state.values.fileFingerprint ||
    state.values.keepExistingMedia ||
    state.values.title.trim() ||
    state.values.description.trim()
  )
  return {
    draftId: state.draft?.id ?? null,
    targetImageId: state.targetImageId,
    clientMutationId: state.clientMutationId,
    step: state.step,
    values: {
      categoryId: state.values.categoryId,
      title: state.values.title,
      description: state.values.description,
      tags: normalizeTags(state.values.tags),
      sourceMode: state.values.sourceMode,
      sourceUrl: state.values.sourceUrl,
      fileFingerprint: state.values.fileFingerprint,
      keepExistingMedia: state.values.keepExistingMedia,
    },
    // A failed first server save still has no draft receipt. Persist it dirty
    // so reopening Studio automatically retries instead of treating it clean.
    dirtyRevision: hasLocalOnlyWork && state.dirtyRevision <= state.savedRevision
      ? state.savedRevision + 1
      : state.dirtyRevision,
    savedRevision: state.savedRevision,
    updatedAt: state.updatedAt,
  }
}

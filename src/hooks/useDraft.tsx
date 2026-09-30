import { useCallback, useEffect, useState } from 'react'
import { getDraftStorageKey } from '../lib/draftStorage'

type DraftUpdate = string | ((previous: string) => string)
export type DraftUpdateEventDetail = {
  draft: string
  storageKey: string
}

export const DRAFT_UPDATE_EVENT = 'shadowchat:draft-update'

const normalizeDraft = (value: string | null | undefined) => {
  if (!value || value.trim().length === 0) {
    return ''
  }
  return value
}

export const readDraft = (storageKey: string | null) => {
  if (!storageKey || typeof localStorage === 'undefined') return ''
  try {
    const rawDraft = localStorage.getItem(storageKey)
    const draft = normalizeDraft(rawDraft)
    if (rawDraft && !draft) {
      localStorage.removeItem(storageKey)
    }
    return draft
  } catch {
    return ''
  }
}

const emitDraftUpdate = (storageKey: string | null, draft: string) => {
  if (!storageKey || typeof window === 'undefined') return

  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent<DraftUpdateEventDetail>(DRAFT_UPDATE_EVENT, {
      detail: { storageKey, draft },
    }))
  }, 0)
}

export function useDraft(key: string, identityKey?: string | null) {
  const storageKey = getDraftStorageKey(key, identityKey)
  const [state, setDraftState] = useState(() => ({ storageKey, draft: readDraft(storageKey) }))
  const draft = state.storageKey === storageKey ? state.draft : readDraft(storageKey)

  // Load new draft when the key changes
  useEffect(() => {
    setDraftState({ storageKey, draft: readDraft(storageKey) })
  }, [storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleDraftUpdate = (event: Event) => {
      const detail = (event as CustomEvent<DraftUpdateEventDetail>).detail
      if (!storageKey || !detail || detail.storageKey !== storageKey) {
        return
      }

      setDraftState({ storageKey, draft: normalizeDraft(detail.draft) })
    }

    window.addEventListener(DRAFT_UPDATE_EVENT, handleDraftUpdate)
    return () => window.removeEventListener(DRAFT_UPDATE_EVENT, handleDraftUpdate)
  }, [storageKey])

  const setDraft = useCallback((nextDraft: DraftUpdate) => {
    setDraftState(previous => {
      const current = previous.storageKey === storageKey ? previous.draft : readDraft(storageKey)
      const value = typeof nextDraft === 'function' ? nextDraft(current) : nextDraft
      const normalized = normalizeDraft(value)
      if (storageKey) {
        try {
          if (normalized) localStorage.setItem(storageKey, normalized)
          else localStorage.removeItem(storageKey)
        } catch {
          // Drafts remain editable if browser storage is unavailable.
        }
      }
      emitDraftUpdate(storageKey, normalized)
      return { storageKey, draft: normalized }
    })
  }, [storageKey])

  const clear = useCallback(() => {
    setDraftState({ storageKey, draft: '' })
    emitDraftUpdate(storageKey, '')
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // ignore
      }
    }
  }, [storageKey])

  return { draft, setDraft, clear }
}

import { useCallback, useEffect, useState } from 'react'

type DraftUpdate = string | ((previous: string) => string)
type DraftUpdateEventDetail = {
  draft: string
  storageKey: string
}

const DRAFT_UPDATE_EVENT = 'shadowchat:draft-update'

const normalizeDraft = (value: string | null | undefined) => {
  if (!value || value.trim().length === 0) {
    return ''
  }
  return value
}

const readDraft = (storageKey: string) => {
  if (typeof localStorage === 'undefined') return ''
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

const emitDraftUpdate = (storageKey: string, draft: string) => {
  if (typeof window === 'undefined') return

  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent<DraftUpdateEventDetail>(DRAFT_UPDATE_EVENT, {
      detail: { storageKey, draft },
    }))
  }, 0)
}

export function useDraft(key: string) {
  const storageKey = `draft-${key}`
  const [draft, setDraftState] = useState(() => readDraft(storageKey))

  // Load new draft when the key changes
  useEffect(() => {
    setDraftState(readDraft(storageKey))
  }, [storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleDraftUpdate = (event: Event) => {
      const detail = (event as CustomEvent<DraftUpdateEventDetail>).detail
      if (!detail || detail.storageKey !== storageKey) {
        return
      }

      setDraftState(normalizeDraft(detail.draft))
    }

    window.addEventListener(DRAFT_UPDATE_EVENT, handleDraftUpdate)
    return () => window.removeEventListener(DRAFT_UPDATE_EVENT, handleDraftUpdate)
  }, [storageKey])

  const setDraft = useCallback((nextDraft: DraftUpdate) => {
    setDraftState(previous => {
      const value = typeof nextDraft === 'function' ? nextDraft(previous) : nextDraft
      const normalized = normalizeDraft(value)
      emitDraftUpdate(storageKey, normalized)
      return normalized
    })
  }, [storageKey])

  useEffect(() => {
    try {
      if (draft.trim()) {
        localStorage.setItem(storageKey, draft)
      } else {
        localStorage.removeItem(storageKey)
      }
    } catch {
      // ignore
    }
  }, [draft, storageKey])

  const clear = useCallback(() => {
    setDraftState('')
    emitDraftUpdate(storageKey, '')
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }, [storageKey])

  return { draft, setDraft, clear }
}

import { useState, useEffect } from 'react'

export function useDraft(key: string) {
  const storageKey = `draft-${key}`
  const [draft, setDraft] = useState(() => {
    if (typeof localStorage === 'undefined') return ''
    try {
      return localStorage.getItem(storageKey) || ''
    } catch {
      return ''
    }
  })

  // Load new draft when the key changes
  useEffect(() => {
    if (typeof localStorage === 'undefined') return
    try {
      setDraft(localStorage.getItem(storageKey) || '')
    } catch {
      setDraft('')
    }
  }, [storageKey])

  useEffect(() => {
    try {
      if (draft) {
        localStorage.setItem(storageKey, draft)
      } else {
        localStorage.removeItem(storageKey)
      }
    } catch {
      // ignore
    }
  }, [draft, storageKey])

  const clear = () => {
    setDraft('')
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // ignore
    }
  }

  return { draft, setDraft, clear }
}

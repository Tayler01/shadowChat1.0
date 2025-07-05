import { useState } from 'react'

export interface FailedMessage {
  id: string
  type: 'text' | 'image' | 'audio' | 'file'
  content: string
  dataUrl?: string
  fileName?: string
}

export function useFailedMessages(key: string) {
  const storageKey = `failed-${key}`
  const [failed, setFailed] = useState<FailedMessage[]>(() => {
    if (typeof localStorage === 'undefined') return []
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? (JSON.parse(raw) as FailedMessage[]) : []
    } catch {
      return []
    }
  })

  const persist = (list: FailedMessage[]) => {
    setFailed(list)
    try {
      localStorage.setItem(storageKey, JSON.stringify(list))
    } catch {
      // ignore
    }
  }

  const add = (msg: FailedMessage) => {
    persist([...failed, msg])
  }

  const remove = (id: string) => {
    persist(failed.filter(m => m.id !== id))
  }

  return { failedMessages: failed, addFailedMessage: add, removeFailedMessage: remove }
}

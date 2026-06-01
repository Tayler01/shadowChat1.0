import { useEffect, useState } from 'react'
import type { ChatMessage } from '../lib/supabase'
import { getSuggestedReplies } from '../lib/ai'

const SUGGESTED_REPLIES_AVAILABLE = false

export function useSuggestionsEnabled() {
  const [enabled, setEnabled] = useState(() => {
    if (!SUGGESTED_REPLIES_AVAILABLE) {
      return false
    }

    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('suggestionsEnabled')
      return stored === 'true' // Default to false, only enable if explicitly set to true
    }
    return false // Default to disabled
  })

  useEffect(() => {
    try {
      localStorage.setItem('suggestionsEnabled', String(SUGGESTED_REPLIES_AVAILABLE && enabled))
    } catch {
      // ignore
    }
  }, [enabled])

  return { enabled: SUGGESTED_REPLIES_AVAILABLE && enabled, setEnabled }
}

export function useSuggestedReplies(
  messages: ChatMessage[],
  enabled: boolean
) {
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setSuggestions([])
      return
    }

    const controller = new AbortController()
    setLoading(true)

    getSuggestedReplies(messages.slice(-10))
      .then(res => {
        if (!controller.signal.aborted) setSuggestions(res)
      })
      .catch(() => {
        if (!controller.signal.aborted) setSuggestions([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [messages, enabled])

  return { suggestions, loading }
}

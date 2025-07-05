import { useState, useEffect } from 'react'
import { searchUsers, BasicUser } from '../lib/supabase'

export function useUserSearch(term: string) {
  const [results, setResults] = useState<BasicUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const search = async () => {
      if (!term.trim()) {
        setResults([])
        setError(null)
        return
      }

      setLoading(true)

      try {
        const users = await searchUsers(term, { signal: controller.signal })
        if (controller.signal.aborted) return
        setResults(users)
        setError(users.length > 0 ? null : 'User not found')
      } catch (err) {
        if ((err as any).name !== 'AbortError') {
          setError('Error searching users')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    search()

    return () => {
      controller.abort()
    }
  }, [term])

  return { results, loading, error }
}

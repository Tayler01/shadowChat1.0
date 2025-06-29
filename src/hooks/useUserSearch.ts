import { useState, useEffect } from 'react'
import { searchUsers, BasicUser } from '../lib/supabase'

export function useUserSearch(term: string) {
  const [results, setResults] = useState<BasicUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const search = async () => {
      if (!term.trim()) {
        setResults([])
        setError(null)
        return
      }
      setLoading(true)
      const users = await searchUsers(term)
      if (!active) return
      setResults(users)
      setError(users.length > 0 ? null : 'User not found')
      setLoading(false)
    }
    search()
    return () => {
      active = false
    }
  }, [term])

  return { results, loading, error }
}

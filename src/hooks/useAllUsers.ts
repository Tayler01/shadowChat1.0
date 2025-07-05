import { useState, useEffect } from 'react'
import { fetchAllUsers, BasicUser } from '../lib/supabase'

export function useAllUsers() {
  const [users, setUsers] = useState<BasicUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setLoading(true)
      try {
        const result = await fetchAllUsers({ signal: controller.signal })
        if (!controller.signal.aborted) {
          setUsers(result)
          setError(null)
        }
      } catch (err) {
        if ((err as any).name !== 'AbortError') {
          setError('Failed to load users')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  return { users, loading, error }
}


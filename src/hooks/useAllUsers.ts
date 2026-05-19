import { useState, useEffect } from 'react'
import { fetchAllUsers, BasicUser } from '../lib/supabase'

type UseAllUsersOptions = {
  enabled?: boolean
}

let cachedUsers: BasicUser[] | null = null
let usersRequest: Promise<BasicUser[]> | null = null

export function resetAllUsersCacheForTests() {
  cachedUsers = null
  usersRequest = null
}

const getUsersRequest = () => {
  if (!usersRequest) {
    usersRequest = fetchAllUsers().finally(() => {
      usersRequest = null
    })
  }

  return usersRequest
}

export function useAllUsers(options: UseAllUsersOptions = {}) {
  const enabled = options.enabled ?? true
  const [users, setUsers] = useState<BasicUser[]>(() => cachedUsers ?? [])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    let active = true
    const load = async () => {
      if (cachedUsers) {
        setUsers(cachedUsers)
        setError(null)
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const result = await getUsersRequest()
        if (active) {
          cachedUsers = result
          setUsers(result)
          setError(null)
        }
      } catch (err) {
        if (active && (err as any).name !== 'AbortError') {
          setError('Failed to load users')
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [enabled])

  return { users, loading, error }
}


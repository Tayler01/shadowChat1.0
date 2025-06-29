import { useState, useEffect } from 'react'
import { supabase, User } from '../lib/supabase'

export interface BasicUser extends Pick<User, 'id' | 'username' | 'display_name' | 'avatar_url' | 'color' | 'status'> {}

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
      const { data, error } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url, color, status')
        .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
      if (!active) return
      if (error) {
        console.error('Error searching users:', error)
        setError('Failed to search users')
        setResults([])
      } else {
        setResults((data ?? []) as BasicUser[])
        setError(data && data.length > 0 ? null : 'User not found')
      }
      setLoading(false)
    }
    search()
    return () => {
      active = false
    }
  }, [term])

  return { results, loading, error }
}

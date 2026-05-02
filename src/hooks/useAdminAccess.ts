import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAdminAccessUsers,
  getMyAdminRole,
  setSubAdminStatus,
  type AdminAccessUser,
  type AdminRole,
} from '../lib/supabase'
import { useAuth } from './useAuth'

export function useAdminAccess() {
  const { user } = useAuth()
  const [role, setRole] = useState<AdminRole | null>(null)
  const [users, setUsers] = useState<AdminAccessUser[]>([])
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) {
      setRole(null)
      setUsers([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const nextRole = await getMyAdminRole()
      setRole(nextRole)

      if (nextRole === 'admin') {
        setUsers(await fetchAdminAccessUsers())
      } else {
        setUsers([])
      }

      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin access')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const updateSubAdmin = useCallback(async (targetUserId: string, enabled: boolean) => {
    setSavingUserId(targetUserId)
    try {
      await setSubAdminStatus(targetUserId, enabled)
      await refresh()
    } finally {
      setSavingUserId(null)
    }
  }, [refresh])

  return useMemo(() => ({
    role,
    isAdmin: role === 'admin',
    isOperator: role === 'admin' || role === 'sub_admin',
    users,
    loading,
    savingUserId,
    error,
    refresh,
    updateSubAdmin,
  }), [error, loading, refresh, role, savingUserId, updateSubAdmin, users])
}

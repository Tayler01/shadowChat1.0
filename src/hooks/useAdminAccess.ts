import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAdminAccessUsers,
  getMyAdminRole,
  setSubAdminStatus,
  type AdminAccessUser,
  type AdminRole,
} from '../lib/supabase'
import { useAuth } from './useAuth'

type UseAdminAccessOptions = {
  includeUsers?: boolean
}

const cachedRoleByUserId = new Map<string, AdminRole | null>()
const roleRequestByUserId = new Map<string, Promise<AdminRole | null>>()
let cachedAdminUsers: AdminAccessUser[] | null = null
let adminUsersRequest: Promise<AdminAccessUser[]> | null = null

const loadAdminRole = (userId: string) => {
  const cachedRole = cachedRoleByUserId.get(userId)
  if (cachedRole !== undefined) {
    return Promise.resolve(cachedRole)
  }

  const existingRequest = roleRequestByUserId.get(userId)
  if (existingRequest) return existingRequest

  const request = getMyAdminRole()
    .then(role => {
      cachedRoleByUserId.set(userId, role)
      return role
    })
    .finally(() => {
      roleRequestByUserId.delete(userId)
    })

  roleRequestByUserId.set(userId, request)
  return request
}

const loadAdminUsers = (force = false) => {
  if (!force && cachedAdminUsers) {
    return Promise.resolve(cachedAdminUsers)
  }

  if (!adminUsersRequest || force) {
    adminUsersRequest = fetchAdminAccessUsers()
      .then(users => {
        cachedAdminUsers = users
        return users
      })
      .finally(() => {
        adminUsersRequest = null
      })
  }

  return adminUsersRequest
}

export function useAdminAccess(options: UseAdminAccessOptions = {}) {
  const includeUsers = options.includeUsers ?? true
  const { user } = useAuth()
  const [role, setRole] = useState<AdminRole | null>(null)
  const [users, setUsers] = useState<AdminAccessUser[]>([])
  const [roleLoading, setRoleLoading] = useState(Boolean(user))
  const [usersLoading, setUsersLoading] = useState(false)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshRole = useCallback(async (force = false) => {
    if (!user) {
      setRole(null)
      setUsers([])
      setRoleLoading(false)
      setUsersLoading(false)
      return null
    }

    setRoleLoading(true)
    try {
      if (force) cachedRoleByUserId.delete(user.id)
      const nextRole = await loadAdminRole(user.id)
      setRole(nextRole)
      if (nextRole !== 'admin') {
        setUsers([])
        setUsersLoading(false)
      }
      setError(null)
      return nextRole
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin access')
      return null
    } finally {
      setRoleLoading(false)
    }
  }, [user])

  useEffect(() => {
    void refreshRole()
  }, [refreshRole])

  const refreshUsers = useCallback(async (force = false) => {
    if (!user || role !== 'admin') {
      setUsers([])
      setUsersLoading(false)
      return
    }

    if (!includeUsers) {
      setUsers(cachedAdminUsers ?? [])
      setUsersLoading(false)
      return
    }

    setUsersLoading(!cachedAdminUsers || force)
    try {
      const nextUsers = await loadAdminUsers(force)
      setUsers(nextUsers)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load admin access')
    } finally {
      setUsersLoading(false)
    }
  }, [includeUsers, role, user])

  useEffect(() => {
    void refreshUsers()
  }, [refreshUsers])

  const refresh = useCallback(async () => {
    const nextRole = await refreshRole(true)
    if (includeUsers && nextRole === 'admin' && user) {
      setUsersLoading(true)
      try {
        const nextUsers = await loadAdminUsers(true)
        setUsers(nextUsers)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load admin access')
      } finally {
        setUsersLoading(false)
      }
    }
  }, [includeUsers, refreshRole, user])

  const updateSubAdmin = useCallback(async (targetUserId: string, enabled: boolean) => {
    setSavingUserId(targetUserId)
    try {
      await setSubAdminStatus(targetUserId, enabled)
      cachedAdminUsers = null
      await refreshUsers(true)
    } finally {
      setSavingUserId(null)
    }
  }, [refreshUsers])

  const loading = roleLoading || (
    includeUsers &&
    role === 'admin' &&
    (usersLoading || (!error && !cachedAdminUsers && users.length === 0))
  )

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

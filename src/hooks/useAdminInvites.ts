import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createAdminInvite,
  fetchAdminInvites,
  revokeAdminInvite,
  type AdminInviteRecord,
  type CreateAdminInviteResult,
} from '../lib/adminInvites'
import { useAuth } from './useAuth'

type UseAdminInvitesOptions = {
  enabled?: boolean
}

export function useAdminInvites(options: UseAdminInvitesOptions = {}) {
  const enabled = options.enabled ?? true
  const { user } = useAuth()
  const [invites, setInvites] = useState<AdminInviteRecord[]>([])
  const [lastCreatedInvite, setLastCreatedInvite] = useState<CreateAdminInviteResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (force = false) => {
    if (!user) {
      setInvites([])
      setLoading(false)
      return
    }

    if (!enabled && !force) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const nextInvites = await fetchAdminInvites()
      setInvites(nextInvites)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load invites')
    } finally {
      setLoading(false)
    }
  }, [enabled, user])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const generateInvite = useCallback(async (emailLock?: string | null) => {
    setCreating(true)
    try {
      const result = await createAdminInvite({ emailLock })
      setLastCreatedInvite(result)
      await refresh(true)
      setError(null)
      return result
    } finally {
      setCreating(false)
    }
  }, [refresh])

  const revokeInvite = useCallback(async (inviteId: string) => {
    setRevokingInviteId(inviteId)
    try {
      await revokeAdminInvite(inviteId)
      await refresh(true)
      setError(null)
    } finally {
      setRevokingInviteId(null)
    }
  }, [refresh])

  return useMemo(() => ({
    invites,
    lastCreatedInvite,
    loading,
    creating,
    revokingInviteId,
    error,
    refresh,
    generateInvite,
    revokeInvite,
  }), [
    creating,
    error,
    generateInvite,
    invites,
    lastCreatedInvite,
    loading,
    refresh,
    revokeInvite,
    revokingInviteId,
  ])
}

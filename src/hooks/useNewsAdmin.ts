import { useCallback, useEffect, useState } from 'react'
import { getWorkingClient, type NewsPlatform, type NewsSource } from '../lib/supabase'
import { useAuth } from './useAuth'

type SourceInput = {
  platform: NewsPlatform
  handle: string
  displayName?: string
  profileUrl?: string
  externalAccountId?: string
}

export function useNewsAdmin() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)
  const [sources, setSources] = useState<NewsSource[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAdminState = useCallback(async () => {
    if (!user) {
      setIsAdmin(false)
      setSources([])
      setLoading(false)
      return
    }

    try {
      const workingClient = await getWorkingClient()
      const [adminResult, sourcesResult] = await Promise.all([
        workingClient.rpc('is_news_admin', { target_user_id: user.id }),
        workingClient
          .from('news_sources')
          .select('*')
          .order('created_at', { ascending: false }),
      ])

      if (adminResult.error) throw adminResult.error
      if (sourcesResult.error) throw sourcesResult.error

      setIsAdmin(Boolean(adminResult.data))
      setSources((sourcesResult.data ?? []) as unknown as NewsSource[])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load news admin state')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void fetchAdminState()
  }, [fetchAdminState])

  const upsertSource = useCallback(async (input: SourceInput) => {
    setSaving(true)
    try {
      const workingClient = await getWorkingClient()
      const { error: rpcError } = await workingClient.rpc('upsert_news_source', {
        platform: input.platform,
        handle: input.handle,
        display_name: input.displayName || null,
        profile_url: input.profileUrl || null,
        external_account_id: input.externalAccountId || null,
      })
      if (rpcError) throw rpcError
      await fetchAdminState()
    } finally {
      setSaving(false)
    }
  }, [fetchAdminState])

  const setSourceEnabled = useCallback(async (sourceId: string, enabled: boolean) => {
    setSaving(true)
    try {
      const workingClient = await getWorkingClient()
      const { error: rpcError } = await workingClient.rpc('set_news_source_enabled', {
        source_id: sourceId,
        enabled,
      })
      if (rpcError) throw rpcError
      await fetchAdminState()
    } finally {
      setSaving(false)
    }
  }, [fetchAdminState])

  return {
    isAdmin,
    sources,
    loading,
    saving,
    error,
    refresh: fetchAdminState,
    upsertSource,
    setSourceEnabled,
  }
}

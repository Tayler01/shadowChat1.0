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

type UseNewsAdminOptions = {
  enabled?: boolean
}

type NewsAdminState = {
  isAdmin: boolean
  sources: NewsSource[]
}

const cachedNewsAdminStateByUserId = new Map<string, NewsAdminState>()
const newsAdminRequestByUserId = new Map<string, Promise<NewsAdminState>>()

const loadNewsAdminState = async (userId: string, force = false) => {
  const cached = cachedNewsAdminStateByUserId.get(userId)
  if (!force && cached) return cached

  const existingRequest = newsAdminRequestByUserId.get(userId)
  if (!force && existingRequest) return existingRequest

  const request = (async () => {
    const workingClient = await getWorkingClient()
    const [adminResult, sourcesResult] = await Promise.all([
      workingClient.rpc('is_app_operator', { target_user_id: userId }),
      workingClient
        .from('news_sources')
        .select('*')
        .order('created_at', { ascending: false }),
    ])

    if (adminResult.error) throw adminResult.error
    if (sourcesResult.error) throw sourcesResult.error

    const nextState = {
      isAdmin: Boolean(adminResult.data),
      sources: (sourcesResult.data ?? []) as unknown as NewsSource[],
    }
    cachedNewsAdminStateByUserId.set(userId, nextState)
    return nextState
  })().finally(() => {
    newsAdminRequestByUserId.delete(userId)
  })

  newsAdminRequestByUserId.set(userId, request)
  return request
}

const updateCachedNewsSources = (userId: string | undefined, updater: (sources: NewsSource[]) => NewsSource[]) => {
  if (!userId) return
  const cached = cachedNewsAdminStateByUserId.get(userId)
  if (!cached) return
  cachedNewsAdminStateByUserId.set(userId, {
    ...cached,
    sources: updater(cached.sources),
  })
}

export function useNewsAdmin(options: UseNewsAdminOptions = {}) {
  const enabled = options.enabled ?? true
  const { user } = useAuth()
  const cachedState = user ? cachedNewsAdminStateByUserId.get(user.id) : undefined
  const [isAdmin, setIsAdmin] = useState(cachedState?.isAdmin ?? false)
  const [sources, setSources] = useState<NewsSource[]>(() => cachedState?.sources ?? [])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAdminState = useCallback(async (force = false) => {
    if (!user) {
      setIsAdmin(false)
      setSources([])
      setLoading(false)
      return
    }

    if (!enabled && !force) {
      const cached = cachedNewsAdminStateByUserId.get(user.id)
      if (cached) {
        setIsAdmin(cached.isAdmin)
        setSources(cached.sources)
      }
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const nextState = await loadNewsAdminState(user.id, force)
      setIsAdmin(nextState.isAdmin)
      setSources(nextState.sources)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load news operator state')
    } finally {
      setLoading(false)
    }
  }, [enabled, user])

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
      await fetchAdminState(true)
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
      await fetchAdminState(true)
    } finally {
      setSaving(false)
    }
  }, [fetchAdminState])

  const deleteSource = useCallback(async (sourceId: string) => {
    setSaving(true)
    try {
      const workingClient = await getWorkingClient()
      const { error: deleteError } = await workingClient
        .from('news_sources')
        .delete()
        .eq('id', sourceId)

      if (deleteError) throw deleteError
      setSources(current => current.filter(source => source.id !== sourceId))
      updateCachedNewsSources(user?.id, current => current.filter(source => source.id !== sourceId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete news source')
      throw err
    } finally {
      setSaving(false)
    }
  }, [user?.id])

  return {
    isAdmin,
    sources,
    loading: loading || Boolean(enabled && user && !error && !cachedNewsAdminStateByUserId.has(user.id)),
    saving,
    error,
    refresh: fetchAdminState,
    upsertSource,
    setSourceEnabled,
    deleteSource,
  }
}

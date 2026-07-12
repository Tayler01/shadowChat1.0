import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DMConversation } from '../lib/supabase'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import { getRealtimeClient } from '../lib/supabase'
import { fetchConversationNotificationMute, setConversationNotificationMute } from '../lib/push'
import { fetchDMConversationHubState, saveDMConversationPreference } from '../lib/dmConversationHub'
import {
  applyOptimisticDMConversationPreference,
  buildDMConversationHubItems,
  getDMConversationDraftStorageKey,
  selectDMConversationHubItems,
  type DMConversationHubMode,
  type DMConversationHubPreference,
  type DMConversationPreferenceChanges,
} from '../components/dms/dmConversationHubModel'
import { DRAFT_UPDATE_EVENT, readDraft, type DraftUpdateEventDetail } from './useDraft'

export const useDMConversationHub = ({
  conversations,
  userId,
}: {
  conversations: DMConversation[]
  userId: string | null | undefined
}) => {
  const [mode, setMode] = useState<DMConversationHubMode>('inbox')
  const [query, setQuery] = useState('')
  const [preferences, setPreferences] = useState<DMConversationHubPreference[]>([])
  const [mutedConversationIds, setMutedConversationIds] = useState<Set<string>>(new Set())
  const [draftsByConversationId, setDraftsByConversationId] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const preferencesRef = useRef<DMConversationHubPreference[]>([])
  const committedPreferencesRef = useRef<Map<string, DMConversationHubPreference>>(new Map())
  const pendingPreferencesRef = useRef<Map<string, DMConversationHubPreference>>(new Map())
  const preferenceMutationVersionRef = useRef<Map<string, number>>(new Map())
  const preferenceSaveQueueRef = useRef<Map<string, Promise<DMConversationHubPreference>>>(new Map())
  const conversationIds = useMemo(() => conversations.map(conversation => conversation.id), [conversations])
  const conversationIdsKey = conversationIds.join('|')

  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

  const refresh = useCallback(async () => {
    if (!userId) {
      committedPreferencesRef.current.clear()
      pendingPreferencesRef.current.clear()
      preferenceMutationVersionRef.current.clear()
      preferenceSaveQueueRef.current.clear()
      preferencesRef.current = []
      setPreferences([])
      setMutedConversationIds(new Set())
      setLoading(false)
      return
    }

    try {
      const state = await fetchDMConversationHubState()
      committedPreferencesRef.current = new Map(
        state.preferences.map(preference => [preference.conversationId, preference])
      )
      const mergedPreferences = new Map(committedPreferencesRef.current)
      pendingPreferencesRef.current.forEach((preference, conversationId) => {
        mergedPreferences.set(conversationId, preference)
      })
      const nextPreferences = Array.from(mergedPreferences.values())
      preferencesRef.current = nextPreferences
      setPreferences(nextPreferences)
      setMutedConversationIds(new Set(state.mutedConversationIds))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  useEffect(() => {
    const nextDrafts: Record<string, string> = {}
    conversationIds.forEach(conversationId => {
      const draft = readDraft(getDMConversationDraftStorageKey(conversationId))
      if (draft) nextDrafts[conversationId] = draft
    })
    setDraftsByConversationId(nextDrafts)
    // conversationIdsKey deliberately tracks the stable ID set, not array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationIdsKey])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onDraftUpdate = (event: Event) => {
      const detail = (event as CustomEvent<DraftUpdateEventDetail>).detail
      if (!detail?.storageKey.startsWith('draft-dm-')) return
      const conversationId = detail.storageKey.slice('draft-dm-'.length)
      setDraftsByConversationId(previous => {
        const next = { ...previous }
        if (detail.draft.trim()) next[conversationId] = detail.draft
        else delete next[conversationId]
        return next
      })
    }
    const onStorage = (event: StorageEvent) => {
      if (!event.key?.startsWith('draft-dm-')) return
      const conversationId = event.key.slice('draft-dm-'.length)
      setDraftsByConversationId(previous => ({
        ...previous,
        [conversationId]: event.newValue ?? '',
      }))
    }

    window.addEventListener(DRAFT_UPDATE_EVENT, onDraftUpdate)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(DRAFT_UPDATE_EVENT, onDraftUpdate)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    const client = getRealtimeClient()
    const channel = client
      .channel(createRealtimeChannelName(`dm_hub_preferences:${userId}`))
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'dm_conversation_preferences',
        filter: `user_id=eq.${userId}`,
      }, () => {
        void refresh().catch(() => undefined)
      })
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [refresh, userId])

  const allItems = useMemo(() => buildDMConversationHubItems(conversations, {
    currentUserId: userId,
    preferences,
    mutedConversationIds,
    draftsByConversationId,
  }), [conversations, draftsByConversationId, mutedConversationIds, preferences, userId])

  const items = useMemo(() => selectDMConversationHubItems(allItems, { mode, query }), [allItems, mode, query])
  const counts = useMemo(() => ({
    inbox: selectDMConversationHubItems(allItems, { mode: 'inbox' }).length,
    unread: selectDMConversationHubItems(allItems, { mode: 'unread' }).length,
    archived: selectDMConversationHubItems(allItems, { mode: 'archived' }).length,
  }), [allItems])

  const updatePreference = useCallback(async (
    conversationId: string,
    changes: DMConversationPreferenceChanges
  ) => {
    if (!userId) throw new Error('Sign in to update this conversation')
    const updatedAt = new Date().toISOString()
    const optimistic = applyOptimisticDMConversationPreference(
      preferencesRef.current,
      conversationId,
      changes,
      updatedAt
    )
    preferencesRef.current = optimistic.preferences
    pendingPreferencesRef.current.set(conversationId, optimistic.rollbackToken.optimistic)
    setPreferences(optimistic.preferences)
    const mutationVersion = (preferenceMutationVersionRef.current.get(conversationId) ?? 0) + 1
    preferenceMutationVersionRef.current.set(conversationId, mutationVersion)
    const previousSave = preferenceSaveQueueRef.current.get(conversationId)
    const savePromise = (previousSave ? previousSave.catch(() => undefined) : Promise.resolve())
      .then(() => saveDMConversationPreference({
        userId,
        preference: optimistic.rollbackToken.optimistic,
      }))
    preferenceSaveQueueRef.current.set(conversationId, savePromise)

    try {
      const saved = await savePromise
      committedPreferencesRef.current.set(conversationId, saved)
      if (preferenceMutationVersionRef.current.get(conversationId) !== mutationVersion) return
      pendingPreferencesRef.current.delete(conversationId)
      setPreferences(previous => {
        const next = [
          ...previous.filter(preference => preference.conversationId !== conversationId),
          saved,
        ]
        preferencesRef.current = next
        return next
      })
    } catch (error) {
      if (preferenceMutationVersionRef.current.get(conversationId) !== mutationVersion) return
      pendingPreferencesRef.current.delete(conversationId)
      setPreferences(previous => {
        const next = previous.filter(preference => preference.conversationId !== conversationId)
        const committed = committedPreferencesRef.current.get(conversationId)
        if (committed) next.push(committed)
        preferencesRef.current = next
        return next
      })
      throw error
    } finally {
      if (preferenceSaveQueueRef.current.get(conversationId) === savePromise) {
        preferenceSaveQueueRef.current.delete(conversationId)
      }
    }
  }, [userId])

  const toggleMute = useCallback(async (conversationId: string, muted: boolean) => {
    const previous = mutedConversationIds.has(conversationId)
    setMutedConversationIds(current => {
      const next = new Set(current)
      if (muted) next.add(conversationId)
      else next.delete(conversationId)
      return next
    })
    try {
      if (!userId) throw new Error('Sign in to update notifications')
      await setConversationNotificationMute(userId, conversationId, muted)
      const authoritative = await fetchConversationNotificationMute(userId, conversationId)
      setMutedConversationIds(current => {
        const next = new Set(current)
        if (authoritative) next.add(conversationId)
        else next.delete(conversationId)
        return next
      })
    } catch (error) {
      setMutedConversationIds(current => {
        const next = new Set(current)
        if (previous) next.add(conversationId)
        else next.delete(conversationId)
        return next
      })
      throw error
    }
  }, [mutedConversationIds, userId])

  return {
    mode,
    setMode,
    query,
    setQuery,
    items,
    allItems,
    counts,
    loading,
    refresh,
    updatePreference,
    toggleMute,
  }
}

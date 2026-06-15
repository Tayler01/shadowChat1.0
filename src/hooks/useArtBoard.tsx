import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  ensureSession,
  getRealtimeClient,
  getWorkingClient,
  type ArtBoardFrameStyle,
  type ArtBoardItem,
  type ArtBoardItemType,
  type ArtBoardLink,
  type ArtBoardLinkLabel,
  type ArtBoardNoteColor,
  type ArtBoardReaction,
} from '../lib/supabase'
import { getArtBoardChunksForViewport } from '../lib/artBoard'
import { runRealtimeRecovery } from '../lib/realtimeRecovery'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import { useAuth } from './useAuth'
import { useRealtimeRecovery } from './useRealtimeRecovery'

const ART_BOARD_ITEM_SELECT = `
  *,
  user:users!user_id(id, username, display_name, avatar_url, color, status, admin_role, checkers_crown, war_sword, shadow_pin_gold_pin, shadow_runner_sprint_medal, shadow_runner_knight_medal, shadow_runner_knight_level_id, gold_easter_egg, presence_visibility, created_at, updated_at)
`
const ART_BOARD_CACHE_MS = 60 * 1000

export interface ArtBoardViewportState {
  centerX: number
  centerY: number
  width: number
  height: number
  zoom: number
}

export interface CreateArtBoardItemInput {
  item_type: ArtBoardItemType
  title?: string | null
  caption?: string | null
  tags?: string[]
  image_url?: string | null
  image_path?: string | null
  thumbnail_url?: string | null
  thumbnail_path?: string | null
  image_width?: number | null
  image_height?: number | null
  alt_text?: string | null
  note_text?: string | null
  note_color?: ArtBoardNoteColor
  frame_style?: ArtBoardFrameStyle
  position_x: number
  position_y: number
  width: number
  height: number
  rotation: number
  z_index?: number
}

export type UpdateArtBoardItemInput = Partial<
  Pick<
    ArtBoardItem,
    | 'title'
    | 'caption'
    | 'tags'
    | 'thumbnail_url'
    | 'thumbnail_path'
    | 'image_width'
    | 'image_height'
    | 'alt_text'
    | 'note_text'
    | 'note_color'
    | 'frame_style'
    | 'position_x'
    | 'position_y'
    | 'width'
    | 'height'
    | 'rotation'
    | 'z_index'
  >
>

const normalizeItem = (item: ArtBoardItem): ArtBoardItem => ({
  ...item,
  tags: item.tags ?? [],
  position_x: Number(item.position_x),
  position_y: Number(item.position_y),
  width: Number(item.width),
  height: Number(item.height),
  rotation: Number(item.rotation),
  z_index: Number(item.z_index),
  chunk_x: Number(item.chunk_x),
  chunk_y: Number(item.chunk_y),
  reactions: item.reactions ?? {},
})

const sortItems = (items: ArtBoardItem[]) =>
  [...items].sort((a, b) => a.z_index - b.z_index || new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

const sortRecentItems = (items: ArtBoardItem[]) =>
  [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

const dedupeItems = (items: ArtBoardItem[]) => {
  const next = new Map<string, ArtBoardItem>()
  items.forEach(item => {
    if (!item.deleted_at) next.set(item.id, normalizeItem(item))
  })
  return sortItems(Array.from(next.values()))
}

const dedupeLinks = (links: ArtBoardLink[]) => {
  const next = new Map<string, ArtBoardLink>()
  links.forEach(link => next.set(link.id, link))
  return Array.from(next.values()).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}

type ArtBoardCacheEntry = {
  items: ArtBoardItem[]
  recentItems: ArtBoardItem[]
  links: ArtBoardLink[]
  loadedChunkKeys: string[]
  loadedLinkItemIds: string[]
  fetchedAt: number
}

const artBoardCacheByUserId = new Map<string, ArtBoardCacheEntry>()

const isFreshArtBoardCache = (cache: ArtBoardCacheEntry | null) =>
  Boolean(cache && Date.now() - cache.fetchedAt < ART_BOARD_CACHE_MS)

const writeArtBoardCache = (
  userId: string,
  items: ArtBoardItem[],
  recentItems: ArtBoardItem[],
  links: ArtBoardLink[],
  loadedChunkKeys: Set<string>,
  loadedLinkItemIds: Set<string>
) => {
  artBoardCacheByUserId.set(userId, {
    items: dedupeItems(items),
    recentItems: sortRecentItems(recentItems).slice(0, 18),
    links: dedupeLinks(links),
    loadedChunkKeys: Array.from(loadedChunkKeys),
    loadedLinkItemIds: Array.from(loadedLinkItemIds),
    fetchedAt: Date.now(),
  })
}

export function useArtBoard() {
  const { user } = useAuth()
  const cacheUserId = user?.id ?? 'anonymous'
  const cachedBoard = artBoardCacheByUserId.get(cacheUserId) ?? null
  const [items, setItems] = useState<ArtBoardItem[]>(() => cachedBoard?.items ?? [])
  const [recentItems, setRecentItems] = useState<ArtBoardItem[]>(() => cachedBoard?.recentItems ?? [])
  const [links, setLinks] = useState<ArtBoardLink[]>(() => cachedBoard?.links ?? [])
  const [loading, setLoading] = useState(!cachedBoard)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const loadedChunkKeysRef = useRef<Set<string>>(new Set(cachedBoard?.loadedChunkKeys ?? []))
  const loadedLinkItemIdsRef = useRef<Set<string>>(new Set(cachedBoard?.loadedLinkItemIds ?? []))
  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribeRef = useRef<(() => Promise<RealtimeChannel | null>) | null>(null)

  const itemIds = useMemo(() => items.map(item => item.id), [items])

  const fetchItem = useCallback(async (itemId: string) => {
    const workingClient = await getWorkingClient()
    const { data, error: fetchError } = await workingClient
      .from('art_board_items')
      .select(ART_BOARD_ITEM_SELECT)
      .eq('id', itemId)
      .maybeSingle()

    if (fetchError || !data) return null
    return normalizeItem(data as unknown as ArtBoardItem)
  }, [])

  const fetchRecent = useCallback(async () => {
    const workingClient = await getWorkingClient()
    const { data, error: fetchError } = await workingClient
      .from('art_board_items')
      .select(ART_BOARD_ITEM_SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(18)

    if (fetchError) throw fetchError
    setRecentItems(sortRecentItems(((data ?? []) as unknown[]).map(item => normalizeItem(item as ArtBoardItem))))
  }, [])

  const fetchLinksForItems = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setLinks([])
      loadedLinkItemIdsRef.current.clear()
      return
    }

    const missingIds = ids.filter(id => !loadedLinkItemIdsRef.current.has(id))
    if (missingIds.length === 0) return

    const idList = missingIds.join(',')
    const workingClient = await getWorkingClient()
    const { data, error: fetchError } = await workingClient
      .from('art_board_links')
      .select('*')
      .or(`item_a_id.in.(${idList}),item_b_id.in.(${idList})`)

    if (fetchError) throw fetchError
    missingIds.forEach(id => loadedLinkItemIdsRef.current.add(id))
    setLinks(prev => dedupeLinks([...prev, ...((data ?? []) as ArtBoardLink[])]))
  }, [])

  const loadViewport = useCallback(async (viewport: ArtBoardViewportState) => {
    if (!user) return
    const bounds = getArtBoardChunksForViewport(
      viewport.centerX,
      viewport.centerY,
      viewport.width,
      viewport.height,
      viewport.zoom
    )
    const chunkKeys: string[] = []
    for (let x = bounds.minChunkX; x <= bounds.maxChunkX; x += 1) {
      for (let y = bounds.minChunkY; y <= bounds.maxChunkY; y += 1) {
        const key = `${x}:${y}`
        if (!loadedChunkKeysRef.current.has(key)) {
          chunkKeys.push(key)
        }
      }
    }

    if (chunkKeys.length === 0) {
      return
    }

    chunkKeys.forEach(key => loadedChunkKeysRef.current.add(key))
    setLoading(true)
    try {
      const workingClient = await getWorkingClient()
      const { data, error: fetchError } = await workingClient
        .from('art_board_items')
        .select(ART_BOARD_ITEM_SELECT)
        .is('deleted_at', null)
        .gte('chunk_x', bounds.minChunkX)
        .lte('chunk_x', bounds.maxChunkX)
        .gte('chunk_y', bounds.minChunkY)
        .lte('chunk_y', bounds.maxChunkY)
        .order('z_index', { ascending: true })
        .limit(240)

      if (fetchError) throw fetchError

      const nextItems = ((data ?? []) as unknown[]).map(item => normalizeItem(item as ArtBoardItem))
      setItems(prev => dedupeItems([...prev, ...nextItems]))
      await fetchLinksForItems(nextItems.map(item => item.id))
      setError(null)
    } catch (err) {
      chunkKeys.forEach(key => loadedChunkKeysRef.current.delete(key))
      setError(err instanceof Error ? err.message : 'Unable to load Art Board')
    } finally {
      setLoading(false)
    }
  }, [fetchLinksForItems, user])

  const refreshHome = useCallback(async (options: { clearExisting?: boolean } = {}) => {
    const clearExisting = options.clearExisting ?? true
    loadedChunkKeysRef.current.clear()
    loadedLinkItemIdsRef.current.clear()
    if (clearExisting) {
      setItems([])
      setLinks([])
    }
    await Promise.all([
      loadViewport({ centerX: 0, centerY: 0, width: 1200, height: 900, zoom: 1 }),
      fetchRecent(),
    ])
  }, [fetchRecent, loadViewport])

  useEffect(() => {
    if (!user) return
    const cached = artBoardCacheByUserId.get(cacheUserId) ?? null
    if (isFreshArtBoardCache(cached)) {
      loadedChunkKeysRef.current = new Set(cached?.loadedChunkKeys ?? [])
      loadedLinkItemIdsRef.current = new Set(cached?.loadedLinkItemIds ?? [])
      setItems(cached?.items ?? [])
      setRecentItems(cached?.recentItems ?? [])
      setLinks(cached?.links ?? [])
      setLoading(false)
      setError(null)
      return
    }

    void refreshHome({ clearExisting: !cached })
  }, [cacheUserId, refreshHome, user])

  useEffect(() => {
    if (loading && items.length === 0 && recentItems.length === 0) return
    if (error && items.length === 0 && recentItems.length === 0) return
    writeArtBoardCache(cacheUserId, items, recentItems, links, loadedChunkKeysRef.current, loadedLinkItemIdsRef.current)
  }, [cacheUserId, error, items, links, loading, recentItems])

  useEffect(() => {
    if (itemIds.length === 0) return
    void fetchLinksForItems(itemIds)
  }, [fetchLinksForItems, itemIds])

  const resetArtChannel = useCallback(async () => {
    const activeChannel = channelRef.current
    const realtimeClient = getRealtimeClient()
    if (activeChannel && realtimeClient?.removeChannel) {
      try {
        realtimeClient.removeChannel(activeChannel)
      } catch {
        // ignore cleanup failures
      }
    }

    channelRef.current = null
    if (subscribeRef.current) {
      channelRef.current = await subscribeRef.current().catch(() => null)
    }
  }, [])

  useRealtimeRecovery(() => {
    void resetArtChannel()
  })

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let currentClient: any = null

    const subscribe = async () => {
      currentClient = await getWorkingClient().catch(() => getRealtimeClient())
      currentClient = currentClient || getRealtimeClient()
      if (!currentClient?.channel) return null

      channel = currentClient
        .channel(createRealtimeChannelName('public:art_board'))
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'art_board_items' },
          async (payload: any) => {
            if (payload.eventType === 'DELETE') {
              setItems(prev => prev.filter(item => item.id !== payload.old.id))
              setRecentItems(prev => prev.filter(item => item.id !== payload.old.id))
              loadedLinkItemIdsRef.current.delete(payload.old.id)
              return
            }

            const item = await fetchItem(payload.new.id)
            if (!item || item.deleted_at) {
              setItems(prev => prev.filter(existing => existing.id !== payload.new.id))
              setRecentItems(prev => prev.filter(existing => existing.id !== payload.new.id))
              return
            }

            setItems(prev => dedupeItems([...prev.filter(existing => existing.id !== item.id), item]))
            setRecentItems(prev => sortRecentItems([item, ...prev.filter(existing => existing.id !== item.id)]).slice(0, 18))
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'art_board_links' },
          (payload: any) => {
            if (payload.eventType === 'DELETE') {
              setLinks(prev => prev.filter(link => link.id !== payload.old.id))
              return
            }

            setLinks(prev => dedupeLinks([...prev.filter(link => link.id !== payload.new.id), payload.new as ArtBoardLink]))
          }
        )
        .subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            void runRealtimeRecovery('channel-error')
          }
        })

      channelRef.current = channel
      return channel
    }

    subscribeRef.current = subscribe
    void subscribe()

    return () => {
      subscribeRef.current = null
      if (channel && currentClient?.removeChannel) {
        currentClient.removeChannel(channel)
      }
      channelRef.current = null
    }
  }, [fetchItem, resetArtChannel, user])

  const createItem = useCallback(async (input: CreateArtBoardItemInput) => {
    if (!user) return null
    const sessionValid = await ensureSession()
    if (!sessionValid) throw new Error('Authentication session is invalid or expired.')

    setSaving(true)
    try {
      const workingClient = await getWorkingClient()
      const { data, error: insertError } = await workingClient
        .from('art_board_items')
        .insert({
          ...input,
          user_id: user.id,
          tags: input.tags ?? [],
          note_color: input.note_color ?? 'butter',
          frame_style: input.frame_style ?? 'clean',
          z_index: input.z_index ?? Date.now(),
        })
        .select(ART_BOARD_ITEM_SELECT)
        .single()

      if (insertError) throw insertError
      const item = normalizeItem(data as unknown as ArtBoardItem)
      setItems(prev => dedupeItems([...prev, item]))
      setRecentItems(prev => sortRecentItems([item, ...prev.filter(existing => existing.id !== item.id)]).slice(0, 18))
      return item
    } finally {
      setSaving(false)
    }
  }, [user])

  const updateItem = useCallback(async (itemId: string, updates: UpdateArtBoardItemInput) => {
    const workingClient = await getWorkingClient()
    const { data, error: updateError } = await workingClient
      .from('art_board_items')
      .update(updates)
      .eq('id', itemId)
      .select(ART_BOARD_ITEM_SELECT)
      .single()

    if (updateError) throw updateError
    const item = normalizeItem(data as unknown as ArtBoardItem)
    setItems(prev => dedupeItems([...prev.filter(existing => existing.id !== item.id), item]))
    setRecentItems(prev => sortRecentItems([item, ...prev.filter(existing => existing.id !== item.id)]).slice(0, 18))
    return item
  }, [])

  const deleteItem = useCallback(async (itemId: string) => {
    const workingClient = await getWorkingClient()
    const { error: deleteError } = await workingClient.rpc('delete_art_board_item', {
      target_item_id: itemId,
    })
    if (deleteError) throw deleteError
    setItems(prev => prev.filter(item => item.id !== itemId))
    setRecentItems(prev => prev.filter(item => item.id !== itemId))
    setLinks(prev => prev.filter(link => link.item_a_id !== itemId && link.item_b_id !== itemId))
    loadedLinkItemIdsRef.current.delete(itemId)
  }, [])

  const toggleReaction = useCallback(async (itemId: string, reaction: ArtBoardReaction) => {
    const workingClient = await getWorkingClient()
    const { data, error: reactionError } = await workingClient.rpc('toggle_art_board_reaction', {
      target_item_id: itemId,
      target_reaction: reaction,
    })
    if (reactionError) throw reactionError
    const item = normalizeItem(data as unknown as ArtBoardItem)
    setItems(prev => dedupeItems([...prev.filter(existing => existing.id !== item.id), item]))
    setRecentItems(prev => sortRecentItems([item, ...prev.filter(existing => existing.id !== item.id)]).slice(0, 18))
    return item
  }, [])

  const createLink = useCallback(async (sourceItemId: string, targetItemId: string, label: ArtBoardLinkLabel) => {
    const workingClient = await getWorkingClient()
    const { data, error: linkError } = await workingClient.rpc('create_art_board_link', {
      source_item_id: sourceItemId,
      target_item_id: targetItemId,
      link_label: label,
    })
    if (linkError) throw linkError
    const link = data as ArtBoardLink
    setLinks(prev => dedupeLinks([...prev.filter(existing => existing.id !== link.id), link]))
    return link
  }, [])

  const updateLink = useCallback(async (linkId: string, label: ArtBoardLinkLabel) => {
    const workingClient = await getWorkingClient()
    const { data, error: linkError } = await workingClient.rpc('update_art_board_link', {
      target_link_id: linkId,
      link_label: label,
    })
    if (linkError) throw linkError
    const link = data as ArtBoardLink
    setLinks(prev => dedupeLinks([...prev.filter(existing => existing.id !== link.id), link]))
    return link
  }, [])

  const deleteLink = useCallback(async (linkId: string) => {
    const workingClient = await getWorkingClient()
    const { error: linkError } = await workingClient.rpc('delete_art_board_link', {
      target_link_id: linkId,
    })
    if (linkError) throw linkError
    setLinks(prev => prev.filter(link => link.id !== linkId))
  }, [])

  return {
    items,
    recentItems,
    links,
    loading,
    saving,
    error,
    loadViewport,
    refreshHome,
    createItem,
    updateItem,
    deleteItem,
    toggleReaction,
    createLink,
    updateLink,
    deleteLink,
  }
}

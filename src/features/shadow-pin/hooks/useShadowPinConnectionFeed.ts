import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { PERSONAL_BLOCKS_CHANGED_EVENT } from '../../../lib/personalBlocking'
import { CONNECTIONS_CHANGED_EVENT } from '../../connections/connectionModel'
import { getMyConnectionSummary } from '../../connections/connectionsApi'
import {
  fetchMyShadowPinConnectionFeed,
  toggleShadowPinImageHeart,
} from '../api/shadowPinApi'
import type { ShadowPinFeedCursor, ShadowPinImage } from '../types'

const CACHE_MS = 2 * 60 * 1000

type FeedCacheEntry = {
  images: ShadowPinImage[]
  cursor: ShadowPinFeedCursor | null
  hasMore: boolean
  acceptedCount: number | null
  fetchedAt: number
}

const cacheByUserId = new Map<string, FeedCacheEntry>()
let globalInvalidationListenersInstalled = false

const dedupeImages = (images: ShadowPinImage[]) => {
  const byId = new Map<string, ShadowPinImage>()
  images.forEach(image => byId.set(image.id, image))
  return Array.from(byId.values()).sort((first, second) => {
    const timeDifference = new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    return timeDifference || second.id.localeCompare(first.id)
  })
}

export function invalidateShadowPinConnectionFeed(userId?: string) {
  if (userId) cacheByUserId.delete(userId)
  else cacheByUserId.clear()
}

const ensureGlobalInvalidationListeners = () => {
  if (globalInvalidationListenersInstalled || typeof window === 'undefined') return
  const invalidateAll = () => invalidateShadowPinConnectionFeed()
  window.addEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAll)
  window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAll)
  globalInvalidationListenersInstalled = true
}

export function useShadowPinConnectionFeed(enabled: boolean) {
  ensureGlobalInvalidationListeners()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const cached = userId ? cacheByUserId.get(userId) : undefined
  const freshCache = cached && Date.now() - cached.fetchedAt < CACHE_MS ? cached : undefined
  const [images, setImages] = useState<ShadowPinImage[]>(freshCache?.images ?? [])
  const [cursor, setCursor] = useState<ShadowPinFeedCursor | null>(freshCache?.cursor ?? null)
  const [hasMore, setHasMore] = useState(freshCache?.hasMore ?? false)
  const [acceptedCount, setAcceptedCount] = useState<number | null>(freshCache?.acceptedCount ?? null)
  const [loading, setLoading] = useState(Boolean(enabled && userId && !freshCache))
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const lastResumeRefreshAtRef = useRef(0)

  const writeCache = useCallback((entry: Omit<FeedCacheEntry, 'fetchedAt'>) => {
    if (!userId) return
    cacheByUserId.set(userId, { ...entry, fetchedAt: Date.now() })
  }, [userId])

  const refresh = useCallback(async (showLoading = true) => {
    if (!enabled || !userId) return
    const generation = ++generationRef.current
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const page = await fetchMyShadowPinConnectionFeed(null)
      if (generationRef.current !== generation) return
      let nextAcceptedCount = cacheByUserId.get(userId)?.acceptedCount ?? null
      if (page.images.length === 0) {
        const summary = await getMyConnectionSummary()
        if (generationRef.current !== generation) return
        nextAcceptedCount = summary.acceptedCount
      }
      setImages(page.images)
      setCursor(page.nextCursor)
      setHasMore(page.hasMore)
      setAcceptedCount(nextAcceptedCount)
      writeCache({
        images: page.images,
        cursor: page.nextCursor,
        hasMore: page.hasMore,
        acceptedCount: nextAcceptedCount,
      })
    } catch (refreshError) {
      if (generationRef.current !== generation) return
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to load your Connections feed')
    } finally {
      if (generationRef.current === generation) setLoading(false)
    }
  }, [enabled, userId, writeCache])

  const loadMore = useCallback(async () => {
    if (!enabled || !userId || !hasMore || !cursor || loadingMoreRef.current) return
    loadingMoreRef.current = true
    setLoading(true)
    const generation = generationRef.current
    try {
      const page = await fetchMyShadowPinConnectionFeed(cursor)
      if (generationRef.current !== generation) return
      const nextImages = dedupeImages([...images, ...page.images])
      setImages(nextImages)
      setCursor(page.nextCursor)
      setHasMore(page.hasMore)
      writeCache({ images: nextImages, cursor: page.nextCursor, hasMore: page.hasMore, acceptedCount })
      setError(null)
    } catch (loadError) {
      if (generationRef.current === generation) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load more Pins')
      }
    } finally {
      loadingMoreRef.current = false
      if (generationRef.current === generation) setLoading(false)
    }
  }, [acceptedCount, cursor, enabled, hasMore, images, userId, writeCache])

  useEffect(() => {
    if (!enabled || !userId) {
      generationRef.current += 1
      setLoading(false)
      return
    }

    const nextCached = cacheByUserId.get(userId)
    if (nextCached && Date.now() - nextCached.fetchedAt < CACHE_MS) {
      setImages(nextCached.images)
      setCursor(nextCached.cursor)
      setHasMore(nextCached.hasMore)
      setAcceptedCount(nextCached.acceptedCount)
      setLoading(false)
      return
    }

    setImages([])
    setCursor(null)
    setHasMore(false)
    setAcceptedCount(null)
    void refresh(true)
  }, [enabled, refresh, userId])

  useEffect(() => {
    if (!enabled || !userId) return
    const invalidateAndRefresh = () => {
      invalidateShadowPinConnectionFeed(userId)
      generationRef.current += 1
      setImages([])
      setCursor(null)
      setHasMore(false)
      setAcceptedCount(null)
      void refresh(true)
    }
    const refreshAfterResume = () => {
      const now = Date.now()
      if (now - lastResumeRefreshAtRef.current < 750) return
      lastResumeRefreshAtRef.current = now
      invalidateAndRefresh()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAfterResume()
    }

    window.addEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener('focus', refreshAfterResume)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener('focus', refreshAfterResume)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, refresh, userId])

  const updateImage = useCallback((imageId: string, updater: (image: ShadowPinImage) => ShadowPinImage) => {
    setImages(current => {
      const nextImages = current.map(image => image.id === imageId ? updater(image) : image)
      writeCache({ images: nextImages, cursor, hasMore, acceptedCount })
      return nextImages
    })
  }, [acceptedCount, cursor, hasMore, writeCache])

  const toggleHeart = useCallback(async (image: ShadowPinImage) => {
    const optimistic = {
      ...image,
      viewer_has_hearted: !image.viewer_has_hearted,
      heart_count: Math.max(0, image.heart_count + (image.viewer_has_hearted ? -1 : 1)),
    }
    updateImage(image.id, () => optimistic)
    try {
      const updated = await toggleShadowPinImageHeart(image.id)
      updateImage(image.id, current => ({ ...current, ...updated }))
      return updated
    } catch (toggleError) {
      updateImage(image.id, () => image)
      throw toggleError
    }
  }, [updateImage])

  const setCommentCount = useCallback((imageId: string, count: number) => {
    updateImage(imageId, image => ({ ...image, comment_count: Math.max(0, Math.trunc(count) || 0) }))
  }, [updateImage])

  return useMemo(() => ({
    images,
    loading,
    error,
    hasMore,
    acceptedCount,
    refresh: () => refresh(true),
    loadMore,
    toggleHeart,
    setCommentCount,
  }), [acceptedCount, error, hasMore, images, loadMore, loading, refresh, setCommentCount, toggleHeart])
}

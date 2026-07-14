import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { PERSONAL_BLOCKS_CHANGED_EVENT } from '../../lib/personalBlocking'
import { CONNECTIONS_CHANGED_EVENT } from '../connections/connectionModel'
import { toggleShadowPinImageHeart } from '../shadow-pin/api/shadowPinApi'
import type { ShadowPinFeedCursor, ShadowPinImage } from '../shadow-pin/types'
import { listMyShadowPinCircleFeed } from './innerCirclesApi'
import {
  INNER_CIRCLES_CHANGED_EVENT,
  type InnerCirclesChangedDetail,
} from './innerCirclesModel'

const CACHE_MS = 2 * 60 * 1000

type CircleFeedCacheEntry = {
  images: ShadowPinImage[]
  cursor: ShadowPinFeedCursor | null
  hasMore: boolean
  fetchedAt: number
}

const feedByUserCircle = new Map<string, CircleFeedCacheEntry>()
let globalListenersInstalled = false

const cacheKey = (userId: string, circleId: string) => `${userId}:${circleId}`

const dedupeImages = (images: ShadowPinImage[]) => {
  const byId = new Map<string, ShadowPinImage>()
  images.forEach(image => byId.set(image.id, image))
  return Array.from(byId.values()).sort((first, second) => {
    const timeDifference = new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
    return timeDifference || second.id.localeCompare(first.id)
  })
}

export const invalidateInnerCircleFeeds = (userId?: string, circleId?: string) => {
  if (!userId) {
    feedByUserCircle.clear()
    return
  }
  if (circleId) {
    feedByUserCircle.delete(cacheKey(userId, circleId))
    return
  }
  Array.from(feedByUserCircle.keys()).forEach(key => {
    if (key.startsWith(`${userId}:`)) feedByUserCircle.delete(key)
  })
}

const ensureGlobalInvalidationListeners = () => {
  if (globalListenersInstalled || typeof window === 'undefined') return
  const invalidateAll = () => invalidateInnerCircleFeeds()
  window.addEventListener(INNER_CIRCLES_CHANGED_EVENT, invalidateAll)
  window.addEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAll)
  window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAll)
  globalListenersInstalled = true
}

const errorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
)

export const useInnerCircleFeed = (circleId: string | null, enabled = true) => {
  ensureGlobalInvalidationListeners()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const key = userId && circleId ? cacheKey(userId, circleId) : null
  const cached = key ? feedByUserCircle.get(key) : undefined
  const freshCache = cached && Date.now() - cached.fetchedAt < CACHE_MS ? cached : undefined
  const [images, setImages] = useState<ShadowPinImage[]>(freshCache?.images ?? [])
  const [cursor, setCursor] = useState<ShadowPinFeedCursor | null>(freshCache?.cursor ?? null)
  const [hasMore, setHasMore] = useState(freshCache?.hasMore ?? false)
  const [loading, setLoading] = useState(Boolean(enabled && key && !freshCache))
  const [error, setError] = useState<string | null>(null)
  const imagesRef = useRef(images)
  const cursorRef = useRef(cursor)
  const hasMoreRef = useRef(hasMore)
  const generationRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const lastResumeRefreshAtRef = useRef(0)
  const heartVersionsRef = useRef(new Map<string, number>())

  const writeCache = useCallback((entry: Omit<CircleFeedCacheEntry, 'fetchedAt'>) => {
    if (!key) return
    feedByUserCircle.set(key, { ...entry, fetchedAt: Date.now() })
  }, [key])

  const applyFeed = useCallback((next: {
    images: ShadowPinImage[]
    cursor: ShadowPinFeedCursor | null
    hasMore: boolean
  }) => {
    imagesRef.current = next.images
    cursorRef.current = next.cursor
    hasMoreRef.current = next.hasMore
    setImages(next.images)
    setCursor(next.cursor)
    setHasMore(next.hasMore)
    writeCache(next)
  }, [writeCache])

  const clearFeed = useCallback(() => {
    imagesRef.current = []
    cursorRef.current = null
    hasMoreRef.current = false
    setImages([])
    setCursor(null)
    setHasMore(false)
  }, [])

  const refresh = useCallback(async (showLoading = false) => {
    if (!enabled || !userId || !circleId || !key) return
    const generation = ++generationRef.current
    if (showLoading) setLoading(true)
    try {
      const page = await listMyShadowPinCircleFeed(circleId, null)
      if (generationRef.current !== generation) return
      applyFeed({ images: page.images, cursor: page.nextCursor, hasMore: page.hasMore })
      setError(null)
    } catch (caught) {
      if (generationRef.current === generation) {
        setError(errorMessage(caught, 'Unable to load this Inner Circle feed.'))
      }
    } finally {
      if (generationRef.current === generation) setLoading(false)
    }
  }, [applyFeed, circleId, enabled, key, userId])

  const loadMore = useCallback(async () => {
    if (
      !enabled
      || !userId
      || !circleId
      || !key
      || !hasMoreRef.current
      || !cursorRef.current
      || loadingMoreRef.current
    ) return
    loadingMoreRef.current = true
    setLoading(true)
    const generation = generationRef.current
    try {
      const page = await listMyShadowPinCircleFeed(circleId, cursorRef.current)
      if (generationRef.current !== generation) return
      applyFeed({
        images: dedupeImages([...imagesRef.current, ...page.images]),
        cursor: page.nextCursor,
        hasMore: page.hasMore,
      })
      setError(null)
    } catch (caught) {
      if (generationRef.current === generation) {
        setError(errorMessage(caught, 'Unable to load more Pins.'))
      }
    } finally {
      loadingMoreRef.current = false
      if (generationRef.current === generation) setLoading(false)
    }
  }, [applyFeed, circleId, enabled, key, userId])

  const updateImage = useCallback((
    imageId: string,
    updater: (image: ShadowPinImage) => ShadowPinImage,
  ) => {
    const nextImages = imagesRef.current.map(image => image.id === imageId ? updater(image) : image)
    applyFeed({ images: nextImages, cursor: cursorRef.current, hasMore: hasMoreRef.current })
  }, [applyFeed])

  const toggleHeart = useCallback(async (image: ShadowPinImage) => {
    const version = (heartVersionsRef.current.get(image.id) ?? 0) + 1
    heartVersionsRef.current.set(image.id, version)
    const optimistic = {
      ...image,
      viewer_has_hearted: !image.viewer_has_hearted,
      heart_count: Math.max(0, image.heart_count + (image.viewer_has_hearted ? -1 : 1)),
    }
    updateImage(image.id, () => optimistic)
    try {
      const updated = await toggleShadowPinImageHeart(image.id)
      if (heartVersionsRef.current.get(image.id) === version) {
        updateImage(image.id, current => ({ ...current, ...updated }))
      }
      return updated
    } catch (caught) {
      if (heartVersionsRef.current.get(image.id) === version) updateImage(image.id, () => image)
      throw caught
    }
  }, [updateImage])

  const setCommentCount = useCallback((imageId: string, count: number) => {
    updateImage(imageId, image => ({ ...image, comment_count: Math.max(0, Math.trunc(count) || 0) }))
  }, [updateImage])

  useEffect(() => {
    generationRef.current += 1
    loadingMoreRef.current = false
    if (!enabled || !key || !circleId) {
      clearFeed()
      setLoading(false)
      return
    }
    const nextCached = feedByUserCircle.get(key)
    if (nextCached && Date.now() - nextCached.fetchedAt < CACHE_MS) {
      applyFeed({
        images: nextCached.images,
        cursor: nextCached.cursor,
        hasMore: nextCached.hasMore,
      })
      setLoading(false)
    } else {
      clearFeed()
      void refresh(true)
    }
  }, [applyFeed, circleId, clearFeed, enabled, key, refresh])

  useEffect(() => {
    if (!enabled || !key || !circleId) return
    const invalidateAndRefresh = (event?: Event) => {
      const detail = (event as CustomEvent<InnerCirclesChangedDetail> | undefined)?.detail
      if (detail?.circleId && detail.circleId !== circleId) return
      if (detail?.change === 'circle' && detail.action !== 'delete') return
      feedByUserCircle.delete(key)
      generationRef.current += 1
      clearFeed()
      void refresh(true)
    }
    const refreshAfterResume = () => {
      const now = Date.now()
      if (now - lastResumeRefreshAtRef.current < 750) return
      lastResumeRefreshAtRef.current = now
      feedByUserCircle.delete(key)
      void refresh(false)
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAfterResume()
    }
    window.addEventListener(INNER_CIRCLES_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener('focus', refreshAfterResume)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener(INNER_CIRCLES_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener('focus', refreshAfterResume)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [circleId, clearFeed, enabled, key, refresh])

  return useMemo(() => ({
    images,
    loading,
    error,
    hasMore,
    refresh: () => refresh(true),
    loadMore,
    toggleHeart,
    setCommentCount,
  }), [error, hasMore, images, loadMore, loading, refresh, setCommentCount, toggleHeart])
}

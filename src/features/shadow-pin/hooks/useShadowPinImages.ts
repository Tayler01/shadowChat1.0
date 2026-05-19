import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createShadowPinImage,
  deleteShadowPinImage,
  fetchShadowPinCategory,
  fetchShadowPinImages,
  toggleShadowPinImageHeart,
  updateShadowPinImage,
} from '../api/shadowPinApi'
import type { ShadowPinCategory, ShadowPinImage, ShadowPinImageFormValues } from '../types'
import { invalidateShadowPinCategoriesCache } from './useShadowPinCategories'
import { useAuth } from '../../../hooks/useAuth'

const SHADOW_PIN_IMAGE_CACHE_MS = 5 * 60 * 1000

type ImageCacheEntry = {
  category: ShadowPinCategory | null
  images: ShadowPinImage[]
  page: number
  hasMore: boolean
  fetchedAt: number
}

const imageCacheByCategoryId = new Map<string, ImageCacheEntry>()
const imagePageRequestByKey = new Map<string, Promise<{
  category: ShadowPinCategory | null
  images: ShadowPinImage[]
  hasMore: boolean
}>>()

const normalizeImage = (image: ShadowPinImage): ShadowPinImage => ({
  ...image,
  heart_count: Number(image.heart_count ?? 0),
  viewer_has_hearted: Boolean(image.viewer_has_hearted),
})

const sortImages = (images: ShadowPinImage[]) =>
  [...images].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

const dedupeImages = (images: ShadowPinImage[]) => {
  const map = new Map<string, ShadowPinImage>()
  images.forEach(image => {
    if (!image.deleted_at) map.set(image.id, normalizeImage(image))
  })
  return sortImages(Array.from(map.values()))
}

const getImageCacheKey = (userId: string, categoryId: string) => `${userId}:${categoryId}`

const getFreshImageCache = (cacheKey: string | null) => {
  if (!cacheKey) return null
  const cached = imageCacheByCategoryId.get(cacheKey)
  if (!cached) return null
  return Date.now() - cached.fetchedAt < SHADOW_PIN_IMAGE_CACHE_MS ? cached : null
}

const getFreshImageCacheForCategory = (userId: string, categoryId: string | null) => {
  if (!categoryId) return null
  return getFreshImageCache(getImageCacheKey(userId, categoryId))
}

const writeImageCache = (
  cacheKey: string,
  entry: Omit<ImageCacheEntry, 'fetchedAt'>
) => {
  const nextEntry = {
    ...entry,
    images: dedupeImages(entry.images),
    fetchedAt: Date.now(),
  }
  imageCacheByCategoryId.set(cacheKey, nextEntry)
  return nextEntry
}

const updateImageCache = (
  cacheKey: string,
  updater: (entry: ImageCacheEntry) => Omit<ImageCacheEntry, 'fetchedAt'>
) => {
  const current = imageCacheByCategoryId.get(cacheKey)
  if (!current) return null
  return writeImageCache(cacheKey, updater(current))
}

export function invalidateShadowPinImagesCache(categoryId?: string) {
  if (!categoryId) {
    imageCacheByCategoryId.clear()
    imagePageRequestByKey.clear()
    return
  }

  for (const key of Array.from(imageCacheByCategoryId.keys())) {
    if (key.endsWith(`:${categoryId}`)) imageCacheByCategoryId.delete(key)
  }
  for (const key of Array.from(imagePageRequestByKey.keys())) {
    if (key.includes(`:${categoryId}:`)) imagePageRequestByKey.delete(key)
  }
}

const loadImagePage = async (
  cacheKey: string,
  categoryId: string,
  targetPage: number,
  force = false
) => {
  const requestKey = `${cacheKey}:${targetPage}`
  const existingRequest = imagePageRequestByKey.get(requestKey)
  if (!force && existingRequest) return existingRequest

  const request = (async () => {
    const cached = imageCacheByCategoryId.get(cacheKey)
    const [category, imageResult] = await Promise.all([
      targetPage === 0 || !cached?.category || force
        ? fetchShadowPinCategory(categoryId)
        : Promise.resolve(cached.category),
      fetchShadowPinImages(categoryId, targetPage),
    ])

    return {
      category,
      images: imageResult.images,
      hasMore: imageResult.hasMore,
    }
  })().finally(() => {
    imagePageRequestByKey.delete(requestKey)
  })

  imagePageRequestByKey.set(requestKey, request)
  return request
}

export function useShadowPinImages(categoryId: string | null) {
  const { user } = useAuth()
  const cacheUserId = user?.id ?? 'anonymous'
  const cacheKey = categoryId ? getImageCacheKey(cacheUserId, categoryId) : null
  const cached = getFreshImageCache(cacheKey)
  const [category, setCategory] = useState<ShadowPinCategory | null>(cached?.category ?? null)
  const [images, setImages] = useState<ShadowPinImage[]>(() => cached?.images ?? [])
  const [page, setPage] = useState(cached?.page ?? 0)
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? false)
  const [loading, setLoading] = useState(!cached)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(async (targetPage: number, append = false, force = false) => {
    if (!categoryId) return

    const nextCacheKey = getImageCacheKey(cacheUserId, categoryId)
    const freshCache = getFreshImageCache(nextCacheKey)
    if (!force && freshCache && targetPage <= freshCache.page) {
      setCategory(freshCache.category)
      setImages(freshCache.images)
      setPage(freshCache.page)
      setHasMore(freshCache.hasMore)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(!freshCache || force)
    try {
      const result = await loadImagePage(nextCacheKey, categoryId, targetPage, force)
      const previousEntry = imageCacheByCategoryId.get(nextCacheKey)
      const nextImages = append && previousEntry
        ? dedupeImages([...previousEntry.images, ...result.images])
        : dedupeImages(result.images)
      const nextEntry = writeImageCache(nextCacheKey, {
        category: result.category,
        images: nextImages,
        page: targetPage,
        hasMore: result.hasMore,
      })
      setCategory(nextEntry.category)
      setImages(nextEntry.images)
      setHasMore(nextEntry.hasMore)
      setPage(targetPage)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load images')
    } finally {
      setLoading(false)
    }
  }, [cacheUserId, categoryId])

  const refresh = useCallback(async () => {
    await loadPage(0, false, true)
  }, [loadPage])

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return
    await loadPage(page + 1, true)
  }, [hasMore, loadPage, loading, page])

  useEffect(() => {
    if (!categoryId) {
      setCategory(null)
      setImages([])
      setPage(0)
      setHasMore(false)
      setLoading(false)
      return
    }

    const freshCache = getFreshImageCacheForCategory(cacheUserId, categoryId)
    if (freshCache) {
      setCategory(freshCache.category)
      setImages(freshCache.images)
      setPage(freshCache.page)
      setHasMore(freshCache.hasMore)
      setLoading(false)
      setError(null)
      return
    }

    setCategory(null)
    setImages([])
    setPage(0)
    setHasMore(false)
    void loadPage(0, false, false)
  }, [cacheUserId, categoryId, loadPage])

  const createImage = useCallback(async (values: ShadowPinImageFormValues) => {
    if (!categoryId) throw new Error('Category is required.')
    setSaving(true)
    try {
      const image = await createShadowPinImage(categoryId, values)
      const nextCacheKey = getImageCacheKey(cacheUserId, categoryId)
      const nextEntry = writeImageCache(nextCacheKey, {
        category,
        images: [image, ...images],
        page,
        hasMore,
      })
      invalidateShadowPinCategoriesCache(cacheUserId)
      setImages(nextEntry.images)
      setPage(nextEntry.page)
      setHasMore(nextEntry.hasMore)
      return normalizeImage(image)
    } finally {
      setSaving(false)
    }
  }, [cacheUserId, category, categoryId, hasMore, images, page])

  const updateImage = useCallback(async (imageId: string, values: Pick<ShadowPinImageFormValues, 'title' | 'description'>) => {
    if (!categoryId) throw new Error('Category is required.')
    setSaving(true)
    try {
      const image = await updateShadowPinImage(imageId, values)
      const nextEntry = updateImageCache(getImageCacheKey(cacheUserId, categoryId), current => ({
        ...current,
        images: current.images.map(existing => existing.id === image.id ? image : existing),
      }))
      if (nextEntry) setImages(nextEntry.images)
      return normalizeImage(image)
    } finally {
      setSaving(false)
    }
  }, [cacheUserId, categoryId])

  const removeImage = useCallback(async (imageId: string) => {
    if (!categoryId) throw new Error('Category is required.')
    setSaving(true)
    try {
      await deleteShadowPinImage(imageId)
      const nextEntry = updateImageCache(getImageCacheKey(cacheUserId, categoryId), current => ({
        ...current,
        images: current.images.filter(image => image.id !== imageId),
      }))
      invalidateShadowPinCategoriesCache(cacheUserId)
      if (nextEntry) setImages(nextEntry.images)
    } finally {
      setSaving(false)
    }
  }, [cacheUserId, categoryId])

  const toggleHeart = useCallback(async (imageId: string) => {
    if (!categoryId) return
    const currentCacheKey = getImageCacheKey(cacheUserId, categoryId)
    const currentImage = (images.find(image => image.id === imageId)
      ? images
      : imageCacheByCategoryId.get(currentCacheKey)?.images ?? images)
      .find(image => image.id === imageId)
    if (!currentImage) return

    let previousImages: ShadowPinImage[] = []
    const nextViewerHasHearted = !currentImage.viewer_has_hearted
    setImages(prev => {
      previousImages = prev
      const nextImages = prev.map(image => image.id === imageId
        ? {
            ...image,
            viewer_has_hearted: nextViewerHasHearted,
            heart_count: Math.max(0, image.heart_count + (image.viewer_has_hearted ? -1 : 1)),
          }
        : image
      )
      updateImageCache(currentCacheKey, current => ({
        ...current,
        images: nextImages,
      }))
      return nextImages
    })
    try {
      const image = await toggleShadowPinImageHeart(imageId)
      const resolvedViewerHasHearted = typeof image.viewer_has_hearted === 'boolean'
        ? image.viewer_has_hearted
        : nextViewerHasHearted
      const nextEntry = updateImageCache(currentCacheKey, current => ({
        ...current,
        images: current.images.map(existing => existing.id === image.id
          ? { ...existing, ...image, viewer_has_hearted: resolvedViewerHasHearted }
          : existing),
      }))
      if (nextEntry) setImages(nextEntry.images)
    } catch (err) {
      setImages(previousImages)
      updateImageCache(currentCacheKey, current => ({
        ...current,
        images: previousImages,
      }))
      throw err
    }
  }, [cacheUserId, categoryId, images])

  return useMemo(() => ({
    category,
    images,
    loading,
    saving,
    error,
    hasMore,
    refresh,
    loadMore,
    createImage,
    updateImage,
    removeImage,
    toggleHeart,
  }), [category, createImage, error, hasMore, images, loadMore, loading, refresh, removeImage, saving, toggleHeart, updateImage])
}

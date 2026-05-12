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

export function useShadowPinImages(categoryId: string | null) {
  const [category, setCategory] = useState<ShadowPinCategory | null>(null)
  const [images, setImages] = useState<ShadowPinImage[]>([])
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPage = useCallback(async (targetPage: number, append = false) => {
    if (!categoryId) return
    setLoading(true)
    try {
      const [nextCategory, imageResult] = await Promise.all([
        fetchShadowPinCategory(categoryId),
        fetchShadowPinImages(categoryId, targetPage),
      ])
      setCategory(nextCategory)
      setImages(prev => append ? [...prev, ...imageResult.images] : imageResult.images)
      setHasMore(imageResult.hasMore)
      setPage(targetPage)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load images')
    } finally {
      setLoading(false)
    }
  }, [categoryId])

  const refresh = useCallback(async () => {
    await loadPage(0, false)
  }, [loadPage])

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return
    await loadPage(page + 1, true)
  }, [hasMore, loadPage, loading, page])

  useEffect(() => {
    setCategory(null)
    setImages([])
    setPage(0)
    setHasMore(false)
    void refresh()
  }, [refresh])

  const createImage = useCallback(async (values: ShadowPinImageFormValues) => {
    if (!categoryId) throw new Error('Category is required.')
    setSaving(true)
    try {
      const image = await createShadowPinImage(categoryId, values)
      await refresh()
      return image
    } finally {
      setSaving(false)
    }
  }, [categoryId, refresh])

  const updateImage = useCallback(async (imageId: string, values: Pick<ShadowPinImageFormValues, 'title' | 'description'>) => {
    setSaving(true)
    try {
      const image = await updateShadowPinImage(imageId, values)
      await refresh()
      return image
    } finally {
      setSaving(false)
    }
  }, [refresh])

  const removeImage = useCallback(async (imageId: string) => {
    setSaving(true)
    try {
      await deleteShadowPinImage(imageId)
      await refresh()
    } finally {
      setSaving(false)
    }
  }, [refresh])

  const toggleHeart = useCallback(async (imageId: string) => {
    setImages(prev => prev.map(image => image.id === imageId
      ? {
          ...image,
          viewer_has_hearted: !image.viewer_has_hearted,
          heart_count: Math.max(0, image.heart_count + (image.viewer_has_hearted ? -1 : 1)),
        }
      : image
    ))
    try {
      await toggleShadowPinImageHeart(imageId)
      await refresh()
    } catch (err) {
      await refresh()
      throw err
    }
  }, [refresh])

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

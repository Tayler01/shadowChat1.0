import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createShadowPinCategory,
  deleteShadowPinCategory,
  fetchShadowPinCategories,
  toggleShadowPinCategoryHeart,
  updateShadowPinCategory,
} from '../api/shadowPinApi'
import type { ShadowPinCategory, ShadowPinCategoryFormValues } from '../types'
import { useAuth } from '../../../hooks/useAuth'

const SHADOW_PIN_CATEGORY_CACHE_MS = 5 * 60 * 1000

type CategoryCacheEntry = {
  categories: ShadowPinCategory[]
  fetchedAt: number
}

const categoryCacheByUserId = new Map<string, CategoryCacheEntry>()
const categoryRequestByUserId = new Map<string, Promise<ShadowPinCategory[]>>()

const normalizeCategory = (category: ShadowPinCategory): ShadowPinCategory => ({
  ...category,
  heart_count: Number(category.heart_count ?? 0),
  viewer_has_hearted: Boolean(category.viewer_has_hearted),
})

const sortCategories = (categories: ShadowPinCategory[]) =>
  [...categories].sort((a, b) => {
    const aTime = new Date(a.latest_image_created_at || a.created_at).getTime()
    const bTime = new Date(b.latest_image_created_at || b.created_at).getTime()
    return bTime - aTime
  })

const dedupeCategories = (categories: ShadowPinCategory[]) => {
  const map = new Map<string, ShadowPinCategory>()
  categories.forEach(category => {
    if (!category.deleted_at) map.set(category.id, normalizeCategory(category))
  })
  return sortCategories(Array.from(map.values()))
}

const getFreshCategoryCache = (userId: string) => {
  const categoryCache = categoryCacheByUserId.get(userId)
  if (!categoryCache) return null
  return Date.now() - categoryCache.fetchedAt < SHADOW_PIN_CATEGORY_CACHE_MS ? categoryCache : null
}

const writeCategoryCache = (userId: string, categories: ShadowPinCategory[]) => {
  const categoryCache = {
    categories: dedupeCategories(categories),
    fetchedAt: Date.now(),
  }
  categoryCacheByUserId.set(userId, categoryCache)
  return categoryCache.categories
}

const loadCategories = async (userId: string, force = false) => {
  const cached = getFreshCategoryCache(userId)
  if (!force && cached) return cached.categories

  const existingRequest = categoryRequestByUserId.get(userId)
  if (!force && existingRequest) return existingRequest

  const categoryRequest = fetchShadowPinCategories()
    .then(categories => writeCategoryCache(userId, categories))
    .finally(() => {
      categoryRequestByUserId.delete(userId)
    })
  categoryRequestByUserId.set(userId, categoryRequest)
  return categoryRequest
}

const updateCategoryCache = (userId: string, updater: (categories: ShadowPinCategory[]) => ShadowPinCategory[]) => {
  const current = categoryCacheByUserId.get(userId)?.categories ?? []
  return writeCategoryCache(userId, updater(current))
}

export function invalidateShadowPinCategoriesCache(userId?: string) {
  if (userId) {
    categoryCacheByUserId.delete(userId)
    return
  }

  categoryCacheByUserId.clear()
}

export function useShadowPinCategories() {
  const { user } = useAuth()
  const cacheUserId = user?.id ?? 'anonymous'
  const cached = getFreshCategoryCache(cacheUserId)
  const [categories, setCategories] = useState<ShadowPinCategory[]>(() => cached?.categories ?? [])
  const [loading, setLoading] = useState(!cached)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    const freshCache = getFreshCategoryCache(cacheUserId)
    if (!force && freshCache) {
      setCategories(freshCache.categories)
      setLoading(false)
      setError(null)
      return
    }

    setLoading(!freshCache || force)
    try {
      setCategories(await loadCategories(cacheUserId, force))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ShadowPin')
    } finally {
      setLoading(false)
    }
  }, [cacheUserId])

  const refresh = useCallback(async () => {
    await load(true)
  }, [load])

  useEffect(() => {
    void load()
  }, [load])

  const createCategory = useCallback(async (values: ShadowPinCategoryFormValues) => {
    setSaving(true)
    try {
      const category = await createShadowPinCategory(values)
      const nextCategories = updateCategoryCache(cacheUserId, current => [category, ...current])
      setCategories(nextCategories)
      return normalizeCategory(category)
    } finally {
      setSaving(false)
    }
  }, [cacheUserId])

  const updateCategory = useCallback(async (
    categoryId: string,
    values: Pick<ShadowPinCategoryFormValues, 'title' | 'description'> & { file?: File | null }
  ) => {
    setSaving(true)
    try {
      const category = await updateShadowPinCategory(categoryId, values)
      const nextCategories = updateCategoryCache(cacheUserId, current => current.map(existing => (
        existing.id === category.id ? category : existing
      )))
      setCategories(nextCategories)
      return normalizeCategory(category)
    } finally {
      setSaving(false)
    }
  }, [cacheUserId])

  const removeCategory = useCallback(async (categoryId: string) => {
    setSaving(true)
    try {
      await deleteShadowPinCategory(categoryId)
      const nextCategories = updateCategoryCache(cacheUserId, current => current.filter(category => category.id !== categoryId))
      setCategories(nextCategories)
    } finally {
      setSaving(false)
    }
  }, [cacheUserId])

  const toggleHeart = useCallback(async (categoryId: string) => {
    let previousCategories: ShadowPinCategory[] = []
    setCategories(prev => {
      previousCategories = prev
      const nextCategories = prev.map(category => category.id === categoryId
        ? {
            ...category,
            viewer_has_hearted: !category.viewer_has_hearted,
            heart_count: Math.max(0, category.heart_count + (category.viewer_has_hearted ? -1 : 1)),
          }
        : category
      )
      writeCategoryCache(cacheUserId, nextCategories)
      return nextCategories
    })
    try {
      const category = await toggleShadowPinCategoryHeart(categoryId)
      const nextCategories = updateCategoryCache(cacheUserId, current => current.map(existing => (
        existing.id === category.id ? category : existing
      )))
      setCategories(nextCategories)
    } catch (err) {
      setCategories(previousCategories)
      writeCategoryCache(cacheUserId, previousCategories)
      throw err
    }
  }, [cacheUserId])

  return useMemo(() => ({
    categories,
    loading,
    saving,
    error,
    refresh,
    createCategory,
    updateCategory,
    removeCategory,
    toggleHeart,
  }), [categories, createCategory, error, loading, refresh, removeCategory, saving, toggleHeart, updateCategory])
}

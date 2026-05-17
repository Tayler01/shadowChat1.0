import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createShadowPinCategory,
  deleteShadowPinCategory,
  fetchShadowPinCategories,
  toggleShadowPinCategoryHeart,
  updateShadowPinCategory,
} from '../api/shadowPinApi'
import type { ShadowPinCategory, ShadowPinCategoryFormValues } from '../types'

export function useShadowPinCategories() {
  const [categories, setCategories] = useState<ShadowPinCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setCategories(await fetchShadowPinCategories())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ShadowPin')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createCategory = useCallback(async (values: ShadowPinCategoryFormValues) => {
    setSaving(true)
    try {
      const category = await createShadowPinCategory(values)
      await refresh()
      return category
    } finally {
      setSaving(false)
    }
  }, [refresh])

  const updateCategory = useCallback(async (
    categoryId: string,
    values: Pick<ShadowPinCategoryFormValues, 'title' | 'description'> & { file?: File | null }
  ) => {
    setSaving(true)
    try {
      const category = await updateShadowPinCategory(categoryId, values)
      await refresh()
      return category
    } finally {
      setSaving(false)
    }
  }, [refresh])

  const removeCategory = useCallback(async (categoryId: string) => {
    setSaving(true)
    try {
      await deleteShadowPinCategory(categoryId)
      await refresh()
    } finally {
      setSaving(false)
    }
  }, [refresh])

  const toggleHeart = useCallback(async (categoryId: string) => {
    let previousCategories: ShadowPinCategory[] = []
    setCategories(prev => {
      previousCategories = prev
      return prev.map(category => category.id === categoryId
        ? {
            ...category,
            viewer_has_hearted: !category.viewer_has_hearted,
            heart_count: Math.max(0, category.heart_count + (category.viewer_has_hearted ? -1 : 1)),
          }
        : category
      )
    })
    try {
      await toggleShadowPinCategoryHeart(categoryId)
    } catch (err) {
      setCategories(previousCategories)
      throw err
    }
  }, [])

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

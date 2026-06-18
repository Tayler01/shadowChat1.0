import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImagePlus, Loader2, Pin, Search, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../../components/ui/Button'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { useAuth } from '../../../hooks/useAuth'
import { cn } from '../../../lib/utils'
import { createShadowPinImage } from '../api/shadowPinApi'
import { rankShadowPinCategories } from '../categorySearch'
import { invalidateShadowPinCategoriesCache, useShadowPinCategories } from '../hooks/useShadowPinCategories'
import { invalidateShadowPinImagesCache } from '../hooks/useShadowPinImages'
import type { ShadowPinCategory } from '../types'

type ShareImageToShadowPinModalProps = {
  open: boolean
  imageUrl: string
  previewUrl?: string | null
  onClose: () => void
}

const getCategoryPreviewUrl = (category: ShadowPinCategory) =>
  category.thumbnail_url || category.medium_url || category.image_url || ''

export function ShareImageToShadowPinModal({
  open,
  imageUrl,
  previewUrl,
  onClose,
}: ShareImageToShadowPinModalProps) {
  const { user } = useAuth()
  const categoriesState = useShadowPinCategories()
  const [query, setQuery] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) return
    setQuery('')
    setSelectedCategoryId(null)
    setTitle('')
    setSaving(false)
  }, [open])

  const visibleCategories = useMemo(() => {
    if (!query.trim()) return categoriesState.categories
    return rankShadowPinCategories(query, categoriesState.categories, 12)
  }, [categoriesState.categories, query])

  const selectedCategory = categoriesState.categories.find(category => category.id === selectedCategoryId) ?? null

  const submit = async () => {
    if (!selectedCategory || !imageUrl) return
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      toast.error('Add a title first')
      return
    }

    setSaving(true)
    try {
      await createShadowPinImage(selectedCategory.id, {
        title: normalizedTitle,
        description: '',
        url: imageUrl,
      })
      invalidateShadowPinImagesCache(selectedCategory.id)
      invalidateShadowPinCategoriesCache(user?.id)
      toast.success(`Added to ${selectedCategory.title}`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add to Shado Pin')
    } finally {
      setSaving(false)
    }
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[121] flex items-end justify-center bg-[rgba(1,2,4,0.72)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add image to Shado Pin"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[min(42rem,calc(100dvh_-_1.5rem))] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(8,9,12,0.97)] shadow-[var(--shadow-panel)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-panel)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Add to Shado Pin</h2>
            <p className="text-xs text-[var(--text-muted)]">Choose a category and title.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border-panel)] bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]"
            aria-label="Close Shado Pin share"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {previewUrl && (
            <img
              src={previewUrl}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="mb-3 h-32 w-full rounded-[var(--radius-md)] border border-[rgba(255,255,255,0.1)] object-cover"
            />
          )}

          <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]" htmlFor="shadow-pin-share-title">
            Title
          </label>
          <input
            id="shadow-pin-share-title"
            value={title}
            onChange={event => setTitle(event.target.value)}
            maxLength={80}
            className="mt-1 w-full rounded-[var(--radius-md)] border border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.055)] px-3 py-2 text-base text-[var(--text-primary)] outline-none focus:border-[var(--theme-accent-readable)] md:text-sm"
            placeholder="Name this pin"
          />

          <div className="mt-3 flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.045)] px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-[var(--theme-accent-readable)]" aria-hidden="true" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              placeholder="Find category"
              type="search"
              autoComplete="off"
              aria-label="Find Shado Pin category"
            />
          </div>

          <div className="mt-3 max-h-60 overflow-y-auto rounded-[var(--radius-md)] border border-[rgba(255,255,255,0.09)]">
            {categoriesState.loading ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : categoriesState.error ? (
              <div className="p-3 text-sm text-red-200">
                {categoriesState.error}
                <Button type="button" variant="secondary" className="mt-3 w-full" onClick={categoriesState.refresh}>
                  Try again
                </Button>
              </div>
            ) : visibleCategories.length > 0 ? (
              visibleCategories.map(category => {
                const selected = selectedCategoryId === category.id
                const preview = getCategoryPreviewUrl(category)
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(category.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      selected ? 'bg-[var(--theme-accent-soft)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.055)]'
                    )}
                    aria-pressed={selected}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.06)]">
                      {preview ? (
                        <img src={preview} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
                      ) : (
                        <Pin className="h-4 w-4 text-[var(--theme-accent-readable)]" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{category.title}</span>
                  </button>
                )
              })
            ) : (
              <div className="p-3 text-sm text-[var(--text-muted)]">No categories found</div>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-[var(--border-panel)] p-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => { void submit() }}
            disabled={saving || !selectedCategory || !title.trim()}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-2 h-4 w-4" />}
            Add Pin
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

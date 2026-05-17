import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Edit3,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Pin,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'
import type { AppView } from '../../types/navigation'
import { useShadowPinCategories } from './hooks/useShadowPinCategories'
import { useShadowPinImages } from './hooks/useShadowPinImages'
import type {
  ShadowPinCategory,
  ShadowPinCategoryFormValues,
  ShadowPinImage,
  ShadowPinImageFormValues,
} from './types'

type ShadowPinProps = {
  currentView?: AppView
  onViewChange?: (view: AppView) => void
  onBack?: () => void
}

type ModalMode =
  | { type: 'create-category' }
  | { type: 'edit-category'; category: ShadowPinCategory }
  | { type: 'category-details'; category: ShadowPinCategory }
  | { type: 'add-image' }
  | { type: 'edit-image'; image: ShadowPinImage }
  | { type: 'image-viewer'; image: ShadowPinImage }
  | null

const getDisplayName = (item: { creator?: ShadowPinCategory['creator'] }) =>
  item.creator?.display_name || item.creator?.username || 'ShadowChat'

const formatCount = (count: number) => count > 999 ? `${Math.floor(count / 100) / 10}k` : String(count)

const canManage = (
  item: { creator_id?: string | null },
  userId?: string,
  adminRole?: string | null
) => Boolean(userId && (item.creator_id === userId || adminRole === 'admin' || adminRole === 'sub_admin'))

const getCategoryImageUrl = (category: ShadowPinCategory, size: 'thumb' | 'medium' | 'full' = 'thumb') => {
  if (size === 'thumb') return category.thumbnail_url || category.medium_url || category.image_url
  if (size === 'medium') return category.medium_url || category.thumbnail_url || category.image_url
  return category.image_url
}

const getPinImageUrl = (image: ShadowPinImage, size: 'thumb' | 'medium' | 'full' = 'thumb') => {
  if (size === 'thumb') return image.thumbnail_url || image.medium_url || image.image_url
  if (size === 'medium') {
    return image.image_content_type === 'image/gif'
      ? image.image_url
      : image.medium_url || image.thumbnail_url || image.image_url
  }
  return image.image_url
}

const uniqueImageSources = (...sources: Array<string | null | undefined>) =>
  sources.filter((source, index, all): source is string => Boolean(source && all.indexOf(source) === index))

const getPinImageSources = (image: ShadowPinImage, size: 'thumb' | 'medium' | 'full' = 'thumb') => {
  if (size === 'thumb') return uniqueImageSources(image.thumbnail_url, image.medium_url, image.image_url)
  if (size === 'medium') {
    return image.image_content_type === 'image/gif'
      ? uniqueImageSources(image.image_url, image.medium_url, image.thumbnail_url)
      : uniqueImageSources(image.medium_url, image.thumbnail_url, image.image_url)
  }
  return uniqueImageSources(image.image_url, image.medium_url, image.thumbnail_url)
}

const getImageAspectRatio = (item: { image_width?: number | null; image_height?: number | null }) =>
  item.image_width && item.image_height ? `${item.image_width} / ${item.image_height}` : undefined

const isProcessingMedia = (status?: string | null) => status === 'pending' || status === 'processing'

const getShadowPinMasonryColumnCount = () => {
  if (typeof window === 'undefined') return 2
  if (window.innerWidth >= 1024) return 4
  if (window.innerWidth >= 640) return 3
  return 2
}

const getMasonryHeightScore = (image: ShadowPinImage) =>
  image.image_width && image.image_height ? image.image_height / image.image_width : 1.25

const distributeMasonryColumns = (images: ShadowPinImage[], columnCount: number) => {
  const columns = Array.from({ length: Math.max(1, columnCount) }, () => [] as ShadowPinImage[])
  const heights = columns.map(() => 0)

  images.forEach(image => {
    const targetIndex = heights.reduce(
      (lowestIndex, height, index) => height < heights[lowestIndex] ? index : lowestIndex,
      0
    )

    columns[targetIndex].push(image)
    heights[targetIndex] += getMasonryHeightScore(image) + 0.08
  })

  return columns
}

function useShadowPinMasonryColumnCount() {
  const [columnCount, setColumnCount] = useState(getShadowPinMasonryColumnCount)

  useEffect(() => {
    const update = () => setColumnCount(getShadowPinMasonryColumnCount())

    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener?.('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener?.('resize', update)
    }
  }, [])

  return columnCount
}

function HeartButton({
  active,
  count,
  onClick,
  className,
  variant = 'pill',
  showCount = true,
}: {
  active?: boolean
  count: number
  onClick: () => void
  className?: string
  variant?: 'pill' | 'bare'
  showCount?: boolean
}) {
  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]',
        variant === 'pill' && 'rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(4,5,6,0.72)] px-2.5 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.22)] backdrop-blur-md',
        variant === 'bare' && 'h-9 w-9 rounded-full bg-transparent p-0 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]',
        active && (variant === 'pill' ? 'border-[rgba(244,114,182,0.55)] text-pink-200' : 'text-pink-200'),
        className
      )}
      aria-pressed={Boolean(active)}
    >
      {variant === 'bare' ? (
        <span className="relative inline-flex h-5 w-5 items-center justify-center">
          <Heart className="absolute h-5 w-5 fill-black text-black opacity-95 [stroke-width:5]" aria-hidden="true" />
          <Heart className={cn('relative h-5 w-5 stroke-[2.4]', active && 'fill-current')} />
        </span>
      ) : (
        <Heart className={cn('h-4 w-4', active && 'fill-current')} />
      )}
      {showCount && formatCount(count)}
    </button>
  )
}

function useLongPress(action: () => void) {
  const timerRef = useRef<number | null>(null)
  const firedRef = useRef(false)

  return {
    onPointerDown: () => {
      firedRef.current = false
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true
        action()
      }, 520)
    },
    onPointerUp: () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    },
    onPointerCancel: () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    },
    didLongPress: () => firedRef.current,
  }
}

function CategoryCard({
  category,
  canManageCategory,
  onOpen,
  onDetails,
  onEdit,
  onHeart,
}: {
  category: ShadowPinCategory
  canManageCategory: boolean
  onOpen: () => void
  onDetails: () => void
  onEdit: () => void
  onHeart: () => void
}) {
  const { didLongPress, ...longPressHandlers } = useLongPress(canManageCategory ? onEdit : onDetails)

  return (
    <article
      className="group overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.58)] shadow-[var(--shadow-panel)] backdrop-blur-md transition-transform active:scale-[0.99]"
      onClick={() => {
        if (!didLongPress()) onOpen()
      }}
      onContextMenu={event => event.preventDefault()}
      {...longPressHandlers}
    >
      <div className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold leading-tight text-[var(--text-primary)]">{category.title}</h3>
          <HeartButton active={category.viewer_has_hearted} count={category.heart_count} onClick={onHeart} />
        </div>
        {category.description && (
          <p className="line-clamp-2 whitespace-pre-line text-sm leading-snug text-[var(--text-secondary)]">
            {category.description}
          </p>
        )}
      </div>
      <div className="relative aspect-[4/3] overflow-hidden bg-[rgba(255,255,255,0.05)]">
        <img
          src={getCategoryImageUrl(category)}
          alt={category.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        {isProcessingMedia(category.processing_status) && (
          <div className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(4,5,6,0.78)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--theme-accent-readable)]" />
            Processing cover
          </div>
        )}
        {category.processing_status === 'failed' && (
          <div className="absolute inset-x-2 bottom-2 rounded-full border border-amber-300/30 bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-100 backdrop-blur-md">
            Using original image
          </div>
        )}
      </div>
    </article>
  )
}

function SourceInput({
  sourceMode,
  setSourceMode,
  file,
  setFile,
  url,
  setUrl,
  allowUrl = true,
}: {
  sourceMode: 'file' | 'url'
  setSourceMode: (mode: 'file' | 'url') => void
  file: File | null
  setFile: (file: File | null) => void
  url: string
  setUrl: (url: string) => void
  allowUrl?: boolean
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 rounded-[var(--radius-sm)] bg-[rgba(255,255,255,0.04)] p-1">
        <button
          type="button"
          className={cn('inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--text-secondary)]', sourceMode === 'file' && 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]')}
          onClick={() => {
            setSourceMode('file')
            setUrl('')
          }}
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
        <button
          type="button"
          disabled={!allowUrl}
          className={cn('inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm text-[var(--text-secondary)] disabled:opacity-45', sourceMode === 'url' && 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]')}
          onClick={() => {
            setSourceMode('url')
            setFile(null)
          }}
        >
          <LinkIcon className="h-4 w-4" />
          URL
        </button>
      </div>
      {sourceMode === 'file' ? (
        <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-panel)] bg-[rgba(255,255,255,0.04)] px-4 py-5 text-center text-sm text-[var(--text-secondary)]">
          <ImageIcon className="h-6 w-6 text-[var(--theme-accent-readable)]" />
          <span>{file ? file.name : 'Choose a JPEG, PNG, WebP, or GIF image'}</span>
          <span className="text-xs text-[var(--text-muted)]">15MB max</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={event => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <Input
          label="Image URL"
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder="https://example.com/image.webp"
        />
      )}
    </div>
  )
}

function CategoryFormModal({
  mode,
  category,
  saving,
  onClose,
  onSubmit,
  onDelete,
}: {
  mode: 'create' | 'edit'
  category?: ShadowPinCategory
  saving: boolean
  onClose: () => void
  onSubmit: (values: ShadowPinCategoryFormValues) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [title, setTitle] = useState(category?.title ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [sourceMode, setSourceMode] = useState<'file' | 'url'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await onSubmit({ title, description, file, url: mode === 'create' && sourceMode === 'url' ? url : '' })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save category')
    }
  }

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/68 p-3 backdrop-blur-sm sm:items-center">
      <form onSubmit={submit} className="popup-surface max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[var(--radius-lg)] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">{mode === 'create' ? 'Create Category' : 'Edit Category'}</h2>
            <p className="text-sm text-[var(--text-muted)]">{mode === 'create' ? 'Add a public visual category.' : 'Update the title, description, or cover image.'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--text-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <Input label="Title" maxLength={60} value={title} onChange={event => setTitle(event.target.value)} required />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Description</span>
            <textarea
              value={description}
              maxLength={300}
              onChange={event => setDescription(event.target.value)}
              className="obsidian-input min-h-24 w-full resize-none rounded-[var(--radius-sm)] px-3.5 py-2.5 text-sm"
            />
          </label>
          <SourceInput
            sourceMode={sourceMode}
            setSourceMode={setSourceMode}
            file={file}
            setFile={setFile}
            url={url}
            setUrl={setUrl}
            allowUrl={mode === 'create'}
          />
          {mode === 'edit' && (
            <p className="text-xs text-[var(--text-muted)]">URL cover replacement can be done by creating a new category; file replacement is available here.</p>
          )}
          {error && <p className="rounded-[var(--radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            {onDelete && (
              <Button type="button" variant="danger" onClick={onDelete} disabled={saving}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
            <div className="flex flex-1 gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" loading={saving}>{saving ? 'Processing image...' : mode === 'create' ? 'Create' : 'Save'}</Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

function ImageFormModal({
  mode,
  image,
  saving,
  onClose,
  onSubmit,
  onDelete,
}: {
  mode: 'create' | 'edit'
  image?: ShadowPinImage
  saving: boolean
  onClose: () => void
  onSubmit: (values: ShadowPinImageFormValues) => Promise<void>
  onDelete?: () => Promise<void>
}) {
  const [title, setTitle] = useState(image?.title ?? '')
  const [description, setDescription] = useState(image?.description ?? '')
  const [sourceMode, setSourceMode] = useState<'file' | 'url'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      await onSubmit({ title, description, file, url: sourceMode === 'url' ? url : '' })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save image')
    }
  }

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/68 p-3 backdrop-blur-sm sm:items-center">
      <form onSubmit={submit} className="popup-surface max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[var(--radius-lg)] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">{mode === 'create' ? 'Add Image' : 'Edit Image'}</h2>
            <p className="text-sm text-[var(--text-muted)]">{mode === 'create' ? 'Pin an image into this category.' : 'Update title and description.'}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--text-secondary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <Input label="Title" maxLength={80} value={title} onChange={event => setTitle(event.target.value)} required />
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[var(--text-secondary)]">Description</span>
            <textarea
              value={description}
              maxLength={500}
              onChange={event => setDescription(event.target.value)}
              className="obsidian-input min-h-28 w-full resize-none rounded-[var(--radius-sm)] px-3.5 py-2.5 text-sm"
            />
          </label>
          {mode === 'create' && (
            <SourceInput
              sourceMode={sourceMode}
              setSourceMode={setSourceMode}
              file={file}
              setFile={setFile}
              url={url}
              setUrl={setUrl}
            />
          )}
          {error && <p className="rounded-[var(--radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
            {onDelete && (
              <Button type="button" variant="danger" onClick={onDelete} disabled={saving}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
            <div className="flex flex-1 gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" loading={saving}>{saving ? 'Processing image...' : mode === 'create' ? 'Add' : 'Save'}</Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}

function CategoryDetailsModal({
  category,
  onClose,
  onHeart,
}: {
  category: ShadowPinCategory
  onClose: () => void
  onHeart: () => void
}) {
  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/68 p-3 backdrop-blur-sm sm:items-center">
      <div className="popup-surface max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)]">
        <img src={getCategoryImageUrl(category, 'medium')} alt={category.title} className="aspect-[4/3] w-full object-cover" />
        <div className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)]">{category.title}</h2>
              <div className="mt-2 flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Avatar src={category.creator?.avatar_url} alt={getDisplayName(category)} size="sm" />
                <span>{getDisplayName(category)}</span>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-full p-2 text-[var(--text-secondary)]">
              <X className="h-5 w-5" />
            </button>
          </div>
          {category.description && <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">{category.description}</p>}
          <HeartButton active={category.viewer_has_hearted} count={category.heart_count} onClick={onHeart} />
        </div>
      </div>
    </div>
  )
}

function ImageCard({
  image,
  canManageImage,
  overlayOpen,
  onToggleOverlay,
  onViewer,
  onEdit,
  onHeart,
}: {
  image: ShadowPinImage
  canManageImage: boolean
  overlayOpen: boolean
  onToggleOverlay: () => void
  onViewer: () => void
  onEdit: () => void
  onHeart: () => void
}) {
  const clickTimer = useRef<number | null>(null)
  const { didLongPress, ...longPressHandlers } = useLongPress(canManageImage ? onEdit : onViewer)
  const imageSources = useMemo(() => getPinImageSources(image, 'thumb'), [image])
  const [sourceIndex, setSourceIndex] = useState(0)
  const imageSrc = imageSources[sourceIndex] || image.image_url
  const aspectRatio = getImageAspectRatio(image) || '4 / 5'

  useEffect(() => {
    setSourceIndex(0)
  }, [image.id, image.thumbnail_url, image.medium_url, image.image_url])

  const handleClick = () => {
    if (didLongPress()) return
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
      onViewer()
      return
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      onToggleOverlay()
    }, 230)
  }

  return (
    <article
      className="block w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.62)] shadow-[var(--shadow-panel)]"
      onClick={handleClick}
      onContextMenu={event => event.preventDefault()}
      {...longPressHandlers}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio }}>
        <img
          src={imageSrc}
          alt={image.title}
          loading="lazy"
          decoding="async"
          onError={() => {
            setSourceIndex(index => Math.min(index + 1, imageSources.length - 1))
          }}
          className="block h-full w-full object-cover"
        />
        {isProcessingMedia(image.processing_status) && (
          <div className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(4,5,6,0.78)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--theme-accent-readable)]" />
            Processing image
          </div>
        )}
        {image.processing_status === 'failed' && (
          <div className="absolute inset-x-2 bottom-2 rounded-full border border-amber-300/30 bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-100 backdrop-blur-md">
            Using original
          </div>
        )}
        <HeartButton
          active={image.viewer_has_hearted}
          count={image.heart_count}
          onClick={onHeart}
          className="absolute right-2 top-2"
          variant="bare"
          showCount={false}
        />
        {overlayOpen && (
          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-[linear-gradient(180deg,rgba(4,5,6,0),rgba(4,5,6,0.9)_20%,rgba(4,5,6,0.96))] p-3 text-[var(--text-primary)]">
            <h3 className="text-sm font-semibold leading-tight">{image.title}</h3>
            {image.description && <p className="line-clamp-4 whitespace-pre-line text-xs leading-snug text-[var(--text-secondary)]">{image.description}</p>}
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Avatar src={image.creator?.avatar_url} alt={getDisplayName(image)} size="sm" />
              <span className="truncate">{getDisplayName(image)}</span>
            </div>
          </div>
        )}
        {overlayOpen && canManageImage && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onEdit()
            }}
            className="absolute left-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(4,5,6,0.68)] text-[var(--text-primary)] backdrop-blur-md"
            aria-label="Edit image"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        )}
      </div>
    </article>
  )
}

function ImageViewerModal({
  image,
  onClose,
  onHeart,
}: {
  image: ShadowPinImage
  onClose: () => void
  onHeart: () => void
}) {
  return (
    <div className="fixed inset-0 z-[98] flex flex-col bg-[rgba(2,3,5,0.94)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-panel)] bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]">
          <X className="h-5 w-5" />
        </button>
        <HeartButton active={image.viewer_has_hearted} count={image.heart_count} onClick={onHeart} />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-lg)] bg-black/40">
        <img src={getPinImageUrl(image, 'medium')} alt={image.title} className="h-full w-full object-contain" />
      </div>
      <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.72)] p-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{image.title}</h2>
        <div className="mt-2 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Avatar src={image.creator?.avatar_url} alt={getDisplayName(image)} size="sm" />
          <span>{getDisplayName(image)}</span>
        </div>
        {image.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-[var(--text-secondary)]">{image.description}</p>}
      </div>
    </div>
  )
}

function ShadowPinHome({
  currentView,
  onViewChange,
  onOpenCategory,
}: Required<Pick<ShadowPinProps, 'currentView' | 'onViewChange'>> & { onOpenCategory: (category: ShadowPinCategory) => void }) {
  const { user } = useAuth()
  const categoriesState = useShadowPinCategories()
  const [modal, setModal] = useState<ModalMode>(null)

  const adminRole = user?.admin_role
  const submitCreate = async (values: ShadowPinCategoryFormValues) => {
    const category = await categoriesState.createCategory(values)
    toast.success('Category created')
    onOpenCategory(category)
  }

  const submitEdit = async (category: ShadowPinCategory, values: ShadowPinCategoryFormValues) => {
    await categoriesState.updateCategory(category.id, values)
    toast.success('Category updated')
  }

  const removeCategory = async (category: ShadowPinCategory) => {
    if (!window.confirm(`Delete "${category.title}"?`)) return
    await categoriesState.removeCategory(category.id)
    setModal(null)
    toast.success('Category removed')
  }

  return (
    <div className="theme-image-surface relative flex h-full min-h-0 flex-col">
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="Shado Pin"
        logo
      />
      <button
        type="button"
        onClick={() => setModal({ type: 'create-category' })}
        className="theme-floating-action absolute right-3 top-[calc(env(safe-area-inset-top)_+_3.85rem)] z-40 inline-flex h-11 w-11 items-center justify-center rounded-full md:right-4"
        aria-label="Create category"
      >
        <Plus className="h-5 w-5" />
      </button>
      <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-16">
        {categoriesState.loading ? (
          <div className="flex h-full items-center justify-center"><LoadingSpinner /></div>
        ) : categoriesState.error ? (
          <div className="mx-auto max-w-md rounded-[var(--radius-lg)] border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {categoriesState.error}
            <Button className="mt-3 w-full" variant="secondary" onClick={categoriesState.refresh}>Try again</Button>
          </div>
        ) : categoriesState.categories.length === 0 ? (
          <div className="mx-auto max-w-md rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.58)] p-5 text-center">
            <Pin className="mx-auto mb-3 h-8 w-8 text-[var(--theme-accent-readable)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">No categories yet</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Tap + to create the first ShadowPin category.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {categoriesState.categories.map(category => {
              const manage = canManage(category, user?.id, adminRole)
              return (
                <CategoryCard
                  key={category.id}
                  category={category}
                  canManageCategory={manage}
                  onOpen={() => onOpenCategory(category)}
                  onDetails={() => setModal({ type: 'category-details', category })}
                  onEdit={() => setModal({ type: 'edit-category', category })}
                  onHeart={() => {
                    categoriesState.toggleHeart(category.id).catch(err => toast.error(err instanceof Error ? err.message : 'Heart failed'))
                  }}
                />
              )
            })}
          </div>
        )}
      </main>
      {modal?.type === 'create-category' && (
        <CategoryFormModal
          mode="create"
          saving={categoriesState.saving}
          onClose={() => setModal(null)}
          onSubmit={submitCreate}
        />
      )}
      {modal?.type === 'edit-category' && (
        <CategoryFormModal
          mode="edit"
          category={modal.category}
          saving={categoriesState.saving}
          onClose={() => setModal(null)}
          onSubmit={values => submitEdit(modal.category, values)}
          onDelete={() => removeCategory(modal.category)}
        />
      )}
      {modal?.type === 'category-details' && (
        <CategoryDetailsModal
          category={modal.category}
          onClose={() => setModal(null)}
          onHeart={() => {
            categoriesState.toggleHeart(modal.category.id).catch(err => toast.error(err instanceof Error ? err.message : 'Heart failed'))
          }}
        />
      )}
    </div>
  )
}

function ShadowPinCategoryScreen({
  currentView,
  onViewChange,
  categoryId,
  onBack,
}: {
  currentView: AppView
  onViewChange: (view: AppView) => void
  categoryId: string
  onBack: () => void
}) {
  const { user } = useAuth()
  const imagesState = useShadowPinImages(categoryId)
  const [modal, setModal] = useState<ModalMode>(null)
  const [overlayImageId, setOverlayImageId] = useState<string | null>(null)
  const adminRole = user?.admin_role

  const title = imagesState.category?.title || 'ShadowPin'

  const submitCreate = async (values: ShadowPinImageFormValues) => {
    await imagesState.createImage(values)
    toast.success('Image added')
  }

  const submitEdit = async (image: ShadowPinImage, values: ShadowPinImageFormValues) => {
    await imagesState.updateImage(image.id, values)
    toast.success('Image updated')
  }

  const removeImage = async (image: ShadowPinImage) => {
    if (!window.confirm(`Delete "${image.title}"?`)) return
    await imagesState.removeImage(image.id)
    setModal(null)
    toast.success('Image removed')
  }

  const masonryColumnCount = useShadowPinMasonryColumnCount()
  const masonryColumns = useMemo(
    () => distributeMasonryColumns(imagesState.images, masonryColumnCount),
    [imagesState.images, masonryColumnCount]
  )

  return (
    <div className="theme-image-surface relative flex h-full min-h-0 flex-col">
      <MobileAppHeader
        currentView={currentView}
        onViewChange={onViewChange}
        title="Shado Pin"
        eyebrow={title}
        onBack={onBack}
        backLabel="Back to Shado Pin"
      />
      <button
        type="button"
        onClick={() => setModal({ type: 'add-image' })}
        className="theme-floating-action absolute right-3 top-[calc(env(safe-area-inset-top)_+_3.85rem)] z-40 inline-flex h-11 w-11 items-center justify-center rounded-full md:right-4"
        aria-label="Add image"
      >
        <Plus className="h-5 w-5" />
      </button>
      <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-16">
        {imagesState.loading && imagesState.images.length === 0 ? (
          <div className="flex h-full items-center justify-center"><LoadingSpinner /></div>
        ) : imagesState.error ? (
          <div className="mx-auto max-w-md rounded-[var(--radius-lg)] border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
            {imagesState.error}
            <Button className="mt-3 w-full" variant="secondary" onClick={imagesState.refresh}>Try again</Button>
          </div>
        ) : imagesState.category === null ? (
          <div className="mx-auto max-w-md rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.58)] p-5 text-center text-[var(--text-secondary)]">
            This category is no longer available.
          </div>
        ) : imagesState.images.length === 0 ? (
          <div className="mx-auto max-w-md rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.58)] p-5 text-center">
            <ImageIcon className="mx-auto mb-3 h-8 w-8 text-[var(--theme-accent-readable)]" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">This category has no images yet.</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Tap + to add one.</p>
          </div>
        ) : (
          <>
            <div
              role="list"
              aria-label="ShadowPin image masonry grid"
              className="grid items-start gap-3"
              style={{ gridTemplateColumns: `repeat(${masonryColumnCount}, minmax(0, 1fr))` }}
            >
              {masonryColumns.map((column, columnIndex) => (
                <div key={columnIndex} className="flex min-w-0 flex-col gap-3">
                  {column.map(image => {
                    const manage = canManage(image, user?.id, adminRole)
                    return (
                      <div key={image.id} role="listitem" className="min-w-0">
                        <ImageCard
                          image={image}
                          canManageImage={manage}
                          overlayOpen={overlayImageId === image.id}
                          onToggleOverlay={() => setOverlayImageId(prev => prev === image.id ? null : image.id)}
                          onViewer={() => setModal({ type: 'image-viewer', image })}
                          onEdit={() => setModal({ type: 'edit-image', image })}
                          onHeart={() => {
                            imagesState.toggleHeart(image.id).catch(err => toast.error(err instanceof Error ? err.message : 'Heart failed'))
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
            {imagesState.hasMore && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={imagesState.loadMore} loading={imagesState.loading}>Load More</Button>
              </div>
            )}
          </>
        )}
      </main>
      {modal?.type === 'add-image' && (
        <ImageFormModal
          mode="create"
          saving={imagesState.saving}
          onClose={() => setModal(null)}
          onSubmit={submitCreate}
        />
      )}
      {modal?.type === 'edit-image' && (
        <ImageFormModal
          mode="edit"
          image={modal.image}
          saving={imagesState.saving}
          onClose={() => setModal(null)}
          onSubmit={values => submitEdit(modal.image, values)}
          onDelete={() => removeImage(modal.image)}
        />
      )}
      {modal?.type === 'image-viewer' && (
        <ImageViewerModal
          image={modal.image}
          onClose={() => setModal(null)}
          onHeart={() => {
            imagesState.toggleHeart(modal.image.id).catch(err => toast.error(err instanceof Error ? err.message : 'Heart failed'))
          }}
        />
      )}
    </div>
  )
}

export function ShadowPin({
  currentView = 'pins',
  onViewChange = () => {},
}: ShadowPinProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)

  if (activeCategoryId) {
    return (
      <ShadowPinCategoryScreen
        currentView={currentView}
        onViewChange={onViewChange}
        categoryId={activeCategoryId}
        onBack={() => setActiveCategoryId(null)}
      />
    )
  }

  return (
    <ShadowPinHome
      currentView={currentView}
      onViewChange={onViewChange}
      onOpenCategory={category => setActiveCategoryId(category.id)}
    />
  )
}

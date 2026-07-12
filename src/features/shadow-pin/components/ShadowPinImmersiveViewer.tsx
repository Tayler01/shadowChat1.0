import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  Heart,
  Info,
  Loader2,
  MessageSquare,
  Share2,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Avatar } from '../../../components/ui/Avatar'
import { UserAchievementBadges } from '../../../components/ui/UserAchievementBadges'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import { useComfortPreferences } from '../../../hooks/useComfortPreferences'
import { cn } from '../../../lib/utils'
import {
  canStartViewerSwipe,
  getViewerIndex,
  getViewerNeighbor,
  resolveViewerSwipe,
  shouldLoadMoreForViewer,
  type ViewerDirection,
} from '../immersiveViewerModel'
import type { ShadowPinImage } from '../types'

type ViewerNavigationReason = 'swipe' | 'button' | 'keyboard'

type ActiveMediaControls = {
  muted: boolean
  reducedMotion: boolean
  autoplayMedia: boolean
  onMutedChange: (muted: boolean) => void
  onZoomChange: (zoomed: boolean) => void
}

type GestureSnapshot = {
  pointerId: number
  startX: number
  startY: number
  startedAt: number
  axis: 'pending' | 'horizontal' | 'vertical'
}

type ShadowPinImmersiveViewerProps = {
  images: readonly ShadowPinImage[]
  activeImageId: string
  targetLoading?: boolean
  categoryTitle?: string
  hasMore: boolean
  loadingMore: boolean
  commentsOpen: boolean
  canManageImage: (image: ShadowPinImage) => boolean
  getPosterUrl: (image: ShadowPinImage) => string
  getSourceUrl: (image: ShadowPinImage) => string | null
  getProviderLabel: (image: ShadowPinImage) => string
  requiresExternalConsent: (image: ShadowPinImage) => boolean
  renderActiveMedia: (image: ShadowPinImage, controls: ActiveMediaControls) => ReactNode
  onActiveImageChange: (
    image: ShadowPinImage,
    meta: { direction: ViewerDirection; reason: ViewerNavigationReason }
  ) => void
  onLoadMore: () => void | Promise<void>
  onSettled: (image: ShadowPinImage) => void
  onHeart: (image: ShadowPinImage) => void
  onComments: (image: ShadowPinImage) => void
  onShare: (image: ShadowPinImage) => void
  onEdit: (image: ShadowPinImage) => void
  onClose: () => void
}

const INTERACTIVE_TARGET_SELECTOR = [
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'video',
  'iframe',
  '[role="button"]',
  '[data-viewer-no-swipe]',
].join(',')

const formatCount = (count: number) => count > 999 ? `${Math.floor(count / 100) / 10}k` : String(count)

const getDisplayName = (image: ShadowPinImage) =>
  image.creator?.display_name || image.creator?.username || 'ShadowChat member'

export function ShadowPinImmersiveViewer({
  images,
  activeImageId,
  targetLoading = false,
  categoryTitle = 'ShadowPin',
  hasMore,
  loadingMore,
  commentsOpen,
  canManageImage,
  getPosterUrl,
  getSourceUrl,
  getProviderLabel,
  requiresExternalConsent,
  renderActiveMedia,
  onActiveImageChange,
  onLoadMore,
  onSettled,
  onHeart,
  onComments,
  onShare,
  onEdit,
  onClose,
}: ShadowPinImmersiveViewerProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useDialogAccessibility({
    open: !commentsOpen,
    onClose,
    initialFocusRef: closeRef,
    restoreFocus: false,
  })
  const { isReducedMotion: reducedMotion, shouldAutoplayMedia } = useComfortPreferences()
  const activeIndex = getViewerIndex(images, activeImageId)
  const activeImage = activeIndex >= 0 ? images[activeIndex] : null
  const previousImage = getViewerNeighbor(images, activeImageId, -1)
  const nextImage = getViewerNeighbor(images, activeImageId, 1)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [muted, setMuted] = useState(true)
  const [zoomed, setZoomed] = useState(false)
  const [dragX, setDragX] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [consentedProviders, setConsentedProviders] = useState<Set<string>>(() => new Set())
  const gestureRef = useRef<GestureSnapshot | null>(null)
  const navigationTimerRef = useRef<number | null>(null)
  const openedIdsRef = useRef(new Set<string>())
  const requestedMoreRef = useRef<string | null>(null)

  const handleZoomChange = useCallback((nextZoomed: boolean) => {
    setZoomed(nextZoomed)
    if (!nextZoomed) return
    gestureRef.current = null
    setDragX(0)
  }, [])

  useEffect(() => {
    const origin = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    return () => {
      if (!origin?.isConnected) return
      window.requestAnimationFrame(() => origin.focus({ preventScroll: true }))
    }
  }, [])

  useEffect(() => {
    if (!dialogRef.current) return
    dialogRef.current.inert = commentsOpen
  }, [commentsOpen, dialogRef])

  useEffect(() => {
    const appRoot = document.getElementById('root')
    if (!appRoot) return
    const wasInert = appRoot.inert
    appRoot.inert = true
    return () => {
      appRoot.inert = wasInert
    }
  }, [])

  useEffect(() => () => {
    if (navigationTimerRef.current !== null) {
      window.clearTimeout(navigationTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setDetailsOpen(false)
    setZoomed(false)
    setDragX(0)
    setTransitioning(false)
    gestureRef.current = null
    if (!activeImage || openedIdsRef.current.has(activeImage.id)) return
    openedIdsRef.current.add(activeImage.id)
    onSettled(activeImage)
    setAnnouncement(`${activeImage.title}, Pin ${activeIndex + 1} of ${images.length}`)
  }, [activeImage, activeIndex, images.length, onSettled])

  useEffect(() => {
    if (!activeImage) return
    const posterUrls = [previousImage, nextImage]
      .filter((image): image is ShadowPinImage => Boolean(image))
      .map(getPosterUrl)
      .filter(Boolean)
    posterUrls.forEach(url => {
      const preload = new Image()
      preload.decoding = 'async'
      preload.src = url
    })
  }, [activeImage, getPosterUrl, nextImage, previousImage])

  useEffect(() => {
    const shouldLoad = shouldLoadMoreForViewer({
      activeIndex,
      itemCount: images.length,
      hasMore,
      loadingMore,
    })
    const requestKey = `${activeImage?.id ?? 'missing'}:${images.length}`
    if (!shouldLoad || requestedMoreRef.current === requestKey) return
    requestedMoreRef.current = requestKey
    void Promise.resolve(onLoadMore())
  }, [activeImage?.id, activeIndex, hasMore, images.length, loadingMore, onLoadMore])

  useEffect(() => {
    if (!commentsOpen) return
    gestureRef.current = null
    setDragX(0)
    setTransitioning(false)
  }, [commentsOpen])

  useEffect(() => {
    const pauseOnHide = () => {
      if (document.visibilityState !== 'hidden') return
      dialogRef.current?.querySelectorAll('video').forEach(video => video.pause())
      setMuted(true)
    }
    document.addEventListener('visibilitychange', pauseOnHide)
    return () => document.removeEventListener('visibilitychange', pauseOnHide)
  }, [dialogRef])

  const navigate = useCallback((direction: ViewerDirection, reason: ViewerNavigationReason) => {
    if (transitioning || commentsOpen || zoomed) return
    const neighbor = direction === -1 ? previousImage : nextImage
    if (!neighbor) {
      if (hasMore && direction === 1) {
        setAnnouncement(loadingMore ? 'Loading more Pins' : 'More Pins are available')
        if (!loadingMore) void onLoadMore()
      } else {
        setAnnouncement(direction === -1 ? 'First Pin in this category' : 'Last Pin in this category')
      }
      setDragX(0)
      return
    }

    const commit = () => {
      onActiveImageChange(neighbor, { direction, reason })
      setDragX(0)
      setTransitioning(false)
      navigationTimerRef.current = null
    }

    if (reducedMotion) {
      commit()
      return
    }

    setTransitioning(true)
    setDragX(direction === 1 ? -window.innerWidth : window.innerWidth)
    navigationTimerRef.current = window.setTimeout(commit, 190)
  }, [commentsOpen, hasMore, loadingMore, nextImage, onActiveImageChange, onLoadMore, previousImage, reducedMotion, transitioning, zoomed])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) {
      gestureRef.current = null
      setDragX(0)
      return
    }
    if (event.button !== 0 || transitioning) return
    const target = event.target instanceof Element ? event.target : null
    const interactiveTarget = Boolean(target?.closest(INTERACTIVE_TARGET_SELECTOR))
    if (!canStartViewerSwipe({
      clientX: event.clientX,
      viewportWidth: window.innerWidth,
      zoomed,
      commentsOpen,
      interactiveTarget,
    })) return

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startedAt: performance.now(),
      axis: 'pending',
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    if (gesture.axis === 'pending' && Math.hypot(deltaX, deltaY) >= 10) {
      gesture.axis = Math.abs(deltaX) > Math.abs(deltaY) * 1.2 ? 'horizontal' : 'vertical'
    }
    if (gesture.axis === 'vertical') {
      gestureRef.current = null
      setDragX(0)
      return
    }
    if (gesture.axis !== 'horizontal') return
    event.preventDefault()
    const atBoundary = (deltaX > 0 && !previousImage) || (deltaX < 0 && !nextImage)
    setDragX(atBoundary ? deltaX * 0.24 : deltaX)
  }

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return
    gestureRef.current = null
    const deltaX = event.clientX - gesture.startX
    const deltaY = event.clientY - gesture.startY
    const direction = resolveViewerSwipe({
      deltaX,
      deltaY,
      elapsedMs: performance.now() - gesture.startedAt,
      viewportWidth: window.innerWidth,
      hasPrevious: Boolean(previousImage),
      hasNext: Boolean(nextImage),
    })
    if (direction) navigate(direction, 'swipe')
    else setDragX(0)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null
    const interactive = Boolean(target?.closest('input,textarea,select,button,a,video,iframe,[contenteditable="true"],[data-viewer-no-swipe]'))
    if (!interactive && event.key === 'ArrowLeft') {
      event.preventDefault()
      navigate(-1, 'keyboard')
    } else if (!interactive && event.key === 'ArrowRight') {
      event.preventDefault()
      navigate(1, 'keyboard')
    } else if (!interactive && event.key.toLowerCase() === 'm') {
      event.preventDefault()
      setMuted(value => !value)
    } else if (!interactive && event.key === ' ') {
      const video = dialogRef.current?.querySelector('video')
      if (!video) return
      event.preventDefault()
      if (video.paused) void video.play().catch(() => undefined)
      else video.pause()
    }
  }

  const externalConsentRequired = Boolean(activeImage && requiresExternalConsent(activeImage))
  const providerKey = activeImage?.provider || 'external'
  const externalConsentGranted = consentedProviders.has(providerKey)
  const grantExternalConsent = () => {
    setConsentedProviders(current => new Set(current).add(providerKey))
    setAnnouncement(`${getProviderLabel(activeImage!)} content enabled for this viewer session`)
  }

  const mediaTransformStyle = {
    transform: `translate3d(${dragX}px, 0, 0)`,
    transition: transitioning || dragX === 0
      ? reducedMotion ? 'none' : 'transform 180ms cubic-bezier(0.22, 0.72, 0.24, 1)'
      : 'none',
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={commentsOpen ? undefined : true}
      aria-hidden={commentsOpen ? true : undefined}
      aria-labelledby="shadow-pin-theater-title"
      className="fixed inset-0 z-[105] h-[100dvh] overflow-hidden bg-[#020305] text-[var(--text-primary)]"
      data-testid="shadow-pin-theater"
      onKeyDown={handleKeyDown}
    >
      <div
        className="absolute inset-0 overflow-hidden touch-pan-y"
        onPointerDownCapture={handlePointerDown}
        onPointerMoveCapture={handlePointerMove}
        onPointerUpCapture={finishPointer}
        onPointerCancelCapture={finishPointer}
      >
        {previousImage && (
          <img
            src={getPosterUrl(previousImage)}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-45"
            style={{ transform: `translate3d(calc(-100vw + ${dragX}px), 0, 0)` }}
          />
        )}
        {nextImage && (
          <img
            src={getPosterUrl(nextImage)}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-45"
            style={{ transform: `translate3d(calc(100vw + ${dragX}px), 0, 0)` }}
          />
        )}
        <div className="absolute inset-0 flex items-center justify-center pb-36 pt-20 md:pb-28" style={mediaTransformStyle}>
          {targetLoading ? (
            <div className="flex flex-col items-center gap-3 text-white/70" role="status">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--theme-accent-readable)]" />
              <p className="text-sm font-semibold">Loading Pin…</p>
            </div>
          ) : activeImage ? (
            commentsOpen ? (
              <img
                src={getPosterUrl(activeImage)}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-contain opacity-55"
                draggable={false}
              />
            ) : externalConsentRequired && !externalConsentGranted ? (
              <div className="relative flex h-full w-full items-center justify-center overflow-hidden" data-viewer-no-swipe>
                {getPosterUrl(activeImage) && (
                  <img
                    src={getPosterUrl(activeImage)}
                    alt={activeImage.title}
                    className="absolute inset-0 h-full w-full object-contain opacity-60"
                    draggable={false}
                  />
                )}
                <div className="relative mx-5 max-w-sm rounded-[var(--radius-xl)] border border-[var(--theme-accent-border-soft)] bg-[rgba(4,5,8,0.90)] p-5 text-center shadow-[var(--shadow-panel)] backdrop-blur-xl">
                  <ShieldCheck className="mx-auto h-8 w-8 text-[var(--theme-accent-readable)]" />
                  <h2 className="mt-3 text-lg font-semibold">Load from {getProviderLabel(activeImage)}?</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    Loading this interactive media connects your browser to {getProviderLabel(activeImage)} for this Theater session.
                  </p>
                  <button
                    type="button"
                    onClick={grantExternalConsent}
                    className="mt-4 inline-flex min-h-12 items-center justify-center rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] px-5 text-sm font-semibold text-[var(--theme-accent-readable)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                  >
                    Load {getProviderLabel(activeImage)}
                  </button>
                </div>
              </div>
            ) : renderActiveMedia(activeImage, {
                muted,
              reducedMotion,
              autoplayMedia: shouldAutoplayMedia,
                onMutedChange: setMuted,
                onZoomChange: handleZoomChange,
              })
          ) : (
            <div className="mx-6 rounded-[var(--radius-xl)] border border-[var(--border-panel)] bg-[rgba(8,9,12,0.92)] p-6 text-center">
              <Info className="mx-auto h-8 w-8 text-[var(--theme-accent-readable)]" />
              <h2 className="mt-3 text-lg font-semibold">This Pin is no longer available</h2>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">It may have been removed or is not visible to your account.</p>
            </div>
          )}
        </div>
      </div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent px-3 pb-8 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="pointer-events-auto inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
          aria-label="Close ShadowPin Theater"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[0.68rem] uppercase tracking-[0.18em] text-white/65">{categoryTitle}</p>
          <h1 id="shadow-pin-theater-title" className="truncate text-sm font-semibold text-white">
            {targetLoading ? 'Loading Pin' : activeImage?.title || 'Pin unavailable'}
          </h1>
        </div>
        <div className="flex h-12 min-w-12 items-center justify-center rounded-full border border-white/12 bg-black/45 px-3 text-xs font-semibold text-white/85 backdrop-blur-md" aria-label={activeImage ? `Pin ${activeIndex + 1} of ${images.length}` : undefined}>
          {activeImage ? `${activeIndex + 1} / ${images.length}` : '—'}
        </div>
      </header>

      <button
        type="button"
        onClick={() => navigate(-1, 'button')}
        disabled={!previousImage || transitioning || zoomed}
        className="absolute left-3 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md disabled:pointer-events-none disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        aria-label="Previous Pin"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={() => navigate(1, 'button')}
        disabled={(!nextImage && !hasMore) || transitioning || zoomed}
        className="absolute right-3 top-1/2 z-20 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-md disabled:pointer-events-none disabled:opacity-25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
        aria-label={loadingMore && !nextImage ? 'Loading next Pin' : 'Next Pin'}
      >
        {loadingMore && !nextImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <ChevronRight className="h-6 w-6" />}
      </button>

      {activeImage && (
        <section className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/92 to-transparent px-3 pb-[calc(env(safe-area-inset-bottom)+0.65rem)] pt-12">
          <div className="mx-auto max-w-3xl rounded-[var(--radius-xl)] border border-white/10 bg-[rgba(5,6,8,0.72)] p-3 shadow-[var(--shadow-panel)] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <Avatar src={activeImage.creator?.avatar_thumbnail_url || activeImage.creator?.avatar_url} alt={getDisplayName(activeImage)} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-white">
                  <span className="truncate">{getDisplayName(activeImage)}</span>
                  <UserAchievementBadges user={activeImage.creator} />
                </p>
                <p className="truncate text-xs text-white/55">{categoryTitle}</p>
              </div>
              {(activeImage.media_type === 'video' || activeImage.media_type === 'external_video') && <button
                type="button"
                onClick={() => setMuted(value => !value)}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full text-white/75 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                aria-label={muted ? 'Unmute viewer media' : 'Mute viewer media'}
                aria-pressed={!muted}
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>}
            </div>

            <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-5">
              <button
                type="button"
                onClick={() => onHeart(activeImage)}
                aria-pressed={Boolean(activeImage.viewer_has_hearted)}
                aria-label={`${activeImage.viewer_has_hearted ? 'Remove heart from' : 'Heart'} ${activeImage.title}, ${activeImage.heart_count} ${activeImage.heart_count === 1 ? 'heart' : 'hearts'}`}
                className={cn(
                  'inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]',
                  activeImage.viewer_has_hearted ? 'bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]' : 'text-white/80 hover:bg-white/10'
                )}
              >
                <Heart className={cn('h-5 w-5', activeImage.viewer_has_hearted && 'fill-current')} />
                {formatCount(activeImage.heart_count)}
              </button>
              <button
                type="button"
                onClick={() => onComments(activeImage)}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full text-xs font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
                aria-label={`${activeImage.comment_count ?? 0} comments. Open comments.`}
              >
                <MessageSquare className="h-5 w-5" />
                {formatCount(activeImage.comment_count ?? 0)}
              </button>
              <button
                type="button"
                onClick={() => onShare(activeImage)}
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full text-xs font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
              >
                <Share2 className="h-5 w-5" />
                Share
              </button>
              <button
                type="button"
                onClick={() => setDetailsOpen(value => !value)}
                aria-expanded={detailsOpen}
                aria-controls="shadow-pin-theater-details"
                className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full text-xs font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]"
              >
                {detailsOpen ? <ChevronDown className="h-5 w-5" /> : <Info className="h-5 w-5" />}
                Details
              </button>
              {canManageImage(activeImage) && (
                <button
                  type="button"
                  onClick={() => onEdit(activeImage)}
                  className="col-span-4 inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full text-xs font-semibold text-white/80 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)] sm:col-span-1"
                >
                  <Edit3 className="h-5 w-5" />
                  Edit
                </button>
              )}
            </div>

            {detailsOpen && <div id="shadow-pin-theater-details" className="grid grid-rows-[1fr] opacity-100 transition-[grid-template-rows,opacity] duration-200">
              <div className="overflow-hidden">
                <div className="max-h-[32dvh] overflow-y-auto border-t border-white/10 pt-3">
                  <h2 className="text-base font-semibold text-white">{activeImage.title}</h2>
                  {activeImage.description && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-white/70">{activeImage.description}</p>}
                  {Boolean(activeImage.tags?.length) && (
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Pin tags">
                      {activeImage.tags?.map(tag => <span key={tag} className="rounded-full border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] px-2.5 py-1 text-xs text-[var(--theme-accent-readable)]">#{tag}</span>)}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
                    <time dateTime={activeImage.created_at}>{new Date(activeImage.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</time>
                    {getSourceUrl(activeImage) && (
                      <a href={getSourceUrl(activeImage) || undefined} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-white/75 hover:bg-white/10">
                        <ExternalLink className="h-4 w-4" /> Open source
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>}
          </div>
        </section>
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
    </div>,
    document.body
  )
}

import type { ShadowPinImage } from './types'

export const VIEWER_EDGE_GUARD_PX = 24
export const VIEWER_SWIPE_MIN_DISTANCE_PX = 56
export const VIEWER_SWIPE_MIN_VELOCITY = 0.48
export const VIEWER_SWIPE_AXIS_RATIO = 1.2

export type ViewerDirection = -1 | 1

const compareViewerImages = (first: ShadowPinImage, second: ShadowPinImage) => {
  const createdDifference = new Date(second.created_at).getTime() - new Date(first.created_at).getTime()
  if (createdDifference !== 0) return createdDifference
  return second.id.localeCompare(first.id)
}

export const buildViewerSequence = (
  images: readonly ShadowPinImage[],
  exactImage?: ShadowPinImage | null
) => {
  const byId = new Map<string, ShadowPinImage>()
  images.forEach(image => {
    if (!image.deleted_at) byId.set(image.id, image)
  })
  if (exactImage && !exactImage.deleted_at) {
    byId.set(exactImage.id, { ...byId.get(exactImage.id), ...exactImage })
  }
  return Array.from(byId.values()).sort(compareViewerImages)
}

export const getViewerIndex = (images: readonly ShadowPinImage[], imageId: string | null) =>
  imageId ? images.findIndex(image => image.id === imageId) : -1

export const getViewerNeighbor = (
  images: readonly ShadowPinImage[],
  imageId: string | null,
  direction: ViewerDirection
) => {
  const index = getViewerIndex(images, imageId)
  if (index < 0) return null
  return images[index + direction] ?? null
}

export const shouldLoadMoreForViewer = ({
  activeIndex,
  itemCount,
  hasMore,
  loadingMore,
}: {
  activeIndex: number
  itemCount: number
  hasMore: boolean
  loadingMore: boolean
}) => (
  hasMore &&
  !loadingMore &&
  activeIndex >= 0 &&
  activeIndex >= Math.max(0, itemCount - 3)
)

export const createShadowPinPermalink = (imageId: string, baseUrl?: string | URL) => {
  const fallbackBase = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://shadochat.online'
  const url = new URL('/', baseUrl ?? fallbackBase)
  url.searchParams.set('view', 'pins')
  url.searchParams.set('pin', imageId)
  return url.toString()
}

export const canStartViewerSwipe = ({
  clientX,
  viewportWidth,
  zoomed,
  commentsOpen,
  interactiveTarget,
}: {
  clientX: number
  viewportWidth: number
  zoomed: boolean
  commentsOpen: boolean
  interactiveTarget: boolean
}) => (
  !zoomed &&
  !commentsOpen &&
  !interactiveTarget &&
  clientX >= VIEWER_EDGE_GUARD_PX &&
  clientX <= viewportWidth - VIEWER_EDGE_GUARD_PX
)

export const resolveViewerSwipe = ({
  deltaX,
  deltaY,
  elapsedMs,
  viewportWidth,
  hasPrevious,
  hasNext,
}: {
  deltaX: number
  deltaY: number
  elapsedMs: number
  viewportWidth: number
  hasPrevious: boolean
  hasNext: boolean
}): ViewerDirection | null => {
  const horizontalDistance = Math.abs(deltaX)
  const verticalDistance = Math.abs(deltaY)
  if (horizontalDistance < 10 || horizontalDistance < verticalDistance * VIEWER_SWIPE_AXIS_RATIO) {
    return null
  }

  const velocity = horizontalDistance / Math.max(1, elapsedMs)
  const committed = horizontalDistance >= Math.max(
    VIEWER_SWIPE_MIN_DISTANCE_PX,
    viewportWidth * 0.18
  ) || (horizontalDistance >= 28 && velocity >= VIEWER_SWIPE_MIN_VELOCITY)
  if (!committed) return null

  if (deltaX < 0) return hasNext ? 1 : null
  return hasPrevious ? -1 : null
}

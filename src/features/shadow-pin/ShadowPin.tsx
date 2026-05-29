import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, MutableRefObject, PointerEvent as ReactPointerEvent, UIEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  Edit3,
  ExternalLink,
  Film,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Pin,
  Play,
  Plus,
  Share2,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { LoadingSpinner } from '../../components/ui/LoadingSpinner'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import { UserAchievementBadges } from '../../components/ui/UserAchievementBadges'
import { useAuth } from '../../hooks/useAuth'
import { cn } from '../../lib/utils'
import type { AppView } from '../../types/navigation'
import { useShadowPinCategories } from './hooks/useShadowPinCategories'
import { useShadowPinImages } from './hooks/useShadowPinImages'
import {
  useShadowPinActivityTracker,
  useShadowPinCategoryDwell,
  type ShadowPinActivityTracker,
} from './hooks/useShadowPinActivityTracker'
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

type CategoryListScrollMemory = {
  scrollTop: number
  shouldRestore: boolean
}

const getDisplayName = (item: { creator?: ShadowPinCategory['creator'] }) =>
  item.creator?.display_name || item.creator?.username || 'ShadowChat'

const formatCount = (count: number) => count > 999 ? `${Math.floor(count / 100) / 10}k` : String(count)

const canManage = (
  item: { creator_id?: string | null },
  userId?: string,
  adminRole?: string | null
) => Boolean(userId && (item.creator_id === userId || adminRole === 'admin' || adminRole === 'sub_admin'))

const HEART_BURST_PARTICLES = [
  { x: '-1.8rem', y: '-2.1rem', scale: 0.92, rotate: '-24deg', delay: '0ms' },
  { x: '-0.7rem', y: '-2.65rem', scale: 0.66, rotate: '18deg', delay: '24ms' },
  { x: '0.65rem', y: '-2.55rem', scale: 0.78, rotate: '-12deg', delay: '12ms' },
  { x: '1.75rem', y: '-1.9rem', scale: 0.96, rotate: '26deg', delay: '34ms' },
  { x: '-2.2rem', y: '-0.55rem', scale: 0.7, rotate: '12deg', delay: '46ms' },
  { x: '2.2rem', y: '-0.45rem', scale: 0.72, rotate: '-18deg', delay: '54ms' },
  { x: '-1.55rem', y: '1.25rem', scale: 0.62, rotate: '-34deg', delay: '28ms' },
  { x: '1.45rem', y: '1.2rem', scale: 0.64, rotate: '32deg', delay: '38ms' },
  { x: '0rem', y: '-3.1rem', scale: 0.58, rotate: '8deg', delay: '68ms' },
]

const getHeartBurstParticleStyle = (particle: typeof HEART_BURST_PARTICLES[number]) => ({
  '--shadow-pin-heart-x': particle.x,
  '--shadow-pin-heart-y': particle.y,
  '--shadow-pin-heart-scale': particle.scale,
  '--shadow-pin-heart-rotate': particle.rotate,
  '--shadow-pin-heart-delay': particle.delay,
}) as CSSProperties

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

const isVideoPin = (image: ShadowPinImage) => image.media_type === 'video' || image.media_type === 'external_video'
const isYoutubeVideoPin = (image: ShadowPinImage) => image.provider === 'youtube' && Boolean(image.video_embed_url)
const BUNNY_PLAYER_HOST = 'player.mediadelivery.net'
type VideoIframeMode = 'feed' | 'viewer'

const getVideoPreviewUrl = (image: ShadowPinImage) =>
  image.video_preview_url || image.video_playback_url || null

const getVideoPlaybackUrl = (image: ShadowPinImage) =>
  image.video_playback_url || image.video_preview_url || null

const parsePinterestPinId = (image: ShadowPinImage) => {
  const candidates = [
    image.provider_playback_id,
    image.provider_asset_id,
    image.video_embed_url,
    image.source_url,
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const idMatch = candidate.match(/[?&]id=(\d{6,})/i)
    if (idMatch?.[1]) return idMatch[1]
    const slugMatch = candidate.match(/--(\d{6,})(?:[/?#]|$)/)
    if (slugMatch?.[1]) return slugMatch[1]
    const pathMatch = candidate.match(/\/pin\/(\d{6,})(?:[/?#]|$)/i)
    if (pathMatch?.[1]) return pathMatch[1]
    if (/^\d{6,}$/.test(candidate)) return candidate
  }

  return ''
}

const getPinterestEmbedUrl = (image: ShadowPinImage) => {
  const pinId = parsePinterestPinId(image)
  if (!pinId) return ''
  const url = new URL('https://assets.pinterest.com/ext/embed.html')
  url.searchParams.set('id', pinId)
  url.searchParams.set('src', 'shado-pin')
  return url.toString()
}

const getYoutubeAutoplayUrl = (image: ShadowPinImage, mode: VideoIframeMode = 'feed') => {
  if (!image.video_embed_url) return ''
  try {
    const url = new URL(image.video_embed_url)
    url.searchParams.set('autoplay', '1')
    url.searchParams.set('mute', '1')
    url.searchParams.set('playsinline', '1')
    url.searchParams.set('controls', mode === 'viewer' ? '1' : '0')
    url.searchParams.set('enablejsapi', '1')
    if (typeof window !== 'undefined') {
      url.searchParams.set('origin', window.location.origin)
    }
    url.searchParams.set('rel', '0')
    if (!url.searchParams.get('playlist') && image.provider_playback_id) {
      url.searchParams.set('loop', '1')
      url.searchParams.set('playlist', image.provider_playback_id)
    }
    return url.toString()
  } catch {
    return image.video_embed_url
  }
}

const getVideoIframeUrl = (image: ShadowPinImage, mode: VideoIframeMode = 'feed') => {
  if (isYoutubeVideoPin(image)) return getYoutubeAutoplayUrl(image, mode)
  if (image.provider === 'pinterest') return getPinterestEmbedUrl(image)
  if (!image.video_embed_url || image.provider !== 'bunny_stream') return ''

  try {
    const url = new URL(image.video_embed_url)
    if (url.hostname === 'iframe.mediadelivery.net') {
      url.hostname = BUNNY_PLAYER_HOST
    }
    url.searchParams.set('autoplay', 'true')
    url.searchParams.set('muted', 'true')
    url.searchParams.set('loop', 'true')
    url.searchParams.set('preload', 'true')
    return url.toString()
  } catch {
    return image.video_embed_url
  }
}

const isIframeVideoPin = (image: ShadowPinImage) => Boolean(getVideoIframeUrl(image))

type BunnyPlayer = {
  play?: () => void
  mute?: () => void
  unmute?: () => void
}

type BunnyPlayerWindow = Window & {
  playerjs?: {
    Player?: new (iframe: HTMLIFrameElement) => BunnyPlayer
  }
}

let bunnyPlayerJsPromise: Promise<void> | null = null

const loadBunnyPlayerJs = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve()
  }

  const playerWindow = window as BunnyPlayerWindow
  if (playerWindow.playerjs?.Player) {
    return Promise.resolve()
  }

  if (!bunnyPlayerJsPromise) {
    bunnyPlayerJsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-shadow-pin-bunny-playerjs="true"]')
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('Unable to load Bunny player controls.')), { once: true })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js'
      script.async = true
      script.dataset.shadowPinBunnyPlayerjs = 'true'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Unable to load Bunny player controls.'))
      document.head.appendChild(script)
    })
  }

  return bunnyPlayerJsPromise
}

const sendYouTubePlayerCommand = (iframe: HTMLIFrameElement, command: 'mute' | 'unMute' | 'playVideo') => {
  try {
    const origin = new URL(iframe.src).origin
    iframe.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func: command,
      args: [],
    }), origin)
  } catch {
    iframe.contentWindow?.postMessage(JSON.stringify({
      event: 'command',
      func: command,
      args: [],
    }), '*')
  }
}

const syncIframeAudio = (iframe: HTMLIFrameElement | null, provider: ShadowPinImage['provider'], muted: boolean) => {
  if (!iframe) return

  if (provider === 'youtube') {
    sendYouTubePlayerCommand(iframe, muted ? 'mute' : 'unMute')
    sendYouTubePlayerCommand(iframe, 'playVideo')
    return
  }

  if (provider === 'bunny_stream') {
    void loadBunnyPlayerJs()
      .then(() => {
        const Player = (window as BunnyPlayerWindow).playerjs?.Player
        if (!Player) return
        const player = new Player(iframe)
        if (muted) player.mute?.()
        else player.unmute?.()
        player.play?.()
      })
      .catch(() => undefined)
  }
}

const getImageAspectRatio = (item: { image_width?: number | null; image_height?: number | null }) =>
  item.image_width && item.image_height ? `${item.image_width} / ${item.image_height}` : undefined

const isProcessingMedia = (status?: string | null) => status === 'pending' || status === 'processing'

type PinQuickAction = 'heart' | 'share' | 'open' | 'edit'
type PinActionSide = 'left' | 'right'
type PinColumnSide = 'left' | 'right'
type PinActionConfig = {
  id: PinQuickAction
  label: string
  x: number
  y: number
  icon: LucideIcon
}

const PIN_ACTION_LONG_PRESS_MS = 440
const PIN_ACTION_MOVE_CANCEL_PX = 14
const PIN_ACTION_SELECT_RADIUS_PX = 48
const PIN_ACTION_SAFE_MARGIN_PX = 18
const PIN_ACTION_ICON_RADIUS_PX = 28
const PIN_ACTION_ARC_RADIUS_PX = 104

const mirrorPinAction = (action: PinActionConfig): PinActionConfig => ({
  ...action,
  x: -action.x,
})

const makePinActions = (actions: PinActionConfig[], side: PinActionSide) =>
  side === 'right' ? actions : actions.map(mirrorPinAction)

const pinArcAction = (
  id: PinQuickAction,
  label: string,
  angleDeg: number,
  icon: LucideIcon,
  radius = PIN_ACTION_ARC_RADIUS_PX
): PinActionConfig => {
  const angle = angleDeg * Math.PI / 180
  return {
    id,
    label,
    x: Math.round(Math.cos(angle) * radius),
    y: Math.round(Math.sin(angle) * radius),
    icon,
  }
}

const BASE_PIN_ACTIONS_RIGHT: PinActionConfig[] = [
  pinArcAction('share', 'Share', -96, Share2),
  pinArcAction('heart', 'Heart', -60, Heart),
  pinArcAction('open', 'Open', -24, Pin),
]
const BASE_MANAGE_PIN_ACTIONS_RIGHT: PinActionConfig[] = [
  pinArcAction('share', 'Share', -102, Share2),
  pinArcAction('heart', 'Heart', -66, Heart),
  pinArcAction('open', 'Open', -30, Pin),
  pinArcAction('edit', 'Edit', 6, Edit3),
]
const PIN_ACTIONS: Record<PinActionSide, PinActionConfig[]> = {
  left: makePinActions(BASE_PIN_ACTIONS_RIGHT, 'left'),
  right: makePinActions(BASE_PIN_ACTIONS_RIGHT, 'right'),
}
const MANAGE_PIN_ACTIONS: Record<PinActionSide, PinActionConfig[]> = {
  left: makePinActions(BASE_MANAGE_PIN_ACTIONS_RIGHT, 'left'),
  right: makePinActions(BASE_MANAGE_PIN_ACTIONS_RIGHT, 'right'),
}

const getPinActions = (canManageImage: boolean, side: PinActionSide) =>
  canManageImage ? MANAGE_PIN_ACTIONS[side] : PIN_ACTIONS[side]

const getPinControlSide = (columnSide: PinColumnSide): PinActionSide => columnSide === 'left' ? 'right' : 'left'

const getPinColumnSide = (columnIndex: number, columnCount: number): PinColumnSide => {
  if (columnCount <= 1) return 'left'
  return columnIndex < columnCount / 2 ? 'left' : 'right'
}

const clampPinActionOrigin = (value: number, min: number, max: number) => {
  if (min > max) return value
  return Math.min(Math.max(value, min), max)
}

const getPinActionMenuOrigin = (clientX: number, clientY: number, actions: PinActionConfig[]) => {
  if (typeof window === 'undefined' || actions.length === 0) return { x: clientX, y: clientY }

  const minOffsetX = Math.min(...actions.map(action => action.x))
  const maxOffsetX = Math.max(...actions.map(action => action.x))
  const minOffsetY = Math.min(...actions.map(action => action.y))
  const maxOffsetY = Math.max(...actions.map(action => action.y))
  const inset = PIN_ACTION_ICON_RADIUS_PX + PIN_ACTION_SAFE_MARGIN_PX

  return {
    x: clampPinActionOrigin(clientX, inset - minOffsetX, window.innerWidth - inset - maxOffsetX),
    y: clampPinActionOrigin(clientY, inset - minOffsetY, window.innerHeight - inset - maxOffsetY),
  }
}

const getNearestPinAction = (
  deltaX: number,
  deltaY: number,
  actions: PinActionConfig[]
): PinQuickAction | null => {
  let nearestId: PinQuickAction | null = null
  let nearestDistance = Infinity

  for (const action of actions) {
    const distance = Math.hypot(deltaX - action.x, deltaY - action.y)
    if (distance < nearestDistance) {
      nearestId = action.id
      nearestDistance = distance
    }
  }

  return nearestId && (nearestDistance <= PIN_ACTION_SELECT_RADIUS_PX || deltaY < -52)
    ? nearestId
    : null
}

const getShareUrl = (image: ShadowPinImage) =>
  image.source_url || image.video_embed_url || image.video_playback_url || image.image_url || getPinImageUrl(image, 'full')

const finitePointerCoordinate = (value: number) => Number.isFinite(value) ? value : 0

const isAbortError = (error: unknown) =>
  typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError'

const copyShadowPinImageLink = async (url: string) => {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    toast.error('Pin link is not available to copy')
    return
  }

  await navigator.clipboard.writeText(url)
  toast.success('Pin link copied')
}

const shareShadowPinImage = async (image: ShadowPinImage) => {
  const url = getShareUrl(image)
  const shareData = {
    title: image.title,
    text: image.description || 'ShadowPin pin',
    url,
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share(shareData)
      return
    } catch (error) {
      if (isAbortError(error)) return
    }
  }

  try {
    await copyShadowPinImageLink(url)
  } catch {
    toast.error('Pin link could not be copied')
  }
}

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
  onClick: () => void | Promise<void>
  className?: string
  variant?: 'pill' | 'bare'
  showCount?: boolean
}) {
  const [burstKey, setBurstKey] = useState(0)
  const burstTimeoutRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (burstTimeoutRef.current) {
      window.clearTimeout(burstTimeoutRef.current)
    }
  }, [])

  const triggerBurst = () => {
    if (burstTimeoutRef.current) {
      window.clearTimeout(burstTimeoutRef.current)
    }

    setBurstKey(key => key + 1)
    burstTimeoutRef.current = window.setTimeout(() => {
      setBurstKey(0)
      burstTimeoutRef.current = null
    }, 900)
  }

  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation()
        if (!active) {
          triggerBurst()
        }
        void onClick()
      }}
      className={cn(
        'shadow-pin-heart-button relative inline-flex items-center justify-center gap-1.5 overflow-visible text-xs font-semibold text-[var(--text-primary)]',
        burstKey > 0 && 'shadow-pin-heart-button--bursting',
        variant === 'pill' && 'rounded-full border border-[rgba(255,255,255,0.14)] bg-[rgba(4,5,6,0.72)] px-2.5 py-1.5 shadow-[0_8px_20px_rgba(0,0,0,0.22)] backdrop-blur-md',
        variant === 'bare' && 'h-9 w-9 rounded-full bg-transparent p-0 drop-shadow-[0_2px_5px_rgba(0,0,0,0.9)]',
        active && (variant === 'pill' ? 'border-[#ff4d5f]/75 bg-[rgba(255,77,95,0.12)] text-[#ff4d5f]' : 'text-[#ff4d5f]'),
        className
      )}
      aria-pressed={Boolean(active)}
      aria-label={active ? 'Unlike ShadowPin item' : 'Like ShadowPin item'}
    >
      {burstKey > 0 && (
        <span key={burstKey} className="shadow-pin-heart-burst" data-testid="shadow-pin-heart-burst" aria-hidden="true">
          <span className="shadow-pin-heart-burst-ring" />
          <span className="shadow-pin-heart-burst-core">{'\u2764\uFE0F'}</span>
          {HEART_BURST_PARTICLES.map((particle, index) => (
            <span
              key={`${particle.x}-${particle.y}-${index}`}
              className="shadow-pin-heart-burst-particle"
              style={getHeartBurstParticleStyle(particle)}
            >
              {'\u2764\uFE0F'}
            </span>
          ))}
        </span>
      )}
      {variant === 'bare' ? (
        <span className="relative inline-flex h-5 w-5 items-center justify-center">
          <Heart className="absolute h-5 w-5 fill-black text-black opacity-95 [stroke-width:5]" aria-hidden="true" />
          {active ? (
            <span className="relative text-[1.05rem] leading-none" aria-hidden="true">{'\u2764\uFE0F'}</span>
          ) : (
            <Heart className="relative h-5 w-5 stroke-[2.4]" />
          )}
        </span>
      ) : (
        active ? (
          <span className="text-[0.95rem] leading-none" aria-hidden="true">{'\u2764\uFE0F'}</span>
        ) : (
          <Heart className="h-4 w-4" />
        )
      )}
      {showCount && formatCount(count)}
    </button>
  )
}

function ImageLikeCount({
  count,
  active,
  className,
}: {
  count: number
  active?: boolean
  className?: string
}) {
  if (count <= 0) return null

  return (
    <span
      className={cn(
        'shadow-pin-image-like-count inline-flex shrink-0 items-center gap-1 rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(4,5,6,0.62)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)] backdrop-blur-md',
        active && 'border-[#ff4d5f]/70 bg-[rgba(255,77,95,0.16)] text-[#ff6a7a]',
        className
      )}
      data-testid="shadow-pin-image-like-count"
      aria-label={`${formatCount(count)} hearts`}
    >
      <Heart className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      <span>{formatCount(count)}</span>
    </span>
  )
}

function ImageLikedBadge({ active }: { active?: boolean }) {
  if (!active) return null

  return (
    <span
      className="shadow-pin-image-liked-badge"
      data-testid="shadow-pin-image-liked-badge"
      aria-label="You liked this image"
    >
      <Heart className="shadow-pin-image-liked-badge-icon" aria-hidden="true" />
    </span>
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
  mediaKind = 'image',
}: {
  sourceMode: 'file' | 'url'
  setSourceMode: (mode: 'file' | 'url') => void
  file: File | null
  setFile: (file: File | null) => void
  url: string
  setUrl: (url: string) => void
  allowUrl?: boolean
  mediaKind?: 'image' | 'pin'
}) {
  const acceptsVideo = mediaKind === 'pin'
  const filePrompt = acceptsVideo
    ? 'Choose an image or short video'
    : 'Choose a JPEG, PNG, WebP, or GIF image'
  const fileLimits = acceptsVideo
    ? 'Images 15MB max. Videos 150MB and 60 seconds max.'
    : '15MB max'
  const urlLabel = acceptsVideo ? 'Image or video URL' : 'Image URL'
  const urlPlaceholder = acceptsVideo ? 'https://youtube.com/shorts/...' : 'https://example.com/image.webp'

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
          {acceptsVideo ? <Film className="h-6 w-6 text-[var(--theme-accent-readable)]" /> : <ImageIcon className="h-6 w-6 text-[var(--theme-accent-readable)]" />}
          <span>{file ? file.name : filePrompt}</span>
          <span className="text-xs text-[var(--text-muted)]">{fileLimits}</span>
          <input
            type="file"
            accept={acceptsVideo ? 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,video/x-m4v' : 'image/jpeg,image/png,image/webp,image/gif'}
            className="sr-only"
            onChange={event => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <Input
          label={urlLabel}
          value={url}
          onChange={event => setUrl(event.target.value)}
          placeholder={urlPlaceholder}
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
      await onSubmit({
        title,
        description,
        file: sourceMode === 'file' ? file : null,
        url: sourceMode === 'url' ? url : '',
      })
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
            allowUrl
          />
          {mode === 'edit' && sourceMode === 'file' && !file && (
            <p className="text-xs text-[var(--text-muted)]">Leave the image empty to keep the current cover.</p>
          )}
          {error && <p className="rounded-[var(--radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          <div className="space-y-3 border-t border-[var(--border-panel)] pt-4">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" className="w-full sm:w-auto" loading={saving}>{saving ? 'Processing image...' : mode === 'create' ? 'Create' : 'Save'}</Button>
            </div>
            {onDelete && (
              <div className="flex justify-end border-t border-[var(--border-panel)] pt-2">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={saving}
                  aria-label="Delete ShadowPin category"
                  className="inline-flex min-h-8 items-center justify-center rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium text-red-300/65 transition-colors hover:bg-red-500/10 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-300/30 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete category
                </button>
              </div>
            )}
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
      await onSubmit({
        title,
        description,
        file: sourceMode === 'file' ? file : null,
        url: sourceMode === 'url' ? url : '',
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save pin')
    }
  }

  return (
    <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/68 p-3 backdrop-blur-sm sm:items-center">
      <form onSubmit={submit} className="popup-surface max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[var(--radius-lg)] p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">{mode === 'create' ? 'Add Pin' : 'Edit Pin'}</h2>
            <p className="text-sm text-[var(--text-muted)]">{mode === 'create' ? 'Pin an image or short video into this category.' : 'Update details or replace the media.'}</p>
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
          <SourceInput
            sourceMode={sourceMode}
            setSourceMode={setSourceMode}
            file={file}
            setFile={setFile}
            url={url}
            setUrl={setUrl}
            mediaKind="pin"
          />
          {mode === 'edit' && sourceMode === 'file' && !file && (
            <p className="text-xs text-[var(--text-muted)]">Leave the media empty to keep the current image or video.</p>
          )}
          {error && <p className="rounded-[var(--radius-sm)] border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          <div className="space-y-3 border-t border-[var(--border-panel)] pt-4">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
              <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button type="submit" className="w-full sm:w-auto" loading={saving}>{saving ? 'Processing pin...' : mode === 'create' ? 'Add' : 'Save'}</Button>
            </div>
            {onDelete && (
              <div className="flex justify-end border-t border-[var(--border-panel)] pt-2">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={saving}
                  aria-label="Delete ShadowPin pin"
                  className="inline-flex min-h-8 items-center justify-center rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs font-medium text-red-300/65 transition-colors hover:bg-red-500/10 hover:text-red-200 focus:outline-none focus:ring-2 focus:ring-red-300/30 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete pin
                </button>
              </div>
            )}
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
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{getDisplayName(category)}</span>
                  <UserAchievementBadges user={category.creator} />
                </span>
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

type PinRadialState = {
  open: boolean
  originX: number
  originY: number
  selected: PinQuickAction | null
  controlSide: PinActionSide
  actions: PinActionConfig[]
}

type PinActionFeedbackState = {
  key: number
  action: PinQuickAction
}

const EMPTY_PIN_RADIAL_STATE: PinRadialState = {
  open: false,
  originX: 0,
  originY: 0,
  selected: null,
  controlSide: 'right',
  actions: PIN_ACTIONS.right,
}

function PinActionRadialMenu({
  state,
  hearted,
}: {
  state: PinRadialState
  hearted?: boolean
}) {
  if (!state.open) return null

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="shadow-pin-radial-layer" data-testid="shadow-pin-radial-layer" aria-hidden="true">
      <div
        className="shadow-pin-radial-menu"
        style={{ left: state.originX, top: state.originY }}
        data-testid="shadow-pin-radial-menu"
        data-selected-action={state.selected || ''}
        data-control-side={state.controlSide}
      >
        <span className="shadow-pin-radial-thumb-dot" />
        {state.actions.map(action => {
          const Icon = action.icon
          const selected = state.selected === action.id
          const label = action.id === 'heart' && hearted ? 'Unlike' : action.label

          return (
            <span
              key={action.id}
              className={`shadow-pin-radial-action${selected ? ' shadow-pin-radial-action--selected' : ''}`}
              style={{
                left: `${action.x}px`,
                top: `${action.y}px`,
              }}
              data-testid={`shadow-pin-radial-action-${action.id}`}
              data-action={action.id}
            >
              <Icon className={cn('h-5 w-5', action.id === 'heart' && hearted && 'fill-current')} />
              <span className="sr-only">{label}</span>
            </span>
          )
        })}
      </div>
    </div>,
    document.body
  )
}

function PinActionFeedback({ feedback }: { feedback: PinActionFeedbackState | null }) {
  if (!feedback) return null

  const Icon = feedback.action === 'share'
    ? Share2
    : feedback.action === 'open'
      ? Pin
      : feedback.action === 'edit'
        ? Edit3
        : Heart

  return (
    <span
      key={feedback.key}
      className={`shadow-pin-action-feedback shadow-pin-action-feedback--${feedback.action}`}
      data-testid="shadow-pin-action-feedback"
      data-action={feedback.action}
      aria-hidden="true"
    >
      <span className="shadow-pin-action-wash" data-testid="shadow-pin-action-wash" />
      {feedback.action === 'heart' && (
        <span className="shadow-pin-action-heart-burst" data-testid="shadow-pin-action-heart-burst">
          <span className="shadow-pin-action-heart-core">{'\u2764\uFE0F'}</span>
          {HEART_BURST_PARTICLES.slice(0, 6).map((particle, index) => (
            <span
              key={`${particle.x}-${particle.y}-${index}`}
              className="shadow-pin-action-heart-particle"
              style={getHeartBurstParticleStyle(particle)}
            >
              {'\u2764\uFE0F'}
            </span>
          ))}
        </span>
      )}
      <span className="shadow-pin-action-confirm">
        <Icon className={cn('h-5 w-5', feedback.action === 'heart' && 'fill-current')} />
      </span>
    </span>
  )
}

function ImageCard({
  image,
  canManageImage,
  columnSide,
  activeVideoId,
  soundEnabled,
  overlayOpen,
  onToggleOverlay,
  onVideoFocus,
  onVideoBlur,
  onToggleSound,
  onViewer,
  onEdit,
  onHeart,
  onShare,
  onVisible,
}: {
  image: ShadowPinImage
  canManageImage: boolean
  columnSide: PinColumnSide
  activeVideoId: string | null
  soundEnabled: boolean
  overlayOpen: boolean
  onToggleOverlay: () => void
  onVideoFocus: () => void
  onVideoBlur: () => void
  onToggleSound: () => void
  onViewer: () => void
  onEdit: () => void
  onHeart: () => void
  onShare: () => void
  onVisible: () => void
}) {
  const cardRef = useRef<HTMLElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const clickTimer = useRef<number | null>(null)
  const pressRef = useRef<{
    timerId: number | null
    pointerId: number
    startClientX: number
    startClientY: number
    menuOriginX: number
    menuOriginY: number
    actions: PinActionConfig[]
    active: boolean
  } | null>(null)
  const unlockGestureScrollRef = useRef<(() => void) | null>(null)
  const pressConsumedRef = useRef(false)
  const pressConsumedTimerRef = useRef<number | null>(null)
  const feedbackKeyRef = useRef(0)
  const feedbackTimerRef = useRef<number | null>(null)
  const imageSources = useMemo(() => getPinImageSources(image, 'thumb'), [image])
  const [sourceIndex, setSourceIndex] = useState(0)
  const [radialState, setRadialState] = useState<PinRadialState>(EMPTY_PIN_RADIAL_STATE)
  const [feedback, setFeedback] = useState<PinActionFeedbackState | null>(null)
  const imageSrc = imageSources[sourceIndex] || image.image_url
  const aspectRatio = getImageAspectRatio(image) || '4 / 5'
  const controlSide = getPinControlSide(columnSide)
  const videoPin = isVideoPin(image)
  const activeVideo = activeVideoId === image.id && image.processing_status !== 'failed'
  const nativeVideoSrc = getVideoPreviewUrl(image)
  const shouldRenderNativeVideo = videoPin && activeVideo && Boolean(nativeVideoSrc)
  const iframeVideoSrc = videoPin && activeVideo ? getVideoIframeUrl(image) : ''
  const shouldRenderIframeVideo = videoPin && activeVideo && !nativeVideoSrc && Boolean(iframeVideoSrc)

  useEffect(() => {
    setSourceIndex(0)
  }, [image.id, image.thumbnail_url, image.medium_url, image.image_url])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!shouldRenderNativeVideo) {
      video.pause()
      return
    }

    video.muted = !soundEnabled
    const play = async () => {
      try {
        await video.play()
      } catch {
        // Mobile browsers may still require a user gesture for some media paths.
      }
    }
    void play()
  }, [shouldRenderNativeVideo, soundEnabled, nativeVideoSrc])

  useEffect(() => {
    if (!shouldRenderIframeVideo) return
    syncIframeAudio(iframeRef.current, image.provider, !soundEnabled)
  }, [image.provider, shouldRenderIframeVideo, soundEnabled, iframeVideoSrc])

  useEffect(() => () => {
    if (clickTimer.current) window.clearTimeout(clickTimer.current)
    if (pressRef.current?.timerId) window.clearTimeout(pressRef.current.timerId)
    if (pressConsumedTimerRef.current) window.clearTimeout(pressConsumedTimerRef.current)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    unlockGestureScrollRef.current?.()
    unlockGestureScrollRef.current = null
  }, [])

  useEffect(() => {
    const node = cardRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    let visibleTimer: number | null = null
    const clearVisibleTimer = () => {
      if (visibleTimer) {
        window.clearTimeout(visibleTimer)
        visibleTimer = null
      }
    }

    const observer = new IntersectionObserver(entries => {
      const entry = entries[0]
      if (entry?.isIntersecting) {
        clearVisibleTimer()
        visibleTimer = window.setTimeout(() => {
          visibleTimer = null
          onVisible()
        }, 1000)
        return
      }

      clearVisibleTimer()
    }, { threshold: 0.12 })

    observer.observe(node)

    return () => {
      clearVisibleTimer()
      observer.disconnect()
    }
  }, [image.id, onVisible])

  useEffect(() => {
    if (!videoPin) return
    const node = cardRef.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(entries => {
      const entry = entries[0]
      if (!entry) return

      if (entry.isIntersecting && entry.intersectionRatio >= 0.62) {
        onVideoFocus()
        return
      }

      if (!entry.isIntersecting || entry.intersectionRatio < 0.25) {
        onVideoBlur()
      }
    }, { threshold: [0, 0.25, 0.62, 0.85] })

    observer.observe(node)
    return () => observer.disconnect()
  }, [image.id, onVideoBlur, onVideoFocus, videoPin])

  const unlockGestureScroll = () => {
    unlockGestureScrollRef.current?.()
    unlockGestureScrollRef.current = null
  }

  const lockGestureScroll = () => {
    if (typeof document === 'undefined' || unlockGestureScrollRef.current) return

    const root = document.documentElement
    const body = document.body
    const previousRootOverflow = root.style.overflow
    const previousRootTouchAction = root.style.touchAction
    const previousRootOverscrollBehavior = root.style.overscrollBehavior
    const previousBodyOverflow = body.style.overflow
    const previousBodyTouchAction = body.style.touchAction
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior

    root.style.overflow = 'hidden'
    root.style.touchAction = 'none'
    root.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
    body.style.overscrollBehavior = 'none'

    const handleTouchMove = (event: TouchEvent) => {
      event.preventDefault()
    }

    const handlePointerMove = (event: PointerEvent) => {
      const press = pressRef.current
      if (!press?.active) return

      event.preventDefault()
      event.stopPropagation()
      const selected = getNearestPinAction(
        finitePointerCoordinate(event.clientX) - press.menuOriginX,
        finitePointerCoordinate(event.clientY) - press.menuOriginY,
        press.actions
      )
      setRadialState(state => state.open ? { ...state, selected } : state)
    }

    const listenerOptions: AddEventListenerOptions = { passive: false, capture: true }
    const removeOptions: EventListenerOptions = { capture: true }
    document.addEventListener('touchmove', handleTouchMove, listenerOptions)
    document.addEventListener('pointermove', handlePointerMove, listenerOptions)

    unlockGestureScrollRef.current = () => {
      document.removeEventListener('touchmove', handleTouchMove, removeOptions)
      document.removeEventListener('pointermove', handlePointerMove, removeOptions)
      root.style.overflow = previousRootOverflow
      root.style.touchAction = previousRootTouchAction
      root.style.overscrollBehavior = previousRootOverscrollBehavior
      body.style.overflow = previousBodyOverflow
      body.style.touchAction = previousBodyTouchAction
      body.style.overscrollBehavior = previousBodyOverscrollBehavior
    }
  }

  const resetPressConsumed = () => {
    pressConsumedRef.current = false
    if (pressConsumedTimerRef.current) {
      window.clearTimeout(pressConsumedTimerRef.current)
      pressConsumedTimerRef.current = null
    }
  }

  const markPressConsumed = () => {
    pressConsumedRef.current = true
    if (pressConsumedTimerRef.current) window.clearTimeout(pressConsumedTimerRef.current)
    pressConsumedTimerRef.current = window.setTimeout(() => {
      pressConsumedRef.current = false
      pressConsumedTimerRef.current = null
    }, 420)
  }

  const clearPressTimer = () => {
    if (pressRef.current?.timerId) {
      window.clearTimeout(pressRef.current.timerId)
      pressRef.current.timerId = null
    }
  }

  const clearPress = () => {
    clearPressTimer()
    pressRef.current = null
  }

  const releasePointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.currentTarget
    const pointerId = event.pointerId
    if (typeof target.hasPointerCapture === 'function' && target.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId)
    }
  }

  const showFeedback = (action: PinQuickAction) => {
    feedbackKeyRef.current += 1
    setFeedback({ action, key: feedbackKeyRef.current })
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null)
      feedbackTimerRef.current = null
    }, 1180)
  }

  const runQuickAction = async (action: PinQuickAction) => {
    showFeedback(action)

    if (action === 'heart') {
      onHeart()
      return
    }

    if (action === 'share') {
      onShare()
      await shareShadowPinImage(image)
      return
    }

    if (action === 'edit') {
      window.setTimeout(onEdit, 90)
      return
    }

    window.setTimeout(onViewer, 90)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.isPrimary === false) return
    if (typeof event.button === 'number' && event.button !== 0) return

    const target = event.target
    if (target instanceof Element && target.closest('button, a, input, textarea, select, [role="button"]')) {
      return
    }

    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current)
      clickTimer.current = null
    }

    const pointerId = event.pointerId
    const startClientX = finitePointerCoordinate(event.clientX)
    const startClientY = finitePointerCoordinate(event.clientY)
    const actions = getPinActions(canManageImage, controlSide)
    const menuOrigin = getPinActionMenuOrigin(startClientX, startClientY, actions)
    const originX = menuOrigin.x
    const originY = menuOrigin.y
    const captureTarget = event.currentTarget

    clearPress()
    pressRef.current = {
      timerId: window.setTimeout(() => {
        if (!pressRef.current || pressRef.current.pointerId !== pointerId) return

        pressRef.current.active = true
        markPressConsumed()
        lockGestureScroll()

        if (typeof captureTarget.setPointerCapture === 'function') {
          try {
            captureTarget.setPointerCapture(pointerId)
          } catch {
            // Some test/mobile browser paths can reject capture if the pointer has already ended.
          }
        }

        setRadialState({
          open: true,
          originX,
          originY,
          selected: null,
          controlSide,
          actions,
        })
      }, PIN_ACTION_LONG_PRESS_MS),
      pointerId,
      startClientX,
      startClientY,
      menuOriginX: originX,
      menuOriginY: originY,
      actions,
      active: false,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return

    const clientX = finitePointerCoordinate(event.clientX)
    const clientY = finitePointerCoordinate(event.clientY)
    const moveDeltaX = clientX - press.startClientX
    const moveDeltaY = clientY - press.startClientY

    if (!press.active) {
      if (Math.hypot(moveDeltaX, moveDeltaY) > PIN_ACTION_MOVE_CANCEL_PX) {
        clearPress()
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const selected = getNearestPinAction(clientX - press.menuOriginX, clientY - press.menuOriginY, press.actions)
    setRadialState(state => state.open ? { ...state, selected } : state)
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const press = pressRef.current
    if (!press || press.pointerId !== event.pointerId) return

    const wasActive = press.active
    const selected = wasActive
      ? getNearestPinAction(
        finitePointerCoordinate(event.clientX) - press.menuOriginX,
        finitePointerCoordinate(event.clientY) - press.menuOriginY,
        press.actions
      ) || radialState.selected
      : null

    clearPress()
    releasePointerCapture(event)

    if (!wasActive) return

    event.preventDefault()
    event.stopPropagation()
    setRadialState(EMPTY_PIN_RADIAL_STATE)
    unlockGestureScroll()

    if (selected) {
      void runQuickAction(selected)
    }
  }

  const handlePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    clearPress()
    releasePointerCapture(event)
    setRadialState(EMPTY_PIN_RADIAL_STATE)
    unlockGestureScroll()
  }

  const handleClick = () => {
    if (pressConsumedRef.current) {
      resetPressConsumed()
      return
    }

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
      ref={cardRef}
      className={[
        'shadow-pin-action-card block w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.62)] shadow-[var(--shadow-panel)]',
        radialState.open ? 'shadow-pin-action-card--active' : '',
        radialState.open && columnSide === 'left' ? 'shadow-pin-action-card--active-left' : '',
        radialState.open && columnSide === 'right' ? 'shadow-pin-action-card--active-right' : '',
      ].filter(Boolean).join(' ')}
      data-column-side={columnSide}
      onClick={handleClick}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div className="relative overflow-hidden" style={{ aspectRatio }}>
        {shouldRenderIframeVideo ? (
          <iframe
            ref={iframeRef}
            src={iframeVideoSrc}
            title={image.title}
            className="pointer-events-none block h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : shouldRenderNativeVideo && nativeVideoSrc ? (
          <video
            ref={videoRef}
            src={nativeVideoSrc}
            poster={imageSrc}
            muted={!soundEnabled}
            loop
            playsInline
            preload="metadata"
            draggable={false}
            onContextMenu={event => event.preventDefault()}
            className="block h-full w-full object-cover"
          />
        ) : (
          <img
            src={imageSrc}
            alt={image.title}
            loading="lazy"
            decoding="async"
            draggable={false}
            onContextMenu={event => event.preventDefault()}
            onDragStart={event => event.preventDefault()}
            onError={() => {
              setSourceIndex(index => Math.min(index + 1, imageSources.length - 1))
            }}
            className="block h-full w-full object-cover"
          />
        )}
        {videoPin && overlayOpen && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(4,5,6,0.68)] px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[var(--text-primary)] backdrop-blur-md">
            <Play className="h-3 w-3 fill-current" aria-hidden="true" />
            Video
          </span>
        )}
        <ImageLikedBadge active={image.viewer_has_hearted} />
        <PinActionFeedback feedback={feedback} />
        <PinActionRadialMenu state={radialState} hearted={image.viewer_has_hearted} />
        {isProcessingMedia(image.processing_status) && (
          <div className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-2 rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(4,5,6,0.78)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] backdrop-blur-md">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--theme-accent-readable)]" />
            Processing {videoPin ? 'video' : 'image'}
          </div>
        )}
        {image.processing_status === 'failed' && (
          <div className="absolute inset-x-2 bottom-2 rounded-full border border-amber-300/30 bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-100 backdrop-blur-md">
            {videoPin ? 'Video processing failed' : 'Using original'}
          </div>
        )}
        {overlayOpen && (
          <div className="absolute inset-x-0 bottom-0 space-y-2 bg-[linear-gradient(180deg,rgba(4,5,6,0),rgba(4,5,6,0.9)_20%,rgba(4,5,6,0.96))] p-3 text-[var(--text-primary)]">
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 text-sm font-semibold leading-tight">{image.title}</h3>
              <div className="flex shrink-0 items-center gap-1.5">
                {videoPin && (nativeVideoSrc || isIframeVideoPin(image)) && (
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation()
                      onToggleSound()
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[rgba(4,5,6,0.62)] text-[var(--text-primary)] backdrop-blur-md"
                    aria-pressed={soundEnabled}
                    aria-label={soundEnabled ? 'Mute video' : 'Unmute video'}
                  >
                    {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  </button>
                )}
                <ImageLikeCount count={image.heart_count} active={image.viewer_has_hearted} />
              </div>
            </div>
            {image.description && <p className="line-clamp-4 whitespace-pre-line text-xs leading-snug text-[var(--text-secondary)]">{image.description}</p>}
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Avatar src={image.creator?.avatar_url} alt={getDisplayName(image)} size="sm" />
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <span className="truncate">{getDisplayName(image)}</span>
                <UserAchievementBadges user={image.creator} />
              </span>
            </div>
          </div>
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
  const [muted, setMuted] = useState(true)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const videoPin = isVideoPin(image)
  const nativeVideoSrc = getVideoPlaybackUrl(image)
  const iframeSrc = getVideoIframeUrl(image, 'viewer')
  const sourceUrl = image.source_url || image.video_embed_url

  useEffect(() => {
    if (!iframeSrc) return
    syncIframeAudio(iframeRef.current, image.provider, muted)
  }, [iframeSrc, image.provider, muted])

  return (
    <div className="fixed inset-0 z-[98] flex flex-col bg-[rgba(2,3,5,0.94)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-sm">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-panel)] bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]">
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {videoPin && (nativeVideoSrc || iframeSrc) && (
            <button
              type="button"
              onClick={() => setMuted(value => !value)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-panel)] bg-[rgba(255,255,255,0.06)] text-[var(--text-primary)]"
              aria-pressed={!muted}
              aria-label={muted ? 'Unmute video' : 'Mute video'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
          )}
          <HeartButton active={image.viewer_has_hearted} count={image.heart_count} onClick={onHeart} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[var(--radius-lg)] bg-black/40">
        {videoPin && iframeSrc ? (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title={image.title}
            className="block h-full w-full border-0"
            allow="autoplay; encrypted-media; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : videoPin && nativeVideoSrc ? (
          <video
            src={nativeVideoSrc}
            poster={getPinImageUrl(image, 'medium')}
            className="h-full w-full object-contain"
            controls
            autoPlay
            loop
            playsInline
            muted={muted}
          />
        ) : videoPin ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
            <img src={getPinImageUrl(image, 'medium')} alt={image.title} className="max-h-[58vh] max-w-full rounded-[var(--radius-lg)] object-contain" />
            {sourceUrl && (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border-panel)] bg-[rgba(255,255,255,0.06)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)]"
              >
                <ExternalLink className="h-4 w-4" />
                Open source video
              </a>
            )}
          </div>
        ) : (
          <img src={getPinImageUrl(image, 'medium')} alt={image.title} className="h-full w-full object-contain" />
        )}
      </div>
      <div className="mt-3 rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[rgba(5,6,8,0.72)] p-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{image.title}</h2>
        <div className="mt-2 flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Avatar src={image.creator?.avatar_url} alt={getDisplayName(image)} size="sm" />
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className="truncate">{getDisplayName(image)}</span>
            <UserAchievementBadges user={image.creator} />
          </span>
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
  categoryListScrollMemory,
  tracker,
}: Required<Pick<ShadowPinProps, 'currentView' | 'onViewChange'>> & {
  onOpenCategory: (category: ShadowPinCategory) => void
  categoryListScrollMemory: MutableRefObject<CategoryListScrollMemory>
  tracker: ShadowPinActivityTracker
}) {
  const { user } = useAuth()
  const categoriesState = useShadowPinCategories()
  const [modal, setModal] = useState<ModalMode>(null)
  const categoryScrollRef = useRef<HTMLElement | null>(null)

  const adminRole = user?.admin_role
  const detailsCategory = modal?.type === 'category-details'
    ? categoriesState.categories.find(category => category.id === modal.category.id) ?? modal.category
    : null
  const submitCreate = async (values: ShadowPinCategoryFormValues) => {
    const category = await categoriesState.createCategory(values)
    tracker.recordCategoryMutation(category, 'category_created')
    toast.success('Category created')
    openCategory(category)
  }

  const submitEdit = async (category: ShadowPinCategory, values: ShadowPinCategoryFormValues) => {
    const updatedCategory = await categoriesState.updateCategory(category.id, values)
    tracker.recordCategoryMutation(updatedCategory, 'category_edited')
    toast.success('Category updated')
  }

  const removeCategory = async (category: ShadowPinCategory) => {
    if (!window.confirm(`Delete "${category.title}"?`)) return
    const removedCategory = await categoriesState.removeCategory(category.id)
    tracker.recordCategoryMutation(removedCategory ?? category, 'category_deleted')
    setModal(null)
    toast.success('Category removed')
  }

  const toggleCategoryHeart = (category: ShadowPinCategory) => {
    const added = !category.viewer_has_hearted
    categoriesState.toggleHeart(category.id)
      .then(() => tracker.recordCategoryHeart(category, added))
      .catch(err => toast.error(err instanceof Error ? err.message : 'Heart failed'))
  }

  const rememberCategoryScroll = (scrollTop?: number) => {
    categoryListScrollMemory.current.scrollTop = Math.max(0, scrollTop ?? categoryScrollRef.current?.scrollTop ?? 0)
  }

  const handleCategoryScroll = (event: UIEvent<HTMLElement>) => {
    rememberCategoryScroll(event.currentTarget.scrollTop)
  }

  const openCategory = (category: ShadowPinCategory) => {
    rememberCategoryScroll()
    categoryListScrollMemory.current.shouldRestore = true
    onOpenCategory(category)
  }

  useEffect(() => {
    if (categoriesState.loading || !categoryListScrollMemory.current.shouldRestore) return

    const scrollNode = categoryScrollRef.current
    if (!scrollNode) return

    const targetScrollTop = categoryListScrollMemory.current.scrollTop
    const frameId = window.requestAnimationFrame(() => {
      scrollNode.scrollTop = targetScrollTop
      categoryListScrollMemory.current.shouldRestore = false
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [categoriesState.categories.length, categoriesState.loading, categoryListScrollMemory])

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
      <main
        ref={categoryScrollRef}
        onScroll={handleCategoryScroll}
        className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)_+_5.4rem)] pt-16 md:pb-6"
      >
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
                  onOpen={() => openCategory(category)}
                  onDetails={() => setModal({ type: 'category-details', category })}
                  onEdit={() => setModal({ type: 'edit-category', category })}
                  onHeart={() => toggleCategoryHeart(category)}
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
      {detailsCategory && (
        <CategoryDetailsModal
          category={detailsCategory}
          onClose={() => setModal(null)}
          onHeart={() => toggleCategoryHeart(detailsCategory)}
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
  tracker,
}: {
  currentView: AppView
  onViewChange: (view: AppView) => void
  categoryId: string
  onBack: () => void
  tracker: ShadowPinActivityTracker
}) {
  const { user } = useAuth()
  const imagesState = useShadowPinImages(categoryId)
  const [modal, setModal] = useState<ModalMode>(null)
  const [overlayImageId, setOverlayImageId] = useState<string | null>(null)
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null)
  const [soundVideoId, setSoundVideoId] = useState<string | null>(null)
  const adminRole = user?.admin_role

  const title = imagesState.category?.title || 'ShadowPin'
  useShadowPinCategoryDwell(imagesState.category, tracker)

  const submitCreate = async (values: ShadowPinImageFormValues) => {
    const image = await imagesState.createImage(values)
    tracker.recordPinMutation(image, 'pin_created', imagesState.category)
    toast.success('Pin added')
  }

  const submitEdit = async (image: ShadowPinImage, values: ShadowPinImageFormValues) => {
    const updatedImage = await imagesState.updateImage(image.id, values)
    tracker.recordPinMutation(updatedImage, 'pin_edited', imagesState.category)
    toast.success('Pin updated')
  }

  const removeImage = async (image: ShadowPinImage) => {
    if (!window.confirm(`Delete "${image.title}"?`)) return
    const removedImage = await imagesState.removeImage(image.id)
    tracker.recordPinMutation(removedImage ?? image, 'pin_deleted', imagesState.category)
    setModal(null)
    toast.success('Pin removed')
  }

  const toggleImageHeart = (image: ShadowPinImage) => {
    const added = !image.viewer_has_hearted
    imagesState.toggleHeart(image.id)
      .then(() => tracker.recordPinHeart(image, added, imagesState.category))
      .catch(err => toast.error(err instanceof Error ? err.message : 'Heart failed'))
  }

  const openImageViewer = (image: ShadowPinImage) => {
    tracker.recordPinOpened(image, imagesState.category)
    setModal({ type: 'image-viewer', image })
  }

  const focusVideo = (imageId: string) => {
    setActiveVideoId(imageId)
  }

  const blurVideo = (imageId: string) => {
    setActiveVideoId(current => current === imageId ? null : current)
    setSoundVideoId(current => current === imageId ? null : current)
  }

  const masonryColumnCount = useShadowPinMasonryColumnCount()
  const masonryColumns = useMemo(
    () => distributeMasonryColumns(imagesState.images, masonryColumnCount),
    [imagesState.images, masonryColumnCount]
  )
  const viewerImage = modal?.type === 'image-viewer'
    ? imagesState.images.find(image => image.id === modal.image.id) ?? modal.image
    : null

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
        aria-label="Add pin"
      >
        <Plus className="h-5 w-5" />
      </button>
      <main className="min-h-0 flex-1 overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)_+_5.4rem)] pt-16 md:pb-6">
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
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">This category has no pins yet.</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Tap + to add an image or short video.</p>
          </div>
        ) : (
          <>
            <div
              role="list"
              aria-label="ShadowPin pin masonry grid"
              className="grid items-start gap-3"
              style={{ gridTemplateColumns: `repeat(${masonryColumnCount}, minmax(0, 1fr))` }}
            >
              {masonryColumns.map((column, columnIndex) => (
                <div key={columnIndex} className="flex min-w-0 flex-col gap-3">
                  {column.map(image => {
                    const manage = canManage(image, user?.id, adminRole)
                    const columnSide = getPinColumnSide(columnIndex, masonryColumnCount)
                    return (
                      <div key={image.id} role="listitem" className="min-w-0">
                        <ImageCard
                          image={image}
                          canManageImage={manage}
                          columnSide={columnSide}
                          activeVideoId={activeVideoId}
                          soundEnabled={soundVideoId === image.id}
                          overlayOpen={overlayImageId === image.id}
                          onToggleOverlay={() => setOverlayImageId(prev => prev === image.id ? null : image.id)}
                          onVideoFocus={() => focusVideo(image.id)}
                          onVideoBlur={() => blurVideo(image.id)}
                          onToggleSound={() => {
                            setActiveVideoId(image.id)
                            setSoundVideoId(prev => prev === image.id ? null : image.id)
                          }}
                          onViewer={() => openImageViewer(image)}
                          onEdit={() => setModal({ type: 'edit-image', image })}
                          onHeart={() => toggleImageHeart(image)}
                          onShare={() => tracker.recordShareTapped(image, imagesState.category)}
                          onVisible={() => tracker.recordPinViewed(image, imagesState.category)}
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
      {viewerImage && (
        <ImageViewerModal
          image={viewerImage}
          onClose={() => setModal(null)}
          onHeart={() => toggleImageHeart(viewerImage)}
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
  const categoryListScrollMemory = useRef<CategoryListScrollMemory>({
    scrollTop: 0,
    shouldRestore: false,
  })
  const tracker = useShadowPinActivityTracker()

  if (activeCategoryId) {
    return (
      <ShadowPinCategoryScreen
        currentView={currentView}
        onViewChange={onViewChange}
        categoryId={activeCategoryId}
        onBack={() => setActiveCategoryId(null)}
        tracker={tracker}
      />
    )
  }

  return (
    <ShadowPinHome
      currentView={currentView}
      onViewChange={onViewChange}
      onOpenCategory={category => setActiveCategoryId(category.id)}
      categoryListScrollMemory={categoryListScrollMemory}
      tracker={tracker}
    />
  )
}

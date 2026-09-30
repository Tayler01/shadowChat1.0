import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Copy, Edit3, Flag, Loader2, MessageSquare, Paperclip, Plus, Reply, Send, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { EmojiClickData } from '../../../types'
import { ChatMessageActionsMenu, type ChatMessageAction } from '../../../components/chat/ChatMessageActionsMenu'
import { EmojiPickerOverlay } from '../../../components/chat/EmojiPickerOverlay'
import { MessageReactions } from '../../../components/chat/MessageReactions'
import { QuickReactionRail } from '../../../components/chat/QuickReactionRail'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { useAdminAccess } from '../../../hooks/useAdminAccess'
import { useAuth } from '../../../hooks/useAuth'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import {
  createShadowPinComment,
  fetchShadowPinDiscussionWindow,
  fetchShadowPinNewerComments,
  fetchShadowPinCommentById,
  refreshShadowPinCommentRows,
  markShadowPinCommentsRead,
  uploadShadowPinCommentAttachment,
  cleanupShadowPinCommentAttachment,
  cleanupPersistedShadowPinCommentAttachment,
  resolveShadowPinCommentAttachments,
  deleteShadowPinComment,
  fetchShadowPinComments,
  toggleShadowPinCommentReaction,
  updateShadowPinComment,
} from '../api/shadowPinApi'
import type { ShadowPinCommentCursor } from '../api/shadowPinApi'
import type { ShadowPinComment, ShadowPinCommentAttachment, ShadowPinImage } from '../types'
import { useModerationReport } from '../../moderation/useModerationReport'
import { MEMBER_REPORTING_FEATURE_ENABLED } from '../../../config/featureFlags'

import { useUnreadScroll } from '../../../hooks/useUnreadScroll'
import { beginChatTiming, measureChatInputFrame } from '../../../lib/chatPerformance'
import { useStagedAttachments } from '../../../hooks/useStagedAttachments'
import { useComposerKeyboardDismiss } from '../../../hooks/useComposerKeyboardDismiss'
import { StagedAttachmentList } from '../../../components/chat/StagedAttachmentList'
import { clipboardHasNoReadableContent, extractComposerFiles, hasClipboardFileIntent } from '../../../lib/composerAttachments'
import { getWorkingClient } from '../../../lib/supabase'
import { getUploadErrorMessage, UploadValidationError } from '../../../lib/uploadLimits'
import { compareMessageKey, type UserReadCursor } from '../../../lib/readCursors'
import { createRealtimeSubscriptionManager } from '../../../lib/realtimeSubscription'
import { captureMessageScrollAnchor, getSavedMessageScrollAnchor, restoreMessageScrollAnchor, saveMessageScrollAnchor } from '../../../lib/messageScrollAnchor'

const commentId = (comment: ShadowPinComment) => comment.id
const PIN_COMMENT_ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024
const commentCreatedAt = (comment: ShadowPinComment) => comment.created_at
const commentElementId = (id: string) => `shadow-pin-comment-${id}`
const PublicProfileDialog = lazy(() =>
  import('../../../components/profile/PublicProfileDialog').then(module => ({
    default: module.PublicProfileDialog,
  }))
)

const authorLabel = (comment: ShadowPinComment) =>
  comment.author?.display_name || comment.author?.username || 'ShadowChat member'

const formatCommentDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const mergeComments = (...groups: ShadowPinComment[][]) => {
  const byId = new Map<string, ShadowPinComment>()
  groups.flat().forEach(comment => byId.set(comment.id, comment))
  return Array.from(byId.values()).sort((first, second) => {
    const timeDifference = new Date(first.created_at).getTime() - new Date(second.created_at).getTime()
    return timeDifference || first.id.localeCompare(second.id)
  })
}

const QUICK_REACTIONS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F389}', '\u{1F64F}']
const normalizeEmojiValue = (emoji: string) => emoji.trim()
const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('button, a, input, textarea, select, [role="button"], [role="menuitem"]'))

function CommentCard({
  comment,
  reply,
  canEdit,
  canDelete,
  canReport,
  onReply,
  onEdit,
  onDelete,
  onReport,
  onReaction,
  onOpenProfile,
  currentUserId,
  scrollContainerRef,
  highlighted,
}: {
  comment: ShadowPinComment
  reply?: boolean
  canEdit: boolean
  canDelete: boolean
  canReport: boolean
  onReply: () => void
  onEdit: () => void
  onDelete: () => void
  onReport: () => void
  onReaction: (emoji: string) => Promise<void>
  onOpenProfile: () => void
  currentUserId?: string
  scrollContainerRef: React.RefObject<HTMLElement>
  highlighted?: boolean
}) {
  const bubbleShellRef = useRef<HTMLDivElement>(null)
  const reactionTimeoutRef = useRef<number | null>(null)
  const touchRef = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const [showQuickReactions, setShowQuickReactions] = useState(false)
  const [showReactionPicker, setShowReactionPicker] = useState(false)

  const clearReactionTimer = () => {
    if (reactionTimeoutRef.current !== null) {
      window.clearTimeout(reactionTimeoutRef.current)
      reactionTimeoutRef.current = null
    }
  }

  const openQuickReactions = () => {
    clearReactionTimer()
    setShowQuickReactions(true)
  }

  const scheduleQuickReactionClose = () => {
    clearReactionTimer()
    reactionTimeoutRef.current = window.setTimeout(() => setShowQuickReactions(false), 300)
  }

  useEffect(() => () => clearReactionTimer(), [])

  const react = async (emoji: string) => {
    try {
      await onReaction(emoji)
      setShowQuickReactions(false)
    } catch (reactionError) {
      toast.error(reactionError instanceof Error ? reactionError.message : 'Unable to update reaction')
    }
  }

  const copyComment = async () => {
    try {
      await navigator.clipboard.writeText(comment.body)
      toast.success('Comment copied')
    } catch {
      toast.error('Unable to copy comment')
    }
  }

  const actions: ChatMessageAction[] = [
    {
      id: 'copy',
      label: 'Copy',
      icon: Copy,
      onSelect: () => void copyComment(),
    },
    {
      id: 'reply',
      label: 'Reply',
      icon: Reply,
      onSelect: onReply,
    },
    {
      id: 'reaction',
      label: 'Add Reaction',
      icon: Plus,
      onSelect: () => setShowReactionPicker(true),
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: Edit3,
      hidden: !canEdit,
      onSelect: onEdit,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      tone: 'danger',
      hidden: !canDelete,
      onSelect: onDelete,
    },
    {
      id: 'report',
      label: 'Report',
      icon: Flag,
      hidden: !canReport,
      onSelect: onReport,
    },
  ]

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' || isInteractiveTarget(event.target)) return
    touchRef.current = { x: event.clientX, y: event.clientY, moved: false }
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const touch = touchRef.current
    if (!touch) return
    if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) {
      touch.moved = true
    }
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const touch = touchRef.current
    touchRef.current = null
    if (!touch || touch.moved || isInteractiveTarget(event.target)) return
    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return
    openQuickReactions()
  }

  return (
    <article
      id={`shadow-pin-comment-${comment.id}`}
      data-message-id={comment.id}
      tabIndex={-1}
      className={`${reply ? 'ml-8 border-l border-[var(--border-subtle)] pl-3' : ''} relative min-w-0 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]`}
    >
      <div className="absolute left-0 top-1.5">
        {comment.author ? (
          <button
            type="button"
            onClick={onOpenProfile}
            className="rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-border)]"
            aria-label={`Open ${authorLabel(comment)}'s profile`}
            aria-haspopup="dialog"
          >
            <Avatar src={comment.author.avatar_thumbnail_url || comment.author.avatar_url} alt={authorLabel(comment)} size="sm" />
          </button>
        ) : (
          <Avatar alt={authorLabel(comment)} size="sm" />
        )}
      </div>
      <div className="min-w-0 pl-10">
        <div className="mb-1 flex min-h-7 min-w-0 items-end gap-2">
          {comment.author ? (
            <button
              type="button"
              onClick={onOpenProfile}
              className="truncate rounded-sm text-left text-sm font-semibold text-[var(--text-primary)] hover:text-[var(--theme-accent-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent-border)]"
              aria-label={`Open ${authorLabel(comment)}'s profile`}
              aria-haspopup="dialog"
            >
              {authorLabel(comment)}
            </button>
          ) : (
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{authorLabel(comment)}</p>
          )}
          <time className="shrink-0 text-[0.68rem] text-[var(--text-muted)]" dateTime={comment.created_at}>
            {formatCommentDate(comment.created_at)}
          </time>
        </div>
        <div
          ref={bubbleShellRef}
          className="group/comment relative inline-block max-w-[calc(100%-2.5rem)]"
          onMouseEnter={openQuickReactions}
          onMouseLeave={scheduleQuickReactionClose}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { touchRef.current = null }}
          data-testid={`shadow-pin-comment-bubble-${comment.id}`}
        >
          <div className={`relative min-w-12 break-words rounded-[var(--radius-md)] border px-3 py-2 text-[var(--text-primary)] shadow-[var(--shadow-panel)] transition-[background-color,border-color,box-shadow] ${highlighted ? 'border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] shadow-[var(--shadow-accent-soft)]' : 'border-[var(--border-subtle)] bg-[var(--bg-panel)]'}`}>
            <MessageReactions
              reactions={comment.reactions}
              currentUserId={currentUserId}
              onReact={emoji => void react(emoji)}
              className="float-right ml-2 text-[0.65rem]"
            />
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-secondary)]">{comment.body}</p>
            {comment.attachment && (comment.attachmentUrl ? (
              comment.attachment.kind === 'image' ? (
                <a href={comment.attachmentUrl} target="_blank" rel="noreferrer" aria-label={`Open ${comment.attachment.name}`}>
                  <img src={comment.attachmentUrl} alt={comment.attachment.name} loading="lazy" decoding="async" className="mt-2 max-h-64 w-64 max-w-full rounded object-contain" style={{ aspectRatio: '4 / 3' }} />
                </a>
              ) : comment.attachment.kind === 'video' ? (
                <video controls playsInline preload="metadata" src={comment.attachmentUrl} className="mt-2 max-h-64 w-64 max-w-full rounded" style={{ aspectRatio: '16 / 9' }} />
              ) : <a href={comment.attachmentUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center break-all text-[var(--theme-accent-readable)]">Download {comment.attachment.name}</a>
            ) : <p className="text-xs text-[var(--text-muted)]">Attachment unavailable. Reopen this discussion to refresh access.</p>)}

          </div>
          <ChatMessageActionsMenu
            actions={actions}
            containerRef={scrollContainerRef}
            className="absolute -right-10 -top-1"
            buttonClassName="md:opacity-0 md:group-hover/comment:opacity-70"
            portalClassName="z-[125]"
            menuLabel={`Options for ${authorLabel(comment)}'s comment`}
            buttonLabel={`Actions for comment by ${authorLabel(comment)}`}
            onOpenChange={open => {
              if (open) setShowQuickReactions(false)
            }}
          />
          <QuickReactionRail
            open={showQuickReactions && !showReactionPicker}
            anchorRef={bubbleShellRef}
            reactions={QUICK_REACTIONS}
            onReact={emoji => void react(emoji)}
            onAddReaction={() => {
              setShowQuickReactions(false)
              setShowReactionPicker(true)
            }}
            onClose={() => setShowQuickReactions(false)}
            onPointerEnter={openQuickReactions}
            onPointerLeave={scheduleQuickReactionClose}
            normalizeEmoji={normalizeEmojiValue}
          />
          <EmojiPickerOverlay
            open={showReactionPicker}
            title="Add reaction"
            ariaLabel="ShadowPin comment reaction emoji picker"
            onClose={() => setShowReactionPicker(false)}
            onEmojiClick={(emojiData: EmojiClickData) => {
              void react(emojiData.emoji)
              setShowReactionPicker(false)
            }}
            desktopClassName="fixed left-1/2 top-16 z-[130] max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-hidden rounded-[var(--radius-md)] sm:absolute sm:bottom-full sm:left-0 sm:top-auto sm:mb-2 sm:translate-x-0"
          />
        </div>
      </div>
    </article>
  )
}

type CommentsDialogProps = {
  image: ShadowPinImage
  open: boolean
  onClose: () => void
  onCountChange?: (count: number) => void
  initialCommentId?: string
}

export function ShadowPinCommentsDialog(props: CommentsDialogProps) {
  const { user } = useAuth()
  // Remount the scope on account/image/route changes: A -> B -> A never
  // revives asynchronous work belonging to the first A mount.
  return <ShadowPinCommentsDialogScope key={`${user?.id}:${props.image.id}:${props.initialCommentId ?? ''}:${props.open}`} {...props} />
}

function ShadowPinCommentsDialogScope({ image, open, onClose, onCountChange, initialCommentId }: CommentsDialogProps) {
  const { user } = useAuth()
  const userId = user?.id
  const [savedAnchor] = useState(() => initialCommentId ? null : getSavedMessageScrollAnchor(userId, `pin:${image.id}`))
  const [restoringSavedAnchor, setRestoringSavedAnchor] = useState(Boolean(savedAnchor))
  const restoredAnchorRef = useRef(false)
  const { openReport } = useModerationReport()
  const { role } = useAdminAccess({ includeUsers: false })
  const [comments, setComments] = useState<ShadowPinComment[]>([])
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<ShadowPinComment | null>(null)
  const [editing, setEditing] = useState<ShadowPinComment | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileUser, setProfileUser] = useState<NonNullable<ShadowPinComment['author']> | null>(null)
  const [olderCursor, setOlderCursor] = useState<ShadowPinCommentCursor | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const keyboard = useComposerKeyboardDismiss(composerRef)
  const suppressSendClickRef = useRef(false)
  const submittingRef = useRef(false)
  const viewportFrameRef = useRef<HTMLDivElement>(null)
  const commentsScrollRef = useRef<HTMLDivElement>(null)
  const canonicalCountRef = useRef(Math.max(0, image.comment_count ?? 0))
  const [commentCount, setCommentCount] = useState(canonicalCountRef.current)
  const countedCommentIdsRef = useRef(new Set<string>())
  const deletedCommentIdsRef = useRef(new Set<string>())
  const countChangeRef = useRef(onCountChange)
  countChangeRef.current = onCountChange
  const noteCommentCreated = useCallback((id: string) => {
    if (countedCommentIdsRef.current.has(id) || deletedCommentIdsRef.current.has(id)) return
    countedCommentIdsRef.current.add(id)
    canonicalCountRef.current += 1
    setCommentCount(canonicalCountRef.current)
    countChangeRef.current?.(canonicalCountRef.current)
  }, [])
  const noteCommentDeleted = useCallback((id: string) => {
    // Realtime DELETE may carry only the primary key, so an unknown ID does
    // not prove that a deletion belongs to this image.
    if (deletedCommentIdsRef.current.has(id) || !countedCommentIdsRef.current.has(id)) return
    deletedCommentIdsRef.current.add(id)
    countedCommentIdsRef.current.delete(id)
    canonicalCountRef.current = Math.max(0, canonicalCountRef.current - 1)
    setCommentCount(canonicalCountRef.current)
    countChangeRef.current?.(canonicalCountRef.current)
  }, [])
  const [cursor, setCursor] = useState<UserReadCursor | null>(null)
  const [openingUnreadId, setOpeningUnreadId] = useState<string | null>(null)
  const [hasNewer, setHasNewer] = useState(false)
  const [loadingNewer, setLoadingNewer] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [ready, setReady] = useState(false)
  const [targetUnavailable, setTargetUnavailable] = useState(false)
  const [pendingCleanup, setPendingCleanup] = useState<ShadowPinCommentAttachment[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(`shadowchat:pin-comment-cleanup:${userId}`) || '[]')
      return Array.isArray(stored) ? stored.filter((item): item is ShadowPinCommentAttachment => Boolean(item && typeof item.path === 'string' && /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(item.path))) : []
    } catch { return [] }
  })
  useEffect(() => {
    if (!userId) return
    try { localStorage.setItem(`shadowchat:pin-comment-cleanup:${userId}`, JSON.stringify(pendingCleanup)) } catch { /* Keep the visible retry action when persistence is unavailable. */ }
  }, [pendingCleanup, userId])
  const fileRef = useRef<HTMLInputElement>(null)
  const generationRef = useRef(0)
  const aliveRef = useRef(true)
  const commentsRef = useRef(comments)
  const hasNewerRef = useRef(hasNewer)
  const ownSendRef = useRef(false)
  const observedRef = useRef(new Set<string>())
  commentsRef.current = comments
  comments.forEach(comment => countedCommentIdsRef.current.add(comment.id))
  hasNewerRef.current = hasNewer
  useEffect(() => {
    aliveRef.current = true
    return () => { aliveRef.current = false; generationRef.current += 1 }
  }, [])
  const dialogRef = useDialogAccessibility({ open: open && !profileUser, onClose, initialFocusRef: closeRef })


  const syncViewportFrame = useCallback(() => {
    const frame = viewportFrameRef.current
    if (!frame) return
    const viewport = window.visualViewport
    const height = Math.max(1, viewport?.height ?? window.innerHeight)
    const offsetTop = Math.max(0, viewport?.offsetTop ?? 0)
    frame.style.height = `${height}px`
    frame.style.transform = `translate3d(0, ${offsetTop}px, 0)`
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    let frameId: number | null = null
    let settleTimerIds: number[] = []

    const scheduleViewportSync = () => {
      syncViewportFrame()
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      settleTimerIds.forEach(timerId => window.clearTimeout(timerId))
      settleTimerIds = []
      frameId = window.requestAnimationFrame(() => {
        frameId = null
        syncViewportFrame()
        settleTimerIds = [80, 180, 320].map(delay =>
          window.setTimeout(syncViewportFrame, delay)
        )
      })
    }

    scheduleViewportSync()
    window.visualViewport?.addEventListener('resize', scheduleViewportSync)
    window.visualViewport?.addEventListener('scroll', scheduleViewportSync)
    window.addEventListener('resize', scheduleViewportSync)
    window.addEventListener('orientationchange', scheduleViewportSync)
    window.addEventListener('focusin', scheduleViewportSync)
    window.addEventListener('focusout', scheduleViewportSync)

    return () => {
      window.visualViewport?.removeEventListener('resize', scheduleViewportSync)
      window.visualViewport?.removeEventListener('scroll', scheduleViewportSync)
      window.removeEventListener('resize', scheduleViewportSync)
      window.removeEventListener('orientationchange', scheduleViewportSync)
      window.removeEventListener('focusin', scheduleViewportSync)
      window.removeEventListener('focusout', scheduleViewportSync)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
      settleTimerIds.forEach(timerId => window.clearTimeout(timerId))
    }
  }, [open, syncViewportFrame])

  const reportComment = (comment: ShadowPinComment) => openReport({
    type: 'shadow_pin_comment',
    id: comment.id,
    label: authorLabel(comment),
    preview: comment.body,
    subjectUserId: comment.author_id,
    subjectLabel: authorLabel(comment),
    subjectUsername: comment.author?.username ?? null,
    subjectAvatarUrl: comment.author?.avatar_url ?? null,
  })

  useEffect(() => {
    canonicalCountRef.current = Math.max(0, image.comment_count ?? 0)
    setCommentCount(canonicalCountRef.current)
  }, [image.comment_count, image.id])

  const acknowledgeVisible = useCallback(async (candidate: ShadowPinComment) => {
    const container = commentsScrollRef.current
    if (!container || !aliveRef.current || !ready || profileUser) return
    const rect = container.getBoundingClientRect()
    // Zero-sized or hidden fixtures/sheets are not evidence of reading.
    if (rect.height <= 0) return
    if (document.visibilityState !== 'visible') observedRef.current.add(candidate.id)
    else for (const comment of commentsRef.current) {
      const row = container.querySelector<HTMLElement>(`[data-message-id="${comment.id}"]`)
      if (!row) continue
      const rowRect = row.getBoundingClientRect()
      if (Math.min(rect.bottom, rowRect.bottom) - Math.max(rect.top, rowRect.top) >= Math.min(48, rowRect.height) && rowRect.height > 0) observedRef.current.add(comment.id)
    }
    if (!observedRef.current.size) return
    const generation = generationRef.current
    // Retain observations after failure so a subsequent scroll/foreground flush
    // retries the same proven targets instead of silently dropping them.
    const next = await markShadowPinCommentsRead(image.id, [...observedRef.current], userId)
    if (!aliveRef.current || generation !== generationRef.current) return
    if (next) {
      setCursor(next)
      for (const comment of commentsRef.current) {
        if (compareMessageKey(comment, { created_at: next.last_read_at, id: next.last_read_message_id }) <= 0) observedRef.current.delete(comment.id)
      }
    }
    // A gap can defer the cursor even though the observed event badges cleared.
    // Keep the controller retryable instead of recording an unacknowledged key.
    if (!next || compareMessageKey({ created_at: next.last_read_at, id: next.last_read_message_id }, candidate) < 0) throw new Error('Earlier unread comments have not been observed.')
  }, [image.id, profileUser, ready, userId])

  const { autoScroll, feedState, handleUnreadScroll, scrollToBottom, setAutoScroll, captureScrollAnchor, restoreScrollAnchor } = useUnreadScroll({
    containerRef: commentsScrollRef, messages: comments, loading, cursor, cursorLoading: !ready,
    restorationReady: ready && !targetUnavailable, enabled: open && !profileUser,
    surfaceKey: `pin:${image.id}`, readerId: userId, initialMessageId: initialCommentId || (restoringSavedAnchor ? savedAnchor?.id : undefined),
    getMessageId: commentId, getMessageCreatedAt: commentCreatedAt, getElementId: commentElementId,
    markInitialVisibleRead: true, markVisibleOnScroll: true, onMarkReadToLatest: acknowledgeVisible,
  })
  const followingRef = useRef(autoScroll)
  followingRef.current = autoScroll
  useLayoutEffect(() => () => {
    const container = commentsScrollRef.current
    if (open && container) saveMessageScrollAnchor(userId, `pin:${image.id}`, followingRef.current ? null : captureMessageScrollAnchor(container))
  }, [image.id, open, userId])
  useLayoutEffect(() => {
    if (!ready || !restoringSavedAnchor || restoredAnchorRef.current || !savedAnchor || !commentsScrollRef.current) return
    restoredAnchorRef.current = restoreMessageScrollAnchor(commentsScrollRef.current, savedAnchor)
    captureScrollAnchor()
  }, [captureScrollAnchor, comments, ready, restoringSavedAnchor, savedAnchor])

  const refresh = useCallback(async () => {
    if (!userId) return
    const generation = ++generationRef.current
    setReady(false)
    setLoading(true)
    setError(null)
    try {
      let page = await fetchShadowPinDiscussionWindow(image.id, userId, initialCommentId || savedAnchor?.id)
      if (savedAnchor && !initialCommentId && page.targetUnavailable) {
        page = await fetchShadowPinDiscussionWindow(image.id, userId)
        if (aliveRef.current && generation === generationRef.current) setRestoringSavedAnchor(false)
      }
      if (!aliveRef.current || generation !== generationRef.current) return
      page.comments.forEach(comment => countedCommentIdsRef.current.add(comment.id))
      setComments(page.comments)
      setCursor(page.cursor)
      // Keep the opening boundary in the layout after acknowledgement. Removing
      // it would move the settled first unread row behind the fixed header.
      setOpeningUnreadId(page.firstUnreadId)
      setOlderCursor(page.nextCursor)
      setHasOlder(page.hasMore)
      setHasNewer(page.hasNewer)
      setTargetUnavailable(page.targetUnavailable)
      setReady(true)
    } catch (loadError) {
      if (aliveRef.current && generation === generationRef.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load comments.')
    } finally {
      if (aliveRef.current && generation === generationRef.current) setLoading(false)
    }
  }, [image.id, initialCommentId, savedAnchor, userId])

  const loadOlder = async () => {
    if (!olderCursor || loadingOlder) return
    const generation = generationRef.current
    setAutoScroll(false)
    captureScrollAnchor()
    setLoadingOlder(true)
    setError(null)
    try {
      const page = await fetchShadowPinComments(image.id, olderCursor)
      const rows = await resolveShadowPinCommentAttachments(page.comments)
      if (!aliveRef.current || generation !== generationRef.current) return
      setComments(current => {
        const merged = mergeComments(rows, current)
        if (merged.length > 200) setHasNewer(true)
        return merged.slice(0, 200)
      })
      setOlderCursor(page.nextCursor)
      setHasOlder(page.hasMore)
    } catch (loadError) {
      if (aliveRef.current && generation === generationRef.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load earlier comments.')
    } finally {
      if (aliveRef.current && generation === generationRef.current) setLoadingOlder(false)
    }
  }

  const loadNewer = async () => {
    const latest = commentsRef.current[commentsRef.current.length - 1]
    if (!latest || loadingNewer) return
    const generation = generationRef.current
    captureScrollAnchor()
    setLoadingNewer(true)
    try {
      const page = await fetchShadowPinNewerComments(image.id, { createdAt: latest.created_at, id: latest.id })
      if (!aliveRef.current || generation !== generationRef.current) return
      setComments(current => {
        const merged = mergeComments(current, page.comments)
        const bounded = merged.slice(-200)
        if (merged.length > 200) {
          setHasOlder(true)
          setOlderCursor({ createdAt: bounded[0].created_at, id: bounded[0].id })
        }
        return bounded
      })
      setHasNewer(page.hasNewer)
      setPendingCount(0)
    } catch (loadError) {
      if (aliveRef.current && generation === generationRef.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load newer comments.')
    } finally {
      if (aliveRef.current && generation === generationRef.current) setLoadingNewer(false)
    }
  }

  const jumpToLatest = async () => {
    const generation = generationRef.current
    setLoadingNewer(true)
    try {
      const page = await fetchShadowPinComments(image.id)
      const rows = await resolveShadowPinCommentAttachments(page.comments)
      if (!aliveRef.current || generation !== generationRef.current) return
      setComments(rows)
      setOlderCursor(page.nextCursor)
      setHasOlder(page.hasMore)
      setHasNewer(false)
      setPendingCount(0)
      ownSendRef.current = true
    } catch (loadError) {
      if (aliveRef.current && generation === generationRef.current) setError(loadError instanceof Error ? loadError.message : 'Unable to load latest comments.')
    } finally {
      if (aliveRef.current && generation === generationRef.current) setLoadingNewer(false)
    }
  }

  useLayoutEffect(() => {
    if (ownSendRef.current && ready) {
      ownSendRef.current = false
      setAutoScroll(true)
      scrollToBottom('auto')
    } else restoreScrollAnchor()
  }, [comments, ready, restoreScrollAnchor, scrollToBottom, setAutoScroll])

  useEffect(() => { if (open) void refresh() }, [open, refresh])

  const reconcileVisibleWindow = useCallback(async () => {
    if (!ready || !aliveRef.current || document.visibilityState !== 'visible') return
    const generation = generationRef.current
    const ids = commentsRef.current.map(comment => comment.id)
    const latest = commentsRef.current[commentsRef.current.length - 1]
    try {
      const rows = await refreshShadowPinCommentRows(image.id, ids)
      const newer = latest && !hasNewerRef.current
        ? await fetchShadowPinNewerComments(image.id, { createdAt: latest.created_at, id: latest.id })
        : { comments: [], hasNewer: hasNewerRef.current }
      if (!aliveRef.current || generation !== generationRef.current) return
      captureScrollAnchor()
      const requested = new Set(ids)
      const existingIds = new Set(commentsRef.current.map(comment => comment.id))
      const incomingCount = newer.comments.filter(comment => !existingIds.has(comment.id)).length
      setComments(current => {
        const merged = mergeComments(rows, current.filter(comment => !requested.has(comment.id)), newer.comments)
        // Reconciliation while reading history must not evict its visible head.
        const bounded = followingRef.current ? merged.slice(-200) : merged.slice(0, 200)
        if (followingRef.current && merged.length > 200) {
          setHasOlder(true)
          setOlderCursor({ createdAt: bounded[0].created_at, id: bounded[0].id })
        }
        setHasNewer(newer.hasNewer || !followingRef.current && merged.length > 200)
        return bounded
      })
      if (incomingCount && !followingRef.current) setPendingCount(count => count + incomingCount)
    } catch {
      // Keep the current history window during a transient reconnect failure.
    }
  }, [captureScrollAnchor, image.id, ready])
  const reconcileRef = useRef(reconcileVisibleWindow)
  reconcileRef.current = reconcileVisibleWindow
  useEffect(() => {
    const reconcile = () => { void reconcileRef.current() }
    window.addEventListener('online', reconcile)
    document.addEventListener('visibilitychange', reconcile)
    return () => {
      window.removeEventListener('online', reconcile)
      document.removeEventListener('visibilitychange', reconcile)
    }
  }, [])
  useEffect(() => {
    if (!open || !ready) return
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !commentsRef.current.some(comment => comment.attachment)) return
      const generation = generationRef.current
      void resolveShadowPinCommentAttachments(commentsRef.current).then(rows => {
        if (!aliveRef.current || generation !== generationRef.current) return
        const urls = new Map(rows.map(comment => [comment.id, comment.attachmentUrl]))
        setComments(current => current.map(comment => urls.has(comment.id) ? { ...comment, attachmentUrl: urls.get(comment.id) } : comment))
      }).catch(() => undefined)
    }, 8 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [open, ready])

  useEffect(() => {
    if (!open || !userId) return
    const manager = createRealtimeSubscriptionManager()
    const subscribe = async () => {
      const client = await getWorkingClient()
      const channel = client.channel(`pin-comments:${image.id}:${userId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shadow_pin_comments', filter: `image_id=eq.${image.id}` }, async (payload: { eventType: string; new: { id?: string }; old: { id?: string } }) => {
          const id = (payload.new as { id?: string }).id ?? (payload.old as { id?: string }).id
          if (!id || !aliveRef.current) return
          const generation = generationRef.current
          if (payload.eventType === 'DELETE') {
            noteCommentDeleted(id)
            captureScrollAnchor()
            setComments(current => current.filter(comment => comment.id !== id))
            return
          }
          const comment = await fetchShadowPinCommentById(image.id, id).catch(() => null)
          if (!comment || !aliveRef.current || generation !== generationRef.current) return
          if (payload.eventType === 'INSERT') noteCommentCreated(id)
          const exists = commentsRef.current.some(row => row.id === id)
          if (!exists && (hasNewerRef.current || !followingRef.current && commentsRef.current.length >= 200)) {
            if (payload.eventType === 'INSERT') {
              setPendingCount(count => count + 1)
              setHasNewer(true)
            }
            return
          }
          captureScrollAnchor()
          setComments(current => {
            const merged = mergeComments(current, [comment])
            const bounded = merged.slice(-200)
            if (merged.length > 200) {
              setHasOlder(true)
              setOlderCursor({ createdAt: bounded[0].created_at, id: bounded[0].id })
            }
            return bounded
          })
          if (!exists && !followingRef.current) setPendingCount(count => count + 1)
        }).subscribe((status: string) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') manager.scheduleResubscribe(1000)
          if (status === 'SUBSCRIBED') void reconcileRef.current()
        })
      return { client, channel }
    }
    manager.setSubscribe(subscribe)
    void manager.start().catch(() => undefined)
    return () => { void manager.stop() }
  }, [captureScrollAnchor, image.id, noteCommentCreated, noteCommentDeleted, open, userId])

  const attachments = useStagedAttachments<ShadowPinCommentAttachment>({
    scopeKey: `pin:${user?.id}:${image.id}`,
    validate: file => { if (!file.size || file.size > PIN_COMMENT_ATTACHMENT_MAX_BYTES) throw new UploadValidationError('Choose a file between 1 byte and 50 MiB.') },
    upload: (file, options) => uploadShadowPinCommentAttachment(image.id, file, options),
    cleanup: cleanupShadowPinCommentAttachment,
    cleanupPath: attachment => attachment.path,
    cleanupScopeKey: userId,
    cleanupNamespace: 'pins',
    cleanupPersisted: cleanupPersistedShadowPinCommentAttachment,
    errorMessage: (error, file) => getUploadErrorMessage(error, 'Attachment failed. Try again.', {
      fileSizeBytes: file.size,
      limitBytes: PIN_COMMENT_ATTACHMENT_MAX_BYTES,
    }),
    send: async (attachment) => {
      const generation = generationRef.current
      const created = await createShadowPinComment(image.id, '', replyTo?.id, attachment)
      if (!aliveRef.current || generation !== generationRef.current) return true
      setComments(current => mergeComments(current, [created]))
      noteCommentCreated(created.id)
      if (hasNewerRef.current) await jumpToLatest()
      else ownSendRef.current = true
      return true
    },
  })
  const attachmentBatchRef = useRef<{
    ids: Set<string>
    firstId: string
    caption: string
    draftValue: string
    captionCommitted: boolean
    captionAttempted: boolean
    replyId: string | null
    imageId: string
  } | null>(null)
  const stageFiles = (files: File[]) => {
    if (editing) { setError('Finish editing before attaching files.'); return }
    try {
      const result = attachments.addFiles(files)
      setError(result.errors.length ? result.errors.join(' ') : null)
    } catch (stageError) { setError(stageError instanceof Error ? stageError.message : 'Unable to attach files.') }
  }
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = extractComposerFiles(event.clipboardData)
    if (!files.length) {
      if (hasClipboardFileIntent(event.clipboardData)) setError('This clipboard did not provide a file to paste. Use Attach files to choose it instead.')
      else if (clipboardHasNoReadableContent(event.clipboardData)) setError('Nothing usable came through from the clipboard. For a video, use Attach files instead.')
      return
    }
    event.preventDefault()
    stageFiles(files)
    const text = event.clipboardData.getData?.('text/plain') || ''
    if (text) {
      const start = event.currentTarget.selectionStart
      const end = event.currentTarget.selectionEnd
      setBody(current => `${current.slice(0, start)}${text}${current.slice(end)}`.slice(0, 1000))
      requestAnimationFrame(() => {
        if (aliveRef.current) composerRef.current?.setSelectionRange(start + text.length, start + text.length)
      })
    }
  }
  const retryCleanup = async (attachment: ShadowPinCommentAttachment) => {
    try {
      await cleanupShadowPinCommentAttachment(attachment)
      if (aliveRef.current) setPendingCleanup(current => current.filter(item => item.path !== attachment.path))
    } catch { if (aliveRef.current) setError('Private file cleanup could not finish. Keep this retry for when the connection recovers.') }
  }

  const startReply = (comment: ShadowPinComment) => {
    setEditing(null)
    setReplyTo(comment.parent_comment_id
      ? comments.find(candidate => candidate.id === comment.parent_comment_id) ?? comment
      : comment)
    setBody('')
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  const startEdit = (comment: ShadowPinComment) => {
    if (attachments.items.length) { setError('Remove staged files before editing a comment.'); return }
    setReplyTo(null)
    setEditing(comment)
    setBody(comment.body)
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  const submit = async () => {
    if ((!body.trim() && attachments.items.length === 0) || saving || attachments.busy || submittingRef.current) return
    submittingRef.current = true
    const finishTiming = beginChatTiming('send-ack', 'pins')
    const generation = generationRef.current
    const submittedBody = body
    let finalBodyToClear = submittedBody
    const focusIntent = keyboard.focusIntentRef.current
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const updated = await updateShadowPinComment(editing.id, body)
        if (!aliveRef.current || generation !== generationRef.current) return
        captureScrollAnchor()
        setComments(previous => previous.map(comment => comment.id === updated.id ? { ...comment, body: updated.body, updated_at: updated.updated_at } : comment))
        toast.success('Comment updated')
      } else if (attachments.items.length) {
        const stagedIds = attachments.items.map(item => item.clientMessageId)
        let batch = attachmentBatchRef.current
        if (!batch || batch.imageId !== image.id || !stagedIds.some(id => batch?.ids.has(id))) {
          batch = {
            ids: new Set(stagedIds),
            firstId: stagedIds[0],
            caption: submittedBody.trim(),
            draftValue: submittedBody,
            captionCommitted: false,
            captionAttempted: false,
            replyId: replyTo?.id ?? null,
            imageId: image.id,
          }
          attachmentBatchRef.current = batch
        }
        const activeBatch = batch
        if (!activeBatch.captionCommitted && !activeBatch.captionAttempted && !stagedIds.includes(activeBatch.firstId)) {
          activeBatch.firstId = stagedIds[0]
        }
        finalBodyToClear = activeBatch.draftValue
        const sentAll = await attachments.sendAll(async (attachment, _file, clientMessageId) => {
          const caption = clientMessageId === activeBatch.firstId && !activeBatch.captionCommitted ? activeBatch.caption : ''
          if (caption) activeBatch.captionAttempted = true
          const created = await createShadowPinComment(image.id, caption, activeBatch.replyId, attachment)
          if (caption) {
            activeBatch.captionCommitted = true
            if (aliveRef.current && generation === generationRef.current) {
              setBody(current => current === activeBatch.draftValue ? '' : current)
            }
          }
          if (!aliveRef.current || generation !== generationRef.current) return true
          ownSendRef.current = true
          setComments(previous => mergeComments(previous, [created]))
          noteCommentCreated(created.id)
          return true
        })
        if (!sentAll) return
        attachmentBatchRef.current = null
        if (activeBatch.caption && !activeBatch.captionCommitted) {
          setError('Attachments posted, but the comment text was not confirmed. Check the discussion before posting it again.')
          finishTiming()
          return
        }
        toast.success(replyTo ? 'Reply posted' : 'Comment posted')
      } else if (body.trim()) {
        const created = await createShadowPinComment(image.id, body, replyTo?.id)
        if (!aliveRef.current || generation !== generationRef.current) return
        ownSendRef.current = true
        setComments(previous => mergeComments(previous, [created]))
        noteCommentCreated(created.id)
        setBody(current => current === submittedBody ? '' : current)
        toast.success(replyTo ? 'Reply posted' : 'Comment posted')
      }
      if (!aliveRef.current || generation !== generationRef.current) return
      if (hasNewerRef.current) await jumpToLatest()
      finishTiming()
      setBody(current => current === finalBodyToClear ? '' : current)
      setReplyTo(null)
      setEditing(null)
      if (keyboard.focusIntentRef.current === focusIntent) composerRef.current?.focus({ preventScroll: true })
    } catch (saveError) {
      if (!aliveRef.current || generation !== generationRef.current) return
      setError(saveError instanceof Error ? saveError.message : 'Unable to save comment.')
    } finally {
      submittingRef.current = false
      if (aliveRef.current) setSaving(false)
    }
  }

  const removeComment = async (comment: ShadowPinComment) => {
    if (!window.confirm('Delete this comment?')) return
    setSaving(true)
    try {
      const result = await deleteShadowPinComment(comment.id)
      if (result?.pendingCleanup && userId) {
        // Deletion may finish after the sheet closes. Preserve the confirmed
        // orphan's retry record under its original account in that case too.
        try {
          const key = `shadowchat:pin-comment-cleanup:${userId}`
          const stored: unknown = JSON.parse(localStorage.getItem(key) || '[]')
          const current = Array.isArray(stored) ? stored : []
          localStorage.setItem(key, JSON.stringify([...current.filter(item => item?.path !== result.pendingCleanup.path), result.pendingCleanup]))
        } catch { /* The mounted retry action remains available when storage fails. */ }
      }
      if (!aliveRef.current) return
      if (result?.pendingCleanup) setPendingCleanup(current => [...current.filter(item => item.path !== result.pendingCleanup.path), result.pendingCleanup])
      captureScrollAnchor()
      setComments(current => current.filter(candidate => candidate.id !== comment.id)
        .map(candidate => candidate.parent_comment_id === comment.id ? { ...candidate, parent_comment_id: null } : candidate))
      noteCommentDeleted(comment.id)
      if (replyTo?.id === comment.id || editing?.id === comment.id) {
        setReplyTo(null)
        setEditing(null)
        setBody('')
      }
      if (result?.pendingCleanup) toast.error('Comment deleted. Private file cleanup needs a retry.')
      else toast.success('Comment deleted')
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete comment')
    } finally {
      setSaving(false)
    }
  }

  const toggleCommentReaction = async (commentId: string, emoji: string) => {
    const reactions = await toggleShadowPinCommentReaction(commentId, emoji)
    if (!aliveRef.current) return
    captureScrollAnchor()
    setComments(current => current.map(comment =>
      comment.id === commentId ? { ...comment, reactions } : comment
    ))
  }

  if (!open) return null

  const pinPreviewUrl = image.thumbnail_url || image.medium_url || image.image_url
  const pinCreator = image.creator?.display_name || image.creator?.username || 'ShadowChat member'

  return createPortal(
    <>
      <div
        ref={viewportFrameRef}
        className="fixed inset-x-0 top-0 z-[110] flex items-end justify-center bg-black/48 backdrop-blur-[2px] sm:items-center sm:p-4"
        data-testid="shadow-pin-comments-viewport"
      >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shadow-pin-comments-title"
        aria-hidden={profileUser ? true : undefined}
        className="popup-surface flex h-[min(48rem,calc(100%_-_env(safe-area-inset-top)_-_0.5rem))] w-full flex-col rounded-t-[var(--radius-xl)] border border-[var(--border-panel)] sm:max-w-2xl sm:rounded-[var(--radius-xl)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <img
              src={pinPreviewUrl}
              alt=""
              className="h-12 w-12 shrink-0 rounded-[var(--radius-md)] border border-[var(--border-subtle)] object-cover"
            />
            <div className="min-w-0">
              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--text-muted)]">ShadowPin conversation</p>
              <h2 id="shadow-pin-comments-title" className="mt-1 truncate text-xl font-semibold text-[var(--text-primary)]">{image.title}</h2>
              <p className="truncate text-xs text-[var(--text-muted)]">{pinCreator} · {commentCount} comments</p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
            aria-label="Close ShadowPin comments"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={commentsScrollRef} onScroll={handleUnreadScroll} data-testid="shadow-pin-comment-scroll" data-scroll-state={feedState} className="min-h-0 flex-1 overflow-y-auto p-4" style={{ overflowAnchor: 'none' }}>
          {targetUnavailable && <p role="status" className="p-4 text-sm">This comment is no longer available. <button type="button" className="min-h-11 underline" onClick={() => { setTargetUnavailable(false); void jumpToLatest() }}>Show latest comments</button></p>}
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2" role="status" aria-label="Loading ShadowPin comments"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-gold)]" /><span className="sr-only">Loading comments</span></div>
          ) : error && comments.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
              {error}
              <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => void refresh()}>Try again</Button>
            </div>
          ) : comments.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center text-center text-[var(--text-muted)]">
              <MessageSquare className="mb-3 h-7 w-7 text-[var(--theme-accent-readable)]" />
              <p className="font-semibold text-[var(--text-primary)]">Start the conversation</p>
              <p className="mt-1 text-sm">Share a thought about this pin.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {hasOlder && (
                <button
                  type="button"
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-55"
                >
                  {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" />}
                  {loadingOlder ? 'Loading earlier comments' : 'Load earlier comments'}
                </button>
              )}
              {comments.map(comment => (
                <div key={comment.id} className="space-y-2">
                  {comment.id === openingUnreadId && <div role="separator" className="py-2 text-center text-xs font-semibold text-[var(--theme-accent-readable)]">Unread comments</div>}
                  <CommentCard comment={comment} reply={Boolean(comment.parent_comment_id)}
                    highlighted={comment.id === initialCommentId}
                    canEdit={comment.author_id === user?.id}
                    canDelete={comment.author_id === user?.id || role === 'admin' || role === 'sub_admin'}
                    canReport={MEMBER_REPORTING_FEATURE_ENABLED && comment.author_id !== user?.id}
                    onReply={() => startReply(comment)} onEdit={() => startEdit(comment)}
                    onDelete={() => void removeComment(comment)} onReport={() => reportComment(comment)}
                    onReaction={emoji => toggleCommentReaction(comment.id, emoji)}
                    onOpenProfile={() => setProfileUser(comment.author ?? null)} currentUserId={user?.id}
                    scrollContainerRef={commentsScrollRef} />
                </div>
              ))}
              {hasNewer && <button type="button" disabled={loadingNewer} onClick={() => void loadNewer()} className="min-h-11 w-full text-sm text-[var(--theme-accent-readable)]">{loadingNewer ? 'Loading newer comments' : 'Load newer comments'}</button>}
            </div>
          )}
        </div>

        {(!autoScroll || hasNewer || pendingCount > 0) && ready && <button type="button" disabled={loadingNewer} onClick={() => void jumpToLatest()} className="min-h-11 shrink-0 text-sm font-semibold text-[var(--theme-accent-readable)]">{pendingCount ? `${pendingCount} new comment${pendingCount === 1 ? '' : 's'} · ` : ''}Jump to latest</button>}
        <div className="shrink-0 border-t border-[var(--border-subtle)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-4">
          {(replyTo || editing) && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[var(--text-muted)]">
              <span className="truncate">{editing ? 'Editing your comment' : `Replying to ${authorLabel(replyTo!)}`}</span>
              <button type="button" onClick={() => { setReplyTo(null); setEditing(null); setBody('') }} className="min-h-11 rounded-full px-3 text-[var(--text-gold)]">Cancel</button>
            </div>
          )}
          {error && comments.length > 0 && <p className="mb-2 text-sm text-red-200" role="alert" aria-live="assertive">{error}</p>}
          {pendingCleanup.map(attachment => <button key={attachment.path} type="button" onClick={() => void retryCleanup(attachment)} className="mb-2 min-h-11 text-sm text-[var(--theme-accent-readable)]">Retry file cleanup: {attachment.name || 'attachment'}</button>)}
          <div className="flex items-end gap-2" onDragOver={event => event.preventDefault()} onDrop={event => { const files = extractComposerFiles(event.dataTransfer); if (files.length) { event.preventDefault(); stageFiles(files) } }}>
            <input ref={fileRef} type="file" multiple className="hidden" aria-label="Attach files to comment" onChange={event => { stageFiles(Array.from(event.target.files ?? [])); event.target.value = '' }} />
            <div className="flex h-12 shrink-0 items-center">
              <button type="button" disabled={Boolean(editing) || saving || attachments.busy} onClick={() => fileRef.current?.click()} className={`inline-flex h-12 ${keyboard.keyboardVisible ? 'w-8' : 'w-11'} items-center justify-center rounded-full text-[var(--theme-accent-readable)]`} aria-label="Attach files"><Paperclip className="h-5 w-5" /></button>
              {keyboard.keyboardVisible && <button type="button" onMouseDown={event => event.preventDefault()} onClick={keyboard.dismissKeyboard} className="flex h-12 w-8 items-center justify-center text-[var(--text-muted)]" aria-label="Hide keyboard"><ChevronDown className="h-3.5 w-3.5" /></button>}
            </div>
            <div className="obsidian-input min-w-0 flex-1 rounded-[var(--radius-md)] px-2 py-1.5" data-composer-entry="true" data-testid="shadow-pin-comment-entry-box">
              <StagedAttachmentList items={attachments.items} onRemove={attachments.remove} onRetry={() => { void submit() }} onCancel={attachments.cancel} />
              <textarea
              ref={composerRef}
              value={body}
              onChange={event => { measureChatInputFrame('pins'); setBody(event.target.value) }}
              onPaste={handlePaste}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void submit()
                }
              }}
              maxLength={1000}
              rows={2}
              className="min-h-11 w-full resize-none border-0 bg-transparent px-1 py-1.5 text-base text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
              placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
              aria-label={replyTo ? `Reply to ${authorLabel(replyTo)}` : 'Add a ShadowPin comment'}
              aria-describedby="shadow-pin-comment-composer-help"
              />
            </div>
            <button
              type="button"
              onClick={() => { if (suppressSendClickRef.current) { suppressSendClickRef.current = false; return }; void submit() }}
              onMouseDown={event => event.preventDefault()}
              onPointerDown={event => { suppressSendClickRef.current = false; keyboard.beginGesture(event) }}
              onPointerMove={keyboard.moveGesture}
              onPointerUp={event => { if (keyboard.endGesture(event)) { event.preventDefault(); suppressSendClickRef.current = true } }}
              onPointerCancel={() => { keyboard.cancelGesture(); suppressSendClickRef.current = true }}
              disabled={!keyboard.keyboardVisible && ((!body.trim() && attachments.items.length === 0) || saving || attachments.busy)}
              aria-disabled={saving || attachments.busy || undefined}
              className="theme-floating-action inline-flex h-12 w-12 shrink-0 touch-none items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-45"
              aria-label={editing ? 'Save edited comment' : replyTo ? 'Post reply' : 'Post comment'}
              aria-busy={saving}
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
          <p id="shadow-pin-comment-composer-help" className="sr-only">Press Enter to post. Press Shift and Enter for a new line.</p>
        </div>
        </div>
      </div>
      {profileUser && (
        <Suspense fallback={null}>
          <PublicProfileDialog
            user={profileUser}
            open
            onClose={() => setProfileUser(null)}
          />
        </Suspense>
      )}
    </>,
    document.body
  )
}

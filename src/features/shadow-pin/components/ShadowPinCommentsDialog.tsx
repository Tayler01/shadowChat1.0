import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Edit3, Flag, Loader2, MessageSquare, Plus, Reply, Send, Trash2, X } from 'lucide-react'
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
  deleteShadowPinComment,
  fetchShadowPinComments,
  toggleShadowPinCommentReaction,
  updateShadowPinComment,
} from '../api/shadowPinApi'
import type { ShadowPinCommentCursor } from '../api/shadowPinApi'
import type { ShadowPinComment, ShadowPinImage } from '../types'
import { useModerationReport } from '../../moderation/useModerationReport'
import { MEMBER_REPORTING_FEATURE_ENABLED } from '../../../config/featureFlags'

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

export function ShadowPinCommentsDialog({
  image,
  open,
  onClose,
  onCountChange,
  initialCommentId,
}: {
  image: ShadowPinImage
  open: boolean
  onClose: () => void
  onCountChange?: (count: number) => void
  initialCommentId?: string
}) {
  const { user } = useAuth()
  const { openReport } = useModerationReport()
  const { role } = useAdminAccess({ includeUsers: false })
  const [comments, setComments] = useState<ShadowPinComment[]>([])
  const [body, setBody] = useState('')
  const [replyTo, setReplyTo] = useState<ShadowPinComment | null>(null)
  const [editing, setEditing] = useState<ShadowPinComment | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profileUser, setProfileUser] = useState<NonNullable<ShadowPinComment['author']> | null>(null)
  const [olderCursor, setOlderCursor] = useState<ShadowPinCommentCursor | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const viewportFrameRef = useRef<HTMLDivElement>(null)
  const commentsScrollRef = useRef<HTMLDivElement>(null)
  const canonicalCountRef = useRef(Math.max(0, image.comment_count ?? 0))
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
  }, [image.comment_count, image.id])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await fetchShadowPinComments(image.id, null, initialCommentId)
      setComments(page.comments)
      setOlderCursor(page.nextCursor)
      setHasOlder(page.hasMore)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load comments.')
    } finally {
      setLoading(false)
    }
  }, [image.id, initialCommentId])

  const loadOlder = async () => {
    if (!olderCursor || loadingOlder) return
    setLoadingOlder(true)
    setError(null)
    try {
      const page = await fetchShadowPinComments(image.id, olderCursor)
      setComments(current => mergeComments(page.comments, current))
      setOlderCursor(page.nextCursor)
      setHasOlder(page.hasMore)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load earlier comments.')
    } finally {
      setLoadingOlder(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setBody('')
    setReplyTo(null)
    setEditing(null)
    void refresh()
  }, [open, refresh])

  useEffect(() => {
    if (!open || loading || !initialCommentId || comments.length === 0) return
    const target = document.getElementById(`shadow-pin-comment-${initialCommentId}`)
    if (!(target instanceof HTMLElement)) return
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      target.focus({ preventScroll: true })
    })
  }, [comments, initialCommentId, loading, open])

  const rootComments = useMemo(
    () => comments.filter(comment => !comment.parent_comment_id),
    [comments]
  )
  const repliesByParent = useMemo(() => {
    const replies = new Map<string, ShadowPinComment[]>()
    comments.forEach(comment => {
      if (!comment.parent_comment_id) return
      const existing = replies.get(comment.parent_comment_id) ?? []
      existing.push(comment)
      replies.set(comment.parent_comment_id, existing)
    })
    return replies
  }, [comments])

  const startReply = (comment: ShadowPinComment) => {
    setEditing(null)
    setReplyTo(comment.parent_comment_id
      ? comments.find(candidate => candidate.id === comment.parent_comment_id) ?? comment
      : comment)
    setBody('')
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  const startEdit = (comment: ShadowPinComment) => {
    setReplyTo(null)
    setEditing(comment)
    setBody(comment.body)
    window.requestAnimationFrame(() => composerRef.current?.focus())
  }

  const submit = async () => {
    if (!body.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      if (editing) {
        const updated = await updateShadowPinComment(editing.id, body)
        setComments(previous => previous.map(comment => comment.id === updated.id ? updated : comment))
        toast.success('Comment updated')
      } else {
        const created = await createShadowPinComment(image.id, body, replyTo?.id)
        setComments(previous => [...previous, created])
        canonicalCountRef.current += 1
        onCountChange?.(canonicalCountRef.current)
        toast.success(replyTo ? 'Reply posted' : 'Comment posted')
      }
      setBody('')
      setReplyTo(null)
      setEditing(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save comment.')
    } finally {
      setSaving(false)
    }
  }

  const removeComment = async (comment: ShadowPinComment) => {
    if (!window.confirm('Delete this comment?')) return
    setSaving(true)
    try {
      await deleteShadowPinComment(comment.id)
      const nextComments = comments
        .filter(candidate => candidate.id !== comment.id)
        .map(candidate => candidate.parent_comment_id === comment.id
          ? { ...candidate, parent_comment_id: null }
          : candidate)
      setComments(nextComments)
      canonicalCountRef.current = Math.max(0, canonicalCountRef.current - 1)
      onCountChange?.(canonicalCountRef.current)
      if (replyTo?.id === comment.id || editing?.id === comment.id) {
        setReplyTo(null)
        setEditing(null)
        setBody('')
      }
      toast.success('Comment deleted')
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete comment')
    } finally {
      setSaving(false)
    }
  }

  const toggleCommentReaction = async (commentId: string, emoji: string) => {
    const reactions = await toggleShadowPinCommentReaction(commentId, emoji)
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
              <p className="truncate text-xs text-[var(--text-muted)]">{pinCreator} · {image.comment_count ?? comments.length} comments</p>
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

        <div ref={commentsScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center gap-2" role="status" aria-label="Loading ShadowPin comments"><Loader2 className="h-6 w-6 animate-spin text-[var(--text-gold)]" /><span className="sr-only">Loading comments</span></div>
          ) : error && comments.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100" role="alert">
              {error}
              <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => void refresh()}>Try again</Button>
            </div>
          ) : rootComments.length === 0 ? (
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
              {rootComments.map(comment => (
                <div key={comment.id} className="space-y-2">
                  <CommentCard
                    comment={comment}
                    highlighted={comment.id === initialCommentId}
                    canEdit={comment.author_id === user?.id}
                    canDelete={comment.author_id === user?.id || role === 'admin' || role === 'sub_admin'}
                    canReport={MEMBER_REPORTING_FEATURE_ENABLED && comment.author_id !== user?.id}
                    onReply={() => startReply(comment)}
                    onEdit={() => startEdit(comment)}
                    onDelete={() => void removeComment(comment)}
                    onReport={() => reportComment(comment)}
                    onReaction={emoji => toggleCommentReaction(comment.id, emoji)}
                    onOpenProfile={() => setProfileUser(comment.author ?? null)}
                    currentUserId={user?.id}
                    scrollContainerRef={commentsScrollRef}
                  />
                  {(repliesByParent.get(comment.id) ?? []).map(reply => (
                    <CommentCard
                      key={reply.id}
                      comment={reply}
                      reply
                      highlighted={reply.id === initialCommentId}
                      canEdit={reply.author_id === user?.id}
                      canDelete={reply.author_id === user?.id || role === 'admin' || role === 'sub_admin'}
                      canReport={MEMBER_REPORTING_FEATURE_ENABLED && reply.author_id !== user?.id}
                      onReply={() => startReply(comment)}
                      onEdit={() => startEdit(reply)}
                      onDelete={() => void removeComment(reply)}
                      onReport={() => reportComment(reply)}
                      onReaction={emoji => toggleCommentReaction(reply.id, emoji)}
                      onOpenProfile={() => setProfileUser(reply.author ?? null)}
                      currentUserId={user?.id}
                      scrollContainerRef={commentsScrollRef}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--border-subtle)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-4">
          {(replyTo || editing) && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs text-[var(--text-muted)]">
              <span className="truncate">{editing ? 'Editing your comment' : `Replying to ${authorLabel(replyTo!)}`}</span>
              <button type="button" onClick={() => { setReplyTo(null); setEditing(null); setBody('') }} className="min-h-11 rounded-full px-3 text-[var(--text-gold)]">Cancel</button>
            </div>
          )}
          {error && comments.length > 0 && <p className="mb-2 text-sm text-red-200" role="alert" aria-live="assertive">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              ref={composerRef}
              value={body}
              onChange={event => setBody(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  void submit()
                }
              }}
              maxLength={1000}
              rows={2}
              className="obsidian-input min-h-11 flex-1 resize-none rounded-[var(--radius-md)] px-3 py-2.5 text-base"
              placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
              aria-label={replyTo ? `Reply to ${authorLabel(replyTo)}` : 'Add a ShadowPin comment'}
              aria-describedby="shadow-pin-comment-composer-help"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!body.trim() || saving}
              className="theme-floating-action inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full disabled:cursor-not-allowed disabled:opacity-45"
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

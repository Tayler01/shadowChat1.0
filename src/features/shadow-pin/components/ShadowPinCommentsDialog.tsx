import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Edit3, Flag, Loader2, MessageSquare, Reply, Send, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../../../components/ui/Avatar'
import { Button } from '../../../components/ui/Button'
import { useAdminAccess } from '../../../hooks/useAdminAccess'
import { useAuth } from '../../../hooks/useAuth'
import { useDialogAccessibility } from '../../../hooks/useDialogAccessibility'
import {
  createShadowPinComment,
  deleteShadowPinComment,
  fetchShadowPinComments,
  updateShadowPinComment,
} from '../api/shadowPinApi'
import type { ShadowPinCommentCursor } from '../api/shadowPinApi'
import type { ShadowPinComment, ShadowPinImage } from '../types'
import { useModerationReport } from '../../moderation/useModerationReport'
import { MEMBER_REPORTING_FEATURE_ENABLED } from '../../../config/featureFlags'

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
  highlighted?: boolean
}) {
  return (
    <article
      id={`shadow-pin-comment-${comment.id}`}
      tabIndex={-1}
      className={`${reply ? 'ml-8 border-l border-[var(--border-subtle)] pl-3' : ''} rounded-[var(--radius-md)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-accent)]`}
    >
      <div className={`rounded-[var(--radius-md)] border p-3 transition-[background-color,border-color,box-shadow] ${highlighted ? 'border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] shadow-[var(--shadow-accent-soft)]' : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)]'}`}>
        <div className="flex items-start gap-2.5">
          <Avatar src={comment.author?.avatar_url} alt={authorLabel(comment)} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{authorLabel(comment)}</p>
              <time className="text-[0.68rem] text-[var(--text-muted)]" dateTime={comment.created_at}>
                {formatCommentDate(comment.created_at)}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-secondary)]">{comment.body}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={onReply}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.055)] hover:text-[var(--text-primary)]"
              >
                <Reply className="h-3.5 w-3.5" /> Reply
              </button>
              {canReport && (
                <button
                  type="button"
                  onClick={onReport}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.055)] hover:text-[var(--text-primary)]"
                >
                  <Flag className="h-3.5 w-3.5" /> Report
                </button>
              )}
              {(canEdit || canDelete) && (
                <>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={onEdit}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.055)] hover:text-[var(--text-primary)]"
                    >
                      <Edit3 className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={onDelete}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-red-300/80 hover:bg-red-950/30 hover:text-red-200"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
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
  const [olderCursor, setOlderCursor] = useState<ShadowPinCommentCursor | null>(null)
  const [hasOlder, setHasOlder] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const canonicalCountRef = useRef(Math.max(0, image.comment_count ?? 0))
  const dialogRef = useDialogAccessibility({ open, onClose, initialFocusRef: closeRef })

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

  if (!open) return null

  const pinPreviewUrl = image.thumbnail_url || image.medium_url || image.image_url
  const pinCreator = image.creator?.display_name || image.creator?.username || 'ShadowChat member'

  return createPortal(
    <div className="fixed inset-x-0 top-0 z-[110] flex h-[var(--shadowchat-visual-viewport-height,100dvh)] items-end justify-center bg-black/48 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shadow-pin-comments-title"
        className="popup-surface flex h-[min(calc(var(--shadowchat-visual-viewport-height,100dvh)-env(safe-area-inset-top)-0.5rem),48rem)] w-full flex-col rounded-t-[var(--radius-xl)] border border-[var(--border-panel)] sm:max-w-2xl sm:rounded-[var(--radius-xl)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
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

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border-subtle)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:p-4">
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
    </div>,
    document.body
  )
}

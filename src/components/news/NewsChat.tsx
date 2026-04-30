import React, { useEffect, useRef, useState } from 'react'
import { Check, Copy, Edit3, Send, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { MessageRichText } from '../chat/MessageRichText'
import { NewsReactionBar } from './NewsReactionBar'
import { useAuth } from '../../hooks/useAuth'
import { useNewsChat } from '../../hooks/useNewsChat'
import { formatTime } from '../../lib/utils'
import type { NewsChatMessage } from '../../lib/supabase'

function NewsChatRow({
  message,
  onEdit,
  onDelete,
  onReact,
}: {
  message: NewsChatMessage
  onEdit: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReact: (id: string, emoji: string) => Promise<void>
}) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const isOwner = profile?.id === message.user_id

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content)
      toast.success('Message copied')
    } catch {
      toast.error('Failed to copy message')
    }
  }

  const saveEdit = async () => {
    await onEdit(message.id, draft)
    setEditing(false)
  }

  return (
    <div className="group grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3 md:px-5">
      <Avatar
        src={message.user?.avatar_url}
        alt={message.user?.display_name || 'News user'}
        size="md"
        color={message.user?.color}
      />
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-baseline gap-2">
          <span className="font-semibold text-[var(--text-primary)]">
            {message.user?.display_name || message.user?.username || 'Unknown'}
          </span>
          <span className="text-xs text-[var(--text-muted)]">{formatTime(message.created_at)}</span>
          {message.edited_at && <span className="text-xs text-[var(--text-muted)]">(edited)</span>}
        </div>

        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              className="obsidian-input min-h-20 w-full resize-none rounded-[var(--radius-md)] p-3 text-sm"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={() => void saveEdit()} disabled={!draft.trim()}>
                <Check className="mr-2 h-4 w-4" />
                Save
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="inline-block max-w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] shadow-[var(--shadow-panel)]">
            <MessageRichText content={message.content} />
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NewsReactionBar
            reactions={message.reactions}
            onReact={emoji => onReact(message.id, emoji)}
            variant="menu"
          />
          <button
            type="button"
            onClick={() => void copyMessage()}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-transparent px-2 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
            aria-label="Copy news chat message"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(message.content)
                  setEditing(true)
                }}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-transparent px-2 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
              >
                <Edit3 className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => void onDelete(message.id)}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-transparent px-2 text-xs text-red-200/80 transition-colors hover:border-[rgba(190,52,85,0.35)] hover:text-red-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function NewsChat() {
  const {
    messages,
    loading,
    sending,
    error,
    sendMessage,
    editMessage,
    deleteMessage,
    toggleReaction,
  } = useNewsChat()
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top: container.scrollHeight })
      return
    }

    container.scrollTop = container.scrollHeight
  }, [messages.length])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!draft.trim() || sending) return

    try {
      await sendMessage(draft)
      setDraft('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send news message')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--border-panel)] px-4 py-3 md:px-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--text-primary)]">News Chat</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">Text and links only.</p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center p-8">
            <LoadingSpinner size="lg" className="text-[var(--text-gold)]" />
          </div>
        ) : error ? (
          <div className="m-4 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-4 text-sm text-red-100">
            {error}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
            No news chat messages yet.
          </div>
        ) : (
          <div className="py-2">
            {messages.map(message => (
              <NewsChatRow
                key={message.id}
                message={message}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onReact={toggleReaction}
              />
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(16,18,19,0.94),rgba(10,11,12,0.98))] p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder="Drop a link or news note"
            rows={1}
            className="obsidian-input max-h-28 min-h-11 flex-1 resize-none rounded-[var(--radius-md)] px-3.5 py-3 text-sm text-[var(--text-primary)]"
          />
          <Button
            type="submit"
            disabled={!draft.trim() || sending}
            loading={sending}
            className="h-11 w-11 rounded-xl p-0"
            aria-label="Send news chat message"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
      </form>
    </div>
  )
}

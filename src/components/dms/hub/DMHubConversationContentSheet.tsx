import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  Mic,
  RefreshCw,
  Search,
  Video,
  X,
} from 'lucide-react'
import {
  listDMSharedContent,
  searchDMConversationMessages,
  type DMRetrievalCursor,
  type DMRetrievedMessage,
  type DMSharedContentFilter,
  type DMSharedContentItem,
} from '../../../lib/dmConversationRetrieval'
import { cn } from '../../../lib/utils'
import { DMHubBottomSheet } from './DMHubBottomSheet'

export type DMHubConversationContentPanel = 'search' | 'shared'

type DMHubConversationContentSheetProps = {
  open: boolean
  panel: DMHubConversationContentPanel
  conversationId: string
  conversationLabel: string
  onClose: () => void
  onSelectMessage: (messageId: string) => void
  debounceMs?: number
  pageSize?: number
}

const sharedFilters: Array<{ id: DMSharedContentFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'media', label: 'Media' },
  { id: 'files', label: 'Files' },
  { id: 'links', label: 'Links' },
]

const getSenderLabel = (message: DMRetrievedMessage) => {
  const sender = message.sender as {
    display_name?: string | null
    displayName?: string | null
    username?: string | null
  } | null
  return sender?.displayName || sender?.display_name || sender?.username || 'Unknown member'
}

const formatResultTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const getMessageTypeLabel = (messageType: string) => {
  switch (messageType) {
    case 'image': return 'Photo'
    case 'video': return 'Video'
    case 'audio': return 'Voice message'
    case 'file': return 'File'
    default: return 'Message'
  }
}

const getResultSnippet = (message: DMRetrievedMessage) => (
  message.content?.trim() || getMessageTypeLabel(message.messageType)
)

const getSharedIcon = (item: DMSharedContentItem) => {
  if (item.contentKind === 'links') return Link2
  if (item.contentKind === 'files') return FileText
  if (item.messageType === 'video') return Video
  if (item.messageType === 'audio') return Mic
  return ImageIcon
}

const getSharedLabel = (item: DMSharedContentItem) => {
  if (item.contentKind === 'links') return item.content?.trim() || 'Shared link'
  if (item.contentKind === 'files') return item.content?.trim() || 'Shared file'
  return getMessageTypeLabel(item.messageType)
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--text-muted)]" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

function EmptyState({ icon: Icon, title, copy }: {
  icon: typeof Search
  title: string
  copy: string
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] px-5 py-8 text-center">
      <Icon className="mb-3 h-8 w-8 text-[var(--text-muted)]" aria-hidden="true" />
      <p className="font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-5 text-[var(--text-muted)]">{copy}</p>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-[var(--radius-lg)] border border-[rgba(190,52,85,0.3)] bg-[rgba(132,24,45,0.08)] px-4 py-5 text-center">
      <p className="font-semibold text-red-100">Unable to load this conversation</p>
      <p className="mt-1 text-sm leading-5 text-red-200/80">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[rgba(235,99,133,0.38)] px-4 py-2 text-sm font-semibold text-red-100 transition-colors hover:bg-[rgba(190,52,85,0.14)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </button>
    </div>
  )
}

function LoadMoreButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading}
      className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)] disabled:cursor-wait disabled:opacity-60"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {loading ? 'Loading more' : 'Load more'}
    </button>
  )
}

export function DMHubConversationContentSheet({
  open,
  panel,
  conversationId,
  conversationLabel,
  onClose,
  onSelectMessage,
  debounceMs = 300,
  pageSize = 30,
}: DMHubConversationContentSheetProps) {
  const searchInputId = useId()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchRequestRef = useRef(0)
  const sharedRequestRef = useRef(0)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchItems, setSearchItems] = useState<DMRetrievedMessage[]>([])
  const [searchCursor, setSearchCursor] = useState<DMRetrievalCursor | null>(null)
  const [searchHasMore, setSearchHasMore] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchLoadingMore, setSearchLoadingMore] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchRetryToken, setSearchRetryToken] = useState(0)
  const [sharedFilter, setSharedFilter] = useState<DMSharedContentFilter>('all')
  const [sharedItems, setSharedItems] = useState<DMSharedContentItem[]>([])
  const [sharedCursor, setSharedCursor] = useState<DMRetrievalCursor | null>(null)
  const [sharedHasMore, setSharedHasMore] = useState(false)
  const [sharedLoading, setSharedLoading] = useState(false)
  const [sharedLoadingMore, setSharedLoadingMore] = useState(false)
  const [sharedError, setSharedError] = useState<string | null>(null)
  const [sharedRetryToken, setSharedRetryToken] = useState(0)

  useEffect(() => {
    const normalized = query.trim().slice(0, 200)
    const timer = window.setTimeout(() => setDebouncedQuery(normalized), debounceMs)
    return () => window.clearTimeout(timer)
  }, [debounceMs, query])

  useEffect(() => {
    if (!open || panel !== 'search') return
    let focusFrame = 0
    const settleFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }))
    })
    return () => {
      window.cancelAnimationFrame(settleFrame)
      if (focusFrame) window.cancelAnimationFrame(focusFrame)
    }
  }, [open, panel])

  useEffect(() => {
    setQuery('')
    setDebouncedQuery('')
    setSearchItems([])
    setSearchCursor(null)
    setSearchHasMore(false)
    setSearchError(null)
    setSharedFilter('all')
    setSharedItems([])
    setSharedCursor(null)
    setSharedHasMore(false)
    setSharedError(null)
  }, [conversationId])

  useEffect(() => {
    const requestId = ++searchRequestRef.current
    setSearchLoadingMore(false)
    if (!open || panel !== 'search') {
      setSearchLoading(false)
      return
    }
    if (debouncedQuery.length < 2) {
      setSearchItems([])
      setSearchCursor(null)
      setSearchHasMore(false)
      setSearchError(null)
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    setSearchError(null)
    void searchDMConversationMessages(conversationId, debouncedQuery, { limit: pageSize })
      .then(page => {
        if (requestId !== searchRequestRef.current) return
        setSearchItems(page.items)
        setSearchCursor(page.nextCursor)
        setSearchHasMore(page.hasMore)
      })
      .catch(error => {
        if (requestId !== searchRequestRef.current) return
        setSearchItems([])
        setSearchCursor(null)
        setSearchHasMore(false)
        setSearchError(error instanceof Error ? error.message : 'Search failed. Please try again.')
      })
      .finally(() => {
        if (requestId === searchRequestRef.current) setSearchLoading(false)
      })
  }, [conversationId, debouncedQuery, open, pageSize, panel, searchRetryToken])

  useEffect(() => {
    const requestId = ++sharedRequestRef.current
    setSharedLoadingMore(false)
    if (!open || panel !== 'shared') {
      setSharedLoading(false)
      return
    }

    setSharedLoading(true)
    setSharedError(null)
    void listDMSharedContent(conversationId, { filter: sharedFilter, limit: pageSize })
      .then(page => {
        if (requestId !== sharedRequestRef.current) return
        setSharedItems(page.items)
        setSharedCursor(page.nextCursor)
        setSharedHasMore(page.hasMore)
      })
      .catch(error => {
        if (requestId !== sharedRequestRef.current) return
        setSharedItems([])
        setSharedCursor(null)
        setSharedHasMore(false)
        setSharedError(error instanceof Error ? error.message : 'Shared content failed to load. Please try again.')
      })
      .finally(() => {
        if (requestId === sharedRequestRef.current) setSharedLoading(false)
      })
  }, [conversationId, open, pageSize, panel, sharedFilter, sharedRetryToken])

  const loadMoreSearch = useCallback(async () => {
    if (!searchCursor || searchLoadingMore || !searchHasMore) return
    const requestId = searchRequestRef.current
    setSearchLoadingMore(true)
    setSearchError(null)
    try {
      const page = await searchDMConversationMessages(conversationId, debouncedQuery, {
        limit: pageSize,
        cursor: searchCursor,
      })
      if (requestId !== searchRequestRef.current) return
      setSearchItems(current => {
        const existing = new Set(current.map(item => item.id))
        return [...current, ...page.items.filter(item => !existing.has(item.id))]
      })
      setSearchCursor(page.nextCursor)
      setSearchHasMore(page.hasMore)
    } catch (error) {
      if (requestId !== searchRequestRef.current) return
      setSearchError(error instanceof Error ? error.message : 'More results failed to load. Please try again.')
    } finally {
      if (requestId === searchRequestRef.current) setSearchLoadingMore(false)
    }
  }, [conversationId, debouncedQuery, pageSize, searchCursor, searchHasMore, searchLoadingMore])

  const loadMoreShared = useCallback(async () => {
    if (!sharedCursor || sharedLoadingMore || !sharedHasMore) return
    const requestId = sharedRequestRef.current
    setSharedLoadingMore(true)
    setSharedError(null)
    try {
      const page = await listDMSharedContent(conversationId, {
        filter: sharedFilter,
        limit: pageSize,
        cursor: sharedCursor,
      })
      if (requestId !== sharedRequestRef.current) return
      setSharedItems(current => {
        const existing = new Set(current.map(item => item.id))
        return [...current, ...page.items.filter(item => !existing.has(item.id))]
      })
      setSharedCursor(page.nextCursor)
      setSharedHasMore(page.hasMore)
    } catch (error) {
      if (requestId !== sharedRequestRef.current) return
      setSharedError(error instanceof Error ? error.message : 'More shared content failed to load. Please try again.')
    } finally {
      if (requestId === sharedRequestRef.current) setSharedLoadingMore(false)
    }
  }, [conversationId, pageSize, sharedCursor, sharedFilter, sharedHasMore, sharedLoadingMore])

  const title = panel === 'search' ? 'Search conversation' : 'Shared content'
  const description = panel === 'search'
    ? `Find messages exchanged with ${conversationLabel}.`
    : `Media, files, and links shared with ${conversationLabel}.`
  const normalizedLiveQuery = query.trim().slice(0, 200)
  const searchDebouncing = normalizedLiveQuery !== debouncedQuery
  const searchStatus = useMemo(() => {
    if (normalizedLiveQuery.length < 2) return 'Enter at least two characters to search this conversation.'
    if (searchLoading || searchDebouncing) return 'Searching conversation.'
    if (searchError) return 'Conversation search failed.'
    return `${searchItems.length} search ${searchItems.length === 1 ? 'result' : 'results'} loaded.`
  }, [normalizedLiveQuery.length, searchDebouncing, searchError, searchItems.length, searchLoading])

  const selectMessage = (messageId: string) => {
    onSelectMessage(messageId)
  }

  return (
    <DMHubBottomSheet
      open={open}
      onClose={onClose}
      title={title}
      eyebrow="Direct message"
      description={description}
      testId="dm-hub-conversation-content"
      className="sm:max-w-2xl"
    >
      {panel === 'search' ? (
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
            <label htmlFor={searchInputId} className="sr-only">Search messages in this conversation</label>
            <input
              ref={searchInputRef}
              id={searchInputId}
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search this conversation"
              autoComplete="off"
              maxLength={200}
              className="obsidian-input h-12 w-full rounded-2xl pl-11 pr-12 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear conversation search"
                className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-focus-ring)]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="sr-only" aria-live="polite">{searchStatus}</p>

          <div className="mt-3">
            {normalizedLiveQuery.length < 2 ? (
              <EmptyState icon={Search} title="Search this conversation" copy="Enter at least two characters to find an exact message." />
            ) : searchLoading || searchDebouncing ? (
              <LoadingState label="Searching messages" />
            ) : searchError ? (
              <ErrorState message={searchError} onRetry={() => setSearchRetryToken(value => value + 1)} />
            ) : searchItems.length === 0 ? (
              <EmptyState icon={MessageSquare} title="No matching messages" copy={`Nothing in this conversation matched “${debouncedQuery}”.`} />
            ) : (
              <>
                <div className="space-y-2" aria-label="Conversation search results">
                  {searchItems.map(item => {
                    const sender = getSenderLabel(item)
                    const time = formatResultTime(item.createdAt)
                    const typeLabel = getMessageTypeLabel(item.messageType)
                    const snippet = getResultSnippet(item)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectMessage(item.id)}
                        aria-label={`${sender}, ${typeLabel}${time ? `, ${time}` : ''}. ${snippet}`}
                        className="flex min-h-12 w-full items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] px-3 py-3 text-left transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                      >
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgba(var(--theme-accent-rgb),0.1)] text-[var(--theme-accent-readable)]" aria-hidden="true">
                          <MessageSquare className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
                            <span className="truncate font-semibold text-[var(--text-secondary)]">{sender}</span>
                            {time && <time dateTime={item.createdAt} className="shrink-0">{time}</time>}
                          </span>
                          <span className="mt-1 line-clamp-2 block text-sm leading-5 text-[var(--text-primary)]">{snippet}</span>
                          <span className="mt-1 block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-gold)]">{typeLabel}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {searchHasMore && <LoadMoreButton loading={searchLoadingMore} onClick={() => void loadMoreSearch()} />}
              </>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-4 gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] p-1" role="group" aria-label="Shared content filter">
            {sharedFilters.map(filter => {
              const selected = sharedFilter === filter.id
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setSharedFilter(filter.id)}
                  aria-pressed={selected}
                  className={cn(
                    'inline-flex min-h-12 min-w-0 items-center justify-center rounded-xl px-1.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]',
                    selected
                      ? 'border border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]'
                      : 'border border-transparent text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]'
                  )}
                >
                  <span className="truncate">{filter.label}</span>
                </button>
              )
            })}
          </div>
          <p className="sr-only" aria-live="polite">
            {sharedLoading ? 'Loading shared content.' : `${sharedItems.length} shared items loaded.`}
          </p>

          <div className="mt-3">
            {sharedLoading ? (
              <LoadingState label="Loading shared content" />
            ) : sharedError ? (
              <ErrorState message={sharedError} onRetry={() => setSharedRetryToken(value => value + 1)} />
            ) : sharedItems.length === 0 ? (
              <EmptyState icon={ImageIcon} title="Nothing shared here yet" copy={`No ${sharedFilter === 'all' ? 'media, files, or links' : sharedFilter} are available in this conversation.`} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2" aria-label="Shared conversation content">
                  {sharedItems.map(item => {
                    const Icon = getSharedIcon(item)
                    const label = getSharedLabel(item)
                    const sender = getSenderLabel(item)
                    const time = formatResultTime(item.createdAt)
                    const previewUrl = item.thumbnailUrl || (item.messageType === 'image' ? item.fileUrl : null)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectMessage(item.id)}
                        aria-label={`${label}, shared by ${sender}${time ? `, ${time}` : ''}`}
                        className="min-h-12 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] text-left transition-colors hover:border-[var(--border-glow)] hover:bg-[var(--theme-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]"
                      >
                        {previewUrl ? (
                          <img src={previewUrl} alt="" loading="lazy" decoding="async" className="aspect-square w-full object-cover" />
                        ) : (
                          <span className="flex aspect-square w-full items-center justify-center bg-[rgba(var(--theme-accent-rgb),0.06)] text-[var(--theme-accent-readable)]" aria-hidden="true">
                            <Icon className="h-7 w-7" />
                          </span>
                        )}
                        <span className="block px-3 py-2.5">
                          <span className="line-clamp-2 block text-sm font-semibold leading-5 text-[var(--text-primary)]">{label}</span>
                          <span className="mt-1 flex items-center justify-between gap-2 text-[0.65rem] text-[var(--text-muted)]">
                            <span className="truncate">{sender}</span>
                            {time && <time dateTime={item.createdAt} className="shrink-0">{time}</time>}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
                {sharedHasMore && <LoadMoreButton loading={sharedLoadingMore} onClick={() => void loadMoreShared()} />}
              </>
            )}
          </div>
        </div>
      )}
    </DMHubBottomSheet>
  )
}

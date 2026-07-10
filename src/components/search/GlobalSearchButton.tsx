import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bookmark,
  BookmarkCheck,
  FolderPlus,
  Loader2,
  MessageCircle,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility'
import {
  createMessageCollection,
  deleteMessageCollection,
  listMessageCollections,
  listSavedMessages,
  removeMessageFromLibrary,
  saveMessageToLibrary,
  searchMessageLibrary,
  type MessageCollection,
  type MessageLibraryItem,
} from '../../lib/messageLibrary'

type LibraryTab = 'search' | 'saved'

const authorLabel = (item: MessageLibraryItem) => {
  const displayName = typeof item.author.display_name === 'string' ? item.author.display_name : ''
  const username = typeof item.author.username === 'string' ? item.author.username : ''
  return displayName || (username ? `@${username}` : 'ShadowChat member')
}

const formatMessageDate = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const openMessageLocation = (item: MessageLibraryItem) => {
  const url = new URL(window.location.href)
  url.searchParams.set('view', item.source === 'dm' ? 'dms' : 'chat')
  url.searchParams.set('message', item.messageId)
  if (item.source === 'dm' && item.conversationId) {
    url.searchParams.set('conversation', item.conversationId)
  } else {
    url.searchParams.delete('conversation')
  }
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function MessageLibraryCard({
  item,
  collections,
  preferredCollectionId,
  saving,
  onSave,
  onRemove,
  onOpen,
}: {
  item: MessageLibraryItem
  collections: MessageCollection[]
  preferredCollectionId: string
  saving: boolean
  onSave: (collectionId: string | null) => void
  onRemove: () => void
  onOpen: () => void
}) {
  const [collectionId, setCollectionId] = useState(item.collectionId ?? preferredCollectionId)

  useEffect(() => {
    setCollectionId(item.collectionId ?? preferredCollectionId)
  }, [item.collectionId, preferredCollectionId])

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] p-3">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-center justify-between gap-3 text-[0.68rem] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <span>{item.source === 'dm' ? 'Direct message' : 'General Chat'}</span>
          <span>{formatMessageDate(item.messageCreatedAt)}</span>
        </div>
        <p className="mt-2 text-xs font-semibold text-[var(--theme-accent-readable)]">{authorLabel(item)}</p>
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-primary)]">
          {item.content || (item.fileUrl ? `${item.messageType} attachment` : 'Empty message')}
        </p>
        {item.note && <p className="mt-2 text-xs italic text-[var(--text-muted)]">Note: {item.note}</p>}
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
        <select
          value={collectionId}
          onChange={event => setCollectionId(event.target.value)}
          className="obsidian-input min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] px-3 text-sm"
          aria-label={`Collection for message from ${authorLabel(item)}`}
        >
          <option value="">No collection</option>
          {collections.map(collection => (
            <option key={collection.id} value={collection.id}>{collection.name}</option>
          ))}
        </select>
        <button
          type="button"
          disabled={saving}
          onClick={() => item.isSaved ? onRemove() : onSave(collectionId || null)}
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-3 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--text-gold)] disabled:opacity-50"
        >
          {item.isSaved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          {item.isSaved ? 'Remove' : 'Save'}
        </button>
        {item.isSaved && collectionId !== (item.collectionId ?? '') && (
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave(collectionId || null)}
            className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-[var(--border-glow)] px-3 text-sm font-medium text-[var(--text-gold)] disabled:opacity-50"
          >
            Move
          </button>
        )}
      </div>
    </article>
  )
}

export function GlobalSearchButton() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<LibraryTab>('search')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<MessageLibraryItem[]>([])
  const [collections, setCollections] = useState<MessageCollection[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState('')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dialogRef = useDialogAccessibility({
    open,
    onClose: () => setOpen(false),
    initialFocusRef: tab === 'search' ? searchRef : closeRef,
  })

  const refreshCollections = useCallback(async () => {
    const nextCollections = await listMessageCollections()
    setCollections(nextCollections)
    setSelectedCollectionId(previous => (
      previous && nextCollections.some(collection => collection.id === previous) ? previous : ''
    ))
  }, [])

  const refreshSaved = useCallback(async (collectionId = selectedCollectionId) => {
    setLoading(true)
    setError(null)
    try {
      setItems(await listSavedMessages(collectionId || null))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load saved messages.')
    } finally {
      setLoading(false)
    }
  }, [selectedCollectionId])

  useEffect(() => {
    if (!open) return
    void refreshCollections().catch(loadError => {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load collections.')
    })
  }, [open, refreshCollections])

  useEffect(() => {
    if (!open || tab !== 'saved') return
    void refreshSaved(selectedCollectionId)
  }, [open, refreshSaved, selectedCollectionId, tab])

  useEffect(() => {
    if (!open || tab !== 'search') return
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)
      void searchMessageLibrary(normalizedQuery)
        .then(results => {
          if (!cancelled) setItems(results)
        })
        .catch(searchError => {
          if (!cancelled) setError(searchError instanceof Error ? searchError.message : 'Search failed.')
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, query, tab])

  const createCollection = async () => {
    const name = newCollectionName.trim()
    if (!name) return
    setSavingId('new-collection')
    try {
      const created = await createMessageCollection({ name })
      setNewCollectionName('')
      await refreshCollections()
      setSelectedCollectionId(created.id)
      toast.success('Collection created')
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Unable to create collection')
    } finally {
      setSavingId(null)
    }
  }

  const deleteSelectedCollection = async () => {
    if (!selectedCollectionId) return
    const collection = collections.find(item => item.id === selectedCollectionId)
    if (!window.confirm(`Delete ${collection?.name ?? 'this collection'}? Saved messages will stay in All Saved.`)) return
    setSavingId('delete-collection')
    try {
      await deleteMessageCollection(selectedCollectionId)
      setSelectedCollectionId('')
      await refreshCollections()
      if (tab === 'saved') await refreshSaved('')
      toast.success('Collection deleted')
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : 'Unable to delete collection')
    } finally {
      setSavingId(null)
    }
  }

  const saveItem = async (item: MessageLibraryItem, collectionId: string | null) => {
    setSavingId(item.messageId)
    try {
      await saveMessageToLibrary({ source: item.source, messageId: item.messageId, collectionId })
      if (tab === 'search') {
        setItems(previous => previous.map(candidate => candidate.messageId === item.messageId
          ? { ...candidate, isSaved: true, collectionId }
          : candidate))
      } else {
        await refreshSaved(selectedCollectionId)
      }
      toast.success(item.isSaved ? 'Saved message moved' : 'Message saved')
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Unable to save message')
    } finally {
      setSavingId(null)
    }
  }

  const removeItem = async (item: MessageLibraryItem) => {
    setSavingId(item.messageId)
    try {
      await removeMessageFromLibrary(item.source, item.messageId)
      if (tab === 'search') {
        setItems(previous => previous.map(candidate => candidate.messageId === item.messageId
          ? { ...candidate, isSaved: false, collectionId: null }
          : candidate))
      } else {
        setItems(previous => previous.filter(candidate => candidate.messageId !== item.messageId))
      }
      toast.success('Removed from saved messages')
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : 'Unable to remove saved message')
    } finally {
      setSavingId(null)
    }
  }

  const modal = open ? (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[var(--bg-overlay)] backdrop-blur-md sm:items-center sm:px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="message-library-title"
        className="popup-surface flex h-[min(92dvh,52rem)] w-full flex-col rounded-t-[var(--radius-xl)] border border-[var(--border-panel)] sm:max-w-2xl sm:rounded-[var(--radius-xl)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-4">
          <div>
            <p className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--text-muted)]">Private library</p>
            <h2 id="message-library-title" className="mt-1 text-xl font-semibold text-[var(--text-primary)]">Search and saved messages</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--text-primary)]"
            aria-label="Close search and saved messages"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-[var(--border-subtle)] px-4 pt-3">
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Message library sections">
            {(['search', 'saved'] as const).map(section => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={tab === section}
                onClick={() => setTab(section)}
                className={`min-h-11 rounded-t-[var(--radius-sm)] border-b-2 px-3 text-sm font-semibold capitalize ${
                  tab === section
                    ? 'border-[var(--text-gold)] text-[var(--text-gold)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                {section === 'saved' ? 'Saved' : 'Search'}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-b border-[var(--border-subtle)] p-4">
          {tab === 'search' && (
            <label className="relative block">
              <span className="sr-only">Search all messages</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="obsidian-input min-h-11 w-full rounded-[var(--radius-md)] pl-10 pr-3 text-base"
                placeholder="Search General Chat and your DMs"
                maxLength={200}
              />
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <select
              value={selectedCollectionId}
              onChange={event => setSelectedCollectionId(event.target.value)}
              className="obsidian-input min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] px-3 text-sm"
              aria-label={tab === 'saved' ? 'Filter saved messages by collection' : 'Preferred save collection'}
            >
              <option value="">{tab === 'saved' ? 'All saved messages' : 'Save without collection'}</option>
              {collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </select>
            {selectedCollectionId && (
              <button
                type="button"
                onClick={() => void deleteSelectedCollection()}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-red-100 hover:bg-red-950/30"
                aria-label="Delete selected collection"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={newCollectionName}
              onChange={event => setNewCollectionName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void createCollection()
                }
              }}
              className="obsidian-input min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] px-3 text-sm"
              placeholder="New collection name"
              maxLength={60}
              aria-label="New collection name"
            />
            <button
              type="button"
              disabled={!newCollectionName.trim() || savingId === 'new-collection'}
              onClick={() => void createCollection()}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-glow)] px-3 text-sm font-medium text-[var(--text-gold)] disabled:opacity-50"
            >
              <FolderPlus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages
            </div>
          ) : error ? (
            <div className="rounded-[var(--radius-md)] border border-red-400/25 bg-red-950/20 p-4 text-sm text-red-100">{error}</div>
          ) : items.length ? (
            <div className="grid gap-3">
              {items.map(item => (
                <MessageLibraryCard
                  key={`${item.source}:${item.messageId}`}
                  item={item}
                  collections={collections}
                  preferredCollectionId={selectedCollectionId}
                  saving={savingId === item.messageId}
                  onSave={collectionId => void saveItem(item, collectionId)}
                  onRemove={() => void removeItem(item)}
                  onOpen={() => {
                    openMessageLocation(item)
                    setOpen(false)
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-40 flex-col items-center justify-center text-center text-[var(--text-muted)]">
              <MessageCircle className="h-8 w-8" />
              <p className="mt-3 text-sm">{tab === 'search' && !query.trim() ? 'Search across General Chat and DMs.' : tab === 'saved' ? 'No saved messages here yet.' : 'No matching messages found.'}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)] transition-colors hover:border-[rgba(215,170,70,0.28)] hover:bg-[rgba(215,170,70,0.08)] hover:text-[var(--theme-accent-readable)]"
        aria-label="Open search and saved messages"
      >
        <Search className="h-4 w-4" />
      </button>
      {modal && (typeof document === 'undefined' ? modal : createPortal(modal, document.body))}
    </>
  )
}

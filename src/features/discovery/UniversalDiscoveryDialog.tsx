import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bookmark,
  BookmarkCheck,
  FolderPlus,
  Gamepad2,
  Image as ImageIcon,
  Loader2,
  Search,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { User } from '../../lib/supabase'
import type { AppView } from '../../types/navigation'
import { MobileAppHeader } from '../../components/layout/MobileAppHeader'
import {
  createMessageCollection,
  deleteMessageCollection,
  listSavedDiscoveryItems,
  listMessageCollections,
  listSavedMessages,
  moveDiscoveryItemToCollection,
  removeDiscoveryItemFromLibrary,
  removeMessageFromLibrary,
  saveDiscoveryItemToLibrary,
  saveMessageToLibrary,
  type DiscoveryLibraryTargetKind,
  type MessageCollection,
  type MessageLibraryItem,
  type SavedDiscoveryItem,
} from '../../lib/messageLibrary'
import { Avatar } from '../../components/ui/Avatar'
import { searchUniversalDiscovery } from './discoveryApi'
import {
  createEmptyDiscoveryGroups,
  toDiscoveryProfileUser,
  type DiscoveryProvider,
  type DiscoveryScope,
  type DiscoverySearchResponse,
  type PlayDiscoveryEntry,
} from './discoveryModel'
import type { ShadowPinImage } from '../shadow-pin/types'

const PublicProfileDialog = lazy(() => import('../../components/profile/PublicProfileDialog').then(module => ({
  default: module.PublicProfileDialog,
})))

const DISCOVERY_SCOPES: readonly DiscoveryScope[] = ['all', 'messages', 'people', 'pins', 'play', 'library']
const DISCOVERY_QUERY_PARAM = 'q'
const DISCOVERY_SCOPE_PARAM = 'scope'

const clearDiscoveryRouteState = (url: URL) => {
  url.searchParams.delete(DISCOVERY_QUERY_PARAM)
  url.searchParams.delete(DISCOVERY_SCOPE_PARAM)
}

const authorLabel = (item: MessageLibraryItem) => {
  const displayName = typeof item.author.display_name === 'string' ? item.author.display_name : ''
  const username = typeof item.author.username === 'string' ? item.author.username : ''
  return displayName || (username ? `@${username}` : 'ShadowChat member')
}

const formatDate = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

const openUrlState = (mutate: (url: URL) => void) => {
  const url = new URL(window.location.href)
  mutate(url)
  window.history.pushState({}, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const openMessage = (item: MessageLibraryItem) => openUrlState(url => {
  clearDiscoveryRouteState(url)
  url.searchParams.set('view', item.source === 'dm' ? 'dms' : 'chat')
  url.searchParams.set('message', item.messageId)
  if (item.source === 'dm' && item.conversationId) url.searchParams.set('conversation', item.conversationId)
  else url.searchParams.delete('conversation')
})

const openPin = (pin: ShadowPinImage) => openUrlState(url => {
  clearDiscoveryRouteState(url)
  url.searchParams.set('view', 'pins')
  url.searchParams.set('pin', pin.id)
  url.searchParams.delete('message')
  url.searchParams.delete('conversation')
})

const openPlay = (item: PlayDiscoveryEntry) => openUrlState(url => {
  clearDiscoveryRouteState(url)
  url.searchParams.set('view', 'games')
  url.searchParams.set('experience', item.experience)
  if (item.item) url.searchParams.set('item', item.item)
  else url.searchParams.delete('item')
  url.searchParams.delete('message')
  url.searchParams.delete('conversation')
  url.searchParams.delete('pin')
})

function ResultSection({
  title,
  error,
  children,
}: {
  title: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--theme-accent-readable)]">{title}</h3>
      </div>
      {error ? (
        <p className="rounded-[var(--radius-md)] border border-amber-300/20 bg-amber-950/15 px-3 py-2 text-xs text-amber-100">
          {title} is temporarily unavailable. Other results are still current.
        </p>
      ) : children}
    </section>
  )
}

function MessageCard({
  item,
  saved,
  saving,
  onOpen,
  onSave,
  onRemove,
  collections,
  collectionId,
  onMove,
}: {
  item: MessageLibraryItem
  saved: boolean
  saving: boolean
  onOpen: () => void
  onSave: () => void
  onRemove: () => void
  collections?: MessageCollection[]
  collectionId?: string | null
  onMove?: (collectionId: string | null) => void
}) {
  const [nextCollectionId, setNextCollectionId] = useState(collectionId ?? '')

  useEffect(() => setNextCollectionId(collectionId ?? ''), [collectionId])

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] p-3">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-center justify-between gap-3 text-[0.68rem] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          <span>{item.source === 'dm' ? 'Direct message' : 'General Chat'}</span>
          <span>{formatDate(item.messageCreatedAt)}</span>
        </div>
        <p className="mt-2 text-xs font-semibold text-[var(--theme-accent-readable)]">{authorLabel(item)}</p>
        <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--text-primary)]">
          {item.content || (item.fileUrl ? `${item.messageType} attachment` : 'Empty message')}
        </p>
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="mt-2 h-20 w-20 rounded-[var(--radius-sm)] object-cover" loading="lazy" />}
      </button>
      <button
        type="button"
        disabled={saving}
        onClick={saved ? onRemove : onSave}
        className="mt-3 flex min-h-11 w-fit items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-3 text-sm text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--text-gold)] disabled:opacity-50"
      >
        {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        {saved ? 'Remove' : 'Save'}
      </button>
      {collections && onMove && (
        <div className="mt-3 flex gap-2 border-t border-[var(--border-subtle)] pt-3">
          <select value={nextCollectionId} onChange={event => setNextCollectionId(event.target.value)} className="obsidian-input min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] px-3 text-sm" aria-label={`Collection for message from ${authorLabel(item)}`}>
            <option value="">All Library</option>
            {collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
          </select>
          <button type="button" disabled={saving || nextCollectionId === (collectionId ?? '')} onClick={() => onMove(nextCollectionId || null)} className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-glow)] px-3 text-sm font-medium text-[var(--text-gold)] disabled:opacity-40">Move</button>
        </div>
      )}
    </article>
  )
}

function DiscoveryLibraryCard({
  item,
  collections,
  saving,
  onOpen,
  onMove,
  onRemove,
}: {
  item: SavedDiscoveryItem
  collections: MessageCollection[]
  saving: boolean
  onOpen: () => void
  onMove: (collectionId: string | null) => void
  onRemove: () => void
}) {
  const [collectionId, setCollectionId] = useState(item.collectionId ?? '')
  useEffect(() => setCollectionId(item.collectionId ?? ''), [item.collectionId])

  return (
    <article className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/[0.035] p-3">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 text-left">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-black/25 text-[var(--theme-accent-readable)]">
          {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : item.targetKind === 'shadow_pin' ? <ImageIcon className="h-5 w-5" /> : <Gamepad2 className="h-5 w-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-[0.66rem] uppercase tracking-[0.13em] text-[var(--theme-accent-readable)]">{item.targetKind === 'shadow_pin' ? 'ShadowPin' : item.targetKind === 'shado_tv_video' ? 'Shado TV' : 'Shadow Mystery'}</span>
          <span className="mt-1 block truncate font-semibold text-[var(--text-primary)]">{item.title}</span>
          {item.subtitle && <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">{item.subtitle}</span>}
        </span>
      </button>
      <div className="mt-3 flex gap-2 border-t border-[var(--border-subtle)] pt-3">
        <select value={collectionId} onChange={event => setCollectionId(event.target.value)} className="obsidian-input min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] px-3 text-sm" aria-label={`Collection for ${item.title}`}>
          <option value="">All Library</option>
          {collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
        </select>
        <button type="button" disabled={saving || collectionId === (item.collectionId ?? '')} onClick={() => onMove(collectionId || null)} className="min-h-11 rounded-[var(--radius-sm)] border border-[var(--border-glow)] px-3 text-sm font-medium text-[var(--text-gold)] disabled:opacity-40">Move</button>
        <button type="button" disabled={saving} onClick={onRemove} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-red-100 hover:bg-red-950/30 disabled:opacity-40" aria-label={`Remove ${item.title} from Library`}><Trash2 className="h-4 w-4" /></button>
      </div>
    </article>
  )
}

export function UniversalDiscoveryView({
  currentView,
  onViewChange,
}: {
  currentView: AppView
  onViewChange: (view: AppView) => void
}) {
  const [scope, setScope] = useState<DiscoveryScope>(() => {
    if (typeof window === 'undefined') return 'all'
    const value = new URL(window.location.href).searchParams.get(DISCOVERY_SCOPE_PARAM)
    return DISCOVERY_SCOPES.includes(value as DiscoveryScope) ? value as DiscoveryScope : 'all'
  })
  const [query, setQuery] = useState(() => {
    if (typeof window === 'undefined') return ''
    return new URL(window.location.href).searchParams.get(DISCOVERY_QUERY_PARAM)?.slice(0, 200) ?? ''
  })
  const [response, setResponse] = useState<DiscoverySearchResponse>({
    requestId: '',
    query: '',
    groups: createEmptyDiscoveryGroups(),
    errors: {},
  })
  const [loading, setLoading] = useState(false)
  const [collections, setCollections] = useState<MessageCollection[]>([])
  const [savedMessages, setSavedMessages] = useState<MessageLibraryItem[]>([])
  const [savedDiscoveryItems, setSavedDiscoveryItems] = useState<SavedDiscoveryItem[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState('')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [profileUser, setProfileUser] = useState<User | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef(0)

  const refreshCollections = useCallback(async () => {
    const next = await listMessageCollections()
    setCollections(next)
    setSelectedCollectionId(current => current && next.some(item => item.id === current) ? current : '')
  }, [])

  const refreshLibrary = useCallback(async (collectionId = selectedCollectionId) => {
    setLoading(true)
    setLibraryError(null)
    try {
      const [messages, discoveryItems] = await Promise.all([
        listSavedMessages(collectionId || null),
        listSavedDiscoveryItems(collectionId || null),
      ])
      setSavedMessages(messages)
      setSavedDiscoveryItems(discoveryItems)
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Unable to load your Library.')
    } finally {
      setLoading(false)
    }
  }, [selectedCollectionId])

  useEffect(() => {
    if (scope === 'library') return
    void listSavedDiscoveryItems().then(setSavedDiscoveryItems).catch(() => {
      // The Library surface reports this error when opened; discovery remains usable.
    })
  }, [scope])

  useEffect(() => {
    void refreshCollections().catch(error => {
      setLibraryError(error instanceof Error ? error.message : 'Unable to load collections.')
    })
  }, [refreshCollections])

  useEffect(() => {
    if (scope !== 'library') return
    void refreshLibrary(selectedCollectionId)
  }, [refreshLibrary, scope, selectedCollectionId])

  useEffect(() => {
    if (scope === 'library') return
    const normalized = query.trim()
    if (normalized.length < 2) {
      setResponse({ requestId: String(requestRef.current), query: normalized, groups: createEmptyDiscoveryGroups(), errors: {} })
      setLoading(false)
      return
    }

    const controller = new AbortController()
    const requestId = ++requestRef.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchUniversalDiscovery({
        query: normalized,
        scope,
        limitPerSource: scope === 'all' ? 6 : 30,
        signal: controller.signal,
        requestId: String(requestId),
      }).then(next => {
        if (!controller.signal.aborted && requestId === requestRef.current) setResponse(next)
      }).catch(error => {
        if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return
        if (requestId === requestRef.current) {
          setResponse({
            requestId: String(requestId),
            query: normalized,
            groups: createEmptyDiscoveryGroups(),
            errors: Object.fromEntries(
              (scope === 'all' ? ['messages', 'people', 'pins', 'play'] : [scope]).map(provider => [provider, {
                code: 'unavailable' as const,
                message: `${provider} search is temporarily unavailable.`,
              }])
            ),
          })
        }
      }).finally(() => {
        if (!controller.signal.aborted && requestId === requestRef.current) setLoading(false)
      })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, scope])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('view') !== 'discover') return
    if (query.trim()) url.searchParams.set(DISCOVERY_QUERY_PARAM, query.slice(0, 200))
    else url.searchParams.delete(DISCOVERY_QUERY_PARAM)
    if (scope !== 'all') url.searchParams.set(DISCOVERY_SCOPE_PARAM, scope)
    else url.searchParams.delete(DISCOVERY_SCOPE_PARAM)
    window.history.replaceState(window.history.state ?? {}, '', url)
  }, [query, scope])

  const visibleProviders = useMemo<DiscoveryProvider[]>(() => (
    scope === 'all' ? ['messages', 'people', 'pins', 'play'] : scope === 'library' ? [] : [scope]
  ), [scope])
  const resultCount = visibleProviders.reduce((total, provider) => total + response.groups[provider].length, 0)

  const closeAndOpen = (action: () => void) => {
    action()
  }

  const saveMessage = async (item: MessageLibraryItem) => {
    setSavingId(item.messageId)
    try {
      await saveMessageToLibrary({ source: item.source, messageId: item.messageId, collectionId: selectedCollectionId || null })
      setResponse(current => ({
        ...current,
        groups: {
          ...current.groups,
          messages: current.groups.messages.map(candidate => candidate.messageId === item.messageId
            ? { ...candidate, isSaved: true, collectionId: selectedCollectionId || null }
            : candidate),
        },
      }))
      toast.success('Saved to your Library')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save message')
    } finally {
      setSavingId(null)
    }
  }

  const removeMessage = async (item: MessageLibraryItem) => {
    setSavingId(item.messageId)
    try {
      await removeMessageFromLibrary(item.source, item.messageId)
      setResponse(current => ({
        ...current,
        groups: {
          ...current.groups,
          messages: current.groups.messages.map(candidate => candidate.messageId === item.messageId
            ? { ...candidate, isSaved: false, collectionId: null }
            : candidate),
        },
      }))
      setSavedMessages(current => current.filter(candidate => candidate.messageId !== item.messageId))
      toast.success('Removed from your Library')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove message')
    } finally {
      setSavingId(null)
    }
  }

  const moveMessage = async (item: MessageLibraryItem, collectionId: string | null) => {
    setSavingId(item.messageId)
    try {
      await saveMessageToLibrary({ source: item.source, messageId: item.messageId, collectionId })
      setSavedMessages(current => current.map(candidate => candidate.messageId === item.messageId ? { ...candidate, collectionId } : candidate))
      toast.success('Message moved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to move message')
    } finally {
      setSavingId(null)
    }
  }

  const saveDiscoveryTarget = async (targetKind: DiscoveryLibraryTargetKind, targetId: string) => {
    const savingKey = `${targetKind}:${targetId}`
    setSavingId(savingKey)
    try {
      await saveDiscoveryItemToLibrary({ targetKind, targetId })
      setSavedDiscoveryItems(await listSavedDiscoveryItems())
      toast.success('Saved to your Library')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save item')
    } finally {
      setSavingId(null)
    }
  }

  const moveDiscoveryTarget = async (item: SavedDiscoveryItem, collectionId: string | null) => {
    setSavingId(item.savedId)
    try {
      await moveDiscoveryItemToCollection(item.savedId, collectionId)
      setSavedDiscoveryItems(current => current.map(candidate => candidate.savedId === item.savedId ? { ...candidate, collectionId } : candidate))
      toast.success('Library item moved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to move item')
    } finally {
      setSavingId(null)
    }
  }

  const removeDiscoveryTarget = async (item: SavedDiscoveryItem) => {
    setSavingId(item.savedId)
    try {
      await removeDiscoveryItemFromLibrary(item.savedId)
      setSavedDiscoveryItems(current => current.filter(candidate => candidate.savedId !== item.savedId))
      toast.success('Removed from your Library')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove item')
    } finally {
      setSavingId(null)
    }
  }

  const openSavedDiscoveryItem = (item: SavedDiscoveryItem) => {
    if (item.targetKind === 'shadow_pin') {
      openUrlState(url => {
        clearDiscoveryRouteState(url)
        url.searchParams.set('view', 'pins')
        url.searchParams.set('pin', item.targetId)
      })
      return
    }
    openUrlState(url => {
      clearDiscoveryRouteState(url)
      url.searchParams.set('view', 'games')
      url.searchParams.set('experience', item.targetKind === 'shado_tv_video' ? 'shado-tv' : 'shadow-mystery')
      url.searchParams.set('item', item.targetSlug || item.targetId)
    })
  }

  const savedDiscoveryKeySet = useMemo(() => new Set(savedDiscoveryItems.map(item => `${item.targetKind}:${item.targetId}`)), [savedDiscoveryItems])

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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create collection')
    } finally {
      setSavingId(null)
    }
  }

  const deleteCollection = async () => {
    if (!selectedCollectionId) return
    const selected = collections.find(item => item.id === selectedCollectionId)
    if (!window.confirm(`Delete ${selected?.name ?? 'this collection'}? Saved items will stay in All Library.`)) return
    setSavingId('delete-collection')
    try {
      await deleteMessageCollection(selectedCollectionId)
      setSelectedCollectionId('')
      await refreshCollections()
      await refreshLibrary('')
      toast.success('Collection deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to delete collection')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      <div className="theme-app-surface flex h-full min-h-0 flex-col pb-[calc(env(safe-area-inset-bottom)+4.2rem)] text-sm md:pb-0" data-testid="universal-discovery-view">
        <MobileAppHeader
          currentView={currentView}
          onViewChange={onViewChange}
          title="Discover"
          logo
          showSearch={false}
          className="hidden md:flex"
        />
        <section
          aria-labelledby="universal-discovery-title"
          className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden"
        >
          <header className="border-b border-[var(--border-subtle)] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.66rem] uppercase tracking-[0.18em] text-[var(--theme-accent-readable)]">ShadowChat</p>
                <h1 id="universal-discovery-title" className="text-xl font-semibold text-[var(--text-primary)]">Discover</h1>
              </div>
            </div>
            {scope !== 'library' && (
              <label className="relative mt-3 block">
                <span className="sr-only">Search ShadowChat</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  className="obsidian-input min-h-12 w-full rounded-[var(--radius-md)] pl-10 pr-10 text-base"
                  placeholder="Search General Chat and your DMs"
                  maxLength={200}
                  autoComplete="off"
                />
                {query && <button type="button" onClick={() => setQuery('')} className="absolute right-1 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)]" aria-label="Clear search"><X className="h-4 w-4" /></button>}
              </label>
            )}
          </header>

          <div className="border-b border-[var(--border-subtle)] px-3 py-2">
            <div role="tablist" aria-label="Discovery scopes" className="flex gap-1 overflow-x-auto overscroll-contain pb-1">
              {DISCOVERY_SCOPES.map(item => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={scope === item}
                  onClick={() => setScope(item)}
                  className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium capitalize ${scope === item ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.12)] text-[var(--theme-accent-readable)]' : 'border-transparent text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text-primary)]'}`}
                >
                  {item === 'library' ? 'Library' : item}
                </button>
              ))}
            </div>
          </div>

          {scope === 'library' && (
            <div className="space-y-3 border-b border-[var(--border-subtle)] p-4">
              <div className="flex gap-2">
                <select value={selectedCollectionId} onChange={event => setSelectedCollectionId(event.target.value)} className="obsidian-input min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] px-3 text-sm" aria-label="Filter saved messages by collection">
                  <option value="">All Library</option>
                  {collections.map(collection => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                </select>
                {selectedCollectionId && <button type="button" onClick={() => void deleteCollection()} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-red-100 hover:bg-red-950/30" aria-label="Delete selected collection"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <div className="flex gap-2">
                <input value={newCollectionName} onChange={event => setNewCollectionName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void createCollection() } }} className="obsidian-input min-h-11 min-w-0 flex-1 rounded-[var(--radius-sm)] px-3 text-sm" placeholder="New collection name" maxLength={60} aria-label="New collection name" />
                <button type="button" disabled={!newCollectionName.trim() || savingId === 'new-collection'} onClick={() => void createCollection()} className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-glow)] px-3 text-sm font-medium text-[var(--text-gold)] disabled:opacity-50"><FolderPlus className="h-4 w-4" />Add</button>
              </div>
            </div>
          )}

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-4">
            <p className="sr-only" aria-live="polite">
              {loading ? 'Searching messages, people, Pins, and Play' : `${resultCount} discovery results`}
            </p>
            {loading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className="h-4 w-4 animate-spin" />{scope === 'library' ? 'Loading your Library' : 'Searching ShadowChat'}</div>
            ) : scope === 'library' ? (
              libraryError ? <p className="rounded-[var(--radius-md)] border border-red-400/25 bg-red-950/20 p-4 text-sm text-red-100">{libraryError}</p>
                : savedMessages.length || savedDiscoveryItems.length ? <div className="space-y-3">
                  {savedMessages.map(item => <MessageCard key={`${item.source}:${item.messageId}`} item={item} saved saving={savingId === item.messageId} onOpen={() => closeAndOpen(() => openMessage(item))} onSave={() => undefined} onRemove={() => void removeMessage(item)} collections={collections} collectionId={item.collectionId} onMove={collectionId => void moveMessage(item, collectionId)} />)}
                  {savedDiscoveryItems.map(item => <DiscoveryLibraryCard key={item.savedId} item={item} collections={collections} saving={savingId === item.savedId} onOpen={() => closeAndOpen(() => openSavedDiscoveryItem(item))} onMove={collectionId => void moveDiscoveryTarget(item, collectionId)} onRemove={() => void removeDiscoveryTarget(item)} />)}
                </div>
                  : <EmptyState icon={<Bookmark className="h-8 w-8" />} text="Your Library is ready for the messages, Pins, and Play stories you want to keep." />
            ) : query.trim().length < 2 ? (
              <EmptyState icon={<Search className="h-8 w-8" />} text="Search messages, people, Pins, and Play in one place." />
            ) : resultCount === 0 && Object.keys(response.errors).length === 0 ? (
              <EmptyState icon={<Search className="h-8 w-8" />} text={`No results for “${query.trim()}”.`} />
            ) : (
              <div className="space-y-6">
                {visibleProviders.includes('messages') && (response.groups.messages.length > 0 || response.errors.messages) && <ResultSection title="Messages" error={response.errors.messages?.message}><div className="space-y-3">{response.groups.messages.map(item => <MessageCard key={`${item.source}:${item.messageId}`} item={item} saved={item.isSaved} saving={savingId === item.messageId} onOpen={() => closeAndOpen(() => openMessage(item))} onSave={() => void saveMessage(item)} onRemove={() => void removeMessage(item)} />)}</div></ResultSection>}
                {visibleProviders.includes('people') && (response.groups.people.length > 0 || response.errors.people) && <ResultSection title="People" error={response.errors.people?.message}><div className="grid gap-2">{response.groups.people.map(user => <button key={user.id} type="button" onClick={() => setProfileUser(toDiscoveryProfileUser(user))} className="flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/[0.035] p-3 text-left hover:border-[var(--border-glow)]"><Avatar src={user.avatar_thumbnail_url || user.avatar_url} alt={user.display_name} fallback={user.display_name} color={user.color} size="lg" /><span className="min-w-0"><span className="block truncate font-semibold text-[var(--text-primary)]">{user.display_name}</span><span className="block truncate text-sm text-[var(--text-muted)]">@{user.username}</span></span><UserRound className="ml-auto h-4 w-4 text-[var(--theme-accent-readable)]" /></button>)}</div></ResultSection>}
                {visibleProviders.includes('pins') && (response.groups.pins.length > 0 || response.errors.pins) && <ResultSection title="Pins" error={response.errors.pins?.message}><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{response.groups.pins.map(pin => { const saved = savedDiscoveryKeySet.has(`shadow_pin:${pin.id}`); return <article key={pin.id} className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/[0.035]"><button type="button" onClick={() => closeAndOpen(() => openPin(pin))} className="w-full text-left"><div className="aspect-square bg-black/25">{pin.thumbnail_url || pin.medium_url || pin.image_url ? <img src={pin.thumbnail_url || pin.medium_url || pin.image_url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <ImageIcon className="m-auto h-8 w-8 text-[var(--text-muted)]" />}</div><span className="block truncate px-3 pt-2 text-sm font-semibold text-[var(--text-primary)]">{pin.title}</span><span className="block truncate px-3 text-xs text-[var(--text-muted)]">{pin.creator?.display_name || pin.category?.title || 'ShadowPin'}</span></button><button type="button" disabled={saved || savingId === `shadow_pin:${pin.id}`} onClick={() => void saveDiscoveryTarget('shadow_pin', pin.id)} className="mx-2 mb-2 mt-1 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-xs text-[var(--theme-accent-readable)] disabled:opacity-50">{saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{saved ? 'Saved' : 'Save'}</button></article> })}</div></ResultSection>}
                {visibleProviders.includes('play') && (response.groups.play.length > 0 || response.errors.play) && <ResultSection title="Play" error={response.errors.play?.message}><div className="grid gap-2 sm:grid-cols-2">{response.groups.play.map(item => { const saved = item.targetKind && item.targetId ? savedDiscoveryKeySet.has(`${item.targetKind}:${item.targetId}`) : false; return <article key={item.id} className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-white/[0.035] p-3"><button type="button" onClick={() => closeAndOpen(() => openPlay(item))} className="flex min-h-14 w-full items-center gap-3 text-left"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[rgba(215,170,70,0.1)] text-[var(--theme-accent-readable)]">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Gamepad2 className="h-5 w-5" />}</span><span className="min-w-0"><span className="block truncate font-semibold text-[var(--text-primary)]">{item.title}</span><span className="block truncate text-sm text-[var(--text-muted)]">{item.subtitle}</span></span></button>{item.targetKind && item.targetId && <button type="button" disabled={saved || savingId === `${item.targetKind}:${item.targetId}`} onClick={() => void saveDiscoveryTarget(item.targetKind!, item.targetId!)} className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-xs text-[var(--theme-accent-readable)] disabled:opacity-50">{saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}{saved ? 'Saved' : 'Save'}</button>}</article> })}</div></ResultSection>}
              </div>
            )}
          </main>
        </section>
      </div>
      <Suspense fallback={null}>
        {profileUser && <PublicProfileDialog user={profileUser} open onClose={() => setProfileUser(null)} />}
      </Suspense>
    </>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="flex h-44 flex-col items-center justify-center px-6 text-center text-[var(--text-muted)]">{icon}<p className="mt-3 max-w-sm text-sm leading-6">{text}</p></div>
}

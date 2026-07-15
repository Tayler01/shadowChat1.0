import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MessageCircle, RefreshCw, Search, UserPlus, UsersRound, X } from 'lucide-react'
import toast from 'react-hot-toast'
import type { BasicUser, User } from '../../lib/supabase'
import { Avatar } from '../../components/ui/Avatar'
import { Button } from '../../components/ui/Button'
import { DMHubBottomSheet } from '../../components/dms/hub/DMHubBottomSheet'
import { PublicProfileDialog } from '../../components/profile/PublicProfileDialog'
import { cn } from '../../lib/utils'
import { PERSONAL_BLOCKS_CHANGED_EVENT } from '../../lib/personalBlocking'
import { requestAppBadgeRefresh } from '../../lib/appBadge'
import { getWorkingClient } from '../../lib/supabase'
import { ConnectionControl } from './ConnectionControl'
import { listMyConnections, searchConnectionPeople } from './connectionsApi'
import {
  CONNECTIONS_CHANGED_EVENT,
  type ConnectionListItem,
  type ConnectionProfile,
  type ConnectionScope,
} from './connectionModel'
import type { ConnectionSummary } from './connectionModel'
import type { InnerCircleRouteAction } from '../../lib/appRouting'
import {
  InnerCircleDeleteDialog,
  InnerCircleDetail,
  InnerCircleEditorSheet,
  InnerCircleList,
  InnerCircleMemberPickerSheet,
  InnerCirclesHubTabs,
  type InnerCirclesHubTab,
} from '../inner-circles/components'
import { useInnerCircleMembers, useInnerCircles } from '../inner-circles/useInnerCircles'
import type { InnerCircle } from '../inner-circles/innerCirclesModel'

type ConnectionsHubSheetProps = {
  open: boolean
  onClose: () => void
  currentUserId: string
  summary: ConnectionSummary
  onMessage: (user: { id: string; username: string; display_name: string }) => void
  initialSection?: 'circles' | null
  initialCircleId?: string
  onCircleRoute?: (action: InnerCircleRouteAction, circleId?: string) => void
}

const PAGE_SIZE = 40
const tabs: Array<{ id: ConnectionScope; label: string }> = [
  { id: 'accepted', label: 'Connections' },
  { id: 'incoming', label: 'Requests' },
  { id: 'outgoing', label: 'Sent' },
]

const toProfileUser = (profile: ConnectionProfile | BasicUser): User => {
  const completeProfile = profile as Partial<User>
  return {
    ...profile,
    status: profile.status ?? 'offline',
    status_message: completeProfile.status_message ?? '',
    color: profile.color ?? '#d7aa46',
    last_active: completeProfile.last_active ?? '',
    created_at: completeProfile.created_at ?? '',
    updated_at: completeProfile.updated_at ?? '',
  }
}

const scopeEmptyCopy: Record<ConnectionScope, { title: string; copy: string }> = {
  accepted: { title: 'No connections yet', copy: 'Search for someone you trust and send the first request.' },
  incoming: { title: 'You’re all caught up', copy: 'New connection requests will appear here.' },
  outgoing: { title: 'No sent requests', copy: 'Requests you are waiting on will appear here.' },
}

export function ConnectionsHubSheet({
  open,
  onClose,
  currentUserId,
  summary,
  onMessage,
  initialSection,
  initialCircleId,
  onCircleRoute,
}: ConnectionsHubSheetProps) {
  const [hubTab, setHubTab] = useState<InnerCirclesHubTab>(initialSection === 'circles' ? 'circles' : 'people')
  const [circleId, setCircleId] = useState<string | null>(initialCircleId ?? null)
  const [scope, setScope] = useState<ConnectionScope>('accepted')
  const [items, setItems] = useState<ConnectionListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [searchResults, setSearchResults] = useState<BasicUser[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchRevision, setSearchRevision] = useState(0)
  const [profileUser, setProfileUser] = useState<User | null>(null)
  const [editor, setEditor] = useState<{ mode: 'create' | 'rename'; circle: InnerCircle | null } | null>(null)
  const [editorName, setEditorName] = useState('')
  const [editorPending, setEditorPending] = useState(false)
  const [editorError, setEditorError] = useState<string | null>(null)
  const [deleteCircle, setDeleteCircle] = useState<InnerCircle | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerConnections, setPickerConnections] = useState<ConnectionProfile[]>([])
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set())
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerPending, setPickerPending] = useState(false)
  const [pickerReady, setPickerReady] = useState(false)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const searchRequestRef = useRef(0)
  const pickerRequestRef = useRef(0)
  const closeProfile = useCallback(() => setProfileUser(null), [])
  const circlesState = useInnerCircles(open && hubTab === 'circles')
  const selectedCircle = useMemo(
    () => circlesState.circles.find(circle => circle.id === circleId) ?? null,
    [circleId, circlesState.circles]
  )

  useEffect(() => {
    if (!open || !currentUserId) return
    void (async () => {
      const client = await getWorkingClient()
      const { error } = await client
        .from('notification_events')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', currentUserId)
        .in('type', ['connection_request', 'connection_accepted'])
        .is('read_at', null)
      if (!error) requestAppBadgeRefresh()
    })()
  }, [currentUserId, open])
  const membersState = useInnerCircleMembers(
    selectedCircle?.id ?? null,
    open && hubTab === 'circles' && Boolean(selectedCircle)
  )

  useEffect(() => {
    const nextTab: InnerCirclesHubTab = initialSection === 'circles' || initialCircleId ? 'circles' : 'people'
    setHubTab(nextTab)
    setCircleId(initialCircleId ?? null)
  }, [initialCircleId, initialSection])

  const selectHubTab = useCallback((nextTab: InnerCirclesHubTab) => {
    setHubTab(nextTab)
    setCircleId(null)
    onCircleRoute?.(nextTab === 'circles' ? 'show-circles' : 'show-people')
  }, [onCircleRoute])

  const openCircle = useCallback((circle: InnerCircle) => {
    setHubTab('circles')
    setCircleId(circle.id)
    onCircleRoute?.('open-circle', circle.id)
  }, [onCircleRoute])

  const closeCircle = useCallback(() => {
    setCircleId(null)
    onCircleRoute?.('close-circle')
  }, [onCircleRoute])

  const load = useCallback(async (append = false) => {
    const requestId = ++requestRef.current
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const boundary = append ? items[items.length - 1] : null
      const page = await listMyConnections({
        scope,
        limit: PAGE_SIZE,
        beforeUpdatedAt: boundary?.updatedAt ?? null,
        beforeId: boundary?.connectionId ?? null,
      })
      if (requestId !== requestRef.current) return
      setItems(current => append
        ? [...current, ...page.filter(candidate => !current.some(existing => existing.connectionId === candidate.connectionId))]
        : page)
      setHasMore(page.length === PAGE_SIZE)
    } catch (caught) {
      if (requestId !== requestRef.current) return
      setError(caught instanceof Error ? caught.message : 'Connections could not be refreshed.')
    } finally {
      if (requestId === requestRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [items, scope])

  useEffect(() => {
    if (!open || hubTab !== 'people') return
    setItems([])
    setHasMore(false)
    void load(false)
  // `load` includes the current list for keyset append; opening/scope changes are the reset boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubTab, open, scope])

  useEffect(() => {
    if (!open || hubTab !== 'people') return
    const refresh = () => void load(false)
    const refreshAfterBlock = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; blocked?: boolean }>).detail
      if (detail?.blocked && detail.userId) {
        setItems(current => current.filter(item => item.profile.id !== detail.userId))
        setSearchResults(current => current.filter(person => person.id !== detail.userId))
      }
      setSearchRevision(current => current + 1)
      void load(false)
    }
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, refresh)
    window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, refreshAfterBlock)
    return () => {
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, refresh)
      window.removeEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, refreshAfterBlock)
    }
  }, [hubTab, load, open])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim().slice(0, 100)), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const requestId = ++searchRequestRef.current
    if (!open || hubTab !== 'people' || debouncedQuery.length < 2) {
      setSearchResults([])
      setSearchError(null)
      setSearching(false)
      return
    }
    const controller = new AbortController()
    setSearching(true)
    setSearchError(null)
    void searchConnectionPeople(debouncedQuery, { signal: controller.signal })
      .then(results => {
        if (requestId === searchRequestRef.current) {
          setSearchResults(results.filter(person => person.id !== currentUserId).slice(0, 20))
        }
      })
      .catch(caught => {
        if (requestId !== searchRequestRef.current || (caught instanceof DOMException && caught.name === 'AbortError')) return
        setSearchError(caught instanceof Error ? caught.message : 'People search is unavailable.')
      })
      .finally(() => {
        if (requestId === searchRequestRef.current) setSearching(false)
      })
    return () => controller.abort()
  }, [currentUserId, debouncedQuery, hubTab, open, searchRevision])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setDebouncedQuery('')
      setSearchResults([])
      setProfileUser(null)
      setEditor(null)
      setDeleteCircle(null)
      setPickerOpen(false)
      setPickerQuery('')
      setPickerError(null)
    }
  }, [open])

  const startCreateCircle = useCallback(() => {
    setEditor({ mode: 'create', circle: null })
    setEditorName('')
    setEditorError(null)
  }, [])

  const startRenameCircle = useCallback((circle: InnerCircle) => {
    setEditor({ mode: 'rename', circle })
    setEditorName(circle.name)
    setEditorError(null)
  }, [])

  const submitEditor = useCallback(async () => {
    if (!editor || editorPending) return
    setEditorPending(true)
    setEditorError(null)
    try {
      if (editor.mode === 'create') {
        const created = await circlesState.createCircle(editorName)
        setEditor(null)
        setEditorName('')
        toast.success('Inner Circle created')
        if (created) openCircle(created)
      } else if (editor.circle) {
        await circlesState.renameCircle(editor.circle.id, editorName)
        setEditor(null)
        setEditorName('')
        toast.success('Inner Circle renamed')
      }
    } catch (caught) {
      setEditorError(caught instanceof Error ? caught.message : 'Unable to save this Inner Circle.')
    } finally {
      setEditorPending(false)
    }
  }, [circlesState, editor, editorName, editorPending, openCircle])

  const confirmDeleteCircle = useCallback(async () => {
    if (!deleteCircle || deletePending) return
    const deletedId = deleteCircle.id
    setDeletePending(true)
    setDeleteError(null)
    try {
      await circlesState.deleteCircle(deletedId)
      setDeleteCircle(null)
      toast.success('Inner Circle deleted')
      if (circleId === deletedId) closeCircle()
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Unable to delete this Inner Circle.')
    } finally {
      setDeletePending(false)
    }
  }, [circleId, circlesState, closeCircle, deleteCircle, deletePending])

  const loadPickerConnections = useCallback(async () => {
    const request = ++pickerRequestRef.current
    setPickerLoading(true)
    setPickerReady(false)
    setPickerError(null)
    try {
      const accepted: ConnectionProfile[] = membersState.members.map(member => member.profile)
      const acceptedIds = new Set(accepted.map(profile => profile.id))
      const seenBoundaries = new Set<string>()
      let beforeUpdatedAt: string | null = null
      let beforeId: string | null = null
      let complete = false
      for (let pageIndex = 0; pageIndex < 200; pageIndex += 1) {
        const page = await listMyConnections({
          scope: 'accepted',
          limit: 50,
          beforeUpdatedAt,
          beforeId,
        })
        page.forEach(item => {
          if (!acceptedIds.has(item.profile.id)) {
            acceptedIds.add(item.profile.id)
            accepted.push(item.profile)
          }
        })
        const boundary = page[page.length - 1]
        if (page.length < 50) {
          complete = true
          break
        }
        if (!boundary) throw new Error('Accepted Connections returned an incomplete page. Please retry.')
        const boundaryKey = `${boundary.updatedAt}:${boundary.connectionId}`
        if (seenBoundaries.has(boundaryKey)) {
          throw new Error('Accepted Connections could not be loaded completely. Please retry.')
        }
        seenBoundaries.add(boundaryKey)
        beforeUpdatedAt = boundary.updatedAt
        beforeId = boundary.connectionId
      }
      if (!complete) throw new Error('Accepted Connections exceeded the safe picker window. Please narrow the list and retry.')
      if (pickerRequestRef.current !== request) return
      setPickerConnections(accepted)
      setPickerReady(true)
    } catch (caught) {
      if (pickerRequestRef.current !== request) return
      setPickerError(caught instanceof Error ? caught.message : 'Accepted Connections could not be loaded.')
    } finally {
      if (pickerRequestRef.current === request) setPickerLoading(false)
    }
  }, [membersState.members])

  const openMemberPicker = useCallback(() => {
    if (membersState.loading || membersState.error) {
      toast.error(membersState.error || 'Wait for the current members to finish loading.')
      return
    }
    setPickerSelectedIds(new Set(membersState.members.map(member => member.memberId)))
    setPickerQuery('')
    setPickerError(null)
    setPickerReady(false)
    setPickerOpen(true)
    void loadPickerConnections()
  }, [loadPickerConnections, membersState.error, membersState.loading, membersState.members])

  const closeMemberPicker = useCallback(() => {
    if (pickerPending) return
    pickerRequestRef.current += 1
    setPickerOpen(false)
    setPickerLoading(false)
    setPickerReady(false)
  }, [pickerPending])

  const saveMemberPicker = useCallback(async () => {
    if (
      !selectedCircle
      || pickerPending
      || pickerLoading
      || !pickerReady
      || pickerError
      || membersState.loading
      || membersState.error
    ) return
    const profilesById = new Map<string, ConnectionProfile>()
    membersState.members.forEach(member => profilesById.set(member.memberId, member.profile))
    pickerConnections.forEach(profile => profilesById.set(profile.id, profile))
    const selectedProfiles = Array.from(pickerSelectedIds).map(memberId => profilesById.get(memberId))
    if (selectedProfiles.some(profile => !profile)) {
      setPickerReady(false)
      setPickerError('The complete selected-member set is no longer available. Reload and try again.')
      return
    }
    setPickerPending(true)
    setPickerError(null)
    try {
      await membersState.setMembers(selectedProfiles as ConnectionProfile[])
      setPickerOpen(false)
      setPickerReady(false)
      toast.success('Inner Circle members updated')
    } catch (caught) {
      setPickerSelectedIds(new Set(membersState.members.map(member => member.memberId)))
      setPickerError(caught instanceof Error ? caught.message : 'Unable to update the selected members.')
    } finally {
      setPickerPending(false)
    }
  }, [membersState, pickerConnections, pickerError, pickerLoading, pickerPending, pickerReady, pickerSelectedIds, selectedCircle])

  const nestedSheetOpen = Boolean(profileUser || editor || deleteCircle || pickerOpen)

  const countByScope = useMemo<Record<ConnectionScope, number>>(() => ({
    accepted: summary.acceptedCount,
    incoming: summary.incomingCount,
    outgoing: summary.outgoingCount,
  }), [summary])
  const empty = scopeEmptyCopy[scope]
  const showingSearch = debouncedQuery.length >= 2

  return (
    <>
      <DMHubBottomSheet
        open={open}
        onClose={onClose}
        title="Connections"
        eyebrow="Private network"
        description="Build a trusted network without changing who can message you."
        testId="connections-hub"
        className="sm:max-w-2xl"
        suspended={nestedSheetOpen}
      >
        <InnerCirclesHubTabs
          selected={hubTab}
          onChange={selectHubTab}
          peopleCount={summary.acceptedCount}
          circleCount={circlesState.circles.length}
        />

        {hubTab === 'people' ? (
          <div id="connections-hub-panel-people" role="tabpanel" aria-labelledby="connections-hub-tab-people">
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] p-1" role="tablist" aria-label="Connection lists">
          {tabs.map(tab => {
            const selected = scope === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`connections-tab-${tab.id}`}
                aria-controls={`connections-panel-${tab.id}`}
                onClick={() => setScope(tab.id)}
                onKeyDown={event => {
                  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                  event.preventDefault()
                  const currentIndex = tabs.findIndex(candidate => candidate.id === tab.id)
                  const nextIndex = event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
                  const nextTab = tabs[nextIndex]
                  setScope(nextTab.id)
                  document.getElementById(`connections-tab-${nextTab.id}`)?.focus()
                }}
                data-testid={`connections-tab-${tab.id}`}
                className={cn(
                  'inline-flex min-h-12 min-w-0 items-center justify-center gap-1.5 rounded-xl border px-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]',
                  selected
                    ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]'
                    : 'border-transparent text-[var(--text-muted)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]'
                )}
              >
                <span className="truncate">{tab.label}</span>
                <span aria-hidden="true" className="min-w-5 rounded-full bg-[rgba(255,255,255,0.07)] px-1 text-center text-[0.65rem] leading-5">
                  {countByScope[tab.id] > 99 ? '99+' : countByScope[tab.id]}
                </span>
              </button>
            )
          })}
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <label htmlFor="connections-search" className="sr-only">Find people to connect with</label>
          <input
            id="connections-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Find people"
            autoComplete="off"
            maxLength={100}
            data-testid="connections-search-input"
            className="obsidian-input h-12 w-full rounded-2xl pl-11 pr-12 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear people search" className="absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-2xl text-[var(--text-muted)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--theme-focus-ring)]">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <p className="sr-only" aria-live="polite">
          {showingSearch
            ? searching ? 'Searching for people.' : `${searchResults.length} people found.`
            : loading ? `Loading ${tabs.find(tab => tab.id === scope)?.label}.` : `${items.length} items loaded.`}
        </p>

        <div
          className="mt-3"
          role="tabpanel"
          id={`connections-panel-${scope}`}
          aria-labelledby={`connections-tab-${scope}`}
          tabIndex={0}
        >
          {showingSearch ? (
            searching ? (
              <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--text-muted)]" role="status"><Loader2 className="h-4 w-4 animate-spin" />Searching people</div>
            ) : searchError ? (
              <div role="alert" className="rounded-[var(--radius-lg)] border border-red-400/25 bg-red-950/20 p-4 text-sm text-red-100">{searchError}</div>
            ) : searchResults.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] p-7 text-center text-[var(--text-muted)]"><Search className="mx-auto mb-3 h-7 w-7" /><p className="font-semibold text-[var(--text-primary)]">No people found</p><p className="mt-1 text-sm">Try a display name or username.</p></div>
            ) : (
              <div className="space-y-2" aria-label="People search results">
                {searchResults.map(person => (
                  <article key={person.id} data-testid={`connection-row-${person.id}`} className="flex min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3">
                    <button type="button" onClick={() => setProfileUser(toProfileUser(person))} className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-md)] text-left focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" aria-label={`Open ${person.display_name || person.username}'s profile`}>
                      <Avatar src={person.avatar_thumbnail_url || person.avatar_url} alt={person.display_name || person.username} fallback={person.display_name || person.username} color={person.color} size="md" />
                      <span className="min-w-0"><span className="block truncate font-semibold text-[var(--text-primary)]">{person.display_name || person.username}</span><span className="block truncate text-xs text-[var(--text-muted)]">@{person.username}</span></span>
                    </button>
                    <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setProfileUser(toProfileUser(person))}>
                      View
                    </Button>
                  </article>
                ))}
              </div>
            )
          ) : loading && items.length === 0 ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--text-muted)]" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading {tabs.find(tab => tab.id === scope)?.label.toLowerCase()}</div>
          ) : error && items.length === 0 ? (
            <div role="alert" className="rounded-[var(--radius-lg)] border border-red-400/25 bg-red-950/20 p-5 text-center text-red-100"><p className="font-semibold">Connections are unavailable</p><p className="mt-1 text-sm text-red-100/75">{error}</p><Button type="button" variant="ghost" size="sm" className="mt-4" onClick={() => void load(false)}><RefreshCw className="mr-2 h-4 w-4" />Try again</Button></div>
          ) : items.length === 0 ? (
            <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-5 py-8 text-center text-[var(--text-muted)]">
              {scope === 'accepted' ? <UsersRound className="mx-auto mb-3 h-8 w-8" /> : <UserPlus className="mx-auto mb-3 h-8 w-8" />}
              <p className="font-semibold text-[var(--text-primary)]">{empty.title}</p>
              <p className="mt-1 text-sm leading-5">{empty.copy}</p>
            </div>
          ) : (
            <>
              {error && <div role="status" className="mb-2 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-amber-300/20 bg-amber-950/15 px-3 py-2 text-xs text-amber-100"><span>Couldn’t refresh. Showing the last loaded list.</span><button type="button" onClick={() => void load(false)} className="min-h-11 font-semibold underline">Retry</button></div>}
              <div className="space-y-2" role="list" aria-label={tabs.find(tab => tab.id === scope)?.label}>
                {items.map(item => (
                  <article key={item.connectionId} role="listitem" data-testid={`connection-row-${item.profile.id}`} className="flex min-w-0 flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.025)] p-3">
                    <button type="button" onClick={() => setProfileUser(toProfileUser(item.profile))} className="flex min-w-[10rem] flex-1 items-center gap-3 rounded-[var(--radius-md)] text-left focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" aria-label={`Open ${item.profile.display_name}'s profile`}>
                      <Avatar src={item.profile.avatar_thumbnail_url || item.profile.avatar_url} alt={item.profile.display_name} fallback={item.profile.display_name} color={item.profile.color} size="md" />
                      <span className="min-w-0"><span className="block truncate font-semibold text-[var(--text-primary)]">{item.profile.display_name}</span><span className="block truncate text-xs text-[var(--text-muted)]">@{item.profile.username}</span></span>
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      {scope === 'accepted' && (
                        <button type="button" onClick={() => onMessage(item.profile)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--theme-accent-readable)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" aria-label={`Message ${item.profile.display_name}`}>
                          <MessageCircle className="h-4 w-4" />
                        </button>
                      )}
                      <ConnectionControl user={item.profile} initialState={item.state} compact />
                    </div>
                  </article>
                ))}
              </div>
              {hasMore && <Button type="button" variant="ghost" className="mt-3 w-full" loading={loadingMore} onClick={() => void load(true)}>Load more</Button>}
            </>
          )}
        </div>
          </div>
        ) : (
          <div id="connections-hub-panel-circles" role="tabpanel" aria-labelledby="connections-hub-tab-circles" className="mt-3">
            {circleId ? (
              selectedCircle ? (
                <InnerCircleDetail
                  circle={selectedCircle}
                  members={membersState.members.map(member => member.profile)}
                  loading={membersState.loading}
                  error={membersState.error}
                  onBack={closeCircle}
                  onAddConnections={openMemberPicker}
                  onRetry={membersState.refresh}
                  onMessage={onMessage}
                  onRemove={member => {
                    void membersState.removeMember(member.id)
                      .then(() => toast.success(`${member.display_name || member.username} removed`))
                      .catch(caught => toast.error(caught instanceof Error ? caught.message : 'Unable to remove this member.'))
                  }}
                  onRename={() => startRenameCircle(selectedCircle)}
                  onDelete={() => { setDeleteCircle(selectedCircle); setDeleteError(null) }}
                />
              ) : circlesState.loading ? (
                <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-[var(--text-muted)]" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading Inner Circle</div>
              ) : (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-subtle)] px-5 py-8 text-center text-[var(--text-muted)]" data-testid="inner-circle-unavailable">
                  <UsersRound className="mx-auto mb-3 h-8 w-8" aria-hidden="true" />
                  <p className="font-semibold text-[var(--text-primary)]">Circle unavailable</p>
                  <p className="mt-1 text-sm">It may have been deleted, or this private circle is not yours.</p>
                  <Button type="button" variant="secondary" className="mt-4" onClick={closeCircle}>Back to Circles</Button>
                </div>
              )
            ) : (
              <InnerCircleList
                circles={circlesState.circles}
                loading={circlesState.loading}
                error={circlesState.error}
                onRetry={circlesState.refresh}
                onCreate={startCreateCircle}
                onOpen={circle => openCircle(circle as InnerCircle)}
                onRename={circle => startRenameCircle(circle as InnerCircle)}
                onDelete={circle => { setDeleteCircle(circle as InnerCircle); setDeleteError(null) }}
              />
            )}
          </div>
        )}
      </DMHubBottomSheet>

      {profileUser && <PublicProfileDialog user={profileUser} open onClose={closeProfile} />}
      <InnerCircleEditorSheet
        open={Boolean(editor)}
        mode={editor?.mode ?? 'create'}
        name={editorName}
        onNameChange={setEditorName}
        onSubmit={() => { void submitEditor() }}
        onClose={() => { if (!editorPending) setEditor(null) }}
        pending={editorPending}
        error={editorError}
      />
      <InnerCircleDeleteDialog
        open={Boolean(deleteCircle)}
        circleName={deleteCircle?.name ?? 'this Inner Circle'}
        onConfirm={() => { void confirmDeleteCircle() }}
        onClose={() => { if (!deletePending) setDeleteCircle(null) }}
        pending={deletePending}
        error={deleteError}
      />
      <InnerCircleMemberPickerSheet
        open={pickerOpen}
        circleName={selectedCircle?.name ?? 'Inner Circle'}
        connections={pickerConnections}
        selectedMemberIds={pickerSelectedIds}
        query={pickerQuery}
        onQueryChange={setPickerQuery}
        onToggleMember={member => {
          setPickerSelectedIds(current => {
            const next = new Set(current)
            if (next.has(member.id)) next.delete(member.id)
            else next.add(member.id)
            return next
          })
        }}
        onSave={() => { void saveMemberPicker() }}
        onClose={closeMemberPicker}
        pending={pickerPending}
        loading={pickerLoading}
        saveDisabled={!pickerReady || Boolean(pickerError) || Boolean(membersState.error)}
        error={pickerError}
      />
    </>
  )
}

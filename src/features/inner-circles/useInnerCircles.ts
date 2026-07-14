import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { PERSONAL_BLOCKS_CHANGED_EVENT } from '../../lib/personalBlocking'
import type { ConnectionProfile } from '../connections/connectionModel'
import { CONNECTIONS_CHANGED_EVENT } from '../connections/connectionModel'
import {
  createInnerCircleId,
  listMyInnerCircleMembers,
  listMyInnerCircles,
  mutateMyInnerCircle,
  mutateMyInnerCircleMember,
  setMyInnerCircleMembers,
} from './innerCirclesApi'
import {
  dispatchInnerCirclesChanged,
  INNER_CIRCLES_CHANGED_EVENT,
  normalizeInnerCircleName,
  type InnerCircle,
  type InnerCircleMember,
  type InnerCirclesChangedDetail,
} from './innerCirclesModel'

const CACHE_MS = 2 * 60 * 1000

type CacheEntry<T> = { value: T; fetchedAt: number }

const circlesByUser = new Map<string, CacheEntry<InnerCircle[]>>()
const membersByUserCircle = new Map<string, CacheEntry<InnerCircleMember[]>>()
let globalListenersInstalled = false

const memberCacheKey = (userId: string, circleId: string) => `${userId}:${circleId}`
const isFresh = <T,>(entry?: CacheEntry<T>) => Boolean(entry && Date.now() - entry.fetchedAt < CACHE_MS)

export const invalidateInnerCircles = (userId?: string) => {
  if (!userId) {
    circlesByUser.clear()
    membersByUserCircle.clear()
    return
  }
  circlesByUser.delete(userId)
  Array.from(membersByUserCircle.keys()).forEach(key => {
    if (key.startsWith(`${userId}:`)) membersByUserCircle.delete(key)
  })
}

const ensureGlobalInvalidationListeners = () => {
  if (globalListenersInstalled || typeof window === 'undefined') return
  const invalidateAll = () => invalidateInnerCircles()
  window.addEventListener(INNER_CIRCLES_CHANGED_EVENT, invalidateAll)
  window.addEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAll)
  window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAll)
  globalListenersInstalled = true
}

const errorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
)

export const useInnerCircles = (enabled = true) => {
  ensureGlobalInvalidationListeners()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const cached = userId ? circlesByUser.get(userId) : undefined
  const initial = isFresh(cached) ? cached?.value ?? [] : []
  const [circles, setCircles] = useState<InnerCircle[]>(initial)
  const [loading, setLoading] = useState(Boolean(enabled && userId && !isFresh(cached)))
  const [error, setError] = useState<string | null>(null)
  const [mutationCount, setMutationCount] = useState(0)
  const circlesRef = useRef(circles)
  const generationRef = useRef(0)
  const pendingMutationsRef = useRef(0)
  const queuedRefreshRef = useRef(false)
  const lastResumeRefreshAtRef = useRef(0)
  const mutationVersionsRef = useRef(new Map<string, number>())

  const applyCircles = useCallback((updater: (current: InnerCircle[]) => InnerCircle[]) => {
    setCircles(current => {
      const next = updater(current)
      circlesRef.current = next
      if (userId) circlesByUser.set(userId, { value: next, fetchedAt: Date.now() })
      return next
    })
  }, [userId])

  const refresh = useCallback(async (showLoading = false) => {
    if (!enabled || !userId) return
    if (pendingMutationsRef.current > 0) {
      queuedRefreshRef.current = true
      return
    }
    const generation = ++generationRef.current
    if (showLoading) setLoading(true)
    try {
      const next = await listMyInnerCircles()
      if (generationRef.current !== generation) return
      applyCircles(() => next)
      setError(null)
    } catch (caught) {
      if (generationRef.current === generation) {
        setError(errorMessage(caught, 'Inner Circles are unavailable right now.'))
      }
    } finally {
      if (generationRef.current === generation) setLoading(false)
    }
  }, [applyCircles, enabled, userId])

  const beginMutation = useCallback((key: string) => {
    pendingMutationsRef.current += 1
    setMutationCount(current => current + 1)
    const version = (mutationVersionsRef.current.get(key) ?? 0) + 1
    mutationVersionsRef.current.set(key, version)
    return { generation: generationRef.current, version }
  }, [])

  const finishMutation = useCallback((detail?: InnerCirclesChangedDetail) => {
    pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1)
    setMutationCount(current => Math.max(0, current - 1))
    if (detail && pendingMutationsRef.current === 0) {
      queuedRefreshRef.current = false
      dispatchInnerCirclesChanged(detail)
      return
    }
    if (detail) dispatchInnerCirclesChanged(detail)
    if (pendingMutationsRef.current === 0 && queuedRefreshRef.current) {
      queuedRefreshRef.current = false
      void refresh(false)
    }
  }, [refresh])

  const createCircle = useCallback(async (rawName: string) => {
    const name = normalizeInnerCircleName(rawName)
    const tempId = createInnerCircleId()
    const now = new Date().toISOString()
    const optimistic: InnerCircle = {
      id: tempId,
      name,
      revision: 0,
      memberCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    const token = beginMutation(tempId)
    applyCircles(current => [optimistic, ...current])
    let succeeded = false
    try {
      const result = await mutateMyInnerCircle('create', { circleId: tempId, name })
      if (generationRef.current === token.generation) {
        if (result.circle) {
          applyCircles(current => current.map(circle => circle.id === tempId ? result.circle! : circle))
        } else {
          queuedRefreshRef.current = true
        }
        setError(null)
      }
      succeeded = true
      return result.circle
    } catch (caught) {
      if (
        generationRef.current === token.generation
        && mutationVersionsRef.current.get(tempId) === token.version
      ) {
        applyCircles(current => current.filter(circle => circle.id !== tempId))
        setError(errorMessage(caught, 'Unable to create this Inner Circle.'))
      }
      throw caught
    } finally {
      finishMutation(succeeded ? { circleId: null, change: 'circle', action: 'create' } : undefined)
    }
  }, [applyCircles, beginMutation, finishMutation])

  const renameCircle = useCallback(async (circleId: string, rawName: string) => {
    const name = normalizeInnerCircleName(rawName)
    const previous = circlesRef.current.find(circle => circle.id === circleId)
    if (!previous) throw new Error('Inner Circle not found.')
    const token = beginMutation(circleId)
    applyCircles(current => current.map(circle => circle.id === circleId
      ? { ...circle, name, updatedAt: new Date().toISOString() }
      : circle))
    let succeeded = false
    try {
      const result = await mutateMyInnerCircle('rename', {
        circleId,
        name,
        expectedRevision: previous.revision,
      })
      if (generationRef.current === token.generation) {
        if (result.circle) {
          applyCircles(current => current.map(circle => circle.id === circleId ? result.circle! : circle))
        } else {
          queuedRefreshRef.current = true
        }
        setError(null)
      }
      succeeded = true
      return result.circle
    } catch (caught) {
      if (
        generationRef.current === token.generation
        && mutationVersionsRef.current.get(circleId) === token.version
      ) {
        applyCircles(current => current.map(circle => circle.id === circleId ? previous : circle))
        setError(errorMessage(caught, 'Unable to rename this Inner Circle.'))
      }
      throw caught
    } finally {
      finishMutation(succeeded ? { circleId, change: 'circle', action: 'rename' } : undefined)
    }
  }, [applyCircles, beginMutation, finishMutation])

  const deleteCircle = useCallback(async (circleId: string) => {
    const index = circlesRef.current.findIndex(circle => circle.id === circleId)
    const previous = circlesRef.current[index]
    if (!previous) throw new Error('Inner Circle not found.')
    const token = beginMutation(circleId)
    applyCircles(current => current.filter(circle => circle.id !== circleId))
    let succeeded = false
    try {
      await mutateMyInnerCircle('delete', {
        circleId,
        expectedRevision: previous.revision,
      })
      if (generationRef.current === token.generation) setError(null)
      succeeded = true
    } catch (caught) {
      if (
        generationRef.current === token.generation
        && mutationVersionsRef.current.get(circleId) === token.version
      ) {
        applyCircles(current => {
          const next = [...current]
          next.splice(Math.min(index, next.length), 0, previous)
          return next
        })
        setError(errorMessage(caught, 'Unable to delete this Inner Circle.'))
      }
      throw caught
    } finally {
      finishMutation(succeeded ? { circleId, change: 'circle', action: 'delete' } : undefined)
    }
  }, [applyCircles, beginMutation, finishMutation])

  useEffect(() => {
    generationRef.current += 1
    pendingMutationsRef.current = 0
    queuedRefreshRef.current = false
    setMutationCount(0)
    if (!enabled || !userId) {
      circlesRef.current = []
      setCircles([])
      setLoading(false)
      return
    }
    const nextCached = circlesByUser.get(userId)
    if (isFresh(nextCached)) {
      circlesRef.current = nextCached!.value
      setCircles(nextCached!.value)
      setLoading(false)
    } else {
      circlesRef.current = []
      setCircles([])
      void refresh(true)
    }
  }, [enabled, refresh, userId])

  useEffect(() => {
    if (!enabled || !userId) return
    const invalidateAndRefresh = () => {
      circlesByUser.delete(userId)
      if (pendingMutationsRef.current > 0) {
        queuedRefreshRef.current = true
        return
      }
      void refresh(false)
    }
    const refreshAfterResume = () => {
      const now = Date.now()
      if (now - lastResumeRefreshAtRef.current < 750) return
      lastResumeRefreshAtRef.current = now
      invalidateAndRefresh()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAfterResume()
    }
    window.addEventListener(INNER_CIRCLES_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener('focus', refreshAfterResume)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener(INNER_CIRCLES_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener('focus', refreshAfterResume)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, refresh, userId])

  return useMemo(() => ({
    circles,
    loading,
    error,
    mutating: mutationCount > 0,
    refresh: () => refresh(true),
    createCircle,
    renameCircle,
    deleteCircle,
  }), [circles, createCircle, deleteCircle, error, loading, mutationCount, refresh, renameCircle])
}

export const useInnerCircleMembers = (circleId: string | null, enabled = true) => {
  ensureGlobalInvalidationListeners()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const key = userId && circleId ? memberCacheKey(userId, circleId) : null
  const cached = key ? membersByUserCircle.get(key) : undefined
  const initial = isFresh(cached) ? cached?.value ?? [] : []
  const [members, setMemberState] = useState<InnerCircleMember[]>(initial)
  const [loading, setLoading] = useState(Boolean(enabled && key && !isFresh(cached)))
  const [error, setError] = useState<string | null>(null)
  const [mutationCount, setMutationCount] = useState(0)
  const membersRef = useRef(members)
  const generationRef = useRef(0)
  const pendingMutationsRef = useRef(0)
  const queuedRefreshRef = useRef(false)
  const lastResumeRefreshAtRef = useRef(0)
  const mutationVersionsRef = useRef(new Map<string, number>())

  const applyMembers = useCallback((updater: (current: InnerCircleMember[]) => InnerCircleMember[]) => {
    setMemberState(current => {
      const next = updater(current)
      membersRef.current = next
      if (key) membersByUserCircle.set(key, { value: next, fetchedAt: Date.now() })
      return next
    })
  }, [key])

  const refresh = useCallback(async (showLoading = false) => {
    if (!enabled || !userId || !circleId || !key) return
    if (pendingMutationsRef.current > 0) {
      queuedRefreshRef.current = true
      return
    }
    const generation = ++generationRef.current
    if (showLoading) setLoading(true)
    try {
      const next = await listMyInnerCircleMembers(circleId)
      if (generationRef.current !== generation) return
      applyMembers(() => next)
      setError(null)
    } catch (caught) {
      if (generationRef.current === generation) {
        setError(errorMessage(caught, 'Unable to load this Inner Circle.'))
      }
    } finally {
      if (generationRef.current === generation) setLoading(false)
    }
  }, [applyMembers, circleId, enabled, key, userId])

  const beginMutation = useCallback((memberId: string) => {
    pendingMutationsRef.current += 1
    setMutationCount(current => current + 1)
    const version = (mutationVersionsRef.current.get(memberId) ?? 0) + 1
    mutationVersionsRef.current.set(memberId, version)
    return { generation: generationRef.current, version }
  }, [])

  const finishMutation = useCallback((detail?: InnerCirclesChangedDetail) => {
    pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1)
    setMutationCount(current => Math.max(0, current - 1))
    if (detail && pendingMutationsRef.current === 0) {
      queuedRefreshRef.current = false
      dispatchInnerCirclesChanged(detail)
      return
    }
    if (detail) dispatchInnerCirclesChanged(detail)
    if (pendingMutationsRef.current === 0 && queuedRefreshRef.current) {
      queuedRefreshRef.current = false
      void refresh(false)
    }
  }, [refresh])

  const addMember = useCallback(async (profile: ConnectionProfile) => {
    if (!circleId) throw new Error('Choose an Inner Circle first.')
    const memberId = profile.id
    if (!memberId) throw new Error('Member is required.')
    if (membersRef.current.some(member => member.memberId === memberId)) return null
    const optimistic: InnerCircleMember = {
      circleId,
      memberId,
      addedAt: new Date().toISOString(),
      profile,
    }
    const token = beginMutation(memberId)
    applyMembers(current => [...current, optimistic])
    let succeeded = false
    try {
      const result = await mutateMyInnerCircleMember(circleId, memberId, 'add')
      if (generationRef.current === token.generation) {
        if (result.member) {
          applyMembers(current => current.map(member => member.memberId === memberId ? result.member! : member))
        } else {
          queuedRefreshRef.current = true
        }
        setError(null)
      }
      succeeded = true
      return result.member
    } catch (caught) {
      if (
        generationRef.current === token.generation
        && mutationVersionsRef.current.get(memberId) === token.version
      ) {
        applyMembers(current => current.filter(member => member.memberId !== memberId))
        setError(errorMessage(caught, 'Unable to add this member.'))
      }
      throw caught
    } finally {
      finishMutation(succeeded
        ? { circleId, memberId, change: 'membership', action: 'add' }
        : undefined)
    }
  }, [applyMembers, beginMutation, circleId, finishMutation])

  const removeMember = useCallback(async (memberId: string) => {
    if (!circleId) throw new Error('Choose an Inner Circle first.')
    const index = membersRef.current.findIndex(member => member.memberId === memberId)
    const previous = membersRef.current[index]
    if (!previous) return
    const token = beginMutation(memberId)
    applyMembers(current => current.filter(member => member.memberId !== memberId))
    let succeeded = false
    try {
      await mutateMyInnerCircleMember(circleId, memberId, 'remove')
      if (generationRef.current === token.generation) setError(null)
      succeeded = true
    } catch (caught) {
      if (
        generationRef.current === token.generation
        && mutationVersionsRef.current.get(memberId) === token.version
      ) {
        applyMembers(current => {
          const next = [...current]
          next.splice(Math.min(index, next.length), 0, previous)
          return next
        })
        setError(errorMessage(caught, 'Unable to remove this member.'))
      }
      throw caught
    } finally {
      finishMutation(succeeded
        ? { circleId, memberId, change: 'membership', action: 'remove' }
        : undefined)
    }
  }, [applyMembers, beginMutation, circleId, finishMutation])

  const setCircleMembers = useCallback(async (profiles: ConnectionProfile[]) => {
    if (!circleId) throw new Error('Choose an Inner Circle first.')
    const profilesById = new Map<string, ConnectionProfile>()
    profiles.forEach(profile => {
      if (!profile.id) throw new Error('Every Inner Circle member must be a Connection.')
      profilesById.set(profile.id, profile)
    })
    if (profilesById.size > 50) {
      throw new Error('An Inner Circle can contain at most 50 Connections.')
    }

    const previous = membersRef.current
    const existingById = new Map(previous.map(item => [item.memberId, item]))
    const now = new Date().toISOString()
    const optimistic = Array.from(profilesById.values()).map(profile => {
      const existing = existingById.get(profile.id)
      return existing ?? {
        circleId,
        memberId: profile.id,
        addedAt: now,
        profile,
      }
    })
    const token = beginMutation('__bulk__')
    applyMembers(() => optimistic)
    let succeeded = false
    try {
      const result = await setMyInnerCircleMembers(circleId, Array.from(profilesById.keys()))
      if (generationRef.current === token.generation) setError(null)
      succeeded = true
      return result
    } catch (caught) {
      if (
        generationRef.current === token.generation
        && mutationVersionsRef.current.get('__bulk__') === token.version
      ) {
        applyMembers(() => previous)
        setError(errorMessage(caught, 'Unable to save these Inner Circle members.'))
      }
      throw caught
    } finally {
      finishMutation(succeeded
        ? { circleId, change: 'membership', action: 'set' }
        : undefined)
    }
  }, [applyMembers, beginMutation, circleId, finishMutation])

  useEffect(() => {
    generationRef.current += 1
    pendingMutationsRef.current = 0
    queuedRefreshRef.current = false
    setMutationCount(0)
    if (!enabled || !key || !circleId) {
      membersRef.current = []
      setMemberState([])
      setLoading(false)
      return
    }
    const nextCached = membersByUserCircle.get(key)
    if (isFresh(nextCached)) {
      membersRef.current = nextCached!.value
      setMemberState(nextCached!.value)
      setLoading(false)
    } else {
      membersRef.current = []
      setMemberState([])
      void refresh(true)
    }
  }, [circleId, enabled, key, refresh])

  useEffect(() => {
    if (!enabled || !key || !circleId) return
    const invalidateAndRefresh = (event?: Event, failClosed = false) => {
      const detail = (event as CustomEvent<InnerCirclesChangedDetail> | undefined)?.detail
      if (detail?.circleId && detail.circleId !== circleId) return
      membersByUserCircle.delete(key)
      if (failClosed) {
        generationRef.current += 1
        applyMembers(() => [])
      }
      if (pendingMutationsRef.current > 0) {
        queuedRefreshRef.current = true
        return
      }
      void refresh(failClosed)
    }
    const refreshAfterResume = () => {
      const now = Date.now()
      if (now - lastResumeRefreshAtRef.current < 750) return
      lastResumeRefreshAtRef.current = now
      invalidateAndRefresh()
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshAfterResume()
    }
    const handleRelationshipChanged = (event: Event) => invalidateAndRefresh(event, true)
    window.addEventListener(INNER_CIRCLES_CHANGED_EVENT, invalidateAndRefresh)
    window.addEventListener(CONNECTIONS_CHANGED_EVENT, handleRelationshipChanged)
    window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, handleRelationshipChanged)
    window.addEventListener('focus', refreshAfterResume)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener(INNER_CIRCLES_CHANGED_EVENT, invalidateAndRefresh)
      window.removeEventListener(CONNECTIONS_CHANGED_EVENT, handleRelationshipChanged)
      window.removeEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, handleRelationshipChanged)
      window.removeEventListener('focus', refreshAfterResume)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [applyMembers, circleId, enabled, key, refresh])

  return useMemo(() => ({
    members,
    loading,
    error,
    mutating: mutationCount > 0,
    refresh: () => refresh(true),
    addMember,
    removeMember,
    setMembers: setCircleMembers,
  }), [addMember, error, loading, members, mutationCount, refresh, removeMember, setCircleMembers])
}

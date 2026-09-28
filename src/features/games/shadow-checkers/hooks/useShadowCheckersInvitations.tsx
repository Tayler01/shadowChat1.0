/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../../../hooks/useAuth'
import { useActiveUsers } from '../../../../hooks/usePresence'
import { getRealtimeClient } from '../../../../lib/supabase'
import { createRealtimeChannelName } from '../../../../lib/realtimeChannelName'
import { PERSONAL_BLOCKS_CHANGED_EVENT } from '../../../../lib/personalBlocking'
import {
  acceptShadowCheckersInvitation,
  cancelShadowCheckersInvitation,
  declineShadowCheckersInvitation,
  fetchShadowCheckersInvitations,
  sendShadowCheckersInvitation,
} from '../api/shadowCheckersInvitationsApi'
import type {
  ShadowCheckersBoardSkin,
  ShadowCheckersInvitation,
} from '../../../../lib/supabase'

const CHANGED_EVENT = 'shadow-checkers-invitations-changed'
const POLL_MS = 30_000

function useShadowCheckersInvitationsStore() {
  const { user } = useAuth()
  const activeUsers = useActiveUsers()
  const [invitations, setInvitations] = useState<ShadowCheckersInvitation[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestSequenceRef = useRef(0)
  const activeUserRef = useRef(user?.id)
  const accountEpochRef = useRef(0)
  if (activeUserRef.current !== user?.id) accountEpochRef.current += 1
  activeUserRef.current = user?.id

  useEffect(() => {
    setBusy(null)
    setError(null)
  }, [user?.id])

  const refresh = useCallback(async () => {
    if (!user?.id) {
      requestSequenceRef.current += 1
      setInvitations([])
      setLoading(false)
      return []
    }
    const requestSequence = ++requestSequenceRef.current
    const accountEpoch = accountEpochRef.current
    try {
      const rows = await fetchShadowCheckersInvitations(user.id)
      if (requestSequence !== requestSequenceRef.current || activeUserRef.current !== user.id || accountEpoch !== accountEpochRef.current) return rows
      setInvitations(rows)
      setError(null)
      return rows
    } catch (reason) {
      if (requestSequence === requestSequenceRef.current && activeUserRef.current === user.id && accountEpoch === accountEpochRef.current) {
        setError(reason instanceof Error ? reason.message : 'Unable to load invitations')
      }
      throw reason
    } finally {
      if (requestSequence === requestSequenceRef.current && activeUserRef.current === user.id && accountEpoch === accountEpochRef.current) setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    let disposed = false
    let timer: number | undefined
    const realtimeClient = getRealtimeClient()
    if (!user?.id) {
      setInvitations([])
      setLoading(false)
      return
    }
    setInvitations([])
    setLoading(true)
    const refreshSoon = () => {
      if (disposed) return
      if (timer !== undefined) window.clearTimeout(timer)
      timer = window.setTimeout(() => { void refresh().catch(() => undefined) }, 120)
    }
    void refresh().catch(() => undefined)
    const channel = realtimeClient
      ?.channel(createRealtimeChannelName('public:shadow-checkers-invitations'))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shadow_checkers_invitations',
        filter: `invitee_id=eq.${user.id}`,
      }, refreshSoon)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'shadow_checkers_invitations',
        filter: `inviter_id=eq.${user.id}`,
      }, refreshSoon)
      .subscribe()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshSoon()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSoon()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(CHANGED_EVENT, refreshSoon)
    const onBlocksChanged = (event: Event) => {
      requestSequenceRef.current += 1
      const blockedId = (event as CustomEvent<{ userId?: string }>).detail?.userId
      if (blockedId) {
        setInvitations(current => current.filter(row =>
          row.inviter_id !== blockedId && row.invitee_id !== blockedId))
      }
      refreshSoon()
    }
    window.addEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, onBlocksChanged)
    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(CHANGED_EVENT, refreshSoon)
      window.removeEventListener(PERSONAL_BLOCKS_CHANGED_EVENT, onBlocksChanged)
      requestSequenceRef.current += 1
      if (channel) realtimeClient?.removeChannel(channel)
    }
  }, [refresh, user?.id])

  useEffect(() => {
    const nextExpiry = invitations
      .filter(row => row.status === 'pending')
      .map(row => Date.parse(row.expires_at))
      .filter(timestamp => Number.isFinite(timestamp) && timestamp > Date.now())
      .sort((left, right) => left - right)[0]
    if (!nextExpiry) return
    const timer = window.setTimeout(() => {
      setInvitations(current => current.filter(row =>
        row.status !== 'pending' || Date.parse(row.expires_at) > Date.now()))
      void refresh().catch(() => undefined)
    }, Math.min(nextExpiry - Date.now() + 100, 2_147_483_647))
    return () => window.clearTimeout(timer)
  }, [invitations, refresh])

  const mutate = useCallback(async <T,>(label: string, action: () => Promise<T>) => {
    const actorId = user?.id
    if (!actorId) throw new Error('Authentication required')
    if (busy) throw new Error('Finish the current invitation action first')
    const accountEpoch = accountEpochRef.current
    const isCurrentAccount = () => activeUserRef.current === actorId && accountEpochRef.current === accountEpoch
    setBusy(label)
    setError(null)
    try {
      const result = await action()
      if (!isCurrentAccount()) {
        const staleAction = new Error('Invitation action ended after account change')
        staleAction.name = 'AbortError'
        throw staleAction
      }
      window.dispatchEvent(new Event(CHANGED_EVENT))
      await refresh().catch(() => undefined)
      if (!isCurrentAccount()) {
        const staleAction = new Error('Invitation action ended after account change')
        staleAction.name = 'AbortError'
        throw staleAction
      }
      return result
    } catch (reason) {
      if (isCurrentAccount()) {
        setError(reason instanceof Error ? reason.message : 'Invitation action failed')
      }
      throw reason
    } finally {
      if (isCurrentAccount()) setBusy(null)
    }
  }, [busy, refresh, user?.id])

  const eligibleUsers = useMemo(() => activeUsers.filter(member => (
    member.user_id !== user?.id &&
    member.is_active &&
    member.presence_visibility === 'tracked'
  )), [activeUsers, user?.id])

  const incoming = useMemo(() => invitations.filter(row =>
    row.status === 'pending' && row.invitee_id === user?.id && Date.parse(row.expires_at) > Date.now()
  ), [invitations, user?.id])
  const outgoing = useMemo(() => invitations.filter(row =>
    row.status === 'pending' && row.inviter_id === user?.id && Date.parse(row.expires_at) > Date.now()
  ), [invitations, user?.id])
  const acceptedOutgoing = useMemo(() => invitations.filter(row =>
    row.status === 'accepted' && row.inviter_id === user?.id &&
    Boolean(row.match_id) && Boolean(row.responded_at) &&
    Date.parse(row.responded_at ?? '') > Date.now() - 5 * 60_000
  ), [invitations, user?.id])
  const acceptedIncoming = useMemo(() => invitations.filter(row =>
    row.status === 'accepted' && row.invitee_id === user?.id && Boolean(row.match_id)
  ), [invitations, user?.id])

  return {
    eligibleUsers,
    incoming,
    outgoing,
    acceptedOutgoing,
    acceptedIncoming,
    loading,
    busy,
    error,
    refresh,
    send: (targetUserId: string, characterKey: string, boardSkin: ShadowCheckersBoardSkin = 'classic') =>
      mutate('send', () => sendShadowCheckersInvitation(targetUserId, characterKey, boardSkin)),
    accept: (invitationId: string, characterKey?: string) =>
      mutate('accept', () => acceptShadowCheckersInvitation(invitationId, characterKey)),
    decline: (invitationId: string) =>
      mutate('decline', () => declineShadowCheckersInvitation(invitationId)),
    cancel: (invitationId: string) =>
      mutate('cancel', () => cancelShadowCheckersInvitation(invitationId)),
  }
}

type InvitationsContextValue = ReturnType<typeof useShadowCheckersInvitationsStore>
const InvitationsContext = createContext<InvitationsContextValue | null>(null)

export function ShadowCheckersInvitationsProvider({ children }: { children: ReactNode }) {
  const value = useShadowCheckersInvitationsStore()
  return <InvitationsContext.Provider value={value}>{children}</InvitationsContext.Provider>
}

export function useShadowCheckersInvitations() {
  const value = useContext(InvitationsContext)
  if (!value) throw new Error('ShadowCheckersInvitationsProvider is required')
  return value
}

/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useAuth } from './useAuth'
import {
  blockUser as persistBlockUser,
  fetchMyBlockedUsers,
  unblockUser as persistUnblockUser,
  type BlockedUserEntry,
} from '../lib/personalBlocking'

export const PERSONAL_BLOCKS_CHANGED_EVENT = 'shadowchat:personal-blocks-changed'

type BlockedUsersContextValue = {
  entries: BlockedUserEntry[]
  blockedUserIds: ReadonlySet<string>
  loading: boolean
  savingUserIds: ReadonlySet<string>
  isBlockedByMe: (userId?: string | null) => boolean
  blockUser: (userId: string) => Promise<void>
  unblockUser: (userId: string) => Promise<void>
  refresh: () => Promise<void>
}

const unavailable = async () => {
  throw new Error('Personal blocking is unavailable outside the signed-in app')
}

const EMPTY_IDS = new Set<string>()
const fallbackValue: BlockedUsersContextValue = {
  entries: [],
  blockedUserIds: EMPTY_IDS,
  loading: false,
  savingUserIds: EMPTY_IDS,
  isBlockedByMe: () => false,
  blockUser: unavailable,
  unblockUser: unavailable,
  refresh: async () => undefined,
}

const BlockedUsersContext = createContext<BlockedUsersContextValue>(fallbackValue)

const notifyBlocksChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PERSONAL_BLOCKS_CHANGED_EVENT))
  }
}

export function BlockedUsersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [entries, setEntries] = useState<BlockedUserEntry[]>([])
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set())
  const [savingUserIds, setSavingUserIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const requestSequenceRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!user?.id) {
      requestSequenceRef.current += 1
      setEntries([])
      setBlockedUserIds(new Set())
      setLoading(false)
      return
    }

    const requestSequence = requestSequenceRef.current + 1
    requestSequenceRef.current = requestSequence
    setLoading(true)

    try {
      const nextEntries = await fetchMyBlockedUsers()
      if (requestSequence !== requestSequenceRef.current) return
      setEntries(nextEntries)
      setBlockedUserIds(new Set(nextEntries.map(entry => entry.user.id)))
    } finally {
      if (requestSequence === requestSequenceRef.current) {
        setLoading(false)
      }
    }
  }, [user?.id])

  useEffect(() => {
    void refresh().catch(() => undefined)
  }, [refresh])

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return

    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'hidden') {
        void refresh().catch(() => undefined)
      }
    }

    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refresh, user?.id])

  const setSaving = useCallback((userId: string, saving: boolean) => {
    setSavingUserIds(current => {
      const next = new Set(current)
      if (saving) next.add(userId)
      else next.delete(userId)
      return next
    })
  }, [])

  const blockUser = useCallback(async (userId: string) => {
    if (!user?.id || userId === user.id || savingUserIds.has(userId)) return
    setSaving(userId, true)
    try {
      await persistBlockUser(userId)
      setBlockedUserIds(current => new Set(current).add(userId))
      notifyBlocksChanged()
      await refresh().catch(() => undefined)
    } finally {
      setSaving(userId, false)
    }
  }, [refresh, savingUserIds, setSaving, user?.id])

  const unblockUser = useCallback(async (userId: string) => {
    if (!user?.id || userId === user.id || savingUserIds.has(userId)) return
    setSaving(userId, true)
    try {
      await persistUnblockUser(userId)
      setBlockedUserIds(current => {
        const next = new Set(current)
        next.delete(userId)
        return next
      })
      setEntries(current => current.filter(entry => entry.user.id !== userId))
      notifyBlocksChanged()
      await refresh().catch(() => undefined)
    } finally {
      setSaving(userId, false)
    }
  }, [refresh, savingUserIds, setSaving, user?.id])

  const isBlockedByMe = useCallback(
    (userId?: string | null) => Boolean(userId && blockedUserIds.has(userId)),
    [blockedUserIds]
  )

  const value = useMemo<BlockedUsersContextValue>(() => ({
    entries,
    blockedUserIds,
    loading,
    savingUserIds,
    isBlockedByMe,
    blockUser,
    unblockUser,
    refresh,
  }), [
    blockUser,
    blockedUserIds,
    entries,
    isBlockedByMe,
    loading,
    refresh,
    savingUserIds,
    unblockUser,
  ])

  return (
    <BlockedUsersContext.Provider value={value}>
      {children}
    </BlockedUsersContext.Provider>
  )
}

export const useBlockedUsers = () => useContext(BlockedUsersContext)

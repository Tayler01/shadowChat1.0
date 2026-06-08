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
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchHypeEvent,
  fetchHypeStatus,
  fetchPendingHypeEvents,
  getRealtimeClient,
  getWorkingClient,
  hypeMessage as hypeMessageRpc,
  markHypeEventsPlayed,
  ringHypeBell as ringHypeBellRpc,
  type HypeEvent,
  type HypeStatus,
} from '../lib/supabase'
import { triggerHypePushNotification } from '../lib/push'
import { createRealtimeChannelName } from '../lib/realtimeChannelName'
import { useAuth } from './useAuth'
import { useMessages } from './MessagesContext'
import { useSoundEffects } from './useSoundEffects'

const HYPE_STACK_WINDOW_MS = 60_000
const HYPE_DISPLAY_MS = 4600
const HYPE_STARTUP_ANIMATION_DELAY_MS = 2_000
const HYPE_STARTUP_QUEUE_LIMIT = 20
const HYPE_LOCAL_RECEIPTS_PREFIX = 'shadowchat:hype-played-events'
const HYPE_LOCAL_RECEIPT_LIMIT = 360

export type HypeCelebrationState = {
  key: number
  mode: 'live' | 'catchup'
  intensity: number
  events: HypeEvent[]
  latestEvent: HypeEvent
}

type HypeContextValue = {
  status: HypeStatus | null
  loadingStatus: boolean
  ringing: boolean
  hypingMessageIds: Set<string>
  activeCelebration: HypeCelebrationState | null
  ringBell: () => Promise<HypeEvent | null>
  hypeMessage: (messageId: string) => Promise<HypeEvent | null>
  refreshStatus: () => Promise<void>
  dismissCelebration: () => void
}

const HypeContext = createContext<HypeContextValue | undefined>(undefined)

const normalizeRealtimeHypeEvent = (value: any): HypeEvent => ({
  id: String(value.id),
  actor_id: value.actor_id ?? null,
  event_type: value.event_type === 'message' ? 'message' : 'bell',
  message_id: value.message_id ?? null,
  message_author_id: value.message_author_id ?? null,
  metadata: value.metadata && typeof value.metadata === 'object' ? value.metadata : {},
  created_at: String(value.created_at),
  expires_at: String(value.expires_at),
})

const isExpired = (event: HypeEvent) => new Date(event.expires_at).getTime() <= Date.now()

type LocalHypeReceipt = {
  id: string
  expiresAt: string
  storedAt: number
}

const getLocalReceiptsKey = (userId: string) => `${HYPE_LOCAL_RECEIPTS_PREFIX}:${userId}`

const readLocalHypeReceipts = (userId: string): LocalHypeReceipt[] => {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(getLocalReceiptsKey(userId))
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const now = Date.now()
    const receipts = parsed
      .map((item): LocalHypeReceipt | null => {
        if (!item || typeof item !== 'object') return null

        const id = typeof item.id === 'string' ? item.id : ''
        const expiresAt = typeof item.expiresAt === 'string' ? item.expiresAt : ''
        const expiresTime = Date.parse(expiresAt)
        const storedAt = Number(item.storedAt)

        if (!id || !Number.isFinite(expiresTime) || expiresTime <= now) {
          return null
        }

        return {
          id,
          expiresAt,
          storedAt: Number.isFinite(storedAt) ? storedAt : now,
        }
      })
      .filter((item): item is LocalHypeReceipt => Boolean(item))

    if (receipts.length !== parsed.length) {
      window.localStorage.setItem(getLocalReceiptsKey(userId), JSON.stringify(receipts))
    }

    return receipts
  } catch {
    return []
  }
}

const getLocalHypeReceiptIds = (userId: string) =>
  new Set(readLocalHypeReceipts(userId).map(receipt => receipt.id))

const rememberLocalHypeReceipts = (userId: string, events: HypeEvent[]) => {
  if (typeof window === 'undefined' || events.length === 0) return

  try {
    const now = Date.now()
    const receiptMap = new Map(readLocalHypeReceipts(userId).map(receipt => [receipt.id, receipt]))

    events.forEach(event => {
      if (isExpired(event)) return
      receiptMap.set(event.id, {
        id: event.id,
        expiresAt: event.expires_at,
        storedAt: now,
      })
    })

    const receipts = [...receiptMap.values()]
      .filter(receipt => Date.parse(receipt.expiresAt) > now)
      .sort((left, right) => right.storedAt - left.storedAt)
      .slice(0, HYPE_LOCAL_RECEIPT_LIMIT)

    window.localStorage.setItem(getLocalReceiptsKey(userId), JSON.stringify(receipts))
  } catch {
    // Server receipts still provide the authoritative cross-device record.
  }
}

export function HypeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { loading: messagesLoading } = useMessages()
  const { playHypeBell, playHypeMessage } = useSoundEffects()
  const [status, setStatus] = useState<HypeStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [ringing, setRinging] = useState(false)
  const [hypingMessageIds, setHypingMessageIds] = useState<Set<string>>(() => new Set())
  const [activeCelebration, setActiveCelebration] = useState<HypeCelebrationState | null>(null)
  const [presentationReady, setPresentationReady] = useState(false)
  const handledEventIdsRef = useRef<Set<string>>(new Set())
  const stackRef = useRef<{ startedAt: number; count: number; events: HypeEvent[] } | null>(null)
  const startupQueueRef = useRef<HypeEvent[]>([])
  const displayTimerRef = useRef<number | null>(null)
  const startupDelayTimerRef = useRef<number | null>(null)
  const fetchedPendingForUserRef = useRef<string | null>(null)

  const clearDisplayTimer = useCallback(() => {
    if (displayTimerRef.current !== null) {
      window.clearTimeout(displayTimerRef.current)
      displayTimerRef.current = null
    }
  }, [])

  const scheduleDismiss = useCallback(() => {
    if (typeof window === 'undefined') return
    clearDisplayTimer()
    displayTimerRef.current = window.setTimeout(() => {
      setActiveCelebration(null)
      displayTimerRef.current = null
    }, HYPE_DISPLAY_MS)
  }, [clearDisplayTimer])

  const clearStartupDelayTimer = useCallback(() => {
    if (startupDelayTimerRef.current !== null) {
      window.clearTimeout(startupDelayTimerRef.current)
      startupDelayTimerRef.current = null
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!user) {
      setStatus(null)
      return
    }

    setLoadingStatus(true)
    try {
      setStatus(await fetchHypeStatus())
    } finally {
      setLoadingStatus(false)
    }
  }, [user])

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const recordPlayed = useCallback((events: HypeEvent[]) => {
    const freshEvents = events.filter(event => !isExpired(event))
    const ids = freshEvents.map(event => event.id)
    if (!ids.length) return

    freshEvents.forEach(event => handledEventIdsRef.current.add(event.id))
    if (user?.id) {
      rememberLocalHypeReceipts(user.id, freshEvents)
    }
    void markHypeEventsPlayed(ids).catch(() => undefined)
  }, [user?.id])

  const presentLiveEvent = useCallback((event: HypeEvent) => {
    if (isExpired(event)) return

    const now = Date.now()
    const currentStack = stackRef.current
    const nextStack = currentStack && now - currentStack.startedAt <= HYPE_STACK_WINDOW_MS
      ? {
          startedAt: currentStack.startedAt,
          count: currentStack.count + 1,
          events: [...currentStack.events, event],
        }
      : {
          startedAt: now,
          count: 1,
          events: [event],
        }

    stackRef.current = nextStack
    setActiveCelebration({
      key: now,
      mode: 'live',
      intensity: nextStack.count,
      events: nextStack.events,
      latestEvent: event,
    })

    if (event.event_type === 'message') {
      playHypeMessage()
    } else {
      playHypeBell()
    }
    scheduleDismiss()
  }, [playHypeBell, playHypeMessage, scheduleDismiss])

  const presentCatchupEvents = useCallback((events: HypeEvent[]) => {
    const freshEvents = events.filter(event => !isExpired(event))
    if (!freshEvents.length) return

    const latestEvent = freshEvents[freshEvents.length - 1]
    const key = Date.now()
    stackRef.current = {
      startedAt: key,
      count: freshEvents.length,
      events: freshEvents,
    }
    setActiveCelebration({
      key,
      mode: 'catchup',
      intensity: freshEvents.length,
      events: freshEvents,
      latestEvent,
    })

    if (latestEvent.event_type === 'message') {
      playHypeMessage()
    } else {
      playHypeBell()
    }
    scheduleDismiss()
  }, [playHypeBell, playHypeMessage, scheduleDismiss])

  const queueStartupEvents = useCallback((events: HypeEvent[]) => {
    const existingIds = new Set(startupQueueRef.current.map(event => event.id))
    const queuedEvents = events.filter(event => !isExpired(event) && !existingIds.has(event.id))
    if (!queuedEvents.length) return

    startupQueueRef.current = [...startupQueueRef.current, ...queuedEvents].slice(-HYPE_STARTUP_QUEUE_LIMIT)
  }, [])

  const flushStartupQueue = useCallback(() => {
    const queuedEvents = startupQueueRef.current.filter(event => !isExpired(event))
    startupQueueRef.current = []
    if (!queuedEvents.length) return

    if (queuedEvents.length === 1) {
      presentLiveEvent(queuedEvents[0])
      return
    }

    presentCatchupEvents(queuedEvents)
  }, [presentCatchupEvents, presentLiveEvent])

  const showLiveEvent = useCallback((event: HypeEvent, options: { immediate?: boolean } = {}) => {
    if (isExpired(event)) return

    const localReceiptIds = user?.id ? getLocalHypeReceiptIds(user.id) : new Set<string>()
    if (handledEventIdsRef.current.has(event.id) || localReceiptIds.has(event.id)) {
      recordPlayed([event])
      return
    }
    recordPlayed([event])

    if (!options.immediate && !presentationReady) {
      queueStartupEvents([event])
      return
    }

    presentLiveEvent(event)
  }, [presentationReady, presentLiveEvent, queueStartupEvents, recordPlayed, user?.id])

  const showCatchupEvents = useCallback((events: HypeEvent[]) => {
    const localReceiptIds = user?.id ? getLocalHypeReceiptIds(user.id) : new Set<string>()
    const skippedEvents: HypeEvent[] = []
    const freshEvents: HypeEvent[] = []

    events.forEach(event => {
      if (isExpired(event)) return

      if (handledEventIdsRef.current.has(event.id) || localReceiptIds.has(event.id)) {
        skippedEvents.push(event)
        return
      }

      freshEvents.push(event)
    })

    if (skippedEvents.length) {
      recordPlayed(skippedEvents)
    }

    if (!freshEvents.length) return

    recordPlayed(freshEvents)

    if (!presentationReady) {
      queueStartupEvents(freshEvents)
      return
    }

    presentCatchupEvents(freshEvents)
  }, [presentCatchupEvents, presentationReady, queueStartupEvents, recordPlayed, user?.id])

  const ringBell = useCallback(async () => {
    if (!user || ringing) return null

    setRinging(true)
    try {
      const event = await ringHypeBellRpc()
      showLiveEvent(event, { immediate: true })
      void triggerHypePushNotification(event.id).catch(() => undefined)
      void refreshStatus().catch(() => undefined)
      return event
    } finally {
      setRinging(false)
    }
  }, [refreshStatus, ringing, showLiveEvent, user])

  const hypeMessage = useCallback(async (messageId: string) => {
    if (!user || hypingMessageIds.has(messageId)) return null

    setHypingMessageIds(prev => new Set(prev).add(messageId))
    try {
      const event = await hypeMessageRpc(messageId)
      showLiveEvent(event, { immediate: true })
      void triggerHypePushNotification(event.id).catch(() => undefined)
      void refreshStatus().catch(() => undefined)
      return event
    } finally {
      setHypingMessageIds(prev => {
        const next = new Set(prev)
        next.delete(messageId)
        return next
      })
    }
  }, [hypingMessageIds, refreshStatus, showLiveEvent, user])

  useEffect(() => {
    if (!user || messagesLoading || fetchedPendingForUserRef.current === user.id) return

    fetchedPendingForUserRef.current = user.id
    void fetchPendingHypeEvents()
      .then(showCatchupEvents)
      .catch(() => undefined)
  }, [messagesLoading, showCatchupEvents, user])

  useEffect(() => {
    if (!user) {
      clearStartupDelayTimer()
      startupQueueRef.current = []
      setPresentationReady(false)
      return
    }

    if (messagesLoading) {
      clearStartupDelayTimer()
      setPresentationReady(false)
      return
    }

    setPresentationReady(false)

    if (typeof window === 'undefined') {
      setPresentationReady(true)
      return
    }

    clearStartupDelayTimer()
    startupDelayTimerRef.current = window.setTimeout(() => {
      setPresentationReady(true)
      startupDelayTimerRef.current = null
    }, HYPE_STARTUP_ANIMATION_DELAY_MS)

    return clearStartupDelayTimer
  }, [clearStartupDelayTimer, messagesLoading, user])

  useEffect(() => {
    if (presentationReady) {
      flushStartupQueue()
    }
  }, [flushStartupQueue, presentationReady])

  useEffect(() => {
    if (!user) return

    let channel: RealtimeChannel | null = null
    let activeClient: any = null
    let disposed = false

    const subscribe = async () => {
      const client = await getWorkingClient().catch(() => getRealtimeClient())
      if (!client?.channel || typeof client.channel !== 'function') return
      activeClient = client

      channel = client
        .channel(createRealtimeChannelName(`public:hype_events:${user.id}`))
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'hype_events',
          },
          async (payload: any) => {
            if (disposed) return

            const eventId = payload?.new?.id
            const event = payload?.new?.metadata
              ? normalizeRealtimeHypeEvent(payload.new)
              : eventId
                ? await fetchHypeEvent(eventId).catch(() => null)
                : null

            if (!disposed && event) {
              showLiveEvent(event)
            }
          }
        )
        .subscribe()
    }

    void subscribe()

    return () => {
      disposed = true
      if (channel) {
        activeClient?.removeChannel?.(channel)
      }
    }
  }, [showLiveEvent, user])

  useEffect(() => () => {
    clearDisplayTimer()
    clearStartupDelayTimer()
  }, [clearDisplayTimer, clearStartupDelayTimer])

  const dismissCelebration = useCallback(() => {
    clearDisplayTimer()
    setActiveCelebration(null)
  }, [clearDisplayTimer])

  const value = useMemo<HypeContextValue>(() => ({
    status,
    loadingStatus,
    ringing,
    hypingMessageIds,
    activeCelebration,
    ringBell,
    hypeMessage,
    refreshStatus,
    dismissCelebration,
  }), [
    activeCelebration,
    dismissCelebration,
    hypeMessage,
    hypingMessageIds,
    loadingStatus,
    refreshStatus,
    ringBell,
    ringing,
    status,
  ])

  return <HypeContext.Provider value={value}>{children}</HypeContext.Provider>
}

export function useHype() {
  const context = useContext(HypeContext)
  if (!context) {
    throw new Error('useHype must be used within a HypeProvider')
  }
  return context
}

export function useOptionalHype() {
  return useContext(HypeContext)
}

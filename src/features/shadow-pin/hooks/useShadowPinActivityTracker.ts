import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  finishShadowPinActivitySession,
  recordShadowPinActivityEvent,
  startShadowPinActivitySession,
} from '../api/shadowPinActivityApi'
import type { ShadowPinActivityEventType } from '../activityTypes'
import type { ShadowPinCategory, ShadowPinImage } from '../types'
import { useAuth } from '../../../hooks/useAuth'

const VISIT_THRESHOLD_SECONDS = 5
const CATEGORY_VISIT_THRESHOLD_SECONDS = 3

const getCategoryThumb = (category?: ShadowPinCategory | null) =>
  category?.thumbnail_url || category?.medium_url || category?.image_url || null

const getImageThumb = (image?: ShadowPinImage | null) =>
  image?.thumbnail_url || image?.medium_url || image?.image_url || null

const getCategoryMetadata = (category?: ShadowPinCategory | null) => ({
  category_title: category?.title,
  item_title: category?.title,
  thumbnail_url: getCategoryThumb(category),
})

const getImageMetadata = (image: ShadowPinImage, category?: ShadowPinCategory | null) => ({
  category_title: category?.title,
  item_title: image.title,
  thumbnail_url: getImageThumb(image),
})

const reportAnalyticsError = (error: unknown) => {
  if (import.meta.env.DEV) {
    console.warn('Shadow Pin activity tracking failed', error)
  }
}

export function useShadowPinActivityTracker() {
  const { user } = useAuth()
  const sessionIdRef = useRef<string | null>(null)
  const startedRef = useRef(false)
  const visibleSinceRef = useRef<number | null>(null)
  const visibleMsRef = useRef(0)
  const visitRecordedRef = useRef(false)
  const viewedPinIdsRef = useRef(new Set<string>())

  const getVisibleDurationSeconds = useCallback(() => {
    const now = Date.now()
    const activeMs = visibleSinceRef.current == null ? 0 : now - visibleSinceRef.current
    return Math.max(0, Math.round((visibleMsRef.current + activeMs) / 1000))
  }, [])

  const userId = user?.id ?? null

  const recordEvent = useCallback((
    eventType: ShadowPinActivityEventType,
    options: {
      categoryId?: string | null
      imageId?: string | null
      durationSeconds?: number | null
      metadata?: Record<string, unknown>
    } = {}
  ) => {
    if (!userId) return

    void recordShadowPinActivityEvent({
      sessionId: sessionIdRef.current,
      eventType,
      categoryId: options.categoryId,
      imageId: options.imageId,
      durationSeconds: options.durationSeconds,
      metadata: options.metadata,
    }).catch(reportAnalyticsError)
  }, [userId])

  const flushSession = useCallback(() => {
    const sessionId = sessionIdRef.current
    if (!sessionId) return

    const durationSeconds = getVisibleDurationSeconds()
    void finishShadowPinActivitySession(sessionId, durationSeconds).catch(reportAnalyticsError)
  }, [getVisibleDurationSeconds])

  useEffect(() => {
    if (!userId || startedRef.current) return

    startedRef.current = true
    visibleSinceRef.current = document.visibilityState === 'visible' ? Date.now() : null
    visibleMsRef.current = 0
    visitRecordedRef.current = false
    viewedPinIdsRef.current = new Set()
    let active = true

    void startShadowPinActivitySession()
      .then(sessionId => {
        if (active) {
          sessionIdRef.current = sessionId
        }
      })
      .catch(reportAnalyticsError)

    const maybeRecordVisit = () => {
      if (visitRecordedRef.current || !sessionIdRef.current) return
      const durationSeconds = getVisibleDurationSeconds()
      if (durationSeconds < VISIT_THRESHOLD_SECONDS) return

      visitRecordedRef.current = true
      recordEvent('shadow_pin_visit', {
        durationSeconds,
        metadata: { qualified_after_seconds: VISIT_THRESHOLD_SECONDS },
      })
    }

    const visitTimer = window.setInterval(maybeRecordVisit, 1000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        visibleSinceRef.current = Date.now()
        return
      }

      if (visibleSinceRef.current != null) {
        visibleMsRef.current += Date.now() - visibleSinceRef.current
        visibleSinceRef.current = null
      }
      maybeRecordVisit()
      flushSession()
    }

    const handleBeforeUnload = () => {
      if (visibleSinceRef.current != null) {
        visibleMsRef.current += Date.now() - visibleSinceRef.current
        visibleSinceRef.current = null
      }
      maybeRecordVisit()
      flushSession()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handleBeforeUnload)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      active = false
      window.clearInterval(visitTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handleBeforeUnload)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      handleBeforeUnload()
      startedRef.current = false
      sessionIdRef.current = null
    }
  }, [flushSession, getVisibleDurationSeconds, recordEvent, userId])

  const recordCategoryVisit = useCallback((category: ShadowPinCategory, durationSeconds: number) => {
    if (durationSeconds < CATEGORY_VISIT_THRESHOLD_SECONDS) return
    recordEvent('category_visit', {
      categoryId: category.id,
      durationSeconds,
      metadata: {
        ...getCategoryMetadata(category),
        qualified_after_seconds: CATEGORY_VISIT_THRESHOLD_SECONDS,
      },
    })
  }, [recordEvent])

  const recordPinViewed = useCallback((image: ShadowPinImage, category?: ShadowPinCategory | null) => {
    if (viewedPinIdsRef.current.has(image.id)) return
    viewedPinIdsRef.current.add(image.id)
    recordEvent('pin_viewed', {
      categoryId: image.category_id ?? category?.id ?? null,
      imageId: image.id,
      durationSeconds: 1,
      metadata: getImageMetadata(image, category),
    })
  }, [recordEvent])

  const recordPinOpened = useCallback((image: ShadowPinImage, category?: ShadowPinCategory | null) => {
    recordEvent('pin_opened', {
      categoryId: image.category_id ?? category?.id ?? null,
      imageId: image.id,
      metadata: getImageMetadata(image, category),
    })
  }, [recordEvent])

  const recordShareTapped = useCallback((image: ShadowPinImage, category?: ShadowPinCategory | null) => {
    recordEvent('share_tapped', {
      categoryId: image.category_id ?? category?.id ?? null,
      imageId: image.id,
      metadata: getImageMetadata(image, category),
    })
  }, [recordEvent])

  const recordCategoryHeart = useCallback((category: ShadowPinCategory, added: boolean) => {
    recordEvent(added ? 'category_heart_added' : 'category_heart_removed', {
      categoryId: category.id,
      metadata: getCategoryMetadata(category),
    })
  }, [recordEvent])

  const recordPinHeart = useCallback((image: ShadowPinImage, added: boolean, category?: ShadowPinCategory | null) => {
    recordEvent(added ? 'pin_heart_added' : 'pin_heart_removed', {
      categoryId: image.category_id ?? category?.id ?? null,
      imageId: image.id,
      metadata: getImageMetadata(image, category),
    })
  }, [recordEvent])

  const recordCategoryMutation = useCallback((
    category: ShadowPinCategory,
    eventType: Extract<ShadowPinActivityEventType, 'category_created' | 'category_edited' | 'category_deleted'>
  ) => {
    recordEvent(eventType, {
      categoryId: category.id,
      metadata: getCategoryMetadata(category),
    })
  }, [recordEvent])

  const recordPinMutation = useCallback((
    image: ShadowPinImage,
    eventType: Extract<ShadowPinActivityEventType, 'pin_created' | 'pin_edited' | 'pin_deleted'>,
    category?: ShadowPinCategory | null
  ) => {
    recordEvent(eventType, {
      categoryId: image.category_id ?? category?.id ?? null,
      imageId: image.id,
      metadata: getImageMetadata(image, category),
    })
  }, [recordEvent])

  return useMemo(() => ({
    recordCategoryVisit,
    recordPinViewed,
    recordPinOpened,
    recordShareTapped,
    recordCategoryHeart,
    recordPinHeart,
    recordCategoryMutation,
    recordPinMutation,
  }), [
    recordCategoryHeart,
    recordCategoryMutation,
    recordCategoryVisit,
    recordPinHeart,
    recordPinMutation,
    recordPinOpened,
    recordPinViewed,
    recordShareTapped,
  ])
}

export type ShadowPinActivityTracker = ReturnType<typeof useShadowPinActivityTracker>

export function useShadowPinCategoryDwell(
  category: ShadowPinCategory | null,
  tracker: ShadowPinActivityTracker
) {
  const visibleSinceRef = useRef<number | null>(null)
  const visibleMsRef = useRef(0)

  useEffect(() => {
    if (!category) return

    visibleSinceRef.current = document.visibilityState === 'visible' ? Date.now() : null
    visibleMsRef.current = 0

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        visibleSinceRef.current = Date.now()
        return
      }

      if (visibleSinceRef.current != null) {
        visibleMsRef.current += Date.now() - visibleSinceRef.current
        visibleSinceRef.current = null
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (visibleSinceRef.current != null) {
        visibleMsRef.current += Date.now() - visibleSinceRef.current
        visibleSinceRef.current = null
      }

      tracker.recordCategoryVisit(category, Math.round(visibleMsRef.current / 1000))
    }
  }, [category, tracker])
}

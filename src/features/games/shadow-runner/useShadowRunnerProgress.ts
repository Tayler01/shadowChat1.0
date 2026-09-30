import { useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { createShadowRunnerProgressStore } from './progress'
import { shadowRunnerProgressApi } from './progressApi'
import { getShadowRunnerDiscoveredMoments } from './game/campaignMoments'

export function useShadowRunnerProgress(ownerId: string | null) {
  const { refreshProfile } = useAuth()
  const refreshProfileRef = useRef(refreshProfile)
  useLayoutEffect(() => { refreshProfileRef.current = refreshProfile }, [refreshProfile])
  const store = useMemo(() => createShadowRunnerProgressStore(ownerId, shadowRunnerProgressApi, {
    refreshProfile: async (acknowledgedOwner, signal) => {
      const profile = await refreshProfileRef.current({ ownerId: acknowledgedOwner, signal })
      if (!profile || profile.id !== acknowledgedOwner || signal.aborted) throw new Error('Medal profile refresh unavailable')
    },
  }), [ownerId])
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useLayoutEffect(() => {
    store.start()
    const resume = () => { if (!document.hidden) void store.resume() }
    window.addEventListener('online', resume)
    window.addEventListener('pageshow', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      store.stop()
      window.removeEventListener('online', resume)
      window.removeEventListener('pageshow', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [store])
  const discoveredMoments = useMemo(() => getShadowRunnerDiscoveredMoments(snapshot.progress.discoveredStoryIds), [snapshot.progress.discoveredStoryIds])
  const discoveredStoryIds = useMemo(() => discoveredMoments.map(moment => moment.id), [discoveredMoments])
  return { ...snapshot, complete: store.complete, discover: store.discover, discoveredStoryIds, discoveredMoments, retry: store.retry }
}

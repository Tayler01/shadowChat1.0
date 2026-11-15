import { useLayoutEffect, useRef } from 'react'
import { startupWork } from './startupWork'

export function useStartupAuth(loading: boolean, authenticated: boolean, error: string | null) {
  const wasLoading = useRef(true)
  useLayoutEffect(() => {
    const newRecovery = loading && !wasLoading.current
    wasLoading.current = loading
    if (loading) { startupWork.beginRecovery(['runtime'], newRecovery); return }
    if (error) { startupWork.fail(); return }
    startupWork.finish('auth')
    if (!authenticated) {
      startupWork.finish('membership'); startupWork.finish('modules'); startupWork.finish('data'); startupWork.finish('view')
    }
  }, [loading, authenticated, error])
}
export function useStartupMembership(status: string) {
  useLayoutEffect(() => {
    if (status === 'checking') { startupWork.beginRecovery(['runtime', 'auth']); return }
    if (status === 'failed') { startupWork.fail(); return }
    startupWork.finish('membership')
    if (status === 'required') { startupWork.finish('modules'); startupWork.finish('data'); startupWork.finish('view') }
  }, [status])
}

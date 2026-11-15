import { useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { useMessages } from '../../../apps/streamlined/src-overrides/hooks/useMessages'
import { useDirectMessages } from '../../../apps/streamlined/src-overrides/hooks/useDirectMessages'
import { StreamlinedLoadingView } from '../components/StreamlinedLoadingView'
import { startupWork } from './startupWork'

// Mount inside the selected view's Suspense boundary: it cannot commit while
// that module's import promise is unresolved. Chat/DM also report actual data readiness.
export function StartupViewReady({ view }: { view: string }) {
  const messages = useMessages(), dms = useDirectMessages()
  const loading = view === 'chat' ? messages.loading : view === 'dms' ? dms.loading || dms.messagesLoading : false
  useLayoutEffect(() => {
    startupWork.finish('modules')
    if (!loading) startupWork.finish('data')
    if (!loading && view !== 'chat') startupWork.finish('view')
  }, [loading, view])
  return null
}
export function StartupLoadingScreen() {
  const state = useSyncExternalStore(startupWork.subscribe, startupWork.getSnapshot)
  const [presented, setPresented] = useState(0)
  useLayoutEffect(() => {
    window.dispatchEvent(new CustomEvent('shadowchat:startup-work', { detail: state }))
    if (!state.complete) return
    // Paint 100% before handoff. No timeout, guessed duration, or delayed data readiness.
    let second = 0
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setPresented(state.generation)) })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [state])
  if (state.failed || (state.complete && presented === state.generation)) return null
  return <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }} data-startup-progress={state.progress}>
    <StreamlinedLoadingView fullscreen progress={state.progress} message={state.complete ? 'Ready' : 'Opening your community…'} />
  </div>
}

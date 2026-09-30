import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { canRecoverNativeVideoPaste, recoverNativeClipboardVideos } from '../lib/nativeClipboard'

/** Completion belongs to the initiating account/chat, never a later composer. */
export function useNativeVideoPaste(scopeKey: string, stage: (files: File[]) => number) {
  const scope = useRef({ key: scopeKey, generation: 0 })
  const pending = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const [pastingVideo, setPastingVideo] = useState(false)
  const stageRef = useRef(stage)
  stageRef.current = stage
  if (scope.current.key !== scopeKey) scope.current = { key: scopeKey, generation: scope.current.generation + 1 }
  useEffect(() => {
    pending.current?.abort()
    pending.current = null
    setPastingVideo(false)
  }, [scopeKey])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; pending.current?.abort() }
  }, [])
  const recoverVideoPaste = useCallback(() => {
    if (!canRecoverNativeVideoPaste()) return false
    if (pending.current) return true
    const controller = new AbortController()
    pending.current = controller
    setPastingVideo(true)
    const generation = scope.current.generation
    // Scope never contains a chat ID or account identity over the native bridge.
    const requestScope = crypto.randomUUID()
    void recoverNativeClipboardVideos(requestScope, controller.signal).then(files => {
      if (mounted.current && !controller.signal.aborted && scope.current.generation === generation) stageRef.current(files)
    }).catch(error => {
      if (mounted.current && !controller.signal.aborted && scope.current.generation === generation) toast.error(error instanceof Error ? error.message : 'Video paste failed. Use Attach files.')
    }).finally(() => {
      if (pending.current === controller) {
        pending.current = null
        if (mounted.current) setPastingVideo(false)
      }
    })
    return true
  }, [])
  return { recoverVideoPaste, pastingVideo }
}

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type AudioHTMLAttributes,
  type RefObject,
  type VideoHTMLAttributes,
} from 'react'
import { usePrivateMediaUrl } from '../../hooks/usePrivateMediaUrl'
import { PRIVATE_MEDIA_ENABLED } from '../../lib/privateMediaUrls'

/** Swap expiring credentials without resetting an in-progress recording or video. */
function usePrivateMediaSource(
  elementRef: RefObject<HTMLMediaElement | null>,
  source: string | undefined,
  resolvedSource: string | undefined
) {
  const previousSource = useRef<{ source?: string; resolved?: string }>({})
  const pendingPlayback = useRef<{ source: string; position: number; paused: boolean; rate: number } | null>(null)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element) return
    const previous = previousSource.current
    if (previous.source === source && previous.resolved === resolvedSource) return

    if (source !== previous.source) pendingPlayback.current = null
    if (source && source === previous.source && previous.resolved && !pendingPlayback.current) {
      pendingPlayback.current = {
        source,
        position: element.currentTime,
        paused: element.paused,
        rate: element.playbackRate,
      }
    }
    const playback = pendingPlayback.current?.source === source ? pendingPlayback.current : null
    previousSource.current = { source, resolved: resolvedSource }

    const restorePlayback = () => {
      if (!playback) return
      if (Number.isFinite(playback.position)) element.currentTime = playback.position
      element.playbackRate = playback.rate
      if (!playback.paused) void element.play().catch(() => undefined)
      if (pendingPlayback.current === playback) pendingPlayback.current = null
    }

    if (resolvedSource) {
      if (playback) element.addEventListener('loadedmetadata', restorePlayback, { once: true })
      element.setAttribute('src', resolvedSource)
    } else {
      // Pending or revoked access must never fall back to a persisted public URL.
      element.removeAttribute('src')
      if (previous.resolved) {
        element.pause()
        element.load()
      }
    }

    return () => element.removeEventListener('loadedmetadata', restorePlayback)
  }, [elementRef, resolvedSource, source])
}

// Select inside forwardRef so disabled builds discard the protected component entirely.
export const PrivateMediaAudio = forwardRef<HTMLAudioElement, AudioHTMLAttributes<HTMLAudioElement>>(
  PRIVATE_MEDIA_ENABLED ? function SignedPrivateMediaAudio({ src, ...props }, forwardedRef) {
    const elementRef = useRef<HTMLAudioElement>(null)
    const resolvedSource = usePrivateMediaUrl(src)
    useImperativeHandle(forwardedRef, () => elementRef.current!, [])
    usePrivateMediaSource(elementRef, src, resolvedSource)
    return <audio {...props} ref={elementRef} />
  } : function PublicMediaAudio(props, ref) { return <audio {...props} ref={ref} /> }
)

export const PrivateMediaVideo = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement>>(
  PRIVATE_MEDIA_ENABLED ? function SignedPrivateMediaVideo({ src, poster, ...props }, forwardedRef) {
    const elementRef = useRef<HTMLVideoElement>(null)
    const resolvedSource = usePrivateMediaUrl(src)
    const resolvedPoster = usePrivateMediaUrl(poster)
    useImperativeHandle(forwardedRef, () => elementRef.current!, [])
    usePrivateMediaSource(elementRef, src, resolvedSource)
    return <video {...props} ref={elementRef} poster={resolvedPoster} />
  } : function PublicMediaVideo(props, ref) { return <video {...props} ref={ref} /> }
)

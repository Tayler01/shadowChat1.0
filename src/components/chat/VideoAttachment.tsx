import React, { useEffect, useRef, useState } from 'react'
import {
  CHAT_MEDIA_INTRINSIC_HEIGHT,
  CHAT_MEDIA_INTRINSIC_WIDTH,
  getChatMediaAspectClass,
  getChatMediaOrientation,
  type ChatMediaOrientation,
} from './messageDisplay'

interface VideoAttachmentProps {
  url: string
  meta?: string
}

const VIDEO_AUTOPLAY_THRESHOLD = 0.6

export const VideoAttachment: React.FC<VideoAttachmentProps> = ({ url }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const shouldAutoPlayRef = useRef(false)
  const hasPreparedAutoplayRef = useRef(false)
  const [orientation, setOrientation] = useState<ChatMediaOrientation>('portrait')
  const [isMuted, setIsMuted] = useState(true)

  useEffect(() => {
    const video = videoRef.current
    setOrientation('portrait')
    setIsMuted(true)
    shouldAutoPlayRef.current = false
    hasPreparedAutoplayRef.current = false

    if (video) {
      video.muted = true
      video.defaultMuted = true
    }
  }, [url])

  useEffect(() => {
    const video = videoRef.current
    if (
      !video ||
      typeof IntersectionObserver === 'undefined' ||
      typeof document === 'undefined'
    ) {
      return
    }

    let disposed = false

    const prepareMutedAutoplay = () => {
      if (hasPreparedAutoplayRef.current) {
        return
      }

      video.muted = true
      video.defaultMuted = true
      setIsMuted(true)
      hasPreparedAutoplayRef.current = true
    }

    const pauseVideo = () => {
      video.pause()
    }

    const playIfFocused = () => {
      if (disposed || !shouldAutoPlayRef.current || document.visibilityState === 'hidden') {
        return
      }

      prepareMutedAutoplay()
      void video.play().catch(() => {
        pauseVideo()
      })
    }

    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0]
        shouldAutoPlayRef.current = Boolean(
          entry?.isIntersecting && entry.intersectionRatio >= VIDEO_AUTOPLAY_THRESHOLD
        )

        if (shouldAutoPlayRef.current) {
          playIfFocused()
        } else {
          pauseVideo()
        }
      },
      { threshold: [0, VIDEO_AUTOPLAY_THRESHOLD, 1] }
    )

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pauseVideo()
        return
      }

      playIfFocused()
    }

    observer.observe(video)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      disposed = true
      shouldAutoPlayRef.current = false
      observer.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      pauseVideo()
    }
  }, [url])

  return (
    <video
      ref={videoRef}
      controls
      muted={isMuted}
      playsInline
      preload="metadata"
      src={url}
      width={CHAT_MEDIA_INTRINSIC_WIDTH}
      height={CHAT_MEDIA_INTRINSIC_HEIGHT}
      data-chat-media="video"
      className={[
        'mt-1 block max-h-[42vh] w-[min(10rem,100%)] max-w-full rounded-[var(--radius-md)] object-cover sm:w-[11rem]',
        getChatMediaAspectClass(orientation),
      ].join(' ')}
      onLoadedMetadata={event => {
        const video = event.currentTarget
        setOrientation(getChatMediaOrientation(video.videoWidth, video.videoHeight))
      }}
      onVolumeChange={event => {
        setIsMuted(event.currentTarget.muted)
      }}
    />
  )
}

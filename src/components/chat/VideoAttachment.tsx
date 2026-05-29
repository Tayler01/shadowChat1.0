import React, { useEffect, useState } from 'react'
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

export const VideoAttachment: React.FC<VideoAttachmentProps> = ({ url }) => {
  const [orientation, setOrientation] = useState<ChatMediaOrientation>('portrait')

  useEffect(() => {
    setOrientation('portrait')
  }, [url])

  return (
    <video
      controls
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
    />
  )
}

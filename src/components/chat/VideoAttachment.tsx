import React from 'react'

interface VideoAttachmentProps {
  url: string
  meta?: string
}

export const VideoAttachment: React.FC<VideoAttachmentProps> = ({ url }) => {
  return (
    <div className="mt-1 w-[min(22rem,calc(100vw-7rem))] max-w-full">
      <video
        controls
        playsInline
        preload="metadata"
        src={url}
        className="aspect-video w-full rounded-[var(--radius-md)] object-contain"
      />
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { NewsFeedMedia } from '../../lib/supabase'

const uniqueMediaSources = (...sources: Array<string | null | undefined>) =>
  sources
    .map(source => source?.trim() || '')
    .filter((source, index, all): source is string => Boolean(source && all.indexOf(source) === index))

function getNewsMediaSources(media: NewsFeedMedia | null | undefined) {
  return uniqueMediaSources(media?.thumbnail_url, media?.url)
}

export function NewsMediaImage({
  media,
  alt,
  className,
  fallbackClassName,
  loading = 'lazy',
}: {
  media: NewsFeedMedia
  alt: string
  className?: string
  fallbackClassName?: string
  loading?: 'eager' | 'lazy'
}) {
  const sources = useMemo(() => getNewsMediaSources(media), [media])
  const sourcesKey = sources.join('\n')
  const [sourceIndex, setSourceIndex] = useState(0)
  const [failed, setFailed] = useState(sources.length === 0)

  useEffect(() => {
    setSourceIndex(0)
    setFailed(sources.length === 0)
  }, [sources.length, sourcesKey])

  if (failed) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-[linear-gradient(135deg,rgba(215,170,70,0.12),rgba(5,6,8,0.9))] text-[rgba(255,240,184,0.72)]',
          className,
          fallbackClassName
        )}
        aria-label={`${alt} media preview unavailable`}
      >
        <ImageIcon className="h-5 w-5" aria-hidden="true" />
      </div>
    )
  }

  return (
    <img
      src={sources[sourceIndex]}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      onError={() => {
        setSourceIndex(index => {
          const nextIndex = index + 1
          if (nextIndex < sources.length) return nextIndex
          setFailed(true)
          return index
        })
      }}
    />
  )
}

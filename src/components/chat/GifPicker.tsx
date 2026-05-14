import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { searchKlipyGifs, type GifResult } from '../../lib/gifs'
import { Button } from '../ui/Button'
import { LoadingSpinner } from '../ui/LoadingSpinner'

type GifPickerProps = {
  onSelect: (gif: GifResult) => void
  onClose: () => void
}

export const GifPicker: React.FC<GifPickerProps> = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [gifs, setGifs] = useState<GifResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const label = useMemo(
    () => (debouncedQuery ? `GIF results for ${debouncedQuery}` : 'Trending GIFs'),
    [debouncedQuery]
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, 250)

    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    searchKlipyGifs({
      query: debouncedQuery,
      limit: 24,
      signal: controller.signal,
    })
      .then(result => {
        setGifs(result.gifs)
      })
      .catch(err => {
        if (controller.signal.aborted) return
        setGifs([])
        setError(err instanceof Error ? err.message : 'Unable to load GIFs')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [debouncedQuery])

  const handleSelect = useCallback((gif: GifResult) => {
    onSelect(gif)
  }, [onSelect])

  return (
    <div
      className="glass-panel-strong absolute bottom-full left-2 right-2 z-[92] mb-2 max-h-[min(28rem,calc(100vh-8rem))] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-panel)] shadow-[var(--shadow-panel-strong)] md:left-0 md:right-auto md:w-[24rem]"
      role="dialog"
      aria-label="GIF picker"
    >
      <div className="border-b border-[var(--border-panel)] p-2.5">
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search KLIPY</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search KLIPY"
              className="obsidian-input h-10 w-full rounded-[var(--radius-sm)] py-2 pl-9 pr-3 text-sm"
            />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 rounded-[var(--radius-sm)] p-0"
            onClick={onClose}
            aria-label="Close GIF picker"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
          <span>{label}</span>
          <span>Powered by KLIPY</span>
        </div>
      </div>

      <div className="h-[min(20rem,calc(100vh-14rem))] overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
            <LoadingSpinner size="sm" />
            <span>Loading GIFs...</span>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-red-200">
            {error}
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-[var(--text-muted)]">
            No GIFs found.
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2" aria-label={label}>
            {gifs.map(gif => (
              <button
                key={gif.id}
                type="button"
                onClick={() => handleSelect(gif)}
                className="group relative aspect-square overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] transition hover:border-[var(--border-glow)] focus:outline-none focus:ring-2 focus:ring-[rgba(215,170,70,0.35)]"
                aria-label={`Send GIF ${gif.title}`}
              >
                <img
                  src={gif.previewUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { fetchModerationCaseMedia, type ModerationCaseMediaAsset } from '../../lib/moderationMedia'

type LoadState = {
  caseId: string
  loading: boolean
  loaded: boolean
  assets: ModerationCaseMediaAsset[]
  error: string | null
}

function safeMediaUrl(value?: string) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password ? value : null
  } catch { return null }
}

export function ModerationCaseMedia({ caseId }: { caseId: string }) {
  const [state, setState] = useState<LoadState | null>(null)
  const requestGeneration = useRef(0)
  useEffect(() => {
    requestGeneration.current += 1
    setState(null)
    return () => { requestGeneration.current += 1 }
  }, [caseId])
  const current = state?.caseId === caseId ? state : null

  const load = async () => {
    const generation = ++requestGeneration.current
    setState({ caseId, loading: true, loaded: false, assets: [], error: null })
    try {
      const assets = await fetchModerationCaseMedia(caseId)
      if (generation !== requestGeneration.current) return
      setState({ caseId, loading: false, loaded: true, assets, error: null })
    } catch (error) {
      if (generation !== requestGeneration.current) return
      setState({ caseId, loading: false, loaded: false, assets: [], error: error instanceof Error ? error.message : 'Reported media could not be loaded. Please try again.' })
    }
  }

  return <div className="mt-4 space-y-3 border-t border-[var(--border-subtle)] pt-4">
    <p className="text-xs leading-5 text-[var(--text-muted)]">Reported media may contain sensitive content. Load it only when you are ready to review this case. Media does not play automatically.</p>
    <Button variant="secondary" size="sm" loading={current?.loading} disabled={current?.loading} onClick={() => void load()}>{current?.error ? 'Retry loading reported media' : current?.loaded ? 'Reload reported media' : 'Load reported media'}</Button>
    {current?.error && <p role="alert" className="break-words text-sm text-red-200">{current.error}</p>}
    {current?.loaded && current.assets.length === 0 && <p role="status" className="text-sm text-[var(--text-muted)]">No reported media is available for this case.</p>}
    {current?.assets.map(asset => {
      const url = asset.status === 'ready' ? safeMediaUrl(asset.url) : null
      return <div key={asset.id} className="rounded-xl border border-[var(--border-subtle)] p-3">
        <p className="mb-2 text-xs capitalize text-[var(--text-muted)]">Reported {asset.kind}</p>
        {asset.status === 'pending' ? <p role="status" className="text-sm text-[var(--text-secondary)]">Evidence capture is pending. Reload reported media to check again.</p>
          : !url ? <p className="text-sm text-[var(--text-secondary)]">Reported media is unavailable.{asset.error ? ` ${asset.error}` : ''}</p>
            : asset.kind === 'image' ? <img src={url} alt="Reported image evidence" className="max-h-96 max-w-full rounded-lg object-contain" referrerPolicy="no-referrer" />
              : asset.kind === 'audio' ? <audio src={url} controls preload="none" className="w-full" />
                : asset.kind === 'video' && asset.contentType !== 'application/x-bunny-player' ? <video src={url} controls playsInline preload="none" className="max-h-96 w-full rounded-lg" />
                  : <a href={url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-[var(--theme-accent-readable)] underline underline-offset-4">Open reported {asset.kind === 'video' ? 'video' : 'file'}</a>}
      </div>
    })}
  </div>
}

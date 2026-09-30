import type { AttachmentStageView } from '../../hooks/useStagedAttachments'
import { useEffect, useRef } from 'react'
import { FileText, Play, RotateCcw, X } from 'lucide-react'
import toast from 'react-hot-toast'

export interface StagedAttachmentListProps {
  items: AttachmentStageView[]
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onCancel: (id: string) => void
  className?: string
}

export function StagedAttachmentList({ items, onRemove, onRetry, onCancel, className = '' }: StagedAttachmentListProps) {
  const reportedErrorsRef = useRef(new Set<string>())
  useEffect(() => {
    const failed = new Set<string>()
    items.forEach(item => {
      if (item.status !== 'failed' || !item.error) return
      const key = `${item.id}:${item.error}`
      failed.add(key)
      if (!reportedErrorsRef.current.has(key)) toast.error(item.error)
    })
    reportedErrorsRef.current = failed
  }, [items])
  if (items.length === 0) return null
  return (
    <div className={`flex gap-2 overflow-x-auto px-3 pt-3 pb-1 ${className}`} aria-label="Staged attachments">
      {items.map(item => (
        <div key={item.id} className="relative w-20 shrink-0 text-xs" data-staged-attachment-kind={item.kind}>
          <div className="relative h-20 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)]">
          {item.previewUrl && item.kind === 'image' ? (
            <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
          ) : item.previewUrl && item.kind === 'video' ? (
            <>
              <video src={item.previewUrl} aria-label={`Video preview: ${item.file.name}`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center"><Play className="h-6 w-6 rounded-full bg-black/50 p-1 text-white" /></span>
            </>
          ) : (
            <span aria-hidden="true" className="flex h-full items-center justify-center text-[var(--text-secondary)]"><FileText className="h-7 w-7" /></span>
          )}
            {item.status === 'uploading' && <progress className="absolute bottom-2 left-2 h-1 w-16 accent-[var(--theme-accent)]" max={100} value={item.progress} aria-label={`Upload progress for ${item.file.name}`} />}
          </div>
          <div className="sr-only" role="status">
            {item.file.name}: {item.status === 'uploading' ? item.progress === 0 ? 'Preparing upload' : `Uploading ${Math.round(item.progress)}%` : item.status === 'sending' ? 'Sending' : item.status === 'failed' ? item.error || 'Needs retry' : 'Ready to send'}
          </div>
          {item.status === 'uploading' ? (
            <button type="button" onClick={() => onCancel(item.id)} className="absolute -right-1 -top-1 flex h-11 w-11 items-center justify-center" aria-label={`Cancel upload of ${item.file.name}`}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white"><X className="h-3.5 w-3.5" /></span></button>
          ) : item.status === 'failed' ? (
            <button type="button" onClick={() => onRetry(item.id)} title={item.error || 'Retry attachment'} className="absolute bottom-0 left-0 flex h-11 w-11 items-center justify-center text-[var(--theme-accent-readable)]" aria-label={`Retry ${item.file.name}`}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/80"><RotateCcw className="h-4 w-4" /></span></button>
          ) : null}
          {item.status !== 'uploading' && item.status !== 'sending' && (
            <button type="button" onClick={() => onRemove(item.id)} className="absolute -right-1 -top-1 flex h-11 w-11 items-center justify-center" aria-label={`Remove ${item.file.name}`}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white"><X className="h-3.5 w-3.5" /></span></button>
          )}
        </div>
      ))}
    </div>
  )
}

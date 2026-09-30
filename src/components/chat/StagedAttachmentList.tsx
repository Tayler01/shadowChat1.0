import type { AttachmentStageView } from '../../hooks/useStagedAttachments'

export interface StagedAttachmentListProps {
  items: AttachmentStageView[]
  onRemove: (id: string) => void
  onRetry: (id: string) => void
  onCancel: (id: string) => void
}

const formatFileSize = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.max(1, Math.round(bytes / 1024))} KiB`
  : `${(bytes / 1024 / 1024).toFixed(2)} MiB`

export function StagedAttachmentList({ items, onRemove, onRetry, onCancel }: StagedAttachmentListProps) {
  if (items.length === 0) return null
  return (
    <div className="mb-2 space-y-2" aria-label="Staged attachments">
      {items.map(item => (
        <div key={item.id} className="flex min-w-0 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-2 text-sm">
          {item.previewUrl && item.kind === 'image' ? (
            <img src={item.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
          ) : item.previewUrl && item.kind === 'video' ? (
            <video src={item.previewUrl} muted playsInline preload="metadata" className="h-12 w-12 shrink-0 rounded object-cover" />
          ) : (
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-[var(--bg-panel-soft)]">📎</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-[var(--text-primary)]" title={item.file.name}>{item.file.name}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {formatFileSize(item.file.size)} · {item.status === 'uploading' ? item.progress === 0 ? 'Preparing upload' : `Uploading ${Math.round(item.progress)}%` : item.status === 'sending' ? 'Sending' : item.status === 'failed' ? 'Needs retry' : 'Ready to send'}
            </div>
            {item.status === 'uploading' && <progress className="mt-1 w-full accent-[var(--theme-accent)]" max={100} value={item.progress} aria-label={`Upload progress for ${item.file.name}`} />}
            {item.error && <div className="text-xs text-red-200" role="alert">{item.error}</div>}
          </div>
          {item.status === 'uploading' ? (
            <button type="button" onClick={() => onCancel(item.id)} className="min-h-11 rounded px-2 text-[var(--theme-accent-readable)]" aria-label={`Cancel upload of ${item.file.name}`}>Cancel</button>
          ) : item.status === 'failed' ? (
            <button type="button" onClick={() => onRetry(item.id)} className="min-h-11 rounded px-2 text-[var(--theme-accent-readable)]" aria-label={`Retry ${item.file.name}`}>Retry</button>
          ) : null}
          {item.status !== 'uploading' && item.status !== 'sending' && (
            <button type="button" onClick={() => onRemove(item.id)} className="min-h-11 rounded px-2 text-[var(--text-secondary)]" aria-label={`Remove ${item.file.name}`}>Remove</button>
          )}
        </div>
      ))}
    </div>
  )
}

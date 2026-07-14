import { AlertTriangle } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { InnerCircleSheet } from './InnerCircleSheet'

export function InnerCircleDeleteDialog({
  open,
  circleName,
  onConfirm,
  onClose,
  pending = false,
  error = null,
}: {
  open: boolean
  circleName: string
  onConfirm: () => void
  onClose: () => void
  pending?: boolean
  error?: string | null
}) {
  return (
    <InnerCircleSheet
      open={open}
      onClose={onClose}
      dismissible={!pending}
      title={`Delete ${circleName}?`}
      eyebrow="Private circle"
      testId="inner-circle-delete-dialog"
      footer={(
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>Keep Circle</Button>
          <Button type="button" variant="danger" onClick={onConfirm} loading={pending}>Delete</Button>
        </div>
      )}
    >
      <div className="flex gap-3 rounded-[var(--radius-lg)] border border-red-400/25 bg-red-950/20 p-4 text-sm leading-6 text-red-50">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <p>This removes the private list and its membership. It does not remove anyone from your Connections or change your messages.</p>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-100">{error}</p>}
    </InnerCircleSheet>
  )
}

import { useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ImagePlus, ShieldAlert, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../../components/ui/Button'
import { useDialogAccessibility } from '../../hooks/useDialogAccessibility'
import {
  formatModerationCaseReference,
  MODERATION_REPORT_REASONS,
  submitModerationReport,
  validateModerationEvidenceFiles,
  type ModerationReportCategory,
  type ModerationReportReceipt,
  type ModerationReportTarget,
} from '../../lib/moderationCases'

const targetKindLabel: Record<ModerationReportTarget['type'], string> = {
  user: 'member profile',
  general_message: 'General Chat message',
  dm_message: 'direct message',
  shadow_pin_image: 'ShadowPin post',
  shadow_pin_comment: 'ShadowPin comment',
}

export function MemberReportSheet({ target, onClose }: {
  target: ModerationReportTarget | null
  onClose: () => void
}) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const [category, setCategory] = useState<ModerationReportCategory | ''>('')
  const [details, setDetails] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<ModerationReportReceipt | null>(null)
  const dialogRef = useDialogAccessibility<HTMLElement>({
    open: Boolean(target),
    onClose,
    dismissible: !submitting,
    initialFocusRef: closeRef,
  })

  useEffect(() => {
    if (!target) return
    setCategory('')
    setDetails('')
    setFiles([])
    setReceipt(null)
  }, [target])

  if (!target) return null

  const submit = async () => {
    if (!category) {
      toast.error('Choose the reason that best fits')
      return
    }
    setSubmitting(true)
    try {
      const nextReceipt = await submitModerationReport({ target, category, details, attachments: files })
      setReceipt(nextReceipt)
      window.dispatchEvent(new CustomEvent('shadowchat:moderation-report-submitted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send this report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[180] flex items-end justify-center bg-black/72 px-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={event => {
      if (event.currentTarget === event.target && !submitting) onClose()
    }}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[min(92dvh,860px)] w-full max-w-xl overflow-y-auto rounded-t-[28px] border border-[var(--border-panel)] bg-[var(--bg-elevated)] shadow-[var(--shadow-modal)] sm:rounded-[28px]"
      >
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border-subtle)] bg-[color:var(--bg-elevated)]/95 px-5 py-4 backdrop-blur-xl">
          <span className="grid h-10 w-10 place-items-center rounded-2xl border border-[var(--theme-accent-border-soft)] bg-[var(--theme-accent-soft)] text-[var(--theme-accent-readable)]">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg font-semibold text-[var(--text-primary)]">Report a safety concern</h2>
            <p className="text-xs text-[var(--text-muted)]">Private to ShadowChat operators</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={submitting} aria-label="Close report" className="grid h-11 w-11 place-items-center rounded-full text-[var(--text-muted)] hover:bg-[var(--theme-surface-hover)] hover:text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]">
            <X className="h-5 w-5" />
          </button>
        </header>

        {receipt ? (
          <div className="space-y-5 p-6 text-center">
            <CheckCircle2 className="mx-auto h-14 w-14 text-[var(--theme-accent-readable)]" />
            <div>
              <h3 className="text-xl font-semibold text-[var(--text-primary)]">Report received</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">An operator can now review the captured content. Reporting never takes automatic action.</p>
            </div>
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">Reference</p>
              <p className="mt-1 font-mono text-lg text-[var(--theme-accent-readable)]">{formatModerationCaseReference(receipt.caseNumber)}</p>
            </div>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <div className="space-y-6 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--text-muted)]">Reporting {targetKindLabel[target.type]}</p>
              <p className="mt-2 font-medium text-[var(--text-primary)]">{target.label}</p>
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-[var(--text-secondary)]">{target.preview}</p>
            </div>

            <fieldset>
              <legend className="mb-3 text-sm font-semibold text-[var(--text-primary)]">What happened?</legend>
              <div className="grid gap-2">
                {MODERATION_REPORT_REASONS.map(reason => (
                  <label key={reason.value} className={`flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors ${category === reason.value ? 'border-[var(--border-glow)] bg-[var(--theme-accent-soft)]' : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.02)] hover:bg-[var(--theme-surface-hover)]'}`}>
                    <input className="mt-1 accent-[var(--theme-accent)]" type="radio" name="report-reason" value={reason.value} checked={category === reason.value} onChange={() => setCategory(reason.value)} />
                    <span>
                      <span className="block text-sm font-medium text-[var(--text-primary)]">{reason.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{reason.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Helpful context <span className="font-normal text-[var(--text-muted)]">(optional)</span></span>
              <textarea value={details} onChange={event => setDetails(event.target.value.slice(0, 2000))} rows={4} placeholder="Tell the operator what they should know…" className="mt-2 w-full resize-none rounded-2xl border border-[var(--border-panel)] bg-[var(--input-bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-focus-ring)]" />
              <span className="mt-1 block text-right text-xs text-[var(--text-muted)]">{details.length}/2000</span>
            </label>

            <div>
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-panel)] bg-[var(--bg-panel)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:border-[var(--border-glow)] hover:text-[var(--text-primary)] focus-within:ring-2 focus-within:ring-[var(--theme-focus-ring)]">
                <ImagePlus className="h-4 w-4" /> Add screenshots
                <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={event => {
                  try {
                    setFiles(validateModerationEvidenceFiles(Array.from(event.target.files ?? [])))
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : 'Those files cannot be attached')
                    event.target.value = ''
                  }
                }} />
              </label>
              {files.length > 0 && <p className="mt-2 text-xs text-[var(--text-muted)]">{files.length} private screenshot{files.length === 1 ? '' : 's'} attached</p>}
            </div>

            <div className="flex gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-5 text-[var(--text-secondary)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              If someone is in immediate danger, contact local emergency services. ShadowChat reports are reviewed in-app and are not an emergency service.
            </div>

            <Button className="w-full" loading={submitting} onClick={() => void submit()}>Send private report</Button>
          </div>
        )}
      </section>
    </div>
  )
}

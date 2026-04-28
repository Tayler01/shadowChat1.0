import React, { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bug,
  CheckCircle2,
  ChevronLeft,
  ImagePlus,
  Lightbulb,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '../ui/Button'
import {
  MAX_FEEDBACK_ATTACHMENTS,
  MAX_FEEDBACK_ATTACHMENT_BYTES,
  submitFeedback,
  type FeedbackSubmissionType,
} from '../../lib/feedback'

interface FeedbackSubmissionModalProps {
  open: boolean
  onClose: () => void
  onSubmitted?: (submissionId: string) => void
}

type Step = 0 | 1 | 2 | 3

const typeOptions: Array<{
  value: FeedbackSubmissionType
  label: string
  description: string
  icon: typeof Bug
}> = [
  {
    value: 'bug',
    label: 'Bug report',
    description: 'Something is broken, confusing, or unreliable.',
    icon: Bug,
  },
  {
    value: 'feature',
    label: 'Feature idea',
    description: 'A new tool, workflow, or polish request.',
    icon: Lightbulb,
  },
]

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const FeedbackSubmissionModal: React.FC<FeedbackSubmissionModalProps> = ({
  open,
  onClose,
  onSubmitted,
}) => {
  const [step, setStep] = useState<Step>(0)
  const [type, setType] = useState<FeedbackSubmissionType>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const remainingSlots = MAX_FEEDBACK_ATTACHMENTS - attachments.length
  const canContinueFromDetails = title.trim().length >= 3 && description.trim().length >= 10
  const activeType = useMemo(
    () => typeOptions.find((option) => option.value === type) ?? typeOptions[0],
    [type]
  )

  const resetAndClose = () => {
    if (submitting) return
    setStep(0)
    setType('bug')
    setTitle('')
    setDescription('')
    setAttachments([])
    onClose()
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return

    const nextFiles = Array.from(files)
    const accepted: File[] = []

    for (const file of nextFiles) {
      if (!file.type.startsWith('image/')) {
        toast.error('Only image attachments are supported')
        continue
      }

      if (file.size > MAX_FEEDBACK_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is larger than 10 MB`)
        continue
      }

      accepted.push(file)
    }

    if (accepted.length === 0) {
      return
    }

    setAttachments((current) => {
      const room = MAX_FEEDBACK_ATTACHMENTS - current.length
      if (accepted.length > room) {
        toast.error(`Attach up to ${MAX_FEEDBACK_ATTACHMENTS} images`)
      }

      return [...current, ...accepted.slice(0, room)]
    })

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async () => {
    try {
      setSubmitting(true)
      const result = await submitFeedback({
        type,
        title,
        description,
        attachments,
      })

      toast.success('Feedback sent')
      onSubmitted?.(result.id)
      setStep(3)
    } catch (error) {
      console.error(error)
      toast.error(error instanceof Error ? error.message : 'Could not send feedback')
    } finally {
      setSubmitting(false)
    }
  }

  const stepLabels = ['Type', 'Details', 'Images']

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(4,5,6,0.72)] p-3 backdrop-blur-md sm:items-center sm:p-6">
          <motion.button
            type="button"
            aria-label="Dismiss feedback"
            className="absolute inset-0 cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={resetAndClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="popup-surface relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] sm:max-h-[calc(100dvh-3rem)]"
          >
            <div className="border-b border-[var(--border-subtle)] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-gold)]">
                    <Send className="h-3.5 w-3.5" />
                    Feedback
                  </div>
                  <h2 id="feedback-modal-title" className="text-2xl font-semibold leading-tight text-[var(--text-primary)]">
                    Send a bug report or feature idea
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    Step through the essentials and attach screenshots when they help.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={resetAndClose}
                  disabled={submitting}
                  className="popup-close flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Close feedback"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {step < 3 && (
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {stepLabels.map((label, index) => (
                    <div
                      key={label}
                      className={`rounded-[var(--radius-sm)] border px-3 py-2 text-center text-xs font-medium uppercase tracking-[0.14em] ${
                        step === index
                          ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.12)] text-[var(--text-gold)]'
                          : step > index
                            ? 'border-[rgba(94,164,115,0.32)] bg-[rgba(94,164,115,0.08)] text-[rgb(134,214,158)]'
                            : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)]'
                      }`}
                    >
                      {label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-y-auto p-5 sm:p-6">
              {step === 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {typeOptions.map((option) => {
                    const selected = type === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setType(option.value)}
                        aria-pressed={selected}
                        className={`rounded-[var(--radius-md)] border p-4 text-left transition-all ${
                          selected
                            ? 'border-[var(--border-glow)] bg-[rgba(215,170,70,0.12)] shadow-[var(--shadow-gold-soft)]'
                            : 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] hover:border-[var(--border-panel)] hover:bg-[rgba(255,255,255,0.05)]'
                        }`}
                      >
                        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-sm)] border border-[rgba(215,170,70,0.18)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]">
                          <option.icon className="h-5 w-5" />
                        </span>
                        <span className="block text-base font-semibold text-[var(--text-primary)]">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-sm leading-5 text-[var(--text-muted)]">
                          {option.description}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
                      Brief description
                    </span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      maxLength={140}
                      placeholder={type === 'bug' ? 'Message feed jumps on reload' : 'Add saved message drafts'}
                      className="w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.28)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-glow)]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
                      Details
                    </span>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      maxLength={4000}
                      rows={7}
                      placeholder={
                        type === 'bug'
                          ? 'What happened, what you expected, and what device or screen you were using.'
                          : 'What should it do, where should it live, and why would it help?'
                      }
                      className="min-h-[11rem] w-full resize-y rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.28)] px-4 py-3 text-sm leading-6 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-glow)]"
                    />
                  </label>

                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    <span>{activeType.label}</span>
                    <span>{description.trim().length}/4000</span>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="rounded-[var(--radius-md)] border border-dashed border-[rgba(215,170,70,0.28)] bg-[rgba(215,170,70,0.06)] p-5 text-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      className="hidden"
                      onChange={(event) => handleFiles(event.target.files)}
                    />
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[var(--radius-sm)] border border-[rgba(215,170,70,0.2)] bg-[rgba(0,0,0,0.22)] text-[var(--text-gold)]">
                      <ImagePlus className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      Add screenshots or concept images
                    </p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      PNG, JPG, WebP, or GIF. Up to {MAX_FEEDBACK_ATTACHMENTS} images, 10 MB each.
                    </p>
                    <Button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={remainingSlots <= 0}
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                    >
                      <ImagePlus className="mr-2 h-4 w-4" />
                      Choose Images
                    </Button>
                  </div>

                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      {attachments.map((file, index) => (
                        <div
                          key={`${file.name}-${file.size}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                              {file.name}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                              {formatBytes(file.size)} / {file.type || 'image'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-subtle)] text-[var(--text-muted)] transition-colors hover:border-[rgba(190,52,85,0.42)] hover:text-red-200"
                            aria-label={`Remove ${file.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="py-8 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[rgba(94,164,115,0.34)] bg-[rgba(94,164,115,0.12)] text-[rgb(134,214,158)]">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-semibold text-[var(--text-primary)]">
                    Feedback sent
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                    It is stored with your account and ready for the admin review tools coming next.
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-3 border-t border-[var(--border-subtle)] bg-[rgba(10,11,12,0.82)] p-5 sm:flex sm:items-center sm:justify-between sm:p-6">
              {step === 3 ? (
                <Button onClick={resetAndClose} className="w-full justify-center sm:ml-auto sm:w-auto">
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    onClick={() => setStep((current) => Math.max(0, current - 1) as Step)}
                    disabled={step === 0 || submitting}
                    variant="ghost"
                    className="w-full justify-center sm:w-auto"
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Back
                  </Button>
                  <div className="grid gap-3 sm:flex sm:justify-end">
                    {step < 2 ? (
                      <Button
                        type="button"
                        onClick={() => setStep((current) => Math.min(2, current + 1) as Step)}
                        disabled={step === 1 && !canContinueFromDetails}
                        className="w-full justify-center sm:w-auto"
                      >
                        Continue
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => void handleSubmit()}
                        loading={submitting}
                        className="w-full justify-center sm:w-auto"
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Send Feedback
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

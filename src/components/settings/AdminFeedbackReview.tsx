import React, { useMemo, useState } from 'react'
import {
  Bug,
  Trash2,
  ExternalLink,
  Image as ImageIcon,
  Lightbulb,
  MessageSquarePlus,
  Search,
  X,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { useAdminFeedback } from '../../hooks/useAdminFeedback'
import type {
  AdminFeedbackAttachmentRecord,
  AdminFeedbackSubmission,
  FeedbackSubmissionType,
} from '../../lib/feedback'

type FeedbackFilter = 'all' | FeedbackSubmissionType

const typeLabels: Record<FeedbackSubmissionType, string> = {
  bug: 'Bug',
  feature: 'Suggestion',
}

const typeStyles: Record<FeedbackSubmissionType, string> = {
  bug: 'border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] text-red-100',
  feature: 'border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]',
}

const statusStyles: Record<AdminFeedbackSubmission['status'], string> = {
  new: 'border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]',
  reviewing: 'border-[rgba(224,164,62,0.26)] bg-[rgba(224,164,62,0.1)] text-amber-100',
  planned: 'border-[rgba(155,168,142,0.32)] bg-[rgba(118,130,102,0.12)] text-[rgb(214,224,199)]',
  closed: 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)]',
}

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

const getSubmitterName = (submission: AdminFeedbackSubmission) =>
  submission.user?.display_name || submission.user?.username || 'Unknown user'

const getSubmitterHandle = (submission: AdminFeedbackSubmission) =>
  submission.user?.username ? `@${submission.user.username}` : submission.user_id

const getTypeIcon = (type: FeedbackSubmissionType) =>
  type === 'bug' ? Bug : Lightbulb

function TypeBadge({ type }: { type: FeedbackSubmissionType }) {
  const Icon = getTypeIcon(type)

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${typeStyles[type]}`}>
      <Icon className="h-3 w-3" />
      {typeLabels[type]}
    </span>
  )
}

function StatusBadge({ status }: { status: AdminFeedbackSubmission['status'] }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${statusStyles[status]}`}>
      {status}
    </span>
  )
}

function AttachmentThumbs({ attachments, title }: { attachments: AdminFeedbackAttachmentRecord[]; title: string }) {
  if (attachments.length === 0) return null

  return (
    <div className="mt-3 flex items-center gap-2">
      {attachments.slice(0, 3).map((attachment, index) => (
        <div
          key={attachment.path}
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] text-[var(--text-muted)]"
        >
          {attachment.signedUrl ? (
            <img
              src={attachment.signedUrl}
              alt={`${title} attachment ${index + 1}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
        </div>
      ))}
      {attachments.length > 3 && (
        <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
          +{attachments.length - 3}
        </span>
      )}
    </div>
  )
}

function FeedbackDetailModal({
  submission,
  onClose,
  onDelete,
  deleting,
}: {
  submission: AdminFeedbackSubmission | null
  onClose: () => void
  onDelete: (submission: AdminFeedbackSubmission) => void
  deleting: boolean
}) {
  if (!submission) return null

  return (
    <div className="fixed inset-0 z-[90] bg-black/72 p-3 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(20,22,23,0.98),rgba(9,10,11,0.99))] shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-panel)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={submission.submission_type} />
              <StatusBadge status={submission.status} />
            </div>
            <h2 className="mt-2 truncate text-base font-semibold text-[var(--text-primary)] sm:text-lg">
              {submission.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={deleting}
              onClick={() => onDelete(submission)}
              aria-label="Delete feedback submission"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close feedback submission">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid min-h-full gap-5 p-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.75fr)] lg:p-6">
            <article className="min-w-0">
              <div className="mb-5 flex min-w-0 items-center gap-3">
                <Avatar
                  src={submission.user?.avatar_url}
                  alt={getSubmitterName(submission)}
                  fallback={getSubmitterName(submission).slice(0, 2)}
                  size="md"
                  status={submission.user?.status}
                  userId={submission.user?.id}
                  presenceVisibility={submission.user?.presence_visibility}
                  color={submission.user?.color}
                  showStatus
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{getSubmitterName(submission)}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">{getSubmitterHandle(submission)}</p>
                </div>
              </div>

              <h1 className="break-words text-2xl font-semibold leading-tight text-[var(--text-primary)] sm:text-3xl">
                {submission.title}
              </h1>
              <p className="mt-5 whitespace-pre-wrap break-words text-base leading-8 text-[var(--text-secondary)]">
                {submission.description}
              </p>
            </article>

            <aside className="min-w-0 space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Submission</h3>
                <dl className="mt-3 space-y-3 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Submitted</dt>
                    <dd className="mt-1 text-[var(--text-secondary)]">{formatDateTime(submission.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">User agent</dt>
                    <dd className="mt-1 break-words text-xs leading-5 text-[var(--text-secondary)]">
                      {submission.user_agent || 'Not captured'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Images</h3>
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {submission.attachments.length}
                  </span>
                </div>

                {submission.attachments.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No images attached.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    {submission.attachments.map((attachment, index) => (
                      attachment.signedUrl ? (
                        <a
                          key={attachment.path}
                          href={attachment.signedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.035)] transition-colors hover:border-[var(--border-glow)]"
                        >
                          <div className="relative flex max-h-72 min-h-36 items-center justify-center overflow-hidden bg-black/30">
                            <img
                              src={attachment.signedUrl}
                              alt={`${submission.title} attachment ${index + 1}`}
                              className="max-h-72 w-full object-contain"
                            />
                            <span className="absolute right-2 top-2 rounded-full border border-[rgba(255,240,184,0.28)] bg-black/55 p-1 text-[var(--text-gold)] opacity-0 transition-opacity group-hover:opacity-100">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </span>
                          </div>
                          <p className="truncate px-3 py-2 text-xs text-[var(--text-muted)]">{attachment.name}</p>
                        </a>
                      ) : (
                        <div
                          key={attachment.path}
                          className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3 text-sm text-[var(--text-muted)]"
                        >
                          <ImageIcon className="mb-2 h-4 w-4" />
                          <p className="break-words">{attachment.name}</p>
                          {attachment.signedUrlError && (
                            <p className="mt-2 text-xs text-red-200/85">{attachment.signedUrlError}</p>
                          )}
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

export function AdminFeedbackReview() {
  const { submissions, loading, error, deletingId, deleteSubmission } = useAdminFeedback()
  const [selectedSubmission, setSelectedSubmission] = useState<AdminFeedbackSubmission | null>(null)
  const [filter, setFilter] = useState<FeedbackFilter>('all')
  const [searchTerm, setSearchTerm] = useState('')

  const handleDeleteSubmission = async (submission: AdminFeedbackSubmission) => {
    const confirmed = window.confirm(`Delete "${submission.title}"? This removes the submission and any attached images.`)
    if (!confirmed) return

    try {
      await deleteSubmission(submission)
      setSelectedSubmission(null)
    } catch {
      // The hook surfaces the error in the panel.
    }
  }

  const filteredSubmissions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return submissions.filter(submission => {
      if (filter !== 'all' && submission.submission_type !== filter) return false
      if (!normalizedSearch) return true

      return (
        submission.title.toLowerCase().includes(normalizedSearch) ||
        submission.description.toLowerCase().includes(normalizedSearch) ||
        getSubmitterName(submission).toLowerCase().includes(normalizedSearch) ||
        getSubmitterHandle(submission).toLowerCase().includes(normalizedSearch)
      )
    })
  }, [filter, searchTerm, submissions])

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <MessageIcon />
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Feedback Review</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Submitted bugs, suggestions, and screenshots.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <label className="min-w-0">
          <span className="sr-only">Search feedback</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search title, description, or submitter"
              className="obsidian-input w-full rounded-[var(--radius-md)] py-3 pl-9 pr-3.5 text-sm"
            />
          </div>
        </label>

        <div className="flex rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] p-1">
          {[
            ['all', 'All'],
            ['bug', 'Bugs'],
            ['feature', 'Suggestions'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id as FeedbackFilter)}
              className={`rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium transition-colors ${
                filter === id
                  ? 'bg-[rgba(215,170,70,0.14)] text-[var(--text-gold)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-sm text-[var(--text-muted)]">
          Loading submitted feedback.
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-4 text-sm text-red-100">
          {error}
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-5 text-center text-sm text-[var(--text-muted)]">
          No feedback submissions found.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredSubmissions.map(submission => (
            <button
              key={submission.id}
              type="button"
              onClick={() => setSelectedSubmission(submission)}
              className="group w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.05)]"
            >
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <TypeBadge type={submission.submission_type} />
                    <StatusBadge status={submission.status} />
                    <span className="text-xs text-[var(--text-muted)]">{formatDateTime(submission.created_at)}</span>
                  </div>
                  <h3 className="mt-3 break-words text-base font-semibold text-[var(--text-primary)]">
                    {submission.title}
                  </h3>
                  <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-[var(--text-muted)]">
                    {submission.description}
                  </p>
                  <AttachmentThumbs attachments={submission.attachments} title={submission.title} />
                </div>

                <div className="flex min-w-0 items-center gap-3 lg:min-w-52 lg:justify-end">
                  <Avatar
                    src={submission.user?.avatar_url}
                    alt={getSubmitterName(submission)}
                    fallback={getSubmitterName(submission).slice(0, 2)}
                    size="sm"
                    status={submission.user?.status}
                    userId={submission.user?.id}
                    presenceVisibility={submission.user?.presence_visibility}
                    color={submission.user?.color}
                    showStatus
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{getSubmitterName(submission)}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{getSubmitterHandle(submission)}</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <FeedbackDetailModal
        submission={selectedSubmission}
        onClose={() => setSelectedSubmission(null)}
        onDelete={(submission) => void handleDeleteSubmission(submission)}
        deleting={Boolean(selectedSubmission && deletingId === selectedSubmission.id)}
      />
    </div>
  )
}

function MessageIcon() {
  return (
    <span className="mt-0.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-2.5 text-[var(--text-gold)]">
      <MessageSquarePlus className="h-5 w-5" />
    </span>
  )
}

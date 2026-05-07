import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Bug,
  CheckCircle2,
  Clock,
  ExternalLink,
  GitBranch,
  Image as ImageIcon,
  Lightbulb,
  ListChecks,
  MessageSquarePlus,
  Rocket,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '../ui/Button'
import { Avatar } from '../ui/Avatar'
import { useAdminFeedback } from '../../hooks/useAdminFeedback'
import { useAdminAccess } from '../../hooks/useAdminAccess'
import type {
  AdminFeedbackAttachmentRecord,
  AdminFeedbackSubmission,
  FeedbackBuildRun,
  FeedbackBuildRunLog,
  FeedbackBuildRunStatus,
  FeedbackBuildRunStage,
  FeedbackSubmissionType,
} from '../../lib/feedback'

type FeedbackFilter = 'all' | FeedbackSubmissionType
type AdminFeedbackView = 'submissions' | 'builds'
type BuildFilter = 'active' | FeedbackBuildRunStatus

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

const buildStatusLabels: Record<FeedbackBuildRunStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  ready_for_testing: 'Ready for Testing',
  failed: 'Failed',
  approved_to_merge: 'Approved to Merge',
  merging: 'Merging',
  merged: 'Merged',
  archived: 'Archived',
}

const buildStatusStyles: Record<FeedbackBuildRunStatus, string> = {
  pending: 'border-[rgba(215,170,70,0.24)] bg-[rgba(215,170,70,0.08)] text-[var(--text-gold)]',
  running: 'border-[rgba(224,164,62,0.30)] bg-[rgba(224,164,62,0.12)] text-amber-100',
  ready_for_testing: 'border-[rgba(155,168,142,0.38)] bg-[rgba(118,130,102,0.14)] text-[rgb(218,230,204)]',
  failed: 'border-[rgba(190,52,85,0.42)] bg-[rgba(87,14,28,0.2)] text-red-100',
  approved_to_merge: 'border-[rgba(215,170,70,0.34)] bg-[rgba(215,170,70,0.12)] text-[var(--text-gold)]',
  merging: 'border-[rgba(224,164,62,0.30)] bg-[rgba(224,164,62,0.12)] text-amber-100',
  merged: 'border-[rgba(155,168,142,0.38)] bg-[rgba(118,130,102,0.14)] text-[rgb(218,230,204)]',
  archived: 'border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-muted)]',
}

const stageLabels: Record<FeedbackBuildRunStage, string> = {
  queued: 'Queued',
  classifying: 'Classifying',
  reviewing_affected_code: 'Reviewing affected code',
  debugging_existing_behavior: 'Debugging existing behavior',
  researching_solution: 'Researching solution',
  planning: 'Planning',
  reviewing_plan_against_code: 'Reviewing plan against code',
  implementing: 'Implementing',
  testing: 'Testing',
  branch_pushed: 'Branch pushed',
  ready_for_testing: 'Ready for testing',
  approved_to_merge: 'Approved to merge',
  merging: 'Merging',
  documenting_cleanup: 'Documenting cleanup',
  merged: 'Merged',
  failed: 'Failed',
  archived: 'Archived',
}

const activeBuildStatuses = new Set<FeedbackBuildRunStatus>([
  'pending',
  'running',
  'approved_to_merge',
  'merging',
])

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'Not set'

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const getSubmitterName = (submission: AdminFeedbackSubmission | null | undefined) =>
  submission?.user?.display_name || submission?.user?.username || 'Unknown user'

const getSubmitterHandle = (submission: AdminFeedbackSubmission | null | undefined) =>
  submission?.user?.username ? `@${submission.user.username}` : submission?.user_id || 'Unknown user'

const getTypeIcon = (type: FeedbackSubmissionType) =>
  type === 'bug' ? Bug : Lightbulb

const isBuildActive = (run: FeedbackBuildRun) => activeBuildStatuses.has(run.status)

const getBuildPromptPreview = (
  submission: AdminFeedbackSubmission,
  companionPrompt: string,
  includedAttachments: AdminFeedbackAttachmentRecord[],
  recognitionEnabled: boolean
) => [
  'ShadowChat feedback build request',
  `Submission id: ${submission.id}`,
  `Submission type: ${submission.submission_type}`,
  `Title: ${submission.title}`,
  `Submitter: ${getSubmitterName(submission)}`,
  `Submitter handle: ${getSubmitterHandle(submission)}`,
  `Recognition allowed in evening report: ${recognitionEnabled ? 'yes' : 'no'}`,
  `Included attachment metadata: ${JSON.stringify(includedAttachments.map(({ bucket, path, name, size, type }) => ({ bucket, path, name, size, type })), null, 2)}`,
  `User submission:\n${submission.description}`,
  `Admin companion prompt:\n${companionPrompt.trim()}`,
].join('\n\n')

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

function BuildStatusBadge({ status }: { status: FeedbackBuildRunStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${buildStatusStyles[status]}`}>
      {buildStatusLabels[status]}
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
  latestRun,
  canStartBuild,
  onStartBuild,
  onClose,
  onDelete,
  deleting,
  starting,
}: {
  submission: AdminFeedbackSubmission | null
  latestRun?: FeedbackBuildRun
  canStartBuild: boolean
  onStartBuild: (submission: AdminFeedbackSubmission) => void
  onClose: () => void
  onDelete: (submission: AdminFeedbackSubmission) => void
  deleting: boolean
  starting: boolean
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
              {latestRun && <BuildStatusBadge status={latestRun.status} />}
            </div>
            <h2 className="mt-2 truncate text-base font-semibold text-[var(--text-primary)] sm:text-lg">
              {submission.title}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canStartBuild && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={starting}
                onClick={() => onStartBuild(submission)}
                aria-label="Start feedback build"
              >
                <Rocket className="mr-1.5 h-4 w-4" />
                Start Build
              </Button>
            )}
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

              <ImagesPanel submission={submission} />
            </aside>
          </div>
        </div>
      </div>
    </div>
  )
}

function ImagesPanel({ submission }: { submission: AdminFeedbackSubmission }) {
  return (
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
  )
}

function BuildRunFormModal({
  submission,
  previousRun,
  saving,
  onClose,
  onSubmit,
}: {
  submission: AdminFeedbackSubmission | null
  previousRun?: FeedbackBuildRun
  saving: boolean
  onClose: () => void
  onSubmit: (input: {
    companionPrompt: string
    includedAttachments: AdminFeedbackAttachmentRecord[]
    recognitionEnabled: boolean
  }) => Promise<void>
}) {
  const [companionPrompt, setCompanionPrompt] = useState(previousRun?.companion_prompt ?? '')
  const [recognitionEnabled, setRecognitionEnabled] = useState(previousRun?.recognition_enabled ?? true)
  const [includedPaths, setIncludedPaths] = useState<Set<string>>(() => {
    if (!submission) return new Set()
    if (!previousRun) return new Set(submission.attachments.map(attachment => attachment.path))

    return new Set(previousRun.included_attachments.map(attachment => attachment.path))
  })
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    setCompanionPrompt(previousRun?.companion_prompt ?? '')
    setRecognitionEnabled(previousRun?.recognition_enabled ?? true)
    setIncludedPaths(() => {
      if (!submission) return new Set()
      if (!previousRun) return new Set(submission.attachments.map(attachment => attachment.path))

      return new Set(previousRun.included_attachments.map(attachment => attachment.path))
    })
  }, [previousRun, submission])

  if (!submission) return null

  const includedAttachments = submission.attachments.filter(attachment => includedPaths.has(attachment.path))
  const promptPreview = getBuildPromptPreview(submission, companionPrompt, includedAttachments, recognitionEnabled)

  const handleToggleAttachment = (path: string) => {
    setIncludedPaths(current => {
      const next = new Set(current)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (companionPrompt.trim().length < 20) {
      setLocalError('Add at least 20 characters of companion prompt context.')
      return
    }

    try {
      setLocalError(null)
      await onSubmit({
        companionPrompt,
        includedAttachments,
        recognitionEnabled,
      })
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Unable to send this feedback build to Codex.')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/75 p-3 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true">
      <form
        onSubmit={event => void handleSubmit(event)}
        className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(20,22,23,0.98),rgba(9,10,11,0.99))] shadow-[0_28px_80px_rgba(0,0,0,0.55)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-panel)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={submission.submission_type} />
              {previousRun && <BuildStatusBadge status={previousRun.status} />}
            </div>
            <h2 className="mt-2 truncate text-base font-semibold text-[var(--text-primary)] sm:text-lg">
              {previousRun ? 'Retry Feedback Build' : 'Start Feedback Build'}
            </h2>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close feedback build form">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.8fr)]">
            <section className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">Submission</p>
                <h3 className="mt-2 break-words text-lg font-semibold text-[var(--text-primary)]">{submission.title}</h3>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">
                  {submission.description}
                </p>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-[var(--text-secondary)]">Companion prompt</span>
                <textarea
                  value={companionPrompt}
                  onChange={event => setCompanionPrompt(event.target.value)}
                  rows={8}
                  className="obsidian-input w-full resize-none rounded-[var(--radius-md)] px-3.5 py-3 text-sm leading-6"
                  placeholder="Add the cleanup, priority, constraints, and exact outcome Codex should use before it begins coding."
                />
              </label>

              <label className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <input
                  type="checkbox"
                  checked={recognitionEnabled}
                  onChange={event => setRecognitionEnabled(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-[var(--text-gold)]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">Recognize submitter in evening report</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--text-muted)]">
                    Uses only the public display name or username.
                  </span>
                </span>
              </label>

              {localError && (
                <div className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-3 text-sm text-red-100">
                  {localError}
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Screenshots</h3>
                  <span className="text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {includedAttachments.length}/{submission.attachments.length}
                  </span>
                </div>
                {submission.attachments.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No images attached.</p>
                ) : (
                  <div className="space-y-2">
                    {submission.attachments.map((attachment, index) => (
                      <label
                        key={attachment.path}
                        className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] p-2.5"
                      >
                        <input
                          type="checkbox"
                          checked={includedPaths.has(attachment.path)}
                          onChange={() => handleToggleAttachment(attachment.path)}
                          className="h-4 w-4 accent-[var(--text-gold)]"
                        />
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-black/30 text-[var(--text-muted)]">
                          {attachment.signedUrl ? (
                            <img
                              src={attachment.signedUrl}
                              alt={`${submission.title} selectable attachment ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="h-4 w-4" />
                          )}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-secondary)]">{attachment.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Generated prompt</h3>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-black/25 p-3 text-xs leading-5 text-[var(--text-muted)]">
                  {promptPreview}
                </pre>
              </div>
            </aside>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border-panel)] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-5">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            <Send className="mr-1.5 h-4 w-4" />
            {previousRun ? 'Queue Retry' : 'Send to Codex'}
          </Button>
        </div>
      </form>
    </div>
  )
}

function BuildRunDetailModal({
  run,
  submission,
  logs,
  saving,
  onClose,
  onRetry,
  onApprove,
  onArchive,
}: {
  run: FeedbackBuildRun | null
  submission?: AdminFeedbackSubmission
  logs: FeedbackBuildRunLog[]
  saving: boolean
  onClose: () => void
  onRetry: (run: FeedbackBuildRun) => void
  onApprove: (run: FeedbackBuildRun) => void
  onArchive: (run: FeedbackBuildRun) => void
}) {
  if (!run) return null

  const includedPaths = new Set(run.included_attachments.map(attachment => attachment.path))
  const canArchive = !isBuildActive(run) && run.status !== 'archived'

  return (
    <div className="fixed inset-0 z-[90] bg-black/72 p-3 backdrop-blur-md sm:p-5" role="dialog" aria-modal="true">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(20,22,23,0.98),rgba(9,10,11,0.99))] shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-panel)] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <BuildStatusBadge status={run.status} />
              <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                {stageLabels[run.current_stage]}
              </span>
            </div>
            <h2 className="mt-2 truncate text-base font-semibold text-[var(--text-primary)] sm:text-lg">
              {submission?.title || `Feedback build ${run.id.slice(0, 8)}`}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {run.status === 'failed' && (
              <Button type="button" variant="secondary" size="sm" loading={saving} onClick={() => onRetry(run)}>
                <Rocket className="mr-1.5 h-4 w-4" />
                Retry
              </Button>
            )}
            {run.status === 'ready_for_testing' && run.pr_url && (
              <Button type="button" variant="primary" size="sm" loading={saving} onClick={() => onApprove(run)}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Approve & Merge
              </Button>
            )}
            {canArchive && (
              <Button type="button" variant="ghost" size="sm" loading={saving} onClick={() => onArchive(run)}>
                <Archive className="mr-1.5 h-4 w-4" />
                Archive
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="Close feedback build run">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,0.75fr)]">
            <section className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <BuildLinkCard icon={GitBranch} label="Branch" value={run.branch_name || 'Not pushed yet'} />
                <BuildLinkCard icon={ExternalLink} label="Pull request" value={run.pr_url || 'Not created yet'} href={run.pr_url || undefined} />
                <BuildLinkCard icon={ExternalLink} label="Netlify preview" value={run.preview_url || 'Waiting for preview'} href={run.preview_url || undefined} />
                <BuildLinkCard icon={Clock} label="Created" value={formatDateTime(run.created_at)} />
              </div>

              {run.preview_warning && (
                <div className="flex gap-3 rounded-[var(--radius-md)] border border-[rgba(224,164,62,0.3)] bg-[rgba(224,164,62,0.1)] p-4 text-sm text-amber-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{run.preview_warning}</p>
                </div>
              )}

              {run.failure_message && (
                <div className="flex gap-3 rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-4 text-sm text-red-100">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{run.failure_message}</p>
                </div>
              )}

              {run.summary && (
                <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Summary</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{run.summary}</p>
                </div>
              )}

              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <ListChecks className="h-4 w-4 text-[var(--text-gold)]" />
                  Stage notes
                </h3>
                {logs.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--text-muted)]">No stage notes recorded yet.</p>
                ) : (
                  <ol className="mt-4 space-y-3">
                    {logs.map(log => (
                      <li key={log.id} className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-gold)]">
                            {stageLabels[log.stage]}
                          </span>
                          <span className="text-xs text-[var(--text-muted)]">{formatDateTime(log.created_at)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--text-secondary)]">{log.message}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>

            <aside className="space-y-4">
              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Generated prompt</h3>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-black/25 p-3 text-xs leading-5 text-[var(--text-muted)]">
                  {run.generated_prompt}
                </pre>
              </div>

              <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Screenshots</h3>
                {!submission || submission.attachments.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--text-muted)]">No images attached.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {submission.attachments.map((attachment, index) => {
                      const included = includedPaths.has(attachment.path)

                      return (
                        <div
                          key={attachment.path}
                          className="rounded-[var(--radius-sm)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.18)] p-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-black/30 text-[var(--text-muted)]">
                              {attachment.signedUrl ? (
                                <img
                                  src={attachment.signedUrl}
                                  alt={`${submission.title} build attachment ${index + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-[var(--text-secondary)]">{attachment.name}</p>
                              <p className={included ? 'text-xs text-[var(--text-gold)]' : 'text-xs text-[var(--text-muted)]'}>
                                {included ? 'Included' : 'Excluded'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )
                    })}
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

function BuildLinkCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  href?: string
}) {
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0 text-[var(--text-gold)]" />
      <span className="min-w-0">
        <span className="block text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</span>
        <span className="mt-1 block truncate text-sm text-[var(--text-secondary)]">{value}</span>
      </span>
    </>
  )

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3 transition-colors hover:border-[var(--border-glow)]"
      >
        {content}
      </a>
    )
  }

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3">
      {content}
    </div>
  )
}

function ApproveMergeModal({
  run,
  saving,
  onCancel,
  onConfirm,
}: {
  run: FeedbackBuildRun | null
  saving: boolean
  onCancel: () => void
  onConfirm: (run: FeedbackBuildRun) => Promise<void>
}) {
  if (!run) return null

  return (
    <div className="fixed inset-0 z-[110] bg-black/75 p-4 backdrop-blur-md" role="dialog" aria-modal="true">
      <div className="mx-auto mt-24 max-w-lg rounded-[var(--radius-lg)] border border-[var(--border-panel)] bg-[linear-gradient(180deg,rgba(20,22,23,0.98),rgba(9,10,11,0.99))] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.55)]">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Approve merge?</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Codex will rerun the gates, squash merge to main, document the result, close the feedback submission, and clean up the branch.
        </p>
        <div className="mt-4 space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-3 text-sm">
          <p className="break-words text-[var(--text-secondary)]">PR: {run.pr_url}</p>
          <p className="break-words text-[var(--text-secondary)]">Preview: {run.preview_url || 'No preview URL recorded'}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="primary" loading={saving} onClick={() => void onConfirm(run)}>
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Approve
          </Button>
        </div>
      </div>
    </div>
  )
}

export function AdminFeedbackReview() {
  const { isAdmin } = useAdminAccess()
  const {
    submissions,
    loading,
    error,
    deletingId,
    buildRuns,
    buildLogsByRunId,
    buildLoading,
    buildError,
    activeBuildActionId,
    refreshBuildRuns,
    deleteSubmission,
    startBuildRun,
    retryBuildRun,
    approveMerge,
    archiveBuildRun,
  } = useAdminFeedback({ buildsEnabled: isAdmin })
  const [selectedSubmission, setSelectedSubmission] = useState<AdminFeedbackSubmission | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [buildDraftSubmission, setBuildDraftSubmission] = useState<AdminFeedbackSubmission | null>(null)
  const [retryRun, setRetryRun] = useState<FeedbackBuildRun | undefined>()
  const [approveRun, setApproveRun] = useState<FeedbackBuildRun | null>(null)
  const [view, setView] = useState<AdminFeedbackView>('submissions')
  const [filter, setFilter] = useState<FeedbackFilter>('all')
  const [buildFilter, setBuildFilter] = useState<BuildFilter>('active')
  const [searchTerm, setSearchTerm] = useState('')
  const [buildSearchTerm, setBuildSearchTerm] = useState('')

  const submissionsById = useMemo(() => {
    return submissions.reduce<Record<string, AdminFeedbackSubmission>>((acc, submission) => {
      acc[submission.id] = submission
      return acc
    }, {})
  }, [submissions])

  const latestRunBySubmissionId = useMemo(() => {
    return buildRuns.reduce<Record<string, FeedbackBuildRun>>((acc, run) => {
      const current = acc[run.feedback_submission_id]
      if (!current || new Date(run.created_at).getTime() > new Date(current.created_at).getTime()) {
        acc[run.feedback_submission_id] = run
      }
      return acc
    }, {})
  }, [buildRuns])

  useEffect(() => {
    if (!isAdmin || !buildRuns.some(isBuildActive)) return undefined

    const interval = window.setInterval(() => {
      void refreshBuildRuns()
    }, 30_000)

    return () => window.clearInterval(interval)
  }, [buildRuns, isAdmin, refreshBuildRuns])

  useEffect(() => {
    if (!isAdmin && view === 'builds') {
      setView('submissions')
    }
  }, [isAdmin, view])

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
    const sentSubmissionIds = new Set(
      isAdmin
        ? buildRuns
          .filter(run => run.status !== 'archived')
          .map(run => run.feedback_submission_id)
        : []
    )

    return submissions.filter(submission => {
      if (isAdmin && sentSubmissionIds.has(submission.id)) return false
      if (filter !== 'all' && submission.submission_type !== filter) return false
      if (!normalizedSearch) return true

      return (
        submission.title.toLowerCase().includes(normalizedSearch) ||
        submission.description.toLowerCase().includes(normalizedSearch) ||
        getSubmitterName(submission).toLowerCase().includes(normalizedSearch) ||
        getSubmitterHandle(submission).toLowerCase().includes(normalizedSearch)
      )
    })
  }, [buildRuns, filter, isAdmin, searchTerm, submissions])

  const filteredBuildRuns = useMemo(() => {
    const normalizedSearch = buildSearchTerm.trim().toLowerCase()

    return buildRuns.filter(run => {
      if (buildFilter === 'active') {
        if (run.status === 'archived' || run.status === 'merged') return false
      } else if (run.status !== buildFilter) {
        return false
      }

      if (!normalizedSearch) return true
      const submission = submissionsById[run.feedback_submission_id]

      return (
        run.id.toLowerCase().includes(normalizedSearch) ||
        run.branch_name?.toLowerCase().includes(normalizedSearch) ||
        submission?.title.toLowerCase().includes(normalizedSearch) ||
        getSubmitterName(submission).toLowerCase().includes(normalizedSearch) ||
        getSubmitterHandle(submission).toLowerCase().includes(normalizedSearch)
      )
    })
  }, [buildFilter, buildRuns, buildSearchTerm, submissionsById])

  const selectedRun = selectedRunId ? buildRuns.find(run => run.id === selectedRunId) ?? null : null
  const selectedRunSubmission = selectedRun ? submissionsById[selectedRun.feedback_submission_id] : undefined

  const openStartBuild = (submission: AdminFeedbackSubmission) => {
    setRetryRun(undefined)
    setBuildDraftSubmission(submission)
  }

  const openRetryBuild = (run: FeedbackBuildRun) => {
    setRetryRun(run)
    setBuildDraftSubmission(submissionsById[run.feedback_submission_id] ?? null)
  }

  const handleBuildSubmit = async (input: {
    companionPrompt: string
    includedAttachments: AdminFeedbackAttachmentRecord[]
    recognitionEnabled: boolean
  }) => {
    if (!buildDraftSubmission) return

    if (retryRun) {
      await retryBuildRun({
        previousRunId: retryRun.id,
        companionPrompt: input.companionPrompt,
        includedAttachments: input.includedAttachments,
        recognitionEnabled: input.recognitionEnabled,
      })
    } else {
      await startBuildRun({
        feedbackSubmissionId: buildDraftSubmission.id,
        companionPrompt: input.companionPrompt,
        includedAttachments: input.includedAttachments,
        recognitionEnabled: input.recognitionEnabled,
      })
    }

    setBuildDraftSubmission(null)
    setRetryRun(undefined)
    setSelectedSubmission(null)
    setView('builds')
  }

  const handleApproveMerge = async (run: FeedbackBuildRun) => {
    await approveMerge(run.id)
    setApproveRun(null)
    setSelectedRunId(run.id)
  }

  const handleArchiveRun = async (run: FeedbackBuildRun) => {
    const confirmed = window.confirm(`Archive feedback build ${run.id.slice(0, 8)}?`)
    if (!confirmed) return

    await archiveBuildRun(run.id)
  }

  return (
    <div className="glass-panel rounded-[var(--radius-lg)] p-5">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <MessageIcon />
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Feedback Review</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Submitted bugs, suggestions, screenshots, and admin-only build runs.
            </p>
          </div>
        </div>

        {isAdmin && (
          <div className="flex rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] p-1">
            <button
              type="button"
              onClick={() => setView('submissions')}
              className={`rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium transition-colors ${
                view === 'submissions'
                  ? 'bg-[rgba(215,170,70,0.14)] text-[var(--text-gold)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Submissions
            </button>
            <button
              type="button"
              onClick={() => setView('builds')}
              className={`rounded-[var(--radius-sm)] px-3 py-2 text-xs font-medium transition-colors ${
                view === 'builds'
                  ? 'bg-[rgba(215,170,70,0.14)] text-[var(--text-gold)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              Feedback Builds
            </button>
          </div>
        )}
      </div>

      {view === 'submissions' ? (
        <SubmissionList
          submissions={filteredSubmissions}
          loading={loading}
          error={error}
          filter={filter}
          searchTerm={searchTerm}
          isAdmin={isAdmin}
          latestRunBySubmissionId={latestRunBySubmissionId}
          onFilterChange={setFilter}
          onSearchChange={setSearchTerm}
          onSelectSubmission={setSelectedSubmission}
        />
      ) : (
        <BuildRunList
          runs={filteredBuildRuns}
          loading={buildLoading}
          error={buildError}
          filter={buildFilter}
          searchTerm={buildSearchTerm}
          submissionsById={submissionsById}
          onFilterChange={setBuildFilter}
          onSearchChange={setBuildSearchTerm}
          onSelectRun={run => setSelectedRunId(run.id)}
        />
      )}

      <FeedbackDetailModal
        submission={selectedSubmission}
        latestRun={selectedSubmission ? latestRunBySubmissionId[selectedSubmission.id] : undefined}
        canStartBuild={isAdmin && Boolean(selectedSubmission)}
        onStartBuild={openStartBuild}
        onClose={() => setSelectedSubmission(null)}
        onDelete={(submission) => void handleDeleteSubmission(submission)}
        deleting={Boolean(selectedSubmission && deletingId === selectedSubmission.id)}
        starting={Boolean(selectedSubmission && activeBuildActionId === selectedSubmission.id)}
      />

      <BuildRunFormModal
        submission={buildDraftSubmission}
        previousRun={retryRun}
        saving={Boolean(activeBuildActionId)}
        onClose={() => {
          setBuildDraftSubmission(null)
          setRetryRun(undefined)
        }}
        onSubmit={handleBuildSubmit}
      />

      <BuildRunDetailModal
        run={selectedRun}
        submission={selectedRunSubmission}
        logs={selectedRun ? buildLogsByRunId[selectedRun.id] ?? [] : []}
        saving={Boolean(selectedRun && activeBuildActionId === selectedRun.id)}
        onClose={() => setSelectedRunId(null)}
        onRetry={openRetryBuild}
        onApprove={setApproveRun}
        onArchive={(run) => void handleArchiveRun(run)}
      />

      <ApproveMergeModal
        run={approveRun}
        saving={Boolean(approveRun && activeBuildActionId === approveRun.id)}
        onCancel={() => setApproveRun(null)}
        onConfirm={handleApproveMerge}
      />
    </div>
  )
}

function SubmissionList({
  submissions,
  loading,
  error,
  filter,
  searchTerm,
  isAdmin,
  latestRunBySubmissionId,
  onFilterChange,
  onSearchChange,
  onSelectSubmission,
}: {
  submissions: AdminFeedbackSubmission[]
  loading: boolean
  error: string | null
  filter: FeedbackFilter
  searchTerm: string
  isAdmin: boolean
  latestRunBySubmissionId: Record<string, FeedbackBuildRun>
  onFilterChange: (filter: FeedbackFilter) => void
  onSearchChange: (value: string) => void
  onSelectSubmission: (submission: AdminFeedbackSubmission) => void
}) {
  return (
    <>
      <div className="mb-4 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <label className="min-w-0">
          <span className="sr-only">Search feedback</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={searchTerm}
              onChange={event => onSearchChange(event.target.value)}
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
              onClick={() => onFilterChange(id as FeedbackFilter)}
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
      ) : submissions.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-5 text-center text-sm text-[var(--text-muted)]">
          No feedback submissions found.
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.map(submission => {
            const latestRun = latestRunBySubmissionId[submission.id]

            return (
              <button
                key={submission.id}
                type="button"
                onClick={() => onSelectSubmission(submission)}
                className="group w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.05)]"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <TypeBadge type={submission.submission_type} />
                      <StatusBadge status={submission.status} />
                      {isAdmin && latestRun && <BuildStatusBadge status={latestRun.status} />}
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

                  <SubmitterBlock submission={submission} />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

function BuildRunList({
  runs,
  loading,
  error,
  filter,
  searchTerm,
  submissionsById,
  onFilterChange,
  onSearchChange,
  onSelectRun,
}: {
  runs: FeedbackBuildRun[]
  loading: boolean
  error: string | null
  filter: BuildFilter
  searchTerm: string
  submissionsById: Record<string, AdminFeedbackSubmission>
  onFilterChange: (filter: BuildFilter) => void
  onSearchChange: (value: string) => void
  onSelectRun: (run: FeedbackBuildRun) => void
}) {
  return (
    <>
      <div className="mb-4 grid gap-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <label className="min-w-0">
          <span className="sr-only">Search feedback builds</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={searchTerm}
              onChange={event => onSearchChange(event.target.value)}
              placeholder="Search build runs, branch, title, or submitter"
              className="obsidian-input w-full rounded-[var(--radius-md)] py-3 pl-9 pr-3.5 text-sm"
            />
          </div>
        </label>

        <div className="flex flex-wrap rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] p-1">
          {[
            ['active', 'Active'],
            ['pending', 'Pending'],
            ['running', 'Running'],
            ['ready_for_testing', 'Ready'],
            ['failed', 'Failed'],
            ['merged', 'Merged'],
            ['archived', 'Archived'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onFilterChange(id as BuildFilter)}
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
          Loading feedback build runs.
        </div>
      ) : error ? (
        <div className="rounded-[var(--radius-md)] border border-[rgba(190,52,85,0.35)] bg-[rgba(87,14,28,0.18)] p-4 text-sm text-red-100">
          {error}
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-5 text-center text-sm text-[var(--text-muted)]">
          No feedback build runs found.
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map(run => {
            const submission = submissionsById[run.feedback_submission_id]

            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onSelectRun(run)}
                className="group w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[var(--border-glow)] hover:bg-[rgba(255,255,255,0.05)]"
              >
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <BuildStatusBadge status={run.status} />
                      <span className="rounded-full border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        {stageLabels[run.current_stage]}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">{formatDateTime(run.created_at)}</span>
                    </div>
                    <h3 className="mt-3 break-words text-base font-semibold text-[var(--text-primary)]">
                      {submission?.title || `Feedback build ${run.id.slice(0, 8)}`}
                    </h3>
                    <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-[var(--text-muted)]">
                      {run.summary || run.failure_message || run.branch_name || 'Waiting for the Codex processor.'}
                    </p>
                    {run.preview_warning && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-100">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {run.preview_warning}
                      </p>
                    )}
                  </div>

                  {submission ? (
                    <SubmitterBlock submission={submission} />
                  ) : (
                    <div className="text-sm text-[var(--text-muted)] lg:min-w-52 lg:text-right">Submission unavailable</div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}

function SubmitterBlock({ submission }: { submission: AdminFeedbackSubmission }) {
  return (
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
  )
}

function MessageIcon() {
  return (
    <span className="mt-0.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] p-2.5 text-[var(--text-gold)]">
      <MessageSquarePlus className="h-5 w-5" />
    </span>
  )
}

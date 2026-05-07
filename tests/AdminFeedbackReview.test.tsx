import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { AdminFeedbackReview } from '../src/components/settings/AdminFeedbackReview'

const mockRefresh = jest.fn()
const mockRefreshBuildRuns = jest.fn()
const mockDeleteSubmission = jest.fn()
const mockStartBuildRun = jest.fn()
const mockRetryBuildRun = jest.fn()
const mockApproveMerge = jest.fn()
const mockArchiveBuildRun = jest.fn()
const mockUseAdminFeedback = jest.fn()
const mockUseAdminAccess = jest.fn()

jest.mock('../src/hooks/useAdminFeedback', () => ({
  useAdminFeedback: () => mockUseAdminFeedback(),
}))

jest.mock('../src/hooks/useAdminAccess', () => ({
  useAdminAccess: () => mockUseAdminAccess(),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockUseAdminAccess.mockReturnValue({
    isAdmin: true,
    isOperator: true,
    role: 'admin',
    loading: false,
  })
  mockUseAdminFeedback.mockReturnValue({
    submissions: [
      {
        id: 'feedback-1',
        user_id: 'user-1',
        submission_type: 'bug',
        title: 'App crashes after upload',
        description: 'Opening the image picker and submitting a large screenshot closes the app.',
        status: 'new',
        user_agent: 'Test Browser',
        created_at: '2026-05-01T12:30:00.000Z',
        updated_at: '2026-05-01T12:30:00.000Z',
        attachments: [
          {
            bucket: 'feedback-attachments',
            path: 'user-1/feedback-1/1-crash.png',
            name: 'crash.png',
            size: 1234,
            type: 'image/png',
            signedUrl: 'https://example.test/crash.png',
          },
        ],
        user: {
          id: 'user-1',
          username: 'rebekah',
          display_name: 'Rebekah Joy Polder',
          avatar_url: null,
          color: '#d7aa46',
          status: 'online',
          admin_role: null,
          presence_visibility: 'tracked',
        },
      },
      {
        id: 'feedback-2',
        user_id: 'user-2',
        submission_type: 'feature',
        title: 'Add saved drafts',
        description: 'Messages should keep draft text while switching sections.',
        status: 'planned',
        user_agent: null,
        created_at: '2026-05-01T13:30:00.000Z',
        updated_at: '2026-05-01T13:30:00.000Z',
        attachments: [],
        user: {
          id: 'user-2',
          username: 'shadow',
          display_name: 'Shadow',
          avatar_url: null,
          color: '#d7aa46',
          status: 'offline',
          admin_role: null,
          presence_visibility: 'tracked',
        },
      },
    ],
    loading: false,
    error: null,
    deletingId: null,
    buildRuns: [],
    buildLogsByRunId: {},
    buildLoading: false,
    buildError: null,
    activeBuildActionId: null,
    refresh: mockRefresh,
    refreshBuildRuns: mockRefreshBuildRuns,
    deleteSubmission: mockDeleteSubmission,
    startBuildRun: mockStartBuildRun,
    retryBuildRun: mockRetryBuildRun,
    approveMerge: mockApproveMerge,
    archiveBuildRun: mockArchiveBuildRun,
  })
})

test('lists submitted bugs and suggestions for admin review', () => {
  render(<AdminFeedbackReview />)

  expect(screen.getByRole('heading', { name: 'Feedback Review' })).toBeInTheDocument()
  expect(screen.getByText('App crashes after upload')).toBeInTheDocument()
  expect(screen.getByText('Add saved drafts')).toBeInTheDocument()
  expect(screen.getByText('Rebekah Joy Polder')).toBeInTheDocument()
  expect(screen.getByText('@shadow')).toBeInTheDocument()
})

test('filters submissions and opens the full detail modal with image attachments', () => {
  render(<AdminFeedbackReview />)

  fireEvent.click(screen.getByRole('button', { name: 'Bugs' }))

  expect(screen.getByText('App crashes after upload')).toBeInTheDocument()
  expect(screen.queryByText('Add saved drafts')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /app crashes after upload/i }))

  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Opening the image picker and submitting a large screenshot closes the app.')).toBeInTheDocument()
  expect(within(dialog).getByRole('img', { name: /app crashes after upload attachment 1/i })).toHaveAttribute(
    'src',
    'https://example.test/crash.png'
  )
  expect(within(dialog).getByText('Test Browser')).toBeInTheDocument()
})

test('does not show a manual refresh command in the feedback header', () => {
  render(<AdminFeedbackReview />)

  expect(screen.queryByRole('button', { name: /refresh feedback submissions/i })).not.toBeInTheDocument()
})

test('deletes a feedback submission after confirmation', async () => {
  jest.spyOn(window, 'confirm').mockReturnValueOnce(true)
  mockDeleteSubmission.mockResolvedValueOnce(undefined)
  render(<AdminFeedbackReview />)

  fireEvent.click(screen.getByRole('button', { name: /app crashes after upload/i }))
  fireEvent.click(screen.getByRole('button', { name: /delete feedback submission/i }))

  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('App crashes after upload'))
  await waitFor(() => {
    expect(mockDeleteSubmission).toHaveBeenCalledWith(expect.objectContaining({ id: 'feedback-1' }))
  })
})

test('lets full admins start a feedback build with companion prompt and selected screenshots', async () => {
  mockStartBuildRun.mockResolvedValueOnce({
    id: 'run-1',
    feedback_submission_id: 'feedback-1',
    status: 'pending',
    current_stage: 'queued',
  })
  render(<AdminFeedbackReview />)

  fireEvent.click(screen.getByRole('button', { name: /app crashes after upload/i }))
  fireEvent.click(screen.getByRole('button', { name: /start feedback build/i }))

  const dialogs = screen.getAllByRole('dialog')
  const dialog = dialogs[dialogs.length - 1]
  fireEvent.change(within(dialog).getByLabelText(/companion prompt/i), {
    target: { value: 'Please reproduce the upload crash and keep the fix tightly scoped.' },
  })
  fireEvent.click(within(dialog).getByRole('button', { name: /send to codex/i }))

  await waitFor(() => {
    expect(mockStartBuildRun).toHaveBeenCalledWith(expect.objectContaining({
      feedbackSubmissionId: 'feedback-1',
      companionPrompt: 'Please reproduce the upload crash and keep the fix tightly scoped.',
      recognitionEnabled: true,
      includedAttachments: [
        expect.objectContaining({
          path: 'user-1/feedback-1/1-crash.png',
        }),
      ],
    }))
  })
})

test('hides feedback build controls from sub-admins', () => {
  mockUseAdminAccess.mockReturnValue({
    isAdmin: false,
    isOperator: true,
    role: 'sub_admin',
    loading: false,
  })

  render(<AdminFeedbackReview />)

  expect(screen.queryByRole('button', { name: /feedback builds/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /app crashes after upload/i }))
  expect(screen.queryByRole('button', { name: /start feedback build/i })).not.toBeInTheDocument()
})

test('shows build runs with logs and approve action', () => {
  mockUseAdminFeedback.mockReturnValue({
    ...mockUseAdminFeedback(),
    buildRuns: [
      {
        id: 'run-1',
        feedback_submission_id: 'feedback-1',
        created_by: 'admin-1',
        companion_prompt: 'Please fix this crash carefully.',
        generated_prompt: 'Generated Codex prompt',
        included_attachments: [],
        recognition_enabled: true,
        status: 'ready_for_testing',
        current_stage: 'ready_for_testing',
        branch_name: 'codex/feedback-feedback-1-upload-crash',
        pr_url: 'https://github.com/example/repo/pull/1',
        preview_url: 'https://deploy-preview-1.netlify.app',
        preview_warning: null,
        summary: 'Fixed the upload crash.',
        merge_commit_sha: null,
        failure_message: null,
        approved_merge_at: null,
        approved_merge_by: null,
        archived_at: null,
        archived_by: null,
        started_at: null,
        completed_at: null,
        created_at: '2026-05-07T01:00:00.000Z',
        updated_at: '2026-05-07T01:00:00.000Z',
      },
    ],
    buildLogsByRunId: {
      'run-1': [
        {
          id: 'log-1',
          run_id: 'run-1',
          stage: 'testing',
          message: 'Lint, typecheck, and build passed.',
          metadata: {},
          created_at: '2026-05-07T01:20:00.000Z',
        },
      ],
    },
  })

  render(<AdminFeedbackReview />)

  fireEvent.click(screen.getByRole('button', { name: /feedback builds/i }))
  fireEvent.click(screen.getByRole('button', { name: /app crashes after upload/i }))

  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Generated Codex prompt')).toBeInTheDocument()
  expect(within(dialog).getByText('Lint, typecheck, and build passed.')).toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: /approve & merge/i })).toBeInTheDocument()
})

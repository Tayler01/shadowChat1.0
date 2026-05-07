import {
  FEEDBACK_ATTACHMENT_SIGNED_URL_SECONDS,
  FEEDBACK_ATTACHMENTS_BUCKET,
  approveFeedbackBuildMerge,
  archiveFeedbackBuildRun,
  createFeedbackBuildRun,
  deleteAdminFeedbackSubmission,
  fetchAdminFeedbackSubmissions,
  fetchFeedbackBuildRunLogs,
  fetchFeedbackBuildRuns,
  retryFeedbackBuildRun,
  submitFeedback,
  validateFeedbackSubmission,
} from '../src/lib/feedback'

const upload = jest.fn()
const remove = jest.fn()
const createSignedUrls = jest.fn()
const insert = jest.fn()
const deleteFeedback = jest.fn()
const eqFeedback = jest.fn()
const select = jest.fn()
const single = jest.fn()
const selectFeedback = jest.fn()
const orderFeedback = jest.fn()
const limitFeedback = jest.fn()
const selectUsers = jest.fn()
const inUsers = jest.fn()
const selectBuildRuns = jest.fn()
const orderBuildRuns = jest.fn()
const limitBuildRuns = jest.fn()
const selectBuildLogs = jest.fn()
const inBuildLogs = jest.fn()
const orderBuildLogs = jest.fn()
const rpc = jest.fn()
const getUser = jest.fn()

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(async () => ({
    auth: {
      getUser,
    },
    storage: {
      from: jest.fn(() => ({
        upload,
        remove,
        createSignedUrls,
      })),
    },
    from: jest.fn((table: string) => {
      if (table === 'users') {
        return {
          select: selectUsers,
        }
      }

      if (table === 'feedback_build_runs') {
        return {
          select: selectBuildRuns,
        }
      }

      if (table === 'feedback_build_run_logs') {
        return {
          select: selectBuildLogs,
        }
      }

      return {
        insert,
        delete: deleteFeedback,
        select: selectFeedback,
      }
    }),
    rpc,
  })),
}))

beforeEach(() => {
  jest.clearAllMocks()
  upload.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  single.mockResolvedValue({ data: { id: 'feedback-id' }, error: null })
  select.mockReturnValue({ single })
  insert.mockReturnValue({ select })
  eqFeedback.mockResolvedValue({ error: null })
  deleteFeedback.mockReturnValue({ eq: eqFeedback })
  limitFeedback.mockResolvedValue({ data: [], error: null })
  orderFeedback.mockReturnValue({ limit: limitFeedback })
  selectFeedback.mockReturnValue({ order: orderFeedback })
  inUsers.mockResolvedValue({ data: [], error: null })
  selectUsers.mockReturnValue({ in: inUsers })
  limitBuildRuns.mockResolvedValue({ data: [], error: null })
  orderBuildRuns.mockReturnValue({ limit: limitBuildRuns })
  selectBuildRuns.mockReturnValue({ order: orderBuildRuns })
  orderBuildLogs.mockResolvedValue({ data: [], error: null })
  inBuildLogs.mockReturnValue({ order: orderBuildLogs })
  selectBuildLogs.mockReturnValue({ in: inBuildLogs })
  rpc.mockResolvedValue({ data: null, error: null })
  createSignedUrls.mockResolvedValue({ data: [], error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'user-id' } }, error: null })
})

test('validates required feedback fields', () => {
  expect(() =>
    validateFeedbackSubmission({
      type: 'bug',
      title: 'x',
      description: 'too short',
    })
  ).toThrow('Add a short title')

  expect(() =>
    validateFeedbackSubmission({
      type: 'feature',
      title: 'Drafts',
      description: 'Add saved draft support.',
      attachments: [new File(['text'], 'notes.txt', { type: 'text/plain' })],
    })
  ).toThrow('Attachments must be images')
})

test('uploads images before inserting feedback submission metadata', async () => {
  const image = new File(['image'], 'screen shot.png', { type: 'image/png' })

  const result = await submitFeedback({
    type: 'bug',
    title: 'Feed jumps',
    description: 'The feed jumps after a realtime reload on mobile.',
    attachments: [image],
  })

  expect(upload).toHaveBeenCalledWith(
    expect.stringMatching(/^user-id\/.+\/1-.+-screen-shot\.png$/),
    image,
    expect.objectContaining({
      cacheControl: '3600',
      contentType: 'image/png',
      upsert: false,
    })
  )

  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    user_id: 'user-id',
    submission_type: 'bug',
    title: 'Feed jumps',
    description: 'The feed jumps after a realtime reload on mobile.',
    attachments: [
      expect.objectContaining({
        bucket: FEEDBACK_ATTACHMENTS_BUCKET,
        name: 'screen shot.png',
        type: 'image/png',
      }),
    ],
  }))
  expect(result.id).toBe('feedback-id')
})

test('cleans up uploaded images when the database insert fails', async () => {
  const image = new File(['image'], 'broken.png', { type: 'image/png' })
  single.mockResolvedValueOnce({ data: null, error: new Error('insert failed') })

  await expect(
    submitFeedback({
      type: 'bug',
      title: 'Broken submit',
      description: 'The insert fails after upload in this test.',
      attachments: [image],
    })
  ).rejects.toThrow('insert failed')

  expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^user-id\/.+\/1-.+-broken\.png$/)])
})

test('loads admin feedback submissions with signed private attachment URLs', async () => {
  limitFeedback.mockResolvedValueOnce({
    data: [
      {
        id: 'feedback-1',
        user_id: 'user-id',
        submission_type: 'bug',
        title: 'Broken image upload',
        description: 'Image uploads sometimes fail on mobile.',
        attachments: [
          {
            bucket: FEEDBACK_ATTACHMENTS_BUCKET,
            path: 'user-id/feedback-1/1-upload.png',
            name: 'upload.png',
            size: 1200,
            type: 'image/png',
          },
        ],
        status: 'new',
        user_agent: 'Test Browser',
        created_at: '2026-05-01T12:00:00.000Z',
        updated_at: '2026-05-01T12:00:00.000Z',
      },
    ],
    error: null,
  })
  inUsers.mockResolvedValueOnce({
    data: [
      {
        id: 'user-id',
        username: 'caleb',
        display_name: 'Caleb',
        avatar_url: null,
        color: '#d7aa46',
        status: 'online',
        admin_role: 'admin',
        presence_visibility: 'tracked',
      },
    ],
    error: null,
  })
  createSignedUrls.mockResolvedValueOnce({
    data: [
      {
        path: 'user-id/feedback-1/1-upload.png',
        signedUrl: 'https://example.test/signed-upload.png',
      },
    ],
    error: null,
  })

  const submissions = await fetchAdminFeedbackSubmissions()

  expect(limitFeedback).toHaveBeenCalledWith(100)
  expect(inUsers).toHaveBeenCalledWith('id', ['user-id'])
  expect(createSignedUrls).toHaveBeenCalledWith(
    ['user-id/feedback-1/1-upload.png'],
    FEEDBACK_ATTACHMENT_SIGNED_URL_SECONDS
  )
  expect(submissions[0]).toEqual(expect.objectContaining({
    title: 'Broken image upload',
    user: expect.objectContaining({ username: 'caleb' }),
    attachments: [
      expect.objectContaining({
        name: 'upload.png',
        signedUrl: 'https://example.test/signed-upload.png',
      }),
    ],
  }))
})

test('deletes admin feedback submissions and attached images', async () => {
  await deleteAdminFeedbackSubmission({
    id: 'feedback-1',
    attachments: [
      {
        bucket: FEEDBACK_ATTACHMENTS_BUCKET,
        path: 'user-id/feedback-1/1-upload.png',
        name: 'upload.png',
        size: 1200,
        type: 'image/png',
      },
    ],
  })

  expect(remove).toHaveBeenCalledWith(['user-id/feedback-1/1-upload.png'])
  expect(deleteFeedback).toHaveBeenCalled()
  expect(eqFeedback).toHaveBeenCalledWith('id', 'feedback-1')
})

test('loads feedback build runs and stage logs', async () => {
  limitBuildRuns.mockResolvedValueOnce({
    data: [
      {
        id: 'run-1',
        feedback_submission_id: 'feedback-1',
        created_by: 'admin-1',
        companion_prompt: 'Please fix the upload flow with care.',
        generated_prompt: 'Generated prompt',
        included_attachments: [
          {
            bucket: FEEDBACK_ATTACHMENTS_BUCKET,
            path: 'user-id/feedback-1/1-upload.png',
            name: 'upload.png',
            size: 1200,
            type: 'image/png',
          },
        ],
        recognition_enabled: true,
        status: 'pending',
        current_stage: 'queued',
        branch_name: null,
        pr_url: null,
        preview_url: null,
        preview_warning: null,
        summary: null,
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
    error: null,
  })
  orderBuildLogs.mockResolvedValueOnce({
    data: [
      {
        id: 'log-1',
        run_id: 'run-1',
        stage: 'queued',
        message: 'Queued for Codex.',
        metadata: { source: 'test' },
        created_at: '2026-05-07T01:00:00.000Z',
      },
    ],
    error: null,
  })

  const runs = await fetchFeedbackBuildRuns()
  const logs = await fetchFeedbackBuildRunLogs(['run-1'])

  expect(limitBuildRuns).toHaveBeenCalledWith(100)
  expect(inBuildLogs).toHaveBeenCalledWith('run_id', ['run-1'])
  expect(runs[0]).toEqual(expect.objectContaining({
    id: 'run-1',
    included_attachments: [
      expect.objectContaining({
        name: 'upload.png',
      }),
    ],
  }))
  expect(logs[0]).toEqual(expect.objectContaining({
    stage: 'queued',
    metadata: { source: 'test' },
  }))
})

test('calls feedback build run RPCs with sanitized attachment metadata', async () => {
  const runRow = {
    id: 'run-1',
    feedback_submission_id: 'feedback-1',
    created_by: 'admin-1',
    companion_prompt: 'Please fix the upload flow with care.',
    generated_prompt: 'Generated prompt',
    included_attachments: [],
    recognition_enabled: true,
    status: 'pending',
    current_stage: 'queued',
    created_at: '2026-05-07T01:00:00.000Z',
    updated_at: '2026-05-07T01:00:00.000Z',
  }
  rpc.mockResolvedValue({ data: runRow, error: null })

  await createFeedbackBuildRun({
    feedbackSubmissionId: 'feedback-1',
    companionPrompt: 'Please fix the upload flow with care.',
    includedAttachments: [
      {
        bucket: FEEDBACK_ATTACHMENTS_BUCKET,
        path: 'user-id/feedback-1/1-upload.png',
        name: 'upload.png',
        size: 1200,
        type: 'image/png',
        signedUrl: 'https://example.test/private-url.png',
      },
    ],
    recognitionEnabled: false,
  })
  await retryFeedbackBuildRun({
    previousRunId: 'run-1',
    companionPrompt: 'Try again with the smaller implementation plan.',
    includedAttachments: [],
    recognitionEnabled: true,
  })
  await approveFeedbackBuildMerge('run-1')
  await archiveFeedbackBuildRun('run-1')

  expect(rpc).toHaveBeenNthCalledWith(1, 'create_feedback_build_run', expect.objectContaining({
    p_feedback_submission_id: 'feedback-1',
    p_recognition_enabled: false,
    p_included_attachments: [
      {
        bucket: FEEDBACK_ATTACHMENTS_BUCKET,
        path: 'user-id/feedback-1/1-upload.png',
        name: 'upload.png',
        size: 1200,
        type: 'image/png',
      },
    ],
  }))
  expect(rpc).toHaveBeenNthCalledWith(2, 'retry_feedback_build_run', expect.objectContaining({
    p_previous_run_id: 'run-1',
  }))
  expect(rpc).toHaveBeenNthCalledWith(3, 'approve_feedback_build_merge', { p_run_id: 'run-1' })
  expect(rpc).toHaveBeenNthCalledWith(4, 'archive_feedback_build_run', { p_run_id: 'run-1' })
})

import {
  FEEDBACK_ATTACHMENT_SIGNED_URL_SECONDS,
  FEEDBACK_ATTACHMENTS_BUCKET,
  deleteAdminFeedbackSubmission,
  fetchAdminFeedbackSubmissions,
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

      return {
        insert,
        delete: deleteFeedback,
        select: selectFeedback,
      }
    }),
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

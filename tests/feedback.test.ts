import {
  FEEDBACK_ATTACHMENTS_BUCKET,
  submitFeedback,
  validateFeedbackSubmission,
} from '../src/lib/feedback'

const upload = jest.fn()
const remove = jest.fn()
const insert = jest.fn()
const select = jest.fn()
const single = jest.fn()
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
      })),
    },
    from: jest.fn(() => ({
      insert,
    })),
  })),
}))

beforeEach(() => {
  jest.clearAllMocks()
  upload.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  single.mockResolvedValue({ data: { id: 'feedback-id' }, error: null })
  select.mockReturnValue({ single })
  insert.mockReturnValue({ select })
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

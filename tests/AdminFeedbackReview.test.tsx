import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { AdminFeedbackReview } from '../src/components/settings/AdminFeedbackReview'

const mockRefresh = jest.fn()
const mockUseAdminFeedback = jest.fn()

jest.mock('../src/hooks/useAdminFeedback', () => ({
  useAdminFeedback: () => mockUseAdminFeedback(),
}))

beforeEach(() => {
  jest.clearAllMocks()
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
    refresh: mockRefresh,
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

test('refreshes feedback submissions on command', () => {
  render(<AdminFeedbackReview />)

  fireEvent.click(screen.getByRole('button', { name: /refresh feedback submissions/i }))

  expect(mockRefresh).toHaveBeenCalledTimes(1)
})

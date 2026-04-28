import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FeedbackSubmissionModal } from '../src/components/settings/FeedbackSubmissionModal'
import { submitFeedback } from '../src/lib/feedback'

jest.mock('react-hot-toast', () => {
  const toastFn = jest.fn() as any
  toastFn.error = jest.fn()
  toastFn.success = jest.fn()
  return { __esModule: true, default: toastFn }
})

jest.mock('../src/lib/feedback', () => ({
  MAX_FEEDBACK_ATTACHMENTS: 5,
  MAX_FEEDBACK_ATTACHMENT_BYTES: 10 * 1024 * 1024,
  submitFeedback: jest.fn(),
}))

test('walks a user through a feature idea submission with an image', async () => {
  const onSubmitted = jest.fn()
  ;(submitFeedback as jest.Mock).mockResolvedValue({ id: 'feedback-123', attachments: [] })

  const { container } = render(
    <FeedbackSubmissionModal open onClose={jest.fn()} onSubmitted={onSubmitted} />
  )

  fireEvent.click(screen.getByRole('button', { name: /feature idea/i }))
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))
  fireEvent.change(screen.getByLabelText(/brief description/i), {
    target: { value: 'Saved drafts' },
  })
  fireEvent.change(screen.getByLabelText(/details/i), {
    target: { value: 'Let users keep a draft when switching away from a conversation.' },
  })
  fireEvent.click(screen.getByRole('button', { name: /continue/i }))

  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const image = new File(['image'], 'concept.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [image] } })

  expect(screen.getByText('concept.png')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /send feedback/i }))

  await waitFor(() => {
    expect(submitFeedback).toHaveBeenCalledWith({
      type: 'feature',
      title: 'Saved drafts',
      description: 'Let users keep a draft when switching away from a conversation.',
      attachments: [image],
    })
  })
  expect(onSubmitted).toHaveBeenCalledWith('feedback-123')
  expect(screen.getByRole('heading', { name: /feedback sent/i })).toBeInTheDocument()
})

test('keeps the details step gated until enough detail is present', async () => {
  render(<FeedbackSubmissionModal open onClose={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: /continue/i }))

  const continueButton = screen.getByRole('button', { name: /continue/i })
  expect(continueButton).toBeDisabled()

  fireEvent.change(screen.getByLabelText(/brief description/i), {
    target: { value: 'Jump' },
  })
  fireEvent.change(screen.getByLabelText(/details/i), {
    target: { value: 'Too short' },
  })

  expect(continueButton).toBeDisabled()
})

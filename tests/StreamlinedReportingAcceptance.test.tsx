
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ModerationReportProvider } from '../src/features/moderation/ModerationReportProvider'
import { useModerationReport } from '../src/features/moderation/useModerationReport'
import { submitModerationReport, type ModerationTargetType } from '../src/lib/moderationCases'

jest.mock('../src/lib/moderationCases', () => ({
  ...jest.requireActual('../src/lib/moderationCases'),
  submitModerationReport: jest.fn(),
}))
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { error: jest.fn() } }))
const submit = jest.mocked(submitModerationReport)
function ReportTarget({ type }: { type: ModerationTargetType }) {
  const { openReport } = useModerationReport()
  return <button onClick={() => openReport({
    type, id: 'fixture-target', label: 'QA fixture', preview: 'Controlled fixture content',
    subjectUserId: 'fixture-subject', subjectLabel: 'QA subject', conversationId: type === 'dm_message' ? 'fixture-conversation' : undefined,
  })}>Report fixture</button>
}
beforeEach(() => {
  jest.clearAllMocks()
  submit.mockResolvedValue({ reportId: 'fixture-report', caseId: 'fixture-case', caseNumber: 101, status: 'new' })
})

test.each<ModerationTargetType>(['general_message', 'dm_message', 'shadow_pin_image', 'shadow_pin_comment', 'user'])('%s reports preserve target identity and show the operator receipt', async type => {
  render(<ModerationReportProvider><ReportTarget type={type} /></ModerationReportProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Report fixture' }))
  fireEvent.click(await screen.findByRole('radio', { name: /Harassment or bullying/ }))
  fireEvent.change(screen.getByPlaceholderText(/Tell the operator/), { target: { value: 'QA ONLY: controlled reporting acceptance fixture.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send private report' }))
  await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({
    target: expect.objectContaining({ type, id: 'fixture-target', subjectUserId: 'fixture-subject' }),
    category: 'harassment', details: 'QA ONLY: controlled reporting acceptance fixture.', attachments: [],
  })))
  expect(await screen.findByText('Report received')).toBeInTheDocument()
  expect(screen.getByText('SC-000101')).toBeInTheDocument()
})

test('a failed intake is not displayed as an operator receipt', async () => {
  submit.mockRejectedValueOnce(new Error('Report service unavailable'))
  render(<ModerationReportProvider><ReportTarget type="dm_message" /></ModerationReportProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Report fixture' }))
  fireEvent.click(await screen.findByRole('radio', { name: /Harassment or bullying/ }))
  fireEvent.change(screen.getByPlaceholderText(/Tell the operator/), { target: { value: 'QA ONLY: controlled reporting acceptance fixture.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send private report' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Report service unavailable'))
  expect(screen.queryByText('Report received')).not.toBeInTheDocument()
})

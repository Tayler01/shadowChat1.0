import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ModerationReportProvider } from '../src/features/moderation/ModerationReportProvider'
import { useModerationReport } from '../src/features/moderation/useModerationReport'
import { submitModerationReport } from '../src/lib/moderationCases'

jest.mock('../src/lib/moderationCases', () => {
  const actual = jest.requireActual('../src/lib/moderationCases')
  return { ...actual, submitModerationReport: jest.fn() }
})

const submitReportMock = submitModerationReport as jest.MockedFunction<typeof submitModerationReport>

function OpenReportHarness() {
  const { openReport } = useModerationReport()
  return <button type="button" onClick={() => openReport({
    type: 'general_message',
    id: 'message-id',
    label: 'Reported member',
    preview: 'Exact captured message',
    subjectUserId: 'subject-id',
    subjectLabel: 'Reported member',
  })}>Report</button>
}

beforeEach(() => {
  jest.clearAllMocks()
  submitReportMock.mockResolvedValue({ reportId: 'report-id', caseId: 'case-id', caseNumber: 73, status: 'new' })
})

test('shows privacy, captured target, reasons, and emergency boundary', async () => {
  render(<ModerationReportProvider><OpenReportHarness /></ModerationReportProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Report' }))

  expect(await screen.findByRole('dialog', { name: 'Report a safety concern' })).toBeInTheDocument()
  expect(screen.getByText('Private to ShadowChat operators')).toBeInTheDocument()
  expect(screen.getByText('Exact captured message')).toBeInTheDocument()
  expect(screen.getByText(/not an emergency service/i)).toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /Harassment or bullying/i })).toBeInTheDocument()
})

test('submits a private report and presents a stable receipt', async () => {
  render(<ModerationReportProvider><OpenReportHarness /></ModerationReportProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Report' }))
  fireEvent.click(await screen.findByRole('radio', { name: /Harassment or bullying/i }))
  fireEvent.change(screen.getByPlaceholderText(/Tell the operator/i), { target: { value: 'Repeated unwanted contact.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send private report' }))

  await waitFor(() => expect(submitReportMock).toHaveBeenCalledWith(expect.objectContaining({
    category: 'harassment',
    details: 'Repeated unwanted contact.',
  })))
  expect(await screen.findByText('Report received')).toBeInTheDocument()
  expect(screen.getByText('SC-000073')).toBeInTheDocument()
  expect(screen.getByText(/never takes automatic action/i)).toBeInTheDocument()
})

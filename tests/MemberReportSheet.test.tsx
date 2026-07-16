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

function OpenLiveReportHarness({ type = 'live_message' }: {
  type?: 'live_room' | 'live_participant' | 'live_message'
}) {
  const { openReport } = useModerationReport()
  return <button type="button" onClick={() => openReport({
    type,
    id: 'live-target-id',
    label: 'JJ in Midnight Live',
    preview: 'Server-authoritative Live target',
    subjectUserId: 'live-subject-id',
    subjectLabel: 'JJ',
  })}>Report Live</button>
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

test.each([
  ['live_room', 'Reporting Shado Live room'],
  ['live_participant', 'Reporting Shado Live participant'],
  ['live_message', 'Reporting Shado Live message'],
] as const)('%s explains server evidence and never exposes screenshot upload', async (type, label) => {
  render(<ModerationReportProvider><OpenLiveReportHarness type={type} /></ModerationReportProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Report Live' }))

  expect(await screen.findByText(label)).toBeInTheDocument()
  expect(screen.getByText(/captures the authoritative room, participant, or message state on the server/i)).toBeInTheDocument()
  expect(screen.queryByText('Add screenshots')).not.toBeInTheDocument()
  expect(screen.queryByRole('textbox', { name: /upload/i })).not.toBeInTheDocument()
})

test('submits Live context without client attachments and keeps the stable receipt', async () => {
  render(<ModerationReportProvider><OpenLiveReportHarness /></ModerationReportProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Report Live' }))
  fireEvent.click(await screen.findByRole('radio', { name: /Threat or immediate safety/i }))
  fireEvent.change(screen.getByPlaceholderText(/Tell the operator/i), {
    target: { value: 'Live operator context.' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Send private report' }))

  await waitFor(() => expect(submitReportMock).toHaveBeenCalledWith(expect.objectContaining({
    target: expect.objectContaining({ type: 'live_message', id: 'live-target-id' }),
    category: 'immediate_safety',
    details: 'Live operator context.',
    attachments: [],
  })))
  expect(await screen.findByText('SC-000073')).toBeInTheDocument()
})

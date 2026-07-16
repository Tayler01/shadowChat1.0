import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { ShadoLiveCaseCenter } from '../src/features/moderation/ShadoLiveCaseCenter'
import { useAuth } from '../src/hooks/useAuth'
import {
  applyShadoLiveCaseAction,
  assignModerationCase,
  getShadoLiveModerationCase,
  listShadoLiveModerationCases,
} from '../src/lib/moderationCases'

jest.mock('../src/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/lib/moderationCases', () => {
  const actual = jest.requireActual('../src/lib/moderationCases')
  return {
    ...actual,
    applyShadoLiveCaseAction: jest.fn(),
    assignModerationCase: jest.fn(),
    getShadoLiveModerationCase: jest.fn(),
    listShadoLiveModerationCases: jest.fn(),
  }
})
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    success: jest.fn(),
  },
}))

const listCasesMock = listShadoLiveModerationCases as jest.MockedFunction<typeof listShadoLiveModerationCases>
const getCaseMock = getShadoLiveModerationCase as jest.MockedFunction<typeof getShadoLiveModerationCase>
const applyActionMock = applyShadoLiveCaseAction as jest.MockedFunction<typeof applyShadoLiveCaseAction>
const assignCaseMock = assignModerationCase as jest.MockedFunction<typeof assignModerationCase>

const summary = {
  id: 'live-case-1',
  caseNumber: 31,
  status: 'new' as const,
  severity: 'high' as const,
  targetType: 'live_participant' as const,
  primaryCategory: 'harassment' as const,
  subjectUserId: 'subject-1',
  subjectUsername: 'jj',
  subjectDisplayName: 'JJ',
  subjectAvatarUrl: null,
  assignedTo: 'operator-1',
  assigneeUsername: 'operator',
  assigneeDisplayName: 'Operator',
  reportCount: 2,
  ackDueAt: '2026-07-16T02:00:00Z',
  resolveDueAt: '2026-07-17T00:00:00Z',
  createdAt: '2026-07-16T00:00:00Z',
  updatedAt: '2026-07-16T01:00:00Z',
  version: 3,
}

const detail = {
  case: {
    id: 'live-case-1',
    caseNumber: 31,
    subjectUserId: 'subject-1',
    targetType: 'live_participant' as const,
    targetId: 'participant-1',
    primaryCategory: 'harassment' as const,
    status: 'new' as const,
    severity: 'high' as const,
    assignedTo: 'operator-1',
    fullAdminOnly: false,
    version: 3,
    ackDueAt: '2026-07-16T02:00:00Z',
    resolveDueAt: '2026-07-17T00:00:00Z',
    firstResponseAt: null,
    resolvedAt: null,
    outcomeCode: null,
    reporterSummary: null,
    createdAt: '2026-07-16T00:00:00Z',
    updatedAt: '2026-07-16T01:00:00Z',
    subject: { id: 'subject-1', username: 'jj', display_name: 'JJ' },
    assignee: null,
  },
  reports: [],
  evidence: [{
    id: 'evidence-1',
    report_id: 'report-1',
    target_type: 'live_participant' as const,
    target_id: 'participant-1',
    source_author_id: 'subject-1',
    snapshot: { roomId: 'room-1', body: 'Server-captured participant state' },
    content_hash: 'hash',
    captured_at: '2026-07-16T00:05:00Z',
  }],
  events: [],
  actions: [],
  activeBans: [],
}

describe('ShadoLiveCaseCenter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'operator-1' } })
    listCasesMock.mockResolvedValue([summary])
    getCaseMock.mockResolvedValue(detail)
    applyActionMock.mockResolvedValue({ ok: true, error: null, case: null, actionId: 'action-1' })
    assignCaseMock.mockResolvedValue(detail.case)
    jest.spyOn(window, 'confirm').mockReturnValue(true)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('loads only the Live queue and renders server-captured evidence', async () => {
    render(<ShadoLiveCaseCenter />)

    expect(await screen.findByText('SC-000031')).toBeInTheDocument()
    expect(listCasesMock).toHaveBeenCalledWith({ queue: 'all', limit: 30 })
    fireEvent.click(screen.getByText('SC-000031'))

    expect(await screen.findByText('Server-captured participant state')).toBeInTheDocument()
    expect(getCaseMock).toHaveBeenCalledWith('live-case-1')
    expect(screen.getByRole('button', { name: 'Remove participant' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mute speaker' })).toBeInTheDocument()
  })

  test('requires a reason and sends versioned, scoped restriction actions', async () => {
    render(<ShadoLiveCaseCenter />)
    fireEvent.click(await screen.findByText('SC-000031'))
    await screen.findByText('Server-captured participant state')

    fireEvent.click(screen.getByRole('button', { name: 'Set live restriction' }))
    expect(toast.error).toHaveBeenCalledWith('Choose a live restriction scope and enter a public reason')
    expect(applyActionMock).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'Public safety reason' }), {
      target: { value: 'Repeated unsafe Live behavior' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Private operator note' }), {
      target: { value: 'Evidence reviewed' },
    })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Restriction duration (hours)' }), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set live restriction' }))

    await waitFor(() => expect(applyActionMock).toHaveBeenCalledWith({
      caseId: 'live-case-1',
      expectedVersion: 3,
      actionType: 'set_live_restriction',
      requestedScopes: ['join', 'chat'],
      durationMinutes: 120,
      publicReason: 'Repeated unsafe Live behavior',
      internalNote: 'Evidence reviewed',
    }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('permanently audited'))
    expect(toast.success).toHaveBeenCalledWith('Shado Live safety action applied')
  })

  test('does not offer participant enforcement for a room-only case', async () => {
    listCasesMock.mockResolvedValue([{ ...summary, targetType: 'live_room' }])
    getCaseMock.mockResolvedValue({
      ...detail,
      case: { ...detail.case, targetType: 'live_room', targetId: 'room-1' },
    })
    render(<ShadoLiveCaseCenter />)
    fireEvent.click(await screen.findByText('SC-000031'))
    await screen.findByText('Server-captured participant state')

    expect(screen.queryByRole('button', { name: 'Remove participant' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mute speaker' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'End room' })).toBeInTheDocument()
  })
})

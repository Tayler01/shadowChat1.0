import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { AdminAutomationApprovals } from '../src/components/settings/AdminAutomationApprovals'

const mockRefresh = jest.fn()
const mockApprovePacket = jest.fn()
const mockRejectPacket = jest.fn()
const mockArchivePacket = jest.fn()
const mockUseAutomationApprovals = jest.fn()

jest.mock('../src/hooks/useAutomationApprovals', () => ({
  useAutomationApprovals: () => mockUseAutomationApprovals(),
}))

const openPacket = {
  id: 'packet-1',
  packet_type: 'build',
  status: 'ready_for_review',
  candidate_id: 'FEATURE-001',
  source_key: 'scan-2026-06-08:FEATURE-001',
  category: 'feature',
  title: 'Automation approval queue',
  summary: 'Create a full-admin review queue.',
  evidence: [{ file: 'docs/AUTOMATION_APPROVAL_QUEUE.md' }],
  risk_notes: 'Approval must not trigger a runner.',
  proposed_scope: 'Tables, RPCs, hook, Settings panel, and tests.',
  generated_prompt: 'Build FEATURE-001 as a queue-only approval surface.',
  verification_plan: 'Run targeted Jest, lint, typecheck, build, and schema checks.',
  branch_name: 'codex/shadowchat-improvement-batch-20260608',
  pr_url: null,
  preview_url: 'https://example.test/preview',
  artifact_url: null,
  packet_url: 'https://example.test/packet',
  review_markdown: '',
  redacted_logs: [],
  metadata: {},
  created_by: null,
  approved_at: null,
  approved_by: null,
  rejected_at: null,
  rejected_by: null,
  rejection_reason: null,
  archived_at: null,
  archived_by: null,
  created_at: '2026-06-08T13:00:00.000Z',
  updated_at: '2026-06-08T13:00:00.000Z',
} as const

const archivedPacket = {
  ...openPacket,
  id: 'packet-2',
  status: 'archived',
  title: 'Archived packet',
  preview_url: 'javascript:alert(1)',
} as const

beforeEach(() => {
  jest.clearAllMocks()
  mockApprovePacket.mockResolvedValue(openPacket)
  mockRejectPacket.mockResolvedValue({ ...openPacket, status: 'rejected' })
  mockArchivePacket.mockResolvedValue({ ...openPacket, status: 'archived' })
  mockRefresh.mockResolvedValue(undefined)
  mockUseAutomationApprovals.mockReturnValue({
    packets: [openPacket, archivedPacket],
    eventsByPacketId: {
      'packet-1': [
        {
          id: 'event-1',
          packet_id: 'packet-1',
          event_type: 'review_ready',
          actor_id: null,
          message: 'Packet is ready for full-admin review.',
          metadata: {},
          created_at: '2026-06-08T13:05:00.000Z',
        },
      ],
    },
    loading: false,
    error: null,
    activeActionId: null,
    refresh: mockRefresh,
    approvePacket: mockApprovePacket,
    rejectPacket: mockRejectPacket,
    archivePacket: mockArchivePacket,
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('renders open automation packets with safe details and links', () => {
  render(<AdminAutomationApprovals />)

  expect(screen.getByRole('heading', { name: 'Automation Approvals' })).toBeInTheDocument()
  expect(screen.getAllByText('Automation approval queue').length).toBeGreaterThan(0)
  expect(screen.getByText('Create a full-admin review queue.')).toBeInTheDocument()
  expect(screen.getByText('Packet is ready for full-admin review.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /preview/i })).toHaveAttribute('href', 'https://example.test/preview')
  expect(screen.getByRole('link', { name: /packet/i })).toHaveAttribute('href', 'https://example.test/packet')
  expect(screen.queryByText('Archived packet')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /start build/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /send to codex/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /merge/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /push/i })).not.toBeInTheDocument()
})

test('shows archived packets only when all is selected and rejects unsafe links', () => {
  render(<AdminAutomationApprovals />)

  fireEvent.click(screen.getByRole('button', { name: 'All' }))
  fireEvent.click(screen.getByRole('button', { name: /archived packet/i }))

  expect(screen.getAllByText('Archived packet').length).toBeGreaterThan(0)
  expect(screen.queryByRole('link', { name: /preview/i })).not.toBeInTheDocument()
})

test('does not show closed packet detail while open filter has no packets', () => {
  mockUseAutomationApprovals.mockReturnValueOnce({
    packets: [archivedPacket],
    eventsByPacketId: {},
    loading: false,
    error: null,
    activeActionId: null,
    refresh: mockRefresh,
    approvePacket: mockApprovePacket,
    rejectPacket: mockRejectPacket,
    archivePacket: mockArchivePacket,
  })

  render(<AdminAutomationApprovals />)

  expect(screen.getByText('No open packets.')).toBeInTheDocument()
  expect(screen.queryByText('Archived packet')).not.toBeInTheDocument()
})

test('approves rejects and archives through the hook actions', async () => {
  jest.spyOn(window, 'prompt').mockReturnValueOnce('Scope is too large.')
  jest.spyOn(window, 'confirm').mockReturnValueOnce(true)

  render(<AdminAutomationApprovals />)

  fireEvent.click(screen.getByRole('button', { name: /approve automation approval queue/i }))
  await waitFor(() => {
    expect(mockApprovePacket).toHaveBeenCalledWith('packet-1')
  })

  fireEvent.click(screen.getByRole('button', { name: /reject automation approval queue/i }))
  await waitFor(() => {
    expect(mockRejectPacket).toHaveBeenCalledWith('packet-1', 'Scope is too large.')
  })

  fireEvent.click(screen.getByRole('button', { name: /archive automation approval queue/i }))
  await waitFor(() => {
    expect(mockArchivePacket).toHaveBeenCalledWith('packet-1')
  })
})

test('shows loading and empty states', () => {
  mockUseAutomationApprovals.mockReturnValueOnce({
    packets: [],
    eventsByPacketId: {},
    loading: true,
    error: null,
    activeActionId: null,
    refresh: mockRefresh,
    approvePacket: mockApprovePacket,
    rejectPacket: mockRejectPacket,
    archivePacket: mockArchivePacket,
  })

  const { rerender } = render(<AdminAutomationApprovals />)
  expect(screen.getByText('Loading automation approvals.')).toBeInTheDocument()

  mockUseAutomationApprovals.mockReturnValueOnce({
    packets: [],
    eventsByPacketId: {},
    loading: false,
    error: null,
    activeActionId: null,
    refresh: mockRefresh,
    approvePacket: mockApprovePacket,
    rejectPacket: mockRejectPacket,
    archivePacket: mockArchivePacket,
  })

  rerender(<AdminAutomationApprovals />)
  expect(screen.getByText('No automation approval packets yet.')).toBeInTheDocument()
})

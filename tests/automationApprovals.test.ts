import {
  approveAutomationApprovalPacket,
  archiveAutomationApprovalPacket,
  fetchAutomationApprovalPacketEvents,
  fetchAutomationApprovalPackets,
  rejectAutomationApprovalPacket,
} from '../src/lib/automationApprovals'

const selectPackets = jest.fn()
const orderPackets = jest.fn()
const limitPackets = jest.fn()
const selectEvents = jest.fn()
const inEvents = jest.fn()
const orderEvents = jest.fn()
const rpc = jest.fn()

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(async () => ({
    from: jest.fn((table: string) => {
      if (table === 'automation_approval_packet_events') {
        return {
          select: selectEvents,
        }
      }

      return {
        select: selectPackets,
      }
    }),
    rpc,
  })),
}))

const packetRow = {
  id: 'packet-1',
  packet_type: 'build',
  status: 'pending',
  candidate_id: 'FEATURE-001',
  source_key: 'scan-2026-06-08:FEATURE-001',
  category: 'feature',
  title: 'Automation approval queue',
  summary: 'Create the queue.',
  evidence: [{ file: 'docs/AUTOMATION_APPROVAL_QUEUE.md' }],
  risk_notes: 'Keep it queue-only.',
  proposed_scope: 'Tables, RPCs, Settings panel.',
  generated_prompt: 'Generated implementation prompt.',
  verification_plan: 'Run targeted Jest.',
  branch_name: 'codex/shadowchat-improvement-batch-20260608',
  pr_url: null,
  preview_url: 'https://example.test/preview',
  artifact_url: null,
  packet_url: null,
  review_markdown: '',
  redacted_logs: ['lint passed'],
  metadata: { source: 'test' },
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
}

beforeEach(() => {
  jest.clearAllMocks()
  limitPackets.mockResolvedValue({ data: [], error: null })
  orderPackets.mockReturnValue({ limit: limitPackets })
  selectPackets.mockReturnValue({ order: orderPackets })
  orderEvents.mockResolvedValue({ data: [], error: null })
  inEvents.mockReturnValue({ order: orderEvents })
  selectEvents.mockReturnValue({ in: inEvents })
  rpc.mockResolvedValue({ data: packetRow, error: null })
})

test('loads automation approval packets and normalizes JSON columns', async () => {
  limitPackets.mockResolvedValueOnce({
    data: [
      packetRow,
      {
        ...packetRow,
        id: 'packet-2',
        title: 'Malformed JSON fallback',
        evidence: null,
        redacted_logs: { log: 'not an array' },
        metadata: [],
      },
    ],
    error: null,
  })

  const packets = await fetchAutomationApprovalPackets()

  expect(selectPackets).toHaveBeenCalledWith('*')
  expect(orderPackets).toHaveBeenCalledWith('created_at', { ascending: false })
  expect(limitPackets).toHaveBeenCalledWith(100)
  expect(packets[0]).toEqual(expect.objectContaining({
    id: 'packet-1',
    evidence: [{ file: 'docs/AUTOMATION_APPROVAL_QUEUE.md' }],
    metadata: { source: 'test' },
  }))
  expect(packets[1]).toEqual(expect.objectContaining({
    evidence: [],
    redacted_logs: [],
    metadata: {},
  }))
})

test('loads automation approval audit events by packet id', async () => {
  orderEvents.mockResolvedValueOnce({
    data: [
      {
        id: 'event-1',
        packet_id: 'packet-1',
        event_type: 'approved',
        actor_id: 'admin-1',
        message: 'Approved.',
        metadata: { status: 'approved' },
        created_at: '2026-06-08T13:10:00.000Z',
      },
    ],
    error: null,
  })

  const events = await fetchAutomationApprovalPacketEvents(['packet-1'])

  expect(inEvents).toHaveBeenCalledWith('packet_id', ['packet-1'])
  expect(orderEvents).toHaveBeenCalledWith('created_at', { ascending: true })
  expect(events[0]).toEqual(expect.objectContaining({
    event_type: 'approved',
    metadata: { status: 'approved' },
  }))
})

test('skips audit-event fetch when no packet ids are provided', async () => {
  await expect(fetchAutomationApprovalPacketEvents([])).resolves.toEqual([])
  expect(selectEvents).not.toHaveBeenCalled()
})

test('calls automation approval transition RPCs', async () => {
  await approveAutomationApprovalPacket('packet-1')
  await rejectAutomationApprovalPacket('packet-1', 'Too risky right now.')
  await archiveAutomationApprovalPacket('packet-1')

  expect(rpc).toHaveBeenNthCalledWith(1, 'approve_automation_approval_packet', {
    p_packet_id: 'packet-1',
  })
  expect(rpc).toHaveBeenNthCalledWith(2, 'reject_automation_approval_packet', {
    p_packet_id: 'packet-1',
    p_reason: 'Too risky right now.',
  })
  expect(rpc).toHaveBeenNthCalledWith(3, 'archive_automation_approval_packet', {
    p_packet_id: 'packet-1',
  })
})

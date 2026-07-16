import {
  applyShadoLiveCaseAction,
  formatModerationCaseReference,
  getModerationCase,
  getShadoLiveModerationCase,
  listShadoLiveModerationCases,
  listMyModerationReports,
  submitModerationReport,
  validateModerationEvidenceFiles,
  type ModerationReportTarget,
} from '../src/lib/moderationCases'

const getUser = jest.fn()
const rpc = jest.fn()
const upload = jest.fn()
const remove = jest.fn()
const createSignedUrls = jest.fn()

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(async () => ({
    auth: { getUser },
    rpc,
    storage: {
      from: jest.fn(() => ({ upload, remove, createSignedUrls })),
    },
  })),
}))

const target: ModerationReportTarget = {
  type: 'general_message',
  id: '10000000-0000-4000-8000-000000000001',
  label: 'Reported member',
  preview: 'Captured message preview',
  subjectUserId: '10000000-0000-4000-8000-000000000002',
  subjectLabel: 'Reported member',
}

beforeEach(() => {
  jest.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: '10000000-0000-4000-8000-000000000003' } }, error: null })
  upload.mockResolvedValue({ error: null })
  remove.mockResolvedValue({ error: null })
  createSignedUrls.mockResolvedValue({ data: [], error: null })
})

test('formats stable member-facing case references', () => {
  expect(formatModerationCaseReference(42)).toBe('SC-000042')
})

test('validates private evidence type, size, and count before upload', () => {
  expect(validateModerationEvidenceFiles([new File(['ok'], 'proof.png', { type: 'image/png' })])).toHaveLength(1)
  expect(() => validateModerationEvidenceFiles([new File(['bad'], 'proof.txt', { type: 'text/plain' })])).toThrow(/png/i)
  expect(() => validateModerationEvidenceFiles(Array.from({ length: 6 }, (_, index) => new File(['ok'], `${index}.png`, { type: 'image/png' })))).toThrow(/up to 5/i)
})

test('uploads staged evidence and submits only target identity and operator context', async () => {
  rpc.mockResolvedValue({
    data: [{ report_id: 'report-id', case_id: 'case-id', case_number: 9, case_status: 'new' }],
    error: null,
  })
  const attachment = new File(['proof'], 'phone screenshot.png', { type: 'image/png' })
  const receipt = await submitModerationReport({
    target,
    category: 'harassment',
    details: 'Repeated unwanted messages',
    attachments: [attachment],
    clientReportId: '10000000-0000-4000-8000-000000000004',
  })

  expect(upload).toHaveBeenCalledTimes(1)
  expect(rpc).toHaveBeenCalledWith('submit_member_report', expect.objectContaining({
    p_target_type: 'general_message',
    p_target_id: target.id,
    p_category: 'harassment',
    p_details: 'Repeated unwanted messages',
  }))
  expect(rpc.mock.calls[0][1]).not.toHaveProperty('content_snapshot')
  expect(receipt).toEqual({ reportId: 'report-id', caseId: 'case-id', caseNumber: 9, status: 'new' })
})

test.each(['live_room', 'live_participant', 'live_message'] as const)(
  'submits %s through the server-authoritative Live intake without uploading client evidence',
  async liveTargetType => {
    rpc.mockResolvedValue({
      data: [{ report_id: 'live-report', case_id: 'live-case', case_number: 19, case_status: 'new' }],
      error: null,
    })
    const liveTarget: ModerationReportTarget = {
      ...target,
      type: liveTargetType,
      id: `20000000-0000-4000-8000-00000000000${liveTargetType === 'live_room' ? '1' : liveTargetType === 'live_participant' ? '2' : '3'}`,
    }

    await expect(submitModerationReport({
      target: liveTarget,
      category: 'immediate_safety',
      details: '  Operator context only.  ',
      clientReportId: '20000000-0000-4000-8000-000000000004',
    })).resolves.toEqual({
      reportId: 'live-report',
      caseId: 'live-case',
      caseNumber: 19,
      status: 'new',
    })

    expect(upload).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('submit_shado_live_report', {
      p_target_type: liveTargetType,
      p_target_id: liveTarget.id,
      p_category: 'immediate_safety',
      p_client_report_id: '20000000-0000-4000-8000-000000000004',
      p_details: 'Operator context only.',
    })
    expect(rpc.mock.calls[0][1]).not.toEqual(expect.objectContaining({
      p_attachments: expect.anything(),
    }))
  },
)

test('rejects screenshots for Live reports before upload or intake', async () => {
  await expect(submitModerationReport({
    target: { ...target, type: 'live_message' },
    category: 'harassment',
    details: '',
    attachments: [new File(['proof'], 'proof.png', { type: 'image/png' })],
  })).rejects.toThrow(/authoritative room evidence/i)
  expect(upload).not.toHaveBeenCalled()
  expect(rpc).not.toHaveBeenCalled()
})

test('cleans staged evidence when intake fails', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('intake unavailable') })
  await expect(submitModerationReport({
    target,
    category: 'spam_or_scam',
    details: '',
    attachments: [new File(['proof'], 'proof.webp', { type: 'image/webp' })],
    clientReportId: '10000000-0000-4000-8000-000000000005',
  })).rejects.toThrow('intake unavailable')
  expect(remove).toHaveBeenCalledWith([expect.stringContaining('/10000000-0000-4000-8000-000000000005/')])
})

test('maps the sanitized reporter projection', async () => {
  rpc.mockResolvedValue({ data: [{
    report_id: 'report-id',
    case_number: 11,
    target_type: 'dm_message',
    category: 'privacy_or_impersonation',
    status: 'investigating',
    target_preview: 'Private captured message',
    reporter_summary: 'We are reviewing this now.',
    submitted_at: '2026-07-12T00:00:00Z',
    updated_at: '2026-07-12T01:00:00Z',
  }], error: null })
  await expect(listMyModerationReports()).resolves.toEqual([expect.objectContaining({
    reportId: 'report-id',
    caseNumber: 11,
    status: 'investigating',
    reporterSummary: 'We are reviewing this now.',
  })])
})

test('signs case attachments only when operator detail is opened', async () => {
  rpc.mockResolvedValue({ data: {
    case: {
      id: 'case-id', case_number: 12, subject_user_id: null, target_type: 'user', target_id: target.id,
      primary_category: 'other', status: 'new', severity: 'medium', assigned_to: null, full_admin_only: false,
      version: 1, ack_due_at: '2026-07-12T01:00:00Z', resolve_due_at: '2026-07-13T00:00:00Z',
      created_at: '2026-07-12T00:00:00Z', updated_at: '2026-07-12T00:00:00Z',
    },
    reports: [{ id: 'report-id', attachments: [{ id: 'attachment-id', path: 'owner/report/proof.png', name: 'proof.png' }] }],
    evidence: [], events: [], actions: [], activeBans: [],
  }, error: null })
  createSignedUrls.mockResolvedValue({ data: [{ signedUrl: 'https://signed.example/proof', error: null }], error: null })

  const detail = await getModerationCase('case-id')
  expect(createSignedUrls).toHaveBeenCalledWith(['owner/report/proof.png'], 1800)
  expect(detail.reports[0].attachments?.[0].signedUrl).toBe('https://signed.example/proof')
})

test('uses only the dedicated Live operator list, detail, and action RPCs', async () => {
  rpc
    .mockResolvedValueOnce({ data: [{
      case_id: 'live-case', case_number: 22, status: 'new', severity: 'high',
      target_type: 'live_participant', primary_category: 'harassment',
      subject_user_id: 'subject-id', subject_username: 'jj', subject_display_name: 'JJ',
      subject_avatar_url: null, assigned_to: 'operator-id', assignee_username: 'op',
      assignee_display_name: 'Operator', report_count: 2,
      ack_due_at: '2026-07-16T02:00:00Z', resolve_due_at: '2026-07-17T00:00:00Z',
      created_at: '2026-07-16T00:00:00Z', updated_at: '2026-07-16T01:00:00Z', version: 3,
    }], error: null })
    .mockResolvedValueOnce({ data: {
      case: {
        id: 'live-case', case_number: 22, subject_user_id: 'subject-id',
        target_type: 'live_participant', target_id: 'participant-id',
        primary_category: 'harassment', status: 'new', severity: 'high',
        assigned_to: 'operator-id', full_admin_only: false, version: 3,
        ack_due_at: '2026-07-16T02:00:00Z', resolve_due_at: '2026-07-17T00:00:00Z',
        created_at: '2026-07-16T00:00:00Z', updated_at: '2026-07-16T01:00:00Z',
      }, reports: [], evidence: [], events: [], actions: [], activeBans: [],
    }, error: null })
    .mockResolvedValueOnce({ data: {
      ok: true, actionId: 'action-id', case: {
        id: 'live-case', case_number: 22, subject_user_id: 'subject-id',
        target_type: 'live_participant', target_id: 'participant-id',
        primary_category: 'harassment', status: 'actioned', severity: 'high',
        assigned_to: 'operator-id', full_admin_only: false, version: 4,
        ack_due_at: '2026-07-16T02:00:00Z', resolve_due_at: '2026-07-17T00:00:00Z',
        created_at: '2026-07-16T00:00:00Z', updated_at: '2026-07-16T01:10:00Z',
      },
    }, error: null })

  await expect(listShadoLiveModerationCases({
    queue: 'all', targetType: 'live_participant', search: '  jj  ', limit: 99,
  })).resolves.toEqual([expect.objectContaining({
    id: 'live-case', targetType: 'live_participant', reportCount: 2, version: 3,
  })])
  await expect(getShadoLiveModerationCase('live-case')).resolves.toEqual(expect.objectContaining({
    case: expect.objectContaining({ id: 'live-case', targetType: 'live_participant' }),
  }))
  await expect(applyShadoLiveCaseAction({
    caseId: 'live-case', expectedVersion: 3, actionType: 'set_live_restriction',
    requestedScopes: ['join', 'chat'], durationMinutes: 60,
    publicReason: '  Safety review  ', internalNote: '  Evidence checked  ',
  })).resolves.toEqual(expect.objectContaining({ ok: true, actionId: 'action-id' }))

  expect(rpc).toHaveBeenNthCalledWith(1, 'list_shado_live_moderation_cases', {
    p_queue: 'all', p_status: null, p_severity: null,
    p_target_type: 'live_participant', p_category: null, p_search: 'jj',
    p_limit: 50, p_before_updated_at: null, p_before_id: null,
  })
  expect(rpc).toHaveBeenNthCalledWith(2, 'get_shado_live_moderation_case', {
    p_case_id: 'live-case',
  })
  expect(rpc).toHaveBeenNthCalledWith(3, 'apply_shado_live_case_action', {
    p_case_id: 'live-case', p_expected_version: 3,
    p_action_type: 'set_live_restriction', p_requested_scopes: ['join', 'chat'],
    p_duration_minutes: 60, p_public_reason: 'Safety review',
    p_internal_note: 'Evidence checked',
  })
})

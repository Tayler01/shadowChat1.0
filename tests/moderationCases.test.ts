import {
  formatModerationCaseReference,
  getModerationCase,
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

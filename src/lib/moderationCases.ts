import { getWorkingClient } from './supabase'

export const MODERATION_EVIDENCE_BUCKET = 'moderation-evidence'
export const MAX_MODERATION_ATTACHMENTS = 5
export const MAX_MODERATION_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MODERATION_ATTACHMENT_SIGNED_URL_SECONDS = 30 * 60

export type ModerationTargetType =
  | 'user'
  | 'general_message'
  | 'dm_message'
  | 'shadow_pin_image'
  | 'shadow_pin_comment'
  | 'live_room'
  | 'live_participant'
  | 'live_message'

export type ModerationReportCategory =
  | 'harassment'
  | 'immediate_safety'
  | 'hate_or_abuse'
  | 'sexual_content'
  | 'spam_or_scam'
  | 'privacy_or_impersonation'
  | 'self_harm'
  | 'other'

export type ModerationCaseStatus =
  | 'new'
  | 'triaged'
  | 'investigating'
  | 'waiting'
  | 'actioned'
  | 'resolved'
  | 'dismissed'
  | 'closed'

export type ModerationCaseSeverity = 'low' | 'medium' | 'high' | 'critical'
export type ModerationCaseQueue = 'new' | 'mine' | 'in_review' | 'resolved' | 'all'
export type ModerationCaseOutcome =
  | 'no_violation'
  | 'content_removed'
  | 'channel_restricted'
  | 'member_warned'
  | 'duplicate'
  | 'insufficient_evidence'
  | 'other'

export type ModerationCaseActionType =
  | 'no_action'
  | 'remove_content'
  | 'channel_ban'
  | 'end_live_room'
  | 'remove_live_participant'
  | 'mute_live_participant'
  | 'set_live_restriction'
  | 'revoke_live_restriction'

export type ModerationReportTarget = {
  type: ModerationTargetType
  id: string
  label: string
  preview: string
  subjectUserId: string
  subjectLabel: string
  subjectUsername?: string | null
  subjectAvatarUrl?: string | null
  conversationId?: string | null
}

export type ModerationAttachmentUpload = {
  path: string
  name: string
}

export type ModerationReportReceipt = {
  reportId: string
  caseId: string
  caseNumber: number
  status: ModerationCaseStatus
}

export type MyModerationReport = {
  reportId: string
  caseNumber: number
  targetType: ModerationTargetType
  category: ModerationReportCategory
  status: ModerationCaseStatus
  targetPreview: string
  reporterSummary: string | null
  submittedAt: string
  updatedAt: string
}

export type ModerationCaseSummary = {
  id: string
  caseNumber: number
  status: ModerationCaseStatus
  severity: ModerationCaseSeverity
  targetType: ModerationTargetType
  primaryCategory: ModerationReportCategory
  subjectUserId: string | null
  subjectUsername: string | null
  subjectDisplayName: string | null
  subjectAvatarUrl: string | null
  assignedTo: string | null
  assigneeUsername: string | null
  assigneeDisplayName: string | null
  reportCount: number
  ackDueAt: string
  resolveDueAt: string
  createdAt: string
  updatedAt: string
  version: number
}

export type ModerationCaseRecord = {
  id: string
  caseNumber: number
  subjectUserId: string | null
  targetType: ModerationTargetType
  targetId: string
  primaryCategory: ModerationReportCategory
  status: ModerationCaseStatus
  severity: ModerationCaseSeverity
  assignedTo: string | null
  fullAdminOnly: boolean
  version: number
  ackDueAt: string
  resolveDueAt: string
  firstResponseAt: string | null
  resolvedAt: string | null
  outcomeCode: ModerationCaseOutcome | null
  reporterSummary: string | null
  createdAt: string
  updatedAt: string
  subject?: ModerationPerson | null
  assignee?: ModerationPerson | null
}

export type ModerationPerson = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url?: string | null
  avatar_thumbnail_url?: string | null
  color?: string | null
  admin_role?: 'admin' | 'sub_admin' | null
  created_at?: string
}

export type ModerationCaseReport = {
  id: string
  reporter_user_id: string | null
  subject_user_id: string | null
  target_type: ModerationTargetType
  target_id: string
  category: ModerationReportCategory
  details: string
  submitted_at: string
  reporter?: ModerationPerson | null
  attachments?: ModerationCaseAttachment[]
}

export type ModerationCaseAttachment = {
  id: string
  report_id: string
  path: string
  name: string
  size_bytes: number
  content_type: string
  created_at: string
  signedUrl?: string | null
  signedUrlError?: string | null
}

export type ModerationEvidence = {
  id: string
  report_id: string
  target_type: ModerationTargetType
  target_id: string
  source_author_id: string | null
  snapshot: Record<string, unknown>
  content_hash: string
  captured_at: string
}

export type ModerationCaseEvent = {
  id: string
  actor_user_id: string | null
  event_type: string
  visibility: 'operator' | 'reporter'
  from_status: string | null
  to_status: string | null
  internal_note: string | null
  reporter_summary: string | null
  metadata: Record<string, unknown>
  created_at: string
  actor?: ModerationPerson | null
}

export type ModerationCaseAction = {
  id: string
  actor_user_id: string | null
  action_type: ModerationCaseActionType
  status: 'applied' | 'failed'
  public_reason: string | null
  internal_note: string | null
  requested_scopes: string[]
  duration_minutes: number | null
  before_state: Record<string, unknown>
  after_state: Record<string, unknown>
  error_message: string | null
  created_at: string
}

export type ModerationCaseDetail = {
  case: ModerationCaseRecord
  reports: ModerationCaseReport[]
  evidence: ModerationEvidence[]
  events: ModerationCaseEvent[]
  actions: ModerationCaseAction[]
  activeBans: Array<Record<string, unknown> & { scope?: string; expires_at?: string | null }>
}

export const MODERATION_REPORT_REASONS: Array<{
  value: ModerationReportCategory
  label: string
  description: string
}> = [
  { value: 'harassment', label: 'Harassment or bullying', description: 'Targeted abuse, intimidation, or repeated unwanted behavior.' },
  { value: 'immediate_safety', label: 'Threat or immediate safety', description: 'A credible threat, danger, or urgent safety concern.' },
  { value: 'hate_or_abuse', label: 'Hate or severe abuse', description: 'Hateful, dehumanizing, or violently abusive content.' },
  { value: 'sexual_content', label: 'Sexual or inappropriate content', description: 'Unwanted sexual content or unsafe explicit material.' },
  { value: 'spam_or_scam', label: 'Spam or scam', description: 'Fraud, phishing, impersonated offers, or repeated spam.' },
  { value: 'privacy_or_impersonation', label: 'Privacy or impersonation', description: 'Private information, identity misuse, or pretending to be someone else.' },
  { value: 'self_harm', label: 'Self-harm concern', description: 'Content suggesting someone may be at risk of harming themselves.' },
  { value: 'other', label: 'Something else', description: 'A safety issue that does not fit another reason.' },
]

const getRandomId = () => (
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, token => {
        const value = Math.floor(Math.random() * 16)
        const nibble = token === 'x' ? value : (value & 0x3) | 0x8
        return nibble.toString(16)
      })
)

const sanitizeFileName = (name: string) => {
  const extension = name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'img'
  const stem = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'evidence'
  return `${stem}.${extension.toLowerCase()}`
}

export const formatModerationCaseReference = (caseNumber: number) => (
  `SC-${String(caseNumber).padStart(6, '0')}`
)

export const validateModerationEvidenceFiles = (files: File[]) => {
  if (files.length > MAX_MODERATION_ATTACHMENTS) throw new Error(`Attach up to ${MAX_MODERATION_ATTACHMENTS} images`)
  files.forEach(file => {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      throw new Error('Evidence attachments must be PNG, JPEG, WebP, or GIF images')
    }
    if (file.size < 1 || file.size > MAX_MODERATION_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} must be smaller than 10 MB`)
    }
  })
  return files
}

export const submitModerationReport = async ({
  target,
  category,
  details,
  attachments = [],
  clientReportId = getRandomId(),
}: {
  target: ModerationReportTarget
  category: ModerationReportCategory
  details: string
  attachments?: File[]
  clientReportId?: string
}): Promise<ModerationReportReceipt> => {
  validateModerationEvidenceFiles(attachments)
  const client = await getWorkingClient()
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('Sign in before sending a report')

  const isShadoLiveTarget = target.type === 'live_room'
    || target.type === 'live_participant'
    || target.type === 'live_message'
  if (isShadoLiveTarget) {
    if (attachments.length > 0) {
      throw new Error('Shado Live reports capture authoritative room evidence instead of screenshots')
    }
    const { data, error } = await client.rpc('submit_shado_live_report', {
      p_target_type: target.type,
      p_target_id: target.id,
      p_category: category,
      p_client_report_id: clientReportId,
      p_details: details.trim(),
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.report_id || !row?.case_id) throw new Error('Report receipt was not returned')
    return {
      reportId: String(row.report_id),
      caseId: String(row.case_id),
      caseNumber: Number(row.case_number),
      status: row.case_status as ModerationCaseStatus,
    }
  }

  const uploaded: ModerationAttachmentUpload[] = []
  try {
    for (const [index, file] of attachments.entries()) {
      const path = `${user.id}/${clientReportId}/${index}-${getRandomId()}-${sanitizeFileName(file.name)}`
      const { error } = await client.storage.from(MODERATION_EVIDENCE_BUCKET).upload(path, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      })
      if (error) throw error
      uploaded.push({ path, name: file.name })
    }

    const { data, error } = await client.rpc('submit_member_report', {
      p_target_type: target.type,
      p_target_id: target.id,
      p_category: category,
      p_client_report_id: clientReportId,
      p_details: details.trim(),
      p_attachments: uploaded,
    })
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    if (!row?.report_id || !row?.case_id) throw new Error('Report receipt was not returned')
    return {
      reportId: String(row.report_id),
      caseId: String(row.case_id),
      caseNumber: Number(row.case_number),
      status: row.case_status as ModerationCaseStatus,
    }
  } catch (error) {
    if (uploaded.length > 0) {
      await client.storage.from(MODERATION_EVIDENCE_BUCKET).remove(uploaded.map(item => item.path)).catch(() => undefined)
    }
    throw error
  }
}

export const listMyModerationReports = async ({
  limit = 30,
  cursor,
}: {
  limit?: number
  cursor?: { submittedAt: string; id: string } | null
} = {}): Promise<MyModerationReport[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_my_member_reports', {
    p_limit: Math.max(1, Math.min(limit, 50)),
    p_before_submitted_at: cursor?.submittedAt ?? null,
    p_before_id: cursor?.id ?? null,
  })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    reportId: String(row.report_id),
    caseNumber: Number(row.case_number),
    targetType: row.target_type as ModerationTargetType,
    category: row.category as ModerationReportCategory,
    status: row.status as ModerationCaseStatus,
    targetPreview: String(row.target_preview ?? ''),
    reporterSummary: row.reporter_summary ? String(row.reporter_summary) : null,
    submittedAt: String(row.submitted_at),
    updatedAt: String(row.updated_at),
  }))
}

export const listModerationCases = async ({
  queue = 'new',
  status,
  severity,
  targetType,
  category,
  search,
  limit = 30,
  cursor,
}: {
  queue?: ModerationCaseQueue
  status?: ModerationCaseStatus | null
  severity?: ModerationCaseSeverity | null
  targetType?: ModerationTargetType | null
  category?: ModerationReportCategory | null
  search?: string
  limit?: number
  cursor?: { updatedAt: string; id: string } | null
} = {}): Promise<ModerationCaseSummary[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_moderation_cases', {
    p_queue: queue,
    p_status: status ?? null,
    p_severity: severity ?? null,
    p_target_type: targetType ?? null,
    p_category: category ?? null,
    p_search: search?.trim() || null,
    p_limit: Math.max(1, Math.min(limit, 50)),
    p_before_updated_at: cursor?.updatedAt ?? null,
    p_before_id: cursor?.id ?? null,
  })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.case_id),
    caseNumber: Number(row.case_number),
    status: row.status as ModerationCaseStatus,
    severity: row.severity as ModerationCaseSeverity,
    targetType: row.target_type as ModerationTargetType,
    primaryCategory: row.primary_category as ModerationReportCategory,
    subjectUserId: row.subject_user_id ? String(row.subject_user_id) : null,
    subjectUsername: row.subject_username ? String(row.subject_username) : null,
    subjectDisplayName: row.subject_display_name ? String(row.subject_display_name) : null,
    subjectAvatarUrl: row.subject_avatar_url ? String(row.subject_avatar_url) : null,
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    assigneeUsername: row.assignee_username ? String(row.assignee_username) : null,
    assigneeDisplayName: row.assignee_display_name ? String(row.assignee_display_name) : null,
    reportCount: Number(row.report_count ?? 0),
    ackDueAt: String(row.ack_due_at),
    resolveDueAt: String(row.resolve_due_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
  }))
}

export const listShadoLiveModerationCases = async ({
  queue = 'new',
  status,
  severity,
  targetType,
  category,
  search,
  limit = 30,
}: {
  queue?: ModerationCaseQueue
  status?: ModerationCaseStatus | null
  severity?: ModerationCaseSeverity | null
  targetType?: Extract<ModerationTargetType, `live_${string}`> | null
  category?: ModerationReportCategory | null
  search?: string
  limit?: number
} = {}): Promise<ModerationCaseSummary[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_shado_live_moderation_cases', {
    p_queue: queue,
    p_status: status ?? null,
    p_severity: severity ?? null,
    p_target_type: targetType ?? null,
    p_category: category ?? null,
    p_search: search?.trim() || null,
    p_limit: Math.max(1, Math.min(limit, 50)),
    p_before_updated_at: null,
    p_before_id: null,
  })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.case_id),
    caseNumber: Number(row.case_number),
    status: row.status as ModerationCaseStatus,
    severity: row.severity as ModerationCaseSeverity,
    targetType: row.target_type as ModerationTargetType,
    primaryCategory: row.primary_category as ModerationReportCategory,
    subjectUserId: row.subject_user_id ? String(row.subject_user_id) : null,
    subjectUsername: row.subject_username ? String(row.subject_username) : null,
    subjectDisplayName: row.subject_display_name ? String(row.subject_display_name) : null,
    subjectAvatarUrl: row.subject_avatar_url ? String(row.subject_avatar_url) : null,
    assignedTo: row.assigned_to ? String(row.assigned_to) : null,
    assigneeUsername: row.assignee_username ? String(row.assignee_username) : null,
    assigneeDisplayName: row.assignee_display_name ? String(row.assignee_display_name) : null,
    reportCount: Number(row.report_count ?? 0),
    ackDueAt: String(row.ack_due_at),
    resolveDueAt: String(row.resolve_due_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
  }))
}

const mapCaseRecord = (row: Record<string, unknown>): ModerationCaseRecord => ({
  id: String(row.id),
  caseNumber: Number(row.case_number),
  subjectUserId: row.subject_user_id ? String(row.subject_user_id) : null,
  targetType: row.target_type as ModerationTargetType,
  targetId: String(row.target_id),
  primaryCategory: row.primary_category as ModerationReportCategory,
  status: row.status as ModerationCaseStatus,
  severity: row.severity as ModerationCaseSeverity,
  assignedTo: row.assigned_to ? String(row.assigned_to) : null,
  fullAdminOnly: Boolean(row.full_admin_only),
  version: Number(row.version),
  ackDueAt: String(row.ack_due_at),
  resolveDueAt: String(row.resolve_due_at),
  firstResponseAt: row.first_response_at ? String(row.first_response_at) : null,
  resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
  outcomeCode: row.outcome_code as ModerationCaseOutcome | null,
  reporterSummary: row.reporter_summary ? String(row.reporter_summary) : null,
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at),
  subject: (row.subject as ModerationPerson | null | undefined) ?? null,
  assignee: (row.assignee as ModerationPerson | null | undefined) ?? null,
})

const getModerationCaseFromRpc = async (
  rpcName: 'get_moderation_case' | 'get_shado_live_moderation_case',
  caseId: string,
): Promise<ModerationCaseDetail> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc(rpcName, { p_case_id: caseId })
  if (error) throw error
  const payload = data as Record<string, unknown>
  const reports = ((payload.reports as ModerationCaseReport[] | undefined) ?? [])
  const paths = reports.flatMap(report => report.attachments ?? []).map(attachment => attachment.path)
  const signedByPath = new Map<string, { signedUrl?: string | null; error?: string | null }>()
  if (paths.length > 0) {
    const { data: signedRows, error: signedError } = await client.storage
      .from(MODERATION_EVIDENCE_BUCKET)
      .createSignedUrls(paths, MODERATION_ATTACHMENT_SIGNED_URL_SECONDS)
    if (signedError) {
      paths.forEach(path => signedByPath.set(path, { error: signedError.message }))
    } else {
      const typedSignedRows = (signedRows ?? []) as Array<{
        signedUrl?: string | null
        error?: { message?: string } | string | null
      }>
      typedSignedRows.forEach((row, index) => signedByPath.set(paths[index], {
        signedUrl: row.signedUrl,
        error: typeof row.error === 'string' ? row.error : row.error?.message ?? null,
      }))
    }
  }
  return {
    case: mapCaseRecord(payload.case as Record<string, unknown>),
    reports: reports.map(report => ({
      ...report,
      attachments: (report.attachments ?? []).map(attachment => ({
        ...attachment,
        signedUrl: signedByPath.get(attachment.path)?.signedUrl ?? null,
        signedUrlError: signedByPath.get(attachment.path)?.error ?? null,
      })),
    })),
    evidence: (payload.evidence as ModerationEvidence[] | undefined) ?? [],
    events: (payload.events as ModerationCaseEvent[] | undefined) ?? [],
    actions: (payload.actions as ModerationCaseAction[] | undefined) ?? [],
    activeBans: (payload.activeBans as ModerationCaseDetail['activeBans'] | undefined) ?? [],
  }
}

export const getModerationCase = async (caseId: string) => (
  getModerationCaseFromRpc('get_moderation_case', caseId)
)

export const getShadoLiveModerationCase = async (caseId: string) => (
  getModerationCaseFromRpc('get_shado_live_moderation_case', caseId)
)

export const assignModerationCase = async (caseId: string, expectedVersion: number, assigneeId: string | null) => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('assign_moderation_case', {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_assignee_id: assigneeId,
  })
  if (error) throw error
  return mapCaseRecord(data as Record<string, unknown>)
}

export const transitionModerationCase = async ({
  caseId,
  expectedVersion,
  status,
  severity,
  outcomeCode,
  internalNote,
  reporterSummary,
}: {
  caseId: string
  expectedVersion: number
  status?: ModerationCaseStatus | null
  severity?: ModerationCaseSeverity | null
  outcomeCode?: ModerationCaseOutcome | null
  internalNote?: string | null
  reporterSummary?: string | null
}) => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('transition_moderation_case', {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_status: status ?? null,
    p_severity: severity ?? null,
    p_outcome_code: outcomeCode ?? null,
    p_internal_note: internalNote?.trim() || null,
    p_reporter_summary: reporterSummary?.trim() || null,
  })
  if (error) throw error
  return mapCaseRecord(data as Record<string, unknown>)
}

export const applyModerationCaseAction = async ({
  caseId,
  expectedVersion,
  actionType,
  requestedScopes = [],
  durationMinutes,
  publicReason,
  internalNote,
}: {
  caseId: string
  expectedVersion: number
  actionType: ModerationCaseActionType
  requestedScopes?: string[]
  durationMinutes?: number | null
  publicReason?: string | null
  internalNote?: string | null
}) => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('apply_moderation_case_action', {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_action_type: actionType,
    p_requested_scopes: requestedScopes,
    p_duration_minutes: durationMinutes ?? null,
    p_public_reason: publicReason?.trim() || null,
    p_internal_note: internalNote?.trim() || null,
  })
  if (error) throw error
  const result = data as { ok?: boolean; error?: string; case?: Record<string, unknown>; actionId?: string }
  return {
    ok: Boolean(result.ok),
    error: result.error ?? null,
    case: result.case ? mapCaseRecord(result.case) : null,
    actionId: result.actionId ?? null,
  }
}

export const applyShadoLiveCaseAction = async ({
  caseId,
  expectedVersion,
  actionType,
  requestedScopes = [],
  durationMinutes,
  publicReason,
  internalNote,
}: {
  caseId: string
  expectedVersion: number
  actionType: Extract<ModerationCaseActionType,
    | 'no_action'
    | 'end_live_room'
    | 'remove_live_participant'
    | 'mute_live_participant'
    | 'set_live_restriction'
    | 'revoke_live_restriction'>
  requestedScopes?: Array<'host' | 'join' | 'chat'>
  durationMinutes?: number | null
  publicReason?: string | null
  internalNote?: string | null
}) => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('apply_shado_live_case_action', {
    p_case_id: caseId,
    p_expected_version: expectedVersion,
    p_action_type: actionType,
    p_requested_scopes: requestedScopes,
    p_duration_minutes: durationMinutes ?? null,
    p_public_reason: publicReason?.trim() || null,
    p_internal_note: internalNote?.trim() || null,
  })
  if (error) throw error
  const result = data as { ok?: boolean; error?: string; case?: Record<string, unknown>; actionId?: string }
  return {
    ok: Boolean(result.ok),
    error: result.error ?? null,
    case: result.case ? mapCaseRecord(result.case) : null,
    actionId: result.actionId ?? null,
  }
}

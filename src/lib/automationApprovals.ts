import { getWorkingClient } from './supabase'

export type AutomationApprovalPacketType = 'scan' | 'build' | 'docs' | 'batch_review'
export type AutomationApprovalPacketStatus = 'pending' | 'approved' | 'rejected' | 'archived' | 'ready_for_review'
export type AutomationApprovalPacketEventType =
  | 'created'
  | 'review_ready'
  | 'approved'
  | 'rejected'
  | 'archived'
  | 'status_changed'
  | 'runner_update'

export interface AutomationApprovalPacket {
  id: string
  packet_type: AutomationApprovalPacketType
  status: AutomationApprovalPacketStatus
  candidate_id?: string | null
  source_key?: string | null
  category?: string | null
  title: string
  summary: string
  evidence: unknown[]
  risk_notes: string
  proposed_scope: string
  generated_prompt: string
  verification_plan: string
  branch_name?: string | null
  pr_url?: string | null
  preview_url?: string | null
  artifact_url?: string | null
  packet_url?: string | null
  review_markdown: string
  redacted_logs: unknown[]
  metadata: Record<string, unknown>
  created_by?: string | null
  approved_at?: string | null
  approved_by?: string | null
  rejected_at?: string | null
  rejected_by?: string | null
  rejection_reason?: string | null
  archived_at?: string | null
  archived_by?: string | null
  created_at: string
  updated_at: string
}

export interface AutomationApprovalPacketEvent {
  id: string
  packet_id: string
  event_type: AutomationApprovalPacketEventType
  actor_id?: string | null
  message: string
  metadata: Record<string, unknown>
  created_at: string
}

type AutomationApprovalPacketRow = Omit<AutomationApprovalPacket, 'evidence' | 'redacted_logs' | 'metadata'> & {
  evidence: unknown
  redacted_logs: unknown
  metadata: unknown
}

type AutomationApprovalPacketEventRow = Omit<AutomationApprovalPacketEvent, 'metadata'> & {
  metadata: unknown
}

const normalizeJsonArray = (value: unknown): unknown[] => (
  Array.isArray(value) ? value : []
)

const normalizeJsonObject = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
)

export const normalizeAutomationApprovalPacket = (
  row: AutomationApprovalPacketRow
): AutomationApprovalPacket => ({
  ...row,
  evidence: normalizeJsonArray(row.evidence),
  redacted_logs: normalizeJsonArray(row.redacted_logs),
  metadata: normalizeJsonObject(row.metadata),
})

export const normalizeAutomationApprovalPacketEvent = (
  row: AutomationApprovalPacketEventRow
): AutomationApprovalPacketEvent => ({
  ...row,
  metadata: normalizeJsonObject(row.metadata),
})

export const fetchAutomationApprovalPackets = async (): Promise<AutomationApprovalPacket[]> => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('automation_approval_packets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    throw error
  }

  return ((data ?? []) as AutomationApprovalPacketRow[]).map(normalizeAutomationApprovalPacket)
}

export const fetchAutomationApprovalPacketEvents = async (
  packetIds: string[]
): Promise<AutomationApprovalPacketEvent[]> => {
  if (packetIds.length === 0) return []

  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient
    .from('automation_approval_packet_events')
    .select('*')
    .in('packet_id', packetIds)
    .order('created_at', { ascending: true })

  if (error) {
    throw error
  }

  return ((data ?? []) as AutomationApprovalPacketEventRow[]).map(normalizeAutomationApprovalPacketEvent)
}

export const approveAutomationApprovalPacket = async (
  packetId: string
): Promise<AutomationApprovalPacket> => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('approve_automation_approval_packet', {
    p_packet_id: packetId,
  })

  if (error) {
    throw error
  }

  return normalizeAutomationApprovalPacket(data as AutomationApprovalPacketRow)
}

export const rejectAutomationApprovalPacket = async (
  packetId: string,
  reason?: string
): Promise<AutomationApprovalPacket> => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('reject_automation_approval_packet', {
    p_packet_id: packetId,
    p_reason: reason?.trim() || null,
  })

  if (error) {
    throw error
  }

  return normalizeAutomationApprovalPacket(data as AutomationApprovalPacketRow)
}

export const archiveAutomationApprovalPacket = async (
  packetId: string
): Promise<AutomationApprovalPacket> => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('archive_automation_approval_packet', {
    p_packet_id: packetId,
  })

  if (error) {
    throw error
  }

  return normalizeAutomationApprovalPacket(data as AutomationApprovalPacketRow)
}

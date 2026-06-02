import { getWorkingClient } from './supabase'

export type AdminInviteStatus = 'active' | 'expired' | 'redeemed' | 'revoked'

export interface AdminInviteRecord {
  id: string
  emailLock: string | null
  createdBy: string | null
  createdByEmail: string | null
  createdByUsername: string | null
  createdByDisplayName: string | null
  redeemedBy: string | null
  redeemedByEmail: string | null
  redeemedByUsername: string | null
  redeemedByDisplayName: string | null
  createdAt: string
  expiresAt: string
  redeemedAt: string | null
  revokedAt: string | null
  status?: AdminInviteStatus
}

export interface CreateAdminInviteInput {
  emailLock?: string | null
}

export interface CreateAdminInviteResult {
  code: string
  invite: AdminInviteRecord
}

const getStringOrNull = (value: unknown) =>
  typeof value === 'string' && value.length > 0 ? value : null

const normalizeInviteStatus = (value: unknown): AdminInviteStatus | undefined => {
  if (value === 'active' || value === 'expired' || value === 'redeemed' || value === 'revoked') {
    return value
  }

  return undefined
}

const normalizeAdminInvite = (row: any): AdminInviteRecord => ({
  id: String(row?.id ?? row?.invite_id ?? ''),
  emailLock: getStringOrNull(row?.email_lock ?? row?.emailLock),
  createdBy: getStringOrNull(row?.created_by ?? row?.createdBy),
  createdByEmail: getStringOrNull(row?.created_by_email ?? row?.createdByEmail),
  createdByUsername: getStringOrNull(row?.created_by_username ?? row?.createdByUsername),
  createdByDisplayName: getStringOrNull(row?.created_by_display_name ?? row?.createdByDisplayName),
  redeemedBy: getStringOrNull(row?.redeemed_by ?? row?.redeemedBy),
  redeemedByEmail: getStringOrNull(row?.redeemed_by_email ?? row?.redeemedByEmail),
  redeemedByUsername: getStringOrNull(row?.redeemed_by_username ?? row?.redeemedByUsername),
  redeemedByDisplayName: getStringOrNull(row?.redeemed_by_display_name ?? row?.redeemedByDisplayName),
  createdAt: String(row?.created_at ?? row?.createdAt ?? ''),
  expiresAt: String(row?.expires_at ?? row?.expiresAt ?? ''),
  redeemedAt: getStringOrNull(row?.redeemed_at ?? row?.redeemedAt),
  revokedAt: getStringOrNull(row?.revoked_at ?? row?.revokedAt),
  status: normalizeInviteStatus(row?.status),
})

const normalizeCreateInviteResult = (data: any): CreateAdminInviteResult => {
  const row = Array.isArray(data) ? data[0] : data
  const inviteSource = row?.invite ?? row?.record ?? row
  const code = String(row?.code ?? row?.invite_code ?? row?.token ?? '')

  return {
    code,
    invite: normalizeAdminInvite(inviteSource),
  }
}

export const fetchAdminInvites = async () => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('list_signup_invites')
  if (error) throw error
  return (data ?? []).map(normalizeAdminInvite)
}

export const createAdminInvite = async ({ emailLock }: CreateAdminInviteInput = {}) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('create_signup_invite', {
    email_lock: emailLock?.trim() || null,
  })
  if (error) throw error
  return normalizeCreateInviteResult(data)
}

export const revokeAdminInvite = async (inviteId: string) => {
  const workingClient = await getWorkingClient()
  const { error } = await workingClient.rpc('revoke_signup_invite', {
    invite_id: inviteId,
  })
  if (error) throw error
}

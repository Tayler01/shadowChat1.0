import { getWorkingClient } from '../../apps/streamlined/src-overrides/lib/supabase'

// Keep in sync with the server's versioned acknowledgement migration. Changing
// legal text materially requires a new version and a matching server rollout.
export const STREAMLINED_POLICY_VERSION = '2026-10-22.2'

export interface StreamlinedMembershipAcknowledgement {
  userId: string
  policyVersion: string
  adultDeclared: true
  termsAccepted: true
  privacyAcknowledged: true
  acceptedAt: string
}

function parseAcknowledgement(value: unknown, expectedUserId: string): StreamlinedMembershipAcknowledgement {
  if (!value || typeof value !== 'object') throw new Error('The membership confirmation was incomplete. Please try again.')
  const row = value as Record<string, unknown>
  if (row.user_id !== expectedUserId) throw new Error('The signed-in account changed. Reload before continuing.')
  if (row.policy_version !== STREAMLINED_POLICY_VERSION
    || row.adult_declared !== true
    || row.terms_accepted !== true
    || row.privacy_acknowledged !== true
    || typeof row.accepted_at !== 'string'
    || !Number.isFinite(Date.parse(row.accepted_at))) {
    throw new Error('The membership policy has changed or its confirmation is incomplete. Reload and review the current policy.')
  }
  return {
    userId: row.user_id,
    policyVersion: row.policy_version,
    adultDeclared: true,
    termsAccepted: true,
    privacyAcknowledged: true,
    acceptedAt: row.accepted_at,
  }
}

export async function getStreamlinedMembershipAcknowledgement(expectedUserId: string): Promise<StreamlinedMembershipAcknowledgement | null> {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('get_streamlined_membership_acknowledgement')
  if (error) throw new Error('Could not check your membership acknowledgement. Please retry. Account management remains available.')
  if (!Array.isArray(data)) throw new Error('The membership check returned an incomplete response. Please retry.')
  if (data.length === 0) return null
  if (data.length !== 1) throw new Error('The membership check returned an unexpected response. Please retry.')
  return parseAcknowledgement(data[0], expectedUserId)
}

export async function acceptStreamlinedMembership(input: {
  userId: string
  adultDeclared: boolean
  termsAccepted: boolean
  privacyAcknowledged: boolean
}): Promise<StreamlinedMembershipAcknowledgement> {
  if (!input.adultDeclared || !input.termsAccepted || !input.privacyAcknowledged) {
    throw new Error('Confirm that you are 18 or older and acknowledge both policies before continuing.')
  }
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('accept_streamlined_membership', {
    p_expected_user_id: input.userId,
    p_policy_version: STREAMLINED_POLICY_VERSION,
    p_adult_declared: true,
    p_terms_accepted: true,
    p_privacy_acknowledged: true,
  })
  if (error) throw new Error('Your membership acknowledgement was not confirmed. Please retry.')
  if (!Array.isArray(data) || data.length !== 1) throw new Error('Your acknowledgement was not confirmed. Please retry.')
  return parseAcknowledgement(data[0], input.userId)
}

import {
  getWorkingClient,
  type ShadowCheckersBoardSkin,
  type ShadowCheckersInvitation,
} from '../../../../lib/supabase'
import { PUBLIC_PROFILE_SELECT } from '../../../../../supabase/functions/_shared/public-profile'
import { clearNotificationEventFromSystemTray } from '../../../notifications/notificationApi'
import { requestAppBadgeRefresh } from '../../../../lib/appBadge'

const clearInvitationTray = (invitationId: string) => {
  requestAppBadgeRefresh()
  void clearNotificationEventFromSystemTray({
    notificationType: 'shadow_checkers_invite',
    invitationId,
  })
}

export interface SendShadowCheckersInvitationResult {
  invitationId: string
  direction: 'incoming' | 'outgoing'
  expiresAt: string
}

export type AcceptShadowCheckersInvitationResult =
  | { sessionId: string; matchId: string; expired?: never }
  | { expired: true; sessionId?: never; matchId?: never }

export async function fetchShadowCheckersInvitations(userId: string) {
  const client = await getWorkingClient()
  const { data, error } = await client
    .from('shadow_checkers_invitations')
    .select(`*, inviter:users!inviter_id(${PUBLIC_PROFILE_SELECT}), invitee:users!invitee_id(${PUBLIC_PROFILE_SELECT})`)
    .or(`inviter_id.eq.${userId},invitee_id.eq.${userId}`)
    .in('status', ['pending', 'accepted'])
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  const rows = (data ?? []) as ShadowCheckersInvitation[]
  if (rows.some(row => row.status === 'pending' && Date.parse(row.expires_at) <= Date.now())) {
    const { error: expirationError } = await client.rpc('expire_my_shadow_checkers_invitations')
    if (expirationError) throw expirationError
    rows.filter(row => row.invitee_id === userId && row.status === 'pending' &&
      Date.parse(row.expires_at) <= Date.now())
      .forEach(row => clearInvitationTray(row.id))
  }
  return rows.filter(row => row.status === 'accepted' || Date.parse(row.expires_at) > Date.now())
}

export async function sendShadowCheckersInvitation(
  targetUserId: string,
  characterKey: string,
  boardSkin: ShadowCheckersBoardSkin = 'classic',
): Promise<SendShadowCheckersInvitationResult> {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('send_shadow_checkers_invitation', {
    target_user_id: targetUserId,
    character_key: characterKey,
    selected_board_skin: boardSkin,
  })
  if (error) throw error
  return data as SendShadowCheckersInvitationResult
}

export async function acceptShadowCheckersInvitation(
  invitationId: string,
  characterKey?: string,
): Promise<AcceptShadowCheckersInvitationResult> {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('accept_shadow_checkers_invitation', {
    target_invitation_id: invitationId,
    character_key: characterKey || null,
  })
  if (error) throw error
  clearInvitationTray(invitationId)
  return data as AcceptShadowCheckersInvitationResult
}

export async function declineShadowCheckersInvitation(invitationId: string): Promise<boolean> {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('decline_shadow_checkers_invitation', {
    target_invitation_id: invitationId,
  })
  if (error) throw error
  clearInvitationTray(invitationId)
  return data === true
}

export async function cancelShadowCheckersInvitation(invitationId: string): Promise<boolean> {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('cancel_shadow_checkers_invitation', {
    target_invitation_id: invitationId,
  })
  if (error) throw error
  clearInvitationTray(invitationId)
  return data === true
}

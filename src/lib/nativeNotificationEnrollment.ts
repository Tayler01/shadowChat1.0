import {
  ensureSession,
  getSessionWithTimeout,
  getWorkingClient,
} from './supabase'

type NativeNotificationEnrollmentTicketRow = {
  ticket?: unknown
  expires_at?: unknown
}

export type NativeNotificationEnrollmentTicket = {
  ticket: string
  expiresAt: string
}

const NATIVE_NOTIFICATION_TICKET_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{64}$/i

export const createNativeNotificationEnrollmentTicket = async (
  expectedUserId: string,
  requestId: string,
  installationKey: string,
  challenge: string,
  credentialChallenge: string,
): Promise<NativeNotificationEnrollmentTicket> => {
  const sessionReady = await ensureSession()
  if (!sessionReady) {
    throw new Error('Your ShadoChat session could not be verified. Reopen the app and try again.')
  }

  const client = await getWorkingClient()
  const {
    data: { session },
    error: sessionError,
  } = await getSessionWithTimeout(client)
  if (
    sessionError ||
    !session?.user?.id ||
    session.user.id !== expectedUserId
  ) {
    throw new Error('Your ShadoChat session changed. Reopen the app and try again.')
  }

  const { data, error } = await client.rpc(
    'create_my_native_notification_enrollment_ticket_v2',
    {
      target_request_id: requestId,
      target_installation_key: installationKey,
      target_challenge: challenge,
      target_credential_challenge: credentialChallenge,
    },
  )
  if (error) throw error

  const record = (
    data && typeof data === 'object' && !Array.isArray(data)
      ? data as NativeNotificationEnrollmentTicketRow
      : null
  )
  const ticket = typeof record?.ticket === 'string' ? record.ticket : ''
  const expiresAt = typeof record?.expires_at === 'string' ? record.expires_at : ''

  if (
    !NATIVE_NOTIFICATION_TICKET_PATTERN.test(ticket) ||
    !expiresAt ||
    !Number.isFinite(Date.parse(expiresAt))
  ) {
    throw new Error('ShadoChat could not create a secure notification enrollment ticket.')
  }

  return { ticket, expiresAt }
}

import { ensureSession, getWorkingClient } from './supabase'

export interface BridgePairingApproval {
  ok: boolean
  deviceId: string
  pairingId: string
  pairingStatus: 'paired'
  userId: string
  ownerUserId?: string
  bridgeUserId?: string
  bridgeUsername?: string
  bridgeDisplayName?: string
  sessionExchangeReady: boolean
}

export const approveBridgePairing = async (pairingCode: string) => {
  const normalizedCode = pairingCode.trim().toUpperCase()

  if (!normalizedCode) {
    throw new Error('Enter a bridge pairing code first.')
  }

  const sessionValid = await ensureSession(true)
  if (!sessionValid) {
    throw new Error('Sign in again before approving a bridge.')
  }

  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.functions.invoke('bridge-pairing-approve', {
    body: { pairingCode: normalizedCode },
  })

  if (error) {
    throw new Error(error.message || 'Bridge pairing approval failed.')
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data as BridgePairingApproval
}

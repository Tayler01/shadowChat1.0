/** Public, non-destructive handshake; never include a receipt or confirmation. */
export const ACCOUNT_DELETION_CAPABILITIES = Object.freeze({
  action: 'capabilities',
  protocol: 'shadowchat.account-deletion.v1',
  receiptRecovery: true,
  stagedHandover: true,
  legacyRequestCompatibility: true,
  deletionStarted: false,
})

export function supportsAccountDeletionRecovery(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const capability = value as Record<string, unknown>
  return capability.action === ACCOUNT_DELETION_CAPABILITIES.action
    && capability.protocol === ACCOUNT_DELETION_CAPABILITIES.protocol
    && capability.receiptRecovery === true
    && capability.deletionStarted === false
}

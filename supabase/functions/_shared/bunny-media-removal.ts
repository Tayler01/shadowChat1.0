export type BunnyRemovalIdentity = {
  libraryId: string
  assetId: string
  ownerId: string
  sourceType: string
  sourceId: string
}

/** Only the server's completed canonical-row receipt permits an idempotent
 * retry after a lost HTTP response. A missing provider GUID alone proves nothing. */
export const hasCompletedBunnyPinRemoval = (pin: {
  provider?: unknown
  provider_asset_id?: unknown
  deleted_at?: unknown
  provider_payload?: unknown
}): boolean => {
  if (pin.provider !== 'bunny_stream' || !pin.deleted_at || pin.provider_asset_id) return false
  const payload = pin.provider_payload
  if (!payload || typeof payload !== 'object') return false
  const cleanup = (payload as Record<string, unknown>).asset_cleanup
  if (!cleanup || typeof cleanup !== 'object') return false
  const receipt = cleanup as Record<string, unknown>
  return typeof receipt.deletedAt === 'string' && Boolean(receipt.deletedAt)
    && typeof receipt.bunnyVideoId === 'string' && Boolean(receipt.bunnyVideoId)
}

/** The durable claim is never cancelled after an unknown provider outcome.
 * Provider removal must resolve only for confirmed 2xx/404 responses. */
export const removeClaimedBunnyMedia = async <T>(
  identity: BunnyRemovalIdentity,
  dependencies: {
    claim: (identity: BunnyRemovalIdentity) => Promise<string>
    remove: () => Promise<T>
    finish: (claimId: string) => Promise<void>
  },
): Promise<T> => {
  const claimId = await dependencies.claim(identity)
  if (!claimId) throw new Error('Video removal claim is unavailable.')
  const response = await dependencies.remove()
  await dependencies.finish(claimId)
  return response
}

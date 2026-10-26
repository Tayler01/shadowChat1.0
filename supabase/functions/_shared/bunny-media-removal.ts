export type BunnyRemovalIdentity = {
  libraryId: string
  assetId: string
  ownerId: string
  sourceType: string
  sourceId: string
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

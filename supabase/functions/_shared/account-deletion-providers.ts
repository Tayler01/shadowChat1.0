import type { DeletionManifest } from './account-deletion-workflow.ts'

export type AccountDeletionProviders = {
  deleteBunnyVideo: (libraryId: string, id: string) => Promise<{ ok: boolean; status: number }>
  removeLiveParticipant: (room: string, userId: string) => Promise<void>
  deleteLiveRoom: (room: string) => Promise<void>
}
type BunnyDeletionConfiguration = { libraryId?: string; apiKey?: string }

// Shared with the bounded provider acceptance script so its real HTTP check
// exercises the same transport used by the account-deletion endpoint.
export const createBunnyVideoDeletionProvider = (
  getConfiguration: () => BunnyDeletionConfiguration,
  signal?: AbortSignal,
): AccountDeletionProviders['deleteBunnyVideo'] => async (library, id) => {
  signal?.throwIfAborted()
  const configuration = getConfiguration()
  const configuredLibrary = configuration.libraryId?.trim()
  const key = configuration.apiKey?.trim()
  if (!key || configuredLibrary !== library) throw new Error('The trusted video library is not configured for cleanup')
  const response = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(library)}/videos/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: { AccessKey: key }, signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  })
  await response.body?.cancel()
  return { ok: response.ok, status: response.status }
}

const providerNotFound = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const value = error as { code?: unknown; status?: unknown; statusCode?: unknown }
  return value.code === 'not_found' || value.code === 5 || value.status === 404 || value.statusCode === 404
}
export const cleanupAccountProviders = async (providers: AccountDeletionProviders, manifest: DeletionManifest, userId: string, signal?: AbortSignal) => {
  for (const room of manifest.live_memberships) {
    signal?.throwIfAborted()
    try { await providers.removeLiveParticipant(room, userId) } catch (error) { if (!providerNotFound(error)) throw error }
    signal?.throwIfAborted()
  }
  for (const room of manifest.live_rooms) {
    signal?.throwIfAborted()
    try { await providers.deleteLiveRoom(room) } catch (error) { if (!providerNotFound(error)) throw error }
    signal?.throwIfAborted()
  }
  for (const asset of manifest.bunny_assets) {
    signal?.throwIfAborted()
    const result = await providers.deleteBunnyVideo(asset.library_id, asset.asset_id)
    signal?.throwIfAborted()
    if (!result.ok && result.status !== 404) throw new Error('Video cleanup was not confirmed')
  }
}

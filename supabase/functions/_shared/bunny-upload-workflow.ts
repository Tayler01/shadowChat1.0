type UploadIdentity = {
  ownerId: string
  libraryId: string
  sourceType: 'shadow_pin_image' | 'shadow_pin_draft_asset' | 'shado_tv_asset'
  sourceId: string
}

type UploadRpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: unknown }>
}

/** A failed publish response does not prove its transaction rolled back. Keep
 * the asset and durable reservation from that point onward; the recorded GUID
 * remains available to account deletion and explicit reconciliation. */
export async function createRegisteredBunnyUpload<Video extends { guid: string }, Result>(
  client: UploadRpcClient,
  identity: UploadIdentity,
  operations: {
    create: (reservationId: string) => Promise<Video>
    publish: (video: Video) => Promise<Result>
    removeUnpublished: (video: Video) => Promise<unknown>
    reconciliationNeeded?: (reservationId: string, assetId: string) => void
  },
): Promise<Result> {
  const reservationId = crypto.randomUUID()
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { error } = await client.rpc(name, args)
    if (error) throw error
  }
  await rpc('reserve_bunny_upload', {
    target_reservation_id: reservationId, target_owner_id: identity.ownerId,
    target_library_id: identity.libraryId, target_source_type: identity.sourceType,
    target_source_id: identity.sourceId,
  })
  // An unknown provider-create result deliberately leaves a pending reservation.
  const video = await operations.create(reservationId)
  let publicationAttempted = false
  try {
    await rpc('resolve_bunny_upload', { target_reservation_id: reservationId, target_asset_id: video.guid })
    await rpc('register_bunny_media_asset', {
      target_library_id: identity.libraryId, target_asset_id: video.guid, target_owner_id: identity.ownerId,
      target_source_type: identity.sourceType, target_source_id: identity.sourceId,
    })
    publicationAttempted = true
    const result = await operations.publish(video)
    await rpc('finish_bunny_upload', { target_reservation_id: reservationId })
    return result
  } catch (error) {
    if (!publicationAttempted) {
      try {
        await operations.removeUnpublished(video)
        await rpc('finish_bunny_upload', { target_reservation_id: reservationId, cleanup_confirmed: true })
      } catch {
        operations.reconciliationNeeded?.(reservationId, video.guid)
      }
    } else {
      // This includes a committed INSERT/UPDATE with a lost response, a failed
      // draft activation after INSERT, and an unknown finish-reservation result.
      operations.reconciliationNeeded?.(reservationId, video.guid)
    }
    throw error
  }
}

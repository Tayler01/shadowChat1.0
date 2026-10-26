import { getWorkingClient } from './supabase'

export type ModerationCaseMediaAsset = {
  id: string
  reportId: string
  kind: 'image' | 'audio' | 'video' | 'file'
  status: 'ready' | 'pending' | 'unavailable'
  url?: string
  contentType?: string
  error?: string
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns only case-authorized, short-lived URLs. Snapshot URLs are never a fallback. */
export async function fetchModerationCaseMedia(caseId: string): Promise<ModerationCaseMediaAsset[]> {
  if (!uuid.test(caseId)) throw new Error('A valid case is required for media review')
  const client = await getWorkingClient()
  const { data, error } = await client.functions.invoke('moderation-media', { body: { caseId } })
  if (error) throw new Error('Reported media could not be loaded. Confirm case access and try again.')
  if (!data || !Array.isArray(data.assets)) throw new Error('The media review response was not confirmed')
  return data.assets.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('The media review response was not confirmed')
    const asset = value as Record<string, unknown>
    if (typeof asset.id !== 'string' || !uuid.test(asset.id) || typeof asset.reportId !== 'string' || !uuid.test(asset.reportId)
      || !['image', 'audio', 'video', 'file'].includes(String(asset.kind))
      || !['ready', 'pending', 'unavailable'].includes(String(asset.status))) throw new Error('The media review response was not confirmed')
    if (asset.url !== undefined) {
      if (typeof asset.url !== 'string') throw new Error('The media review URL was not confirmed')
      let url: URL
      try { url = new URL(asset.url) } catch { throw new Error('The media review URL was not confirmed') }
      if (url.protocol !== 'https:' || url.username || url.password || asset.status !== 'ready') throw new Error('The media review URL was not confirmed')
    }
    return {
      id: asset.id,
      reportId: asset.reportId,
      kind: asset.kind as ModerationCaseMediaAsset['kind'],
      status: asset.status as ModerationCaseMediaAsset['status'],
      ...(typeof asset.url === 'string' ? { url: asset.url } : {}),
      ...(typeof asset.contentType === 'string' ? { contentType: asset.contentType.slice(0, 200) } : {}),
      ...(typeof asset.error === 'string' ? { error: asset.error.slice(0, 300) } : {}),
    }
  })
}

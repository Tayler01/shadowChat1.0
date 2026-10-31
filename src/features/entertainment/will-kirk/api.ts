import { getWorkingClient } from '../../../lib/supabase'

/** Read only release metadata for the picker; artwork and players stay unloaded. */
export async function fetchWillKirkLatestRelease(now = Date.now()): Promise<string | null> {
  const client = await getWorkingClient()
  const channel = await client.from('shado_tv_channels').select('id')
    .eq('slug', 'will-kirk').eq('visibility_status', 'published').is('deleted_at', null).maybeSingle()
  if (channel.error) throw channel.error
  if (!channel.data) return null
  const video = await client.from('shado_tv_videos').select('released_at')
    .eq('channel_id', channel.data.id).eq('visibility_status', 'published')
    .eq('release_status', 'released').eq('upload_status', 'ready').is('deleted_at', null)
    .not('embed_url', 'is', null).lte('released_at', new Date(now).toISOString())
    .order('released_at', { ascending: false }).limit(1).maybeSingle()
  if (video.error) throw video.error
  return video.data?.released_at ?? null
}

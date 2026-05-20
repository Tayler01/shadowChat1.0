import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type UploadKind = 'episode' | 'trailer'

type CreateUploadPayload = {
  action?: 'create-upload'
  videoId?: string
  uploadKind?: UploadKind
  fileName?: string
  fileType?: string
  fileSize?: number
}

type CompleteUploadPayload = {
  action?: 'complete-upload'
  videoId?: string
  uploadKind?: UploadKind
  bunnyVideoId?: string
}

type BunnyVideoRow = {
  id: string
  title: string
  subtitle: string | null
  provider_payload: Record<string, unknown> | null
  deleted_at: string | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const badRequest = (message: string) => json({ error: message }, 400)
const unauthorized = (message: string) => json({ error: message }, 401)
const forbidden = (message: string) => json({ error: message }, 403)

const getSupabaseEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error('Supabase function credentials are not configured.')
  }

  return { supabaseUrl, anonKey, serviceRoleKey }
}

const getBunnyEnv = () => {
  const libraryId = Deno.env.get('BUNNY_STREAM_LIBRARY_ID')?.trim()
  const apiKey = Deno.env.get('BUNNY_STREAM_API_KEY')?.trim()

  if (!libraryId || !apiKey) {
    throw new Error('Bunny Stream credentials are not configured.')
  }

  return { libraryId, apiKey }
}

const getSupabaseAdmin = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const authenticateOperator = async (req: Request) => {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    return { error: unauthorized('Authentication required.') }
  }

  const { supabaseUrl, anonKey } = getSupabaseEnv()
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: authorization,
      apikey: anonKey,
    },
  })

  if (!authResponse.ok) {
    return { error: unauthorized('Invalid or expired session.') }
  }

  const user = await authResponse.json()
  if (!user?.id) {
    return { error: unauthorized('Invalid or expired session.') }
  }

  const supabase = getSupabaseAdmin()
  const { data: isOperator, error } = await supabase.rpc('is_app_operator', {
    target_user_id: user.id,
  })

  if (error) throw error
  if (!isOperator) {
    return { error: forbidden('Only admins and sub-admins can manage Shado TV video uploads.') }
  }

  return { userId: user.id as string, supabase }
}

const readJson = async <T>(req: Request): Promise<T> => {
  try {
    return await req.json() as T
  } catch {
    throw new Error('Request body must be valid JSON.')
  }
}

const normalizeUploadKind = (value: unknown): UploadKind | null =>
  value === 'episode' || value === 'trailer' ? value : null

const normalizeUuid = (value: unknown) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : ''

const getVideo = async (supabase: ReturnType<typeof getSupabaseAdmin>, videoId: string) => {
  const { data, error } = await supabase
    .from('shado_tv_videos')
    .select('id, title, subtitle, provider_payload, deleted_at')
    .eq('id', videoId)
    .single()

  if (error) throw error
  const video = data as BunnyVideoRow
  if (video.deleted_at) {
    throw new Error('Deleted episodes cannot accept video uploads.')
  }
  return video
}

const createBunnyVideo = async (libraryId: string, apiKey: string, title: string) => {
  const response = await fetch(`https://video.bunnycdn.com/library/${encodeURIComponent(libraryId)}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  })

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(typeof body?.message === 'string' ? body.message : 'Unable to create Bunny Stream video.')
  }

  const guid = typeof body?.guid === 'string' ? body.guid : ''
  if (!guid) {
    throw new Error('Bunny Stream did not return a video id.')
  }

  return { guid, raw: body as Record<string, unknown> }
}

const sha256Hex = async (value: string) => {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

const mergeProviderPayload = (
  existing: Record<string, unknown> | null,
  uploadKind: UploadKind,
  payload: Record<string, unknown>
) => ({
  ...(existing && typeof existing === 'object' ? existing : {}),
  bunny_stream: {
    ...((existing?.['bunny_stream'] && typeof existing['bunny_stream'] === 'object') ? existing['bunny_stream'] as Record<string, unknown> : {}),
    [uploadKind]: payload,
  },
})

const insertProcessingJob = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  videoId: string,
  userId: string,
  uploadKind: UploadKind,
  status: 'queued' | 'processing' | 'completed' | 'failed',
  providerPayload: Record<string, unknown>
) => {
  const { error } = await supabase
    .from('shado_tv_processing_jobs')
    .insert({
      video_id: videoId,
      job_type: uploadKind === 'episode' ? 'native_upload' : 'provider_sync',
      status,
      provider_payload: providerPayload,
      created_by: userId,
    })

  if (error) throw error
}

const handleCreateUpload = async (
  req: Request,
  body: CreateUploadPayload
) => {
  const auth = await authenticateOperator(req)
  if ('error' in auth) return auth.error

  const videoId = normalizeUuid(body.videoId)
  const uploadKind = normalizeUploadKind(body.uploadKind)
  const fileType = typeof body.fileType === 'string' && body.fileType.trim() ? body.fileType.trim() : 'video/mp4'
  const fileName = typeof body.fileName === 'string' && body.fileName.trim() ? body.fileName.trim() : 'shado-tv-upload.mp4'
  const fileSize = Number(body.fileSize ?? 0)

  if (!videoId) return badRequest('videoId is required.')
  if (!uploadKind) return badRequest('uploadKind must be episode or trailer.')
  if (!fileType.startsWith('video/')) return badRequest('Choose a video file.')
  if (!Number.isFinite(fileSize) || fileSize <= 0) return badRequest('fileSize is required.')

  const { libraryId, apiKey } = getBunnyEnv()
  const appVideo = await getVideo(auth.supabase, videoId)
  const title = `${appVideo.subtitle ? `${appVideo.subtitle}: ` : ''}${appVideo.title}${uploadKind === 'trailer' ? ' Trailer' : ''}`
  const bunnyVideo = await createBunnyVideo(libraryId, apiKey, title)
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60
  const authorizationSignature = await sha256Hex(`${libraryId}${apiKey}${expiresAt}${bunnyVideo.guid}`)
  const embedUrl = `https://iframe.mediadelivery.net/embed/${libraryId}/${bunnyVideo.guid}`
  const uploadPayload = {
    libraryId,
    videoId: bunnyVideo.guid,
    embedUrl,
    fileName,
    fileType,
    fileSize,
    title,
    createdAt: new Date().toISOString(),
    createdBy: auth.userId,
    bunnyResponse: bunnyVideo.raw,
  }
  const providerPayload = mergeProviderPayload(appVideo.provider_payload, uploadKind, uploadPayload)

  const updates = uploadKind === 'episode'
    ? {
      provider: 'bunny_stream',
      provider_asset_id: bunnyVideo.guid,
      provider_playback_id: bunnyVideo.guid,
      provider_payload: providerPayload,
      source_type: 'native_upload',
      embed_url: embedUrl,
      external_url: embedUrl,
      upload_status: 'queued',
      upload_error: null,
      updated_by: auth.userId,
    }
    : {
      provider_payload: providerPayload,
      trailer_asset_url: embedUrl,
      updated_by: auth.userId,
    }

  const { error: updateError } = await auth.supabase
    .from('shado_tv_videos')
    .update(updates)
    .eq('id', videoId)

  if (updateError) throw updateError
  await insertProcessingJob(auth.supabase, videoId, auth.userId, uploadKind, 'queued', uploadPayload)

  return json({
    ok: true,
    action: 'create-upload',
    appVideoId: videoId,
    uploadKind,
    bunnyVideoId: bunnyVideo.guid,
    libraryId,
    endpoint: 'https://video.bunnycdn.com/tusupload',
    authorizationSignature,
    authorizationExpire: expiresAt,
    embedUrl,
  })
}

const handleCompleteUpload = async (
  req: Request,
  body: CompleteUploadPayload
) => {
  const auth = await authenticateOperator(req)
  if ('error' in auth) return auth.error

  const videoId = normalizeUuid(body.videoId)
  const uploadKind = normalizeUploadKind(body.uploadKind)
  const bunnyVideoId = typeof body.bunnyVideoId === 'string' ? body.bunnyVideoId.trim() : ''
  if (!videoId) return badRequest('videoId is required.')
  if (!uploadKind) return badRequest('uploadKind must be episode or trailer.')
  if (!bunnyVideoId) return badRequest('bunnyVideoId is required.')

  const appVideo = await getVideo(auth.supabase, videoId)
  const existingPayload = appVideo.provider_payload
  const nextPayload = mergeProviderPayload(existingPayload, uploadKind, {
    completedAt: new Date().toISOString(),
    videoId: bunnyVideoId,
    uploadComplete: true,
  })

  const updates = uploadKind === 'episode'
    ? {
      provider_payload: nextPayload,
      upload_status: 'uploaded',
      upload_error: null,
      updated_by: auth.userId,
    }
    : {
      provider_payload: nextPayload,
      updated_by: auth.userId,
    }

  const { error: updateError } = await auth.supabase
    .from('shado_tv_videos')
    .update(updates)
    .eq('id', videoId)

  if (updateError) throw updateError
  await insertProcessingJob(auth.supabase, videoId, auth.userId, uploadKind, 'completed', {
    videoId: bunnyVideoId,
    uploadKind,
    completedAt: new Date().toISOString(),
  })

  return json({ ok: true, action: 'complete-upload' })
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  try {
    const body = await readJson<CreateUploadPayload | CompleteUploadPayload>(req)
    if (body.action === 'create-upload') {
      return await handleCreateUpload(req, body)
    }
    if (body.action === 'complete-upload') {
      return await handleCompleteUpload(req, body)
    }
    return badRequest('Unsupported upload action.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Shado TV upload error.'
    return json({ error: message }, 500)
  }
})

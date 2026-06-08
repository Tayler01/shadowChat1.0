import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
  assertPublicUrl,
  normalizePublicHttpUrl,
  readLimitedArrayBuffer,
  safeFetch,
} from '../_shared/safe-fetch.ts'

const SHADOW_PIN_BUCKET = 'shadow-pin'
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])
const SAFE_IMAGE_URL_OPTIONS = {
  credentialMessage: 'URL credentials are not allowed.',
  invalidSchemeMessage: 'Only public http and https image URLs can be imported.',
  tooLongMessage: 'A valid image URL is required.',
  unsafeHostMessage: 'Private or local image URLs cannot be imported.',
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ImportImagePayload = {
  url?: string
  targetType?: 'category' | 'image'
  categoryId?: string
  title?: string
  description?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const unauthorized = (message: string) => json({ error: message }, 401)

const getSupabaseEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey }
}

const createAdminClient = () => {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const authenticate = async (authorization: string) => {
  if (!authorization.startsWith('Bearer ')) {
    return null
  }

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv()
  const token = authorization.replace(/^Bearer\s+/i, '')
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  })

  if (!authResponse.ok) {
    return null
  }

  const user = await authResponse.json()
  return typeof user?.id === 'string' ? { id: user.id as string } : null
}

const normalizeUrl = (value: string) => {
  return normalizePublicHttpUrl(value, SAFE_IMAGE_URL_OPTIONS)
}

const assertPublicHost = async (url: URL) => {
  await assertPublicUrl(url, SAFE_IMAGE_URL_OPTIONS)
}

const resolveImageType = (contentTypeHeader: string | null) => {
  const contentType = (contentTypeHeader ?? '').split(';')[0]?.trim().toLowerCase()
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('The URL must point to a JPEG, PNG, WebP, or GIF image.')
  }
  return {
    contentType,
    extension: ALLOWED_CONTENT_TYPES.get(contentType) ?? 'img',
  }
}

const cleanText = (value: unknown, maxLength: number, field: string, required: boolean) => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) {
    throw new Error(`${field} is required.`)
  }
  if (text.length > maxLength) {
    throw new Error(`${field} is too long.`)
  }
  return text || null
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const user = await authenticate(req.headers.get('Authorization') ?? '')
    if (!user) {
      return unauthorized('Authentication required')
    }

    const body = await req.json() as ImportImagePayload
    if (!body?.url || body.url.length > 2048) {
      return json({ error: 'A valid image URL is required.' }, 400)
    }

    const targetType = body.targetType
    if (targetType !== 'category' && targetType !== 'image') {
      return json({ error: 'Choose whether this import is for a category or image.' }, 400)
    }

    const title = cleanText(body.title, targetType === 'category' ? 60 : 80, 'Title', true)
    const description = cleanText(body.description, targetType === 'category' ? 300 : 500, 'Description', false)
    const sourceUrl = normalizeUrl(body.url)
    await assertPublicHost(sourceUrl)

    const admin = createAdminClient()
    let activeCategory: { id: string } | null = null
    if (targetType === 'image') {
      if (!body.categoryId) {
        return json({ error: 'Category is required.' }, 400)
      }
      const { data, error } = await admin
        .from('shadow_pin_categories')
        .select('id')
        .eq('id', body.categoryId)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        return json({ error: 'ShadowPin category is not available.' }, 404)
      }
      activeCategory = data
    }

    const response = await safeFetch(sourceUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5',
        'user-agent': 'ShadowChat-ShadowPinImporter/1.0',
      },
    }, SAFE_IMAGE_URL_OPTIONS)

    if (!response.ok) {
      throw new Error(`Image fetch failed with ${response.status}`)
    }

    const finalUrl = new URL(response.url || sourceUrl.toString())
    await assertPublicHost(finalUrl)

    const { contentType, extension } = resolveImageType(response.headers.get('content-type'))
    const bytes = await readLimitedArrayBuffer(response, MAX_IMAGE_BYTES, 'Image is larger than 15MB.')

    const recordId = crypto.randomUUID()
    const path = targetType === 'category'
      ? `${user.id}/categories/${recordId}/cover/original.${extension}`
      : `${user.id}/categories/${activeCategory?.id}/pins/${recordId}/original.${extension}`

    const { error: uploadError } = await admin.storage
      .from(SHADOW_PIN_BUCKET)
      .upload(path, new Blob([bytes], { type: contentType }), {
        cacheControl: '31536000',
        contentType,
        upsert: false,
      })

    if (uploadError) {
      throw uploadError
    }

    const { data: publicAsset } = admin.storage.from(SHADOW_PIN_BUCKET).getPublicUrl(path)
    const payload = {
      id: recordId,
      creator_id: user.id,
      title,
      description,
      image_url: publicAsset.publicUrl,
      image_path: path,
      image_content_type: contentType,
      image_size_bytes: bytes.byteLength,
    }

    if (targetType === 'category') {
      const { data, error } = await admin
        .from('shadow_pin_categories')
        .insert(payload)
        .select('*')
        .single()
      if (error) throw error
      return json({ ok: true, category: data })
    }

    const { data, error } = await admin
      .from('shadow_pin_images')
      .insert({
        ...payload,
        category_id: activeCategory?.id,
      })
      .select('*')
      .single()

    if (error) throw error
    return json({ ok: true, image: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to import image.'
    return json({ error: message }, 400)
  }
})

import dns from 'node:dns/promises'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'

export const SHADOW_PIN_BUCKET = 'shadow-pin'
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
export const THUMB_WIDTH = 640
export const MEDIUM_WIDTH = 1600

const ALLOWED_CONTENT_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

const PRIVATE_IPV4_RANGES = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
]

export function getRuntimeEnv(name) {
  return globalThis.Netlify?.env?.get?.(name) || process.env[name]
}

export function getSupabaseEnv() {
  const supabaseUrl = getRuntimeEnv('SUPABASE_URL') || getRuntimeEnv('VITE_SUPABASE_URL')
  const serviceRoleKey = getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = getRuntimeEnv('SUPABASE_ANON_KEY') || getRuntimeEnv('VITE_SUPABASE_ANON_KEY')

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error('Supabase media processing environment is not configured.')
  }

  return { supabaseUrl, serviceRoleKey, anonKey }
}

export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function authenticateRequest(request, admin) {
  const authorization = request.headers.get('authorization') || ''
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return { id: data.user.id }
}

export function cleanText(value, maxLength, label, required) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw new Error(`${label} is required.`)
  if (text.length > maxLength) throw new Error(`${label} is too long.`)
  return text || null
}

export function normalizeImageUrl(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed || trimmed.length > 2048) {
    throw new Error('A valid image URL is required.')
  }

  const withScheme = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only public http and https image URLs can be imported.')
  }
  parsed.username = ''
  parsed.password = ''
  parsed.hash = ''
  return parsed
}

function isPrivateIpv4(value) {
  return PRIVATE_IPV4_RANGES.some(pattern => pattern.test(value))
}

function isUnsafeHost(host) {
  const normalized = host.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80') ||
    isPrivateIpv4(normalized)
  )
}

export async function assertPublicHost(url) {
  const host = url.hostname.toLowerCase()
  if (isUnsafeHost(host)) {
    throw new Error('Private or local image URLs cannot be imported.')
  }

  try {
    const records = await dns.lookup(host, { all: true, verbatim: false })
    if (records.some(record => record.family === 4 && isPrivateIpv4(record.address))) {
      throw new Error('Private or local image URLs cannot be imported.')
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Private or local')) {
      throw error
    }
  }
}

export function resolveImageType(contentTypeHeader) {
  const contentType = String(contentTypeHeader || '').split(';')[0]?.trim().toLowerCase()
  if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('Use a JPEG, PNG, WebP, or GIF image.')
  }
  return {
    contentType,
    extension: ALLOWED_CONTENT_TYPES.get(contentType) || 'img',
  }
}

export async function fetchRemoteImage(urlValue) {
  const sourceUrl = normalizeImageUrl(urlValue)
  await assertPublicHost(sourceUrl)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  let response
  try {
    response = await fetch(sourceUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5',
        'user-agent': 'ShadowChat-ShadowPinImporter/1.0',
      },
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`Image fetch failed with ${response.status}.`)
  }

  const finalUrl = new URL(response.url || sourceUrl.toString())
  await assertPublicHost(finalUrl)

  const contentLength = Number(response.headers.get('content-length') || '0')
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error('Image is larger than 15MB.')
  }

  const { contentType, extension } = resolveImageType(response.headers.get('content-type'))
  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image is larger than 15MB.')
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
    extension,
    sizeBytes: arrayBuffer.byteLength,
  }
}

export async function createDerivatives(buffer) {
  const source = sharp(buffer, {
    animated: false,
    limitInputPixels: 64_000_000,
  }).rotate()
  const metadata = await source.metadata()
  const width = metadata.width || null
  const height = metadata.height || null

  const thumbnail = await source
    .clone()
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 72, effort: 4 })
    .toBuffer()

  const medium = await source
    .clone()
    .resize({ width: MEDIUM_WIDTH, height: MEDIUM_WIDTH, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer()

  return { thumbnail, medium, width, height }
}

function tableFor(targetType) {
  if (targetType === 'category') return 'shadow_pin_categories'
  if (targetType === 'image') return 'shadow_pin_images'
  throw new Error('Choose whether this media belongs to a category or image.')
}

function derivativePaths(targetType, id) {
  const folder = targetType === 'category' ? 'categories' : 'images'
  return {
    thumbnailPath: `derivatives/${folder}/${id}/thumbnail.webp`,
    mediumPath: `derivatives/${folder}/${id}/medium.webp`,
  }
}

async function isOperator(admin, userId) {
  const { data, error } = await admin
    .from('users')
    .select('admin_role')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.admin_role === 'admin' || data?.admin_role === 'sub_admin'
}

async function assertCanMutate(admin, row, userId, requireOwnership) {
  if (!requireOwnership) return
  if (row.creator_id === userId) return
  if (await isOperator(admin, userId)) return
  throw new Error('Only the creator or an admin can process this image.')
}

export async function writeDerivativesForRow(admin, targetType, row, buffer) {
  const table = tableFor(targetType)
  const { thumbnail, medium, width, height } = await createDerivatives(buffer)
  const { thumbnailPath, mediumPath } = derivativePaths(targetType, row.id)

  const uploadOptions = {
    contentType: 'image/webp',
    cacheControl: '31536000',
    upsert: true,
  }

  const { error: thumbnailError } = await admin.storage
    .from(SHADOW_PIN_BUCKET)
    .upload(thumbnailPath, thumbnail, uploadOptions)
  if (thumbnailError) throw thumbnailError

  const { error: mediumError } = await admin.storage
    .from(SHADOW_PIN_BUCKET)
    .upload(mediumPath, medium, uploadOptions)
  if (mediumError) throw mediumError

  const { data: thumbPublic } = admin.storage.from(SHADOW_PIN_BUCKET).getPublicUrl(thumbnailPath)
  const { data: mediumPublic } = admin.storage.from(SHADOW_PIN_BUCKET).getPublicUrl(mediumPath)

  const { data, error } = await admin
    .from(table)
    .update({
      thumbnail_url: thumbPublic.publicUrl,
      thumbnail_path: thumbnailPath,
      medium_url: mediumPublic.publicUrl,
      medium_path: mediumPath,
      image_width: width,
      image_height: height,
      processing_status: 'ready',
      processing_error: null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function processShadowPinRow({ admin, targetType, id, userId, requireOwnership = true }) {
  const table = tableFor(targetType)
  const { data: row, error } = await admin
    .from(table)
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!row) throw new Error('ShadowPin image record is not available.')
  if (!row.image_path || row.image_path.startsWith('seed/')) {
    throw new Error('This ShadowPin image does not have a processable storage object.')
  }
  await assertCanMutate(admin, row, userId, requireOwnership)

  await admin
    .from(table)
    .update({ processing_status: 'processing', processing_error: null })
    .eq('id', id)

  try {
    const { data: blob, error: downloadError } = await admin.storage
      .from(SHADOW_PIN_BUCKET)
      .download(row.image_path)
    if (downloadError) throw downloadError
    const buffer = Buffer.from(await blob.arrayBuffer())
    return await writeDerivativesForRow(admin, targetType, row, buffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image processing failed.'
    await admin
      .from(table)
      .update({
        processing_status: 'failed',
        processing_error: message.slice(0, 500),
      })
      .eq('id', id)
    throw error
  }
}

export async function createImportedShadowPinItem({
  admin,
  userId,
  targetType,
  categoryId,
  title,
  description,
  url,
}) {
  let activeCategory = null
  if (targetType === 'image') {
    if (!categoryId) throw new Error('Category is required.')
    const { data, error } = await admin
      .from('shadow_pin_categories')
      .select('id')
      .eq('id', categoryId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error('ShadowPin category is not available.')
    activeCategory = data
  }

  const imported = await fetchRemoteImage(url)
  const recordId = crypto.randomUUID()
  const originalPath = targetType === 'category'
    ? `${userId}/categories/${recordId}/cover/original.${imported.extension}`
    : `${userId}/categories/${activeCategory.id}/pins/${recordId}/original.${imported.extension}`

  const { error: uploadError } = await admin.storage
    .from(SHADOW_PIN_BUCKET)
    .upload(originalPath, imported.buffer, {
      cacheControl: '31536000',
      contentType: imported.contentType,
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { data: publicAsset } = admin.storage.from(SHADOW_PIN_BUCKET).getPublicUrl(originalPath)
  const basePayload = {
    id: recordId,
    creator_id: userId,
    title,
    description,
    image_url: publicAsset.publicUrl,
    image_path: originalPath,
    image_content_type: imported.contentType,
    image_size_bytes: imported.sizeBytes,
    processing_status: 'processing',
    processing_error: null,
  }

  const table = tableFor(targetType)
  const insertPayload = targetType === 'category'
    ? basePayload
    : { ...basePayload, category_id: activeCategory.id }

  const { data: row, error: insertError } = await admin
    .from(table)
    .insert(insertPayload)
    .select('*')
    .single()
  if (insertError) throw insertError

  try {
    return await writeDerivativesForRow(admin, targetType, row, imported.buffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image processing failed.'
    await admin
      .from(table)
      .update({
        processing_status: 'failed',
        processing_error: message.slice(0, 500),
      })
      .eq('id', row.id)
    throw error
  }
}

import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import {
  assertPublicUrl,
  normalizePublicHttpUrl,
  readLimitedArrayBuffer,
  readLimitedText,
  safeFetch,
} from './safe-fetch.mjs'

export const SHADOW_PIN_BUCKET = 'shadow-pin'
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_HTML_BYTES = 2 * 1024 * 1024
export const THUMB_WIDTH = 640
export const MEDIUM_WIDTH = 1600

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

export function getRuntimeEnv(name) {
  return globalThis.Netlify?.env?.get?.(name) || process.env[name]
}

export function getSupabaseEnv() {
  const supabaseUrl = getRuntimeEnv('SUPABASE_URL') || getRuntimeEnv('VITE_SUPABASE_URL')
  const serviceRoleKey = getRuntimeEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase media processing environment is not configured.')
  }

  return { supabaseUrl, serviceRoleKey }
}

export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function authenticateAuthorization(authorization, admin) {
  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data?.user?.id) return null
  return { id: data.user.id }
}

export async function authenticateRequest(request, admin) {
  return authenticateAuthorization(request.headers.get('authorization') || '', admin)
}

export function cleanText(value, maxLength, label, required) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (required && !text) throw new Error(`${label} is required.`)
  if (text.length > maxLength) throw new Error(`${label} is too long.`)
  return text || null
}

export function normalizeImageUrl(value) {
  return normalizePublicHttpUrl(value, SAFE_IMAGE_URL_OPTIONS)
}

export async function assertPublicHost(url) {
  await assertPublicUrl(url, SAFE_IMAGE_URL_OPTIONS)
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

function isAllowedImageContentType(contentTypeHeader) {
  const contentType = String(contentTypeHeader || '').split(';')[0]?.trim().toLowerCase()
  return ALLOWED_CONTENT_TYPES.has(contentType)
}

function isHtmlContentType(contentTypeHeader) {
  const contentType = String(contentTypeHeader || '').split(';')[0]?.trim().toLowerCase()
  return contentType === 'text/html' || contentType === 'application/xhtml+xml'
}

function decodeHtmlValue(value) {
  return String(value || '')
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim()
}

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  return match ? decodeHtmlValue(match[2]) : null
}

function extractImageUrlFromHtml(html, pageUrl) {
  const metaTags = html.match(/<meta\b[^>]*>/gi) || []
  const preferredMetaNames = new Set([
    'og:image',
    'og:image:url',
    'twitter:image',
    'twitter:image:src',
  ])

  for (const tag of metaTags) {
    const key = (getAttribute(tag, 'property') || getAttribute(tag, 'name') || '').toLowerCase()
    if (!preferredMetaNames.has(key)) continue
    const content = getAttribute(tag, 'content')
    if (content) return new URL(content, pageUrl)
  }

  const linkTags = html.match(/<link\b[^>]*>/gi) || []
  for (const tag of linkTags) {
    const rel = (getAttribute(tag, 'rel') || '').toLowerCase()
    if (!rel.split(/\s+/).includes('image_src')) continue
    const href = getAttribute(tag, 'href')
    if (href) return new URL(href, pageUrl)
  }

  const pinimgMatch = html.match(/https?:\\\/\\\/i\.pinimg\.com\\\/[^"'<>\s]+/i)
    || html.match(/https?:\/\/i\.pinimg\.com\/[^"'<>\s]+/i)
  if (pinimgMatch?.[0]) {
    return new URL(decodeHtmlValue(pinimgMatch[0]), pageUrl)
  }

  return null
}

async function fetchWithTimeout(url, accept) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 9000)
  try {
    return await safeFetch(url, {
      signal: controller.signal,
      headers: {
        accept,
        'user-agent': 'ShadowChat-ShadowPinImporter/1.0',
      },
    }, SAFE_IMAGE_URL_OPTIONS)
  } finally {
    clearTimeout(timeout)
  }
}

async function readImageResponse(response, sourceUrl) {
  const finalUrl = new URL(response.url || sourceUrl.toString())
  await assertPublicHost(finalUrl)

  if (!response.ok) {
    throw new Error(`Image fetch failed with ${response.status}.`)
  }

  const contentLength = Number(response.headers.get('content-length') || '0')
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error('Image is larger than 15MB.')
  }

  const { contentType, extension } = resolveImageType(response.headers.get('content-type'))
  const arrayBuffer = await readLimitedArrayBuffer(response, MAX_IMAGE_BYTES, 'Image is larger than 15MB.')

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
    extension,
    sizeBytes: arrayBuffer.byteLength,
  }
}

async function resolveImageResponseFromPage(response, sourceUrl) {
  const finalUrl = new URL(response.url || sourceUrl.toString())
  await assertPublicHost(finalUrl)

  const contentLength = Number(response.headers.get('content-length') || '0')
  if (contentLength > MAX_HTML_BYTES) {
    throw new Error('Image page is too large to inspect.')
  }

  const html = await readLimitedText(response, MAX_HTML_BYTES, 'Image page is too large to inspect.')

  const imageUrl = extractImageUrlFromHtml(html, finalUrl)
  if (!imageUrl) {
    throw new Error('Could not find an importable image on that page.')
  }
  await assertPublicHost(imageUrl)

  return fetchWithTimeout(
    imageUrl,
    'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,*/*;q=0.5'
  )
}

export async function fetchRemoteImage(urlValue) {
  const sourceUrl = normalizeImageUrl(urlValue)
  await assertPublicHost(sourceUrl)

  const response = await fetchWithTimeout(
    sourceUrl,
    'image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.9,text/html;q=0.7,*/*;q=0.4'
  )

  if (!response.ok) {
    throw new Error(`Image fetch failed with ${response.status}.`)
  }

  if (isAllowedImageContentType(response.headers.get('content-type'))) {
    return readImageResponse(response, sourceUrl)
  }

  if (isHtmlContentType(response.headers.get('content-type'))) {
    const imageResponse = await resolveImageResponseFromPage(response, sourceUrl)
    return readImageResponse(imageResponse, sourceUrl)
  }

  resolveImageType(response.headers.get('content-type'))
  throw new Error('Use a JPEG, PNG, WebP, or GIF image.')
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

async function markDerivativeFailure(admin, table, rowId, error) {
  const message = error instanceof Error ? error.message : 'Image processing failed.'
  const { data } = await admin
    .from(table)
    .update({
      processing_status: 'failed',
      processing_error: message.slice(0, 500),
    })
    .eq('id', rowId)
    .select('*')
    .single()

  return data
}

export async function processShadowPinRowForUser({ admin, targetType, id, userId }) {
  try {
    return await processShadowPinRow({
      admin,
      targetType,
      id,
      userId,
      requireOwnership: true,
    })
  } catch (error) {
    const table = tableFor(targetType)
    const { data: row, error: rowError } = await admin
      .from(table)
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (rowError || !row || row.processing_status !== 'failed') throw error
    await assertCanMutate(admin, row, userId, true)
    return row
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
    : {
        ...basePayload,
        category_id: activeCategory.id,
        media_type: 'image',
        source_type: 'url_import',
        source_url: normalizeImageUrl(url).toString(),
        provider: 'shadow_pin_storage',
        provider_asset_id: null,
        provider_playback_id: null,
        provider_payload: {
          importedFrom: normalizeImageUrl(url).toString(),
          importedAt: new Date().toISOString(),
        },
        video_preview_url: null,
        video_playback_url: null,
        video_hls_url: null,
        video_embed_url: null,
        duration_seconds: null,
        video_size_bytes: null,
      }

  const { data: row, error: insertError } = await admin
    .from(table)
    .insert(insertPayload)
    .select('*')
    .single()
  if (insertError) throw insertError

  try {
    return await writeDerivativesForRow(admin, targetType, row, imported.buffer)
  } catch (error) {
    return await markDerivativeFailure(admin, table, row.id, error) || row
  }
}

export async function updateImportedShadowPinImage({
  admin,
  userId,
  imageId,
  title,
  description,
  url,
}) {
  if (!imageId) throw new Error('Pin is required.')

  const { data: current, error: currentError } = await admin
    .from('shadow_pin_images')
    .select('*')
    .eq('id', imageId)
    .is('deleted_at', null)
    .maybeSingle()
  if (currentError) throw currentError
  if (!current || !current.category_id) throw new Error('ShadowPin pin is not available.')
  await assertCanMutate(admin, current, userId, true)

  const { data: category, error: categoryError } = await admin
    .from('shadow_pin_categories')
    .select('id')
    .eq('id', current.category_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (categoryError) throw categoryError
  if (!category) throw new Error('ShadowPin category is not available.')

  const sourceUrl = normalizeImageUrl(url)
  const imported = await fetchRemoteImage(sourceUrl.toString())
  const originalId = crypto.randomUUID()
  const originalPath = `${userId}/categories/${current.category_id}/pins/${current.id}/${originalId}/original.${imported.extension}`

  const { error: uploadError } = await admin.storage
    .from(SHADOW_PIN_BUCKET)
    .upload(originalPath, imported.buffer, {
      cacheControl: '31536000',
      contentType: imported.contentType,
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { data: publicAsset } = admin.storage.from(SHADOW_PIN_BUCKET).getPublicUrl(originalPath)
  const { data: updated, error: updateError } = await admin
    .from('shadow_pin_images')
    .update({
      title,
      description,
      image_url: publicAsset.publicUrl,
      image_path: originalPath,
      image_content_type: imported.contentType,
      image_size_bytes: imported.sizeBytes,
      thumbnail_url: null,
      thumbnail_path: null,
      medium_url: null,
      medium_path: null,
      image_width: null,
      image_height: null,
      processing_status: 'processing',
      processing_error: null,
      processed_at: null,
      media_type: 'image',
      source_type: 'url_import',
      source_url: sourceUrl.toString(),
      provider: 'shadow_pin_storage',
      provider_asset_id: null,
      provider_playback_id: null,
      provider_payload: {
        importedFrom: sourceUrl.toString(),
        importedAt: new Date().toISOString(),
        replacedPreviousProvider: current.provider || null,
        replacedPreviousAssetId: current.provider_asset_id || null,
      },
      video_preview_url: null,
      video_playback_url: null,
      video_hls_url: null,
      video_embed_url: null,
      duration_seconds: null,
      video_size_bytes: null,
    })
    .eq('id', current.id)
    .select('*')
    .single()
  if (updateError) throw updateError

  try {
    return await writeDerivativesForRow(admin, 'image', updated, imported.buffer)
  } catch (error) {
    return await markDerivativeFailure(admin, 'shadow_pin_images', updated.id, error) || updated
  }
}

export async function updateImportedShadowPinCategoryCover({
  admin,
  userId,
  categoryId,
  title,
  description,
  url,
}) {
  if (!categoryId) throw new Error('Category is required.')

  const { data: current, error: currentError } = await admin
    .from('shadow_pin_categories')
    .select('*')
    .eq('id', categoryId)
    .is('deleted_at', null)
    .maybeSingle()
  if (currentError) throw currentError
  if (!current) throw new Error('ShadowPin category is not available.')
  await assertCanMutate(admin, current, userId, true)

  const imported = await fetchRemoteImage(url)
  const originalId = crypto.randomUUID()
  const originalPath = `${userId}/categories/${current.id}/cover/${originalId}/original.${imported.extension}`

  const { error: uploadError } = await admin.storage
    .from(SHADOW_PIN_BUCKET)
    .upload(originalPath, imported.buffer, {
      cacheControl: '31536000',
      contentType: imported.contentType,
      upsert: false,
    })
  if (uploadError) throw uploadError

  const { data: publicAsset } = admin.storage.from(SHADOW_PIN_BUCKET).getPublicUrl(originalPath)
  const { data: updated, error: updateError } = await admin
    .from('shadow_pin_categories')
    .update({
      title,
      description,
      image_url: publicAsset.publicUrl,
      image_path: originalPath,
      image_content_type: imported.contentType,
      image_size_bytes: imported.sizeBytes,
      thumbnail_url: null,
      thumbnail_path: null,
      medium_url: null,
      medium_path: null,
      image_width: null,
      image_height: null,
      processing_status: 'processing',
      processing_error: null,
      processed_at: null,
    })
    .eq('id', current.id)
    .select('*')
    .single()
  if (updateError) throw updateError

  try {
    return await writeDerivativesForRow(admin, 'category', updated, imported.buffer)
  } catch (error) {
    return await markDerivativeFailure(admin, 'shadow_pin_categories', updated.id, error) || updated
  }
}

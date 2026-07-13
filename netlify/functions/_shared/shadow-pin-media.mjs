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
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .in('role', ['admin', 'sub_admin'])
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.role === 'admin' || data?.role === 'sub_admin'
}

export function createUserScopedClient(authorization) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
}

export class ShadowPinCreatorRateLimitError extends Error {
  constructor(message, retryAfterSeconds) {
    super(message)
    this.statusCode = 429
    this.retryAfterSeconds = Math.max(1, Math.ceil(Number(retryAfterSeconds) || 1))
  }
}

const CREATOR_MEDIA_ACTION_LIMITS = new Map([
  ['process-draft-image', 10],
  ['stage-draft-image-from-url', 6],
  ['prepare-draft-image-publish', 6],
  ['publish-draft-image', 6],
  ['rollback-draft-image-publish', 12],
  ['delete-draft-image-assets', 10],
])

export async function consumeShadowPinCreatorMediaBudget(admin, userId, action) {
  const limit = CREATOR_MEDIA_ACTION_LIMITS.get(action)
  if (!limit) return null
  const { data, error } = await admin.rpc('consume_edge_request_bucket', {
    target_subject_id: userId,
    request_scope: `shadow-pin-creator:${action}:minute`,
    window_seconds: 60,
    request_limit: limit,
    request_cost: 1,
  })
  if (error) throw error
  if (!data?.allowed) {
    throw new ShadowPinCreatorRateLimitError(
      'Too many Creator Studio media requests. Please wait a moment and try again.',
      data?.retry_after_seconds,
    )
  }
  return data
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

const SHADOW_PIN_DRAFT_BUCKET = 'shadow-pin-drafts'

async function getCreatorDraftForWorker(admin, userId, draftId, expectedRevision, allowTerminal = false) {
  const { data, error } = await admin.from('shadow_pin_creator_drafts').select('*')
    .eq('id', draftId).eq('creator_id', userId).maybeSingle()
  if (error) throw error
  if (!data || (!allowTerminal && ['published', 'abandoned'].includes(data.state))) throw new Error('Creator draft is unavailable.')
  if (!allowTerminal && data.expires_at && Date.parse(data.expires_at) <= Date.now()) {
    throw new Error('Creator draft has expired.')
  }
  if (expectedRevision !== undefined && data.revision !== expectedRevision) {
    throw new Error('Creator draft changed on another device.')
  }
  return data
}

async function activateCreatorDraftAsset(admin, draftId, assetId, state) {
  const { data: current, error: currentError } = await admin.from('shadow_pin_creator_drafts')
    .select('active_asset_id').eq('id', draftId).single()
  if (currentError) throw currentError
  if (current.active_asset_id && current.active_asset_id !== assetId) {
    const { error: supersedeError } = await admin.from('shadow_pin_draft_assets')
      .update({ state: 'superseded' }).eq('id', current.active_asset_id)
      .not('state', 'in', '(deleted,superseded)')
    if (supersedeError) throw supersedeError
  }
  const { data, error } = await admin.from('shadow_pin_creator_drafts').update({
    active_asset_id: assetId,
    state,
    last_error_code: null,
    last_error_message: null,
  }).eq('id', draftId).select('*').single()
  if (error) throw error
  return data
}

async function nextCreatorAssetGeneration(admin, draftId) {
  const { data, error } = await admin.from('shadow_pin_draft_assets').select('generation')
    .eq('draft_id', draftId).order('generation', { ascending: false }).limit(1)
  if (error) throw error
  return Number(data?.[0]?.generation || 0) + 1
}

async function removeObjectsQuietly(admin, bucket, paths) {
  const cleanPaths = paths.filter(Boolean)
  if (cleanPaths.length) await admin.storage.from(bucket).remove(cleanPaths).catch(() => undefined)
}

async function findDraftImageAsset(admin, userId, draftId, column, value) {
  if (!value) return null
  const { data, error } = await admin.from('shadow_pin_draft_assets').select('*')
    .eq('creator_id', userId).eq('draft_id', draftId).eq(column, value)
    .eq('provider', 'shadow_pin_storage').is('deleted_at', null)
    .order('generation', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

async function processCreatorDraftImageBuffer({
  admin, userId, draftId, expectedRevision, storagePath, buffer,
  contentType, sizeBytes, sourceUrl = null,
}) {
  const pathPrefix = `${userId}/${draftId}/`
  if (!storagePath?.startsWith(pathPrefix)) throw new Error('Draft storage path is invalid.')
  const imageType = resolveImageType(contentType)
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error('Images must be 15MB or smaller.')
  }

  let asset = await findDraftImageAsset(admin, userId, draftId, 'original_path', storagePath)
  if (asset && ['ready', 'publish_ready'].includes(asset.state)) {
    const draft = await getCreatorDraftForWorker(admin, userId, draftId)
    const activeDraft = draft.active_asset_id === asset.id
      ? draft
      : await activateCreatorDraftAsset(admin, draftId, asset.id, asset.state)
    return { draft: activeDraft, asset }
  }

  const draft = await getCreatorDraftForWorker(admin, userId, draftId, expectedRevision)
  if (!['image_upload', 'image_url'].includes(draft.source_kind)) {
    throw new Error('Draft source is not an image.')
  }
  const { thumbnail, medium, width, height } = await createDerivatives(buffer)
  const assetId = asset?.id || crypto.randomUUID()
  const generation = asset?.generation || await nextCreatorAssetGeneration(admin, draftId)
  const privateThumb = `${pathPrefix}${assetId}/thumbnail.webp`
  const privateMedium = `${pathPrefix}${assetId}/medium.webp`

  if (!asset) {
    const { data, error } = await admin.from('shadow_pin_draft_assets').insert({
      id: assetId, draft_id: draftId, creator_id: userId, generation,
      asset_kind: 'image', provider: 'shadow_pin_storage', state: 'processing',
      storage_bucket: SHADOW_PIN_DRAFT_BUCKET, original_path: storagePath,
      content_type: imageType.contentType, size_bytes: sizeBytes, source_url: sourceUrl,
      provider_payload: { stagedAt: new Date().toISOString(), sourceUrl },
    }).select('*').single()
    if (error) throw error
    asset = data
  } else {
    await admin.from('shadow_pin_draft_assets').update({ state: 'processing', error_code: null, error_message: null })
      .eq('id', assetId)
  }
  await activateCreatorDraftAsset(admin, draftId, assetId, 'processing')

  const privatePaths = [privateThumb, privateMedium]
  try {
    const webpOptions = { contentType: 'image/webp', cacheControl: '31536000', upsert: true }
    for (const [bucket, path, bytes, options] of [
      [SHADOW_PIN_DRAFT_BUCKET, privateThumb, thumbnail, webpOptions],
      [SHADOW_PIN_DRAFT_BUCKET, privateMedium, medium, webpOptions],
    ]) {
      const { error } = await admin.storage.from(bucket).upload(path, bytes, options)
      if (error) throw error
    }
    const { data: readyAsset, error: readyError } = await admin.from('shadow_pin_draft_assets').update({
      state: 'ready', thumbnail_path: privateThumb, medium_path: privateMedium,
      final_image_url: null, final_image_path: null,
      final_thumbnail_url: null, final_thumbnail_path: null,
      final_medium_url: null, final_medium_path: null,
      image_width: width, image_height: height, ready_at: new Date().toISOString(),
      error_code: null, error_message: null,
    }).eq('id', assetId).select('*').single()
    if (readyError) throw readyError
    const readyDraft = await activateCreatorDraftAsset(admin, draftId, assetId, 'ready')
    return { draft: readyDraft, asset: readyAsset }
  } catch (error) {
    await removeObjectsQuietly(admin, SHADOW_PIN_DRAFT_BUCKET, privatePaths)
    const message = error instanceof Error ? error.message : 'Draft image processing failed.'
    await admin.from('shadow_pin_draft_assets').update({
      state: 'failed', error_code: 'image_processing_failed', error_message: message.slice(0, 500),
    }).eq('id', assetId)
    await admin.from('shadow_pin_creator_drafts').update({
      state: 'failed', last_error_code: 'image_processing_failed', last_error_message: message.slice(0, 500),
    }).eq('id', draftId)
    throw error
  }
}

export async function processShadowPinDraftImage({
  admin, userId, draftId, expectedRevision, storagePath, contentType, sizeBytes,
}) {
  const existing = await findDraftImageAsset(admin, userId, draftId, 'original_path', storagePath)
  if (existing && ['ready', 'publish_ready'].includes(existing.state)) {
    const draft = await getCreatorDraftForWorker(admin, userId, draftId)
    const activeDraft = draft.active_asset_id === existing.id
      ? draft
      : await activateCreatorDraftAsset(admin, draftId, existing.id, existing.state)
    return { draft: activeDraft, asset: existing }
  }
  const { data: blob, error } = await admin.storage.from(SHADOW_PIN_DRAFT_BUCKET).download(storagePath)
  if (error) throw error
  const buffer = Buffer.from(await blob.arrayBuffer())
  return processCreatorDraftImageBuffer({
    admin, userId, draftId, expectedRevision, storagePath, buffer,
    contentType, sizeBytes: Number(sizeBytes) || buffer.byteLength,
  })
}

export async function stageShadowPinDraftImageFromUrl({ admin, userId, draftId, expectedRevision, url }) {
  const sourceUrl = normalizeImageUrl(url).toString()
  const existing = await findDraftImageAsset(admin, userId, draftId, 'source_url', sourceUrl)
  if (existing && ['ready', 'publish_ready'].includes(existing.state)) {
    const draft = await getCreatorDraftForWorker(admin, userId, draftId)
    const activeDraft = draft.active_asset_id === existing.id
      ? draft
      : await activateCreatorDraftAsset(admin, draftId, existing.id, existing.state)
    return { draft: activeDraft, asset: existing }
  }
  await getCreatorDraftForWorker(admin, userId, draftId, expectedRevision)
  const imported = await fetchRemoteImage(sourceUrl)
  const assetToken = crypto.randomUUID()
  const storagePath = `${userId}/${draftId}/${assetToken}/original.${imported.extension}`
  const { error } = await admin.storage.from(SHADOW_PIN_DRAFT_BUCKET).upload(storagePath, imported.buffer, {
    cacheControl: '3600', contentType: imported.contentType, upsert: false,
  })
  if (error) throw error
  try {
    return await processCreatorDraftImageBuffer({
      admin, userId, draftId, expectedRevision, storagePath,
      buffer: imported.buffer, contentType: imported.contentType,
      sizeBytes: imported.sizeBytes, sourceUrl,
    })
  } catch (error) {
    await removeObjectsQuietly(admin, SHADOW_PIN_DRAFT_BUCKET, [storagePath])
    throw error
  }
}

export async function prepareShadowPinDraftImagePublish({
  admin, userId, draftId, expectedRevision, assetId = null, leaseToken = null,
}) {
  let draft = await getCreatorDraftForWorker(admin, userId, draftId, expectedRevision)
  const resolvedAssetId = assetId || draft.active_asset_id
  if (!resolvedAssetId) throw new Error('Draft does not have active image media.')
  const { data: asset, error: assetError } = await admin.from('shadow_pin_draft_assets').select('*')
    .eq('id', resolvedAssetId).eq('draft_id', draftId).eq('creator_id', userId)
    .eq('provider', 'shadow_pin_storage').is('deleted_at', null).maybeSingle()
  if (assetError) throw assetError
  if (!asset) throw new Error('Draft image asset is unavailable.')
  const resolvedLeaseToken = leaseToken || draft.publish_idempotency_key
  if (!resolvedLeaseToken) throw new Error('Draft publish receipt is unavailable.')
  const { data: claimedDraft, error: claimError } = await admin.rpc('claim_shadow_pin_image_promotion', {
    target_creator_id: userId,
    target_draft_id: draftId,
    target_expected_revision: expectedRevision,
    target_asset_id: asset.id,
    target_lease_token: resolvedLeaseToken,
    target_lease_seconds: 180,
  })
  if (claimError) throw claimError
  draft = claimedDraft
  if (asset.state === 'publish_ready') {
    const publishReadyDraft = draft.active_asset_id === asset.id && draft.state === 'publish_ready'
      ? draft
      : await activateCreatorDraftAsset(admin, draftId, asset.id, 'publish_ready')
    return { draft: publishReadyDraft, asset }
  }
  if (asset.state !== 'ready') throw new Error('Draft image is not ready to publish.')
  if (!asset.original_path || !asset.thumbnail_path || !asset.medium_path) {
    throw new Error('Draft image manifest is incomplete.')
  }

  const [{ data: originalBlob, error: originalError }, { data: thumbBlob, error: thumbError }, { data: mediumBlob, error: mediumError }] = await Promise.all([
    admin.storage.from(SHADOW_PIN_DRAFT_BUCKET).download(asset.original_path),
    admin.storage.from(SHADOW_PIN_DRAFT_BUCKET).download(asset.thumbnail_path),
    admin.storage.from(SHADOW_PIN_DRAFT_BUCKET).download(asset.medium_path),
  ])
  if (originalError) throw originalError
  if (thumbError) throw thumbError
  if (mediumError) throw mediumError
  const imageType = resolveImageType(asset.content_type)
  const publicBase = `${userId}/studio/${draftId}/${asset.id}`
  const finalOriginal = `${publicBase}/original.${imageType.extension}`
  const finalThumb = `${publicBase}/thumbnail.webp`
  const finalMedium = `${publicBase}/medium.webp`
  const publicPaths = [finalOriginal, finalThumb, finalMedium]
  try {
    for (const [path, blob, contentType] of [
      [finalOriginal, originalBlob, imageType.contentType],
      [finalThumb, thumbBlob, 'image/webp'],
      [finalMedium, mediumBlob, 'image/webp'],
    ]) {
      const { error } = await admin.storage.from(SHADOW_PIN_BUCKET).upload(path, blob, {
        cacheControl: '31536000', contentType, upsert: true,
      })
      if (error) throw error
    }
    const publicStore = admin.storage.from(SHADOW_PIN_BUCKET)
    const { data: originalPublic } = publicStore.getPublicUrl(finalOriginal)
    const { data: thumbPublic } = publicStore.getPublicUrl(finalThumb)
    const { data: mediumPublic } = publicStore.getPublicUrl(finalMedium)
    const { data: promotedAsset, error: promoteError } = await admin.from('shadow_pin_draft_assets').update({
      state: 'publish_ready',
      final_image_url: originalPublic.publicUrl, final_image_path: finalOriginal,
      final_thumbnail_url: thumbPublic.publicUrl, final_thumbnail_path: finalThumb,
      final_medium_url: mediumPublic.publicUrl, final_medium_path: finalMedium,
      error_code: null, error_message: null,
    }).eq('id', asset.id).select('*').single()
    if (promoteError) throw promoteError
    const promotedDraft = await activateCreatorDraftAsset(admin, draftId, asset.id, 'publish_ready')
    return { draft: promotedDraft, asset: promotedAsset }
  } catch (error) {
    await removeObjectsQuietly(admin, SHADOW_PIN_BUCKET, publicPaths)
    await admin.from('shadow_pin_draft_assets').update({
      state: 'ready', final_image_url: null, final_image_path: null,
      final_thumbnail_url: null, final_thumbnail_path: null,
      final_medium_url: null, final_medium_path: null,
    }).eq('id', asset.id)
    await admin.rpc('release_shadow_pin_image_promotion', {
      target_creator_id: userId,
      target_draft_id: draftId,
      target_lease_token: resolvedLeaseToken,
      target_next_state: 'ready',
    }).catch(() => undefined)
    throw error
  }
}

export async function rollbackShadowPinDraftImagePublish({
  admin, userId, draftId, assetId = null, leaseToken = null,
}) {
  const draft = await getCreatorDraftForWorker(admin, userId, draftId, undefined, true)
  const resolvedAssetId = assetId || draft.active_asset_id
  if (!resolvedAssetId) throw new Error('Draft does not have active image media.')
  const { data: asset, error: assetError } = await admin.from('shadow_pin_draft_assets').select('*')
    .eq('id', resolvedAssetId).eq('draft_id', draftId).eq('creator_id', userId)
    .eq('provider', 'shadow_pin_storage').maybeSingle()
  if (assetError) throw assetError
  if (!asset) throw new Error('Draft image asset is unavailable.')
  const imageType = resolveImageType(asset.content_type)
  const publicBase = `${userId}/studio/${draftId}/${asset.id}`
  const deterministicPaths = [
    `${publicBase}/original.${imageType.extension}`,
    `${publicBase}/thumbnail.webp`,
    `${publicBase}/medium.webp`,
  ]
  const finalPaths = Array.from(new Set([
    asset.final_image_path, asset.final_thumbnail_path, asset.final_medium_path,
    ...deterministicPaths,
  ].filter(Boolean)))
  const { data: canonicalRows, error: canonicalError } = await admin.from('shadow_pin_images')
    .select('id,image_path,thumbnail_path,medium_path').eq('creator_draft_id', draftId)
  if (canonicalError) throw canonicalError
  const referenced = (canonicalRows || []).some(row => (
    finalPaths.includes(row.image_path) || finalPaths.includes(row.thumbnail_path) || finalPaths.includes(row.medium_path)
  ))
  const resolvedLeaseToken = leaseToken || draft.promotion_lease_token
  if (referenced) {
    if (resolvedLeaseToken) {
      await admin.rpc('release_shadow_pin_image_promotion', {
        target_creator_id: userId,
        target_draft_id: draftId,
        target_lease_token: resolvedLeaseToken,
        target_next_state: 'publish_ready',
      }).catch(() => undefined)
    }
    return { draft, asset, canonicalReferenced: true }
  }

  await removeObjectsQuietly(admin, SHADOW_PIN_BUCKET, finalPaths)
  const { data: readyAsset, error: resetError } = await admin.from('shadow_pin_draft_assets').update({
    state: 'ready', final_image_url: null, final_image_path: null,
    final_thumbnail_url: null, final_thumbnail_path: null,
    final_medium_url: null, final_medium_path: null,
  }).eq('id', asset.id).select('*').single()
  if (resetError) throw resetError
  let readyDraft
  if (resolvedLeaseToken) {
    const { data, error: releaseError } = await admin.rpc('release_shadow_pin_image_promotion', {
      target_creator_id: userId,
      target_draft_id: draftId,
      target_lease_token: resolvedLeaseToken,
      target_next_state: 'ready',
    })
    if (releaseError) throw releaseError
    readyDraft = data
  } else {
    const nextDraftState = ['published', 'abandoned'].includes(draft.state) ? draft.state : 'ready'
    const { data, error: draftError } = await admin.from('shadow_pin_creator_drafts')
      .update({ state: nextDraftState }).eq('id', draftId).select('*').single()
    if (draftError) throw draftError
    readyDraft = data
  }
  return { draft: readyDraft, asset: readyAsset, canonicalReferenced: false }
}

export async function publishShadowPinDraftImage({
  admin, userClient, userId, draftId, expectedRevision, assetId, publishIdempotencyKey,
}) {
  const prepared = await prepareShadowPinDraftImagePublish({
    admin, userId, draftId, expectedRevision, assetId,
    leaseToken: publishIdempotencyKey,
  })
  try {
    const { data, error } = await userClient.rpc('finalize_shadow_pin_creator_draft', {
      target_draft_id: prepared.draft.id,
      target_expected_revision: prepared.draft.revision,
      target_publish_idempotency_key: publishIdempotencyKey,
    })
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : data
    if (!result?.draft || !result?.image) throw new Error('Draft publish returned an invalid receipt.')
    return {
      draft: result.draft,
      image: result.image,
      wasAlreadyPublished: Boolean(result.was_already_published),
      asset: prepared.asset,
    }
  } catch (error) {
    await rollbackShadowPinDraftImagePublish({
      admin, userId, draftId, assetId: prepared.asset.id,
      leaseToken: publishIdempotencyKey,
    }).catch(() => undefined)
    throw error
  }
}

export async function recoverExpiredShadowPinImagePromotions(admin, limit = 50) {
  const { data: drafts, error } = await admin.from('shadow_pin_creator_drafts')
    .select('id,creator_id,promotion_asset_id,promotion_lease_token')
    .not('promotion_lease_token', 'is', null)
    .lt('promotion_lease_expires_at', new Date().toISOString())
    .order('promotion_lease_expires_at', { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 50, 100)))
  if (error) throw error
  const failures = []
  let recovered = 0
  for (const draft of drafts || []) {
    try {
      await rollbackShadowPinDraftImagePublish({
        admin,
        userId: draft.creator_id,
        draftId: draft.id,
        assetId: draft.promotion_asset_id,
        leaseToken: draft.promotion_lease_token,
      })
      recovered += 1
    } catch (recoveryError) {
      failures.push({
        draftId: draft.id,
        error: recoveryError instanceof Error ? recoveryError.message : 'Promotion recovery failed.',
      })
    }
  }
  return { scanned: (drafts || []).length, recovered, failures }
}

export async function deleteShadowPinDraftImageAssets({ admin, userId, draftId, assetId = null }) {
  const draft = await getCreatorDraftForWorker(admin, userId, draftId, undefined, true)
  let query = admin.from('shadow_pin_draft_assets').select('*')
    .eq('draft_id', draftId).eq('creator_id', userId).eq('provider', 'shadow_pin_storage')
    .is('deleted_at', null)
  if (assetId) query = query.eq('id', assetId)
  const { data: assets, error } = await query
  if (error) throw error
  const selected = assets || []
  if (assetId) {
    if (!selected[0]) throw new Error('Draft image asset is unavailable.')
    if (!['superseded', 'failed'].includes(selected[0].state)
      && !['abandoned', 'failed', 'published'].includes(draft.state)) {
      throw new Error('Only failed or superseded draft image assets can be deleted.')
    }
  } else if (!['abandoned', 'failed', 'published'].includes(draft.state)) {
    throw new Error('Discard the draft before deleting all staged image assets.')
  }

  const { data: canonicalRows, error: canonicalError } = await admin.from('shadow_pin_images')
    .select('image_path,thumbnail_path,medium_path')
  if (canonicalError) throw canonicalError
  const referencedPaths = new Set((canonicalRows || []).flatMap(row => [
    row.image_path, row.thumbnail_path, row.medium_path,
  ]).filter(Boolean))

  const cleaned = []
  for (const asset of selected) {
    await removeObjectsQuietly(admin, SHADOW_PIN_DRAFT_BUCKET, [
      asset.original_path, asset.thumbnail_path, asset.medium_path,
    ])
    const publicPaths = [
      asset.final_image_path, asset.final_thumbnail_path, asset.final_medium_path,
    ].filter(path => path && !referencedPaths.has(path))
    await removeObjectsQuietly(admin, SHADOW_PIN_BUCKET, publicPaths)
    const { data: updated, error: updateError } = await admin.from('shadow_pin_draft_assets').update({
      state: 'deleted', deleted_at: new Date().toISOString(),
      provider_payload: {
        ...(asset.provider_payload || {}),
        cleanup: {
          deletedAt: new Date().toISOString(), deletedBy: userId,
          retainedReferencedPublicPaths: [
            asset.final_image_path, asset.final_thumbnail_path, asset.final_medium_path,
          ].filter(path => path && referencedPaths.has(path)),
        },
      },
    }).eq('id', asset.id).select('*').single()
    if (updateError) throw updateError
    cleaned.push(updated)
  }
  return { draft, assets: cleaned }
}

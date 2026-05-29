import {
  getWorkingClient,
  supabase,
  uploadShadowPinImage,
} from '../../../lib/supabase'
import * as tus from 'tus-js-client'
import type {
  ShadowPinCategory,
  ShadowPinCategoryFormValues,
  ShadowPinImage,
  ShadowPinImageFormValues,
} from '../types'

const CATEGORY_SELECT = `
  *,
  creator:users!creator_id(id, username, display_name, avatar_url, color, status, admin_role, checkers_crown, war_sword, shadow_pin_gold_pin, gold_easter_egg, presence_visibility, created_at, updated_at)
`

const IMAGE_SELECT = `
  *,
  creator:users!creator_id(id, username, display_name, avatar_url, color, status, admin_role, checkers_crown, war_sword, shadow_pin_gold_pin, gold_easter_egg, presence_visibility, created_at, updated_at)
`

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])
const MAX_IMAGE_BYTES = 15 * 1024 * 1024
const MAX_VIDEO_BYTES = 150 * 1024 * 1024
const MAX_VIDEO_SECONDS = 60
const VIDEO_PROVIDER_HOST_PATTERN = /(^|\.)((youtube\.com)|(youtu\.be)|(x\.com)|(twitter\.com)|(pinterest\.com)|(pin\.it)|(instagram\.com))$/i
const DIRECT_VIDEO_PATH_PATTERN = /\.(mp4|m4v|mov|webm)(?:$|\?)/i

export const SHADOW_PIN_PAGE_SIZE = 30

export function isShadowPinVideoFile(file: File) {
  return ALLOWED_VIDEO_TYPES.has(file.type) || file.type.startsWith('video/')
}

export function validateShadowPinImageFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Use a JPEG, PNG, WebP, or GIF image.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be 15MB or smaller.')
  }
}

export function validateShadowPinVideoFile(file: File) {
  if (!isShadowPinVideoFile(file)) {
    throw new Error('Use an MP4, MOV, or WebM video.')
  }
  if (file.size > MAX_VIDEO_BYTES) {
    throw new Error('Videos must be 150MB or smaller.')
  }
}

export function validateShadowPinFile(file: File) {
  if (isShadowPinVideoFile(file)) {
    validateShadowPinVideoFile(file)
    return
  }
  validateShadowPinImageFile(file)
}

export function normalizeShadowPinText(value: string, maxLength: number, label: string, required: boolean) {
  const text = value.trim()
  if (required && !text) {
    throw new Error(`${label} is required.`)
  }
  if (text.length > maxLength) {
    throw new Error(`${label} is too long.`)
  }
  return text
}

export function assertOneImageSource(file?: File | null, url?: string) {
  const hasFile = Boolean(file)
  const hasUrl = Boolean(url?.trim())
  if (hasFile === hasUrl) {
    throw new Error('Choose one image source: upload a file or paste an image URL.')
  }
}

export function assertOnePinSource(file?: File | null, url?: string) {
  const hasFile = Boolean(file)
  const hasUrl = Boolean(url?.trim())
  if (hasFile === hasUrl) {
    throw new Error('Choose one pin source: upload a file or paste a URL.')
  }
}

function isLikelyVideoUrl(value: string) {
  try {
    const url = new URL(/^www\./i.test(value.trim()) ? `https://${value.trim()}` : value.trim())
    return VIDEO_PROVIDER_HOST_PATTERN.test(url.hostname) || DIRECT_VIDEO_PATH_PATTERN.test(`${url.pathname}${url.search}`)
  } catch {
    return false
  }
}

function attachCategoryHearts(categories: ShadowPinCategory[], heartRows: Array<{ category_id: string }> = []) {
  const hearted = new Set(heartRows.map(row => row.category_id))
  return categories.map(category => ({
    ...category,
    heart_count: Number(category.heart_count ?? 0),
    viewer_has_hearted: hearted.has(category.id),
  }))
}

function attachImageHearts(images: ShadowPinImage[], heartRows: Array<{ image_id: string }> = []) {
  const hearted = new Set(heartRows.map(row => row.image_id))
  return images.map(image => ({
    ...image,
    heart_count: Number(image.heart_count ?? 0),
    viewer_has_hearted: hearted.has(image.id),
  }))
}

export async function fetchShadowPinCategories() {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Sign in to view ShadowPin.')

  const { data, error } = await client
    .from('shadow_pin_categories')
    .select(CATEGORY_SELECT)
    .is('deleted_at', null)
    .order('latest_image_created_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  const categories = (data ?? []) as unknown as ShadowPinCategory[]
  const categoryIds = categories.map(category => category.id)
  if (categoryIds.length === 0) return []

  const { data: hearts, error: heartsError } = await client
    .from('shadow_pin_category_hearts')
    .select('category_id')
    .eq('user_id', user.id)
    .in('category_id', categoryIds)

  if (heartsError) throw heartsError
  return attachCategoryHearts(categories, hearts ?? [])
}

export async function fetchShadowPinCategory(categoryId: string) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Sign in to view ShadowPin.')

  const { data, error } = await client
    .from('shadow_pin_categories')
    .select(CATEGORY_SELECT)
    .eq('id', categoryId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const { data: hearts, error: heartsError } = await client
    .from('shadow_pin_category_hearts')
    .select('category_id')
    .eq('user_id', user.id)
    .eq('category_id', categoryId)

  if (heartsError) throw heartsError
  return attachCategoryHearts([data as unknown as ShadowPinCategory], hearts ?? [])[0]
}

export async function fetchShadowPinImages(categoryId: string, page = 0) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Sign in to view ShadowPin.')

  const from = page * SHADOW_PIN_PAGE_SIZE
  const to = from + SHADOW_PIN_PAGE_SIZE - 1
  const { data, error } = await client
    .from('shadow_pin_images')
    .select(IMAGE_SELECT)
    .eq('category_id', categoryId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  const images = (data ?? []) as unknown as ShadowPinImage[]
  const imageIds = images.map(image => image.id)
  if (imageIds.length === 0) return { images: [], hasMore: false }

  const { data: hearts, error: heartsError } = await client
    .from('shadow_pin_image_hearts')
    .select('image_id')
    .eq('user_id', user.id)
    .in('image_id', imageIds)

  if (heartsError) throw heartsError
  return {
    images: attachImageHearts(images, hearts ?? []),
    hasMore: images.length === SHADOW_PIN_PAGE_SIZE,
  }
}

async function getSessionAccessToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sign in to save images.')
  }
  return session.access_token
}

async function callShadowPinMediaFunction<T>(payload: Record<string, unknown>): Promise<T> {
  const accessToken = await getSessionAccessToken()
  const response = await fetch('/api/shadow-pin/media', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || data?.error) {
    throw new Error(data?.error || 'ShadowPin image processing failed.')
  }
  return data as T
}

async function callShadowPinVideoFunction<T>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('shadow-pin-video', {
    body: payload,
  })

  if (error) throw error
  if (data?.error) {
    throw new Error(data.error)
  }
  return data as T
}

type ShadowPinVideoUploadSession = {
  ok: true
  image: ShadowPinImage
  bunnyVideoId: string
  libraryId: string
  endpoint: string
  authorizationSignature: string
  authorizationExpire: number
}

type ShadowPinVideoFunctionResponse = {
  ok: true
  image: ShadowPinImage
}

type VideoMetadata = {
  durationSeconds: number
  mediaWidth: number | null
  mediaHeight: number | null
}

async function readVideoMetadata(file: File): Promise<VideoMetadata> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const metadata = await new Promise<VideoMetadata>((resolve, reject) => {
      const cleanup = () => {
        video.onloadedmetadata = null
        video.onerror = null
      }
      video.onloadedmetadata = () => {
        cleanup()
        const durationSeconds = Math.ceil(Number.isFinite(video.duration) ? video.duration : 0)
        resolve({
          durationSeconds,
          mediaWidth: video.videoWidth || null,
          mediaHeight: video.videoHeight || null,
        })
      }
      video.onerror = () => {
        cleanup()
        reject(new Error('Unable to read video metadata.'))
      }
      video.src = url
    })
    if (metadata.durationSeconds <= 0) {
      throw new Error('Unable to read video duration.')
    }
    if (metadata.durationSeconds > MAX_VIDEO_SECONDS) {
      throw new Error('Videos can be up to 60 seconds.')
    }
    return metadata
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function createVideoPosterFile(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.onloadedmetadata = null
        video.onerror = null
      }
      video.onloadedmetadata = () => {
        cleanup()
        resolve()
      }
      video.onerror = () => {
        cleanup()
        reject(new Error('Unable to create video poster.'))
      }
      video.src = url
    })

    const seekTime = Math.min(0.2, Math.max(0, (video.duration || 1) / 4))
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.onseeked = null
        video.onerror = null
      }
      video.onseeked = () => {
        cleanup()
        resolve()
      }
      video.onerror = () => {
        cleanup()
        reject(new Error('Unable to capture video poster.'))
      }
      video.currentTime = seekTime
    })

    const width = video.videoWidth || 720
    const height = video.videoHeight || 1280
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(video, 0, 0, width, height)
    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', 0.82)
    })
    if (!blob) return null
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'shadow-pin-video'}-poster.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function uploadBunnyTusFile(
  session: ShadowPinVideoUploadSession,
  file: File,
  onProgress?: (progress: number) => void
) {
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: session.endpoint,
      retryDelays: [0, 1000, 3000, 5000],
      metadata: {
        filetype: file.type || 'video/mp4',
        title: file.name,
        collection: 'shadow-pin',
      },
      headers: {
        AuthorizationSignature: session.authorizationSignature,
        AuthorizationExpire: String(session.authorizationExpire),
        VideoId: session.bunnyVideoId,
        LibraryId: session.libraryId,
      },
      onError: error => reject(error),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (bytesTotal > 0) {
          onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100))
        }
      },
      onSuccess: () => resolve(),
    })

    upload.findPreviousUploads()
      .then(previousUploads => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0])
        }
        upload.start()
      })
      .catch(reject)
  })
}

async function markShadowPinVideoUploadFailed(imageId: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Video upload failed.'
  const client = await getWorkingClient()
  await client
    .from('shadow_pin_images')
    .update({
      processing_status: 'failed',
      processing_error: message.slice(0, 500),
      processed_at: new Date().toISOString(),
    })
    .eq('id', imageId)
}

async function createShadowPinVideoUpload(
  categoryId: string,
  title: string,
  description: string,
  file: File,
  imageId?: string
) {
  validateShadowPinVideoFile(file)
  const metadata = await readVideoMetadata(file)
  const posterFile = await createVideoPosterFile(file)
  const posterAsset = posterFile
    ? await uploadShadowPinImage(posterFile, 'image', categoryId)
    : null
  const payload = {
    action: imageId ? 'replace-upload' : 'create-upload',
    categoryId,
    imageId,
    title,
    description: description || null,
    fileName: file.name,
    fileType: file.type || 'video/mp4',
    fileSize: file.size,
    durationSeconds: metadata.durationSeconds,
    mediaWidth: metadata.mediaWidth,
    mediaHeight: metadata.mediaHeight,
    posterUrl: posterAsset?.publicUrl ?? null,
    posterPath: posterAsset?.path ?? null,
    posterContentType: posterFile?.type ?? null,
    posterSizeBytes: posterFile?.size ?? null,
  }
  let session: ShadowPinVideoUploadSession | null = null
  try {
    session = await callShadowPinVideoFunction<ShadowPinVideoUploadSession>(payload)
    await uploadBunnyTusFile(session, file)
    const complete = await callShadowPinVideoFunction<ShadowPinVideoFunctionResponse>({
      action: 'complete-upload',
      imageId: session.image.id,
      bunnyVideoId: session.bunnyVideoId,
    })
    return attachViewerImageHeart(complete.image)
  } catch (error) {
    if (session?.image.id) {
      await markShadowPinVideoUploadFailed(session.image.id, error).catch(() => undefined)
    }
    throw error
  }
}

async function createShadowPinExternalVideo(
  categoryId: string,
  title: string,
  description: string,
  url: string,
  imageId?: string
) {
  const data = await callShadowPinVideoFunction<ShadowPinVideoFunctionResponse>({
    action: imageId ? 'replace-external' : 'create-external',
    categoryId,
    imageId,
    title,
    description: description || null,
    sourceUrl: url,
  })
  return attachViewerImageHeart(data.image)
}

async function processShadowPinMedia<T extends ShadowPinCategory | ShadowPinImage>(
  targetType: 'category' | 'image',
  id: string
) {
  const data = await callShadowPinMediaFunction<{ item: T }>({
    action: 'process-existing',
    targetType,
    id,
  })
  return data.item
}

async function attachViewerCategoryHeart(category: ShadowPinCategory) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ...category, viewer_has_hearted: Boolean(category.viewer_has_hearted) }

  const { data: heart, error } = await client
    .from('shadow_pin_category_hearts')
    .select('category_id')
    .eq('user_id', user.id)
    .eq('category_id', category.id)
    .maybeSingle()

  if (error) throw error
  return {
    ...category,
    heart_count: Number(category.heart_count ?? 0),
    viewer_has_hearted: Boolean(heart),
  }
}

async function attachViewerImageHeart(image: ShadowPinImage) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ...image, viewer_has_hearted: Boolean(image.viewer_has_hearted) }

  const { data: heart, error } = await client
    .from('shadow_pin_image_hearts')
    .select('image_id')
    .eq('user_id', user.id)
    .eq('image_id', image.id)
    .maybeSingle()

  if (error) throw error
  return {
    ...image,
    heart_count: Number(image.heart_count ?? 0),
    viewer_has_hearted: Boolean(heart),
  }
}

async function importShadowPinUrl(payload: {
  targetType: 'category' | 'image'
  title: string
  description?: string | null
  url: string
  categoryId?: string
}) {
  const action = payload.targetType === 'category'
    ? 'create-category-from-url'
    : 'create-image-from-url'
  const data = await callShadowPinMediaFunction<{
    category?: ShadowPinCategory
    image?: ShadowPinImage
  }>({
    action,
    title: payload.title,
    description: payload.description,
    url: payload.url,
    categoryId: payload.categoryId,
  })
  return data
}

async function replaceShadowPinCategoryCoverFromUrl(payload: {
  categoryId: string
  title: string
  description?: string | null
  url: string
}) {
  const data = await callShadowPinMediaFunction<{
    category?: ShadowPinCategory
  }>({
    action: 'update-category-cover-from-url',
    categoryId: payload.categoryId,
    title: payload.title,
    description: payload.description,
    url: payload.url,
  })
  return data.category as ShadowPinCategory
}

async function replaceShadowPinImageFromUrl(payload: {
  imageId: string
  title: string
  description?: string | null
  url: string
}) {
  const data = await callShadowPinMediaFunction<{
    image?: ShadowPinImage
  }>({
    action: 'update-image-from-url',
    imageId: payload.imageId,
    title: payload.title,
    description: payload.description,
    url: payload.url,
  })
  if (!data.image) {
    throw new Error('Unable to replace pin media.')
  }
  return attachViewerImageHeart(data.image)
}

export async function createShadowPinCategory(values: ShadowPinCategoryFormValues) {
  assertOneImageSource(values.file, values.url)
  const title = normalizeShadowPinText(values.title, 60, 'Title', true)
  const description = normalizeShadowPinText(values.description, 300, 'Description', false)

  if (values.url?.trim()) {
    const data = await importShadowPinUrl({
      targetType: 'category',
      title,
      description,
      url: values.url.trim(),
    })
    return data.category as ShadowPinCategory
  }

  const file = values.file
  if (!file) throw new Error('Choose an image.')
  validateShadowPinImageFile(file)

  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Sign in to create a category.')

  const { path, publicUrl } = await uploadShadowPinImage(file, 'category')
  const { data, error } = await client
    .from('shadow_pin_categories')
    .insert({
      creator_id: user.id,
      title,
      description: description || null,
      image_url: publicUrl,
      image_path: path,
      image_content_type: file.type,
      image_size_bytes: file.size,
      processing_status: 'processing',
      processing_error: null,
    })
    .select(CATEGORY_SELECT)
    .single()

  if (error) throw error
  return processShadowPinMedia<ShadowPinCategory>('category', (data as { id: string }).id)
}

export async function updateShadowPinCategory(
  categoryId: string,
  values: Pick<ShadowPinCategoryFormValues, 'title' | 'description' | 'url'> & { file?: File | null }
) {
  const title = normalizeShadowPinText(values.title, 60, 'Title', true)
  const description = normalizeShadowPinText(values.description, 300, 'Description', false)
  const client = await getWorkingClient()
  const url = values.url?.trim()

  if (values.file && url) {
    throw new Error('Choose one image source: upload a file or paste an image URL.')
  }

  if (url) {
    return replaceShadowPinCategoryCoverFromUrl({
      categoryId,
      title,
      description,
      url,
    })
  }

  const update: Record<string, unknown> = {
    title,
    description: description || null,
  }

  if (values.file) {
    validateShadowPinImageFile(values.file)
    const { path, publicUrl } = await uploadShadowPinImage(values.file, 'category', categoryId)
    update.image_url = publicUrl
    update.image_path = path
    update.image_content_type = values.file.type
    update.image_size_bytes = values.file.size
    update.thumbnail_url = null
    update.thumbnail_path = null
    update.medium_url = null
    update.medium_path = null
    update.image_width = null
    update.image_height = null
    update.processing_status = 'processing'
    update.processing_error = null
    update.processed_at = null
  }

  const { data, error } = await client
    .from('shadow_pin_categories')
    .update(update)
    .eq('id', categoryId)
    .select(CATEGORY_SELECT)
    .single()

  if (error) throw error
  const category = data as unknown as ShadowPinCategory
  if (values.file) {
    return processShadowPinMedia<ShadowPinCategory>('category', category.id)
  }
  return category
}

export async function createShadowPinImage(categoryId: string, values: ShadowPinImageFormValues) {
  assertOnePinSource(values.file, values.url)
  const title = normalizeShadowPinText(values.title, 80, 'Title', true)
  const description = normalizeShadowPinText(values.description, 500, 'Description', false)

  if (values.url?.trim()) {
    if (isLikelyVideoUrl(values.url)) {
      return createShadowPinExternalVideo(categoryId, title, description, values.url.trim())
    }
    const data = await importShadowPinUrl({
      targetType: 'image',
      title,
      description,
      url: values.url.trim(),
      categoryId,
    })
    return data.image as ShadowPinImage
  }

  const file = values.file
  if (!file) throw new Error('Choose a pin source.')
  if (isShadowPinVideoFile(file)) {
    return createShadowPinVideoUpload(categoryId, title, description, file)
  }
  validateShadowPinFile(file)

  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) throw new Error('Sign in to add an image.')

  const { path, publicUrl } = await uploadShadowPinImage(file, 'image', categoryId)
  const { data, error } = await client
    .from('shadow_pin_images')
    .insert({
      category_id: categoryId,
      creator_id: user.id,
      title,
      description: description || null,
      image_url: publicUrl,
      image_path: path,
      image_content_type: file.type,
      image_size_bytes: file.size,
      processing_status: 'processing',
      processing_error: null,
    })
    .select(IMAGE_SELECT)
    .single()

  if (error) throw error
  return processShadowPinMedia<ShadowPinImage>('image', (data as { id: string }).id)
}

export async function updateShadowPinImage(
  imageId: string,
  values: Pick<ShadowPinImageFormValues, 'title' | 'description' | 'url'> & { file?: File | null; categoryId?: string | null }
) {
  const title = normalizeShadowPinText(values.title, 80, 'Title', true)
  const description = normalizeShadowPinText(values.description, 500, 'Description', false)
  const url = values.url?.trim()
  if (values.file && url) {
    throw new Error('Choose one replacement source: upload a file or paste a URL.')
  }

  if (values.file || url) {
    const categoryId = values.categoryId
    if (!categoryId) throw new Error('Category is required.')
    if (values.file) {
      if (isShadowPinVideoFile(values.file)) {
        return createShadowPinVideoUpload(categoryId, title, description, values.file, imageId)
      }
      validateShadowPinImageFile(values.file)
      const { path, publicUrl } = await uploadShadowPinImage(values.file, 'image', categoryId)
      const client = await getWorkingClient()
      const { data, error } = await client
        .from('shadow_pin_images')
        .update({
          title,
          description: description || null,
          image_url: publicUrl,
          image_path: path,
          image_content_type: values.file.type,
          image_size_bytes: values.file.size,
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
          source_type: 'file_upload',
          source_url: null,
          provider: 'shadow_pin_storage',
          provider_asset_id: null,
          provider_playback_id: null,
          provider_payload: {},
          video_preview_url: null,
          video_playback_url: null,
          video_hls_url: null,
          video_embed_url: null,
          duration_seconds: null,
          video_size_bytes: null,
        })
        .eq('id', imageId)
        .select(IMAGE_SELECT)
        .single()

      if (error) throw error
      return processShadowPinMedia<ShadowPinImage>('image', (data as { id: string }).id)
    }

    if (url) {
      if (isLikelyVideoUrl(url)) {
        return createShadowPinExternalVideo(categoryId, title, description, url, imageId)
      }
      return replaceShadowPinImageFromUrl({
        imageId,
        title,
        description,
        url,
      })
    }
  }

  const client = await getWorkingClient()
  const { data, error } = await client
    .from('shadow_pin_images')
    .update({
      title,
      description: description || null,
    })
    .eq('id', imageId)
    .select(IMAGE_SELECT)
    .single()

  if (error) throw error
  return data as unknown as ShadowPinImage
}

export async function syncShadowPinVideoStatus(imageId: string) {
  const data = await callShadowPinVideoFunction<ShadowPinVideoFunctionResponse>({
    action: 'sync-status',
    imageId,
  })
  return attachViewerImageHeart(data.image)
}

export async function deleteShadowPinCategory(categoryId: string) {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('delete_shadow_pin_category', {
    target_category_id: categoryId,
  })
  if (error) throw error
  return data as ShadowPinCategory
}

export async function deleteShadowPinImage(imageId: string) {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('delete_shadow_pin_image', {
    target_image_id: imageId,
  })
  if (error) throw error
  return data as ShadowPinImage
}

export async function toggleShadowPinCategoryHeart(categoryId: string) {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('toggle_shadow_pin_category_heart', {
    target_category_id: categoryId,
  })
  if (error) throw error
  return attachViewerCategoryHeart(data as ShadowPinCategory)
}

export async function toggleShadowPinImageHeart(imageId: string) {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('toggle_shadow_pin_image_heart', {
    target_image_id: imageId,
  })
  if (error) throw error
  return attachViewerImageHeart(data as ShadowPinImage)
}

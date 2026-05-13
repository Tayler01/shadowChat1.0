import {
  getWorkingClient,
  supabase,
  uploadShadowPinImage,
} from '../../../lib/supabase'
import type {
  ShadowPinCategory,
  ShadowPinCategoryFormValues,
  ShadowPinImage,
  ShadowPinImageFormValues,
} from '../types'

const CATEGORY_SELECT = `
  *,
  creator:users!creator_id(id, username, display_name, avatar_url, color, status, admin_role, checkers_crown, presence_visibility, created_at, updated_at)
`

const IMAGE_SELECT = `
  *,
  creator:users!creator_id(id, username, display_name, avatar_url, color, status, admin_role, checkers_crown, presence_visibility, created_at, updated_at)
`

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

export const SHADOW_PIN_PAGE_SIZE = 30

export function validateShadowPinFile(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('Use a JPEG, PNG, WebP, or GIF image.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be 15MB or smaller.')
  }
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
    .order('heart_count', { ascending: false })
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
  validateShadowPinFile(file)

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
  values: Pick<ShadowPinCategoryFormValues, 'title' | 'description'> & { file?: File | null }
) {
  const title = normalizeShadowPinText(values.title, 60, 'Title', true)
  const description = normalizeShadowPinText(values.description, 300, 'Description', false)
  const client = await getWorkingClient()

  const update: Record<string, unknown> = {
    title,
    description: description || null,
  }

  if (values.file) {
    validateShadowPinFile(values.file)
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
  assertOneImageSource(values.file, values.url)
  const title = normalizeShadowPinText(values.title, 80, 'Title', true)
  const description = normalizeShadowPinText(values.description, 500, 'Description', false)

  if (values.url?.trim()) {
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
  if (!file) throw new Error('Choose an image.')
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

export async function updateShadowPinImage(imageId: string, values: Pick<ShadowPinImageFormValues, 'title' | 'description'>) {
  const title = normalizeShadowPinText(values.title, 80, 'Title', true)
  const description = normalizeShadowPinText(values.description, 500, 'Description', false)
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
  return data as ShadowPinCategory
}

export async function toggleShadowPinImageHeart(imageId: string) {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('toggle_shadow_pin_image_heart', {
    target_image_id: imageId,
  })
  if (error) throw error
  return data as ShadowPinImage
}

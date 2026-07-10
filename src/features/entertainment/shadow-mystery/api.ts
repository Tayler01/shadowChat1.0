import { getWorkingClient } from '../../../lib/supabase'
import {
  SHADOW_MYSTERY_STORIES,
  getShadowMysteryStories,
  type ShadowMysteryChapter,
  type ShadowMysteryImage,
  type ShadowMysterySource,
  type ShadowMysteryStory,
} from './data'

export const SHADOW_MYSTERY_BUCKET = 'shadow-mystery'

export type ShadowMysteryPublicationStatus = 'draft' | 'published'
export type ShadowMysteryArtworkRole = 'cover' | 'header' | 'chapter'

interface ShadowMysteryStoryRow {
  id: string
  legacy_story_id?: string | null
  slug: string
  title: string
  subtitle: string
  location_label: string
  deck: string
  read_time_minutes: number
  status: ShadowMysteryPublicationStatus
  published_at?: string | null
  created_at: string
  updated_at: string
}

interface ShadowMysteryChapterRow {
  id: string
  story_id: string
  chapter_key: string
  title: string
  kicker?: string | null
  body: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

interface ShadowMysteryImageRow {
  id: string
  story_id: string
  chapter_id?: string | null
  role: ShadowMysteryArtworkRole
  storage_path: string
  alt_text: string
  caption: string
  source_label?: string | null
  source_url?: string | null
  credit?: string | null
  license?: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

interface ShadowMysterySourceRow {
  id: string
  story_id: string
  label: string
  url: string
  usage: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ShadowMysteryArtwork extends ShadowMysteryImage {
  id: string
  storyId: string
  chapterId?: string | null
  role: ShadowMysteryArtworkRole
  storagePath: string
  sortOrder: number
  updatedAt: string
}

export interface ShadowMysteryAdminChapter extends ShadowMysteryChapter {
  storyId: string
  chapterKey: string
  sortOrder: number
  image?: ShadowMysteryArtwork
  updatedAt: string
}

export interface ShadowMysteryAdminSource extends ShadowMysterySource {
  id: string
  storyId: string
  sortOrder: number
  updatedAt: string
}

export interface ShadowMysteryAdminStory {
  id: string
  legacyStoryId?: string | null
  slug: string
  title: string
  subtitle: string
  locationLabel: string
  deck: string
  readTimeMinutes: number
  status: ShadowMysteryPublicationStatus
  publishedAt: string
  coverImage?: ShadowMysteryArtwork
  headerImage?: ShadowMysteryArtwork
  chapters: ShadowMysteryAdminChapter[]
  sources: ShadowMysteryAdminSource[]
  createdAt: string
  updatedAt: string
}

export interface ShadowMysteryCatalog {
  stories: ShadowMysteryStory[]
  loadedFromSupabase: boolean
}

export interface ShadowMysteryStoryValues {
  slug: string
  title: string
  subtitle: string
  locationLabel: string
  deck: string
  readTimeMinutes: number
  publishedAt: string
  legacyStoryId?: string | null
}

export interface ShadowMysteryChapterValues {
  chapterKey: string
  title: string
  kicker: string
  body: string[]
  sortOrder: number
}

export interface ShadowMysterySourceValues {
  label: string
  url: string
  usage: string
  sortOrder: number
}

export interface ShadowMysteryArtworkValues {
  storyId: string
  chapterId?: string | null
  role: ShadowMysteryArtworkRole
  alt: string
  caption: string
  sourceLabel?: string | null
  sourceUrl?: string | null
  credit?: string | null
  license?: string | null
  sortOrder?: number
}

const SIGNED_ARTWORK_TTL_SECONDS = 6 * 60 * 60
const STORY_SELECT = 'id, legacy_story_id, slug, title, subtitle, location_label, deck, read_time_minutes, status, published_at, created_at, updated_at'
const CHAPTER_SELECT = 'id, story_id, chapter_key, title, kicker, body, sort_order, created_at, updated_at'
const IMAGE_SELECT = 'id, story_id, chapter_id, role, storage_path, alt_text, caption, source_label, source_url, credit, license, sort_order, created_at, updated_at'
const SOURCE_SELECT = 'id, story_id, label, url, usage, sort_order, created_at, updated_at'

const IMAGE_TRANSFORMS = {
  cover: { width: 720, height: 900, resize: 'cover' as const, quality: 82 },
  header: { width: 1440, height: 620, resize: 'cover' as const, quality: 82 },
  chapter: { width: 1200, height: 750, resize: 'cover' as const, quality: 82 },
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function isLocalPreview() {
  return typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('localPreview') === 'shadow-mystery'
}

function normalizeText(value: string, label: string, maxLength: number, required = false) {
  const normalized = value.trim()
  if (required && !normalized) throw new Error(`${label} is required.`)
  if (normalized.length > maxLength) throw new Error(`${label} is too long.`)
  return normalized
}

function normalizeOptionalText(value: string | null | undefined, label: string, maxLength: number) {
  const normalized = normalizeText(value ?? '', label, maxLength)
  return normalized || null
}

function normalizeHttpsUrl(value: string | null | undefined, label: string, required = false) {
  const normalized = normalizeText(value ?? '', label, 1000, required)
  if (!normalized) return null
  try {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'https:') throw new Error()
  } catch {
    throw new Error(`${label} must be a valid HTTPS URL.`)
  }
  return normalized
}

export function slugifyShadowMysteryValue(value: string, fallback = 'shadow-mystery') {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback
}

export function paragraphsFromShadowMysteryDraft(value: string) {
  return value
    .split(/\r?\n\s*\r?\n/)
    .map(paragraph => paragraph.replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter(Boolean)
}

function validateStoryValues(values: ShadowMysteryStoryValues) {
  const readTimeMinutes = Number(values.readTimeMinutes)
  if (!Number.isInteger(readTimeMinutes) || readTimeMinutes < 1 || readTimeMinutes > 120) {
    throw new Error('Read time must be between 1 and 120 minutes.')
  }

  const publishedAt = normalizeText(values.publishedAt, 'Publish date', 10)
  if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) {
    throw new Error('Publish date must use YYYY-MM-DD.')
  }

  return {
    slug: slugifyShadowMysteryValue(normalizeText(values.slug, 'Slug', 90, true)),
    title: normalizeText(values.title, 'Title', 140, true),
    subtitle: normalizeText(values.subtitle, 'Subtitle', 240),
    location_label: normalizeText(values.locationLabel, 'Location', 160),
    deck: normalizeText(values.deck, 'Deck', 1200),
    read_time_minutes: readTimeMinutes,
    published_at: publishedAt || null,
    legacy_story_id: values.legacyStoryId
      ? slugifyShadowMysteryValue(values.legacyStoryId)
      : null,
  }
}

function validateChapterValues(values: ShadowMysteryChapterValues) {
  const body = values.body.map(paragraph => paragraph.trim()).filter(Boolean)
  if (body.length < 1 || body.length > 100) {
    throw new Error('Each chapter needs between 1 and 100 paragraphs.')
  }
  if (body.some(paragraph => paragraph.length > 12000)) {
    throw new Error('A chapter paragraph is too long.')
  }
  const sortOrder = Number(values.sortOrder)
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
    throw new Error('Chapter order must be between 0 and 100000.')
  }

  return {
    chapter_key: slugifyShadowMysteryValue(
      normalizeText(values.chapterKey, 'Chapter key', 90, true),
      'chapter'
    ),
    title: normalizeText(values.title, 'Chapter title', 180, true),
    kicker: normalizeOptionalText(values.kicker, 'Chapter kicker', 160),
    body,
    sort_order: sortOrder,
  }
}

function validateSourceValues(values: ShadowMysterySourceValues) {
  const sortOrder = Number(values.sortOrder)
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
    throw new Error('Source order must be between 0 and 100000.')
  }
  return {
    label: normalizeText(values.label, 'Source label', 240, true),
    url: normalizeHttpsUrl(values.url, 'Source URL', true),
    usage: normalizeText(values.usage, 'Source usage', 2000),
    sort_order: sortOrder,
  }
}

async function getAuthenticatedClient(action: string) {
  const client = await getWorkingClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw new Error(`Sign in to ${action}.`)
  return { client, userId: user.id as string }
}

async function createSignedArtwork(
  client: Awaited<ReturnType<typeof getWorkingClient>>,
  row: ShadowMysteryImageRow
): Promise<ShadowMysteryArtwork | null> {
  const { data, error } = await client.storage
    .from(SHADOW_MYSTERY_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_ARTWORK_TTL_SECONDS, {
      transform: IMAGE_TRANSFORMS[row.role],
    })
  if (error || !data?.signedUrl) return null

  const artwork: ShadowMysteryArtwork = {
    id: row.id,
    storyId: row.story_id,
    chapterId: row.chapter_id ?? null,
    role: row.role,
    storagePath: row.storage_path,
    asset: data.signedUrl,
    alt: row.alt_text,
    caption: row.caption,
    sourceLabel: row.source_label ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    credit: row.credit ?? undefined,
    license: row.license ?? undefined,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
  }
  return artwork
}

async function hydrateAdminStories(
  client: Awaited<ReturnType<typeof getWorkingClient>>,
  storyRows: ShadowMysteryStoryRow[],
  chapterRows: ShadowMysteryChapterRow[],
  imageRows: ShadowMysteryImageRow[],
  sourceRows: ShadowMysterySourceRow[]
) {
  const signedImages = (await Promise.all(
    imageRows.map(row => createSignedArtwork(client, row))
  )).filter((image): image is ShadowMysteryArtwork => image !== null)

  return storyRows.map(row => {
    const storyImages = signedImages.filter(image => image.storyId === row.id)
    const chapters = chapterRows
      .filter(chapter => chapter.story_id === row.id)
      .sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at))
      .map(chapter => ({
        id: chapter.id,
        storyId: chapter.story_id,
        chapterKey: chapter.chapter_key,
        title: chapter.title,
        kicker: chapter.kicker ?? undefined,
        body: chapter.body,
        sortOrder: chapter.sort_order,
        image: storyImages.find(image => image.chapterId === chapter.id && image.role === 'chapter'),
        updatedAt: chapter.updated_at,
      }))
    const sources = sourceRows
      .filter(source => source.story_id === row.id)
      .sort((left, right) => left.sort_order - right.sort_order || left.created_at.localeCompare(right.created_at))
      .map(source => ({
        id: source.id,
        storyId: source.story_id,
        label: source.label,
        url: source.url,
        usage: source.usage,
        sortOrder: source.sort_order,
        updatedAt: source.updated_at,
      }))

    return {
      id: row.id,
      legacyStoryId: row.legacy_story_id ?? null,
      slug: row.slug,
      title: row.title,
      subtitle: row.subtitle,
      locationLabel: row.location_label,
      deck: row.deck,
      readTimeMinutes: row.read_time_minutes,
      status: row.status,
      publishedAt: row.published_at ?? '',
      coverImage: storyImages.find(image => image.role === 'cover'),
      headerImage: storyImages.find(image => image.role === 'header'),
      chapters,
      sources,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } satisfies ShadowMysteryAdminStory
  })
}

async function fetchStoryRows(admin: boolean) {
  const client = await getWorkingClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null

  let storyQuery = client
    .from('shadow_mystery_stories')
    .select(STORY_SELECT)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
  if (!admin) storyQuery = storyQuery.eq('status', 'published')

  const { data: storyData, error: storyError } = await storyQuery
  if (storyError) throw storyError
  const stories = (storyData ?? []) as ShadowMysteryStoryRow[]
  if (stories.length === 0) {
    return { client, stories, chapters: [], images: [], sources: [] }
  }

  const storyIds = stories.map(story => story.id)
  const [chapterResult, imageResult, sourceResult] = await Promise.all([
    client.from('shadow_mystery_chapters').select(CHAPTER_SELECT).in('story_id', storyIds),
    client.from('shadow_mystery_images').select(IMAGE_SELECT).in('story_id', storyIds),
    client.from('shadow_mystery_sources').select(SOURCE_SELECT).in('story_id', storyIds),
  ])
  if (chapterResult.error) throw chapterResult.error
  if (imageResult.error) throw imageResult.error
  if (sourceResult.error) throw sourceResult.error

  return {
    client,
    stories,
    chapters: (chapterResult.data ?? []) as ShadowMysteryChapterRow[],
    images: (imageResult.data ?? []) as ShadowMysteryImageRow[],
    sources: (sourceResult.data ?? []) as ShadowMysterySourceRow[],
  }
}

export function mergeShadowMysteryStories(
  databaseStories: ShadowMysteryStory[],
  fallbackStories: ShadowMysteryStory[] = SHADOW_MYSTERY_STORIES,
  replacedLegacyStoryIds: Array<string | null | undefined> = []
) {
  const replaced = new Set(databaseStories.flatMap(story => [story.id, story.slug]))
  replacedLegacyStoryIds.forEach(id => {
    if (id) replaced.add(id)
  })

  return [...databaseStories, ...fallbackStories.filter(story => (
    !replaced.has(story.id) && !replaced.has(story.slug)
  ))].sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
}

function toPublishedStory(story: ShadowMysteryAdminStory): ShadowMysteryStory | null {
  if (story.status !== 'published' || !story.coverImage || !story.headerImage || story.chapters.length === 0) {
    return null
  }
  return {
    id: story.id,
    slug: story.slug,
    title: story.title,
    subtitle: story.subtitle,
    locationLabel: story.locationLabel,
    publishedAt: story.publishedAt,
    readTimeMinutes: story.readTimeMinutes,
    deck: story.deck,
    coverAsset: story.coverImage.asset,
    headerAsset: story.headerImage.asset,
    chapters: story.chapters,
    sources: story.sources,
  }
}

export async function fetchShadowMysteryCatalog(): Promise<ShadowMysteryCatalog> {
  if (isLocalPreview()) {
    return { stories: getShadowMysteryStories(), loadedFromSupabase: false }
  }

  const rows = await fetchStoryRows(false)
  if (!rows) return { stories: getShadowMysteryStories(), loadedFromSupabase: false }
  const adminStories = await hydrateAdminStories(
    rows.client,
    rows.stories,
    rows.chapters,
    rows.images,
    rows.sources
  )
  const publishedStories = adminStories
    .map(toPublishedStory)
    .filter((story): story is ShadowMysteryStory => Boolean(story))

  return {
    stories: mergeShadowMysteryStories(
      publishedStories,
      SHADOW_MYSTERY_STORIES,
      adminStories.map(story => story.legacyStoryId)
    ),
    loadedFromSupabase: true,
  }
}

export async function fetchShadowMysteryAdminStories() {
  const rows = await fetchStoryRows(true)
  if (!rows) throw new Error('Sign in to manage Shadow Mystery stories.')
  return hydrateAdminStories(rows.client, rows.stories, rows.chapters, rows.images, rows.sources)
}

export async function createShadowMysteryStory(values: ShadowMysteryStoryValues) {
  const { client, userId } = await getAuthenticatedClient('create a Shadow Mystery story')
  const payload = validateStoryValues(values)
  const { data, error } = await client
    .from('shadow_mystery_stories')
    .insert({
      ...payload,
      status: 'draft',
      created_by: userId,
      updated_by: userId,
    })
    .select(STORY_SELECT)
    .single()
  if (error) throw error
  return data as ShadowMysteryStoryRow
}

export async function updateShadowMysteryStory(storyId: string, values: ShadowMysteryStoryValues) {
  const { client, userId } = await getAuthenticatedClient('edit a Shadow Mystery story')
  const { error } = await client
    .from('shadow_mystery_stories')
    .update({ ...validateStoryValues(values), updated_by: userId })
    .eq('id', storyId)
  if (error) throw error
}

export async function setShadowMysteryPublicationStatus(
  storyId: string,
  status: ShadowMysteryPublicationStatus,
  publishedAt?: string
) {
  const { client, userId } = await getAuthenticatedClient('change story publication')
  const publishDate = publishedAt?.trim() || new Date().toISOString().slice(0, 10)
  const { error } = await client
    .from('shadow_mystery_stories')
    .update({
      status,
      published_at: status === 'published' ? publishDate : null,
      updated_by: userId,
    })
    .eq('id', storyId)
  if (error) throw error
}

export async function deleteShadowMysteryStory(storyId: string) {
  const { client } = await getAuthenticatedClient('delete a Shadow Mystery story')
  const { data: imageRows, error: imageError } = await client
    .from('shadow_mystery_images')
    .select('storage_path')
    .eq('story_id', storyId)
  if (imageError) throw imageError

  const { error } = await client.from('shadow_mystery_stories').delete().eq('id', storyId)
  if (error) throw error

  const paths = (imageRows ?? []).map((row: { storage_path: string }) => row.storage_path)
  if (paths.length > 0) {
    await client.storage.from(SHADOW_MYSTERY_BUCKET).remove(paths)
  }
}

export async function createShadowMysteryChapter(storyId: string, values: ShadowMysteryChapterValues) {
  const { client, userId } = await getAuthenticatedClient('create a story chapter')
  const { data, error } = await client
    .from('shadow_mystery_chapters')
    .insert({
      story_id: storyId,
      ...validateChapterValues(values),
      created_by: userId,
      updated_by: userId,
    })
    .select(CHAPTER_SELECT)
    .single()
  if (error) throw error
  return data as ShadowMysteryChapterRow
}

export async function updateShadowMysteryChapter(chapterId: string, values: ShadowMysteryChapterValues) {
  const { client, userId } = await getAuthenticatedClient('edit a story chapter')
  const { error } = await client
    .from('shadow_mystery_chapters')
    .update({ ...validateChapterValues(values), updated_by: userId })
    .eq('id', chapterId)
  if (error) throw error
}

export async function deleteShadowMysteryChapter(chapterId: string) {
  const { client } = await getAuthenticatedClient('delete a story chapter')
  const { data: imageRows, error: imageError } = await client
    .from('shadow_mystery_images')
    .select('storage_path')
    .eq('chapter_id', chapterId)
  if (imageError) throw imageError
  const { error } = await client.from('shadow_mystery_chapters').delete().eq('id', chapterId)
  if (error) throw error
  const paths = (imageRows ?? []).map((row: { storage_path: string }) => row.storage_path)
  if (paths.length > 0) await client.storage.from(SHADOW_MYSTERY_BUCKET).remove(paths)
}

export async function createShadowMysterySource(storyId: string, values: ShadowMysterySourceValues) {
  const { client, userId } = await getAuthenticatedClient('create a story source')
  const { error } = await client.from('shadow_mystery_sources').insert({
    story_id: storyId,
    ...validateSourceValues(values),
    created_by: userId,
    updated_by: userId,
  })
  if (error) throw error
}

export async function updateShadowMysterySource(sourceId: string, values: ShadowMysterySourceValues) {
  const { client, userId } = await getAuthenticatedClient('edit a story source')
  const { error } = await client
    .from('shadow_mystery_sources')
    .update({ ...validateSourceValues(values), updated_by: userId })
    .eq('id', sourceId)
  if (error) throw error
}

export async function deleteShadowMysterySource(sourceId: string) {
  const { client } = await getAuthenticatedClient('delete a story source')
  const { error } = await client.from('shadow_mystery_sources').delete().eq('id', sourceId)
  if (error) throw error
}

function validateArtworkFile(file: File) {
  const extension = MIME_EXTENSIONS[file.type]
  if (!extension) throw new Error('Artwork must be a JPG, PNG, or WebP image.')
  if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
    throw new Error('Artwork must be smaller than 15 MB.')
  }
  return extension
}

function buildArtworkPayload(values: ShadowMysteryArtworkValues, storagePath: string) {
  if (values.role === 'chapter' && !values.chapterId) {
    throw new Error('Chapter artwork must target a chapter.')
  }
  if (values.role !== 'chapter' && values.chapterId) {
    throw new Error('Cover and header artwork cannot target a chapter.')
  }
  return {
    story_id: values.storyId,
    chapter_id: values.chapterId ?? null,
    role: values.role,
    storage_path: storagePath,
    alt_text: normalizeText(values.alt, 'Image alt text', 300),
    caption: normalizeText(values.caption, 'Image caption', 2000),
    source_label: normalizeOptionalText(values.sourceLabel, 'Image source label', 240),
    source_url: normalizeHttpsUrl(values.sourceUrl, 'Image source URL'),
    credit: normalizeOptionalText(values.credit, 'Image credit', 240),
    license: normalizeOptionalText(values.license, 'Image license', 160),
    sort_order: values.sortOrder ?? 0,
  }
}

export async function uploadShadowMysteryArtwork(file: File, values: ShadowMysteryArtworkValues) {
  const extension = validateArtworkFile(file)
  const { client, userId } = await getAuthenticatedClient('upload Shadow Mystery artwork')
  const targetKey = values.role === 'chapter' ? `${values.role}-${values.chapterId}` : values.role
  const uniqueId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const storagePath = `${userId}/${values.storyId}/${targetKey}/${uniqueId}.${extension}`
  const storage = client.storage.from(SHADOW_MYSTERY_BUCKET)
  const { error: uploadError } = await storage.upload(storagePath, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw uploadError

  let existingQuery = client
    .from('shadow_mystery_images')
    .select(IMAGE_SELECT)
    .eq('story_id', values.storyId)
    .eq('role', values.role)
  existingQuery = values.role === 'chapter'
    ? existingQuery.eq('chapter_id', values.chapterId)
    : existingQuery.is('chapter_id', null)
  const { data: existing, error: existingError } = await existingQuery.maybeSingle()
  if (existingError) {
    await storage.remove([storagePath])
    throw existingError
  }

  const payload = {
    ...buildArtworkPayload(values, storagePath),
    updated_by: userId,
  }
  const mutation = existing
    ? client.from('shadow_mystery_images').update(payload).eq('id', existing.id)
    : client.from('shadow_mystery_images').insert({ ...payload, created_by: userId })
  const { error: metadataError } = await mutation
  if (metadataError) {
    await storage.remove([storagePath])
    throw metadataError
  }
  if (existing?.storage_path && existing.storage_path !== storagePath) {
    await storage.remove([existing.storage_path])
  }
}

export async function updateShadowMysteryArtworkMetadata(
  imageId: string,
  values: Omit<ShadowMysteryArtworkValues, 'storyId' | 'chapterId' | 'role'>
) {
  const { client, userId } = await getAuthenticatedClient('edit artwork credits')
  const { error } = await client
    .from('shadow_mystery_images')
    .update({
      alt_text: normalizeText(values.alt, 'Image alt text', 300),
      caption: normalizeText(values.caption, 'Image caption', 2000),
      source_label: normalizeOptionalText(values.sourceLabel, 'Image source label', 240),
      source_url: normalizeHttpsUrl(values.sourceUrl, 'Image source URL'),
      credit: normalizeOptionalText(values.credit, 'Image credit', 240),
      license: normalizeOptionalText(values.license, 'Image license', 160),
      sort_order: values.sortOrder ?? 0,
      updated_by: userId,
    })
    .eq('id', imageId)
  if (error) throw error
}

export async function deleteShadowMysteryArtwork(imageId: string, storagePath: string) {
  const { client } = await getAuthenticatedClient('delete Shadow Mystery artwork')
  const { error } = await client.from('shadow_mystery_images').delete().eq('id', imageId)
  if (error) throw error
  await client.storage.from(SHADOW_MYSTERY_BUCKET).remove([storagePath])
}

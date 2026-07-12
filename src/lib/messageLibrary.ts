import {
  pickPublicProfile,
} from '../../supabase/functions/_shared/public-profile'
import { getWorkingClient } from './supabase'

export type MessageLibrarySource = 'general' | 'dm'
type PublicProfile = ReturnType<typeof pickPublicProfile>

export interface MessageLibraryItem {
  savedId?: string
  source: MessageLibrarySource
  messageId: string
  conversationId?: string | null
  content: string
  messageType: string
  fileUrl?: string | null
  thumbnailUrl?: string | null
  messageCreatedAt: string
  author: PublicProfile
  isSaved: boolean
  collectionId?: string | null
  note?: string | null
  savedAt?: string | null
  searchRank?: number
}

export interface MessageCollection {
  id: string
  name: string
  description?: string | null
  accentColor?: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type DiscoveryLibraryTargetKind = 'shadow_pin' | 'shado_tv_video' | 'shadow_mystery_story'

export interface SavedDiscoveryItem {
  savedId: string
  targetKind: DiscoveryLibraryTargetKind
  targetId: string
  parentId?: string | null
  targetSlug?: string | null
  parentSlug?: string | null
  title: string
  subtitle?: string | null
  description?: string | null
  thumbnailUrl?: string | null
  thumbnailPath?: string | null
  creator?: PublicProfile | null
  collectionId?: string | null
  note?: string | null
  savedAt: string
}

type SearchRow = {
  message_source: MessageLibrarySource
  message_id: string
  conversation_id?: string | null
  content?: string | null
  message_type?: string | null
  file_url?: string | null
  thumbnail_url?: string | null
  created_at: string
  author?: Record<string, unknown> | null
  is_saved?: boolean | null
  collection_id?: string | null
  search_rank?: number | string | null
}

type SavedRow = {
  saved_id: string
  message_source: MessageLibrarySource
  message_id: string
  conversation_id?: string | null
  content?: string | null
  message_type?: string | null
  file_url?: string | null
  thumbnail_url?: string | null
  message_created_at: string
  author?: Record<string, unknown> | null
  collection_id?: string | null
  note?: string | null
  saved_at: string
}

type CollectionRow = {
  id: string
  name: string
  description?: string | null
  accent_color?: string | null
  sort_order?: number | null
  created_at: string
  updated_at: string
}

type SavedDiscoveryRow = {
  saved_id: string
  target_kind: DiscoveryLibraryTargetKind
  target_id: string
  parent_id?: string | null
  target_slug?: string | null
  parent_slug?: string | null
  title: string
  subtitle?: string | null
  description?: string | null
  thumbnail_url?: string | null
  thumbnail_path?: string | null
  creator?: Record<string, unknown> | null
  collection_id?: string | null
  note?: string | null
  saved_at: string
}

async function getAuthenticatedClient() {
  const client = await getWorkingClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Sign in to use search and saved messages.')
  return { client, userId: user.id }
}

function mapAuthor(value?: Record<string, unknown> | null) {
  return pickPublicProfile(value ?? {})
}

function mapSearchRow(row: SearchRow): MessageLibraryItem {
  return {
    source: row.message_source,
    messageId: row.message_id,
    conversationId: row.conversation_id ?? null,
    content: row.content ?? '',
    messageType: row.message_type ?? 'text',
    fileUrl: row.file_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    messageCreatedAt: row.created_at,
    author: mapAuthor(row.author),
    isSaved: Boolean(row.is_saved),
    collectionId: row.collection_id ?? null,
    searchRank: Number(row.search_rank ?? 0),
  }
}

function mapSavedRow(row: SavedRow): MessageLibraryItem {
  return {
    savedId: row.saved_id,
    source: row.message_source,
    messageId: row.message_id,
    conversationId: row.conversation_id ?? null,
    content: row.content ?? '',
    messageType: row.message_type ?? 'text',
    fileUrl: row.file_url ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    messageCreatedAt: row.message_created_at,
    author: mapAuthor(row.author),
    isSaved: true,
    collectionId: row.collection_id ?? null,
    note: row.note ?? null,
    savedAt: row.saved_at,
  }
}

function mapCollection(row: CollectionRow): MessageCollection {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    accentColor: row.accent_color ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapSavedDiscoveryRow(row: SavedDiscoveryRow): SavedDiscoveryItem {
  return {
    savedId: row.saved_id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    parentId: row.parent_id ?? null,
    targetSlug: row.target_slug ?? null,
    parentSlug: row.parent_slug ?? null,
    title: row.title,
    subtitle: row.subtitle ?? null,
    description: row.description ?? null,
    thumbnailUrl: row.thumbnail_url ?? null,
    thumbnailPath: row.thumbnail_path ?? null,
    creator: row.creator ? mapAuthor(row.creator) : null,
    collectionId: row.collection_id ?? null,
    note: row.note ?? null,
    savedAt: row.saved_at,
  }
}

export async function searchMessageLibrary(
  query: string,
  options: { limit?: number; beforeCreatedAt?: string | null } = {}
) {
  const normalizedQuery = query.trim().slice(0, 200)
  if (!normalizedQuery) return []
  const { client } = await getAuthenticatedClient()
  const { data, error } = await client.rpc('search_my_messages', {
    search_query: normalizedQuery,
    result_limit: Math.min(Math.max(options.limit ?? 40, 1), 100),
    before_created_at: options.beforeCreatedAt ?? null,
  })
  if (error) throw error
  return ((data ?? []) as SearchRow[]).map(mapSearchRow)
}

export async function listSavedMessages(collectionId?: string | null) {
  const { client } = await getAuthenticatedClient()
  const { data, error } = await client.rpc('list_my_saved_messages', {
    collection_filter: collectionId ?? null,
    result_limit: 200,
  })
  if (error) throw error
  return ((data ?? []) as SavedRow[]).map(mapSavedRow)
}

export async function listSavedDiscoveryItems(collectionId?: string | null) {
  const { client } = await getAuthenticatedClient()
  const { data, error } = await client.rpc('list_my_saved_discovery_items', {
    collection_filter: collectionId ?? null,
    result_limit: 200,
  })
  if (error) throw error
  return ((data ?? []) as SavedDiscoveryRow[]).map(mapSavedDiscoveryRow)
}

export async function listMessageCollections() {
  const { client, userId } = await getAuthenticatedClient()
  const { data, error } = await client
    .from('message_collections')
    .select('id, name, description, accent_color, sort_order, created_at, updated_at')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as CollectionRow[]).map(mapCollection)
}

export async function createMessageCollection(input: {
  name: string
  description?: string
  accentColor?: string
}) {
  const { client, userId } = await getAuthenticatedClient()
  const { data, error } = await client
    .from('message_collections')
    .insert({
      user_id: userId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      accent_color: input.accentColor?.trim() || null,
    })
    .select('id, name, description, accent_color, sort_order, created_at, updated_at')
    .single()
  if (error) throw error
  return mapCollection(data as CollectionRow)
}

export async function updateMessageCollection(
  collectionId: string,
  updates: { name?: string; description?: string | null; accentColor?: string | null; sortOrder?: number }
) {
  const { client, userId } = await getAuthenticatedClient()
  const payload: Record<string, unknown> = {}
  if (updates.name !== undefined) payload.name = updates.name.trim()
  if (updates.description !== undefined) payload.description = updates.description?.trim() || null
  if (updates.accentColor !== undefined) payload.accent_color = updates.accentColor?.trim() || null
  if (updates.sortOrder !== undefined) payload.sort_order = updates.sortOrder
  const { error } = await client
    .from('message_collections')
    .update(payload)
    .eq('id', collectionId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function deleteMessageCollection(collectionId: string) {
  const { client, userId } = await getAuthenticatedClient()
  const { error } = await client
    .from('message_collections')
    .delete()
    .eq('id', collectionId)
    .eq('user_id', userId)
  if (error) throw error
}

export async function saveMessageToLibrary(input: {
  source: MessageLibrarySource
  messageId: string
  collectionId?: string | null
  note?: string | null
}) {
  const { client } = await getAuthenticatedClient()
  const { data, error } = await client.rpc('save_message_to_library', {
    target_source: input.source,
    target_message_id: input.messageId,
    target_collection_id: input.collectionId ?? null,
    target_note: input.note?.trim() || null,
  })
  if (error) throw error
  return data as string
}

export async function removeMessageFromLibrary(source: MessageLibrarySource, messageId: string) {
  const { client, userId } = await getAuthenticatedClient()
  const idColumn = source === 'general' ? 'general_message_id' : 'dm_message_id'
  const { error } = await client
    .from('saved_messages')
    .delete()
    .eq('user_id', userId)
    .eq(idColumn, messageId)
  if (error) throw error
}

export async function saveDiscoveryItemToLibrary(input: {
  targetKind: DiscoveryLibraryTargetKind
  targetId: string
  collectionId?: string | null
  note?: string | null
}) {
  const { client } = await getAuthenticatedClient()
  const { data, error } = await client.rpc('save_discovery_item_to_library', {
    target_kind: input.targetKind,
    target_id: input.targetId,
    target_collection_id: input.collectionId ?? null,
    target_note: input.note?.trim() || null,
  })
  if (error) throw error
  return data as string
}

export async function moveDiscoveryItemToCollection(savedItemId: string, collectionId?: string | null) {
  const { client } = await getAuthenticatedClient()
  const { data, error } = await client.rpc('move_discovery_item_to_collection', {
    saved_item_id: savedItemId,
    target_collection_id: collectionId ?? null,
  })
  if (error) throw error
  return data as string
}

export async function removeDiscoveryItemFromLibrary(savedItemId: string) {
  const { client } = await getAuthenticatedClient()
  const { data, error } = await client.rpc('remove_discovery_item_from_library', {
    saved_item_id: savedItemId,
  })
  if (error) throw error
  return Boolean(data)
}

import { getWorkingClient } from '../../lib/supabase'
import {
  SHADOW_PIN_IMAGE_SELECT,
  normalizeShadowPinImageRecord,
} from '../shadow-pin/api/shadowPinApi'
import type {
  ShadowPinFeedCursor,
  ShadowPinFeedPage,
  ShadowPinImage,
} from '../shadow-pin/types'
import {
  normalizeInnerCircle,
  normalizeInnerCircleMember,
  normalizeInnerCircleMemberMutationResult,
  normalizeInnerCircleMemberSetResult,
  normalizeInnerCircleMutationResult,
  normalizeInnerCircleName,
  type InnerCircle,
  type InnerCircleAction,
  type InnerCircleMember,
  type InnerCircleMemberAction,
  type InnerCircleMemberMutationResult,
  type InnerCircleMemberSetResult,
  type InnerCircleMutationResult,
} from './innerCirclesModel'

const DEFAULT_PAGE_SIZE = 30

type CircleFeedIdRow = {
  image_id: string
  created_at: string
  viewer_has_hearted: boolean
  has_more?: boolean
  window_position?: 'newer' | 'target' | 'older'
}

type ShadowPinImageRecord = ShadowPinImage & {
  tag_links?: Array<{ tag?: { slug?: string | null } | null }> | null
}

const requireId = (value: string, label: string) => {
  const id = value.trim()
  if (!id) throw new Error(`${label} is required.`)
  return id
}

export const createInnerCircleId = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  const bytes = new Uint8Array(16)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const fetchShadowPinImagesByIds = async (
  imageIds: string[],
  heartState: ReadonlyMap<string, boolean>,
) => {
  if (imageIds.length === 0) return []
  const client = await getWorkingClient()
  const { data, error } = await client
    .from('shadow_pin_images')
    .select(SHADOW_PIN_IMAGE_SELECT)
    .in('id', imageIds)
    .is('deleted_at', null)
  if (error) throw error

  const byId = new Map(
    ((data ?? []) as unknown as ShadowPinImageRecord[])
      .map(record => normalizeShadowPinImageRecord(record))
      .map(image => [image.id, {
        ...image,
        viewer_has_hearted: heartState.get(image.id) ?? Boolean(image.viewer_has_hearted),
      }]),
  )
  return imageIds.flatMap(imageId => {
    const image = byId.get(imageId)
    return image ? [image] : []
  })
}

export const listMyInnerCircles = async (): Promise<InnerCircle[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_my_inner_circles')
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data.map(normalizeInnerCircle).filter((circle): circle is InnerCircle => circle !== null)
}

export const listMyInnerCircleMembers = async (circleId: string): Promise<InnerCircleMember[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_my_inner_circle_members', {
    target_circle_id: requireId(circleId, 'Circle'),
  })
  if (error) throw error
  if (!Array.isArray(data)) return []
  return data
    .map(normalizeInnerCircleMember)
    .filter((member): member is InnerCircleMember => member !== null)
}

export const mutateMyInnerCircle = async (
  action: InnerCircleAction,
  options: {
    circleId?: string | null
    name?: string | null
    expectedRevision?: number | null
  } = {},
): Promise<InnerCircleMutationResult> => {
  const client = await getWorkingClient()
  const name = action === 'create' || action === 'rename'
    ? normalizeInnerCircleName(options.name ?? '')
    : null
  const circleId = action === 'create'
    ? (options.circleId?.trim() || createInnerCircleId())
    : requireId(options.circleId ?? '', 'Circle')
  const expectedRevision = action === 'create'
    ? null
    : Math.max(0, Math.trunc(options.expectedRevision ?? 0))
  const { data, error } = await client.rpc('mutate_my_inner_circle', {
    target_circle_id: circleId,
    target_action: action,
    target_name: name,
    expected_revision: expectedRevision,
  })
  if (error) throw error
  return normalizeInnerCircleMutationResult(data)
}

export const mutateMyInnerCircleMember = async (
  circleId: string,
  memberId: string,
  action: InnerCircleMemberAction,
): Promise<InnerCircleMemberMutationResult> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('mutate_my_inner_circle_member', {
    target_circle_id: requireId(circleId, 'Circle'),
    target_member_id: requireId(memberId, 'Member'),
    target_action: action,
  })
  if (error) throw error
  return normalizeInnerCircleMemberMutationResult(data)
}

export const setMyInnerCircleMembers = async (
  circleId: string,
  memberIds: string[],
): Promise<InnerCircleMemberSetResult> => {
  const normalizedMemberIds = Array.from(new Set(
    memberIds.map(memberId => requireId(memberId, 'Member')),
  ))
  if (normalizedMemberIds.length > 50) {
    throw new Error('An Inner Circle can contain at most 50 Connections.')
  }
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('set_my_inner_circle_members', {
    target_circle_id: requireId(circleId, 'Circle'),
    target_member_ids: normalizedMemberIds,
  })
  if (error) throw error
  return normalizeInnerCircleMemberSetResult(data)
}

export const listMyShadowPinCircleFeed = async (
  circleId: string,
  cursor?: ShadowPinFeedCursor | null,
  limit = DEFAULT_PAGE_SIZE,
): Promise<ShadowPinFeedPage> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('list_my_shadow_pin_circle_feed', {
    target_circle_id: requireId(circleId, 'Circle'),
    result_limit: Math.max(1, Math.min(Math.trunc(limit) || DEFAULT_PAGE_SIZE, 60)),
    before_created_at: cursor?.createdAt ?? null,
    before_id: cursor?.id ?? null,
  })
  if (error) throw error

  const rows = (Array.isArray(data) ? data : []) as CircleFeedIdRow[]
  const heartState = new Map(rows.map(row => [row.image_id, Boolean(row.viewer_has_hearted)]))
  const images = await fetchShadowPinImagesByIds(rows.map(row => row.image_id), heartState)
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined
  return {
    images,
    hasMore: Boolean(rows[0]?.has_more),
    nextCursor: lastRow ? { createdAt: lastRow.created_at, id: lastRow.image_id } : null,
  }
}

export const getMyShadowPinCircleFeedWindow = async (circleId: string, imageId: string) => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('get_my_shadow_pin_circle_feed_window', {
    target_circle_id: requireId(circleId, 'Circle'),
    target_image_id: requireId(imageId, 'Pin'),
  })
  if (error) throw error

  const rows = (Array.isArray(data) ? data : []) as CircleFeedIdRow[]
  const heartState = new Map(rows.map(row => [row.image_id, Boolean(row.viewer_has_hearted)]))
  const images = await fetchShadowPinImagesByIds(rows.map(row => row.image_id), heartState)
  const byId = new Map(images.map(image => [image.id, image]))
  const targetRow = rows.find(row => row.window_position === 'target')
  return {
    target: targetRow ? byId.get(targetRow.image_id) ?? null : null,
    images: rows.flatMap(row => {
      const image = byId.get(row.image_id)
      return image ? [image] : []
    }),
  }
}

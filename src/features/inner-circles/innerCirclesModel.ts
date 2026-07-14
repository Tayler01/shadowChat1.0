import type { ConnectionProfile } from '../connections/connectionModel'
import { normalizeConnectionProfile } from '../connections/connectionModel'

export type InnerCircleAction = 'create' | 'rename' | 'delete'
export type InnerCircleMemberAction = 'add' | 'remove'

export interface InnerCircle {
  id: string
  name: string
  revision: number
  memberCount: number
  createdAt: string
  updatedAt: string
}

export interface InnerCircleMember {
  circleId: string
  memberId: string
  addedAt: string
  profile: ConnectionProfile
}

export interface InnerCircleMutationResult {
  circle: InnerCircle | null
  circleId: string | null
  deleted: boolean
}

export interface InnerCircleMemberMutationResult {
  member: InnerCircleMember | null
  circleId: string | null
  memberId: string | null
  removed: boolean
  isMember: boolean | null
  changed: boolean
  memberCount: number | null
  revision: number | null
}

export interface InnerCircleMemberSetResult {
  circleId: string | null
  revision: number
  memberCount: number
  memberIds: string[]
  updatedAt: string | null
  changed: boolean
}

export interface InnerCirclesChangedDetail {
  circleId?: string | null
  memberId?: string | null
  change?: 'circle' | 'membership'
  action?: InnerCircleAction | InnerCircleMemberAction | 'set'
}

export const INNER_CIRCLES_CHANGED_EVENT = 'shadowchat:inner-circles-changed'

const asRecord = (value: unknown): Record<string, unknown> => {
  if (Array.isArray(value)) return asRecord(value[0])
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

const asString = (value: unknown) => typeof value === 'string' ? value : null

const asNonNegativeInteger = (value: unknown) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

const asOptionalInteger = (value: unknown) => {
  if (value === null || value === undefined) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null
}

const unwrap = (value: unknown, key: string) => {
  const record = asRecord(value)
  return record[key] === undefined ? record : asRecord(record[key])
}

export const normalizeInnerCircle = (value: unknown): InnerCircle | null => {
  const record = unwrap(value, 'circle')
  const id = asString(record.id ?? record.circle_id)
  const name = asString(record.name ?? record.circle_name)?.trim()
  const createdAt = asString(record.created_at ?? record.createdAt)
  const updatedAt = asString(record.updated_at ?? record.updatedAt)
  if (!id || !name || !createdAt || !updatedAt) return null

  return {
    id,
    name,
    revision: asNonNegativeInteger(record.revision),
    memberCount: asNonNegativeInteger(record.member_count ?? record.memberCount),
    createdAt,
    updatedAt,
  }
}

export const normalizeInnerCircleMember = (value: unknown): InnerCircleMember | null => {
  const record = unwrap(value, 'member')
  const circleId = asString(record.circle_id ?? record.circleId)
  const memberId = asString(record.member_id ?? record.memberId)
  const addedAt = asString(record.added_at ?? record.addedAt)
  const profile = normalizeConnectionProfile(record.profile ?? record.member_profile)
  if (!circleId || !memberId || !addedAt || !profile || profile.id !== memberId) return null

  return { circleId, memberId, addedAt, profile }
}

export const normalizeInnerCircleMutationResult = (value: unknown): InnerCircleMutationResult => {
  const record = asRecord(value)
  const circle = normalizeInnerCircle(record.circle ?? record)
  return {
    circle,
    circleId: circle?.id ?? asString(record.circle_id ?? record.id),
    deleted: record.deleted === true || record.state === 'deleted',
  }
}

export const normalizeInnerCircleMemberMutationResult = (
  value: unknown,
): InnerCircleMemberMutationResult => {
  const record = asRecord(value)
  const member = normalizeInnerCircleMember(record.member ?? record)
  const isMember = typeof record.is_member === 'boolean'
    ? record.is_member
    : typeof record.isMember === 'boolean'
      ? record.isMember
      : null
  return {
    member,
    circleId: member?.circleId ?? asString(record.circle_id ?? record.circleId),
    memberId: member?.memberId ?? asString(record.member_id ?? record.memberId),
    removed: isMember === false || record.removed === true || record.state === 'removed',
    isMember,
    changed: record.changed === true,
    memberCount: asOptionalInteger(record.member_count ?? record.memberCount),
    revision: asOptionalInteger(record.revision),
  }
}

export const normalizeInnerCircleMemberSetResult = (
  value: unknown,
): InnerCircleMemberSetResult => {
  const record = asRecord(value)
  const rawMemberIds = record.member_ids ?? record.memberIds
  const memberIds = Array.isArray(rawMemberIds)
    ? Array.from(new Set(rawMemberIds
      .filter((memberId): memberId is string => typeof memberId === 'string' && Boolean(memberId))))
    : []
  return {
    circleId: asString(record.circle_id ?? record.circleId),
    revision: asNonNegativeInteger(record.revision),
    memberCount: asNonNegativeInteger(record.member_count ?? record.memberCount),
    memberIds,
    updatedAt: asString(record.updated_at ?? record.updatedAt),
    changed: record.changed === true,
  }
}

export const normalizeInnerCircleName = (value: string) => {
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error('Circle name is required.')
  if (name.length > 40) throw new Error('Circle names must be 40 characters or shorter.')
  return name
}

export const dispatchInnerCirclesChanged = (detail: InnerCirclesChangedDetail = {}) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<InnerCirclesChangedDetail>(INNER_CIRCLES_CHANGED_EVENT, { detail }))
}

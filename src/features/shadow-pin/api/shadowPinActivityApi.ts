import { getWorkingClient } from '../../../lib/supabase'
import type {
  ShadowPinActivityCategorySummary,
  ShadowPinActivityDashboardData,
  ShadowPinActivityDashboardParams,
  ShadowPinActivityEventPayload,
  ShadowPinActivityPinSummary,
  ShadowPinActivityTimelineEvent,
  ShadowPinActivityUserSummary,
} from '../activityTypes'

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value) || 0
  return 0
}

const normalizeUserSummary = (row: Record<string, unknown>): ShadowPinActivityUserSummary => ({
  user_id: String(row.user_id),
  username: String(row.username ?? ''),
  display_name: String(row.display_name ?? ''),
  avatar_url: row.avatar_url as string | null | undefined,
  admin_role: row.admin_role as string | null | undefined,
  visits: toNumber(row.visits),
  active_seconds: toNumber(row.active_seconds),
  categories_viewed: toNumber(row.categories_viewed),
  pins_viewed: toNumber(row.pins_viewed),
  pin_opens: toNumber(row.pin_opens),
  posts: toNumber(row.posts),
  categories_created: toNumber(row.categories_created),
  hearts: toNumber(row.hearts),
  shares: toNumber(row.shares),
  edits: toNumber(row.edits),
  deletes: toNumber(row.deletes),
  activity_score: toNumber(row.activity_score),
  previous_activity_score: toNumber(row.previous_activity_score),
  latest_activity: row.latest_activity as string | null | undefined,
})

const normalizeCategorySummary = (row: Record<string, unknown>): ShadowPinActivityCategorySummary => ({
  category_id: String(row.category_id),
  title: String(row.title ?? 'Deleted category'),
  thumbnail_url: row.thumbnail_url as string | null | undefined,
  visits: toNumber(row.visits),
  active_seconds: toNumber(row.active_seconds),
  unique_visitors: toNumber(row.unique_visitors),
  pin_views: toNumber(row.pin_views),
  pin_opens: toNumber(row.pin_opens),
  pins_created: toNumber(row.pins_created),
  hearts: toNumber(row.hearts),
  shares: toNumber(row.shares),
  latest_activity: row.latest_activity as string | null | undefined,
  activity_score: toNumber(row.activity_score),
  previous_activity_score: toNumber(row.previous_activity_score),
})

const normalizePinSummary = (row: Record<string, unknown>): ShadowPinActivityPinSummary => ({
  image_id: String(row.image_id),
  title: String(row.title ?? 'Deleted pin'),
  thumbnail_url: row.thumbnail_url as string | null | undefined,
  category_id: row.category_id as string | null | undefined,
  category_title: row.category_title as string | null | undefined,
  creator_id: row.creator_id as string | null | undefined,
  creator_username: row.creator_username as string | null | undefined,
  creator_display_name: row.creator_display_name as string | null | undefined,
  created_at: row.created_at as string | null | undefined,
  grid_views: toNumber(row.grid_views),
  opens: toNumber(row.opens),
  hearts: toNumber(row.hearts),
  shares: toNumber(row.shares),
  latest_activity: row.latest_activity as string | null | undefined,
  activity_score: toNumber(row.activity_score),
  previous_activity_score: toNumber(row.previous_activity_score),
})

const normalizeTimelineEvent = (row: Record<string, unknown>): ShadowPinActivityTimelineEvent => ({
  id: String(row.id),
  created_at: String(row.created_at),
  user_id: String(row.user_id),
  username: String(row.username ?? ''),
  display_name: String(row.display_name ?? ''),
  avatar_url: row.avatar_url as string | null | undefined,
  admin_role: row.admin_role as string | null | undefined,
  event_type: row.event_type as ShadowPinActivityTimelineEvent['event_type'],
  target_type: row.target_type as ShadowPinActivityTimelineEvent['target_type'],
  category_id: row.category_id as string | null | undefined,
  image_id: row.image_id as string | null | undefined,
  category_title: row.category_title as string | null | undefined,
  item_title: row.item_title as string | null | undefined,
  thumbnail_url: row.thumbnail_url as string | null | undefined,
  duration_seconds: row.duration_seconds == null ? null : toNumber(row.duration_seconds),
  score_value: toNumber(row.score_value),
  source: row.source as ShadowPinActivityTimelineEvent['source'],
})

export async function startShadowPinActivitySession() {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('start_shadow_pin_activity_session')
  if (error) throw error
  return data as string
}

export async function finishShadowPinActivitySession(sessionId: string, totalDurationSeconds: number) {
  const client = await getWorkingClient()
  const { error } = await client.rpc('finish_shadow_pin_activity_session', {
    session_id: sessionId,
    total_duration_seconds: Math.max(0, Math.round(totalDurationSeconds)),
  })
  if (error) throw error
}

export async function recordShadowPinActivityEvent(payload: ShadowPinActivityEventPayload) {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('record_shadow_pin_activity_event', {
    session_id: payload.sessionId ?? null,
    event_type: payload.eventType,
    category_id: payload.categoryId ?? null,
    image_id: payload.imageId ?? null,
    duration_seconds: payload.durationSeconds == null ? null : Math.max(0, Math.round(payload.durationSeconds)),
    metadata: payload.metadata ?? {},
  })
  if (error) throw error
  return data as string | null
}

export async function fetchShadowPinActivityDashboard(
  params: ShadowPinActivityDashboardParams
): Promise<ShadowPinActivityDashboardData> {
  const client = await getWorkingClient()
  const summaryArgs = {
    start_at: params.startAt,
    end_at: params.endAt,
    compare_start_at: params.compareStartAt ?? null,
    compare_end_at: params.compareEndAt ?? null,
    filter_user_id: params.filterUserId ?? null,
    filter_category_id: params.filterCategoryId ?? null,
  }

  const [usersResult, categoriesResult, pinsResult, timelineResult] = await Promise.all([
    client.rpc('get_shadow_pin_activity_user_summary', summaryArgs),
    client.rpc('get_shadow_pin_activity_category_summary', summaryArgs),
    client.rpc('get_shadow_pin_activity_pin_summary', summaryArgs),
    client.rpc('get_shadow_pin_activity_timeline', {
      start_at: params.startAt,
      end_at: params.endAt,
      filter_user_id: params.filterUserId ?? null,
      filter_category_id: params.filterCategoryId ?? null,
      filter_image_id: params.filterImageId ?? null,
      action_filter: params.actionFilter ?? 'all',
      result_limit: params.timelineLimit ?? 80,
      result_offset: params.timelineOffset ?? 0,
    }),
  ])

  if (usersResult.error) throw usersResult.error
  if (categoriesResult.error) throw categoriesResult.error
  if (pinsResult.error) throw pinsResult.error
  if (timelineResult.error) throw timelineResult.error

  return {
    users: ((usersResult.data ?? []) as Record<string, unknown>[]).map(normalizeUserSummary),
    categories: ((categoriesResult.data ?? []) as Record<string, unknown>[]).map(normalizeCategorySummary),
    pins: ((pinsResult.data ?? []) as Record<string, unknown>[]).map(normalizePinSummary),
    timeline: ((timelineResult.data ?? []) as Record<string, unknown>[]).map(normalizeTimelineEvent),
  }
}

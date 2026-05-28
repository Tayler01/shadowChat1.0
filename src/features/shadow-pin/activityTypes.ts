export type ShadowPinActivityEventType =
  | 'shadow_pin_visit'
  | 'category_visit'
  | 'pin_viewed'
  | 'pin_opened'
  | 'category_heart_added'
  | 'category_heart_removed'
  | 'pin_heart_added'
  | 'pin_heart_removed'
  | 'share_tapped'
  | 'category_created'
  | 'category_edited'
  | 'category_deleted'
  | 'pin_created'
  | 'pin_edited'
  | 'pin_deleted'

export type ShadowPinActivityActionFilter =
  | 'all'
  | 'views'
  | 'opens'
  | 'posts'
  | 'hearts'
  | 'shares'
  | 'edits'
  | 'deletes'
  | 'visits'

export type ShadowPinActivityTab = 'users' | 'categories' | 'pins'

export interface ShadowPinActivityEventPayload {
  sessionId?: string | null
  eventType: ShadowPinActivityEventType
  categoryId?: string | null
  imageId?: string | null
  durationSeconds?: number | null
  metadata?: Record<string, unknown>
}

export interface ShadowPinActivityUserSummary {
  user_id: string
  username: string
  display_name: string
  avatar_url?: string | null
  admin_role?: string | null
  visits: number
  active_seconds: number
  categories_viewed: number
  pins_viewed: number
  pin_opens: number
  posts: number
  categories_created: number
  hearts: number
  shares: number
  edits: number
  deletes: number
  activity_score: number
  previous_activity_score: number
  latest_activity?: string | null
}

export interface ShadowPinActivityCategorySummary {
  category_id: string
  title: string
  thumbnail_url?: string | null
  visits: number
  active_seconds: number
  unique_visitors: number
  pin_views: number
  pin_opens: number
  pins_created: number
  hearts: number
  shares: number
  latest_activity?: string | null
  activity_score: number
  previous_activity_score: number
}

export interface ShadowPinActivityPinSummary {
  image_id: string
  title: string
  thumbnail_url?: string | null
  category_id?: string | null
  category_title?: string | null
  creator_id?: string | null
  creator_username?: string | null
  creator_display_name?: string | null
  created_at?: string | null
  grid_views: number
  opens: number
  hearts: number
  shares: number
  latest_activity?: string | null
  activity_score: number
  previous_activity_score: number
}

export interface ShadowPinActivityTimelineEvent {
  id: string
  created_at: string
  user_id: string
  username: string
  display_name: string
  avatar_url?: string | null
  admin_role?: string | null
  event_type: ShadowPinActivityEventType
  target_type: 'shadow_pin' | 'category' | 'pin'
  category_id?: string | null
  image_id?: string | null
  category_title?: string | null
  item_title?: string | null
  thumbnail_url?: string | null
  duration_seconds?: number | null
  score_value: number
  source: 'live' | 'backfill'
}

export interface ShadowPinActivityDashboardParams {
  startAt: string
  endAt: string
  compareStartAt?: string | null
  compareEndAt?: string | null
  filterUserId?: string | null
  filterCategoryId?: string | null
  filterImageId?: string | null
  actionFilter?: ShadowPinActivityActionFilter
  timelineLimit?: number
  timelineOffset?: number
}

export interface ShadowPinActivityDashboardData {
  users: ShadowPinActivityUserSummary[]
  categories: ShadowPinActivityCategorySummary[]
  pins: ShadowPinActivityPinSummary[]
  timeline: ShadowPinActivityTimelineEvent[]
}

export type NewsFeedRealtimeRow = {
  hidden?: boolean | null
  visible_day?: string | null
}

export const getEasternVisibleDay = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

export const isCurrentVisibleNewsFeedRow = <T extends NewsFeedRealtimeRow>(row: T | null | undefined): row is T => (
  Boolean(row && !row.hidden && row.visible_day === getEasternVisibleDay())
)

export const isKnownHiddenOrOtherDayNewsFeedRow = (row: NewsFeedRealtimeRow | null | undefined) => (
  Boolean(row?.hidden === true || (row?.visible_day && row.visible_day !== getEasternVisibleDay()))
)

export const shouldRefreshBadgesForNewsFeedPayload = (payload: {
  eventType?: string
  new?: NewsFeedRealtimeRow | null
  old?: NewsFeedRealtimeRow | null
}) => {
  const currentDay = getEasternVisibleDay()
  const nextDay = payload.new?.visible_day
  const previousDay = payload.old?.visible_day

  if (payload.eventType === 'INSERT') {
    return isCurrentVisibleNewsFeedRow(payload.new)
  }

  if (payload.eventType === 'UPDATE') {
    return nextDay === currentDay || previousDay === currentDay
  }

  if (payload.eventType === 'DELETE') {
    return !previousDay || previousDay === currentDay
  }

  return nextDay === currentDay || previousDay === currentDay
}

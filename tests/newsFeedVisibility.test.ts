import {
  getEasternVisibleDay,
  shouldRefreshBadgesForNewsFeedPayload,
} from '../src/lib/newsFeedVisibility'

test('skips badge refreshes for hidden news feed inserts', () => {
  expect(shouldRefreshBadgesForNewsFeedPayload({
    eventType: 'INSERT',
    new: { hidden: true, visible_day: getEasternVisibleDay() },
  })).toBe(false)
})

test('keeps news feed badge deletes conservative when old rows are sparse', () => {
  expect(shouldRefreshBadgesForNewsFeedPayload({
    eventType: 'DELETE',
    old: {},
  })).toBe(true)
})

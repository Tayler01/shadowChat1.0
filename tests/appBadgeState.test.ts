import { getWorkingClient } from '../src/lib/supabase'
import { fetchAppBadgeState, refreshAppBadgeState, resetAppBadgeStateForUser, getCachedAppBadgeState } from '../src/lib/appBadge'

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(),
}))

const workingClient = getWorkingClient as jest.MockedFunction<typeof getWorkingClient>

test('loads the complete v2 badge breakdown and normalizes category counts', async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: {
      total: 120,
      dm: 2,
      group: 3,
      interactions: 4,
      connections: 1,
      shadow_pin: 5,
      games: 6,
      shadow_pin_destinations: [{
        category_id: 'category-1',
        image_id: 'image-1',
        unread_count: 3,
        post_count: 1,
        discussion_count: 2,
        post_event_ids: ['pin-post-1'],
        discussion_event_ids: ['pin-comment-1', 'pin-reply-1'],
      }],
      game_destinations: [{
        experience: 'shadow-checkers',
        item_id: 'match-1',
        unread_count: 1,
        event_ids: ['turn-1'],
      }, {
        experience: 'unknown-game',
        item_id: 'ignored',
        unread_count: 4,
        event_ids: ['ignored'],
      }],
    },
    error: null,
  })
  workingClient.mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    rpc,
  } as never)

  await expect(fetchAppBadgeState()).resolves.toEqual({
    total: 99,
    dm: 2,
    group: 3,
    interactions: 4,
    connections: 1,
    shadow_pin: 5,
    games: 6,
    shadowPinDestinations: [{
      categoryId: 'category-1',
      imageId: 'image-1',
      unreadCount: 3,
      postCount: 1,
      discussionCount: 2,
      postEventIds: ['pin-post-1'],
      discussionEventIds: ['pin-comment-1', 'pin-reply-1'],
    }],
    gameDestinations: [{
      experience: 'shadow-checkers',
      itemId: 'match-1',
      unreadCount: 1,
      eventIds: ['turn-1'],
    }],
  })
  expect(rpc).toHaveBeenCalledWith('get_app_badge_state_v2', {
    target_user_id: 'user-1',
  })
})


test('a transient aggregate failure retains the last successful state of the same account', async () => {
  resetAppBadgeStateForUser('badge-user')
  const rpc = jest.fn().mockResolvedValueOnce({ data: { total: 7, dm: 7 }, error: null })
    .mockResolvedValueOnce({ data: null, error: new Error('offline') })
  workingClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'badge-user' } }, error: null }) }, rpc } as never)
  expect((await refreshAppBadgeState()).total).toBe(7)
  expect((await refreshAppBadgeState()).total).toBe(7)
  resetAppBadgeStateForUser(null)
  expect(getCachedAppBadgeState().total).toBe(0)
})

test('an old account aggregate cannot publish after account switching', async () => {
  resetAppBadgeStateForUser('account-a')
  let resolveRpc!: (value: unknown) => void
  const rpc = jest.fn(() => new Promise(resolve => { resolveRpc = resolve }))
  workingClient.mockResolvedValue({ auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'account-a' } }, error: null }) }, rpc } as never)
  const pending = refreshAppBadgeState()
  while (!resolveRpc) await Promise.resolve()
  resetAppBadgeStateForUser('account-b')
  resolveRpc({ data: { total: 91, dm: 91 }, error: null })
  await pending
  expect(getCachedAppBadgeState().total).toBe(0)
  resetAppBadgeStateForUser(null)
})

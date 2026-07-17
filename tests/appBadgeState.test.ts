import { getWorkingClient } from '../src/lib/supabase'
import { fetchAppBadgeState } from '../src/lib/appBadge'

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
  })
  expect(rpc).toHaveBeenCalledWith('get_app_badge_state_v2', {
    target_user_id: 'user-1',
  })
})

import { getSessionWithTimeout, getWorkingClient } from '../src/lib/supabase'
import { shadowRunnerProgressApi } from '../src/features/games/shadow-runner/progressApi'

jest.mock('../src/lib/supabase', () => ({ getWorkingClient: jest.fn(), getSessionWithTimeout: jest.fn() }))
const clientMock = jest.mocked(getWorkingClient)
const sessionMock = jest.mocked(getSessionWithTimeout)
const completion = { revision: '1', score: 100, coinsCollected: 1, totalCoins: 2, enemiesDefeated: 1, totalEnemies: 2 }

function query(data: unknown = true) {
  const request = { select: jest.fn(), eq: jest.fn(), setHeader: jest.fn(), abortSignal: jest.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) }
  for (const name of ['select', 'eq', 'setHeader', 'abortSignal'] as const) request[name].mockReturnValue(request)
  return request
}
function session(ownerId: string) {
  return { data: { session: { user: { id: ownerId }, access_token: `${ownerId}-test-token` } }, error: null } as Awaited<ReturnType<typeof getSessionWithTimeout>>
}

describe('Shadow Runner owner-bound API (mocked only)', () => {
  beforeEach(() => { jest.resetAllMocks(); sessionMock.mockResolvedValue(session('alice')) })

  it('binds writes to the checked owner token and keeps the existing RPC contract', async () => {
    const request = query()
    const client = { rpc: jest.fn().mockReturnValue(request) }
    clientMock.mockResolvedValue(client)
    const signal = new AbortController().signal
    await shadowRunnerProgressApi.record('alice', 'tutorial', completion, signal)
    expect(client.rpc).toHaveBeenCalledWith('record_shadow_runner_level_completion', {
      completed_level_id: 'tutorial', completion_score: 100, completion_coins_collected: 1,
      completion_total_coins: 2, completion_enemies_defeated: 1, completion_total_enemies: 2,
    })
    expect(request.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer alice-test-token')
    expect(request.abortSignal).toHaveBeenCalledWith(signal)
  })

  it('refuses an old owner when session lookup returns the new account', async () => {
    const client = { rpc: jest.fn() }
    clientMock.mockResolvedValue(client)
    sessionMock.mockResolvedValue(session('bob'))
    await expect(shadowRunnerProgressApi.record('alice', 'tutorial', completion, new AbortController().signal)).rejects.toThrow('account changed')
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('does not launch a query after cancellation during session lookup', async () => {
    const client = { rpc: jest.fn() }
    clientMock.mockResolvedValue(client)
    const controller = new AbortController()
    sessionMock.mockImplementation(async () => { controller.abort(); return session('alice') })
    await expect(shadowRunnerProgressApi.record('alice', 'tutorial', completion, controller.signal)).rejects.toThrow()
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it.each([false, null, 1, 'true'])('requires a true acknowledgment, not %p, before clearing a pending result', async value => {
    clientMock.mockResolvedValue({ rpc: () => query(value) })
    await expect(shadowRunnerProgressApi.record('alice', 'tutorial', completion, new AbortController().signal)).rejects.toThrow('not acknowledged')
  })

  it('reads only the caller ledger with a pinned token, filtering unexpected rows', async () => {
    const row = { user_id: 'alice', level_id: 'level-2', completed_at: '2026-09-08', score: 900, coins_collected: 2, total_coins: 2, enemies_defeated: 1, total_enemies: 1 }
    const request = query([row, { ...row, user_id: 'bob' }, { ...row, level_id: 'unknown' }])
    const client = { from: jest.fn().mockReturnValue(request) }
    clientMock.mockResolvedValue(client)
    const rows = await shadowRunnerProgressApi.read('alice', new AbortController().signal)
    expect(client.from).toHaveBeenCalledWith('shadow_runner_level_completions')
    expect(request.eq).toHaveBeenCalledWith('user_id', 'alice')
    expect(request.setHeader).toHaveBeenCalledWith('Authorization', 'Bearer alice-test-token')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ownerId: 'alice', levelId: 'level-2', score: 900 })
  })
})

import { submitShadowCheckersMove } from '../src/features/games/shadow-checkers/api/shadowCheckersApi'

const mockRpc = jest.fn()
const mockGetUser = jest.fn()

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: async () => ({ rpc: mockRpc, auth: { getUser: mockGetUser } }),
}))

describe('Shadow Checkers move RPC client', () => {
  beforeEach(() => {
    mockRpc.mockReset()
    mockGetUser.mockReset()
  })

  test('submits through the authenticated client without a redundant getUser request', async () => {
    mockRpc.mockResolvedValue({ data: { matchId: 'match-1', completed: false }, error: null })
    const path = [{ row: 5, col: 0 }, { row: 4, col: 1 }]
    await expect(submitShadowCheckersMove('match-1', 'piece-1', path))
      .resolves.toMatchObject({ matchId: 'match-1', completed: false })
    expect(mockRpc).toHaveBeenCalledWith('submit_shadow_checkers_move', {
      target_match_id: 'match-1', piece_id: 'piece-1', move_path: path,
    })
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  test('keeps server authentication and turn rejections authoritative', async () => {
    const error = new Error('Not your turn')
    mockRpc.mockResolvedValue({ data: null, error })
    await expect(submitShadowCheckersMove('match-1', 'piece-1', []))
      .rejects.toBe(error)
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})

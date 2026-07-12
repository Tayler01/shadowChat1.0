import { searchUsers, searchUsersStrict, supabase } from '../src/lib/supabase'

const rpc = supabase.rpc as jest.Mock

beforeEach(() => {
  rpc.mockReset()
})

test('strict people search surfaces RPC failure while the legacy helper keeps its empty fallback', async () => {
  const rpcError = new Error('search unavailable')
  rpc.mockResolvedValue({ data: null, error: rpcError })

  await expect(searchUsersStrict('tayler')).rejects.toBe(rpcError)
  await expect(searchUsers('tayler')).resolves.toEqual([])
})

test('strict and legacy people search preserve the safe public projection on success', async () => {
  const row = {
    id: 'person-1',
    username: 'tayler',
    display_name: 'Tayler',
    avatar_url: null,
    avatar_thumbnail_url: null,
    color: '#d7aa46',
    status: 'online',
    email: 'must-not-leak@example.test',
  }
  rpc.mockResolvedValue({ data: [row], error: null })

  const strictResult = await searchUsersStrict('tayler')
  const legacyResult = await searchUsers('tayler')

  expect(strictResult[0]).toEqual(expect.objectContaining({
    id: 'person-1',
    username: 'tayler',
    display_name: 'Tayler',
  }))
  expect(strictResult[0]).not.toHaveProperty('email')
  expect(legacyResult).toEqual(strictResult)
})

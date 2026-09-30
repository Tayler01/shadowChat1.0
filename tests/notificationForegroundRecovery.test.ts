import { fetchForegroundNotificationEvents } from '../src/features/notifications/notificationApi'
import { getWorkingClient } from '../src/lib/supabase'
jest.mock('../src/lib/supabase', () => ({ getWorkingClient: jest.fn() }))

const row = (id: number) => ({ id: String(id), created_at: new Date(100_000 + id).toISOString() })
test('cursor recovery reaches events beyond the first twenty and remains bounded', async () => {
  const pages = [Array.from({ length: 20 }, (_, i) => row(25 - i)), Array.from({ length: 5 }, (_, i) => row(5 - i))]
  const queries: any[] = []
  const from = jest.fn(() => {
    const data = pages.shift() ?? []
    const q: any = { then: (resolve: any) => resolve({ data, error: null }) }
    for (const method of ['select', 'eq', 'is', 'gte', 'gt', 'order', 'limit', 'or']) q[method] = jest.fn(() => q)
    queries.push(q)
    return q
  })
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ from })
  const result = await fetchForegroundNotificationEvents('user-1', 0)
  expect(result).toHaveLength(25)
  expect(from).toHaveBeenCalledTimes(2)
  expect(queries[1].or).toHaveBeenCalledWith(expect.stringContaining('id.lt.6'))
  expect(result[0].id).toBe('1')
  expect(result[24].id).toBe('25')
})

test('an oversized recovery burst stops after five pages', async () => {
  const q: any = { then: (resolve: any) => resolve({ data: Array.from({ length: 20 }, (_, i) => row(i)), error: null }) }
  for (const method of ['select', 'eq', 'is', 'gte', 'gt', 'order', 'limit', 'or']) q[method] = jest.fn(() => q)
  const from = jest.fn(() => q)
  ;(getWorkingClient as jest.Mock).mockResolvedValue({ from })
  expect(await fetchForegroundNotificationEvents('user-1', 0)).toHaveLength(100)
  expect(from).toHaveBeenCalledTimes(5)
})

import { renderHook, act } from '@testing-library/react'
import { useUserSearch } from '../src/hooks/useUserSearch'
import { supabase } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => {
  return {
    supabase: {
      from: jest.fn(),
    },
  }
})

type SupabaseMock = jest.Mocked<typeof supabase>

beforeEach(() => {
  jest.resetAllMocks()
})

test('searches users by term', async () => {
  const orMock = jest.fn().mockResolvedValue({ data: [{ id: 'u1' }], error: null })
  const sb = supabase as SupabaseMock
  ;(sb.from as jest.Mock).mockReturnValue({
    select: jest.fn().mockReturnThis(),
    or: orMock,
  } as any)

  const { result } = renderHook(() => useUserSearch('bob'))
  await act(async () => {
    await Promise.resolve()
  })

  expect(orMock).toHaveBeenCalled()
  expect(result.current.results).toEqual([{ id: 'u1' }])
  expect(result.current.error).toBeNull()
})

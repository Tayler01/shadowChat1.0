import { renderHook, act } from '@testing-library/react'
import { useSuggestedReplies } from '../src/hooks/useSuggestedReplies'
import { getSuggestedReplies } from '../src/lib/ai'

jest.mock('../src/lib/ai', () => ({
  getSuggestedReplies: jest.fn()
}))

type GetMock = jest.MockedFunction<typeof getSuggestedReplies>

beforeEach(() => {
  jest.resetAllMocks()
})

test('fetches suggestions when enabled', async () => {
  const mock = getSuggestedReplies as GetMock
  mock.mockResolvedValue(['hi'])

  const { result } = renderHook(() => useSuggestedReplies([{ id: '1', content: 'hello' } as any], true))

  await act(async () => {
    await Promise.resolve()
  })

  expect(mock).toHaveBeenCalled()
  expect(result.current.suggestions).toEqual(['hi'])
})

test('does not fetch when disabled', async () => {
  const mock = getSuggestedReplies as GetMock

  const { result } = renderHook(() => useSuggestedReplies([{ id: '1', content: 'hello' } as any], false))

  await act(async () => {
    await Promise.resolve()
  })

  expect(mock).not.toHaveBeenCalled()
  expect(result.current.suggestions).toEqual([])
})

import { renderHook, act } from '@testing-library/react'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(),
  getRealtimeClient: jest.fn(),
}))

import { useTyping } from '../src/hooks/useTyping'
import { useAuth } from '../src/hooks/useAuth'
import { getRealtimeClient, getWorkingClient } from '../src/lib/supabase'

const buildChannel = (send = jest.fn()) => ({
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockReturnThis(),
  send,
})

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers()

  ;(useAuth as jest.Mock).mockReturnValue({
    user: { id: 'u1', username: 'u', display_name: 'U' },
  })
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
})

test('startTyping sends typing true broadcast', async () => {
  const sendMock = jest.fn()
  const channel = buildChannel(sendMock)
  const client = { channel: jest.fn(() => channel), removeChannel: jest.fn() }

  ;(getWorkingClient as jest.Mock).mockResolvedValue(client)
  ;(getRealtimeClient as jest.Mock).mockReturnValue(client)

  const { result } = renderHook(() => useTyping('general'))

  await act(async () => {
    await Promise.resolve()
  })

  await act(async () => {
    await result.current.startTyping()
  })

  expect(sendMock).toHaveBeenCalledWith({
    type: 'broadcast',
    event: 'typing',
    payload: {
      user: { id: 'u1', username: 'u', display_name: 'U' },
      typing: true,
    },
  })
  expect(result.current.isTyping).toBe(true)
})

test('stopTyping sends typing false broadcast', async () => {
  const sendMock = jest.fn()
  const channel = buildChannel(sendMock)
  const client = { channel: jest.fn(() => channel), removeChannel: jest.fn() }

  ;(getWorkingClient as jest.Mock).mockResolvedValue(client)
  ;(getRealtimeClient as jest.Mock).mockReturnValue(client)

  const { result } = renderHook(() => useTyping('general'))

  await act(async () => {
    await Promise.resolve()
  })

  await act(async () => {
    await result.current.startTyping()
  })

  await act(async () => {
    await result.current.stopTyping()
  })

  expect(sendMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({ typing: false }),
    })
  )
  expect(result.current.isTyping).toBe(false)
})

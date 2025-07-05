import { renderHook, act } from '@testing-library/react'
import { useClientResetStatus } from '../src/hooks/useClientResetStatus'
import {
  recreateSupabaseClient,
  forceSessionRestore,
  getWorkingClient,
  promoteFallbackToMain
} from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => {
  const workingClient = {
    auth: { getSession: jest.fn().mockResolvedValue({ data: { session: {} }, error: null }) },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null })
    }))
  }
  return {
    recreateSupabaseClient: jest.fn().mockResolvedValue(undefined),
    forceSessionRestore: jest.fn().mockResolvedValue(true),
    getWorkingClient: jest.fn().mockResolvedValue(workingClient),
    promoteFallbackToMain: jest.fn().mockResolvedValue(undefined)
  }
})


beforeEach(() => {
  jest.resetAllMocks()
})

test('queues simultaneous manual resets', async () => {
  const { result } = renderHook(() => useClientResetStatus())

  await act(async () => {
    await Promise.all([result.current.manualReset(), result.current.manualReset()])
  })

  expect((recreateSupabaseClient as jest.Mock)).toHaveBeenCalledTimes(1)
})

test('visibility change does not trigger duplicate reset', async () => {
  const { result } = renderHook(() => useClientResetStatus())

  await act(async () => {
    const p = result.current.manualReset()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await p
  })

  expect((recreateSupabaseClient as jest.Mock)).toHaveBeenCalledTimes(1)
})


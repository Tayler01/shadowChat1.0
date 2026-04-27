import { act, renderHook } from '@testing-library/react'
import { useSessionResumeRecovery } from '../src/hooks/useSessionResumeRecovery'
import { ensureSession, getStoredRefreshToken } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => ({
  ensureSession: jest.fn(),
  getStoredRefreshToken: jest.fn(),
}))

const setDocumentHidden = (hidden: boolean) => {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  jest.resetAllMocks()
  setDocumentHidden(false)
  ;(ensureSession as jest.Mock).mockResolvedValue(true)
  ;(getStoredRefreshToken as jest.Mock).mockReturnValue('saved-refresh-token')
})

afterEach(() => {
  jest.useRealTimers()
})

test('refreshes the saved session after the app resumes', async () => {
  renderHook(() => useSessionResumeRecovery(true, 25))

  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await act(async () => {
    await jest.advanceTimersByTimeAsync(25)
  })

  expect(ensureSession).toHaveBeenCalledTimes(1)
})

test('does not run resume recovery when no saved refresh token exists', async () => {
  ;(getStoredRefreshToken as jest.Mock).mockReturnValue(null)

  renderHook(() => useSessionResumeRecovery(true, 25))

  act(() => {
    window.dispatchEvent(new Event('pageshow'))
  })

  await act(async () => {
    await jest.advanceTimersByTimeAsync(25)
  })

  expect(ensureSession).not.toHaveBeenCalled()
})

test('does not run resume recovery while the document is hidden', async () => {
  setDocumentHidden(true)

  renderHook(() => useSessionResumeRecovery(true, 25))

  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await act(async () => {
    await jest.advanceTimersByTimeAsync(25)
  })

  expect(ensureSession).not.toHaveBeenCalled()
})

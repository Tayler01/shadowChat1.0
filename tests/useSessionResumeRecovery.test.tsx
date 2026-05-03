import { act, renderHook } from '@testing-library/react'
import { useSessionResumeRecovery } from '../src/hooks/useSessionResumeRecovery'
import { getStoredRefreshToken } from '../src/lib/supabase'
import { runSessionRecovery } from '../src/lib/sessionRecovery'

jest.mock('../src/lib/supabase', () => ({
  getStoredRefreshToken: jest.fn(),
}))

jest.mock('../src/lib/sessionRecovery', () => ({
  runSessionRecovery: jest.fn(),
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
  ;(runSessionRecovery as jest.Mock).mockResolvedValue({ ok: true, skipped: false, reason: 'resume' })
  ;(getStoredRefreshToken as jest.Mock).mockReturnValue('saved-refresh-token')
})

afterEach(() => {
  jest.useRealTimers()
})

test('refreshes the saved session after the app resumes', async () => {
  renderHook(() => useSessionResumeRecovery(true, 25))

  act(() => {
    setDocumentHidden(true)
    document.dispatchEvent(new Event('visibilitychange'))
    setDocumentHidden(false)
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await act(async () => {
    await jest.advanceTimersByTimeAsync(25)
  })

  expect(runSessionRecovery).toHaveBeenCalledTimes(1)
  expect(runSessionRecovery).toHaveBeenCalledWith('resume')
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

  expect(runSessionRecovery).not.toHaveBeenCalled()
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

  expect(runSessionRecovery).not.toHaveBeenCalled()
})

test('passes focus and online reasons to central recovery', async () => {
  renderHook(() => useSessionResumeRecovery(true, 25))

  act(() => {
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))
  })

  await act(async () => {
    await jest.advanceTimersByTimeAsync(25)
  })

  expect(runSessionRecovery).toHaveBeenLastCalledWith('focus')

  act(() => {
    window.dispatchEvent(new Event('online'))
  })

  await act(async () => {
    await jest.advanceTimersByTimeAsync(25)
  })

  expect(runSessionRecovery).toHaveBeenLastCalledWith('online')
})

test('ignores initial focus and pageshow events after launch', async () => {
  renderHook(() => useSessionResumeRecovery(true, 25))

  act(() => {
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('pageshow'))
  })

  await act(async () => {
    await jest.advanceTimersByTimeAsync(25)
  })

  expect(runSessionRecovery).not.toHaveBeenCalled()
})

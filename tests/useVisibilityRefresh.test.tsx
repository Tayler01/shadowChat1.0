import { renderHook } from '@testing-library/react'
import { useVisibilityRefresh } from '../src/hooks/useVisibilityRefresh'
import { supabase } from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => ({
  supabase: { auth: { refreshSession: jest.fn() } }
}))

test('refreshes session and runs callback on visibility change', () => {
  const cb = jest.fn()
  renderHook(() => useVisibilityRefresh(cb))
  Object.defineProperty(document, 'hidden', { value: false, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(supabase.auth.refreshSession).toHaveBeenCalled()
  expect(cb).toHaveBeenCalled()
})

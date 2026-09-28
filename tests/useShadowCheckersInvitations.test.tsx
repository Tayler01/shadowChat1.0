import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useAuth } from '../src/hooks/useAuth'
import {
  acceptShadowCheckersInvitation,
  fetchShadowCheckersInvitations,
} from '../src/features/games/shadow-checkers/api/shadowCheckersInvitationsApi'
import {
  ShadowCheckersInvitationsProvider,
  useShadowCheckersInvitations,
} from '../src/features/games/shadow-checkers/hooks/useShadowCheckersInvitations'
import type { ShadowCheckersInvitation } from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/hooks/usePresence', () => ({ useActiveUsers: () => [] }))
jest.mock('../src/lib/supabase', () => ({ getRealtimeClient: () => null }))
jest.mock('../src/features/games/shadow-checkers/api/shadowCheckersInvitationsApi', () => ({
  fetchShadowCheckersInvitations: jest.fn(),
  sendShadowCheckersInvitation: jest.fn(),
  acceptShadowCheckersInvitation: jest.fn(),
  declineShadowCheckersInvitation: jest.fn(),
  cancelShadowCheckersInvitation: jest.fn(),
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <ShadowCheckersInvitationsProvider>{children}</ShadowCheckersInvitationsProvider>
)

function pendingInvitation(expiresAt: string): ShadowCheckersInvitation {
  return {
    id: 'invite-1',
    inviter_id: 'account-b',
    invitee_id: 'account-a',
    inviter_character_key: 'shado',
    board_skin: 'classic',
    status: 'pending',
    session_id: null,
    match_id: null,
    expires_at: expiresAt,
    created_at: new Date(Date.now() - 1000).toISOString(),
    updated_at: new Date(Date.now() - 1000).toISOString(),
    responded_at: null,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'account-a' } })
  ;(fetchShadowCheckersInvitations as jest.Mock).mockResolvedValue([])
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

afterEach(() => {
  jest.useRealTimers()
})

test('removes an invitation at its deadline even when the refresh fails', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-27T12:00:00.000Z'))
  const invitation = pendingInvitation(new Date(Date.now() + 1000).toISOString())
  ;(fetchShadowCheckersInvitations as jest.Mock)
    .mockResolvedValueOnce([invitation])
    .mockRejectedValueOnce(new Error('network unavailable'))

  const { result } = renderHook(() => useShadowCheckersInvitations(), { wrapper })
  await act(async () => { await Promise.resolve() })
  expect(result.current.incoming.map(row => row.id)).toEqual(['invite-1'])

  await act(async () => {
    jest.advanceTimersByTime(1100)
    await Promise.resolve()
  })

  expect(result.current.incoming).toEqual([])
  expect(result.current.error).toBe('network unavailable')
})

test('rejects a completed Join result after the account changes', async () => {
  let completeAccept!: (value: { sessionId: string; matchId: string }) => void
  ;(acceptShadowCheckersInvitation as jest.Mock).mockImplementation(() => new Promise(resolve => {
    completeAccept = resolve
  }))

  const { result, rerender } = renderHook(() => useShadowCheckersInvitations(), { wrapper })
  await act(async () => { await Promise.resolve() })

  let acceptResult!: Promise<unknown>
  act(() => {
    acceptResult = result.current.accept('invite-1', 'shado')
  })
  expect(result.current.busy).toBe('accept')

  const changed = jest.fn()
  window.addEventListener('shadow-checkers-invitations-changed', changed)
  ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'account-c' } })
  rerender()
  await act(async () => { await Promise.resolve() })

  completeAccept({ sessionId: 'session-1', matchId: 'match-1' })
  await expect(acceptResult).rejects.toMatchObject({ name: 'AbortError' })
  expect(result.current.busy).toBeNull()
  expect(result.current.error).toBeNull()
  expect(changed).not.toHaveBeenCalled()
  window.removeEventListener('shadow-checkers-invitations-changed', changed)
})

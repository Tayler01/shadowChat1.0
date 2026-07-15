import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { usePresenceNotifications } from '../src/hooks/usePresenceNotifications'
import { useAuth } from '../src/hooks/useAuth'
import { getRealtimeClient, getWorkingClient } from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/lib/supabase', () => ({
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    custom: jest.fn(),
    dismiss: jest.fn(),
  },
}))

describe('usePresenceNotifications', () => {
  let insertHandler: ((payload: { new: unknown }) => void) | undefined
  let query: Record<string, jest.Mock>

  beforeEach(() => {
    insertHandler = undefined
    query = {}
    for (const method of ['select', 'eq', 'is', 'order', 'update']) {
      query[method] = jest.fn(() => query)
    }
    query.limit = jest.fn().mockResolvedValue({ data: [], error: null })
    const channel: { on: jest.Mock; subscribe: jest.Mock } = {
      on: jest.fn((_event, filter, handler) => {
        if (filter?.event === 'INSERT') insertHandler = handler
        return channel
      }),
      subscribe: jest.fn(() => channel),
    }
    const client = {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(),
      from: jest.fn(() => query),
    }
    ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'recipient-1' } })
    ;(getWorkingClient as jest.Mock).mockResolvedValue(client)
    ;(getRealtimeClient as jest.Mock).mockReturnValue(client)
    ;(toast.custom as jest.Mock).mockReset().mockReturnValue('presence-toast')
    ;(toast.dismiss as jest.Mock).mockReset()
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    window.history.replaceState({}, '', '/')
  })

  it('shows a foreground in-app alert and marks the transient event handled', async () => {
    renderHook(() => usePresenceNotifications())
    await waitFor(() => expect(insertHandler).toBeDefined())

    act(() => {
      insertHandler?.({
        new: {
          id: 'presence-1',
          type: 'presence_active',
          created_at: new Date().toISOString(),
          sent_at: null,
          payload: {
            notify_in_app: true,
            actor: { display_name: 'JJ' },
          },
        },
      })
    })

    await waitFor(() => expect(toast.custom).toHaveBeenCalledTimes(1))
    const [renderer] = (toast.custom as jest.Mock).mock.calls[0]
    render(renderer({ id: 'toast-1', visible: true }))
    expect(screen.getByRole('button', { name: /JJ is active now/i })).toBeInTheDocument()
    await waitFor(() => expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ read_at: expect.any(String) })))
  })

  it('does not replay an event that was already delivered as background push', async () => {
    renderHook(() => usePresenceNotifications())
    await waitFor(() => expect(insertHandler).toBeDefined())

    act(() => {
      insertHandler?.({
        new: {
          id: 'presence-2',
          type: 'presence_active',
          created_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
          payload: { notify_in_app: true, actor: { display_name: 'Mills' } },
        },
      })
    })

    await waitFor(() => expect(query.update).toHaveBeenCalled())
    expect(toast.custom).not.toHaveBeenCalled()
  })
})

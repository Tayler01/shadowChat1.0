import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { useAuth } from '../src/hooks/useAuth'
import { useShadowPinCommentNotifications } from '../src/features/shadow-pin/hooks/useShadowPinCommentNotifications'
import { getRealtimeClient, getWorkingClient } from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: jest.fn(),
}))
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    custom: jest.fn(),
    dismiss: jest.fn(),
  },
}))
jest.mock('../src/lib/supabase', () => ({
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))

type NotificationEvent = {
  id: string
  type: 'shadow_pin_post' | 'shadow_pin_comment' | 'shadow_pin_reply'
  payload: {
    image_title?: string
    body_preview?: string
    actor: { display_name: string }
  }
}

describe('useShadowPinCommentNotifications', () => {
  let insertHandler: ((payload: { new: NotificationEvent }) => void) | undefined
  let channel: {
    on: jest.Mock
    subscribe: jest.Mock
  }
  let query: Record<string, jest.Mock>
  let client: {
    channel: jest.Mock
    removeChannel: jest.Mock
    from: jest.Mock
  }

  beforeEach(() => {
    insertHandler = undefined
    query = {}
    for (const method of ['select', 'eq', 'in', 'is', 'order', 'update']) {
      query[method] = jest.fn(() => query)
    }
    query.limit = jest.fn().mockResolvedValue({ data: [], error: null })

    channel = {
      on: jest.fn((_event, filter, handler) => {
        if (filter?.event === 'INSERT') insertHandler = handler
        return channel
      }),
      subscribe: jest.fn(() => channel),
    }
    client = {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(),
      from: jest.fn(() => query),
    }

    ;(useAuth as jest.Mock).mockReturnValue({ user: { id: 'user-1' } })
    ;(getWorkingClient as jest.Mock).mockResolvedValue(client)
    ;(getRealtimeClient as jest.Mock).mockReturnValue(client)
    ;(toast.custom as jest.Mock).mockClear()
    ;(toast.custom as jest.Mock).mockReturnValue('shadow-pin-toast')
    ;(toast.dismiss as jest.Mock).mockClear()
    window.history.replaceState({}, '', '/')
  })

  it('uses the normal toast timer and hides during the removal delay', async () => {
    const timeoutSpy = jest.spyOn(window, 'setTimeout')
    renderHook(() => useShadowPinCommentNotifications())
    await waitFor(() => expect(insertHandler).toBeDefined())

    act(() => {
      insertHandler?.({
        new: {
          id: 'post-1',
          type: 'shadow_pin_post',
          payload: {
            image_title: 'Midnight City',
            actor: { display_name: 'Shado' },
          },
        },
      })
    })

    await waitFor(() => expect(toast.custom).toHaveBeenCalledTimes(1))
    const [renderer, options] = (toast.custom as jest.Mock).mock.calls[0]

    expect(options).toEqual({ duration: 5000, position: 'top-center' })
    const hardDismiss = timeoutSpy.mock.calls.find(([, delay]) => delay === 5000)
    expect(hardDismiss).toBeDefined()
    act(() => {
      ;(hardDismiss?.[0] as () => void)()
    })
    expect(toast.dismiss).toHaveBeenCalledWith('shadow-pin-toast')
    timeoutSpy.mockRestore()

    const visibleToast = {
      id: 'toast-1',
      visible: true,
    }
    const view = render(renderer(visibleToast))
    const notification = screen.getByRole('button', { name: /posted a new ShadowPin/i })
    expect(notification).toHaveClass('opacity-100', 'pointer-events-auto')

    view.rerender(renderer({ ...visibleToast, visible: false }))
    expect(notification).toHaveClass('opacity-0', 'pointer-events-none')
  })

  it('dismisses the toast and opens ShadowPin when selected', async () => {
    renderHook(() => useShadowPinCommentNotifications())
    await waitFor(() => expect(insertHandler).toBeDefined())

    act(() => {
      insertHandler?.({
        new: {
          id: 'comment-1',
          type: 'shadow_pin_comment',
          payload: {
            image_title: 'Midnight City',
            body_preview: 'This looks incredible',
            actor: { display_name: 'Shado' },
          },
        },
      })
    })

    await waitFor(() => expect(toast.custom).toHaveBeenCalledTimes(1))
    const [renderer] = (toast.custom as jest.Mock).mock.calls[0]
    render(renderer({ id: 'toast-2', visible: true }))

    act(() => {
      screen.getByRole('button', { name: /commented on Midnight City/i }).click()
    })

    expect(toast.dismiss).toHaveBeenCalledWith('toast-2')
    expect(new URL(window.location.href).searchParams.get('view')).toBe('pins')
  })
})

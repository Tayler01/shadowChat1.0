import { render, waitFor } from '@testing-library/react'
import { AppBadgeSync } from '../src/components/notifications/AppBadgeSync'
import { useDirectMessages } from '../src/hooks/useDirectMessages'
import { refreshAppBadge } from '../src/lib/appBadge'

jest.mock('../src/hooks/useDirectMessages', () => ({
  useDirectMessages: jest.fn(),
}))

jest.mock('../src/lib/appBadge', () => ({
  refreshAppBadge: jest.fn().mockResolvedValue(0),
  APP_BADGE_REFRESH_EVENT: 'shadowchat:app-badge-refresh',
}))

type MockConversation = {
  unread_count?: number
}

const mockedUseDirectMessages = useDirectMessages as jest.Mock
const mockedRefreshAppBadge = refreshAppBadge as jest.Mock

let conversations: MockConversation[] = []

const renderBadgeSync = () => {
  mockedUseDirectMessages.mockImplementation(() => ({
    conversations,
  }))

  return render(<AppBadgeSync />)
}

describe('AppBadgeSync', () => {
  beforeEach(() => {
    conversations = []
    jest.clearAllMocks()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  it('refreshes authoritative badge state after local unread messages clear', async () => {
    conversations = [{ unread_count: 2 }]
    const { rerender } = renderBadgeSync()

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(2))

    conversations = []
    rerender(<AppBadgeSync />)

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(0))
    mockedRefreshAppBadge.mockClear()

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(0))
  })

  it('still refreshes from the server while unread messages exist', async () => {
    conversations = [{ unread_count: 1 }]
    renderBadgeSync()

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(1))
    mockedRefreshAppBadge.mockClear()

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(1))
  })

  it('does not refresh from the server while the app is being hidden', async () => {
    conversations = [{ unread_count: 1 }]
    renderBadgeSync()

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(1))
    mockedRefreshAppBadge.mockClear()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(mockedRefreshAppBadge).not.toHaveBeenCalled()
  })
})

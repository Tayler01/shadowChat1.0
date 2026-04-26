import { render, waitFor } from '@testing-library/react'
import { AppBadgeSync } from '../src/components/notifications/AppBadgeSync'
import { useDirectMessages } from '../src/hooks/useDirectMessages'
import { refreshAppBadge, updateAppBadge } from '../src/lib/appBadge'

jest.mock('../src/hooks/useDirectMessages', () => ({
  useDirectMessages: jest.fn(),
}))

jest.mock('../src/lib/appBadge', () => ({
  refreshAppBadge: jest.fn().mockResolvedValue(0),
  updateAppBadge: jest.fn().mockResolvedValue(undefined),
}))

type MockConversation = {
  unread_count?: number
}

const mockedUseDirectMessages = useDirectMessages as jest.Mock
const mockedRefreshAppBadge = refreshAppBadge as jest.Mock
const mockedUpdateAppBadge = updateAppBadge as jest.Mock

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
  })

  it('trusts a local clear briefly so Android does not repaint a stale launcher badge', async () => {
    conversations = [{ unread_count: 2 }]
    const { rerender } = renderBadgeSync()

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(2))

    conversations = []
    rerender(<AppBadgeSync />)

    await waitFor(() => expect(mockedUpdateAppBadge).toHaveBeenCalledWith(0))
    mockedRefreshAppBadge.mockClear()
    mockedUpdateAppBadge.mockClear()

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(mockedUpdateAppBadge).toHaveBeenCalledWith(0))
    expect(mockedRefreshAppBadge).not.toHaveBeenCalled()
  })

  it('still refreshes from the server while unread messages exist', async () => {
    conversations = [{ unread_count: 1 }]
    renderBadgeSync()

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(1))
    mockedRefreshAppBadge.mockClear()

    window.dispatchEvent(new Event('focus'))

    await waitFor(() => expect(mockedRefreshAppBadge).toHaveBeenCalledWith(1))
  })
})

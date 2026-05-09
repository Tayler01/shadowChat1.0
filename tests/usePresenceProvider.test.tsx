import { act, render, screen, waitFor } from '@testing-library/react'
import {
  PresenceProvider,
  useActiveUsers,
  usePresenceForUser,
} from '../src/hooks/usePresence'
import {
  fetchPresenceStates,
  getRealtimeClient,
  getWorkingClient,
} from '../src/lib/supabase'

jest.mock('../src/lib/supabase', () => ({
  fetchPresenceStates: jest.fn(),
  getRealtimeClient: jest.fn(),
  getWorkingClient: jest.fn(),
}))

type RealtimeHandlers = Record<string, (payload: any) => void>

type TestChannel = {
  on: jest.Mock<TestChannel, [string, { event: string; table: string }, RealtimeHandlers[string]]>
  subscribe: jest.Mock<TestChannel, []>
}

const createPresenceRow = (overrides: Record<string, unknown> = {}) => ({
  user_id: 'u2',
  username: 'shadow',
  display_name: 'Shadow',
  avatar_url: null,
  color: '#d7aa46',
  presence_visibility: 'tracked',
  presence_state: 'online',
  is_active: true,
  last_seen: new Date().toISOString(),
  ...overrides,
})

const PresenceProbe = () => {
  const presence = usePresenceForUser('u2')
  const activeUsers = useActiveUsers()

  return (
    <div>
      <span data-testid="presence-state">{presence?.presence_state ?? 'missing'}</span>
      <span data-testid="active-count">{activeUsers.length}</span>
    </div>
  )
}

let realtimeHandlers: RealtimeHandlers
let workingClient: {
  channel: jest.Mock
  removeChannel: jest.Mock
}

beforeEach(() => {
  jest.resetAllMocks()
  realtimeHandlers = {}

  const channel: TestChannel = {
    on: jest.fn((_: string, config: { event: string; table: string }, handler: RealtimeHandlers[string]) => {
      realtimeHandlers[`${config.table}:${config.event}`] = handler
      return channel
    }),
    subscribe: jest.fn(() => channel),
  }

  workingClient = {
    channel: jest.fn(() => channel),
    removeChannel: jest.fn(),
  }

  ;(getWorkingClient as jest.Mock).mockResolvedValue(workingClient)
  ;(getRealtimeClient as jest.Mock).mockReturnValue(workingClient)
})

test('applies known user presence realtime updates without a full refresh', async () => {
  ;(fetchPresenceStates as jest.Mock).mockResolvedValue([createPresenceRow()])

  render(
    <PresenceProvider userId="u1">
      <PresenceProbe />
    </PresenceProvider>
  )

  await waitFor(() => expect(screen.getByTestId('presence-state')).toHaveTextContent('online'))
  await waitFor(() => expect(realtimeHandlers['user_presence:*']).toBeDefined())
  expect(fetchPresenceStates).toHaveBeenCalledTimes(1)

  act(() => {
    realtimeHandlers['user_presence:*']?.({
      eventType: 'UPDATE',
      new: {
        user_id: 'u2',
        status: 'offline',
        last_seen: null,
      },
    })
  })

  expect(screen.getByTestId('presence-state')).toHaveTextContent('offline')
  expect(screen.getByTestId('active-count')).toHaveTextContent('0')
  expect(fetchPresenceStates).toHaveBeenCalledTimes(1)
})

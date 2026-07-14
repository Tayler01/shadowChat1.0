import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  getMyConnectionState,
  getMyConnectionSummary,
  listMyConnections,
  mutateConnection,
} from '../src/features/connections/connectionsApi'
import { ConnectionControl } from '../src/features/connections/ConnectionControl'
import { ConnectionsHubSheet } from '../src/features/connections/ConnectionsHubSheet'
import { shouldPresentConnectionNotification } from '../src/features/connections/connectionModel'

const getWorkingClientMock = jest.fn()
const searchUsersStrictMock = jest.fn()
const rpcMock = jest.fn()
const toastSuccessMock = jest.fn()
const toastErrorMock = jest.fn()
const mockUseInnerCirclesHook = jest.fn()
const mockUseInnerCircleMembersHook = jest.fn()

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: (...args: unknown[]) => getWorkingClientMock(...args),
  searchUsersStrict: (...args: unknown[]) => searchUsersStrictMock(...args),
}))

jest.mock('../src/features/inner-circles/useInnerCircles', () => ({
  useInnerCircles: () => mockUseInnerCirclesHook(),
  useInnerCircleMembers: () => mockUseInnerCircleMembersHook(),
}))

jest.mock('../src/components/ui/Avatar', () => ({
  Avatar: ({ alt }: { alt: string }) => <span data-testid="avatar-stub">{alt}</span>,
}))

jest.mock('../src/components/profile/PublicProfileDialog', () => ({
  PublicProfileDialog: () => null,
}))

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

const profile = {
  id: 'user-2',
  username: 'jules',
  display_name: 'Jules',
  avatar_url: null,
  avatar_thumbnail_url: null,
  color: '#d7aa46',
  status: 'online',
}

const sqlState = (status: string, direction = 'none') => ({
  connection_id: status === 'none' ? undefined : 'connection-1',
  other_user_id: profile.id,
  status,
  direction,
  revision: 3,
  updated_at: '2026-07-13T19:00:00.000Z',
})

const sqlListRow = {
  connection_id: 'connection-1',
  other_user: profile,
  status: 'accepted',
  direction: 'connected',
  revision: 3,
  requested_at: '2026-07-13T18:00:00.000Z',
  accepted_at: '2026-07-13T18:30:00.000Z',
  updated_at: '2026-07-13T19:00:00.000Z',
}

type RpcResult = { data: unknown; error: unknown }

const deferredRpcResult = () => {
  let resolve!: (result: RpcResult) => void
  const promise = new Promise<RpcResult>(next => { resolve = next })
  return { promise, resolve }
}

beforeEach(() => {
  jest.clearAllMocks()
  getWorkingClientMock.mockResolvedValue({ rpc: rpcMock })
  searchUsersStrictMock.mockResolvedValue([])
  mockUseInnerCirclesHook.mockReturnValue({
    circles: [], loading: false, error: null, mutating: false,
    refresh: jest.fn(), createCircle: jest.fn(), renameCircle: jest.fn(), deleteCircle: jest.fn(),
  })
  mockUseInnerCircleMembersHook.mockReturnValue({
    members: [], loading: false, error: null, mutating: false,
    refresh: jest.fn(), addMember: jest.fn(), removeMember: jest.fn(), setMembers: jest.fn(),
  })
  jest.spyOn(window, 'confirm').mockReturnValue(true)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('Connections API integration contract', () => {
  it('uses the public RPC argument names defined by the migration', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })

    await getMyConnectionState(profile.id)
    await getMyConnectionSummary()
    await listMyConnections({
      scope: 'accepted',
      limit: 20,
      beforeUpdatedAt: '2026-07-13T19:00:00.000Z',
      beforeId: 'connection-1',
    })
    await mutateConnection(profile.id, 'request')

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'get_my_connection_state', {
      target_user_id: profile.id,
    })
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'get_my_connection_summary')
    expect(rpcMock).toHaveBeenNthCalledWith(3, 'list_my_connections', {
      target_scope: 'accepted',
      result_limit: 20,
      before_updated_at: '2026-07-13T19:00:00.000Z',
      before_id: 'connection-1',
    })
    expect(rpcMock).toHaveBeenNthCalledWith(4, 'mutate_connection', {
      target_user_id: profile.id,
      target_action: 'request',
    })
  })

  it('normalizes the actual SQL state, summary, list, and mutation shapes', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_my_connection_state') return Promise.resolve({ data: sqlState('pending', 'outgoing'), error: null })
      if (name === 'get_my_connection_summary') return Promise.resolve({ data: { connections: 7, incoming: 2, outgoing: 1 }, error: null })
      if (name === 'list_my_connections') return Promise.resolve({ data: [sqlListRow], error: null })
      if (name === 'mutate_connection') return Promise.resolve({ data: sqlState('accepted', 'connected'), error: null })
      throw new Error(`Unexpected RPC ${name}`)
    })

    await expect(getMyConnectionState(profile.id)).resolves.toMatchObject({
      state: 'outgoing_pending',
      connectionId: 'connection-1',
      revision: 3,
    })
    await expect(getMyConnectionSummary()).resolves.toEqual({
      acceptedCount: 7,
      incomingCount: 2,
      outgoingCount: 1,
    })
    await expect(listMyConnections({ scope: 'accepted' })).resolves.toEqual([
      expect.objectContaining({
        connectionId: 'connection-1',
        state: 'connected',
        profile: expect.objectContaining({ id: profile.id, username: 'jules' }),
      }),
    ])
    await expect(mutateConnection(profile.id, 'accept')).resolves.toMatchObject({
      state: 'connected',
      connectionId: 'connection-1',
    })
  })
})

describe('ConnectionControl integration states', () => {
  it('uses a supplied list state without issuing an N+1 state request', () => {
    render(<ConnectionControl user={profile} initialState="connected" />)

    expect(screen.getByTestId(`connection-action-remove-${profile.id}`)).toBeInTheDocument()
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('fails closed with retry when state cannot be loaded', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('Connection state offline') })
    render(<ConnectionControl user={profile} />)

    expect(await screen.findByRole('button', { name: `Retry connection status for ${profile.display_name}` })).toBeInTheDocument()
    expect(screen.queryByTestId(`connection-action-request-${profile.id}`)).not.toBeInTheDocument()
  })

  it('shows the server cooldown instead of an action that must fail', async () => {
    rpcMock.mockResolvedValue({
      data: { ...sqlState('inactive'), retry_after: new Date(Date.now() + 90 * 60_000).toISOString() },
      error: null,
    })
    render(<ConnectionControl user={profile} />)

    expect(await screen.findByRole('button', { name: /Connection request available again/i })).toBeDisabled()
    expect(screen.queryByTestId(`connection-action-request-${profile.id}`)).not.toBeInTheDocument()
  })

  it('shows an outgoing request optimistically while the mutation is pending', async () => {
    const mutation = deferredRpcResult()
    rpcMock.mockImplementation((name: string) => (
      name === 'get_my_connection_state'
        ? Promise.resolve({ data: sqlState('none'), error: null })
        : mutation.promise
    ))
    const browserUser = userEvent.setup()
    render(<ConnectionControl user={profile} />)

    const requestButton = await screen.findByTestId(`connection-action-request-${profile.id}`)
    await act(async () => { await browserUser.click(requestButton) })
    expect(screen.getByTestId(`connection-action-cancel-${profile.id}`)).toHaveTextContent('Requested')

    await act(async () => mutation.resolve({ data: sqlState('pending', 'outgoing'), error: null }))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Connection request sent'))
  })

  it('rolls an optimistic request back when the RPC fails', async () => {
    const mutation = deferredRpcResult()
    rpcMock.mockImplementation((name: string) => (
      name === 'get_my_connection_state'
        ? Promise.resolve({ data: sqlState('none'), error: null })
        : mutation.promise
    ))
    const browserUser = userEvent.setup()
    render(<ConnectionControl user={profile} />)

    const requestButton = await screen.findByTestId(`connection-action-request-${profile.id}`)
    await act(async () => { await browserUser.click(requestButton) })
    expect(screen.getByTestId(`connection-action-cancel-${profile.id}`)).toBeInTheDocument()
    await act(async () => mutation.resolve({ data: null, error: new Error('Network unavailable') }))

    await waitFor(() => expect(screen.getByTestId(`connection-action-request-${profile.id}`)).toBeInTheDocument())
    expect(toastErrorMock).toHaveBeenCalledWith('Network unavailable')
  })

  it('shows connected optimistically when an incoming request is accepted', async () => {
    const mutation = deferredRpcResult()
    rpcMock.mockImplementation((name: string) => (
      name === 'get_my_connection_state'
        ? Promise.resolve({ data: sqlState('pending', 'incoming'), error: null })
        : mutation.promise
    ))
    const browserUser = userEvent.setup()
    render(<ConnectionControl user={profile} />)

    const acceptButton = await screen.findByTestId(`connection-action-accept-${profile.id}`)
    await act(async () => { await browserUser.click(acceptButton) })
    expect(screen.getByTestId(`connection-action-remove-${profile.id}`)).toHaveTextContent('Connected')

    await act(async () => mutation.resolve({ data: sqlState('accepted', 'connected'), error: null }))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Connection accepted'))
  })
})

describe('ConnectionsHubSheet integration basics', () => {
  it('exposes accessible tabs and search, renders rows, and switches to an empty scope', async () => {
    rpcMock.mockImplementation((name: string, args?: { target_scope?: string }) => {
      if (name === 'get_my_connection_summary') return Promise.resolve({ data: { connections: 1, incoming: 0, outgoing: 0 }, error: null })
      if (name === 'list_my_connections') return Promise.resolve({ data: args?.target_scope === 'accepted' ? [sqlListRow] : [], error: null })
      if (name === 'get_my_connection_state') return Promise.resolve({ data: sqlState('accepted', 'connected'), error: null })
      throw new Error(`Unexpected RPC ${name}`)
    })
    const browserUser = userEvent.setup()
    render(<ConnectionsHubSheet open onClose={jest.fn()} currentUserId="user-1" summary={{ acceptedCount: 1, incomingCount: 0, outgoingCount: 0 }} onMessage={jest.fn()} />)

    const dialog = screen.getByRole('dialog', { name: 'Connections' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('tablist', { name: 'Connection lists' })).toBeInTheDocument()
    expect(screen.getByTestId('connections-tab-accepted')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('connections-search-input')).toHaveAccessibleName('Find people to connect with')
    expect(await screen.findByTestId(`connection-row-${profile.id}`)).toBeInTheDocument()
    expect(rpcMock).not.toHaveBeenCalledWith('get_my_connection_state', expect.anything())

    screen.getByTestId('connections-tab-accepted').focus()
    await act(async () => { await browserUser.keyboard('{ArrowRight}') })
    expect(screen.getByTestId('connections-tab-incoming')).toHaveFocus()
    expect(screen.getByTestId('connections-tab-incoming')).toHaveAttribute('aria-selected', 'true')
    await act(async () => { await browserUser.click(screen.getByTestId('connections-tab-accepted')) })
    expect(await screen.findByTestId(`connection-row-${profile.id}`)).toBeInTheDocument()

    await act(async () => { await browserUser.click(screen.getByTestId('connections-tab-incoming')) })
    expect(screen.getByTestId('connections-tab-incoming')).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/all caught up/i)).toBeInTheDocument()

    await act(async () => { await browserUser.click(screen.getByTestId('connections-tab-accepted')) })
    expect(await screen.findByTestId(`connection-row-${profile.id}`)).toBeInTheDocument()
    await act(async () => { await browserUser.click(screen.getByRole('button', { name: /Open Jules's profile/i })) })
    expect(screen.getByTestId('connections-hub')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('connections-hub')).toHaveAttribute('aria-modal', 'false')
  })

  it('renders list failures as a retryable alert', async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === 'get_my_connection_summary') return Promise.resolve({ data: { connections: 0, incoming: 0, outgoing: 0 }, error: null })
      if (name === 'list_my_connections') return Promise.resolve({ data: null, error: new Error('Connection service offline') })
      throw new Error(`Unexpected RPC ${name}`)
    })
    render(<ConnectionsHubSheet open onClose={jest.fn()} currentUserId="user-1" summary={{ acceptedCount: 0, incomingCount: 0, outgoingCount: 0 }} onMessage={jest.fn()} />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Connections are unavailable')
    expect(alert).toHaveTextContent('Connection service offline')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('routes between People, private Circle list, and Circle detail', async () => {
    const circle = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Closest Friends',
      memberCount: 1,
      revision: 2,
      createdAt: '2026-07-13T20:00:00.000Z',
      updatedAt: '2026-07-13T20:00:00.000Z',
    }
    const onCircleRoute = jest.fn()
    mockUseInnerCirclesHook.mockReturnValue({
      circles: [circle], loading: false, error: null, mutating: false,
      refresh: jest.fn(), createCircle: jest.fn(), renameCircle: jest.fn(), deleteCircle: jest.fn(),
    })
    mockUseInnerCircleMembersHook.mockReturnValue({
      members: [{ circleId: circle.id, memberId: profile.id, addedAt: circle.createdAt, profile }],
      loading: false, error: null, mutating: false,
      refresh: jest.fn(), addMember: jest.fn(), removeMember: jest.fn(), setMembers: jest.fn(),
    })
    rpcMock.mockResolvedValue({ data: [], error: null })
    const browserUser = userEvent.setup()

    render(
      <ConnectionsHubSheet
        open
        onClose={jest.fn()}
        currentUserId="user-1"
        summary={{ acceptedCount: 1, incomingCount: 0, outgoingCount: 0 }}
        onMessage={jest.fn()}
        initialSection="circles"
        onCircleRoute={onCircleRoute}
      />
    )

    expect(screen.getByRole('tab', { name: /Circles/i })).toHaveAttribute('aria-selected', 'true')
    await browserUser.click(screen.getByRole('button', { name: /Open Closest Friends/i }))
    expect(onCircleRoute).toHaveBeenCalledWith('open-circle', circle.id)
    expect(screen.getByRole('heading', { name: 'Closest Friends' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Message Jules' })).toBeInTheDocument()

    await browserUser.click(screen.getByRole('button', { name: 'Back to Inner Circles' }))
    expect(onCircleRoute).toHaveBeenCalledWith('close-circle')
    await browserUser.click(screen.getByRole('tab', { name: /People/i }))
    expect(onCircleRoute).toHaveBeenCalledWith('show-people')
    expect(screen.getByRole('tablist', { name: 'Connection lists' })).toBeInTheDocument()
  })

  it('fails closed when the member picker cannot load the complete accepted list', async () => {
    const circle = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Closest Friends',
      memberCount: 1,
      revision: 2,
      createdAt: '2026-07-13T20:00:00.000Z',
      updatedAt: '2026-07-13T20:00:00.000Z',
    }
    const setMembers = jest.fn()
    mockUseInnerCirclesHook.mockReturnValue({
      circles: [circle], loading: false, error: null, mutating: false,
      refresh: jest.fn(), createCircle: jest.fn(), renameCircle: jest.fn(), deleteCircle: jest.fn(),
    })
    mockUseInnerCircleMembersHook.mockReturnValue({
      members: [{ circleId: circle.id, memberId: profile.id, addedAt: circle.createdAt, profile }],
      loading: false, error: null, mutating: false,
      refresh: jest.fn(), addMember: jest.fn(), removeMember: jest.fn(), setMembers,
    })
    rpcMock.mockImplementation((name: string) => {
      if (name === 'list_my_connections') {
        return Promise.resolve({ data: null, error: new Error('Accepted list unavailable') })
      }
      return Promise.resolve({ data: [], error: null })
    })
    const browserUser = userEvent.setup()

    render(
      <ConnectionsHubSheet
        open
        onClose={jest.fn()}
        currentUserId="user-1"
        summary={{ acceptedCount: 1, incomingCount: 0, outgoingCount: 0 }}
        onMessage={jest.fn()}
        initialSection="circles"
        initialCircleId={circle.id}
      />
    )

    await browserUser.click(screen.getByRole('button', { name: 'Add Connections' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Accepted list unavailable')
    expect(screen.getByRole('button', { name: 'Save Members' })).toBeDisabled()
    expect(setMembers).not.toHaveBeenCalled()
  })
})

test('notification payload preference suppresses in-app presentation', () => {
  expect(shouldPresentConnectionNotification({ notify: false })).toBe(false)
  expect(shouldPresentConnectionNotification({ notify: true })).toBe(true)
  expect(shouldPresentConnectionNotification({})).toBe(true)
})

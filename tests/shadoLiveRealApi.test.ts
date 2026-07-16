import { getWorkingClient } from '../src/lib/supabase'
import {
  getMyShadoLiveRoom,
  leaveShadoLiveSession,
  listMyShadoLiveRooms,
  openShadoLiveSession,
  reconcileShadoLive,
  sendShadoLiveCommand,
  toggleMyShadoLiveMessageReaction,
} from '../src/features/entertainment/shado-live/real/shadoLiveApi'

jest.mock('../src/lib/supabase', () => ({ getWorkingClient: jest.fn() }))

const workingClient = getWorkingClient as jest.MockedFunction<typeof getWorkingClient>

const ROOM_ID = 'd7fa28d4-0d4d-4a9e-bb8f-a422b57c50bf'
const HOST_ID = 'ebc95835-bf5b-4667-a1f8-0e256a88ac35'
const LISTENER_ID = '5cb960ba-7390-4238-9f81-66e61079d458'
const REQUEST_JOIN = 'd10bc425-57ba-4e22-aede-799950668a62'
const REQUEST_PROMOTE = '17d479a9-e672-48c5-b32d-0c628f04fc4a'
const REQUEST_MESSAGE = '9f109586-eb22-448d-a1e0-6e5431a920d7'
const REQUEST_LEAVE = 'a7e552c2-f553-4a64-aad8-f0922ca65dde'
const REQUEST_START = '8ded445a-f602-4b5e-91c0-e183f8b3f984'
const REQUEST_RECONCILE = 'a478a464-4ca8-4d39-94bb-f4a5d3d13f0f'
const MESSAGE_ID = '67a00bf8-b0d6-489e-92b0-e58ed9b5450d'

const roomRow = {
  roomId: ROOM_ID, revision: 4, title: 'Night Room', status: 'live',
  host: { id: HOST_ID, display_name: 'Tayler', username: 'tayler' }, listenerCount: 1,
  callerRole: 'host', handRaised: false, hostGraceExpiresAt: null,
  startedAt: '2026-07-15T20:00:00Z', participants: [], messages: [],
}

beforeEach(() => jest.clearAllMocks())

test('uses bounded caller-visible room read RPCs', async () => {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: [roomRow], error: null })
    .mockResolvedValueOnce({ data: roomRow, error: null })
  workingClient.mockResolvedValue({ rpc } as never)

  await expect(listMyShadoLiveRooms(99)).resolves.toHaveLength(1)
  await expect(getMyShadoLiveRoom(ROOM_ID)).resolves.toMatchObject({ id: ROOM_ID, version: 4 })
  expect(rpc).toHaveBeenNthCalledWith(1, 'list_my_shado_live_rooms', { result_limit: 50 })
  expect(rpc).toHaveBeenNthCalledWith(2, 'get_my_shado_live_room', { target_room_id: ROOM_ID })
})

test('loads isolated live reaction aggregates and toggles them through guarded RPCs', async () => {
  const rpc = jest.fn()
    .mockResolvedValueOnce({
      data: {
        ...roomRow,
        messages: [{
          messageId: MESSAGE_ID,
          sender: { id: HOST_ID, display_name: 'Tayler', username: 'tayler' },
          body: 'React here',
          createdAt: '2026-07-15T20:00:30Z',
        }],
      },
      error: null,
    })
    .mockResolvedValueOnce({
      data: [{
        message_id: MESSAGE_ID,
        emoji: '👍',
        reaction_count: 2,
        reacted_by_me: true,
      }],
      error: null,
    })
    .mockResolvedValueOnce({
      data: { roomId: ROOM_ID, messageId: MESSAGE_ID, emoji: '👍', active: false },
      error: null,
    })
  workingClient.mockResolvedValue({ rpc } as never)

  await expect(getMyShadoLiveRoom(ROOM_ID)).resolves.toMatchObject({
    messages: [{
      id: MESSAGE_ID,
      reactions: { '👍': { count: 2, reactedByCurrentUser: true } },
    }],
  })
  await expect(toggleMyShadoLiveMessageReaction(MESSAGE_ID, '👍')).resolves.toBe(false)

  expect(rpc).toHaveBeenNthCalledWith(2, 'list_my_shado_live_message_reactions', {
    target_room_id: ROOM_ID,
    target_message_ids: [MESSAGE_ID],
  })
  expect(rpc).toHaveBeenNthCalledWith(3, 'toggle_my_shado_live_message_reaction', {
    target_message_id: MESSAGE_ID,
    reaction_emoji: '👍',
  })
})

test('opens listener media only through the authenticated session function', async () => {
  const invoke = jest.fn().mockResolvedValue({
    data: {
      room: { ...roomRow, my_role: 'listener' },
      ok: true,
      action: 'join',
      roomId: ROOM_ID,
      media: {
        server_url: 'wss://shadow.livekit.cloud',
        participant_token: 'listener-token',
        expires_at: '2026-07-15T20:05:00Z',
      },
    },
    error: null,
  })
  const rpc = jest.fn().mockResolvedValue({ data: { ...roomRow, callerRole: 'listener' }, error: null })
  workingClient.mockResolvedValue({ functions: { invoke }, rpc } as never)

  await expect(openShadoLiveSession({
    action: 'join',
    roomId: ROOM_ID,
    requestId: REQUEST_JOIN,
  })).resolves.toMatchObject({ room: { myRole: 'listener' } })
  expect(invoke).toHaveBeenCalledWith('shado-live-session', { body: {
    action: 'join',
    room_id: ROOM_ID,
    title: null,
    request_id: REQUEST_JOIN,
  } })
})

test('sends expected_version for host commands but not as authority for chat', async () => {
  const invoke = jest.fn()
    .mockResolvedValueOnce({ data: { ok: true, action: 'promote', roomId: ROOM_ID }, error: null })
    .mockResolvedValueOnce({ data: { ok: true, action: 'send_message', roomId: ROOM_ID }, error: null })
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: { ...roomRow, revision: 5 }, error: null })
    .mockResolvedValueOnce({ data: roomRow, error: null })
  workingClient.mockResolvedValue({ functions: { invoke }, rpc } as never)

  await sendShadoLiveCommand({
    action: 'promote', roomId: ROOM_ID, targetUserId: LISTENER_ID,
    expectedVersion: 4, requestId: REQUEST_PROMOTE,
  })
  await sendShadoLiveCommand({
    action: 'send_message', roomId: ROOM_ID, body: '  Stored after confirmation.  ',
    expectedVersion: 4, requestId: REQUEST_MESSAGE,
  })

  expect(invoke).toHaveBeenNthCalledWith(1, 'shado-live-command', { body: {
    action: 'promote', room_id: ROOM_ID, target_user_id: LISTENER_ID, body: null,
    expected_version: 4, request_id: REQUEST_PROMOTE,
  } })
  expect(invoke).toHaveBeenNthCalledWith(2, 'shado-live-command', { body: {
    action: 'send_message', room_id: ROOM_ID, target_user_id: null,
    body: 'Stored after confirmation.', expected_version: null, request_id: REQUEST_MESSAGE,
  } })
})

test('starts a green room with the canonical room revision and then re-reads authority', async () => {
  const invoke = jest.fn().mockResolvedValue({
    data: { ok: true, action: 'start', roomId: ROOM_ID, roomVersion: 5 },
    error: null,
  })
  const rpc = jest.fn().mockResolvedValue({ data: { ...roomRow, revision: 5 }, error: null })
  workingClient.mockResolvedValue({ functions: { invoke }, rpc } as never)

  await expect(sendShadoLiveCommand({
    action: 'start', roomId: ROOM_ID, expectedVersion: 4, requestId: REQUEST_START,
  })).resolves.toMatchObject({ id: ROOM_ID, version: 5 })
  expect(invoke).toHaveBeenCalledWith('shado-live-command', { body: {
    action: 'start', room_id: ROOM_ID, target_user_id: null, body: null,
    expected_version: 4, request_id: REQUEST_START,
  } })
  expect(rpc).toHaveBeenCalledWith('get_my_shado_live_room', { target_room_id: ROOM_ID })
})

test('does not claim leave success without exact server confirmation', async () => {
  const invoke = jest.fn().mockResolvedValue({ data: { ok: true, action: 'join', roomId: ROOM_ID }, error: null })
  workingClient.mockResolvedValue({ functions: { invoke } } as never)
  await expect(leaveShadoLiveSession(ROOM_ID, REQUEST_LEAVE)).rejects.toThrow(/did not confirm/i)
})

test('reconciles with only a stable UUID request id', async () => {
  const invoke = jest.fn().mockResolvedValue({
    data: { ok: true, claimed: 0, succeeded: 0, retryable: 0, failed: 0 },
    error: null,
  })
  workingClient.mockResolvedValue({ functions: { invoke } } as never)

  await expect(reconcileShadoLive(REQUEST_RECONCILE)).resolves.toMatchObject({ ok: true, claimed: 0 })
  expect(invoke).toHaveBeenCalledWith('shado-live-reconcile', {
    body: { request_id: REQUEST_RECONCILE },
  })
})

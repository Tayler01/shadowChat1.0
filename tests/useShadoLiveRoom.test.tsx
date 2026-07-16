import { act, renderHook, waitFor } from '@testing-library/react'
import { useShadoLiveRoom } from '../src/features/entertainment/shado-live/real/useShadoLiveRoom'
import {
  getMyShadoLiveRoom,
  listMyShadoLiveRooms,
  openShadoLiveSession,
  sendShadoLiveCommand,
  toggleMyShadoLiveMessageReaction,
} from '../src/features/entertainment/shado-live/real/shadoLiveApi'
import { createLiveKitMediaSession } from '../src/features/entertainment/shado-live/real/liveKitMediaSession'
import type { ShadoLiveRoom } from '../src/features/entertainment/shado-live/real/shadoLiveModel'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: '00000000-0000-4000-8000-000000000001' } }),
}))

jest.mock('../src/lib/supabase', () => ({
  getWorkingClient: jest.fn(async () => {
    const channel: {
      on: jest.Mock
      subscribe: jest.Mock
    } = {
      on: jest.fn(),
      subscribe: jest.fn(),
    }
    channel.on.mockImplementation(() => channel)
    channel.subscribe.mockImplementation((callback: (status: string) => void) => {
      Promise.resolve().then(() => callback('TIMED_OUT'))
      return channel
    })
    return {
      channel: jest.fn(() => channel),
      removeChannel: jest.fn(async () => undefined),
    }
  }),
}))

jest.mock('../src/features/entertainment/shado-live/real/shadoLiveApi', () => ({
  getMyShadoLiveRoom: jest.fn(),
  isShadoLiveRoomUnavailableError: (caught: unknown) => (
    Boolean(caught)
    && typeof caught === 'object'
    && (caught as { code?: unknown }).code === 'room_unavailable'
  ),
  leaveShadoLiveSession: jest.fn(async () => true),
  listMyShadoLiveRooms: jest.fn(),
  openShadoLiveSession: jest.fn(),
  reconcileShadoLive: jest.fn(async () => ({ ok: true })),
  sendShadoLiveCommand: jest.fn(),
  toggleMyShadoLiveMessageReaction: jest.fn(),
}))

jest.mock('../src/features/entertainment/shado-live/real/liveKitMediaSession', () => ({
  createLiveKitMediaSession: jest.fn(),
}))

const liveRoom = (): ShadoLiveRoom => ({
  id: '10000000-0000-4000-8000-000000000001',
  version: 3,
  title: 'Midnight Radio',
  status: 'live',
  hostId: '00000000-0000-4000-8000-000000000001',
  hostDisplayName: 'Tayler',
  hostUsername: 'tayler',
  hostAvatarUrl: null,
  listenerCount: 1,
  speakerLimit: 3,
  recordingEnabled: false,
  canJoin: true,
  canHost: true,
  myRole: 'host',
  myStageRequestStatus: 'none',
  hostGraceExpiresAt: null,
  startedAt: '2026-07-16T12:00:00Z',
  scheduledAt: null,
  endedAt: null,
  updatedAt: '2026-07-16T12:00:00Z',
  participants: [],
  messages: [],
})

const mockListRooms = listMyShadoLiveRooms as jest.MockedFunction<typeof listMyShadoLiveRooms>
const mockOpenSession = openShadoLiveSession as jest.MockedFunction<typeof openShadoLiveSession>
const mockGetRoom = getMyShadoLiveRoom as jest.MockedFunction<typeof getMyShadoLiveRoom>
const mockSendCommand = sendShadoLiveCommand as jest.MockedFunction<typeof sendShadoLiveCommand>
const mockToggleReaction = toggleMyShadoLiveMessageReaction as jest.MockedFunction<typeof toggleMyShadoLiveMessageReaction>
const mockCreateMedia = createLiveKitMediaSession as jest.MockedFunction<typeof createLiveKitMediaSession>

beforeEach(() => {
  jest.clearAllMocks()
  const room = liveRoom()
  mockListRooms.mockResolvedValue([])
  mockGetRoom.mockResolvedValue(room)
  mockOpenSession.mockResolvedValue({
    room,
    media: {
      serverUrl: 'wss://shadow.livekit.cloud',
      participantToken: 'host-token',
      expiresAt: '2026-07-16T12:05:00Z',
    },
  })
  mockSendCommand.mockResolvedValue({ ...room, version: 4 })
  mockToggleReaction.mockResolvedValue(true)
  mockCreateMedia.mockImplementation(callbacks => {
    const snapshot = {
      state: 'connected' as const,
      participants: [],
      microphoneEnabled: false,
      microphoneAllowed: true,
      audioPlaybackEnabled: false,
      audioPlaybackBlocked: true,
      error: null,
    }
    return {
      connect: jest.fn(async () => callbacks.onSnapshot(snapshot)),
      disconnect: jest.fn(async () => undefined),
      startAudio: jest.fn(async () => undefined),
      setMicrophoneEnabled: jest.fn(async () => undefined),
      setAudioContainer: jest.fn(),
      getSnapshot: jest.fn(() => snapshot),
    }
  })
})

test('keeps authoritative controls available when Realtime times out but the canonical room refresh succeeds', async () => {
  const { result } = renderHook(() => useShadoLiveRoom())
  await waitFor(() => expect(mockListRooms).toHaveBeenCalled())

  await act(async () => {
    await result.current.createRoom('Midnight Radio')
  })

  await waitFor(() => expect(mockGetRoom).toHaveBeenCalled())
  await waitFor(() => expect(result.current.syncState).toBe('synced'))
  expect(result.current.backendState).toBe('ready')
  expect(result.current.controlsEnabled).toBe(true)

  await act(async () => {
    await result.current.sendMessage('Still live')
  })
  expect(mockSendCommand).toHaveBeenCalledWith(expect.objectContaining({
    action: 'send_message',
    roomId: '10000000-0000-4000-8000-000000000001',
  }))

  await act(async () => {
    await result.current.toggleMessageReaction(
      '20000000-0000-4000-8000-000000000001',
      '👍'
    )
  })
  expect(mockToggleReaction).toHaveBeenCalledWith(
    '20000000-0000-4000-8000-000000000001',
    '👍'
  )
  expect(mockGetRoom).toHaveBeenCalled()
})

test('resumes a recoverable host room through the existing resume session action', async () => {
  const { result } = renderHook(() => useShadoLiveRoom())
  await waitFor(() => expect(mockListRooms).toHaveBeenCalled())

  await act(async () => {
    await result.current.resumeRoom(liveRoom().id)
  })

  expect(mockOpenSession).toHaveBeenCalledWith(expect.objectContaining({
    action: 'resume',
    roomId: liveRoom().id,
  }))
})

test('clears an unavailable linked room once and refreshes the lobby', async () => {
  const onRoomRoute = jest.fn()
  mockGetRoom.mockRejectedValueOnce(Object.assign(
    new Error('This Shado Live room has ended or is no longer available.'),
    { code: 'room_unavailable' }
  ))

  const { result } = renderHook(() => useShadoLiveRoom({
    initialRoomId: liveRoom().id,
    onRoomRoute,
  }))

  await waitFor(() => expect(onRoomRoute).toHaveBeenCalledWith('close', liveRoom().id))
  expect(onRoomRoute).toHaveBeenCalledTimes(1)
  expect(result.current.error).toBeNull()
  expect(result.current.notice).toMatch(/ended or is no longer available/i)
  expect(mockListRooms.mock.calls.length).toBeGreaterThanOrEqual(2)
})

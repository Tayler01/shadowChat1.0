import {
  canPublishShadoLiveMicrophone,
  createShadoLiveRequestId,
  normalizeShadoLiveRoom,
  normalizeShadoLiveSession,
} from '../src/features/entertainment/shado-live/real/shadoLiveModel'

const roomRow = {
  roomId: 'd7fa28d4-0d4d-4a9e-bb8f-a422b57c50bf',
  revision: 7,
  title: 'The Midnight Room',
  status: 'live',
  host: { id: 'host-1', display_name: 'Tayler', username: 'tayler', avatar_url: null },
  listenerCount: 4,
  callerRole: 'listener',
  handRaised: false,
  hostGraceExpiresAt: null,
  startedAt: '2026-07-15T20:00:00Z',
  participants: [{
    participantId: 'participant-host',
    role: 'host',
    user: { id: 'host-1', display_name: 'Tayler', username: 'tayler', avatar_url: null },
  }, {
    participantId: 'participant-listener',
    role: 'listener',
    user: { id: 'listener-1', display_name: 'Jordan', username: 'jordan', avatar_url: null },
  }],
  stageRequests: [{
    requestId: 'stage-request-1',
    status: 'raised',
    user: { id: 'listener-1', display_name: 'Jordan', username: 'jordan' },
  }],
  messages: [{
    messageId: 'message-1',
    sender: { id: 'host-1', display_name: 'Tayler' },
    body: 'Welcome in.',
    createdAt: '2026-07-15T20:00:30Z',
  }],
}

test('normalizes canonical room, participant, chat, role, and version state without invention', () => {
  expect(normalizeShadoLiveRoom(roomRow)).toEqual(expect.objectContaining({
    id: 'd7fa28d4-0d4d-4a9e-bb8f-a422b57c50bf',
    version: 7,
    status: 'live',
    myRole: 'listener',
    myStageRequestStatus: 'none',
    listenerCount: 4,
    recordingEnabled: false,
    participants: [
      expect.objectContaining({ userId: 'host-1', role: 'host', participantId: 'participant-host' }),
      expect.objectContaining({ userId: 'listener-1', role: 'listener', handRaised: true }),
    ],
    messages: [expect.objectContaining({ id: 'message-1', body: 'Welcome in.' })],
  }))
})

test('rejects malformed room authority and live sessions without media credentials', () => {
  expect(normalizeShadoLiveRoom({ ...roomRow, status: 'invented' })).toBeNull()
  expect(() => normalizeShadoLiveSession({ room: roomRow, media: null })).toThrow(/authorized media credentials/i)
})

test('accepts only secure short-lived media payloads and never grants listeners a microphone', () => {
  expect(normalizeShadoLiveSession({
    room: roomRow,
    media: {
      server_url: 'wss://shadow.livekit.cloud',
      participant_token: 'short-lived-token',
      expires_at: '2026-07-15T20:05:00Z',
    },
  })).toMatchObject({
    room: { id: 'd7fa28d4-0d4d-4a9e-bb8f-a422b57c50bf' },
    media: { serverUrl: 'wss://shadow.livekit.cloud' },
  })
  expect(canPublishShadoLiveMicrophone('listener')).toBe(false)
  expect(canPublishShadoLiveMicrophone('speaker')).toBe(true)
  expect(canPublishShadoLiveMicrophone('host')).toBe(true)
})

test('always creates a backend-safe UUID request id', () => {
  expect(createShadoLiveRequestId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu)
})

test('keeps the request id UUID-safe when randomUUID is unavailable', () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xab)
        return bytes
      },
    },
  })
  try {
    expect(createShadoLiveRequestId()).toBe('abababab-abab-4bab-abab-abababababab')
  } finally {
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto)
    else Reflect.deleteProperty(globalThis, 'crypto')
  }
})

import { Room } from 'livekit-client'
import { createLiveKitMediaSession } from '../src/features/entertainment/shado-live/real/liveKitMediaSession'

jest.mock('livekit-client', () => {
  class MockRoom {
    static instances: MockRoom[] = []
    handlers = new Map<string, Set<(...args: unknown[]) => void>>()
    connect = jest.fn(async () => undefined)
    disconnect = jest.fn(async () => undefined)
    startAudio = jest.fn(async () => undefined)
    canPlaybackAudio = true
    remoteParticipants = new Map()
    localParticipant = {
      identity: 'listener-1', name: 'Listener', isLocal: true, isSpeaking: false,
      isMicrophoneEnabled: false, permissions: { canPublish: false, canPublishSources: [] },
      setMicrophoneEnabled: jest.fn(async () => undefined),
    }
    constructor() { MockRoom.instances.push(this) }
    on(event: string, handler: (...args: unknown[]) => void) {
      const handlers = this.handlers.get(event) ?? new Set()
      handlers.add(handler)
      this.handlers.set(event, handlers)
      return this
    }
    off(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.get(event)?.delete(handler)
      return this
    }
    emit(event: string, ...args: unknown[]) { this.handlers.get(event)?.forEach(handler => handler(...args)) }
  }
  return {
    Room: MockRoom,
    RoomEvent: {
      TrackSubscribed: 'trackSubscribed', TrackUnsubscribed: 'trackUnsubscribed',
      ParticipantConnected: 'participantConnected', ParticipantDisconnected: 'participantDisconnected',
      ActiveSpeakersChanged: 'activeSpeakersChanged', ConnectionQualityChanged: 'connectionQualityChanged',
      TrackMuted: 'trackMuted', TrackUnmuted: 'trackUnmuted',
      ParticipantPermissionsChanged: 'participantPermissionsChanged',
      AudioPlaybackStatusChanged: 'audioPlaybackChanged', MediaDevicesError: 'mediaDevicesError',
      Reconnecting: 'reconnecting', SignalReconnecting: 'signalReconnecting',
      Reconnected: 'reconnected', Disconnected: 'disconnected',
    },
    DisconnectReason: { 1: 'DUPLICATE_IDENTITY' },
    MediaDeviceFailure: {
      PermissionDenied: 'PermissionDenied', NotFound: 'NotFound', DeviceInUse: 'DeviceInUse',
      getFailure: (error: { failure?: string }) => error?.failure,
    },
  }
})

const mockRoom = () => {
  const instances = (Room as unknown as { instances: Array<{
  localParticipant: { setMicrophoneEnabled: jest.Mock }
  connect: jest.Mock
  startAudio: jest.Mock
  }> }).instances
  return instances[instances.length - 1]!
}

test('listen-only connect never requests or publishes a microphone', async () => {
  const snapshots: unknown[] = []
  const session = createLiveKitMediaSession({
    onSnapshot: snapshot => snapshots.push(snapshot),
    onTerminal: jest.fn(),
  })
  await session.connect({
    serverUrl: 'wss://shadow.livekit.cloud',
    participantToken: 'listener-token',
    expiresAt: '2026-07-15T20:05:00Z',
  }, { allowAudioPlayback: false })

  expect(mockRoom().connect).toHaveBeenCalledTimes(1)
  expect(mockRoom().localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
  expect(session.getSnapshot()).toMatchObject({
    state: 'connected', microphoneAllowed: false, microphoneEnabled: false,
  })
  expect(snapshots.length).toBeGreaterThan(0)
})

test('browser audio starts only through the explicit startAudio action', async () => {
  const session = createLiveKitMediaSession({ onSnapshot: jest.fn(), onTerminal: jest.fn() })
  await session.connect({
    serverUrl: 'wss://shadow.livekit.cloud', participantToken: 'listener-token',
    expiresAt: '2026-07-15T20:05:00Z',
  }, { allowAudioPlayback: false })
  expect(mockRoom().startAudio).not.toHaveBeenCalled()
  await session.startAudio()
  expect(mockRoom().startAudio).toHaveBeenCalledTimes(1)
  expect(session.getSnapshot().audioPlaybackEnabled).toBe(true)
})

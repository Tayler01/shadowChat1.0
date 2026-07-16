import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadoLiveStage } from '../src/features/entertainment/shado-live/real/ShadoLiveStage'
import type { ShadoLiveRoomController } from '../src/features/entertainment/shado-live/real/useShadoLiveRoom'
import type { ShadoLiveRoom } from '../src/features/entertainment/shado-live/real/shadoLiveModel'

const room = (role: ShadoLiveRoom['myRole']): ShadoLiveRoom => ({
  id: 'room-1', version: 4, title: 'The Midnight Room', status: 'live',
  hostId: 'host-1', hostDisplayName: 'Tayler', hostUsername: 'tayler',
  hostAvatarUrl: 'https://example.test/tayler.webp', listenerCount: 2, speakerLimit: 3,
  recordingEnabled: false, canJoin: true, canHost: role === 'host', myRole: role,
  myStageRequestStatus: 'none', hostGraceExpiresAt: null,
  startedAt: '2026-07-15T20:00:00Z', scheduledAt: null, endedAt: null, updatedAt: '2026-07-15T20:01:00Z',
  participants: [
    { userId: 'host-1', participantId: 'participant-host', providerIdentity: 'host-1', displayName: 'Tayler', username: 'tayler', avatarUrl: 'https://example.test/tayler.webp', role: 'host', hostMuted: false, handRaised: false, joinedAt: null },
    { userId: 'listener-1', participantId: 'participant-listener', providerIdentity: 'listener-1', displayName: 'Jordan', username: 'jordan', avatarUrl: 'https://example.test/jordan.webp', role: 'listener', hostMuted: false, handRaised: true, joinedAt: null },
  ],
  messages: [{
    id: 'message-1',
    roomId: 'room-1',
    senderId: 'host-1',
    senderDisplayName: 'Tayler',
    senderUsername: 'tayler',
    senderAvatarUrl: 'https://example.test/tayler.webp',
    body: 'Welcome in.',
    createdAt: '2026-07-15T20:00:30Z',
    clientNonce: null,
    reactions: {},
  }],
})

const controller = (role: ShadoLiveRoom['myRole']): ShadoLiveRoomController => ({
  rooms: [], room: room(role), backendState: 'ready', syncState: 'synced', terminal: null,
  error: null, notice: null, commandBusy: null, controlsEnabled: true, startEnabled: false,
  media: {
    state: 'connected', participants: [
      { identity: 'host-1', name: 'Tayler', speaking: true, audioLevel: 0.7, microphoneEnabled: true, connectionQuality: 'excellent' },
    ],
    microphoneEnabled: false, microphoneAllowed: role === 'host' || role === 'speaker',
    audioPlaybackEnabled: true, audioPlaybackBlocked: false, error: null,
  },
  refreshRooms: jest.fn().mockResolvedValue(undefined), refreshRoom: jest.fn().mockResolvedValue(null),
  createRoom: jest.fn().mockResolvedValue(undefined), joinRoom: jest.fn().mockResolvedValue(undefined),
  resumeRoom: jest.fn().mockResolvedValue(undefined),
  reconnectMedia: jest.fn().mockResolvedValue(undefined),
  leaveRoom: jest.fn().mockResolvedValue(undefined), returnToLobby: jest.fn().mockResolvedValue(undefined),
  startAudio: jest.fn().mockResolvedValue(undefined), toggleMicrophone: jest.fn().mockResolvedValue(undefined),
  toggleHand: jest.fn().mockResolvedValue(undefined), sendMessage: jest.fn().mockResolvedValue(undefined),
  toggleMessageReaction: jest.fn().mockResolvedValue(undefined),
  startRoom: jest.fn().mockResolvedValue(undefined),
  promote: jest.fn().mockResolvedValue(undefined), demote: jest.fn().mockResolvedValue(undefined),
  mute: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined),
  endRoom: jest.fn().mockResolvedValue(undefined), bindAudioContainer: jest.fn(), clearError: jest.fn(),
})

test('listener stage joins without any microphone control and raises a server-confirmed hand', () => {
  const value = controller('listener')
  render(<ShadoLiveStage controller={value} currentUserId="listener-1" onOpenProfile={jest.fn()} />)

  expect(screen.queryByRole('button', { name: /microphone/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Raise hand' }))
  expect(value.toggleHand).toHaveBeenCalledTimes(1)
})

test('host microphone, participant moderation, and end-room controls call authority methods', async () => {
  const value = controller('host')
  render(<ShadoLiveStage controller={value} currentUserId="host-1" onOpenProfile={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Unmute microphone' }))
  expect(value.toggleMicrophone).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole('tab', { name: 'Room' }))
  fireEvent.click(screen.getByRole('button', { name: 'Promote' }))
  expect(value.promote).toHaveBeenCalledWith('listener-1')

  fireEvent.click(screen.getByRole('tab', { name: 'Safety' }))
  fireEvent.click(screen.getByRole('button', { name: 'End room for everyone' }))
  expect(value.endRoom).toHaveBeenCalledTimes(1)
})

test('host starts a green room only through the synchronized version-checked command', () => {
  const value = controller('host')
  value.room = { ...value.room!, status: 'green_room' }
  value.controlsEnabled = false
  value.startEnabled = true
  render(<ShadoLiveStage controller={value} currentUserId="host-1" onOpenProfile={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Start live' }))
  expect(value.startRoom).toHaveBeenCalledTimes(1)
})

test('chat clears only after the persistent server command resolves', async () => {
  let confirmMessage: () => void = () => undefined
  const value = controller('listener')
  value.sendMessage = jest.fn(() => new Promise<void>(resolve => { confirmMessage = resolve }))
  render(<ShadoLiveStage controller={value} currentUserId="listener-1" onOpenProfile={jest.fn()} />)

  const composer = screen.getByRole('textbox', { name: 'Message the live room' })
  composer.focus()
  fireEvent.change(composer, { target: { value: 'Persist this' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send live room message' }))
  expect(value.sendMessage).toHaveBeenCalledWith('Persist this')
  expect(composer).toHaveValue('Persist this')
  expect(composer).toHaveFocus()

  fireEvent.change(composer, { target: { value: 'Next message' } })
  confirmMessage()
  await waitFor(() => expect(composer).toHaveValue('Next message'))
})

test('keeps the focused host draft editable while live media reconnects', () => {
  const value = controller('host')
  const { rerender } = render(
    <ShadoLiveStage controller={value} currentUserId="host-1" onOpenProfile={jest.fn()} />
  )
  const composer = screen.getByRole('textbox', { name: 'Message the live room' })
  composer.focus()
  fireEvent.change(composer, { target: { value: 'Do not drop this draft' } })

  const reconnecting = {
    ...value,
    controlsEnabled: false,
    backendState: 'failed' as const,
    media: { ...value.media, state: 'reconnecting' as const },
  }
  rerender(<ShadoLiveStage controller={reconnecting} currentUserId="host-1" onOpenProfile={jest.fn()} />)

  expect(composer).toBeEnabled()
  expect(composer).toHaveFocus()
  expect(composer).toHaveValue('Do not drop this draft')
  expect(screen.getByRole('button', { name: 'Send live room message' })).toBeDisabled()
})

test('renders real profile images and opens profiles from stage, chat, and room identities', () => {
  const value = controller('listener')
  const openProfile = jest.fn()
  render(<ShadoLiveStage controller={value} currentUserId="listener-1" onOpenProfile={openProfile} />)

  expect(screen.getAllByAltText('Tayler').length).toBeGreaterThan(0)
  fireEvent.click(screen.getAllByRole('button', { name: /open tayler's profile/i })[0])
  expect(openProfile).toHaveBeenCalledWith('host-1')

  fireEvent.click(screen.getByRole('tab', { name: 'Room' }))
  fireEvent.click(screen.getByRole('button', { name: "Open Jordan's profile" }))
  expect(openProfile).toHaveBeenCalledWith('listener-1')
})

test('live chat uses the shared message menu and persistent quick reactions', async () => {
  const value = controller('listener')
  render(<ShadoLiveStage controller={value} currentUserId="listener-1" onOpenProfile={jest.fn()} />)

  const messageText = screen.getByText('Welcome in.')
  fireEvent.pointerDown(messageText, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
  fireEvent.pointerUp(messageText, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
  fireEvent.click(await screen.findByRole('button', { name: 'React with 👍' }))
  await waitFor(() => expect(value.toggleMessageReaction).toHaveBeenCalledWith('message-1', '👍'))

  fireEvent.click(screen.getByRole('button', { name: 'Message actions for Tayler' }))
  expect(await screen.findByRole('menuitem', { name: 'Copy' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Add Reaction' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: 'Report message' })).toBeInTheDocument()
})

test('scroll movement does not open the live quick-reaction rail', () => {
  const value = controller('listener')
  render(<ShadoLiveStage controller={value} currentUserId="listener-1" onOpenProfile={jest.fn()} />)

  const messageText = screen.getByText('Welcome in.')
  fireEvent.pointerDown(messageText, { pointerId: 2, button: 0, clientX: 20, clientY: 20 })
  fireEvent.pointerMove(messageText, { pointerId: 2, clientX: 20, clientY: 42 })
  fireEvent.pointerUp(messageText, { pointerId: 2, button: 0, clientX: 20, clientY: 42 })

  expect(screen.queryByRole('toolbar', { name: 'Quick reactions' })).not.toBeInTheDocument()
})

test('does not repeat the active host in the secondary stage avatar list', () => {
  const value = controller('host')
  render(<ShadoLiveStage controller={value} currentUserId="host-1" onOpenProfile={jest.fn()} />)

  expect(screen.queryByLabelText(/Other people on stage/i)).not.toBeInTheDocument()
})

test('offers an audio retry when the provider connection fails', () => {
  const value = controller('host')
  value.backendState = 'failed'
  value.error = 'The LiveKit room could not connect.'
  value.media = { ...value.media, state: 'idle' }
  render(<ShadoLiveStage controller={value} currentUserId="host-1" onOpenProfile={jest.fn()} />)

  fireEvent.click(screen.getByRole('button', { name: 'Retry audio' }))
  expect(value.reconnectMedia).toHaveBeenCalledTimes(1)
})

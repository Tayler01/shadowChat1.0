import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadoLiveLobby } from '../src/features/entertainment/shado-live/real/ShadoLiveLobby'
import type { ShadoLiveRoom } from '../src/features/entertainment/shado-live/real/shadoLiveModel'

const hostGreenRoom: ShadoLiveRoom = {
  id: '10000000-0000-4000-8000-000000000001',
  version: 2,
  title: 'Recoverable room',
  status: 'green_room',
  hostId: '00000000-0000-4000-8000-000000000001',
  hostDisplayName: 'Tayler',
  hostUsername: 'tayler',
  hostAvatarUrl: null,
  listenerCount: 0,
  speakerLimit: 3,
  recordingEnabled: false,
  canJoin: false,
  canHost: true,
  myRole: 'host',
  myStageRequestStatus: 'none',
  hostGraceExpiresAt: null,
  startedAt: null,
  scheduledAt: null,
  endedAt: null,
  participants: [],
  messages: [],
  updatedAt: '2026-07-16T22:00:00Z',
}

test('offers the host a recovery action for an existing green room', async () => {
  const onResume = jest.fn().mockResolvedValue(undefined)
  render(
    <ShadoLiveLobby
      rooms={[hostGreenRoom]}
      backendState="idle"
      onCreate={jest.fn().mockResolvedValue(undefined)}
      onJoin={jest.fn().mockResolvedValue(undefined)}
      onResume={onResume}
      onRefresh={jest.fn().mockResolvedValue(undefined)}
      onOpenProfile={jest.fn()}
    />
  )

  fireEvent.click(screen.getByRole('button', { name: 'Resume as host' }))
  await waitFor(() => expect(onResume).toHaveBeenCalledWith(hostGreenRoom.id))
})

test('identifies the exact live room that owns unread Play updates', () => {
  render(
    <ShadoLiveLobby
      rooms={[hostGreenRoom]}
      backendState="idle"
      unreadCountByRoomId={{ [hostGreenRoom.id]: 2 }}
      onCreate={jest.fn().mockResolvedValue(undefined)}
      onJoin={jest.fn().mockResolvedValue(undefined)}
      onResume={jest.fn().mockResolvedValue(undefined)}
      onRefresh={jest.fn().mockResolvedValue(undefined)}
      onOpenProfile={jest.fn()}
    />
  )

  expect(screen.getByTestId(`shado-live-unread-${hostGreenRoom.id}`)).toHaveTextContent('2 new')
  expect(screen.getByLabelText('2 unread updates for this live room')).toBeInTheDocument()
})

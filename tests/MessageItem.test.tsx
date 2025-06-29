import { render } from '@testing-library/react'
import { MessageItem } from '../src/components/chat/MessageItem'
import { useAuth } from '../src/hooks/useAuth'

const mockedUseAuth = useAuth as jest.Mock

jest.mock('../src/hooks/useAuth')

it('renders audio element for audio messages', () => {
  mockedUseAuth.mockReturnValue({ profile: { id: 'u1' } })
  const message = {
    id: '1',
    user_id: 'u2',
    content: 'https://example.com/audio',
    message_type: 'audio',
    audio_url: 'https://example.com/audio',
    reactions: {},
    pinned: false,
    created_at: '',
    updated_at: ''
  } as any
  const { container } = render(
    <MessageItem
      message={message}
      onEdit={jest.fn()}
      onDelete={jest.fn()}
      onTogglePin={jest.fn()}
      onToggleReaction={jest.fn()}
    />
  )
  expect(container.querySelector('audio')).toBeInTheDocument()
})

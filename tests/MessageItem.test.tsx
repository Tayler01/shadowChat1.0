import { render, screen } from '@testing-library/react'
import React from 'react'
import { MessageItem } from '../src/components/chat/MessageItem'
import type { Message } from '../src/lib/supabase'

const baseMessage = {
  id: 'm1',
  user_id: 'u1',
  content: '',
  message_type: 'image',
  file_url: 'https://example.com/test.png',
  reactions: {},
  pinned: false,
  created_at: '2020-01-01',
  updated_at: '2020-01-01',
  user: {
    id: 'u1',
    email: '',
    username: 'alice',
    display_name: 'Alice',
    status: 'online',
    status_message: '',
    color: 'red',
    last_active: '',
    created_at: '',
    updated_at: ''
  }
} as unknown as Message

test('renders image message', () => {
  render(
    <MessageItem
      message={baseMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  const img = screen.getByAltText(/uploaded image/i)
  expect(img).toHaveAttribute('src', baseMessage.file_url)
})

test('renders audio message', () => {
  const audioMessage = {
    ...baseMessage,
    message_type: 'audio',
    audio_url: 'https://example.com/test.webm',
  } as Message

  const { container } = render(
    <MessageItem
      message={audioMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  const audio = container.querySelector('audio')
  expect(audio).toHaveAttribute('src', audioMessage.audio_url)
})

test('renders file message', () => {
  const fileMeta = JSON.stringify({ name: 'doc.txt', size: 10, type: 'text/plain' })
  const fileMessage = {
    ...baseMessage,
    message_type: 'file',
    content: fileMeta,
    file_url: 'https://example.com/doc.txt',
  } as Message

  render(
    <MessageItem
      message={fileMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  const link = screen.getByRole('link', { name: /doc.txt/i })
  expect(link).toHaveAttribute('href', fileMessage.file_url)
})

test('renders audio file preview', () => {
  const fileMeta = JSON.stringify({ name: 'sound.mp3', size: 123, type: 'audio/mpeg' })
  const audioFile = {
    ...baseMessage,
    message_type: 'file',
    content: fileMeta,
    file_url: 'https://example.com/sound.mp3'
  } as Message

  const { container } = render(
    <MessageItem
      message={audioFile}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  const audio = container.querySelector('audio')
  expect(audio).toHaveAttribute('src', audioFile.file_url)
})

test('icon buttons have aria-labels', () => {
  render(
    <MessageItem
      message={baseMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  const addReaction = screen.getByRole('button', { name: /add reaction/i })
  expect(addReaction).toBeInTheDocument()
})

test('applies user color to message bubble', () => {
  const colored = {
    ...baseMessage,
    content: 'hello',
    user: { ...baseMessage.user, color: '#ff0000' }
  } as Message

  render(
    <MessageItem
      message={colored}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  const msg = screen.getByText('hello')
  expect(msg.parentElement).toHaveStyle('background-color: #ff0000')
})

test('shows tone indicator emoji', () => {
  const textMessage = {
    ...baseMessage,
    message_type: 'text',
    content: 'I love this!',
  } as Message

  render(
    <MessageItem
      message={textMessage}
      onEdit={async () => {}}
      onDelete={async () => {}}
      onTogglePin={async () => {}}
      onToggleReaction={async () => {}}
      containerRef={React.createRef()}
    />
  )

  const indicator = screen.getByTestId('tone-indicator')
  expect(indicator).toHaveTextContent('😊')
})

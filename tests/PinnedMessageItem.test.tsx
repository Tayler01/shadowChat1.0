import { render, screen } from '@testing-library/react'
import React from 'react'
import { PinnedMessageItem } from '../src/components/chat/PinnedMessageItem'
import type { Message } from '../src/lib/supabase'

const message = {
  id: 'm1',
  user_id: 'u1',
  content: 'hi',
  message_type: 'text',
  reactions: {},
  pinned: true,
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

it('icon buttons have aria-labels', () => {
  render(
    <PinnedMessageItem
      message={message}
      onUnpin={async () => {}}
      onToggleReaction={async () => {}}
    />
  )

  expect(screen.getByRole('button', { name: /add reaction/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /unpin message/i })).toBeInTheDocument()
})

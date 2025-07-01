import { render, screen } from '@testing-library/react'
import React from 'react'
import { PinnedMessageItem } from '../src/components/chat/PinnedMessageItem'
import type { Message } from '../src/lib/supabase'

const message = {
  id: 'm1',
  user_id: 'u1',
  content: 'Hello',
  message_type: 'text',
  reactions: {},
  pinned: true,
  created_at: '2020-01-01',
  updated_at: '2020-01-01',
  user: { id: 'u1', email: '', username: 'alice', display_name: 'Alice', status: 'online', status_message: '', color: 'red', last_active: '', created_at: '', updated_at: '' }
} as unknown as Message

it('renders unpin button with label', () => {
  render(
    <PinnedMessageItem
      message={message}
      onUnpin={async () => {}}
      onToggleReaction={async () => {}}
    />
  )

  const btn = screen.getByLabelText('Unpin message')
  expect(btn).toBeInTheDocument()
})

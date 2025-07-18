import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ThreadReplyLink } from '../src/components/chat/ThreadReplyLink'
import type { Message } from '../src/lib/supabase'

const parent = {
  id: 'p1',
  user_id: 'u1',
  content: 'parent message that is quite long',
  message_type: 'text',
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

const reply = {
  ...parent,
  id: 'c1',
  content: 'a reply',
  reply_to: 'p1'
} as unknown as Message

test('renders snippet and handles click', async () => {
  const user = userEvent.setup()
  const cb = jest.fn()
  render(<ThreadReplyLink message={reply} parent={parent} onJumpToMessage={cb} />)
  const btn = screen.getByRole('button')
  expect(btn).toHaveTextContent(/in reply to/i)
  await user.click(btn)
  expect(cb).toHaveBeenCalledWith('p1')
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageInput } from '../src/components/chat/MessageInput'
import { askQuestion } from '../src/lib/ai'

jest.mock('../src/lib/ai')

jest.mock('../src/hooks/useTyping', () => ({
  useTyping: () => ({ startTyping: jest.fn(), stopTyping: jest.fn() })
}))

jest.mock('../src/lib/supabase', () => ({
  uploadVoiceMessage: jest.fn(),
  uploadChatFile: jest.fn(),
  DEBUG: false,
}))

beforeEach(() => {
  jest.resetAllMocks()
})

test('ai mention sends query and posts response', async () => {
  const onSend = jest.fn()
  ;(askQuestion as jest.Mock).mockResolvedValue('the answer')

  render(<MessageInput onSendMessage={onSend} messages={[]} />)

  const textarea = screen.getByRole('textbox')
  await userEvent.type(textarea, '@ai what is up?')
  await userEvent.keyboard('{Enter}')

  expect(askQuestion).toHaveBeenCalledWith('what is up?')
  await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2))
  expect(onSend).toHaveBeenNthCalledWith(2, 'the answer', 'command')
})

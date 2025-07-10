import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { MessageInput } from '../src/components/chat/MessageInput'
import { summarizeConversation } from '../src/lib/ai'

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

test('summary slash command calls API and sends result', async () => {
  const onSend = jest.fn()
  ;(summarizeConversation as jest.Mock).mockResolvedValue('summary text')

  render(
    <MessageInput
      onSendMessage={onSend}
      messages={[{ id: '1', user_id: 'u1', content: 'hello' } as any]}
    />
  )

  const textarea = screen.getByRole('textbox')
  await userEvent.type(textarea, '/summary')
  await userEvent.keyboard('{Enter}')

  expect(summarizeConversation).toHaveBeenCalled()
  await waitFor(() => expect(onSend).toHaveBeenCalledWith('summary text'))
})
